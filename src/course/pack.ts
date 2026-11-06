// Ground school — sharing courses (SPEC §9.2 pack.ts, §9.7).
//
//   .ifrcourse file   gzip(JSON(CourseFile)) with the images as base64 (import also accepts plain JSON and a bare
//                     Course). exportCourse(store, id) / readCourseFile(blob) / importCourseFiles(store, files, policy)
//   conflict policies 'newer' (default) | 'replace' | 'keep' | 'copy', the same rules as procedureStore.importPack:
//                     identical courses (same content hash) are skipped, invalid ones skipped with the reason
//   club pack         the procedures club pack (procedureStore ClubPack v1) gains, additively, `courses?: CourseFile[]`
//                     → clubPackCourses(pack) / withCourses(pack, files)
//   share codes       academy.html#c=C1.<base64url(deflate-raw(JSON(Course)))>  text-only courses, ≤ 8 KB
//                     index.html?scene=S1.<base64url(deflate-raw(JSON(SimScene)))>  one scene, QR-able
//                     (C0. / S0. = the same without compression, where CompressionStream is missing)
//
// Imported images are checked: the type must be one we display, the bytes must match their sha-256 id (else they are
// re-keyed and the course references rewritten), SVG with scripts or event handlers is refused, and an optional
// re-encoder (course/imageImport.ts) can normalise them.
import type {
  AssetId,
  AssetRef,
  Course,
  CourseFile,
  L10n,
  Lang,
  SimScene,
} from "./types";
import { migrate, migrateCourseFile } from "./migrate";
import {
  courseHash,
  isStructurallyValid,
  validateCourse,
  type CourseIssue,
} from "./validate";
import type { CourseStore } from "./store";

export const FILE_EXT = ".ifrcourse";
export const FILE_MIME = "application/x-ifrcourse";
/** share links: text-only courses up to about 8 KB deflated (SPEC §9.7) */
export const SHARE_MAX_BYTES = 8 * 1024;
/** a QR code holds about 2.9 KB */
export const QR_MAX_BYTES = 2900;
/** largest image accepted in a file */
export const ASSET_MAX_BYTES = 15 * 1024 * 1024;
const MIMES = new Set<AssetRef["mime"]>([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);
const L = (en: string, fr: string): L10n => ({ en, fr });
const tr = (l: L10n, lang: Lang) => (lang === "fr" ? (l.fr ?? l.en) : l.en);

// ------------------------------------------------------------------ bytes, base64, compression
export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const toB64url = (b64: string) =>
  b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return b + "===".slice((b.length + 3) % 4);
};

const hasStreams = () =>
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";
async function pipe(
  bytes: Uint8Array,
  t: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(t as unknown as TransformStream<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function compress(
  bytes: Uint8Array,
  format: "gzip" | "deflate-raw",
): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream(format));
}
export async function decompress(
  bytes: Uint8Array,
  format: "gzip" | "deflate-raw",
): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream(format));
}
const isGzip = (b: Uint8Array) =>
  b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

