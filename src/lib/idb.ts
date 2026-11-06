// Small IndexedDB helper with a memory fallback (no dependency). Heavy data (courses, images, attempts) lives in
// IndexedDB, never in localStorage (its ~5 M-character quota is shared with circuits, procedures and settings).
//
// - openDb(name, version, stores): opens (and upgrades: missing object stores are created) a database.
// - When IndexedDB is missing or refuses to open (Safari private mode, blocked site data, an upgrade blocked by
//   another tab, a timeout), the same API runs on memory: `db.backend === 'memory'` and `db.reason` say why, so the
//   UI can show "not saved on this device". Nothing throws at open.
// - Writes that exceed the quota reject with an IdbQuotaError (isQuotaError() recognises the browsers' variants).
// - putBlob() stores a Blob under its sha-256 hex (content-addressed assets: the same image is stored once).
// - persist() asks the browser to keep the site's storage (iPad Safari evicts after 7 days without a visit).
//
// Keys are out-of-line (put(store, key, value)); values are anything the structured clone accepts.

export type IdbKey = string | number;

export interface KvDb {
  /** 'idb': stored on this device; 'memory': lost when the page closes */
  readonly backend: "idb" | "memory";
  /** why the memory fallback is in use (absent on 'idb') */
  readonly reason?: string;
  readonly name: string;
  get<T = unknown>(store: string, key: IdbKey): Promise<T | undefined>;
  put<T = unknown>(store: string, key: IdbKey, value: T): Promise<void>;
  delete(store: string, key: IdbKey): Promise<void>;
  keys(store: string): Promise<IdbKey[]>;
  getAll<T = unknown>(store: string): Promise<T[]>;
  clear(store: string): Promise<void>;
  /** store a Blob under its sha-256 hex; returns the id */
  putBlob(store: string, blob: Blob): Promise<string>;
  close(): void;
}

export class IdbQuotaError extends Error {
  constructor(message = "Storage is full on this device") {
    super(message);
    this.name = "IdbQuotaError";
  }
}

/** QuotaExceededError (Chrome, Safari), NS_ERROR_DOM_QUOTA_REACHED (old Firefox), code 22 / 1014. */
export function isQuotaError(e: unknown): boolean {
  if (e instanceof IdbQuotaError) return true;
  const x = e as { name?: string; code?: number } | null;
  if (!x || typeof x !== "object") return false;
  return (
    x.name === "QuotaExceededError" ||
    x.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    x.code === 22 ||
    x.code === 1014
  );
}

