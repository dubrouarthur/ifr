// Club procedure library: the flying club's own procedures (customised library ones or written from scratch),
// stored in localStorage under 'ifr.procs.v1' ({ v: 1, club, procedures }), plus the club pack format used to
// pass a library between instructors and students (JSON file or share link).
//
//   effectiveProcedures(lang?)    club procedures + the library ones they do not override (basedOn)
//   listClub / getProcedure / saveProcedure / deleteProcedure
//   customise(basedOn)            draft copy of a library procedure (not saved) — the editor's 'Customise'
//   duplicateFromLibrary(basedOn) the same, saved
//   resetToLibrary(id)            drop the club version: the library procedure comes back
//   validateProcedure(p, lang)    readable problems ({ path, message }), empty = valid
//   exportPack / importPack       { format: 'ifr-club-pack', version: 1, club, exported, procedures[] }; merge by id
//                                 with a conflict policy ('newer' default, 'replace', 'keep', 'copy')
//   encodeShare / decodeShare     compact base64url code for one procedure ('P1.') or a pack ('K1.')
//   shareLink / shareCodeFromUrl  '<page>?proc=<code>' links (main.ts reads ?proc= and offers the import)
import { FAILURE_LABELS_EN, type FailureKey } from "../sim/systemsTypes";
import { checkParamIssues, CHECKS } from "./procedureChecks";
import { DISCLAIMER, LIBRARY, libraryProcedure } from "./procedureLibrary";
import type {
  CheckRef,
  Lang,
  ProcCategory,
  ProcItem,
  Procedure,
} from "./procedureTypes";

export const STORE_KEY = "ifr.procs.v1";
export const STORE_VERSION = 1;
export const PACK_FORMAT = "ifr-club-pack";
export const PACK_VERSION = 1;

export interface ClubPack {
  format: typeof PACK_FORMAT;
  version: number;
  club: string;
  /** ISO date */
  exported?: string;
  procedures: Procedure[];
}

interface StoreData {
  v: number;
  club: string;
  procedures: Procedure[];
}

// ------------------------------------------------------------------ storage (localStorage, memory fallback)
type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const memory = new Map<string, string>();
const memKV: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};
function kv(): KV {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) return ls;
  } catch {
    /* storage blocked */
  }
  return memKV;
}

