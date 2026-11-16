// « Assistant IA » — the customer's own Claude API key (bring your own key). It lives in memory for the session;
// it is written to this device's storage only when the instructor ticks « Se souvenir de la clé sur cet appareil »,
// and « Oublier la clé » removes it from both. It is sent only to Anthropic's API, from the browser (client.ts):
// never logged, never put in a URL, never sent anywhere else.

/** The storage entry of a remembered key (this device only). */
export const KEY_STORAGE = "ifr.ai.key";

/** A light format check (« sk-ant-… », no spaces); the real check is « Vérifier » (one cheap call). */
export function keyLooksValid(k: string | null | undefined): boolean {
  const t = (k ?? "").trim();
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(t);
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class KeyStore {
  private key: string | null = null;
  private loaded = false;
  /** the key came from (or was written to) the device's storage */
  remembered = false;
  constructor(private storage: () => Store | null | undefined) {}
  private store(): Store | null {
    try {
      return this.storage() ?? null;
    } catch {
      return null;
    }
  }
  /** The key, or null (a remembered key is read once). */
  get(): string | null {
    if (!this.loaded) {
      this.loaded = true;
      try {
        const v = this.store()?.getItem(KEY_STORAGE) ?? null;
        if (v && keyLooksValid(v)) {
          this.key = v;
          this.remembered = true;
        }
      } catch {
        /* blocked storage: nothing remembered */
      }
    }
    return this.key;
  }
  /** Keep a key for the session; `remember` also writes it to this device (and unticking removes the copy). */
  set(k: string, remember: boolean): void {
    this.loaded = true;
    this.key = k.trim();
    this.remembered = false;
    try {
      const s = this.store();
      if (remember) {
        s?.setItem(KEY_STORAGE, this.key);
        this.remembered = !!s;
      } else s?.removeItem(KEY_STORAGE);
    } catch {
      this.remembered = false;
    }
  }
  /** « Oublier la clé »: gone from memory and from the device. */
  forget(): void {
    this.loaded = true;
    this.key = null;
    this.remembered = false;
    try {
      this.store()?.removeItem(KEY_STORAGE);
    } catch {
      /* nothing stored */
    }
  }
}

/** The app's key store (the browser's localStorage when it can be used). */
export const aiKey = new KeyStore(() =>
  typeof localStorage === "undefined" ? null : localStorage,
);
