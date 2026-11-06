// Ground school — migrations (SPEC §9.2 migrate.ts). Every course that enters the app (IndexedDB, a file, a share
// link, a club pack) goes through migrate() first, then validateCourse().
//
//   migrate(raw)            → { course, from, changes, issues }   never throws
//   migrateCourseFile(raw)  → the same for a .ifrcourse file (format 'ifr-course-file')
//   CURRENT_VERSION = 1
//
// Version 1 is the first released format. Pre-release drafts (no `version`, or version 0) are normalised: plain
// strings where an L10n is expected become { en }, missing collections become empty, a slide step gets layout
// 'canvas', and a drill is always practice only. A newer version is refused with a clear message, never guessed.
// Migrations are pure functions vN → vN+1 registered in MIGRATIONS; add one per format bump.
import type { Course, CourseFile, L10n, Step } from "./types";

export const CURRENT_VERSION = 1 as const;
export const COURSE_FORMAT = "ifr-course" as const;
export const FILE_FORMAT = "ifr-course-file" as const;

export interface MigrateResult<T> {
  /** null when the input cannot be made into the current format */
  value: T | null;
  /** version found (0 = a pre-release draft) */
  from: number;
  /** what was changed, for the import report */
  changes: string[];
  issues: L10n[];
}

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw =>
  !!x && typeof x === "object" && !Array.isArray(x);

/** vN → vN+1 */
export const MIGRATIONS: Record<number, (c: Raw, changes: string[]) => Raw> = {
  0: (c, changes) => normaliseDraft(c, changes),
};

/** keys whose value is an L10n in the data model (a plain string is lifted to { en }) */
const L10N_KEYS = new Set([
  "title",
  "summary",
  "text",
  "caption",
  "alt",
  "prompt",
  "explain",
  "why",
  "label",
  "brief",
  "debrief",
  "hint",
  "notes",
  "success",
  "formula",
  "ruleOfThumb",
  "note",
  "name",
]);
/** keys that look like L10n keys but hold plain strings in the model */
const PLAIN_PARENTS = new Set(["author", "brand", "captured"]);

function liftL10n(x: unknown, changes: string[], parent = ""): unknown {
  if (Array.isArray(x)) return x.map((v) => liftL10n(v, changes, parent));
  if (!isObj(x)) return x;
  const out: Raw = {};
  for (const [k, v] of Object.entries(x)) {
    // scenes hold sim data (SimScene.label is plain text): copied as they are
    if (k === "scenes" && parent === "") out[k] = v;
    else if (
      L10N_KEYS.has(k) &&
      typeof v === "string" &&
      !PLAIN_PARENTS.has(parent)
    ) {
      out[k] = { en: v };
      changes.push(`${k}: text → { en }`);
    } else if (
      k === "items" &&
      Array.isArray(v) &&
      v.every((i) => typeof i === "string")
    ) {
      out[k] = v.map((s) => ({ en: s }));
      changes.push("items: texts → { en }");
    } else out[k] = liftL10n(v, changes, k);
  }
  return out;
}

function normaliseDraft(c: Raw, changes: string[]): Raw {
  const x = liftL10n(c, changes) as Raw;
  x.format = COURSE_FORMAT;
  const fill = <K extends string>(k: K, v: unknown) => {
    if (x[k] === undefined) {
      x[k] = v;
      changes.push(`${k}: default`);
    }
  };
  fill("rev", 0);
  fill("updated", new Date().toISOString());
  fill("author", { name: "" });
  fill(
    "langs",
    isObj(x.title) && typeof (x.title as unknown as L10n).fr === "string"
      ? ["en", "fr"]
      : ["en"],
  );
  fill("cockpit", "g1000");
  fill("world", { kind: "training" });
  fill("scenes", {});
  fill("clips", {});
  fill("assets", {});
  fill("steps", []);
  if (Array.isArray(x.steps))
    x.steps = (x.steps as unknown[]).map((s) => normaliseStep(s, changes));
  x.version = 1;
  return x;
}
function normaliseStep(s: unknown, changes: string[]): unknown {
  if (!isObj(s)) return s;
  const st = s as Raw;
  if (!Array.isArray(st.reader)) {
    st.reader = [];
    changes.push("step.reader: default []");
  }
  if (isObj(st.flyIt)) {
    const f = st.flyIt as Raw;
    f.options ??= [];
    f.criteria ??= [];
    f.returnTo ??= "thisStep";
    if (Array.isArray(f.briefing))
      f.briefing = (f.briefing as unknown[]).map((b) =>
        normaliseStep(b, changes),
      );
  }
  return st;
}