const listeners = new Set<() => void>();
/** called after every change of the club library (the hub re-renders) */
export function onProceduresChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function read(): StoreData {
  try {
    const raw = kv().getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<StoreData>;
      if (d && Array.isArray(d.procedures))
        return {
          v: STORE_VERSION,
          club: typeof d.club === "string" ? d.club : "",
          procedures: d.procedures.filter((p) => p && typeof p.id === "string"),
        };
    }
  } catch {
    /* corrupt or blocked: start empty */
  }
  return { v: STORE_VERSION, club: "", procedures: [] };
}
function write(d: StoreData) {
  try {
    kv().setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    /* quota / blocked: keep going in memory */
    memKV.setItem(STORE_KEY, JSON.stringify(d));
  }
  listeners.forEach((f) => f());
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const today = () => new Date().toISOString();

// ------------------------------------------------------------------ library access
export function clubName(): string {
  return read().club;
}
export function setClubName(name: string) {
  const d = read();
  d.club = name.trim().slice(0, 80);
  write(d);
}

/** the club's own procedures (copies) */
export function listClub(): Procedure[] {
  return read().procedures.map(clone);
}

/** club procedures + the library ones they do not override, optionally in one language */
export function effectiveProcedures(lang?: Lang): Procedure[] {
  const club = read().procedures;
  const overridden = new Set(
    club.map((p) => p.basedOn).filter((x): x is string => !!x),
  );
  const ids = new Set(club.map((p) => p.id));
  const all = [
    ...club,
    ...LIBRARY.filter((p) => !overridden.has(p.id) && !ids.has(p.id)),
  ];
  return (lang ? all.filter((p) => p.lang === lang) : all).map(clone);
}

/** a club procedure by id, else the library one */
export function getProcedure(id: string): Procedure | null {
  const c = read().procedures.find((p) => p.id === id);
  return c ? clone(c) : libraryProcedure(id);
}

/** the club version that replaces a library procedure, if any */
export function clubOverride(libraryId: string): Procedure | null {
  const c = read().procedures.find((p) => p.basedOn === libraryId);
  return c ? clone(c) : null;
}

export type SaveResult =
  | { ok: true; procedure: Procedure }
  | { ok: false; issues: ValidationIssue[] };

/** save (create or replace by id) a club procedure; invalid procedures are refused with the reasons */
export function saveProcedure(p: Procedure, lang: Lang = "en"): SaveResult {
  const proc: Procedure = { ...clone(p), source: "club", updated: today() };
  if (LIBRARY.some((x) => x.id === proc.id)) {
    // never shadow a library id directly: keep it as the basedOn of a club copy
    proc.basedOn ??= proc.id;
    proc.id = uniqueId(clubIdFor(proc.id));
  }
  const issues = validateProcedure(proc, lang);
  if (issues.length) return { ok: false, issues };
  const d = read();
  const i = d.procedures.findIndex((x) => x.id === proc.id);
  if (i >= 0) d.procedures[i] = proc;
  else d.procedures.push(proc);
  write(d);
  return { ok: true, procedure: clone(proc) };
}

export function deleteProcedure(id: string): boolean {
  const d = read();
  const n = d.procedures.length;
  d.procedures = d.procedures.filter((p) => p.id !== id);
  if (d.procedures.length === n) return false;
  write(d);
  return true;
}

function clubIdFor(libraryId: string): string {
  return `club.${libraryId.replace(/^c172\./, "")}`;
}
function uniqueId(want: string): string {
  const taken = new Set([
    ...read().procedures.map((p) => p.id),
    ...LIBRARY.map((p) => p.id),
  ]);
  if (!taken.has(want)) return want;
  const m = /^(.*?)(\.(fr|en))?$/.exec(want)!;
  for (let n = 2; ; n++) {
    const id = `${m[1]}-${n}${m[2] ?? ""}`;
    if (!taken.has(id)) return id;
  }
}

/** draft club copy of a library procedure (not saved): the editor's 'Customise' */
export function customise(basedOn: string): Procedure | null {
  const lib = libraryProcedure(basedOn) ?? getProcedure(basedOn);
  if (!lib) return null;
  const libId = lib.source === "library" ? lib.id : (lib.basedOn ?? lib.id);
  return {
    ...lib,
    id: uniqueId(clubIdFor(lib.id)),
    source: "club",
    basedOn: libId,
    updated: undefined,
  };
}

/** customise + save */
export function duplicateFromLibrary(basedOn: string): Procedure | null {
  const draft = customise(basedOn);
  if (!draft) return null;
  const r = saveProcedure(draft);
  return r.ok ? r.procedure : null;
}

/** remove the club version(s) of a library procedure (by the club id or the library id): returns the library one */
export function resetToLibrary(id: string): Procedure | null {
  const d = read();
  const own = d.procedures.find((p) => p.id === id);
  const libId = own?.basedOn ?? id;
  const n = d.procedures.length;
  d.procedures = d.procedures.filter((p) => p.id !== id && p.basedOn !== libId);
  if (d.procedures.length !== n) write(d);
  return libraryProcedure(libId);
}

/** a blank club procedure (editor 'New procedure') */
export function newProcedure(lang: Lang): Procedure {
  return {
    id: uniqueId(`club.custom.${lang}`),
    title: lang === "fr" ? "Nouvelle procédure" : "New procedure",
    category: "other",
    lang,
    failures: [],
    aircraft: "C172S",
    ordered: false,
    items: [{ id: "i1", text: "", memory: false, check: { id: "manual" } }],
    source: "club",
    disclaimer: DISCLAIMER[lang],
  };
}

/** wipe the club library (tests, 'reset everything') */
export function clearClubLibrary() {
  write({ v: STORE_VERSION, club: read().club, procedures: [] });
}

// ------------------------------------------------------------------ validation
export interface ValidationIssue {
  /** 'title', 'items[2].text', 'items[2].check' ... */
  path: string;
  message: string;
}
const CATEGORIES: ProcCategory[] = [
  "engine",
  "fire",
  "electrical",
  "instruments",
  "avionics",
  "comms",
  "flight",
  "other",
];
const FAILURE_KEYS = new Set(Object.keys(FAILURE_LABELS_EN));
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** readable problems with a procedure (empty = valid), in the UI language */
export function validateProcedure(
  p: Procedure,
  lang: Lang = "en",
): ValidationIssue[] {
  const fr = lang === "fr";
  const out: ValidationIssue[] = [];
  const add = (path: string, en: string, frMsg: string) =>
    out.push({ path, message: fr ? frMsg : en });
  if (!p || typeof p !== "object")
    return [
      {
        path: "",
        message: fr ? "Procédure illisible" : "Unreadable procedure",
      },
    ];
  if (!p.id || !ID_RE.test(p.id))
    add(
      "id",
      "The id must be 1–80 letters, digits, '.', '-' or '_'",
      "L’identifiant doit faire 1 à 80 lettres, chiffres, « . », « - » ou « _ »",
    );
  if (!p.title?.trim())
    add(
      "title",
      "Give the procedure a title",
      "Donnez un titre à la procédure",
    );
  else if (p.title.length > 120)
    add(
      "title",
      "The title is too long (120 characters max)",
      "Le titre est trop long (120 caractères max)",
    );
  if (p.lang !== "fr" && p.lang !== "en")
    add(
      "lang",
      "Language must be French or English",
      "La langue doit être le français ou l’anglais",
    );
  if (!CATEGORIES.includes(p.category))
    add("category", "Choose a category", "Choisissez une catégorie");
  if (p.source !== "club" && p.source !== "library")
    add(
      "source",
      "Unknown origin (club or library)",
      "Origine inconnue (club ou bibliothèque)",
    );
  if (!Array.isArray(p.failures))
    add(
      "failures",
      "The failure list is missing",
      "La liste des pannes manque",
    );
  else
    p.failures.forEach((f, i) => {
      if (!FAILURE_KEYS.has(f as string))
        add(
          `failures[${i}]`,
          `Unknown failure '${String(f)}'`,
          `Panne inconnue « ${String(f)} »`,
        );
    });
  if (typeof p.aircraft !== "string")
    add(
      "aircraft",
      "Name the aircraft (e.g. C172S)",
      "Indiquez l’avion (ex. C172S)",
    );
  if (typeof p.ordered !== "boolean")
    add(
      "ordered",
      "Say whether the order matters",
      "Indiquez si l’ordre compte",
    );
  if (!Array.isArray(p.items) || !p.items.length)
    add("items", "Add at least one item", "Ajoutez au moins un point");
  else {
    const seen = new Set<string>();
    if (p.items.every((it) => it?.optional))
      add(
        "items",
        "At least one item must be required (not optional)",
        "Au moins un point doit être obligatoire (non facultatif)",
      );
    p.items.forEach((it: ProcItem, i) => {
      const n = i + 1;
      const at = `items[${i}]`;
      if (!it || typeof it !== "object") {
        add(at, `Item ${n} is unreadable`, `Point ${n} illisible`);
        return;
      }
      if (!it.id || !ID_RE.test(it.id))
        add(
          `${at}.id`,
          `Item ${n}: invalid id`,
          `Point ${n} : identifiant invalide`,
        );
      else if (seen.has(it.id))
        add(
          `${at}.id`,
          `Item ${n}: the id '${it.id}' is used twice`,
          `Point ${n} : l’identifiant « ${it.id} » est utilisé deux fois`,
        );
      seen.add(it.id);
      if (!it.text?.trim())
        add(
          `${at}.text`,
          `Item ${n}: the text is empty`,
          `Point ${n} : le texte est vide`,
        );
      else if (it.text.length > 200)
        add(
          `${at}.text`,
          `Item ${n}: the text is too long (200 characters max)`,
          `Point ${n} : texte trop long (200 caractères max)`,
        );
      if (typeof it.memory !== "boolean")
        add(
          `${at}.memory`,
          `Item ${n}: say whether it is a memory item`,
          `Point ${n} : indiquez si c’est une action réflexe`,
        );
      if (it.memory && it.optional)
        add(
          `${at}.optional`,
          `Item ${n}: a memory item cannot be optional`,
          `Point ${n} : une action réflexe ne peut pas être facultative`,
        );
      if (
        it.withinS !== undefined &&
        (!Number.isFinite(it.withinS) || it.withinS <= 0 || it.withinS > 3600)
      )
        add(
          `${at}.withinS`,
          `Item ${n}: the time limit must be between 1 s and 1 hour`,
          `Point ${n} : la limite de temps doit être entre 1 s et 1 heure`,
        );
      if (it.check)
        checkIssues(it.check, `${at}.check`, `Item ${n}: `, `Point ${n} : `);
    });
  }
  const tg = p.targets;
  if (tg) {
    if (tg.iasKt) {
      const [a, b] = tg.iasKt;
      if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a < 30 ||
        b > 200 ||
        a >= b
      )
        add(
          "targets.iasKt",
          "Airspeed band: min below max, between 30 and 200 kt",
          "Plage de vitesse : min inférieur au max, entre 30 et 200 kt",
        );
    }
    if (
      tg.maxBankDeg !== undefined &&
      (!Number.isFinite(tg.maxBankDeg) ||
        tg.maxBankDeg < 0 ||
        tg.maxBankDeg > 90)
    )
      add(
        "targets.maxBankDeg",
        "Bank limit between 0 and 90°",
        "Inclinaison max entre 0 et 90°",
      );
  }
  if (p.when?.aglFt) {
    const [a, b] = p.when.aglFt;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > b)
      add(
        "when.aglFt",
        "Height band: min below max",
        "Plage de hauteur : min inférieur au max",
      );
  }
  if (p.then) {
    if (!p.then.procedure?.trim())
      add(
        "then.procedure",
        "Follow-up: choose the procedure",
        "Suite : choisissez la procédure",
      );
    if (p.then.unless)
      checkIssues(p.then.unless, "then.unless", "Follow-up: ", "Suite : ");
    if (
      p.then.afterS !== undefined &&
      (!Number.isFinite(p.then.afterS) || p.then.afterS <= 0)
    )
      add(
        "then.afterS",
        "Follow-up: the delay must be positive",
        "Suite : le délai doit être positif",
      );
  }
  return out;

  function checkIssues(c: CheckRef, path: string, pre: string, preFr: string) {
    if (!c || !(c.id in CHECKS)) {
      add(
        path,
        `${pre}unknown check '${String(c?.id)}'`,
        `${preFr}vérification inconnue « ${String(c?.id)} »`,
      );
      return;
    }
    for (const m of checkParamIssues(c, lang))
      out.push({ path, message: (fr ? preFr : pre) + m });
  }
}

