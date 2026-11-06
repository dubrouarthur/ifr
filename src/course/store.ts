// Ground school — local storage of courses (SPEC §9.2 store.ts, §9.7).
//
// IndexedDB 'ifr-courses' v1 (src/lib/idb.ts), stores:
//   courses   Course by id                     assets    Blob by sha-256 (content-addressed: an image is stored once)
//   tray      TrayItem by id (cockpit captures) thumbs    Blob by key (step thumbnails: `${course}:${step}:${rev}`)
//   progress  CourseProgress by course|profile  attempts  AttemptRecord by course|profile|step|at|suffix
//   handoffs  Handoff by token (Fly it / Your turn in the cockpit)
// plus a tiny localStorage index 'ifr.course.index' (id, title, rev, updated, assigned, exported, steps…) so the
// Flight Center renders synchronously, and 'ifr.course.last' (the course and step to continue).
//
// When IndexedDB is blocked (Safari private mode, blocked site data) everything runs on memory: `backend` is
// 'memory', storageNotice() gives the "not saved on this device" banner text. persist() is asked on the first save.
// A save that hits the quota resolves { ok: false, error: 'quota' } with an in-app message (never alert()).
// Other windows (the cockpit in a second window capturing into the tray) are told over BroadcastChannel 'ifr-course'.
import type {
  AssetId,
  AssetRef,
  AttemptRecord,
  Clip,
  Course,
  CourseProgress,
  CourseShape,
  Handoff,
  L10n,
  Lang,
  SimScene,
} from "./types";
import {
  isQuotaError,
  openDb,
  persist,
  sha256Hex,
  type KvDb,
  type PersistResult,
} from "../lib/idb";
import { migrate } from "./migrate";
import {
  courseHash,
  isStructurallyValid,
  validateCourse,
  COURSE_ID,
  type CourseIssue,
} from "./validate";

export const DB_NAME = "ifr-courses";
export const DB_VERSION = 1;
export const STORES = [
  "courses",
  "assets",
  "tray",
  "thumbs",
  "progress",
  "attempts",
  "handoffs",
] as const;
export type StoreName = (typeof STORES)[number];
export const INDEX_KEY = "ifr.course.index";
export const LAST_KEY = "ifr.course.last";
export const CHANNEL = "ifr-course";
/** "not exported for 7 days" badge (iPad Safari evicts after 7 days without a visit) */
export const EXPORT_NUDGE_DAYS = 7;

export interface CourseIndexEntry {
  id: string;
  title: L10n;
  rev: number;
  updated: string;
  steps: number;
  minutes?: number;
  langs: Lang[];
  tags?: string[];
  shape?: CourseShape;
  sample?: string;
  /** assigned to the student by the CFI (the Continue card) */
  assigned?: boolean;
  /** last export to a file (ISO) */
  exported?: string;
  /** first stored on this device (ISO) */
  created?: string;
}
interface IndexData {
  v: 1;
  courses: CourseIndexEntry[];
  /** persist() was asked (first save) */
  persistAsked?: PersistResult;
}

/** A cockpit capture waiting in the editor's tray. */
export interface TrayItem {
  id: string;
  /** ISO */
  at: string;
  /** the course it was captured for (Fly to capture), if any */
  courseId?: string;
  scene: SimScene;
  /** Shift+C: the last 60 s */
  clip?: Clip;
  /** panel thumbnail 320×240 and 3D still 480×270 (assets store) */
  thumb?: AssetId;
  still?: AssetId;
  /** "ARD R-276 · 6 NM · 4,000 ft" */
  label?: string;
}

export type SaveResult =
  | { ok: true; course: Course; issues: CourseIssue[] }
  | {
      ok: false;
      error: "invalid" | "quota" | "failed";
      message: L10n;
      issues: CourseIssue[];
    };

