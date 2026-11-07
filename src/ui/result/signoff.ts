// Instructor review and sign-off (SPEC §6), stored on this device. One record per attempt (the training record's
// id): the instructor's identity, Satisfactory / Repeat / Unsatisfactory, notes, tags, an assignment, draft or
// signed. Signing locks the record with a SHA-256 over the attempt and the notes; the ACS result stays as flown.
// It is labelled "Signed on this device", never a legal signature, and nothing here is "approved" or "loggable".

export type Grade = "satisfactory" | "repeat" | "unsatisfactory";

export interface Instructor {
  name: string;
  role: string;
}

export interface SignOff {
  by: Instructor;
  grade: Grade | null;
  notes: string;
  tags: string[];
  assign?: {
    kind: "retry" | "lesson";
    ref: string;
    label: string;
    times: number;
  };
  at: string;
  draft: boolean;
  /** "fnv1a-…" (a page without WebCrypto, e.g. an iPad on a plain-http LAN address) or 64 hex digits (SHA-256) */
  lockHash?: string;
  /** every reopen of a signed record (who had signed it, when it was reopened): reopening needs no credential on
   *  this device, so it is never silent */
  reopened?: { by: string; at: string }[];
}

const KEY = "ifr.signoff.v1";
const ME = "ifr.instructor.v1";

interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const ls = (): Storage | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

function readAll(s: Storage | null = ls()): Record<string, SignOff> {
  try {
    const v = s?.getItem(KEY);
    return v ? (JSON.parse(v) as Record<string, SignOff>) : {};
  } catch {
    return {};
  }
}

export const signoffs = {
  get(id: string, s: Storage | null = ls()): SignOff | null {
    return readAll(s)[id] ?? null;
  },
  put(id: string, so: SignOff, s: Storage | null = ls()) {
    const all = readAll(s);
    // a signed record is locked: only an explicit reopen (draft) replaces it
    const cur = all[id];
    if (
      cur &&
      !cur.draft &&
      cur.lockHash &&
      !so.draft &&
      so.lockHash !== cur.lockHash
    )
      return cur;
    all[id] = so;
    // keep the newest 2,000 (the size of the local training records)
    const ids = Object.keys(all);
    if (ids.length > 2000)
      ids
        .sort((a, b) => (all[a].at < all[b].at ? -1 : 1))
        .slice(0, ids.length - 2000)
        .forEach((k) => delete all[k]);
    try {
      s?.setItem(KEY, JSON.stringify(all));
    } catch {
      /* storage full or blocked: the panel keeps its state for this session */
    }
    return so;
  },
  /** the instructor last used on this device (prefills the panel) */
  me(s: Storage | null = ls()): Instructor {
    try {
      const v = s?.getItem(ME);
      return v ? (JSON.parse(v) as Instructor) : { name: "", role: "" };
    } catch {
      return { name: "", role: "" };
    }
  },
  setMe(i: Instructor, s: Storage | null = ls()) {
    try {
      s?.setItem(ME, JSON.stringify(i));
    } catch {
      /* ignore */
    }
  },
};

/** what a signature covers: the attempt id, the verdict as flown, the grade and the notes (canonical text) */
export function lockText(
  id: string,
  outcome: string,
  so: Pick<SignOff, "by" | "grade" | "notes" | "tags" | "assign" | "reopened">,
): string {
  return JSON.stringify([
    id,
    outcome,
    so.by.name,
    so.by.role,
    so.grade,
    so.notes.trim(),
    [...so.tags].sort(),
    so.assign?.ref ?? null,
    ...(so.reopened?.length ? [so.reopened.map((r) => `${r.by}@${r.at}`)] : []),
  ]);
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16)}`;
}

async function sha256(text: string): Promise<string | null> {
  try {
    const c = globalThis.crypto?.subtle;
    if (!c) return null;
    const buf = await c.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** SHA-256 hex of the lock text (WebCrypto; a short FNV-1a fallback, prefixed "fnv1a-", where it is unavailable) */
export async function lockHash(text: string): Promise<string> {
  return (await sha256(text)) ?? fnv1a(text);
}

/** a signed record still matches what it covers (nothing edited since): true / false, or null when this page cannot
 *  check it (a SHA-256 lock read where WebCrypto is unavailable). The hash's own form says how it was made. */
export async function verifySignOff(
  id: string,
  outcome: string,
  so: SignOff,
): Promise<boolean | null> {
  if (so.draft || !so.lockHash) return false;
  const text = lockText(id, outcome, so);
  if (so.lockHash.startsWith("fnv1a-")) return fnv1a(text) === so.lockHash;
  const h = await sha256(text);
  return h === null ? null : h === so.lockHash;
}

/** initials for the avatar ("Claire Martin" → "CM") */
export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "—";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