// ------------------------------------------------------------------ club pack (JSON file)
export function exportPack(
  opts: { club?: string; ids?: string[] } = {},
): ClubPack {
  const d = read();
  const procs = opts.ids
    ? opts.ids.map((id) => getProcedure(id)).filter((p): p is Procedure => !!p)
    : d.procedures.map(clone);
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    club: opts.club ?? d.club,
    exported: today(),
    procedures: procs,
  };
}
export function exportPackJson(opts?: {
  club?: string;
  ids?: string[];
}): string {
  return JSON.stringify(exportPack(opts), null, 2);
}

/** read a pack from a JSON string or object; null + issues when it is not a club pack */
export function parsePack(
  input: string | unknown,
  lang: Lang = "en",
): { pack: ClubPack | null; issues: string[] } {
  const fr = lang === "fr";
  let o: unknown = input;
  if (typeof input === "string") {
    try {
      o = JSON.parse(input);
    } catch {
      return {
        pack: null,
        issues: [
          fr
            ? "Fichier illisible (JSON invalide)"
            : "Unreadable file (invalid JSON)",
        ],
      };
    }
  }
  const x = o as Partial<ClubPack> | null;
  if (
    !x ||
    typeof x !== "object" ||
    x.format !== PACK_FORMAT ||
    !Array.isArray(x.procedures)
  )
    return {
      pack: null,
      issues: [
        fr
          ? "Ce n’est pas un pack de procédures de club"
          : "This is not a club procedure pack",
      ],
    };
  if (typeof x.version !== "number" || x.version > PACK_VERSION)
    return {
      pack: null,
      issues: [
        fr
          ? "Pack créé par une version plus récente : mettez le simulateur à jour"
          : "Pack made by a newer version: update the simulator",
      ],
    };
  return {
    pack: {
      format: PACK_FORMAT,
      version: x.version,
      club: typeof x.club === "string" ? x.club : "",
      exported: x.exported,
      procedures: x.procedures as Procedure[],
    },
    issues: [],
  };
}