/** invariants every version keeps (applied after the migrations, idempotent) */
function invariants(c: Raw, changes: string[]) {
  const walk = (steps: unknown) => {
    if (!Array.isArray(steps)) return;
    for (const s of steps) {
      if (!isObj(s)) continue;
      const st = s as unknown as Step;
      if (st.slide && st.layout === undefined) {
        st.layout = "canvas";
        changes.push(`step ${st.id}: layout canvas`);
      }
      if (
        st.drill &&
        (st.drill as { practiceOnly?: unknown }).practiceOnly !== true
      ) {
        (st.drill as { practiceOnly: true }).practiceOnly = true;
        changes.push(`step ${st.id}: drill is practice only`);
      }
      if (isObj(st.flyIt)) walk((st.flyIt as { briefing?: unknown }).briefing);
    }
  };
  walk(c.steps);
}

/** Bring a raw course to the current version. Never throws. */
export function migrate(raw: unknown): MigrateResult<Course> {
  const changes: string[] = [];
  const fail = (
    from: number,
    en: string,
    fr: string,
  ): MigrateResult<Course> => ({
    value: null,
    from,
    changes,
    issues: [{ en, fr }],
  });
  let x: unknown = raw;
  if (typeof raw === "string") {
    try {
      x = JSON.parse(raw);
    } catch {
      return fail(
        -1,
        "Unreadable course (invalid JSON)",
        "Cours illisible (JSON invalide)",
      );
    }
  }
  if (!isObj(x))
    return fail(-1, "This is not a course", "Ce n’est pas un cours");
  let c: Raw;
  try {
    c = structuredClone(x);
  } catch {
    return fail(
      -1,
      "This is not a course (not plain data)",
      "Ce n’est pas un cours (données non simples)",
    );
  }
  if (c.format !== undefined && c.format !== COURSE_FORMAT)
    return fail(
      -1,
      "This is not a course (format)",
      "Ce n’est pas un cours (format)",
    );
  if (c.format === undefined && !Array.isArray(c.steps))
    return fail(-1, "This is not a course", "Ce n’est pas un cours");
  const from = typeof c.version === "number" ? c.version : 0;
  if (!Number.isInteger(from) || from < 0)
    return fail(from, "Unknown course version", "Version de cours inconnue");
  if (from > CURRENT_VERSION)
    return fail(
      from,
      "Course made by a newer version of the simulator: update it to open this course",
      "Cours créé par une version plus récente du simulateur : mettez-le à jour pour l’ouvrir",
    );
  for (let v = from; v < CURRENT_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m)
      return fail(
        from,
        `No migration from version ${v}`,
        `Aucune migration depuis la version ${v}`,
      );
    c = m(c, changes);
  }
  invariants(c, changes);
  return { value: c as unknown as Course, from, changes, issues: [] };
}

/** A .ifrcourse file (already decompressed and parsed) to the current version. */
export function migrateCourseFile(raw: unknown): MigrateResult<CourseFile> {
  let x: unknown = raw;
  if (typeof raw === "string") {
    try {
      x = JSON.parse(raw);
    } catch {
      return {
        value: null,
        from: -1,
        changes: [],
        issues: [
          {
            en: "Unreadable file (invalid JSON)",
            fr: "Fichier illisible (JSON invalide)",
          },
        ],
      };
    }
  }
  if (!isObj(x))
    return {
      value: null,
      from: -1,
      changes: [],
      issues: [
        {
          en: "This is not a course file",
          fr: "Ce n’est pas un fichier de cours",
        },
      ],
    };
  // a bare course saved as a file is accepted too
  if (
    x.format === COURSE_FORMAT ||
    (x.format === undefined && Array.isArray(x.steps))
  ) {
    const m = migrate(x);
    return {
      value: m.value
        ? { format: FILE_FORMAT, version: 1, course: m.value, assets: {} }
        : null,
      from: m.from,
      changes: m.changes,
      issues: m.issues,
    };
  }
  if (x.format !== FILE_FORMAT)
    return {
      value: null,
      from: -1,
      changes: [],
      issues: [
        {
          en: "This is not a course file",
          fr: "Ce n’est pas un fichier de cours",
        },
      ],
    };
  if (typeof x.version !== "number" || x.version > 1)
    return {
      value: null,
      from: Number(x.version) || -1,
      changes: [],
      issues: [
        {
          en: "File made by a newer version of the simulator: update it",
          fr: "Fichier créé par une version plus récente du simulateur : mettez-le à jour",
        },
      ],
    };
  const m = migrate(x.course);
  const assets: CourseFile["assets"] = {};
  if (isObj(x.assets))
    for (const [k, v] of Object.entries(x.assets))
      if (isObj(v) && typeof v.mime === "string" && typeof v.b64 === "string")
        assets[k] = { mime: v.mime, b64: v.b64 };
  return {
    value: m.value
      ? { format: FILE_FORMAT, version: 1, course: m.value, assets }
      : null,
    from: m.from,
    changes: m.changes,
    issues: m.issues,
  };
}
