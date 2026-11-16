// Share links: keep a course made from a template short enough for a link.
//
// A course started from a template carries the template's slides, most of them untouched. The link names those
// untouched blocks by a hash of their content instead of carrying them, and leaves out the slide's linear text
// (screen readers, handout) when it is the one the slide itself gives. Opening the link rebuilds both from the app's
// own copy of the templates. A block the app no longer knows (an older or newer template) is dropped with its hash,
// never guessed.
import type { Course, SlideBlock, Step, ThemeId } from "./types";

/** the key of a block named by its content hash, and of a step whose linear text is the slide's own */
export const BLOCK_REF = "$b";
export const READER_OWN = "$r";

/** cyrb53: a 53-bit string hash, base 36 (collisions are out of reach for a few hundred template blocks) */
export function contentHash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/** a block's content without its own id (template blocks get fresh ids in each course) */
const bodyOf = (b: SlideBlock): string => {
  const { id: _id, ...rest } = b;
  return JSON.stringify(rest);
};

let registry: Promise<Map<string, Omit<SlideBlock, "id">>> | null = null;
/** every block the templates make (both themes, the way a new course makes them), by content hash */
export function templateBlocks(): Promise<Map<string, Omit<SlideBlock, "id">>> {
  registry ??= (async () => {
    const { DECK_STARTERS, BLANK_STARTER, addStarterDeck, starterSlide } =
      await import("./ui/deckStarters");
    const out = new Map<string, Omit<SlideBlock, "id">>();
    const add = (b: SlideBlock) => {
      const body = bodyOf(b);
      out.set(contentHash(body), JSON.parse(body) as Omit<SlideBlock, "id">);
    };
    const base: Course = {
      format: "ifr-course",
      version: 1,
      id: "x",
      rev: 0,
      updated: "",
      title: { en: "" },
      author: { name: "" },
      langs: ["en", "fr"],
      cockpit: "g1000",
      world: { kind: "training" },
      steps: [],
      scenes: {},
      clips: {},
      assets: {},
    };
    const themes: (ThemeId | undefined)[] = [undefined, "classroom", "cockpit"];
    for (const d of [...DECK_STARTERS, BLANK_STARTER]) {
      for (const theme of themes) {
        const r = addStarterDeck(base, d, theme ? { theme } : {});
        for (const s of r.course.steps)
          for (const b of s.slide?.blocks ?? []) add(b);
        if (theme)
          d.slides.forEach((_, i) =>
            starterSlide(d, i, theme).blocks.forEach(add),
          );
      }
    }
    return out;
  })();
  return registry;
}

/** The course as a link carries it: template blocks by hash, the slide's own linear text left out. */
export async function slimForLink(c: Course): Promise<Course> {
  const reg = await templateBlocks();
  const { linearText } = await import("./ui/templates");
  const steps = c.steps.map((s): Step => {
    if (!s.slide) return s;
    const own =
      s.reader &&
      JSON.stringify(s.reader) === JSON.stringify(linearText(s.slide));
    const blocks = s.slide.blocks.map((b) => {
      const h = contentHash(bodyOf(b));
      return reg.has(h)
        ? ({ id: b.id, [BLOCK_REF]: h } as unknown as SlideBlock)
        : b;
    });
    const out: Record<string, unknown> = { ...s, slide: { ...s.slide, blocks } };
    if (own) {
      delete out.reader;
      out[READER_OWN] = 1;
    }
    return out as unknown as Step;
  });
  return { ...c, steps };
}

/** Undo slimForLink on a decoded link (any JSON: it is checked by the course validator afterwards). */
export async function fattenFromLink(v: unknown): Promise<unknown> {
  if (!v || typeof v !== "object") return v;
  const o = v as { steps?: unknown };
  if (!Array.isArray(o.steps)) return v;
  const json = JSON.stringify(o.steps);
  if (!json.includes(`"${BLOCK_REF}"`) && !json.includes(`"${READER_OWN}"`))
    return v;
  const reg = await templateBlocks();
  const { linearText } = await import("./ui/templates");
  const steps = o.steps.map((s) => {
    if (!s || typeof s !== "object") return s;
    const st = s as Record<string, unknown> & {
      slide?: { blocks?: unknown[] };
    };
    if (st.slide && Array.isArray(st.slide.blocks)) {
      const blocks: unknown[] = [];
      for (const b of st.slide.blocks) {
        const ref =
          b && typeof b === "object"
            ? (b as Record<string, unknown>)[BLOCK_REF]
            : undefined;
        if (typeof ref !== "string") {
          blocks.push(b);
          continue;
        }
        const body = reg.get(ref);
        if (body)
          blocks.push({
            ...structuredClone(body),
            id: (b as { id?: unknown }).id,
          });
      }
      st.slide = { ...st.slide, blocks };
    }
    if (st[READER_OWN]) {
      delete st[READER_OWN];
      if (st.slide) st.reader = linearText(st.slide as Step["slide"] & object);
    }
    return st;
  });
  return { ...(v as object), steps };
}