export type ConflictPolicy = "newer" | "replace" | "keep" | "copy";
export interface ImportReport {
  added: string[];
  replaced: string[];
  /** id → reason (invalid, unchanged, older, kept) */
  skipped: { id: string; reason: string }[];
  renamed: { from: string; to: string }[];
  issues: string[];
}

const sameContent = (a: Procedure, b: Procedure) =>
  JSON.stringify({ ...a, updated: undefined, source: undefined }) ===
  JSON.stringify({ ...b, updated: undefined, source: undefined });

/**
 * Merge a pack into the club library, by id. Conflicts (same id already in the club library):
 *   'newer' (default) replace only when the incoming one was updated later; 'replace' always; 'keep' never;
 *   'copy' import under a new id. Identical procedures are skipped. Invalid ones are skipped with the reason.
 *   Library procedures inside a pack are imported only when they differ from the library (as club copies).
 *   A pack with a club name sets the local club name when it is empty.
 */
export function importPack(
  input: string | unknown,
  policy: ConflictPolicy = "newer",
  lang: Lang = "en",
): ImportReport {
  const fr = lang === "fr";
  const rep: ImportReport = {
    added: [],
    replaced: [],
    skipped: [],
    renamed: [],
    issues: [],
  };
  const { pack, issues } = parsePack(input, lang);
  if (!pack) {
    rep.issues = issues;
    return rep;
  }
  const d = read();
  if (!d.club && pack.club) d.club = pack.club;
  for (const raw of pack.procedures) {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof (raw as Procedure).id !== "string"
    ) {
      rep.skipped.push({
        id: "?",
        reason: fr ? "procédure illisible" : "unreadable procedure",
      });
      continue;
    }
    let p = clone(raw);
    p.disclaimer ??=
      p.lang === "fr" || p.lang === "en" ? DISCLAIMER[p.lang] : undefined;
    const lib = LIBRARY.find((x) => x.id === p.id);
    if (lib) {
      if (sameContent(lib, p)) {
        rep.skipped.push({
          id: p.id,
          reason: fr ? "identique à la bibliothèque" : "same as the library",
        });
        continue;
      }
      p = { ...p, basedOn: lib.id, id: clubIdFor(lib.id) };
    }
    p.source = "club";
    const errs = validateProcedure(p, lang);
    if (errs.length) {
      rep.skipped.push({
        id: p.id,
        reason: errs.map((e) => e.message).join(" · "),
      });
      continue;
    }
    let i = d.procedures.findIndex((x) => x.id === p.id);
    // another club's version of a library procedure this club has customised too (under another id): it is the
    // same procedure — treat it as a conflict with the local version instead of adding a second override
    if (i < 0 && p.basedOn && policy !== "copy") {
      i = d.procedures.findIndex((x) => x.basedOn === p.basedOn);
      if (i >= 0) p = { ...p, id: d.procedures[i].id };
    }
    if (i < 0) {
      p.updated ??= today();
      d.procedures.push(p);
      rep.added.push(p.id);
      continue;
    }
    const cur = d.procedures[i];
    if (sameContent(cur, p)) {
      rep.skipped.push({
        id: p.id,
        reason: fr ? "déjà à jour" : "already up to date",
      });
      continue;
    }
    const newer = !cur.updated || (p.updated ?? "") > cur.updated;
    if (policy === "replace" || (policy === "newer" && newer)) {
      p.updated ??= today();
      d.procedures[i] = p;
      rep.replaced.push(p.id);
    } else if (policy === "copy") {
      const taken = new Set([
        ...d.procedures.map((x) => x.id),
        ...LIBRARY.map((x) => x.id),
      ]);
      const m = /^(.*?)(\.(fr|en))?$/.exec(p.id)!;
      let n = 2;
      while (taken.has(`${m[1]}-${n}${m[2] ?? ""}`)) n++;
      const to = `${m[1]}-${n}${m[2] ?? ""}`;
      d.procedures.push({ ...p, id: to, updated: p.updated ?? today() });
      rep.renamed.push({ from: p.id, to });
    } else
      rep.skipped.push({
        id: p.id,
        reason:
          policy === "keep"
            ? fr
              ? "version du club conservée"
              : "club version kept"
            : fr
              ? "version locale plus récente"
              : "local version is newer",
      });
  }
  write(d);
  return rep;
}

