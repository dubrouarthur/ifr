// Is the situation a slide shows still the template's example? A new course starts from a template whose slides fly
// at the training airfield (« ILS 27 de PARD »), whatever the title says (« Le tour de piste à Lognes »). The
// Simulateur panel says « Situation d'exemple » for those, so the author knows to set their own (AUDIT item 47).
// Pure: a scene is an example when the slide has none (the demo pose), or when it is byte-for-byte one that a
// template, a gallery slide or a starter deck adds (changed by the author, captured or posed: it is theirs).
import type { Course, SimScene } from "../types";
import { exampleScenes } from "../canvas/examples";
import { galleryScenes } from "../samples/exampleSlides";
import { showcaseScenes } from "../samples/showcaseDecks";
import { DECK_STARTERS } from "./deckStarters";
import { PRACTICE_SCENES, starterScene } from "./templates";

let known: Map<string, string[]> | null = null;
/** a scene as JSON, without the time it was built (built-in scenes stamp « captured.at » when they are made) */
const key = (sc: SimScene): string =>
  JSON.stringify(sc, (k, v) => (k === "at" && typeof v === "string" ? undefined : v));
/** every built-in scene, as JSON, by id (built once) */
function builtIns(): Map<string, string[]> {
  if (known) return known;
  const m = new Map<string, string[]>();
  const add = (id: string, sc: SimScene) => {
    const list = m.get(id) ?? [];
    list.push(key(sc));
    m.set(id, list);
  };
  const sources: (() => Record<string, SimScene>)[] = [
    exampleScenes,
    galleryScenes,
    showcaseScenes,
    ...DECK_STARTERS.map((d) => d.scenes ?? (() => ({}))),
  ];
  for (const src of sources) {
    try {
      for (const [id, sc] of Object.entries(src())) add(id, sc);
    } catch {
      /* a source that cannot build here is not an example */
    }
  }
  for (const ck of ["g1000", "steam", "airliner"] as const) {
    add("sc-start", starterScene(ck));
    // the practice situations a layout's « À vous » starts from
    for (const [id, p] of Object.entries(PRACTICE_SCENES)) add(id, p.make(ck, id));
  }
  known = m;
  return m;
}

/** True when the slide shows no scene of its own (sceneId undefined) or an unchanged built-in example scene. */
export function isExampleSituation(course: Pick<Course, "scenes">, sceneId: string | undefined): boolean {
  if (!sceneId) return true;
  const sc = course.scenes[sceneId];
  if (!sc) return true;
  const list = builtIns().get(sceneId);
  if (!list) return false;
  return list.includes(key(sc));
}