export interface AttemptFilter {
  courseId?: string;
  profileId?: string;
  stepId?: string;
  kind?: AttemptRecord["kind"];
}
export type StoreChange = { store: StoreName | "index"; key?: string };

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const memKv = (): KV => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};
function defaultKv(): KV {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      ls.getItem(INDEX_KEY);
      return ls;
    }
  } catch {
    /* storage blocked */
  }
  return memKv();
}
const L = (en: string, fr: string): L10n => ({ en, fr });
const short = (t: L10n): L10n => ({
  en: t.en.slice(0, 80),
  ...(t.fr !== undefined ? { fr: t.fr.slice(0, 80) } : {}),
});
const rand = () => Math.random().toString(36).slice(2, 8);

export interface OpenStoreOptions {
  /** an already opened database (tests: new MemoryDb(DB_NAME, STORES)) */
  db?: KvDb;
  /** IndexedDB factory for openDb (tests pass null to force memory) */
  factory?: IDBFactory | null;
  /** localStorage stand-in for the index (default: localStorage, memory when blocked) */
  kv?: KV;
  /** BroadcastChannel to other windows (default: on in a browser window) */
  channel?: boolean;
  /** the clock (tests) */
  now?: () => Date;
  /** ask the browser to keep storage on the first save (default true; tests pass a stub) */
  persist?: () => Promise<PersistResult>;
}

export class CourseStore {
  private listeners = new Set<(c: StoreChange) => void>();
  private bc: BroadcastChannel | null = null;
  private now: () => Date;
  private persistFn: () => Promise<PersistResult>;
  private constructor(
    readonly db: KvDb,
    private kv: KV,
    opts: OpenStoreOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
    this.persistFn = opts.persist ?? persist;
    const wantChannel =
      opts.channel ??
      (typeof window !== "undefined" &&
        typeof BroadcastChannel !== "undefined");
    if (wantChannel && typeof BroadcastChannel !== "undefined") {
      try {
        this.bc = new BroadcastChannel(CHANNEL);
        this.bc.onmessage = (e: MessageEvent) => {
          const d = e.data as { t?: string; change?: StoreChange } | null;
          if (d?.t === "changed" && d.change) this.emit(d.change, false);
        };
      } catch {
        this.bc = null;
      }
    }
  }

  /** Open the course store. Never rejects: falls back to memory (see `backend`). */
  static async open(opts: OpenStoreOptions = {}): Promise<CourseStore> {
    const db =
      opts.db ??
      (await openDb(DB_NAME, DB_VERSION, STORES, { factory: opts.factory }));
    return new CourseStore(db, opts.kv ?? defaultKv(), opts);
  }

  get backend(): "idb" | "memory" {
    return this.db.backend;
  }
  get reason(): string | undefined {
    return this.db.reason;
  }
  /** false: the banner "not saved on this device" must show */
  get savedOnDevice(): boolean {
    return this.db.backend === "idb";
  }
  close() {
    this.bc?.close();
    this.bc = null;
    this.db.close();
  }