// ------------------------------------------------------------------ share codes (compact base64url)
const PK: Record<string, string> = {
  id: "i",
  title: "t",
  category: "c",
  lang: "l",
  failures: "f",
  aircraft: "a",
  ordered: "o",
  items: "x",
  targets: "g",
  source: "s",
  ref: "r",
  basedOn: "b",
  updated: "u",
  disclaimer: "d",
  summary: "m",
  when: "w",
  then: "n",
};
const IK: Record<string, string> = {
  id: "i",
  text: "t",
  memory: "m",
  check: "k",
  withinS: "w",
  optional: "o",
  note: "n",
  safety: "s",
};
const inv = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([a, b]) => [b, a]));
const PK_INV = inv(PK);
const IK_INV = inv(IK);

function packProc(p: Procedure): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    if (
      k === "disclaimer" &&
      (p.lang === "fr" || p.lang === "en") &&
      v === DISCLAIMER[p.lang]
    )
      continue;
    if (k === "source") continue; // a shared procedure is always imported as a club procedure
    if (k === "items") {
      o[PK.items] = (v as ProcItem[]).map((it) => {
        const io: Record<string, unknown> = {};
        for (const [ik, iv] of Object.entries(it)) {
          if (iv === undefined || (ik === "memory" && iv === false)) continue;
          if (ik === "check") {
            const c = iv as CheckRef;
            io[IK.check] =
              c.p && Object.keys(c.p).length ? [c.id, c.p] : [c.id];
          } else io[IK[ik] ?? ik] = iv;
        }
        return io;
      });
    } else o[PK[k] ?? k] = v;
  }
  return o;
}
function unpackProc(o: Record<string, unknown>): Procedure {
  const p: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = PK_INV[k] ?? k;
    if (key === "items")
      p.items = (v as Record<string, unknown>[]).map((io) => {
        const it: Record<string, unknown> = { memory: false };
        for (const [ik, iv] of Object.entries(io)) {
          const name = IK_INV[ik] ?? ik;
          if (name === "check") {
            const [id, prm] = iv as [
              string,
              Record<string, string | number | boolean>?,
            ];
            it.check = prm ? { id, p: prm } : { id };
          } else it[name] = iv;
        }
        return it;
      });
    else p[key] = v;
  }
  const proc = p as unknown as Procedure;
  proc.source = "club";
  if (!proc.disclaimer && (proc.lang === "fr" || proc.lang === "en"))
    proc.disclaimer = DISCLAIMER[proc.lang];
  return proc;
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(bin, (ch) => ch.charCodeAt(0)),
  );
}