/** sha-256 hex of bytes (SubtleCrypto; a deterministic FNV fallback where it is missing, e.g. an insecure context). */
export async function sha256Hex(
  data: Blob | ArrayBuffer | Uint8Array | string,
): Promise<string> {
  let bytes: Uint8Array;
  if (typeof data === "string") bytes = new TextEncoder().encode(data);
  else if (data instanceof Uint8Array) bytes = data;
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = new Uint8Array(await data.arrayBuffer());
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const d = await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
    return [...new Uint8Array(d)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // fallback: 8 FNV-1a lanes (not cryptographic, only a stable content id)
  const out: string[] = [];
  for (let lane = 0; lane < 8; lane++) {
    let h = (2166136261 ^ Math.imul(lane + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < bytes.length; i++)
      h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
    out.push(h.toString(16).padStart(8, "0"));
  }
  return out.join("");
}

// ------------------------------------------------------------------ memory backend
export class MemoryDb implements KvDb {
  readonly backend = "memory" as const;
  private data = new Map<string, Map<IdbKey, unknown>>();
  constructor(
    readonly name: string,
    stores: readonly string[],
    readonly reason = "memory",
  ) {
    for (const s of stores) this.data.set(s, new Map());
  }
  private st(store: string): Map<IdbKey, unknown> {
    const m = this.data.get(store);
    if (!m) throw new Error(`No object store "${store}" in ${this.name}`);
    return m;
  }
  async get<T>(store: string, key: IdbKey): Promise<T | undefined> {
    const v = this.st(store).get(key);
    return v === undefined ? undefined : (clone(v) as T);
  }
  async put<T>(store: string, key: IdbKey, value: T): Promise<void> {
    this.st(store).set(key, clone(value));
  }
  async delete(store: string, key: IdbKey): Promise<void> {
    this.st(store).delete(key);
  }
  async keys(store: string): Promise<IdbKey[]> {
    return [...this.st(store).keys()].sort(cmpKey);
  }
  async getAll<T>(store: string): Promise<T[]> {
    const m = this.st(store);
    return [...m.keys()].sort(cmpKey).map((k) => clone(m.get(k)) as T);
  }
  async clear(store: string): Promise<void> {
    this.st(store).clear();
  }
  async putBlob(store: string, blob: Blob): Promise<string> {
    const id = await sha256Hex(blob);
    this.st(store).set(id, blob);
    return id;
  }
  close(): void {}
}
// IndexedDB orders keys numbers first, then strings; the memory backend does the same
const cmpKey = (a: IdbKey, b: IdbKey) =>
  typeof a === typeof b
    ? a < b
      ? -1
      : a > b
        ? 1
        : 0
    : typeof a === "number"
      ? -1
      : 1;
/** values come back as copies, as they would from IndexedDB (Blobs are immutable and shared) */
function clone<T>(v: T): T {
  if (
    v === null ||
    typeof v !== "object" ||
    (typeof Blob !== "undefined" && v instanceof Blob)
  )
    return v;
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
}

// ------------------------------------------------------------------ IndexedDB backend
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

class IndexedKvDb implements KvDb {
  readonly backend = "idb" as const;
  constructor(
    readonly name: string,
    private db: IDBDatabase,
  ) {
    // another tab upgraded the schema: let it, this handle is now stale
    db.onversionchange = () => db.close();
  }
  private async tx<T>(
    store: string,
    mode: IDBTransactionMode,
    op: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    let t: IDBTransaction;
    try {
      t = this.db.transaction(store, mode);
    } catch (e) {
      throw isQuotaError(e) ? new IdbQuotaError() : e;
    }
    const done = new Promise<void>((res, rej) => {
      t.oncomplete = () => res();
      t.onabort = () =>
        rej(
          isQuotaError(t.error)
            ? new IdbQuotaError()
            : (t.error ?? new Error("Transaction aborted")),
        );
      t.onerror = () =>
        rej(isQuotaError(t.error) ? new IdbQuotaError() : t.error);
    });
    let r: T;
    try {
      r = await req(op(t.objectStore(store)));
    } catch (e) {
      done.catch(() => {});
      throw isQuotaError(e) ? new IdbQuotaError() : e;
    }
    if (mode === "readwrite") await done;
    else done.catch(() => {});
    return r;
  }
  get<T>(store: string, key: IdbKey): Promise<T | undefined> {
    return this.tx(
      store,
      "readonly",
      (s) => s.get(key) as IDBRequest<T | undefined>,
    );
  }
  async put<T>(store: string, key: IdbKey, value: T): Promise<void> {
    await this.tx(store, "readwrite", (s) => s.put(value, key));
  }
  async delete(store: string, key: IdbKey): Promise<void> {
    await this.tx(store, "readwrite", (s) => s.delete(key));
  }
  keys(store: string): Promise<IdbKey[]> {
    return this.tx(
      store,
      "readonly",
      (s) => s.getAllKeys() as IDBRequest<IdbKey[]>,
    );
  }
  getAll<T>(store: string): Promise<T[]> {
    return this.tx(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  }
  async clear(store: string): Promise<void> {
    await this.tx(store, "readwrite", (s) => s.clear());
  }
  async putBlob(store: string, blob: Blob): Promise<string> {
    const id = await sha256Hex(blob);
    await this.put(store, id, blob);
    return id;
  }
  close(): void {
    this.db.close();
  }
}

export interface OpenOptions {
  /** the IndexedDB factory (default: globalThis.indexedDB); tests pass a fake or null */
  factory?: IDBFactory | null;
  /** give up and fall back to memory after this long (an upgrade blocked by another tab; default 4 s) */
  timeoutMs?: number;
}

/**
 * Open a database with these object stores (created on upgrade when missing). Never rejects: when IndexedDB
 * cannot be used the result is a MemoryDb whose `reason` says why.
 */
export async function openDb(
  name: string,
  version: number,
  stores: readonly string[],
  opts: OpenOptions = {},
): Promise<KvDb> {
  const factory =
    opts.factory === undefined
      ? typeof indexedDB !== "undefined"
        ? indexedDB
        : null
      : opts.factory;
  if (!factory) return new MemoryDb(name, stores, "IndexedDB is not available");
  const timeoutMs = opts.timeoutMs ?? 4000;
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        rej(new Error("IndexedDB did not open in time"));
      }, timeoutMs);
      const finish = (f: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        f();
      };
      let r: IDBOpenDBRequest;
      try {
        r = factory.open(name, version);
      } catch (e) {
        finish(() => rej(e));
        return;
      }
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of stores)
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      r.onsuccess = () => {
        const db = r.result;
        if (settled) {
          db.close(); // too late: the caller already has the memory fallback
          return;
        }
        finish(() => res(db));
      };
      r.onerror = () =>
        finish(() => rej(r.error ?? new Error("IndexedDB open failed")));
      r.onblocked = () => {
        /* wait for the other tab to close its handle, up to the timeout */
      };
    });
    const missing = stores.filter((s) => !db.objectStoreNames.contains(s));
    if (missing.length) {
      db.close();
      return new MemoryDb(
        name,
        stores,
        `IndexedDB schema is missing ${missing.join(", ")} (version ${version} too low)`,
      );
    }
    return new IndexedKvDb(name, db);
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : String((e as { name?: string })?.name ?? e);
    return new MemoryDb(name, stores, `IndexedDB refused to open: ${msg}`);
  }
}

export type PersistResult = "persisted" | "granted" | "denied" | "unsupported";
/**
 * Ask the browser to keep this site's storage (navigator.storage.persist). 'persisted' = it already was,
 * 'granted' = it is now, 'denied' = the browser may evict it (iPad Safari: add the app to the Home Screen),
 * 'unsupported' = no StorageManager. Never throws.
 */
export async function persist(): Promise<PersistResult> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!sm || typeof sm.persist !== "function") return "unsupported";
  try {
    if (typeof sm.persisted === "function" && (await sm.persisted()))
      return "persisted";
    return (await sm.persist()) ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** Usage and quota in bytes (null where the browser does not say). */
export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!sm || typeof sm.estimate !== "function") return null;
  try {
    const e = await sm.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