  // ---------------------------------------------------------------- change notifications
  onChange(f: (c: StoreChange) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit(c: StoreChange, broadcast = true) {
    for (const f of this.listeners)
      try {
        f(c);
      } catch (e) {
        console.error("course store listener", e);
      }
    if (broadcast)
      try {
        this.bc?.postMessage({ t: "changed", change: c });
      } catch {
        /* closed */
      }
  }

  // ---------------------------------------------------------------- the synchronous index
  private readIndex(): IndexData {
    try {
      const raw = this.kv.getItem(INDEX_KEY);
      if (raw) {
        const o = JSON.parse(raw) as IndexData;
        if (o && o.v === 1 && Array.isArray(o.courses)) return o;
      }
    } catch {
      /* corrupt: rebuilt by reindex() */
    }
    return { v: 1, courses: [] };
  }
  private writeIndex(d: IndexData) {
    try {
      this.kv.setItem(INDEX_KEY, JSON.stringify(d));
    } catch {
      /* quota / blocked: the index is a cache, IndexedDB stays the source of truth */
    }
  }
  /** The library list, synchronously (most recently updated first). */
  list(): CourseIndexEntry[] {
    return [...this.readIndex().courses].sort((a, b) =>
      a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0,
    );
  }
  indexEntry(id: string): CourseIndexEntry | null {
    return this.readIndex().courses.find((c) => c.id === id) ?? null;
  }
  private upsertIndex(c: Course, patch: Partial<CourseIndexEntry> = {}) {
    const d = this.readIndex();
    const i = d.courses.findIndex((x) => x.id === c.id);
    const prev = i >= 0 ? d.courses[i] : null;
    const e: CourseIndexEntry = {
      id: c.id,
      title: short(c.title),
      rev: c.rev,
      updated: c.updated,
      steps: c.steps.length,
      langs: c.langs,
      ...(c.minutes !== undefined ? { minutes: c.minutes } : {}),
      ...(c.tags?.length ? { tags: c.tags.slice(0, 8) } : {}),
      ...(c.shape ? { shape: c.shape } : {}),
      ...(c.sample ? { sample: c.sample } : {}),
      ...(prev?.assigned ? { assigned: true } : {}),
      ...(prev?.exported ? { exported: prev.exported } : {}),
      created: prev?.created ?? this.now().toISOString(),
      ...patch,
    };
    if (i >= 0) d.courses[i] = e;
    else d.courses.push(e);
    this.writeIndex(d);
  }
  /** Rebuild the index from IndexedDB (a cleared localStorage, another device's index). */
  async reindex(): Promise<CourseIndexEntry[]> {
    const old = new Map(this.readIndex().courses.map((c) => [c.id, c]));
    const all = await this.db.getAll<Course>("courses");
    const d: IndexData = { ...this.readIndex(), courses: [] };
    this.writeIndex(d);
    for (const c of all) {
      const o = old.get(c.id);
      this.upsertIndex(c, {
        ...(o?.assigned ? { assigned: true } : {}),
        ...(o?.exported ? { exported: o.exported } : {}),
        ...(o?.created ? { created: o.created } : {}),
      });
    }
    this.emit({ store: "index" });
    return this.list();
  }

  // ---------------------------------------------------------------- courses
  /** A course, migrated to the current version (null when missing or unreadable). */
  async get(id: string): Promise<Course | null> {
    const raw = await this.db.get<unknown>("courses", id);
    if (raw === undefined) return null;
    return migrate(raw).value;
  }
  async has(id: string): Promise<boolean> {
    return (await this.db.get("courses", id)) !== undefined;
  }
  async all(): Promise<Course[]> {
    return (await this.db.getAll<unknown>("courses"))
      .map((c) => migrate(c).value)
      .filter((c): c is Course => !!c);
  }

  /**
   * Save a course: rev + 1 and `updated` = now (unless keepRev, used by imports), content hash, index, persist()
   * on the very first save. Content errors (a missing scene, alt text) do not block a draft; structural ones do.
   */
  async save(
    course: Course,
    opts: { keepRev?: boolean } = {},
  ): Promise<SaveResult> {
    const m = migrate(course);
    if (!m.value)
      return {
        ok: false,
        error: "invalid",
        message:
          m.issues[0] ?? L("This is not a course", "Ce n’est pas un cours"),
        issues: [],
      };
    const c = m.value;
    if (!opts.keepRev) {
      c.rev = (Number.isInteger(c.rev) ? c.rev : 0) + 1;
      c.updated = this.now().toISOString();
    }
    const issues = validateCourse(c);
    if (!isStructurallyValid(issues)) {
      const first = issues.find((i) => i.level === "error");
      return {
        ok: false,
        error: "invalid",
        message: first?.message ?? L("Invalid course", "Cours invalide"),
        issues,
      };
    }
    c.hash = await courseHash(c);
    try {
      await this.db.put("courses", c.id, c);
    } catch (e) {
      if (isQuotaError(e))
        return {
          ok: false,
          error: "quota",
          message: L(
            "Storage is full on this device: export the course to a file, then delete old courses or images",
            "Le stockage de cet appareil est plein : exportez le cours dans un fichier, puis supprimez d’anciens cours ou images",
          ),
          issues,
        };
      return {
        ok: false,
        error: "failed",
        message: L(
          `Could not save: ${(e as Error)?.message ?? e}`,
          `Enregistrement impossible : ${(e as Error)?.message ?? e}`,
        ),
        issues,
      };
    }
    this.upsertIndex(c);
    await this.askPersistOnce();
    this.emit({ store: "courses", key: c.id });
    return { ok: true, course: c, issues };
  }
  private async askPersistOnce() {
    const d = this.readIndex();
    if (d.persistAsked) return;
    let r: PersistResult = "unsupported";
    try {
      r = await this.persistFn();
    } catch {
      r = "denied";
    }
    this.writeIndex({ ...this.readIndex(), persistAsked: r });
  }
  /** what the browser said when asked to keep the storage (undefined before the first save) */
  persistState(): PersistResult | undefined {
    return this.readIndex().persistAsked;
  }

  /** Delete a course and its progress (attempts are kept: they are the student's record). */
  async delete(id: string): Promise<void> {
    await this.db.delete("courses", id);
    for (const k of await this.db.keys("progress"))
      if (String(k).startsWith(`${id}|`)) await this.db.delete("progress", k);
    const d = this.readIndex();
    d.courses = d.courses.filter((c) => c.id !== id);
    this.writeIndex(d);
    const last = this.last();
    if (last?.id === id) this.kv.removeItem(LAST_KEY);
    this.emit({ store: "courses", key: id });
  }

  /** a free course id from a base ("holding" → "holding", "holding-2", …) */
  async freeId(base: string): Promise<string> {
    const stem =
      base
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "course";
    const taken = new Set([
      ...(await this.db.keys("courses")).map(String),
      ...this.readIndex().courses.map((c) => c.id),
    ]);
    if (!taken.has(stem)) return stem;
    const m = /^(.*?)(?:-(\d+))?$/.exec(stem)!;
    let n = Math.max(2, Number(m[2] ?? 1) + 1);
    while (taken.has(`${m[1]}-${n}`)) n++;
    return `${m[1]}-${n}`;
  }

  /** Library → Duplicate (and "Duplicate a sample"): a new id, rev 0, `sample` kept or set. */
  async duplicate(
    source: Course | string,
    opts: { title?: L10n; sample?: string } = {},
  ): Promise<SaveResult> {
    const src =
      typeof source === "string"
        ? await this.get(source)
        : migrate(source).value;
    if (!src)
      return {
        ok: false,
        error: "invalid",
        message: L("Course not found", "Cours introuvable"),
        issues: [],
      };
    const c = structuredClone(src);
    c.id = await this.freeId(src.id);
    c.rev = 0;
    delete c.hash;
    c.title = opts.title ?? src.title;
    if (opts.sample ?? src.sample) c.sample = opts.sample ?? src.sample;
    const r = await this.save(c);
    if (r.ok) this.setAssigned(c.id, false);
    return r;
  }

  setAssigned(id: string, on: boolean) {
    const d = this.readIndex();
    const e = d.courses.find((c) => c.id === id);
    if (!e) return;
    if (on) e.assigned = true;
    else delete e.assigned;
    this.writeIndex(d);
    this.emit({ store: "index", key: id });
  }
  markExported(id: string, at: Date = this.now()) {
    const d = this.readIndex();
    const e = d.courses.find((c) => c.id === id);
    if (!e) return;
    e.exported = at.toISOString();
    this.writeIndex(d);
    this.emit({ store: "index", key: id });
  }
  /** days since the last export (or since the course was first stored when never exported); null = unknown */
  exportAgeDays(id: string, now: Date = this.now()): number | null {
    const e = this.indexEntry(id);
    if (!e) return null;
    const from = e.exported ?? e.created;
    if (!from) return null;
    return Math.floor((now.getTime() - Date.parse(from)) / 86_400_000);
  }
  /** the "not exported for 7 days" badge: changed since the last export and that export (or none) is ≥ 7 days old */
  needsExport(id: string, now: Date = this.now()): boolean {
    const e = this.indexEntry(id);
    if (!e || e.sample) return false;
    if (e.exported && e.updated <= e.exported) return false;
    const age = this.exportAgeDays(id, now);
    return age !== null && age >= EXPORT_NUDGE_DAYS;
  }

  setLast(id: string, stepId?: string) {
    try {
      this.kv.setItem(
        LAST_KEY,
        JSON.stringify({ id, ...(stepId ? { stepId } : {}) }),
      );
    } catch {
      /* ignore */
    }
  }
  last(): { id: string; stepId?: string } | null {
    try {
      const raw = this.kv.getItem(LAST_KEY);
      const o = raw
        ? (JSON.parse(raw) as { id?: unknown; stepId?: unknown })
        : null;
      if (o && typeof o.id === "string" && COURSE_ID.test(o.id))
        return {
          id: o.id,
          ...(typeof o.stepId === "string" ? { stepId: o.stepId } : {}),
        };
    } catch {
      /* ignore */
    }
    return null;
  }

  // ---------------------------------------------------------------- assets (content-addressed)
  /** Store image bytes under their sha-256 and return the AssetRef to put in course.assets. */
  async putAsset(
    blob: Blob,
    meta: {
      w: number;
      h: number;
      role: AssetRef["role"];
      source?: string;
      alt?: L10n;
      mime?: AssetRef["mime"];
    },
  ): Promise<AssetRef> {
    const mime = (meta.mime ?? blob.type) as AssetRef["mime"];
    const id = await sha256Hex(blob);
    if ((await this.db.get("assets", id)) === undefined) {
      try {
        await this.db.put("assets", id, blob);
      } catch (e) {
        throw isQuotaError(e)
          ? e
          : new Error(
              `Could not store the image: ${(e as Error)?.message ?? e}`,
            );
      }
      this.emit({ store: "assets", key: id });
    }
    return {
      id,
      mime,
      w: meta.w,
      h: meta.h,
      bytes: blob.size,
      role: meta.role,
      ...(meta.source ? { source: meta.source } : {}),
      ...(meta.alt ? { alt: meta.alt } : {}),
    };
  }
  async getAsset(id: AssetId): Promise<Blob | null> {
    return (await this.db.get<Blob>("assets", id)) ?? null;
  }
  async hasAsset(id: AssetId): Promise<boolean> {
    return (await this.db.get("assets", id)) !== undefined;
  }
  /** bytes of a course's stored assets (the size meter) */
  async assetBytes(course: Course): Promise<number> {
    let n = 0;
    for (const id of Object.keys(course.assets)) {
      const b = await this.getAsset(id);
      n += b?.size ?? course.assets[id].bytes ?? 0;
    }
    return n;
  }
  /** Delete asset blobs no course and no tray item references any more. Returns how many were removed. */
  async gcAssets(): Promise<number> {
    const used = new Set<string>();
    for (const c of await this.all()) {
      for (const id of Object.keys(c.assets)) used.add(id);
      if (c.brand?.logo && "asset" in c.brand.logo)
        used.add(c.brand.logo.asset);
    }
    for (const t of await this.listTray()) {
      if (t.thumb) used.add(t.thumb);
      if (t.still) used.add(t.still);
      if (t.scene.captured?.thumb) used.add(t.scene.captured.thumb);
      if (t.scene.captured?.still) used.add(t.scene.captured.still);
    }
    let n = 0;
    for (const k of await this.db.keys("assets"))
      if (!used.has(String(k))) {
        await this.db.delete("assets", k);
        n++;
      }
    return n;
  }

  // ---------------------------------------------------------------- tray (cockpit captures)
  async addTray(
    item: Omit<TrayItem, "id" | "at"> & { id?: string; at?: string },
  ): Promise<TrayItem> {
    const t: TrayItem = {
      ...item,
      id: item.id ?? `cap-${this.now().getTime().toString(36)}-${rand()}`,
      at: item.at ?? this.now().toISOString(),
    };
    await this.db.put("tray", t.id, t);
    this.emit({ store: "tray", key: t.id });
    return t;
  }
  /** newest first; for one course plus the captures made for no course */
  async listTray(courseId?: string): Promise<TrayItem[]> {
    const all = await this.db.getAll<TrayItem>("tray");
    return all
      .filter((t) => !courseId || !t.courseId || t.courseId === courseId)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  async removeTray(id: string): Promise<void> {
    await this.db.delete("tray", id);
    this.emit({ store: "tray", key: id });
  }

  // ---------------------------------------------------------------- thumbnails
  async putThumb(key: string, blob: Blob): Promise<void> {
    await this.db.put("thumbs", key, blob);
  }
  async getThumb(key: string): Promise<Blob | null> {
    return (await this.db.get<Blob>("thumbs", key)) ?? null;
  }

  // ---------------------------------------------------------------- progress and attempts (per profile)
  async getProgress(
    courseId: string,
    profileId: string,
  ): Promise<CourseProgress | null> {
    return (
      (await this.db.get<CourseProgress>(
        "progress",
        `${courseId}|${profileId}`,
      )) ?? null
    );
  }
  async setProgress(
    p: Omit<CourseProgress, "updated"> & { updated?: string },
  ): Promise<CourseProgress> {
    const v: CourseProgress = {
      ...p,
      updated: p.updated ?? this.now().toISOString(),
    };
    await this.db.put("progress", `${p.courseId}|${p.profileId}`, v);
    this.setLast(p.courseId, p.stepId);
    this.emit({ store: "progress", key: p.courseId });
    return v;
  }
  /** the storage key of an attempt (a fly attempt is keyed by its token: one record per attempt) */
  attemptKey(a: AttemptRecord): string {
    const suffix = a.fly?.token ?? a.yourTurn?.result.token ?? rand();
    return `${a.courseId}|${a.profileId}|${a.stepId}|${a.at}|${suffix}`;
  }
  async addAttempt(a: AttemptRecord, key?: string): Promise<string> {
    const k = key ?? this.attemptKey(a);
    await this.db.put("attempts", k, a);
    this.emit({ store: "attempts", key: a.courseId });
    return k;
  }
  async getAttempt(key: string): Promise<AttemptRecord | null> {
    return (await this.db.get<AttemptRecord>("attempts", key)) ?? null;
  }
  /** oldest first */
  async listAttempts(f: AttemptFilter = {}): Promise<AttemptRecord[]> {
    const all = await this.db.getAll<AttemptRecord>("attempts");
    return all
      .filter(
        (a) =>
          (!f.courseId || a.courseId === f.courseId) &&
          (!f.profileId || a.profileId === f.profileId) &&
          (!f.stepId || a.stepId === f.stepId) &&
          (!f.kind || a.kind === f.kind),
      )
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  // ---------------------------------------------------------------- handoff records (semantics in handoff.ts)
  async putHandoff(h: Handoff): Promise<void> {
    await this.db.put("handoffs", h.token, h);
  }
  async getHandoff(token: string): Promise<Handoff | null> {
    return (await this.db.get<Handoff>("handoffs", token)) ?? null;
  }
  async deleteHandoff(token: string): Promise<void> {
    await this.db.delete("handoffs", token);
  }
  async listHandoffs(): Promise<Handoff[]> {
    return this.db.getAll<Handoff>("handoffs");
  }
}

/** The banner text when nothing is kept on this device (null when storage works). */
export function storageNotice(
  store: Pick<CourseStore, "backend" | "reason">,
  lang: Lang = "en",
): string | null {
  if (store.backend === "idb") return null;
  return lang === "fr"
    ? "Non enregistré sur cet appareil (navigation privée ou stockage bloqué) : exportez votre travail dans un fichier."
    : "Not saved on this device (private browsing or blocked storage): export your work to a file.";
}

let shared: Promise<CourseStore> | null = null;
/** The page's store (opened once). */
export function courseStore(): Promise<CourseStore> {
  shared ??= CourseStore.open();
  return shared;
}