const isPack = (x: Procedure | ClubPack): x is ClubPack =>
  (x as ClubPack).format === PACK_FORMAT;

/** compact share code: 'P1.<base64url>' for a procedure, 'K1.<base64url>' for a pack */
export function encodeShare(x: Procedure | ClubPack): string {
  if (isPack(x))
    return `K1.${b64url(JSON.stringify({ c: x.club, e: x.exported, p: x.procedures.map(packProc) }))}`;
  return `P1.${b64url(JSON.stringify(packProc(x)))}`;
}

export type SharePayload =
  | { kind: "procedure"; procedure: Procedure }
  | { kind: "pack"; pack: ClubPack };

/** decode a share code (or a link holding ?proc=<code>); null when it is not one */
export function decodeShare(codeOrUrl: string): SharePayload | null {
  const code = shareCodeFromUrl(codeOrUrl) ?? codeOrUrl.trim();
  const m = /^([PK])1\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!m) return null;
  try {
    const o = JSON.parse(unb64url(m[2])) as Record<string, unknown>;
    if (m[1] === "P") return { kind: "procedure", procedure: unpackProc(o) };
    const procs = (o.p as Record<string, unknown>[] | undefined) ?? [];
    return {
      kind: "pack",
      pack: {
        format: PACK_FORMAT,
        version: PACK_VERSION,
        club: typeof o.c === "string" ? o.c : "",
        exported: typeof o.e === "string" ? o.e : undefined,
        procedures: procs.map(unpackProc),
      },
    };
  } catch {
    return null;
  }
}