// ------------------------------------------------------------------ .ifrcourse export
/** The file name a CFI sees: "holding-entries-timing-wind.ifrcourse" */
export function courseFileName(c: Course): string {
  const base = c.title.en
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || c.id}${FILE_EXT}`;
}

/** Bundle a course and its images. `missing`: assets the course names that the store does not hold. */
export async function buildCourseFile(
  course: Course,
  getBlob: (id: AssetId) => Promise<Blob | null>,
): Promise<{ file: CourseFile; missing: AssetId[] }> {
  const assets: CourseFile["assets"] = {};
  const missing: AssetId[] = [];
  for (const [id, ref] of Object.entries(course.assets)) {
    const b = await getBlob(id);
    if (!b) {
      missing.push(id);
      continue;
    }
    assets[id] = {
      mime: b.type || ref.mime,
      b64: bytesToB64(new Uint8Array(await b.arrayBuffer())),
    };
  }
  return {
    file: {
      format: "ifr-course-file",
      version: 1,
      course: structuredClone(course),
      assets,
    },
    missing,
  };
}
/** gzip(JSON) — plain JSON where CompressionStream is missing (import reads both) */
export async function encodeCourseFile(file: CourseFile): Promise<Blob> {
  const json = new TextEncoder().encode(JSON.stringify(file));
  if (!hasStreams()) return new Blob([json], { type: "application/json" });
  return new Blob([(await compress(json, "gzip")) as Uint8Array<ArrayBuffer>], {
    type: FILE_MIME,
  });
}
export interface ExportResult {
  blob: Blob;
  filename: string;
  bytes: number;
  missing: AssetId[];
}
/** Library → Export: the .ifrcourse blob, its name, and the export date recorded (the 7-day badge). */
export async function exportCourse(
  store: CourseStore,
  id: string,
): Promise<ExportResult | null> {
  const c = await store.get(id);
  if (!c) return null;
  const { file, missing } = await buildCourseFile(c, (a) => store.getAsset(a));
  const blob = await encodeCourseFile(file);
  store.markExported(id);
  return { blob, filename: courseFileName(c), bytes: blob.size, missing };
}
/** the size meter: course text + images (bytes, before gzip; images barely compress) */
export function fileSizeEstimate(course: Course, assetBytes?: number): number {
  const text = new TextEncoder().encode(JSON.stringify(course)).length;
  const img =
    assetBytes ??
    Object.values(course.assets).reduce((a, r) => a + (r.bytes || 0), 0);
  return text + Math.ceil((img * 4) / 3);
}

// ------------------------------------------------------------------ .ifrcourse import
export interface ReadResult {
  file: CourseFile | null;
  issues: L10n[];
  changes: string[];
}
/** Read a .ifrcourse (gzip or plain JSON), a bare course JSON, or text. Never throws. */
export async function readCourseFile(
  input: Blob | ArrayBuffer | Uint8Array | string,
): Promise<ReadResult> {
  try {
    let text: string;
    if (typeof input === "string") text = input;
    else {
      let bytes =
        input instanceof Uint8Array
          ? input
          : input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : new Uint8Array(await input.arrayBuffer());
      if (isGzip(bytes)) {
        if (!hasStreams())
          return {
            file: null,
            issues: [
              L(
                "This browser cannot open compressed course files",
                "Ce navigateur ne peut pas ouvrir les fichiers de cours compressés",
              ),
            ],
            changes: [],
          };
        bytes = await decompress(bytes, "gzip");
      }
      text = new TextDecoder().decode(bytes);
    }
    const m = migrateCourseFile(text);
    return { file: m.value, issues: m.issues, changes: m.changes };
  } catch (e) {
    return {
      file: null,
      issues: [
        L(
          `Unreadable file (${(e as Error)?.message ?? e})`,
          `Fichier illisible (${(e as Error)?.message ?? e})`,
        ),
      ],
      changes: [],
    };
  }
}

/** SVG that could run code when inlined (an <img> would not run it, but a file is never trusted) */
export function unsafeSvg(text: string): boolean {
  return /<script[\s>]|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object/i.test(
    text,
  );
}

export interface ImportOptions {
  lang?: Lang;
  /** re-encode an imported image (course/imageImport.ts); the result is re-keyed by its sha-256 */
  reencode?: (blob: Blob, ref: AssetRef) => Promise<Blob>;
}
export type ConflictPolicy = "newer" | "replace" | "keep" | "copy";
export interface ImportReport {
  added: string[];
  replaced: string[];
  /** id → reason (invalid, unchanged, older, kept) */
  skipped: { id: string; reason: string }[];
  renamed: { from: string; to: string }[];
  issues: string[];
  /** validation issues of each imported course (content errors are imported and shown in the checks panel) */
  courseIssues: Record<string, CourseIssue[]>;
  /** images stored */
  assets: number;
}
const emptyReport = (): ImportReport => ({
  added: [],
  replaced: [],
  skipped: [],
  renamed: [],
  issues: [],
  courseIssues: {},
  assets: 0,
});

/** rewrite asset ids inside a course (re-keyed images) */
function rekey(course: Course, map: Map<string, string>): Course {
  if (!map.size) return course;
  const json = JSON.stringify(course, (_k, v) =>
    typeof v === "string" && map.has(v) ? map.get(v) : v,
  );
  const c = JSON.parse(json) as Course;
  const assets: Course["assets"] = {};
  for (const [id, ref] of Object.entries(c.assets))
    assets[map.get(id) ?? id] = { ...ref, id: map.get(id) ?? id };
  c.assets = assets;
  return c;
}

/** store a file's images; returns the course with any re-keyed ids, or issues */
async function storeAssets(
  store: CourseStore,
  file: CourseFile,
  opts: ImportOptions,
  rep: ImportReport,
): Promise<Course> {
  const lang = opts.lang ?? "en";
  const map = new Map<string, string>();
  const course = file.course;
  for (const [id, a] of Object.entries(file.assets)) {
    const ref = course.assets[id];
    if (!ref) continue; // bytes nobody uses
    const mime = a.mime as AssetRef["mime"];
    if (!MIMES.has(mime)) {
      rep.issues.push(
        tr(
          L(
            `Image ${id.slice(0, 8)} skipped: unsupported type ${a.mime}`,
            `Image ${id.slice(0, 8)} ignorée : type ${a.mime} non pris en charge`,
          ),
          lang,
        ),
      );
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = b64ToBytes(a.b64);
    } catch {
      rep.issues.push(
        tr(
          L(
            `Image ${id.slice(0, 8)} skipped: damaged data`,
            `Image ${id.slice(0, 8)} ignorée : données abîmées`,
          ),
          lang,
        ),
      );
      continue;
    }
    if (bytes.length > ASSET_MAX_BYTES) {
      rep.issues.push(
        tr(
          L(
            `Image ${id.slice(0, 8)} skipped: over 15 MB`,
            `Image ${id.slice(0, 8)} ignorée : plus de 15 Mo`,
          ),
          lang,
        ),
      );
      continue;
    }
    if (
      mime === "image/svg+xml" &&
      unsafeSvg(new TextDecoder().decode(bytes))
    ) {
      rep.issues.push(
        tr(
          L(
            `Image ${id.slice(0, 8)} refused: the SVG contains scripts`,
            `Image ${id.slice(0, 8)} refusée : le SVG contient des scripts`,
          ),
          lang,
        ),
      );
      continue;
    }
    let blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
    if (opts.reencode) {
      try {
        blob = await opts.reencode(blob, ref);
      } catch {
        /* keep the original bytes */
      }
    }
    const stored = await store.putAsset(blob, {
      w: ref.w,
      h: ref.h,
      role: ref.role,
      source: ref.source,
      alt: ref.alt,
      mime: (blob.type || mime) as AssetRef["mime"],
    });
    rep.assets++;
    if (stored.id !== id) map.set(id, stored.id);
    course.assets[id] = { ...ref, bytes: stored.bytes, mime: stored.mime };
  }
  return rekey(course, map);
}

const sameContent = async (a: Course, b: Course) =>
  (a.hash && b.hash ? a.hash === b.hash : false) ||
  (await courseHash(a)) === (await courseHash(b));

/**
 * Merge course files into the library, by course id. Conflicts (same id already stored):
 *   'newer' (default) replace only when the incoming one was updated later; 'replace' always; 'keep' never;
 *   'copy' import under a new id. Identical courses are skipped. Unusable ones are skipped with the reason.
 */
export async function importCourseFiles(
  store: CourseStore,
  files: CourseFile[],
  policy: ConflictPolicy = "newer",
  opts: ImportOptions = {},
): Promise<ImportReport> {
  const lang = opts.lang ?? "en";
  const rep = emptyReport();
  for (const raw of files) {
    const mf = migrateCourseFile(raw);
    if (!mf.value) {
      rep.skipped.push({
        id: (raw as { course?: { id?: string } })?.course?.id ?? "?",
        reason: tr(
          mf.issues[0] ?? L("unreadable course", "cours illisible"),
          lang,
        ),
      });
      continue;
    }
    const file = mf.value;
    const pre = validateCourse(file.course);
    if (!isStructurallyValid(pre)) {
      const e = pre.find((i) => i.level === "error")!;
      rep.skipped.push({
        id: String(file.course.id ?? "?"),
        reason: tr(e.message, lang),
      });
      continue;
    }
    const cur = await store.get(file.course.id);
    let incoming = file.course;
    if (cur) {
      if (await sameContent(cur, incoming)) {
        rep.skipped.push({
          id: incoming.id,
          reason: tr(L("already up to date", "déjà à jour"), lang),
        });
        continue;
      }
      const newer = !cur.updated || incoming.updated > cur.updated;
      if (policy === "keep" || (policy === "newer" && !newer)) {
        rep.skipped.push({
          id: incoming.id,
          reason: tr(
            policy === "keep"
              ? L("local version kept", "version locale conservée")
              : L("local version is newer", "version locale plus récente"),
            lang,
          ),
        });
        continue;
      }
      if (policy === "copy") {
        const to = await store.freeId(incoming.id);
        rep.renamed.push({ from: incoming.id, to });
        incoming = { ...incoming, id: to };
      }
    }
    incoming = await storeAssets(
      store,
      { ...file, course: incoming },
      opts,
      rep,
    );
    const r = await store.save(incoming, { keepRev: true });
    if (!r.ok) {
      rep.skipped.push({ id: incoming.id, reason: tr(r.message, lang) });
      continue;
    }
    rep.courseIssues[incoming.id] = r.issues;
    if (!cur) rep.added.push(incoming.id);
    else if (policy !== "copy") rep.replaced.push(incoming.id);
  }
  return rep;
}

/** Import → a file chosen by the CFI (.ifrcourse, plain JSON, or a club pack holding courses). */
export async function importCourseBlob(
  store: CourseStore,
  input: Blob | ArrayBuffer | Uint8Array | string,
  policy: ConflictPolicy = "newer",
  opts: ImportOptions = {},
): Promise<ImportReport> {
  // a club pack is plain JSON with `courses`
  if (typeof input === "string" || input instanceof Blob) {
    try {
      const text = typeof input === "string" ? input : await peekText(input);
      if (text) {
        const o = JSON.parse(text) as unknown;
        const files = clubPackCourses(o);
        if (
          files.length ||
          (o as { format?: string })?.format === "ifr-club-pack"
        )
          return importCourseFiles(store, files, policy, opts);
      }
    } catch {
      /* not JSON: a gzip file */
    }
  }
  const r = await readCourseFile(input);
  if (!r.file)
    return {
      ...emptyReport(),
      issues: r.issues.map((i) => tr(i, opts.lang ?? "en")),
    };
  return importCourseFiles(store, [r.file], policy, opts);
}
async function peekText(b: Blob): Promise<string | null> {
  const head = new Uint8Array(await b.slice(0, 2).arrayBuffer());
  if (isGzip(head)) return null;
  return b.text();
}

// ------------------------------------------------------------------ club pack adapter
/** the courses a club pack carries (procedureStore ClubPack + `courses?: CourseFile[]`) */
export function clubPackCourses(pack: unknown): CourseFile[] {
  const p = pack as { format?: string; courses?: unknown } | null;
  if (
    !p ||
    typeof p !== "object" ||
    p.format !== "ifr-club-pack" ||
    !Array.isArray(p.courses)
  )
    return [];
  return p.courses
    .map((c) => migrateCourseFile(c).value)
    .filter((c): c is CourseFile => !!c);
}
/** a club pack with these courses added (replacing the same ids) */
export function withCourses<T extends object>(
  pack: T,
  files: CourseFile[],
): T & { courses: CourseFile[] } {
  const prev = ((pack as { courses?: CourseFile[] }).courses ?? []).filter(
    (f) => !files.some((n) => n.course.id === f.course.id),
  );
  return { ...pack, courses: [...prev, ...files] };
}
/** export the given courses for a club pack */
export async function courseFilesFor(
  store: CourseStore,
  ids: string[],
): Promise<CourseFile[]> {
  const out: CourseFile[] = [];
  for (const id of ids) {
    const c = await store.get(id);
    if (c) out.push((await buildCourseFile(c, (a) => store.getAsset(a))).file);
  }
  return out;
}

// ------------------------------------------------------------------ share codes
async function packCode(prefix: "C" | "S", value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  if (!hasStreams()) return `${prefix}0.${toB64url(bytesToB64(json))}`;
  return `${prefix}1.${toB64url(bytesToB64(await compress(json, "deflate-raw")))}`;
}
async function unpackCode(
  prefix: "C" | "S",
  code: string,
): Promise<unknown | null> {
  const m = new RegExp(`^${prefix}([01])\\.([A-Za-z0-9_-]+)$`).exec(
    code.trim(),
  );
  if (!m) return null;
  try {
    let bytes = b64ToBytes(fromB64url(m[2]));
    if (m[1] === "1") {
      if (!hasStreams()) return null;
      bytes = await decompress(bytes, "deflate-raw");
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** does the course show images the link cannot carry? (asset bytes never travel in a link) */
export function courseHasImages(c: Course): boolean {
  return Object.values(c.assets).some(
    (a) => a.role !== "thumb" && a.role !== "still",
  );
}
export interface CourseShare {
  code: string;
  /** characters of the code */
  bytes: number;
  /** short enough for a link (≤ 8 KB) and the course has no images */
  fits: boolean;
  /** why it does not fit */
  reason?: "images" | "size";
}
/** C1 share code of a text-only course (thumbs and stills of scenes are dropped: they are images) */
export async function encodeCourseShare(course: Course): Promise<CourseShare> {
  const c = structuredClone(course);
  const assets: Course["assets"] = {};
  for (const [id, a] of Object.entries(c.assets))
    if (a.role !== "thumb" && a.role !== "still") assets[id] = a;
  c.assets = assets;
  for (const s of Object.values(c.scenes))
    if (s.captured) {
      delete s.captured.thumb;
      delete s.captured.still;
    }
  delete c.hash;
  const code = await packCode("C", c);
  const images = courseHasImages(c);
  const fits = !images && code.length <= SHARE_MAX_BYTES;
  return {
    code,
    bytes: code.length,
    fits,
    ...(fits ? {} : { reason: images ? "images" : "size" }),
  };
}
/** decode a C1 code or a link holding #c= (migrated; null when it is not a course) */
export async function decodeCourseShare(
  codeOrUrl: string,
): Promise<Course | null> {
  const code = shareCodeFromUrl(codeOrUrl)?.code ?? codeOrUrl.trim();
  const v = await unpackCode("C", code);
  if (!v) return null;
  const m = migrate(v);
  if (!m.value || !isStructurallyValid(validateCourse(m.value))) return null;
  return m.value;
}
export async function encodeSceneShare(
  scene: SimScene,
): Promise<{ code: string; bytes: number; qr: boolean }> {
  const s = structuredClone(scene);
  if (s.captured) {
    delete s.captured.thumb;
    delete s.captured.still;
  }
  const code = await packCode("S", s);
  return { code, bytes: code.length, qr: code.length <= QR_MAX_BYTES };
}
export async function decodeSceneShare(
  codeOrUrl: string,
): Promise<SimScene | null> {
  const code = shareCodeFromUrl(codeOrUrl)?.code ?? codeOrUrl.trim();
  const v = (await unpackCode("S", code)) as SimScene | null;
  if (
    !v ||
    typeof v !== "object" ||
    v.v !== 1 ||
    typeof v.id !== "string" ||
    !v.pose ||
    typeof v.seed !== "number" ||
    typeof v.weather !== "object"
  )
    return null;
  return v;
}
/** academy.html#c=<code> */
export function courseShareLink(code: string, page = "academy.html"): string {
  return `${page}#c=${code}`;
}
/** index.html?scene=<code> */
export function sceneLink(code: string, page = "index.html"): string {
  return `${page}${page.includes("?") ? "&" : "?"}scene=${code}`;
}
/** the share code inside a link (#c= / ?c= course, ?scene= / #scene= scene), else null */
export function shareCodeFromUrl(
  url: string,
): { kind: "course" | "scene"; code: string } | null {
  const c = /[?#&]c=(C[01]\.[A-Za-z0-9_-]+)/.exec(url);
  if (c) return { kind: "course", code: c[1] };
  const s = /[?#&]scene=(S[01]\.[A-Za-z0-9_-]+)/.exec(url);
  if (s) return { kind: "scene", code: s[1] };
  return null;
}
/** Import a course from a share link with the same conflict policy as files. */
export async function importCourseShare(
  store: CourseStore,
  codeOrUrl: string,
  policy: ConflictPolicy = "newer",
  opts: ImportOptions = {},
): Promise<ImportReport> {
  const c = await decodeCourseShare(codeOrUrl);
  if (!c)
    return {
      ...emptyReport(),
      issues: [
        tr(
          L("Invalid course link", "Lien de cours invalide"),
          opts.lang ?? "en",
        ),
      ],
    };
  return importCourseFiles(
    store,
    [{ format: "ifr-course-file", version: 1, course: c, assets: {} }],
    policy,
    opts,
  );
}