/** '<page>?proc=<code>' (page defaults to the current location without its query) */
export function shareLink(x: Procedure | ClubPack, page?: string): string {
  const base =
    page ??
    (typeof location !== "undefined"
      ? `${location.origin}${location.pathname}`
      : "https://ifr.example/");
  return `${base}${base.includes("?") ? "&" : "?"}proc=${encodeShare(x)}`;
}

/** the share code inside a link (?proc= or #proc=), else null */
export function shareCodeFromUrl(url: string): string | null {
  const m = /[?#&]proc=([PK]1\.[A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

/** import what a share code holds into the club library (one procedure or a whole pack) */
export function importShare(
  codeOrUrl: string,
  policy: ConflictPolicy = "newer",
  lang: Lang = "en",
): ImportReport {
  const s = decodeShare(codeOrUrl);
  if (!s)
    return {
      added: [],
      replaced: [],
      skipped: [],
      renamed: [],
      issues: [
        lang === "fr" ? "Lien de partage invalide" : "Invalid share link",
      ],
    };
  const pack: ClubPack =
    s.kind === "pack"
      ? s.pack
      : {
          format: PACK_FORMAT,
          version: PACK_VERSION,
          club: "",
          procedures: [s.procedure],
        };
  return importPack(pack, policy, lang);
}

/** failures a procedure list answers (the builder greys out failures with no procedure) */
export function failuresWithProcedure(lang?: Lang): Set<FailureKey> {
  return new Set(effectiveProcedures(lang).flatMap((p) => p.failures));
}
