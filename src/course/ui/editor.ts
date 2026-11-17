// Ground school editor (package F, SPEC §5, mockup final/editor.png): ONE builder for courses, briefings and
// designed slides. academy.html#edit=<courseId> hosts it (openCourseEditor).
//   top bar   back · course title (settings) · "12 steps · about 24 min · EN + FR · saved on this iPad" · Fly to
//             capture (C) · Checks · Preview · Present · Share
//   left      the tray of cockpit captures (one tap → a step), the step list (thumbnail, kind chip, title; drag to
//             reorder), + Add (templates named by teaching intent, layouts for designed slides), the pacing advisory
//   centre    Reader + Stage steps: the real player in a device frame (iPad / Projector / Phone), EN / FR with the
//             missing count, the reveal position. Designed slides: edited in place on the canvas surface, with the
//             block toolbar (Text, Image, Shape, Arrow, Callout, Marker, Diagram, Instrument, Sim view, Quiz, Calc),
//             the layout and theme pickers and the asset library. The step bar: Step n of N · reveals · minutes,
//             Duplicate (D), Move (Alt+↑/↓), More (change kind, convert slide ↔ Reader + Stage, delete), Test as
//             student (T).
//   right     the inspector (inspector.ts)
// Every change is one undo step on the course (⌘Z / ⇧⌘Z) and autosaves to IndexedDB (500 ms), never alert().
import { cockpitBridgeReady } from "../cockpitLink";
import { yourTurnSlideRenderer } from "./slideTurn";
import type {
  AssetId,
  AssetRef,
  Course,
  Lang,
  SimScene,
  SlideBlock,
  SlideCanvas,
  Step,
} from "../types";
import type { CourseStore, TrayItem } from "../store";
import { storageNotice } from "../store";
import { isQuotaError } from "../../lib/idb";
import { h } from "../../ui/dom";
import { CoursePlayer } from "./player";
import { KINDS, kindLabel } from "./reader";
import { CanvasEditor } from "../canvas/editor";
import { SceneSims, rememberScene } from "../canvas/instruments";
import { renderThumb, type SlideView } from "../canvas/render";
import { baseThemeId, resolveTheme } from "../canvas/themes";
import { slideCrowded, tidySlide } from "../canvas/placement";
import {
  DEMO_SCENE_ID,
  demoScene,
  libraryItem,
  type BlockDraft,
} from "../canvas/factory";
import { addedWhere, slideIsBare } from "./newSlide";
import { compactScene, encodeScene } from "../scene";
import {
  blockSceneId,
  joinBlock,
  planSituation,
  repointSlide,
  sceneUsedElsewhere,
  sharedWith,
  simContentDraft,
  splitBlock,
  situationOfScene,
  sitLabel,
  type SimContentKind,
  type Situation,
} from "../situations";
import type { SitTarget, SituationHost } from "./situationEditor";

import {
  captureLink,
  markFlying,
  takeCaptureChoice,
  takeFlying,
} from "../captureHandoff";
import { momentLine, sceneRefusal } from "../captureMoment";
import type { EditorCommand } from "../canvas/editorCore";
import { paneFrame } from "../stage/geometry";
import { drawFrame, newInstrumentStates } from "../stage/views";
import { stageView, suggestGoals } from "../goals";
import {
  exportCourse,
  encodeCourseShare,
  courseShareLink,
  courseHasImages,
} from "../pack";
import {
  CourseHistory,
  TEMPLATES,
  changeKind,
  courseMinutes,
  courseMissingFr,
  duplicateStep,
  insertStep,
  linearText,
  makeStep,
  moveStep,
  removeStep,
  replaceStep,
  revealsOf,
  slideNameFromTitle,
  stepBarText,
  stepFromTray,
  toDesignedSlide,
  toReaderStage,
  tr,
  type TemplateId,
} from "./templates";
import {
  ChecksPanel,
  checksForStep,
  editorChecks,
  pacingRuns,
  type EditorCheck,
} from "./checksPanel";
import {
  Inspector,
  btn,
  layoutPicker,
  popover,
  closePop,
  seg,
  sw,
  t2,
  textIn,
  themePicker,
  type InspectorHost,
  type MenuItem,
  type StageInfo,
} from "./inspector";
import { TrayView } from "./tray";
import {
  RAIL_TABS,
  SLIDE_ONLY,
  StudioPanel,
  EMPTY_STARTS,
  EMPTY_STARTS_VFR,
  emptySlideCard,
  railIcon,
  railLabel,
  type RailTab,
} from "./studio";
import { AI_SPARK, openAiAdd } from "../ai/entry";
import {
  addStarterDeck,
  BLANK_STARTER,
  deckTitle,
  titleOnCover,
  type DeckStarter,
} from "./deckStarters";
import { exampleScenes } from "../canvas/examples";
import { showcaseScenes, startSlide } from "../samples/showcaseDecks";
import type { SlideLayoutId, ThemeId } from "../types";
import "../../styles/course-editor.css";
import "../../styles/course-studio.css";

export interface CourseEditorOptions {
  course: Course;
  store?: CourseStore | null;
  lang?: Lang;
  /** open on this step */
  stepId?: string;
  onExit?(): void;
  /** default: academy.html#present=<id> */
  onPresent?(courseId: string, stepId: string): void;
  /** default: index.html?capture=<id>&return=<this page> */
  onFlyToCapture?(courseId: string): void;
  onLang?(l: Lang): void;
  /** the selected step changed (the host keeps #edit=…&s= in sync) */
  onStep?(stepId: string): void;
  navigate?(url: string): void;
  /** the AIRAC of the loaded nav data (checks panel) */
  airac?: string;
  /** debounce of the autosave (ms, default 500) */
  saveMs?: number;
}
type Device = "ipad" | "projector" | "phone";
const DEVICE: Record<Device, { w: number; h: number; bezel: number }> = {
  ipad: { w: 1180, h: 820, bezel: 12 },
  projector: { w: 1280, h: 720, bezel: 6 },
  phone: { w: 390, h: 844, bezel: 12 },
};
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** The shortcut modifier as the platform writes it: ⌘ on Apple devices, Ctrl+ elsewhere. */
const modKey = () => (isMac ? "⌘" : "Ctrl+");
const isIpad = () =>
  typeof navigator !== "undefined" &&
  (/iPad/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** What the presenter does on a ready slide, in the console's own words (« Notes » of the presenter view). */
function defaultNotes(s: SlideCanvas): { en: string; fr: string } {
  const bs = s.blocks;
  const yt = bs.some((b) => !!(b as { yourTurn?: unknown }).yourTurn);
  const moving = bs.some((b) => b.kind === "instrument" && !!b.motion);
  const live = bs.some((b) => b.kind === "instrument" || b.kind === "simViewport");
  const quiz = bs.some((b) => b.kind === "quiz");
  const en: string[] = [];
  const fr: string[] = [];
  if (quiz) {
    en.push("Let the class answer first, then show the answer and say why.");
    fr.push("Laissez la classe répondre d’abord, puis montrez la réponse et dites pourquoi.");
  }
  if (moving) {
    en.push("The animation plays by itself; “Replay the animation” in the demonstration deck shows it again.");
    fr.push("L’animation se joue seule ; « Rejouer l’animation » dans la démonstration la remontre.");
  }
  if (live) {
    en.push("“Fly the demonstration”: heading, altitude and power by hand, the projection follows (try a standard-rate turn).");
    fr.push("« Piloter la démonstration » : cap, altitude et puissance à la main, la projection suit (essayez un virage standard).");
  }
  if (yt) {
    en.push("“Let a student fly here”: the goal on the slide says when it is done.");
    fr.push("« Faire piloter un élève ici » : l’objectif de la diapo dit quand c’est réussi.");
  }
  if (!en.length) {
    en.push("Say it in your words; the slide keeps the numbers.");
    fr.push("Dites-le avec vos mots ; la diapo garde les chiffres.");
  }
  return { en: en.join(" "), fr: fr.join(" ") };
}

/** Re-encode an imported image: WebP (JPEG where the browser cannot write WebP), longest side ≤ 1600 px. */
export async function encodeImage(
  file: Blob,
  max = 1600,
): Promise<{
  blob: Blob;
  w: number;
  h: number;
  mime: "image/webp" | "image/jpeg" | "image/png";
}> {
  let src: CanvasImageSource;
  let w0: number;
  let h0: number;
  let url: string | null = null;
  try {
    const bmp = await createImageBitmap(file);
    src = bmp;
    w0 = bmp.width;
    h0 = bmp.height;
  } catch {
    url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    src = img;
    w0 = img.naturalWidth;
    h0 = img.naturalHeight;
  }
  const k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k));
  const hh = Math.max(1, Math.round(h0 * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = hh;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, hh);
  if (url) URL.revokeObjectURL(url);
  const toBlob = (type: string, q?: number) =>
    new Promise<Blob | null>((res) => cv.toBlob(res, type, q));
  let blob = await toBlob("image/webp", 0.86);
  let mime: "image/webp" | "image/jpeg" | "image/png" = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    const png = file.type === "image/png" || file.type === "image/gif";
    blob = await toBlob(png ? "image/png" : "image/jpeg", 0.88);
    mime = png ? "image/png" : "image/jpeg";
  }
  if (!blob) throw new Error("encode failed");
  return { blob, w, h: hh, mime };
}

export class CourseEditor implements InspectorHost {
  readonly el: HTMLElement;
  course: Course;
  lang: Lang;
  private store: CourseStore | null;
  private history: CourseHistory;
  private i = 0;
  private device: Device = "ipad";
  private reveal: number | null = null;
  // dom
  private titleBtn!: HTMLButtonElement;
  private subEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private checksBtn!: HTMLButtonElement;
  /** the top bar's actions that need at least one step (disabled, with a reason, on an empty course) */
  private needSteps: HTMLButtonElement[] = [];
  private stepsEl!: HTMLElement;
  private adviceEl!: HTMLElement;
  private toolEl!: HTMLElement;
  private stageArea!: HTMLElement;
  private stepBar!: HTMLElement;
  private hintEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private liveEl!: HTMLElement;
  private tray: TrayView;
  private inspector: Inspector;
  // centre
  private player: CoursePlayer | null = null;
  private screen: HTMLElement | null = null;
  private deviceEl: HTMLElement | null = null;
  private canvasEd: CanvasEditor | null = null;
  private canvasFor = "";
  private studio!: StudioPanel;
  private railEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private stripEl!: HTMLElement;
  private emptyEl: HTMLElement | null = null;
  /** the reveal preview (Tout · Début · 1 · 2…) sits in the step bar, beside « n apparitions » */
  private revealHost = h("span", { class: "ce-sb-reveal" });
  private emptyKill: (() => void) | null = null;
  /** slides whose author chose « Partir d’une diapo vide » (the first-run card stays away) */
  private emptyBlank = new Set<string>();
  /** a « Nouvelle diapo » with nothing chosen yet: Échap or another slide takes it away (newSlide.ts) */
  private pendingNew: { id: string; prev: number; depth: number } | null = null;
  private startEl: { destroy(): void } | null = null;
  private inspOpen = true;
  private zoom = 1;
  private sel: SlideBlock[] = [];
  private ro: ResizeObserver | null = null;
  // state
  private sims: SceneSims;
  private simsKey = "";
  private thumbs = new Map<
    string,
    { key: string; el: HTMLElement; view?: SlideView }
  >();
  private thumbQueue: (() => void)[] = [];
  private thumbTimer = 0;
  private stripRedraw = false;
  private urls = new Map<string, string>();
  private checks: EditorCheck[] = [];
  private checksTimer = 0;
  private saveTimer = 0;
  private previewTimer = 0;
  private changeNo = 0;
  private savedRev = 0;
  private saving: "idle" | "pending" | "saving" | "saved" | "error" | "memory" =
    "idle";
  private testEl: HTMLElement | null = null;
  private testPlayer: CoursePlayer | null = null;
  private toastTimer = 0;
  private drag: {
    from: number;
    to: number;
    y0: number;
    id: number;
    started: boolean;
    timer: number;
    row: HTMLElement;
  } | null = null;
  private destroyed = false;

  constructor(private o: CourseEditorOptions) {
    this.course = clone(o.course);
    this.lang = o.lang ?? "en";
    this.store = o.store ?? null;
    this.savedRev = this.course.rev;
    this.history = CourseHistory.of(this.course);
    const at = o.stepId
      ? this.course.steps.findIndex((s) => s.id === o.stepId)
      : -1;
    this.i = Math.max(0, at);
    this.sims = this.makeSims();
    this.el = h("div", { class: "ce-app", lang: this.lang, tabindex: "-1" });
    this.tray = new TrayView({
      lang: this.lang,
      store: this.store,
      courseId: this.course.id,
      onAdd: (it, t) => void this.addFromTray(it, t),
      onUse: (it) => this.useCapture(it),
      onView: (it) => this.addCaptureView(it),
      onCount: () => this.renderRail(),
      onFlyToCapture: () => void this.flyFrom(this.step?.slide ? this.situations.read().scene : undefined),
      assetUrl: (id) => this.assetUrl(id),
    });
    this.inspector = new Inspector(this);
    this.build();
    if (this.store && this.store.backend === "memory") this.saving = "memory";
    this.renderAll();
    this.backFromCockpit();
    this.el.addEventListener("keydown", (e) => this.onKeyCapture(e), true);
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    this.el.addEventListener("paste", (e) => this.onPaste(e));
    window.addEventListener("beforeunload", this.onUnload);
  }

  // ================================================================ InspectorHost
  get step(): Step {
    return this.course.steps[this.i];
  }
  get selection(): SlideBlock[] {
    return this.sel;
  }
  setStep(s: Step, key?: string, render = false) {
    this.apply(
      replaceStep(this.course, s),
      key ? `${s.id}.${key}` : undefined,
      { inspector: render },
    );
  }
  setCourse(c: Course, key?: string, render = false) {
    this.apply(c, key, { inspector: render });
  }
  setSlide(c: SlideCanvas, key?: string) {
    if (this.canvasEd) this.canvasEd.set(c, key);
    else this.setStep({ ...this.step, slide: c }, key);
  }
  selectBlocks(ids: string[]) {
    this.canvasEd?.select(ids);
  }
  runCanvas(cmd: EditorCommand) {
    this.canvasEd?.run(cmd);
  }
  stageInfo(sceneId: string | undefined): StageInfo | null {
    if (!sceneId || !this.course.scenes[sceneId]) return null;
    this.ensureSims();
    const e = this.sims.get(sceneId);
    return e ? { sim: e.sim, scene: e.scene, diffs: e.diffs } : null;
  }

  // ================================================================ « Situation de vol » (ui/situationEditor.ts)
  /** true while a situation edit points the slide at its new scene: the inspector (and the slider held) stays */
  private sitBusy = false;
  /** What the studio's situation form needs: read what an element shows, write it back (live while a slider
   *  moves), give an element its own situation, open the cockpit from it. */
  get situations(): SituationHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ed = this;
    return {
      get canFly() {
        return ed.captureReady;
      },
      read: (blockId) => {
        const s = ed.step;
        const slide = s?.slide;
        const { id, own } = slide ? blockSceneId(slide, blockId) : { id: undefined, own: false };
        const have = id ? ed.course.scenes[id] : undefined;
        return {
          scene: have ?? demoScene(ed.course.cockpit),
          sceneId: have ? id : undefined,
          own,
          shared: slide ? sharedWith(slide, blockId) : 0,
          elsewhere: !!have && !!s && sceneUsedElsewhere(ed.course, id!, s.id),
        };
      },
      readScene: (sceneId) => {
        const have = sceneId ? ed.course.scenes[sceneId] : undefined;
        return {
          scene: have ?? demoScene(ed.course.cockpit),
          sceneId: have ? sceneId : undefined,
          own: true,
          shared: 0,
          elsewhere: !!have && !!ed.step && sceneUsedElsewhere(ed.course, sceneId!, ed.step.id),
        };
      },
      write: (sit, final, target) => ed.writeSituation(sit, final, target),
      split: (blockId) => {
        const slide = ed.step?.slide;
        if (!slide || !ed.canvasEd) return;
        const r = splitBlock(ed.course, slide, blockId, demoScene(ed.course.cockpit));
        if (!r) return;
        rememberScene(r.scene);
        ed.apply({ ...ed.course, scenes: { ...ed.course.scenes, [r.scene.id]: r.scene } }, undefined, {
          inspector: false,
          centre: false,
        });
        ed.canvasEd.set(r.slide);
        ed.inspector.render();
      },
      join: (blockId) => {
        const slide = ed.step?.slide;
        if (!slide || !ed.canvasEd) return;
        ed.canvasEd.set(joinBlock(slide, blockId));
        ed.inspector.render();
      },
      fly: (scene) => void ed.flyFrom(scene),
    };
  }
  /** Store a situation (or, while a slider is held, only show it). True when the element now points at a new
   *  scene: what the inspector read from the slide is out of date and it must be drawn again. */
  private writeSituation(sit: Situation, final: boolean, target: SitTarget): boolean {
    const s = this.step;
    if (!s) return false;
    const slide = s.slide;
    const blockId = target.kind === "block" ? target.id : undefined;
    const cur = target.kind === "scene" ? target.id : slide ? blockSceneId(slide, blockId).id : undefined;
    const plan = planSituation(this.course, s.id, cur, sit, demoScene(this.course.cockpit));
    const sims = this.canvasEd?.view.sims;
    if (!plan.isNew) {
      rememberScene(plan.scene);
      sims?.replace(plan.scene);
      if (!final) return false;
      this.apply(
        { ...this.course, scenes: { ...this.course.scenes, [plan.sceneId]: plan.scene } },
        `sit.${plan.sceneId}`,
        { inspector: false, centre: !slide },
      );
      this.afterSituation(target.from);
      return false;
    }
    // The first change of a situation that was the sample one, or one other steps show too: this step gets its
    // own. While the slider is held nothing is stored: the instruments that show the current one follow.
    const shown = cur && this.course.scenes[cur] ? cur : DEMO_SCENE_ID;
    if (!final) {
      if (target.kind !== "scene") sims?.replace({ ...plan.scene, id: shown });
      return false;
    }
    rememberScene(plan.scene);
    this.apply({ ...this.course, scenes: { ...this.course.scenes, [plan.sceneId]: plan.scene } }, undefined, {
      inspector: false,
      centre: false,
    });
    if (target.kind === "scene") {
      target.set(plan.sceneId);
      return true;
    }
    if (!slide || !this.canvasEd) return false;
    this.sitBusy = true;
    try {
      this.canvasEd.set(repointSlide(slide, cur, plan.sceneId, blockId));
    } finally {
      this.sitBusy = false;
    }
    // what showed the old situation elsewhere on the slide gets it back as stored
    sims?.replace(this.course.scenes[shown] ?? demoScene(this.course.cockpit));
    this.afterSituation(target.from);
    return true;
  }
  /** A situation was stored: the other place that shows it (the inspector, the Simulateur panel) follows. */
  private afterSituation(from?: "inspector" | "panel") {
    if (from !== "inspector") this.inspector.render();
    if (from !== "panel" && this.studio.tab === "cockpit") this.studio.refresh();
  }
  private simSelectionId(): string | undefined {
    const b = this.sel.length === 1 ? this.sel[0] : null;
    return b && (b.kind === "instrument" || b.kind === "simViewport") ? b.id : undefined;
  }
  /** After an undo or a redo: the instruments on the slide show the course's situations again. */
  private syncCanvasScenes() {
    const sims = this.canvasEd?.view.sims;
    if (!sims) return;
    for (const sc of Object.values(this.course.scenes)) {
      rememberScene(sc);
      if (JSON.stringify(sims.env.scenes[sc.id]) !== JSON.stringify(sc)) sims.replace(sc);
    }
  }
  /**
   * « Voler et capturer » / « Ouvrir cette situation dans le simulateur »: the course is saved, the cockpit opens
   * with the aircraft in that situation, C captures the moment, « Retour au cours » comes back here.
   */
  async flyFrom(scene?: SimScene) {
    if (!this.captureReady) {
      this.flyToCapture();
      return;
    }
    await this.saveNow();
    // back from the cockpit, the editor opens on this slide and its captured moments
    markFlying({ course: this.course.id, ...(this.step ? { step: this.step.id } : {}), at: Date.now() });
    if (!scene && this.o.onFlyToCapture) {
      this.o.onFlyToCapture(this.course.id);
      return;
    }
    let code = "";
    if (scene) {
      try {
        const { situation: _sit, ...plain } = scene;
        void _sit;
        code = await encodeScene(compactScene(plain as SimScene));
      } catch {
        code = "";
      }
    }
    this.go(
      captureLink({
        courseId: this.course.id,
        ...(this.step ? { stepId: this.step.id } : {}),
        ...(code ? { sceneCode: code } : {}),
        returnHref: location.href,
      }),
    );
  }
  /** One of the four simulator contents of the « Simulateur » panel, on the slide, ready to work and selected. */
  addSimContent(kind: SimContentKind) {
    const slide = this.step?.slide;
    if (!slide || !this.canvasEd) return;
    const { scene } = this.situations.read();
    const d = simContentDraft(kind, situationOfScene(scene), this.course.cockpit, Object.keys(this.course.clips)[0]);
    const b = this.canvasEd.add(d as BlockDraft);
    if (b) this.offerNewSlideIfCrowded(b, d as BlockDraft);
    this.afterPanelAdd();
  }
  /** while set, the canvas's own change joins the course change made just before it (one undo step) */
  private groupKey: string | undefined;
  private grouped(fn: () => void) {
    this.groupKey = `grp.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
    try {
      fn();
    } finally {
      this.groupKey = undefined;
    }
  }
  /** what a scene shows, in pilot words (the panel's « avant / maintenant ») */
  private sceneWords(sc: SimScene | undefined): string {
    if (!sc) return "";
    try {
      return sitLabel(situationOfScene(sc));
    } catch {
      return "";
    }
  }
  /** Back from the cockpit: this slide, the Simulateur panel on « Vos captures », the capture chosen there applied. */
  private backFromCockpit() {
    const flying = takeFlying(this.course.id);
    const choice = takeCaptureChoice(this.course.id);
    if (!flying && !choice) return;
    const sid = choice?.step ?? flying?.step;
    if (sid && this.step?.id !== sid && this.course.steps.some((x) => x.id === sid)) queueMicrotask(() => this.goTo(sid));
    if (flying) this.tray.setNewSince(flying.at);
    queueMicrotask(() => this.openPanel("cockpit"));
    if (choice)
      void this.tray.whenLoaded().then((items) => {
        const it = items.find((x) => x.id === choice.item);
        if (!it) return;
        // after the step and the panel are up
        setTimeout(() => {
          if (!this.destroyed) this.useCapture(it);
        }, 0);
      });
  }
  /** A captured moment becomes the situation of this slide: its instruments show it. One undo step. */
  useCapture(it: TrayItem) {
    const s = this.step;
    const slide = s?.slide;
    const fr = this.lang === "fr";
    const refusal = sceneRefusal(it.scene, this.lang);
    if (refusal) {
      this.toast(refusal.text);
      return;
    }
    if (!s || !slide || !this.canvasEd) {
      this.toast(t2(this.lang, "Pick a designed slide first: a capture sets a slide’s situation.", "Choisissez d’abord une diapo : une capture règle la situation d’une diapo."));
      return;
    }
    const before = this.sceneWords(this.situations.read().scene);
    const sc: SimScene = { ...it.scene };
    rememberScene(sc);
    this.grouped(() => {
      this.apply({ ...this.course, scenes: { ...this.course.scenes, [sc.id]: sc } }, this.groupKey, {
        inspector: false,
        centre: false,
      });
      this.canvasEd!.set(repointSlide(slide, slide.scene, sc.id));
    });
    this.inspector.render();
    if (this.studio.tab === "cockpit") this.studio.refresh();
    const now = it.moment ? momentLine(it.moment, this.lang) : this.sceneWords(sc);
    const title = tr(s.title, this.lang);
    const text = fr
      ? `La situation de la diapo « ${title} » est maintenant le moment capturé : ${now}.${before ? ` Avant : ${before}.` : ""} Tous ses instruments le montrent.`
      : `The situation of the slide “${title}” is now the captured moment: ${now}.${before ? ` Before: ${before}.` : ""} All its instruments show it.`;
    this.tray.setResult({ item: it.id, text, undo: () => this.undo() });
    this.toast(t2(this.lang, "The slide’s instruments now show the captured moment.", "Les instruments de la diapo montrent maintenant le moment capturé."), () => {
      this.undo();
      this.tray.setResult(null);
    });
  }
  /** A simulator view of the captured moment (its recording, for the last 60 s) on this slide. One undo step. */
  addCaptureView(it: TrayItem) {
    const s = this.step;
    const slide = s?.slide;
    const refusal = sceneRefusal(it.scene, this.lang);
    if (refusal) {
      this.toast(refusal.text);
      return;
    }
    if (!s || !slide || !this.canvasEd) {
      this.toast(t2(this.lang, "Pick a designed slide first.", "Choisissez d’abord une diapo."));
      return;
    }
    const sc: SimScene = { ...it.scene };
    let c: Course = { ...this.course, scenes: { ...this.course.scenes, [sc.id]: sc } };
    let clipId: string | undefined;
    if (it.clip) {
      clipId = `clip-${it.id}`;
      c = { ...c, clips: { ...c.clips, [clipId]: { ...structuredClone(it.clip), id: clipId, startScene: sc.id } } };
    }
    rememberScene(sc);
    const d = { ...simContentDraft("moment", situationOfScene(sc), this.course.cockpit, clipId), scene: sc.id } as BlockDraft;
    let b: SlideBlock | null = null;
    this.grouped(() => {
      this.apply(c, this.groupKey, { inspector: false, centre: false });
      b = this.canvasEd!.add(d);
    });
    if (b) this.offerNewSlideIfCrowded(b, d);
    const what = it.moment ? momentLine(it.moment, this.lang) : this.sceneWords(sc);
    const text = it.clip
      ? t2(this.lang, `A simulator view was added to the slide: it replays the recorded ${Math.round(it.clip.durS)} s (${what}).`, `Une vue du simulateur a été ajoutée à la diapo : elle rejoue les ${Math.round(it.clip.durS)} s enregistrées (${what}).`)
      : t2(this.lang, `A simulator view was added to the slide: it shows the captured moment (${what}).`, `Une vue du simulateur a été ajoutée à la diapo : elle montre le moment capturé (${what}).`);
    this.tray.setResult({ item: it.id, text, undo: () => this.undo() });
    // the panel may close to show the slide (narrow screens): the toast says it too, with « Annuler »
    this.toast(text, () => {
      this.undo();
      this.tray.setResult(null);
    });
    this.afterPanelAdd();
  }
  async importImage(
    file: File,
  ): Promise<{ asset: AssetId; w: number; h: number } | null> {
    const fr = this.lang === "fr";
    if (!this.store) {
      this.toast(
        fr
          ? "Les images ont besoin du stockage de cet appareil."
          : "Images need this device’s storage.",
      );
      return null;
    }
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      this.toast(
        fr
          ? "Choisissez une photo ou une image (PNG, JPEG, WebP)."
          : "Choose a photo or an image (PNG, JPEG, WebP).",
      );
      return null;
    }
    try {
      const enc = await encodeImage(file, 1600);
      const ref = await this.store.putAsset(enc.blob, {
        w: enc.w,
        h: enc.h,
        role: "image",
        mime: enc.mime,
      });
      this.urls.set(ref.id, URL.createObjectURL(enc.blob));
      this.apply({
        ...this.course,
        assets: { ...this.course.assets, [ref.id]: ref },
      });
      this.toast(
        fr
          ? `Image ajoutée (${enc.w} × ${enc.h}, ${Math.round(ref.bytes / 1024)} Ko)`
          : `Image added (${enc.w} × ${enc.h}, ${Math.round(ref.bytes / 1024)} KB)`,
      );
      return { asset: ref.id, w: enc.w, h: enc.h };
    } catch (e) {
      this.toast(
        isQuotaError(e)
          ? fr
            ? "Le stockage de cet appareil est plein : exportez le cours, puis supprimez d’anciens cours ou images."
            : "Storage is full on this device: export the course, then delete old courses or images."
          : fr
            ? "Cette image n’a pas pu être lue."
            : "This image could not be read.",
      );
      return null;
    }
  }
  assetUrl(id: string): string | null | Promise<string | null> {
    const u = this.urls.get(id);
    if (u) return u;
    if (!this.store) return null;
    return this.store.getAsset(id).then((b) => {
      if (!b) return null;
      const url = URL.createObjectURL(b);
      this.urls.set(id, url);
      return url;
    });
  }
  /** the cockpit can capture scenes for this editor (its course bridge is installed) */
  private get captureReady(): boolean {
    return !!this.o.onFlyToCapture || cockpitBridgeReady();
  }
  flyToCapture() {
    if (!this.captureReady) {
      // never leave the editor for a cockpit that cannot bring the capture back
      this.toast(
        t2(
          this.lang,
          "Capturing from the cockpit is not available in this build yet: set the scene in the inspector (position, heading, altitude, radios).",
          "La capture depuis le cockpit n’est pas encore disponible dans cette version : réglez la scène dans l’inspecteur (position, cap, altitude, radios).",
        ),
      );
      return;
    }
    void this.saveNow().then(() => {
      markFlying({ course: this.course.id, ...(this.step ? { step: this.step.id } : {}), at: Date.now() });
      if (this.o.onFlyToCapture) this.o.onFlyToCapture(this.course.id);
      else
        this.go(
          captureLink({
            courseId: this.course.id,
            ...(this.step ? { stepId: this.step.id } : {}),
            returnHref: location.href,
          }),
        );
    });
  }
  /**
   * A block added from the rail that still covers others (the slide is full): offer to put it on a new slide
   * of its own instead, in one tap.
   */
  offerNewSlideIfCrowded(b: SlideBlock, d: BlockDraft) {
    const c = this.canvasEd?.canvas;
    if (!c) return;
    // on the author's own slide (no designed layout), an element that had to shrink a lot: the slide reflows
    // into a clean order instead (one more undo step, said in the toast)
    const layout = this.step?.slide?.layout;
    const core = this.canvasEd?.core;
    if (core && !core.full && core.lastScale < 0.85 && (!layout || layout === "blank") && c.blocks.length <= 6) {
      const ed = this.canvasEd!;
      const theme = resolveTheme(this.step?.slide?.theme ?? this.course.theme, this.course.brand);
      const grown = {
        ...c,
        blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, frame: { ...x.frame, w: d.frame.w, h: d.frame.h } } : x)),
      };
      const next = tidySlide(grown, theme, this.lang);
      if (!slideCrowded(next)) {
        ed.set(next, "tidy");
        this.toast(
          t2(this.lang, "Slide rearranged to make room.", "Diapo réorganisée pour faire de la place."),
          () => ed.run({ k: "undo" }),
        );
        return;
      }
    }
    // the placement found no free space (placement.ts): never leave an overlap the students would see. The
    // element goes on a new slide right after this one; « Annuler » takes that slide away again
    if (this.canvasEd?.core.full) {
      const at = this.i;
      this.canvasEd.run({ k: "undo" });
      this.addTemplate("slide", { layout: "blank" });
      this.canvasEd?.add(d);
      const made = this.i;
      this.toastActions(
        t2(this.lang, "No room on that slide: added on a new slide.", "Plus de place sur cette diapo : ajouté sur une nouvelle diapo."),
        [
          {
            label: t2(this.lang, "Undo", "Annuler"),
            run: () => {
              if (made < this.course.steps.length && made !== at) {
                this.apply(removeStep(this.course, made), undefined, { centre: false });
                this.select(Math.min(at, this.course.steps.length - 1));
                this.renderCentre();
              }
            },
          },
        ],
      );
      return;
    }
    const f = b.frame;
    let covered = 0;
    for (const x of c.blocks) {
      if (x.id === b.id || x.hiddenInEditor) continue;
      const ix =
        Math.min(f.x + f.w, x.frame.x + x.frame.w) - Math.max(f.x, x.frame.x);
      const iy =
        Math.min(f.y + f.h, x.frame.y + x.frame.h) - Math.max(f.y, x.frame.y);
      if (ix > 0 && iy > 0) covered += ix * iy;
    }
    if (covered < 0.2 * f.w * f.h) return;
    this.toast(
      t2(
        this.lang,
        "The slide is full: this block covers others.",
        "La diapo est pleine : ce bloc en recouvre d’autres.",
      ),
      () => {
        this.canvasEd?.run({ k: "undo" });
        this.addTemplate("slide", { layout: "blank" });
        this.canvasEd?.add(d);
      },
      t2(this.lang, "New slide with this block", "Nouvelle diapo avec ce bloc"),
    );
  }
  /** « Réorganiser la diapo »: the slide in a clean order, one undo step (placement.ts tidySlide). */
  tidySlide() {
    const ed = this.canvasEd;
    if (!ed) return;
    const theme = resolveTheme(this.step?.slide?.theme ?? this.course.theme, this.course.brand);
    const before = ed.canvas;
    const next = tidySlide(before, theme, this.lang);
    if (next === before) return;
    ed.set(next, "tidy");
    this.toast(t2(this.lang, "Slide tidied.", "Diapo réorganisée."), () => ed.run({ k: "undo" }));
  }
  /** is the current slide in a mess (two elements cover each other)? */
  get slideCrowded(): boolean {
    const c = this.canvasEd?.canvas;
    return !!c && slideCrowded(c);
  }
  /** a message with up to two actions (the first is the one most people want) */
  toastActions(msg: string, actions: { label: string; run: () => void }[]) {
    clearTimeout(this.toastTimer);
    this.toastEl.replaceChildren(h("span", {}, msg));
    for (const a of actions)
      this.toastEl.append(
        btn(
          a.label,
          () => {
            this.toastEl.hidden = true;
            a.run();
          },
          { cls: "sm ghost inv" },
        ),
      );
    this.toastEl.hidden = false;
    this.liveEl.textContent = msg;
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 9000);
  }
  toast(msg: string, undo?: () => void, actionLabel?: string) {
    clearTimeout(this.toastTimer);
    const fr = this.lang === "fr";
    this.toastEl.replaceChildren(h("span", {}, msg));
    if (undo)
      this.toastEl.append(
        btn(
          actionLabel ?? (fr ? "Annuler" : "Undo"),
          () => {
            undo();
            this.toastEl.hidden = true;
          },
          { cls: "sm ghost inv" },
        ),
      );
    this.toastEl.hidden = false;
    this.liveEl.textContent = msg;
    this.toastTimer = window.setTimeout(
      () => (this.toastEl.hidden = true),
      undo ? 5000 : 3200,
    );
  }

  // ================================================================ building
  private build() {
    const fr = this.lang === "fr";
    // top bar: back · title / status · Checks · Preview · Present (primary) · Share
    this.titleBtn = h("button", {
      type: "button",
      class: "ce-ttl-b",
      title: fr ? "Réglages du cours" : "Course settings",
    });
    this.titleBtn.addEventListener("click", () => this.courseSettings());
    this.subEl = h("span", { class: "ce-sub-l" });
    this.statusEl = h("span", { class: "ce-status" });
    // « Plus » holds the rest, each with its word: Vérifications (« 2 points à revoir »),
    // Exporter (UX logic §6: three actions on the bar, one primary)
    this.checksBtn = btn(fr ? "Plus" : "More", () => this.openMore(), {
      cls: "sm ce-checks-b ce-more-b",
      icon: "dots",
    });
    this.checksBtn.setAttribute("aria-haspopup", "menu");
    // the labelled way back says where it lands: the library's « Mes cours et brouillons » (Instructeurs)
    const back = btn(fr ? "Mes cours et brouillons" : "My courses and drafts", () => this.exit(), {
      cls: "sm ce-back-b",
      icon: "back",
      title: fr
        ? "Retour à Bibliothèque › Instructeurs › Mes cours et brouillons (le cours est enregistré)"
        : "Back to Library › Instructors › My courses and drafts (the course is saved)",
    });
    // one way to try the course as a student (from this slide): here, next to Present
    const preview = h(
      "button",
      {
        type: "button",
        class: "ce-btn sm ce-preview",
        title: fr
          ? "Aperçu élève depuis cette diapo (T)"
          : "Student preview from this slide (T)",
      },
      railIcon(
        "eye",
        "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z",
      ),
      h("span", {}, fr ? "Aperçu élève" : "Student preview"),
    );
    preview.addEventListener("click", () => {
      if (this.course.steps.length) this.testAsStudent(this.i);
      else this.needStepFirst();
    });
    const presentB = h(
      "button",
      {
        type: "button",
        class: "ce-btn sm ce-present",
        title: fr
          ? `Présenter en plein écran (${modKey()}P)`
          : `Present full screen (${modKey()}P)`,
      },
      railIcon("play", "M8 5.5v13l11-6.5z"),
      h("span", {}, fr ? "Présenter" : "Present"),
    );
    presentB.addEventListener("click", () => {
      if (this.course.steps.length) this.present();
      else this.needStepFirst();
    });
    const top = h(
      "header",
      { class: "ce-top" },
      back,
      h(
        "div",
        { class: "ce-ttl" },
        this.titleBtn,
        h("div", { class: "ce-ttl-s" }, this.subEl, this.statusEl),
      ),
      h("span", { class: "ce-sp" }),
      preview,
      presentB,
      (() => {
        const b = btn(
          fr ? "Partager" : "Share",
          () =>
            this.course.steps.length ? this.share(b) : this.needStepFirst(),
          {
            cls: "sm ce-share-b",
            icon: "share",
          },
        );
        this.needSteps = [preview, presentB, b];
        return b;
      })(),
      this.checksBtn,
    );
    // the rail: what can be added (templates, text, elements, instruments, diagrams, media, brand, cockpit)
    this.railEl = h("nav", {
      class: "ce-rail",
      "aria-label": fr ? "Ajouter à la diapo" : "Add to the slide",
    });
    this.studio = new StudioPanel(this.studioHost(), () => this.closePanel());
    // the filmstrip: every step as a 16:9 thumbnail (drag to reorder), + to add, the step actions
    this.stepsEl = h("ol", {
      class: "ce-steps",
      role: "listbox",
      tabindex: "0",
      "aria-orientation": "horizontal",
      "aria-label": fr ? "Diapos du cours" : "Course slides",
    });
    this.stepsEl.addEventListener("keydown", (e) => {
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      const bwd = e.key === "ArrowUp" || e.key === "ArrowLeft";
      if (fwd || bwd) {
        if (e.altKey) return;
        e.preventDefault();
        this.select(this.i + (fwd ? 1 : -1));
      }
    });
    this.adviceEl = h("button", { type: "button", class: "ce-advice" });
    this.adviceEl.addEventListener("click", () => {
      const r = pacingRuns(this.course.steps)[0];
      if (r) this.select(r[0]);
    });
    this.stepBar = h("div", { class: "ce-stepbar" });
    this.stripEl = h(
      "section",
      {
        class: "ce-strip",
        "aria-label": fr ? "Diapos" : "Slides",
      },
      this.stepBar,
      h("div", { class: "ce-strip-row" }, this.stepsEl, this.adviceEl),
    );
    // centre: the context bar, the stage (canvas or device preview), the filmstrip
    this.toolEl = h("div", { class: "ce-ctool" });
    this.stageArea = h("div", { class: "ce-stagearea" });
    this.hintEl = h(
      "div",
      { class: "ce-hint" },
      h("span", { class: "ce-kbd" }, "C"),
      h(
        "span",
        {},
        fr
          ? "dans le cockpit capture ce moment"
          : "in the cockpit captures this moment",
      ),
      h("span", { class: "ce-kbd" }, "⇧ C"),
      h(
        "span",
        {},
        fr
          ? "les 60 dernières s · les deux arrivent dans le bac"
          : "the last 60 s · both land in the tray",
      ),
    );
    // the C / ⇧C cockpit keys only mean something once the cockpit can send captures back
    this.hintEl.hidden = !this.captureReady;
    const center = h(
      "main",
      { class: "ce-col ce-center" },
      this.toolEl,
      this.stageArea,
      this.stripEl,
    );
    this.toastEl = h("div", { class: "ce-toast", role: "status" });
    this.toastEl.hidden = true;
    this.liveEl = h("div", { class: "ce-sr", "aria-live": "polite" });
    this.bodyEl = h(
      "div",
      { class: "ce-body studio" },
      this.railEl,
      this.studio.el,
      center,
      this.inspector.el,
    );
    this.el.classList.add("is-studio");
    this.el.append(top, this.bodyEl, this.toastEl, this.liveEl);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.fitDevice());
      this.ro.observe(this.stageArea);
    }
  }
  // ================================================================ the studio: rail, panel, filmstrip
  private studioHost() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ed = this;
    return {
      get lang() {
        return ed.lang;
      },
      get course() {
        return ed.course;
      },
      get onSlide() {
        return !!ed.step?.slide && !!ed.canvasEd;
      },
      get slideEmpty() {
        return !!ed.step?.slide && !ed.step.slide.blocks.length;
      },
      addDraft: (d: BlockDraft) => {
        const b = ed.canvasEd?.add(d);
        if (b && ed.canvasEd) ed.offerNewSlideIfCrowded(b, d);
      },
      dropDraft: (d: BlockDraft, x: number, y: number) =>
        !!ed.canvasEd?.dropAt(d, x, y),
      isOverSlide: (x: number, y: number) => !!ed.canvasEd?.isOverSlide(x, y),
      addTemplate: (id: TemplateId, o?: { layout?: SlideLayoutId }) => {
        ed.addTemplate(id, o ?? {});
        ed.afterPanelAdd();
      },
      replaceLayout: (id: SlideLayoutId) => {
        ed.applyLayout(id);
        ed.afterPanelAdd();
      },
      addSlide: (
        slide: SlideCanvas,
        title: { en: string; fr?: string },
        scenes?: Course["scenes"],
      ) => {
        ed.addComposedSlide(slide, title, scenes);
        ed.afterPanelAdd();
      },
      addDeck: (d: DeckStarter, theme: ThemeId) => ed.addDeck(d, theme),
      setCourse: (c: Course, key?: string) => {
        ed.setCourse(c, key, false);
        ed.canvasEd?.setTheme(ed.course.theme, ed.course.brand);
        ed.thumbs.clear();
        ed.renderSteps();
      },
      importImage: (f: File) => ed.importImage(f),
      addImageFile: (f: File) => {
        void ed.addImageBlock(f).then(() => ed.afterPanelAdd());
      },
      assetUrl: (id: string) => ed.assetUrl(id),
      trayEl: ed.tray.el,
      afterAdd: () => ed.afterPanelAdd(),
      get situations() {
        return ed.situations;
      },
      /** the selected instrument or simulator view (its situation is the one the panel edits) */
      get simSelection() {
        return ed.simSelectionId();
      },
      addSim: (kind: SimContentKind) => ed.addSimContent(kind),
      newSlide: () => ed.newSlide(),
    };
  }
  /** Below 1280 px the panel floats over the slide: it closes after an add so the new block shows. */
  private afterPanelAdd() {
    if (window.innerWidth < 1366 && this.studio.open) this.closePanel();
  }
  private renderRail() {
    const fr = this.lang === "fr";
    const onSlide = !!this.step?.slide;
    const empty = !this.course.steps.length;
    this.railEl.replaceChildren(
      // the cockpit tray only once the cockpit can send captures (or has sent some): never a "coming soon" slot
      ...RAIL_TABS.map((t) => {
        // on an empty course these still work: they start a blank slide first
        const off = SLIDE_ONLY.has(t) && !onSlide && !empty;
        const on = this.studio.tab === t;
        const b = h(
          "button",
          {
            type: "button",
            class: `ce-rail-b${on ? " on" : ""}${off ? " off" : ""}`,
            "aria-pressed": on ? "true" : "false",
            "data-rail": t,
            title: off
              ? fr
                ? "Choisissez une diapo pour y ajouter du contenu"
                : "Pick a slide to add to it"
              : railLabel(t, this.lang),
          },
          railIcon(t),
          h("span", {}, railLabel(t, this.lang)),
        );
        if (t === "cockpit") {
          const n = this.tray.count;
          if (n) b.append(h("i", { class: "ce-rail-n" }, String(n)));
        }
        b.addEventListener("click", () => {
          if (SLIDE_ONLY.has(t) && empty) {
            this.addTemplate("slide", { layout: "blank" });
            this.openPanel(t);
            return;
          }
          this.togglePanel(t);
        });
        return b;
      }),
      this.aiRailButton(),
    );
  }
  /** « Générer des diapos avec l’IA » (src/course/ai): the deck goes in after this slide like a template, one undo. */
  private aiRailButton(): HTMLElement {
    const fr = this.lang === "fr";
    const b = h(
      "button",
      {
        type: "button",
        class: "ce-rail-b",
        "data-rail": "ai",
        title: fr ? "Générer des diapos avec l’IA" : "Generate slides with AI",
        "aria-label": fr ? "Générer des diapos avec l’IA" : "Generate slides with AI",
      },
      railIcon("ai", AI_SPARK),
      h("span", {}, fr ? "IA" : "AI"),
    );
    b.addEventListener("click", () => {
      const prog = this.course.program;
      openAiAdd({
        lang: this.lang,
        program: Array.isArray(prog) ? prog[0] : prog,
        onAdd: (d) => this.addDeck(d, this.course.theme ?? d.theme),
      });
    });
    return b;
  }
  /** a panel of the rail, from the inspector's next steps (an empty course gets its first slide) */
  openRail(t: string) {
    if (!RAIL_TABS.includes(t as RailTab) && !["elements", "diagrams", "brand"].includes(t)) return;
    if (!this.course.steps.length) this.addTemplate("slide", { layout: "blank" });
    this.openPanel(t as RailTab);
  }
  togglePanel(t: RailTab) {
    if (this.studio.tab === t) this.closePanel();
    else this.openPanel(t);
  }
  openPanel(t: RailTab) {
    this.studio.show(t);
    this.bodyEl.classList.add("panel-open");
    this.renderRail();
  }
  closePanel() {
    if (!this.studio.open) return;
    this.studio.hide();
    this.bodyEl.classList.remove("panel-open");
    this.renderRail();
    this.canvasEd?.focus();
  }
  private toggleInspector() {
    this.inspOpen = !this.inspOpen;
    this.bodyEl.classList.toggle("insp-closed", !this.inspOpen);
    this.renderTool();
  }
  /** A composed slide (a ready-made example) as a new step after the current one; its scenes join the course. */
  private addComposedSlide(
    slide: SlideCanvas,
    title: { en: string; fr?: string },
    scenes?: Course["scenes"],
  ) {
    const used = new Set<string>();
    const walk = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (k === "scene" && typeof v === "string") used.add(v);
        else walk(v);
      }
    };
    walk(slide);
    const add: Course["scenes"] = {};
    const all = scenes ?? exampleScenes();
    for (const id of used)
      if (all[id] && !this.course.scenes[id]) add[id] = all[id];
    const base: Course = Object.keys(add).length
      ? { ...this.course, scenes: { ...this.course.scenes, ...add } }
      : this.course;
    const s2 = clone(slide);
    delete s2.theme;
    // the step is named after what the slide says (its title), not after the gallery card that offered it
    const head = s2.blocks.find(
      (b) => b.kind === "text" && (b.style === "display" || b.style === "title") && tr(b.text, "en").trim(),
    );
    if (head && head.kind === "text") title = { en: head.text.en, fr: head.text.fr ?? head.text.en };
    const notes = defaultNotes(s2);
    // an empty slide takes the ready slide in place (« + Diapo », then a pick of « Que voulez-vous montrer ? »)
    const cur = this.step;
    if (cur?.slide && !cur.slide.blocks.length && !cur.slide.background?.image) {
      // the « Nouvelle diapo » gets its content: it stays, and the toast says where it went
      const where = this.pendingNew?.id === cur.id ? addedWhere(this.lang, this.i, this.course.steps.length) : null;
      if (where) this.pendingNew = null;
      const before = this.course;
      const t = { en: title.en, fr: title.fr ?? title.en };
      this.apply(replaceStep(base, { ...cur, title: t, slide: s2, reader: linearText(s2), ...(cur.notes ? {} : { notes }) }), undefined, {
        inspector: true,
      });
      // the canvas was built with the course's older situations: hand it the new ones before it draws the slide
      this.syncCanvasScenes();
      this.canvasEd?.load(s2);
      this.syncEmpty(s2);
      this.toast(where ?? t2(this.lang, "Slide added", "Diapo ajoutée"), () => {
        this.apply(before, undefined, { inspector: true });
        const st = this.step;
        if (st?.slide) this.canvasEd?.load(st.slide);
      });
      return;
    }
    const made = makeStep(base, "slide", {
      layout: "blank",
      title: { en: title.en, fr: title.fr ?? title.en },
    });
    this.insert({
      course: made.course,
      step: { ...made.step, slide: s2, reader: linearText(s2), notes },
    });
  }
  /** A whole starter deck after the current step (or as the course when it is empty). */
  private addDeck(d: DeckStarter, theme: ThemeId) {
    const fresh = !this.course.steps.length;
    const before = this.course;
    const r = addStarterDeck(this.course, d, {
      at: fresh ? 0 : this.i + 1,
      ...(fresh ? { theme } : {}),
    });
    // a course still called "Untitled course" takes the deck's cover title
    const untitled =
      !tr(this.course.title, "en").trim() ||
      /^(untitled course|cours sans titre)$/i.test(
        tr(this.course.title, "en").trim(),
      );
    const dt = deckTitle(d);
    if (fresh && untitled && dt) r.course = { ...r.course, title: dt };
    this.apply(r.course, undefined, { centre: false, inspector: true });
    const j = r.firstStepId
      ? this.course.steps.findIndex((s) => s.id === r.firstStepId)
      : -1;
    this.clearThumbs();
    this.select(Math.max(0, j));
    this.renderCentre();
    this.afterPanelAdd();
    this.toast(
      t2(
        this.lang,
        `${d.slides.length} slides added: ${tr(d.title, "en")}`,
        `${d.slides.length} diapos ajoutées : ${tr(d.title, "fr")}`,
      ),
      () => {
        this.apply(before, undefined, { inspector: true });
        this.clearThumbs();
        this.select(
          Math.min(this.i, Math.max(0, this.course.steps.length - 1)),
        );
        this.renderCentre();
      },
    );
  }
  mount(root: HTMLElement) {
    root.append(this.el);
    requestAnimationFrame(() => this.fitDevice());
  }

  // ================================================================ change flow
  /** Every edit: one undo step (coalesced by key), then refresh what depends on it. */
  private apply(
    c: Course,
    key?: string,
    o: { inspector?: boolean; centre?: boolean } = {},
  ) {
    if (!this.history.push(c, key)) return;
    this.course = c;
    this.changed(o);
  }
  private changed(o: { inspector?: boolean; centre?: boolean } = {}) {
    this.changeNo++;
    this.unexported = true;
    if (this.i >= this.course.steps.length)
      this.i = Math.max(0, this.course.steps.length - 1);
    this.renderTop();
    this.renderSteps();
    this.renderStepBar();
    this.renderTool();
    if (o.inspector) this.inspector.render();
    if (o.centre !== false) this.schedulePreview();
    this.scheduleChecks();
    this.scheduleSave();
  }
  private undo() {
    const c = this.history.undo();
    if (c) this.restore(c);
    // a toast offering « Annuler » is out of date once the change is undone
    if (c && this.toastEl.querySelector("button")) this.toastEl.hidden = true;
  }
  private redo() {
    const c = this.history.redo();
    if (c) this.restore(c);
  }
  private restore(c: Course) {
    const id = this.step?.id;
    this.course = c;
    const j = c.steps.findIndex((s) => s.id === id);
    if (j >= 0) this.i = j;
    this.changed({ inspector: true, centre: false });
    // the Simulateur panel reads the slide's situation: say the restored one (an undone capture)
    if (this.studio.tab === "cockpit") this.studio.refresh();
    // the canvas reloads the restored slide, keeping what is still selected
    const s = this.step;
    if (s?.slide && this.canvasEd && this.canvasFor === s.id) {
      const ids = this.sel.map((b) => b.id);
      this.canvasEd.load(s.slide);
      this.syncCanvasScenes();
      this.canvasEd.select(
        ids.filter((x) => s.slide!.blocks.some((b) => b.id === x)),
      );
    } else this.renderCentre();
  }

  // ================================================================ rendering
  private renderAll() {
    this.renderRail();
    // an empty first slide opens on « Que voulez-vous montrer ? » (the first-run card over the slide, syncEmpty);
    // the rail stays closed so the card has the room
    this.renderTop();
    this.renderSteps();
    this.renderTool();
    this.renderCentre();
    this.renderStepBar();
    this.inspector.render();
    this.scheduleChecks(0);
  }
  private renderTop() {
    const c = this.course;
    const fr = this.lang === "fr";
    this.titleBtn.textContent =
      tr(c.title, this.lang) || (fr ? "Cours sans titre" : "Untitled course");
    const n = c.steps.length;
    const langs = c.langs.includes("fr")
      ? "EN + FR"
      : c.langs.map((l) => l.toUpperCase()).join(" + ");
    const empty = !n;
    // an empty course is the deck gallery, full width: no empty properties column, no empty strip
    this.bodyEl?.classList.toggle("is-empty", empty);
    for (const b of this.needSteps) {
      b.setAttribute("aria-disabled", empty ? "true" : "false");
      b.classList.toggle("is-off", empty);
      if (empty)
        b.title = fr
          ? "Ajoutez une diapo pour présenter"
          : "Add a slide to present";
    }
    if (!empty && this.needSteps.length === 3) {
      this.needSteps[0].title = fr
        ? "Aperçu élève depuis cette diapo (T)"
        : "Student preview from this slide (T)";
      this.needSteps[1].title = fr
        ? `Présenter en plein écran (${modKey()}P)`
        : `Present full screen (${modKey()}P)`;
      this.needSteps[2].title = "";
    }
    // an empty course says what to do in the status line too (the disabled buttons say it in their tooltip)
    this.subEl.textContent = empty
      ? `${fr ? "Ajoutez une diapo pour présenter" : "Add a slide to present"} · `
      : `${n} ${fr ? (n > 1 ? "diapos" : "diapo") : n === 1 ? "slide" : "slides"} · ${fr ? "environ" : "about"} ${courseMinutes(c)} min · ${langs} · `;
    const dev = isIpad()
      ? fr
        ? "cet iPad"
        : "this iPad"
      : fr
        ? "cet appareil"
        : "this device";
    const st = this.saving;
    const text =
      st === "memory"
        ? fr
          ? "non enregistré sur cet appareil"
          : "not saved on this device"
        : st === "error"
          ? fr
            ? "non enregistré"
            : "not saved"
          : st === "pending" || st === "saving"
            ? fr
              ? "enregistrement…"
              : "saving…"
            : fr
              ? `enregistré sur ${dev}`
              : `saved on ${dev}`;
    this.statusEl.className = `ce-status ${st}`;
    this.statusEl.title =
      st === "memory" && this.store
        ? (storageNotice(this.store, this.lang) ?? "")
        : "";
    this.statusEl.replaceChildren(h("i", { "aria-hidden": "true" }), text);
    // iPad Safari may clear storage after 7 days without a visit: nudge a file backup
    let stale = false;
    try {
      stale = !!this.store && st !== "memory" && this.store.needsExport(c.id);
    } catch {
      stale = false;
    }
    if (st === "memory" && this.unexported) {
      // memory-only: nothing survives the tab, keep the export one tap away
      const nudge = h(
        "button",
        {
          type: "button",
          class: "ce-tag warn ce-nudge",
          title: fr
            ? "Ce navigateur ne garde pas les cours : exportez un fichier"
            : "This browser does not keep courses: export a file",
        },
        fr ? "exportez avant de fermer" : "export before closing",
      );
      nudge.addEventListener("click", () =>
        this.share(
          this.el.querySelector(".ce-top .ce-btn.primary") as HTMLElement,
        ),
      );
      this.statusEl.append(" ", nudge);
    } else if (stale) {
      const nudge = h(
        "button",
        {
          type: "button",
          class: "ce-tag warn ce-nudge",
          title: fr
            ? "Exportez une copie dans un fichier"
            : "Export a copy to a file",
        },
        fr ? "pas exporté depuis 7 jours" : "not exported for 7 days",
      );
      nudge.addEventListener("click", () =>
        this.share(
          this.el.querySelector(".ce-top .ce-btn.primary") as HTMLElement,
        ),
      );
      this.statusEl.append(" ", nudge);
    }
    const errs = this.checks.filter((x) => x.level === "error").length;
    const warns = this.checks.length - errs;
    const badge =
      this.checksBtn.querySelector<HTMLElement>(".ce-count") ??
      h("span", { class: "ce-count" });
    // « Plus » carries the review's count: what needs a look is never hidden
    badge.textContent = String(this.checks.length);
    badge.className = `ce-count${errs ? " err" : warns ? " warn" : " ok"}`;
    badge.title = this.reviewSub();
    badge.hidden = !this.checks.length;
    badge.setAttribute("aria-hidden", "true");
    if (!badge.parentElement) this.checksBtn.append(badge);
    // its accessible name is the word, then the review in words (never « Plus0 »)
    const more = this.lang === "fr" ? "Plus" : "More";
    this.checksBtn.setAttribute("aria-label", this.checks.length ? `${more} · ${this.reviewSub()}` : more);
  }
  private kindChip(s: Step): HTMLElement {
    const k = KINDS[s.kind] ?? KINDS.page;
    const cls = s.slide && s.kind === "slide" ? "slide" : k.cls;
    return h(
      "span",
      { class: `ce-kind k-${cls}` },
      kindLabel(s.kind, this.lang),
    );
  }
  private renderSteps() {
    // the strip's thumbnails resolve scenes the course has now (a deck or a template may have just added one)
    this.ensureSims();
    const c = this.course;
    const lang = this.lang;
    const frag: Node[] = [];
    c.steps.forEach((s, i) => {
      const errs = checksForStep(this.checks, s.id);
      const row = h(
        "li",
        {
          class: `ce-st${i === this.i ? " sel" : ""}`,
          role: "option",
          "aria-selected": i === this.i ? "true" : "false",
          "data-i": String(i),
        },
        h("span", { class: "ce-st-n" }, String(i + 1)),
        this.thumbFor(s),
        h(
          "div",
          { class: "ce-st-tx" },
          h(
            "div",
            { class: "ce-st-k" },
            this.kindChip(s),
            errs.length
              ? h("span", {
                  class: `ce-dot ${errs.some((x) => x.level === "error") ? "err" : "warn"}`,
                  title: tr(errs[0].message, lang),
                })
              : null,
          ),
          h("b", {}, tr(s.title, lang) || "—"),
        ),
      );
      row.addEventListener("pointerdown", (e) => this.dragStart(e, i, row));
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (i !== this.i) this.select(i);
        this.moreMenu(row);
      });
      row.addEventListener("click", () => {
        if (this.drag?.started) return;
        this.select(i);
      });
      frag.push(row);
    });
    // the + tile: the template gallery (slides first, then the interactive steps)
    const addLi = h(
      "li",
      { class: "ce-st-add", role: "presentation" },
      (() => {
        const b = h(
          "button",
          {
            type: "button",
            "data-add": "",
            class: "ce-addtile",
            title: t2(
              lang,
              "New slide (N)",
              "Nouvelle diapo (N)",
            ),
            "aria-label": t2(
              lang,
              "New slide",
              "Nouvelle diapo",
            ),
          },
          railIcon("plus", "M12 5v14 M5 12h14"),
          h("span", {}, t2(lang, "Add", "Ajouter")),
        );
        // a new slide opens on « Que voulez-vous montrer ? » (the first-run card), « Tous les modèles » beside it
        // the tile closes the strip: the slide goes at the end, and only stays once something is chosen
        b.addEventListener("click", () => this.newSlide({ end: true }));
        return b;
      })(),
    );
    frag.push(addLi);
    this.stepsEl.replaceChildren(...frag);
    // bring the selected thumbnail into the strip's view (the strip only: never scroll the page)
    const selEl = this.stepsEl.querySelector<HTMLElement>(".ce-st.sel");
    if (selEl && typeof selEl.getBoundingClientRect === "function") {
      const r = selEl.getBoundingClientRect();
      const box = this.stepsEl.getBoundingClientRect();
      if (r.left < box.left) this.stepsEl.scrollLeft -= box.left - r.left + 8;
      else if (r.right > box.right)
        this.stepsEl.scrollLeft += r.right - box.right + 8;
    }
    // pacing advice lives in Checks only (its badge counts it): never a callout pinned over the strip
    this.adviceEl.hidden = true;
    this.pumpThumbs();
  }
  /** The step list's thumbnail: an image (never a live canvas). */
  private thumbFor(s: Step): HTMLElement {
    const pane = s.stage?.panes[0];
    const sceneId = s.stage?.scene;
    const key = s.slide
      ? `slide|${this.lang}|${this.course.theme}|${JSON.stringify(s.slide)}|${this.simsKey}`
      : pane && pane.kind !== "diagram"
        ? `pane|${JSON.stringify(pane)}|${sceneId}|${sceneId ? JSON.stringify(this.course.scenes[sceneId] ?? null).length : 0}|${this.simsKey}|${(s.stage?.covers ?? []).join()}`
        : `glyph|${s.kind}|${pane?.kind ?? ""}`;
    const cached = this.thumbs.get(s.id);
    if (cached && cached.key === key) return cached.el;
    cached?.view?.destroy();
    const el = h("div", { class: `ce-thumb${s.slide ? " slide" : ""}` });
    const entry: { key: string; el: HTMLElement; view?: SlideView } = {
      key,
      el,
    };
    this.thumbs.set(s.id, entry);
    if (s.slide) {
      const host = h("div", { class: "ce-thumb-slide" });
      el.append(host);
      const slide = s.slide;
      this.thumbQueue.push(() => {
        try {
          entry.view = renderThumb(slide, host, {
            lang: this.lang,
            theme: this.course.theme,
            brand: this.course.brand,
            scenes: this.course.scenes,
            cockpit: this.course.cockpit,
            sims: this.sims,
            assetUrl: (id) => this.assetUrl(id),
            step: s,
          });
        } catch (e) {
          console.warn("thumb", e);
        }
      });
    } else if (pane && (pane.kind === "image" || pane.kind === "still")) {
      void Promise.resolve(this.assetUrl(pane.asset)).then(
        (u) => u && el.append(h("img", { src: u, alt: "" })),
      );
    } else if (pane && pane.kind !== "diagram" && sceneId) {
      this.thumbQueue.push(() => {
        const info = this.stageInfo(sceneId);
        if (!info) return;
        try {
          const f = paneFrame(pane, this.course.cockpit);
          const W = 192;
          const H = 144;
          const cv = document.createElement("canvas");
          cv.width = W;
          cv.height = H;
          const ctx = cv.getContext("2d")!;
          ctx.fillStyle = "#06090c";
          ctx.fillRect(0, 0, W, H);
          const [x, y, w, hh] = f.rect;
          const k = Math.max(W / w, H / hh);
          ctx.setTransform(
            k,
            0,
            0,
            k,
            (W - w * k) / 2 - x * k,
            (H - hh * k) / 2 - y * k,
          );
          drawFrame(ctx, info.sim, f, newInstrumentStates(), 0, {
            covers: s.stage?.covers,
            lang: this.lang,
          });
          el.replaceChildren(
            h("img", { src: cv.toDataURL("image/jpeg", 0.82), alt: "" }),
          );
        } catch (e) {
          console.warn("thumb", e);
        }
      });
    } else {
      el.classList.add("glyph");
      el.append(this.glyph(s));
    }
    return el;
  }
  private glyph(s: Step): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 40 30");
    svg.setAttribute("aria-hidden", "true");
    const pane = s.stage?.panes[0];
    const body =
      s.kind === "calc"
        ? '<rect x="11" y="4" width="18" height="22" rx="2.5" fill="none" stroke="#5b3fc4" stroke-width="1.6"/><path d="M14.5 9h11M15 14h2M19 14h2M23 14h2M15 18h2M19 18h2M23 18h2M15 22h2M19 22h6" stroke="#5b3fc4" stroke-width="1.6" stroke-linecap="round"/>'
        : s.kind === "drill"
          ? '<circle cx="20" cy="16.5" r="9" fill="none" stroke="#5b3fc4" stroke-width="1.6"/><path d="M20 11.5v5l3 2M17 4.5h6" stroke="#5b3fc4" stroke-width="1.6" stroke-linecap="round"/>'
          : s.kind === "quiz"
            ? '<rect x="6" y="5" width="28" height="5" rx="1.5" fill="#845c00"/><rect x="6" y="13" width="28" height="4.5" rx="1.5" fill="none" stroke="#c8d0da"/><rect x="6" y="20.5" width="28" height="4.5" rx="1.5" fill="none" stroke="#c8d0da"/>'
            : pane?.kind === "diagram"
              ? '<path d="M12 10h16a5 5 0 0 1 0 10H12a5 5 0 0 1 0-10z" fill="none" stroke="#0b7285" stroke-width="1.6"/><path d="M4 15h3" stroke="#0b7285" stroke-width="1.6"/><circle cx="12" cy="15" r="1.6" fill="#0b7285"/>'
              : s.kind === "fly"
                ? '<path d="M6 19l28-7-28-7 5 7z" fill="none" stroke="#a3168f" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 25h32" stroke="#c8d0da" stroke-width="1.4"/>'
                : '<rect x="4" y="5" width="22" height="3" rx="1.5" fill="#0f1722"/><rect x="4" y="12" width="32" height="2" rx="1" fill="#c8d0da"/><rect x="4" y="17" width="28" height="2" rx="1" fill="#c8d0da"/><rect x="4" y="22" width="30" height="2" rx="1" fill="#c8d0da"/>';
    svg.innerHTML = body;
    return svg;
  }
  /** forget every thumbnail (theme, deck added): their live views stop with them */
  private clearThumbs() {
    for (const t of this.thumbs.values()) t.view?.destroy();
    this.thumbs.clear();
  }
  private pumpThumbs() {
    if (this.thumbTimer || !this.thumbQueue.length) return;
    // a few thumbnails per tick (about 12 ms of work), so the last ones of a deck never wait long on a slow machine
    const run = () => {
      this.thumbTimer = 0;
      const t0 = performance.now();
      do {
        const job = this.thumbQueue.shift();
        if (job && !this.destroyed) job();
      } while (this.thumbQueue.length && performance.now() - t0 < 12);
      if (this.thumbQueue.length) this.thumbTimer = window.setTimeout(run, 16);
    };
    this.thumbTimer = window.setTimeout(run, 30);
  }
  /** changes when a scene's content changes (a situation edited in place keeps its length and its id) */
  private scenesKey(): string {
    const s = JSON.stringify(this.course.scenes);
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return `${s.length}.${hash}`;
  }
  private makeSims(): SceneSims {
    this.simsKey = this.scenesKey();
    return new SceneSims({
      scenes: this.course.scenes,
      cockpit: this.course.cockpit,
    });
  }
  private ensureSims() {
    const k = this.scenesKey();
    if (k !== this.simsKey) {
      this.sims.destroy();
      this.sims = this.makeSims();
      // the strip's thumbnails drew from the Sims just destroyed (a live readout, the view from the cockpit):
      // redraw them from the new ones, or they stay blank
      if (!this.stripRedraw && this.stepsEl) {
        this.stripRedraw = true;
        queueMicrotask(() => {
          this.stripRedraw = false;
          if (!this.destroyed) this.renderSteps();
        });
      }
    }
  }

  // ---------------------------------------------------------------- toolbar
  private renderTool() {
    const s = this.step;
    const fr = this.lang === "fr";
    const miss = courseMissingFr(this.course);
    // the slides' words in FR or EN (never the app's own language toggle): a labelled dropdown, FR first
    const missing =
      miss && this.course.langs.includes("fr")
        ? fr
          ? `${miss} manquant${miss > 1 ? "s" : ""}`
          : `${miss} missing`
        : "";
    const langSel = h(
      "select",
      {
        class: "ce-in ce-lang-sel",
        "aria-label": fr ? "Langue de la diapo" : "Slide language",
      },
      ...(["fr", "en"] as Lang[]).map((l) => {
        const o = h("option", { value: l }, l.toUpperCase() + (l === "fr" && missing ? ` · ${missing}` : ""));
        o.selected = this.lang === l;
        return o;
      }),
    ) as HTMLSelectElement;
    langSel.addEventListener("change", () => this.setLang(langSel.value as Lang));
    const langSeg = h(
      "label",
      {
        class: "ce-lang",
        title: fr
          ? "La langue du texte des diapos (pas celle de l’application)"
          : "The language of the slides’ text (not the app’s)",
      },
      h("span", { class: "ce-lang-l" }, fr ? "Langue de la diapo" : "Slide language"),
      langSel,
      missing && this.lang === "en" ? h("span", { class: "ce-tag warn" }, `FR ${missing}`) : null,
    );
    if (!s) {
      this.toolEl.replaceChildren(langSeg);
      return;
    }
    const n = revealsOf(s);
    const revealSeg =
      n > 0
        ? h(
            "div",
            { class: "ce-reveal" },
            h("span", { class: "ce-muted sm" }, fr ? "Apparition" : "Reveal"),
            seg(
              [
                ...(s.slide ? [{ value: -1, label: fr ? "Tout" : "All" }] : []),
                ...Array.from({ length: n + (s.slide ? 1 : 0) }, (_, k) => ({
                  value: s.slide ? k : k + 1,
                  label:
                    s.slide && k === 0
                      ? fr
                        ? "Début"
                        : "Start"
                      : String(s.slide ? k : k + 1),
                })),
              ],
              this.reveal === null ? (s.slide ? -1 : n) : this.reveal,
              (v) => {
                this.reveal = v < 0 ? null : v;
                if (this.canvasEd) this.canvasEd.previewReveal(this.reveal);
                else this.rebuildPreview();
                this.renderTool();
              },
            ),
          )
        : null;
    if (s.slide) {
      const layoutB = btn(
        fr ? "Mise en page" : "Layout",
        () => {
          popover(
            layoutB,
            layoutPicker(this.lang, s.slide?.layout, this.course, (id) => {
              closePop();
              this.applyLayout(id);
            }),
            {
              width: 520,
              title: fr ? "Mise en page de cette diapo" : "This slide's layout",
              cls: "scroll",
            },
          );
        },
        { cls: "sm ghost", icon: "layout" },
      );
      const themeB = btn(
        fr ? "Thème" : "Theme",
        () => {
          const cur = baseThemeId(this.course.theme);
          const box = h("div", { class: "ce-popbody" });
          box.append(
            themePicker(this.lang, cur, (id) => {
              closePop();
              // one theme per course: older per-slide overrides are dropped (SPEC slides v2 §4)
              const steps = this.course.steps.map((x) => {
                if (!x.slide?.theme) return x;
                const { theme: _t, ...rest } = x.slide;
                void _t;
                return { ...x, slide: rest };
              });
              this.apply({ ...this.course, theme: id, steps }, undefined, {
                inspector: true,
              });
              this.canvasFor = "";
              this.clearThumbs();
              this.renderSteps();
              this.renderCentre();
              if (this.studio.open) this.studio.refresh();
            }),
            h(
              "p",
              { class: "ce-note muted" },
              fr
                ? "Un thème pour tout le cours : Clair par défaut, Sombre si vous préférez."
                : "One theme for the whole course: Light by default, Dark if you prefer.",
            ),
          );
          popover(themeB, box, {
            width: 420,
            title: fr ? "Thème du cours" : "Course theme",
          });
        },
        { cls: "sm ghost", icon: "theme" },
      );
      // always-visible Undo / Redo (an iPad has no ⌘Z)
      // icons always come with a word (UX logic §3)
      const undoB = btn(fr ? "Annuler" : "Undo", () => this.undo(), {
        cls: "sm ghost ce-undo",
        icon: "undo",
        // « Annuler » alone also means « cancel »: the tooltip says it undoes the last change
        title: t2(this.lang, `Undo the last change (${modKey()}Z)`, `Annuler la modification (${modKey()}Z)`),
        disabled: !this.history.canUndo,
      });
      const redoB = btn(fr ? "Rétablir" : "Redo", () => this.redo(), {
        cls: "sm ghost ce-redo",
        icon: "redo",
        title: t2(
          this.lang,
          `Redo (${isMac ? "⇧⌘Z" : "Ctrl+Y"})`,
          `Rétablir (${isMac ? "⇧⌘Z" : "Ctrl+Y"})`,
        ),
        disabled: !this.history.canRedo,
      });
      // zoom: − 100 % + (pinch and ⌘ + wheel too)
      const zoomBox = h("div", {
        class: "ce-zoom",
        role: "group",
        "aria-label": fr ? "Zoom" : "Zoom",
      });
      const zOut = btn("", () => this.setZoom(this.zoom / 1.25), {
        cls: "sm ic ghost",
        icon: "minus",
        title: fr ? "Zoom arrière" : "Zoom out",
        disabled: this.zoom <= 1,
      });
      const zVal = h(
        "button",
        {
          type: "button",
          class: "ce-zoom-v",
          title: fr ? "Ajuster à l’écran" : "Fit to screen",
        },
        this.zoom <= 1
          ? fr
            ? "Ajusté"
            : "Fit"
          : `${Math.round(this.zoom * 100)} %`,
      );
      zVal.addEventListener("click", () => this.setZoom(1));
      const zIn = btn("", () => this.setZoom(this.zoom * 1.25), {
        cls: "sm ic ghost",
        icon: "plus",
        title: fr ? "Zoom avant" : "Zoom in",
        disabled: this.zoom >= 4,
      });
      zOut.replaceChildren(railIcon("minus", "M5 12h14"));
      zoomBox.append(zOut, zVal, zIn);
      const multi = this.canvasEd?.multiSelect ?? false;
      const multiB = h(
        "button",
        {
          type: "button",
          class: `ce-btn sm ghost ce-multi${multi ? " on" : ""}`,
          "aria-pressed": multi ? "true" : "false",
          title: fr
            ? "Sélection multiple : chaque toucher ajoute un bloc (Maj + clic au clavier)"
            : "Select several: each tap adds a block (Shift + click with a keyboard)",
        },
        railIcon(
          "multi",
          "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M15 15l2 2 4-4",
        ),
        h("span", {}, fr ? "Sélectionner plusieurs" : "Select several"),
      );
      multiB.addEventListener("click", () => {
        this.canvasEd?.setMultiSelect(!multi);
        this.renderTool();
      });
      const inspB = h(
        "button",
        {
          type: "button",
          class: `ce-btn sm ghost ce-insp-t${this.inspOpen ? " on" : ""}`,
          "aria-pressed": this.inspOpen ? "true" : "false",
          title: this.inspOpen
            ? fr
              ? "Masquer les propriétés"
              : "Hide the properties"
            : fr
              ? "Afficher les propriétés"
              : "Show the properties",
        },
        railIcon("panel", "M4 4h16v16H4z M15 4v16"),
        h("span", {}, fr ? "Propriétés" : "Properties"),
      );
      inspB.addEventListener("click", () => this.toggleInspector());
      this.toolEl.replaceChildren(
        h(
          "div",
          { class: "ce-ctool-row" },
          undoB,
          redoB,
          h("span", { class: "ce-vsep" }),
          layoutB,
          themeB,
          h("span", { class: "ce-sp" }),
          multiB,
          zoomBox,
          h("span", { class: "ce-vsep" }),
          langSeg,
          inspB,
        ),
      );
      this.revealHost.replaceChildren(...(revealSeg ? [revealSeg] : []));
      this.toolEl.classList.remove("two");
    } else {
      const dev = seg(
        [
          { value: "ipad" as Device, label: "iPad" },
          {
            value: "projector" as Device,
            label: fr ? "Projecteur" : "Projector",
          },
          { value: "phone" as Device, label: fr ? "Téléphone" : "Phone" },
        ],
        this.device,
        (d) => {
          this.device = d;
          this.renderTool();
          this.renderCentre();
        },
        { label: fr ? "Aperçu sur" : "Preview as" },
      );
      this.toolEl.replaceChildren(
        h(
          "div",
          { class: "ce-ctool-row" },
          dev,
          langSeg,
          h("span", { class: "ce-sp" }),
          revealSeg,
        ),
      );
      this.toolEl.classList.remove("two");
    }
  }
  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.el.lang = l;
    this.o.onLang?.(l);
    this.tray.setLang(l);
    this.canvasEd?.setLang(l);
    if (this.studio.open) this.studio.refresh();
    this.renderRail();
    this.renderTop();
    this.renderSteps();
    this.renderTool();
    this.renderStepBar();
    this.inspector.render();
    if (!this.canvasEd) this.rebuildPreview();
  }

  // ---------------------------------------------------------------- centre: player preview or canvas
  private renderCentre() {
    const s = this.step;
    this.startEl?.destroy();
    this.startEl = null;
    if (!s) {
      // an empty course: one sentence and two ways to start (UX logic §8); the templates are the rail's « Modèles »,
      // highlighted — the gallery of whole courses lives on the Nouveau cours page, before the course exists
      this.teardownCentre();
      const fr = this.lang === "fr";
      const pick = h(
        "button",
        { type: "button", class: "ce-btn ce-start-b primary" },
        fr ? "Choisir un modèle" : "Choose a template",
      );
      pick.addEventListener("click", () => this.openPanel("templates"));
      const blank = h(
        "button",
        { type: "button", class: "ce-btn ce-start-b" },
        fr ? "Ajouter une diapo vierge" : "Add a blank slide",
      );
      blank.addEventListener("click", () =>
        this.addDeck(BLANK_STARTER, this.course.theme ?? "classroom"),
      );
      this.stageArea.replaceChildren(
        h(
          "div",
          { class: "ce-start ce-start-empty" },
          h(
            "div",
            { class: "ce-start-hd" },
            h(
              "h2",
              {},
              fr
                ? "Ce cours n’a pas encore de diapo"
                : "This course has no slide yet",
            ),
            h(
              "p",
              {},
              fr
                ? "Ajoutez une première diapo : choisissez un modèle à gauche, ou une diapo vierge."
                : "Add a first slide: choose a template on the left, or a blank slide.",
            ),
            h("div", { class: "ce-start-act" }, pick, blank),
          ),
        ),
      );
      return;
    }
    if (s.slide) {
      if (this.canvasEd && this.canvasFor === s.id) return;
      this.teardownCentre();
      const wrap = h("div", { class: "ce-canvaswrap" });
      this.stageArea.replaceChildren(wrap);
      this.canvasFor = s.id;
      this.sel = [];
      this.canvasEd = new CanvasEditor(wrap, s.slide, {
        lang: this.lang,
        theme: this.course.theme,
        brand: this.course.brand,
        scenes: this.course.scenes,
        cockpit: this.course.cockpit,
        assetUrl: (id) => this.assetUrl(id),
        step: s,
        label: tr(s.title, this.lang),
        onZoom: (z) => {
          this.zoom = z;
          this.renderTool();
        },
        slideMenu: () => this.slideMenuItems(),
        onChange: (c, final) => {
          this.syncEmpty(c);
          // the inspector reads the selected blocks: keep them the canvas's current ones (an inline text edit,
          // a drag) so it never shows, then writes back, a stale copy
          if (this.sel.length)
            this.sel = this.sel.map(
              (b) => c.blocks.find((x) => x.id === b.id) ?? b,
            );
          if (!final) return;
          const st = this.step;
          if (!st || st.id !== this.canvasFor) return;
          // a slide still named « Nouvelle diapo » takes its title's words (filmstrip, player, end screen)
          const named = slideNameFromTitle(st, c);
          this.apply(replaceStep(this.course, { ...st, slide: c, ...(named ? { title: named } : {}) }), this.groupKey, {
            centre: false,
            inspector:
              this.inspector.currentTab === "block" &&
              !this.sitBusy &&
              !this.inspector.el.contains(document.activeElement),
          });
        },
        onSelect: (_ids, blocks) => {
          const was = this.simSelectionId();
          this.sel = blocks;
          // with a rail panel open, the properties show over the slide's edge only while something is selected
          this.bodyEl.classList.toggle("has-sel", blocks.length > 0);
          // an element picked (or just added from Instruments, Questions…) while a rail panel is open: the panel
          // closes, as in a slide tool, so the slide refits beside the properties and is never cut under them
          // (re-walk P1). The simulator panel stays: it follows the selection.
          if (
            blocks.length &&
            this.studio.open &&
            this.studio.tab !== "cockpit" &&
            window.matchMedia?.("(min-width: 1366px) and (max-width: 1919px)").matches
          )
            this.closePanel();
          if (this.studio.tab === "cockpit" && was !== this.simSelectionId()) this.studio.refresh();
          if (
            this.inspector.currentTab !== "block" &&
            blocks.length &&
            this.inspector.currentTab !== "goal"
          )
            this.inspector.setTab("block");
          else this.inspector.render();
        },
      });
      if (this.reveal !== null) this.canvasEd.previewReveal(this.reveal);
      this.zoom = 1;
      this.syncEmpty(s.slide);
      return;
    }
    this.teardownCentre();
    const d = DEVICE[this.device];
    this.screen = h("div", {
      class: "ce-screen",
      style: `width:${d.w}px;height:${d.h}px`,
    });
    this.deviceEl = h(
      "div",
      { class: `ce-device ${this.device}` },
      this.screen,
    );
    const box = h("div", { class: "ce-devbox" }, this.deviceEl);
    this.stageArea.replaceChildren(box);
    this.rebuildPreview();
    this.fitDevice();
  }
  /**
   * Over an empty slide: « Que voulez-vous montrer ? » (the first-run card); once « Partir d'une diapo vide » is
   * chosen, light hints on the slide itself (« Cliquez pour ajouter un titre », + Instrument, + Texte, + Question),
   * never a rail opened by itself. Both go as soon as the slide has a block.
   */
  private syncEmpty(c: SlideCanvas) {
    const id = this.step?.id ?? "";
    const bare = slideIsBare(c);
    const want: "" | "card" | "hints" = !bare ? "" : this.emptyBlank.has(id) ? "hints" : "card";
    // the « Nouvelle diapo » got its content (or « diapo vide »): it stays, and the toast says where it went
    if (this.pendingNew?.id === id && want !== "card") {
      this.pendingNew = null;
      this.toast(addedWhere(this.lang, this.i, this.course.steps.length));
    }
    if (this.emptyEl && this.emptyEl.dataset.kind === want) return;
    this.emptyKill?.();
    this.emptyKill = null;
    this.emptyEl?.remove();
    this.emptyEl = null;
    if (!want) return;
    const wrap = this.stageArea.querySelector(".ce-canvaswrap");
    if (!wrap) return;
    if (want === "hints") {
      this.emptyEl = h("div", { class: "ce-empty-wrap ce-blank-hints", "data-kind": "hints" }, this.blankHints());
      wrap.append(this.emptyEl);
      return;
    }
    const card = emptySlideCard(
      this.lang,
      {
        layout: (id) => this.applyLayout(id),
        flight: () => this.addSimContent("flight"),
        more: () => this.openPanel("templates"),
        example: (id) => {
          // the first slides of « Que voulez-vous montrer ? » (samples/showcaseDecks.ts), then the gallery's
          const ex = startSlide(id);
          if (!ex) return;
          // a cover says the course's own title (« Le virage en palier »), not the example's
          let slide = ex.slide;
          const ct = this.course.title;
          const named =
            !!tr(ct, "en").trim() && !/^(untitled course|cours sans titre)$/i.test(tr(ct, "en").trim());
          if (named && /cover$/.test(id)) {
            const st = titleOnCover({ id: "x", kind: "slide", title: ex.title, slide } as Step, ct);
            if (st.slide) slide = st.slide;
          }
          this.addComposedSlide(slide, ex.title, showcaseScenes());
        },
        blank: () => {
          this.emptyBlank.add(this.step?.id ?? "");
          if (this.canvasEd) this.syncEmpty(this.canvasEd.canvas);
        },
        cancel: this.pendingNew?.id === id ? () => this.dropPending() : undefined,
      },
      {
        theme: this.course.theme,
        brand: this.course.brand,
        scenes: this.course.scenes,
        cockpit: this.course.cockpit,
        starts: this.ifrCourse() ? EMPTY_STARTS : EMPTY_STARTS_VFR,
      },
    );
    this.emptyKill = card.destroy;
    this.emptyEl = h("div", { class: "ce-empty-wrap", "data-kind": "card" }, card.el);
    wrap.append(this.emptyEl);
  }
  /** The empty slide's own hints: a title zone to click, then one button per kind of content. */
  private blankHints(): HTMLElement {
    const fr = this.lang === "fr";
    const title = h(
      "button",
      { type: "button", class: "ce-bh-title" },
      fr ? "Cliquez pour ajouter un titre" : "Click to add a title",
    );
    title.addEventListener("click", (e) => {
      e.stopPropagation();
      const d = libraryItem("text:title")?.make();
      if (!d || !this.canvasEd) return;
      // the title sits where a title goes (top left), its words selected: typing replaces them
      const b = this.canvasEd.add(d, [96 + d.frame.w / 2, 96 + d.frame.h / 2]);
      this.canvasEd.openText(b.id, { selectAll: true, placeholder: true });
    });
    const add = (label: string, run: () => void) => {
      const b = h("button", { type: "button", class: "ce-bh-add" }, h("span", { "aria-hidden": "true" }, "+"), label);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      return b;
    };
    const el = h(
      "div",
      { class: "ce-bh", role: "group", "aria-label": fr ? "Diapo vide" : "Empty slide" },
      title,
      h(
        "div",
        { class: "ce-bh-row" },
        add(fr ? "Instrument" : "Instrument", () => this.openPanel("instruments")),
        add(fr ? "Texte" : "Text", () => this.openPanel("text")),
        add(fr ? "Question" : "Question", () => {
          const d = libraryItem("interactive:quiz")?.make();
          if (d) this.canvasEd?.add(d);
        }),
      ),
    );
    for (const b of el.querySelectorAll("button")) b.addEventListener("pointerdown", (e) => e.stopPropagation());
    return el;
  }
  /** An instrument-rating or airline course (its first slides may show an ILS); else a VFR course. */
  private ifrCourse(): boolean {
    const p = this.course.program;
    const ps = Array.isArray(p) ? p : p ? [p] : [];
    return ps.some((x) => x === "ir" || x === "atpl");
  }
  /** Right click / long press on the empty slide: slide-level actions. */
  private slideMenuItems() {
    const fr = this.lang === "fr";
    return [
      {
        label: fr ? "Modèles de diapo…" : "Slide templates…",
        icon: "arrange",
        run: () => this.openPanel("templates"),
      },
      {
        label: fr ? "Ajouter un instrument…" : "Add an instrument…",
        icon: "center",
        run: () => this.openPanel("instruments"),
      },
      {
        label: fr ? "Ajouter un schéma…" : "Add a diagram…",
        icon: "center",
        run: () => this.openPanel("diagrams"),
      },
      {
        label: fr ? "Dupliquer la diapo" : "Duplicate the slide",
        icon: "duplicate",
        run: () => this.duplicate(),
      },
    ];
  }
  private teardownCentre() {
    this.emptyKill?.();
    this.emptyKill = null;
    this.emptyEl?.remove();
    this.emptyEl = null;
    this.player?.destroy();
    this.player = null;
    this.canvasEd?.destroy();
    this.canvasEd = null;
    this.canvasFor = "";
    this.sel = [];
    this.bodyEl?.classList.remove("has-sel");
    this.screen = null;
    this.deviceEl = null;
  }
  private fitDevice() {
    if (!this.deviceEl || !this.screen) return;
    const d = DEVICE[this.device];
    const r = this.stageArea.getBoundingClientRect();
    const W = d.w + 2 * d.bezel;
    const H = d.h + 2 * d.bezel;
    const k = Math.max(0.2, Math.min((r.width - 8) / W, (r.height - 8) / H, 1));
    this.deviceEl.style.width = `${W}px`;
    this.deviceEl.style.height = `${H}px`;
    this.deviceEl.style.padding = `${d.bezel}px`;
    this.deviceEl.style.transform = `scale(${k})`;
    const box = this.deviceEl.parentElement!;
    box.style.width = `${W * k}px`;
    box.style.height = `${H * k}px`;
  }
  private schedulePreview() {
    clearTimeout(this.previewTimer);
    if (this.canvasEd) return;
    this.previewTimer = window.setTimeout(() => this.rebuildPreview(), 450);
  }
  /** The real player on this step, as a student would see it (its top bar and footer hidden). */
  private rebuildPreview() {
    clearTimeout(this.previewTimer);
    if (!this.screen || this.testEl) return;
    const s = this.step;
    if (!s || s.slide) return;
    this.player?.destroy();
    this.player = null;
    this.screen.replaceChildren();
    try {
      const p = new CoursePlayer({
        course: this.course,
        store: null,
        preview: true,
        lang: this.lang,
        stepId: s.id,
        mode: t2(this.lang, "preview", "aperçu"),
        assetUrl: (id) => this.assetUrl(id),
        navigate: () =>
          this.toast(
            t2(
              this.lang,
              "In the preview, Fly it stays here: use Test as student.",
              "Dans l’aperçu, le vol reste ici : utilisez Aperçu élève.",
            ),
          ),
        onStep: (id) => {
          if (id !== this.step?.id) {
            const j = this.course.steps.findIndex((x) => x.id === id);
            if (j >= 0) this.select(j, false);
          }
        },
      });
      p.mount(this.screen);
      this.player = p;
      const n = revealsOf(s);
      const want = this.reveal === null ? n : Math.min(this.reveal, n);
      for (let k = 0; k < want; k++) p.next();
    } catch (e) {
      console.error("preview", e);
      this.screen.replaceChildren(
        h(
          "div",
          { class: "ce-blank" },
          h(
            "p",
            {},
            t2(
              this.lang,
              "This slide cannot be previewed yet: see More › Checks.",
              "Cette diapo ne peut pas encore être prévisualisée : voir Plus › Vérifications.",
            ),
          ),
        ),
      );
    }
  }

  // ---------------------------------------------------------------- designed slides: toolbar, library
  private async addImageBlock(f: File) {
    const r = await this.importImage(f);
    if (!r || !this.canvasEd) return;
    const w = Math.min(960, r.w);
    const hh = Math.round((w * r.h) / r.w / 24) * 24 || 240;
    const d: BlockDraft = {
      kind: "image",
      image: { asset: r.asset },
      alt: { en: "" },
      fit: "cover",
      frame: { w, h: Math.min(1008, hh) },
    };
    this.canvasEd.add(d);
  }
  /** Zoom the slide (1 = fit); the canvas keeps the visible centre. */
  private setZoom(z: number) {
    this.canvasEd?.setZoom(z);
  }
  private applyLayout(id: NonNullable<SlideCanvas["layout"]>) {
    const s = this.step;
    if (!s?.slide) return;
    const before = this.course;
    const made = makeStep(this.course, "slide", {
      layout: id,
      scene: s.slide.scene,
      title: s.title,
    });
    const slide = made.step.slide!;
    if (s.slide.scene) slide.scene = s.slide.scene;
    this.apply(replaceStep(made.course, { ...s, slide }), undefined, {
      inspector: true,
    });
    this.canvasEd?.load(slide);
    this.toast(
      t2(this.lang, "Layout applied", "Mise en page appliquée"),
      () => {
        this.apply(before, undefined, { inspector: true });
        const st = this.step;
        if (st?.slide) this.canvasEd?.load(st.slide);
      },
    );
  }

  // ---------------------------------------------------------------- step bar
  private renderStepBar() {
    const s = this.step;
    const fr = this.lang === "fr";
    if (!s) {
      this.stepBar.replaceChildren();
      this.stepBar.hidden = true;
      return;
    }
    this.stepBar.hidden = false;
    const t = stepBarText(this.course, this.i, this.lang);
    const more = btn(fr ? "Plus" : "More", () => this.moreMenu(more), {
      cls: "sm ghost",
      icon: "dots",
      title: fr ? "Plus d’actions sur la diapo" : "More slide actions",
    });
    this.stepBar.replaceChildren(
      this.kindChip(s),
      h(
        "span",
        { class: "ce-sbt" },
        h("b", {}, t.head),
        t.tail ? ` · ${t.tail}` : "",
      ),
      ...(s.slide ? [this.revealHost] : []),
      h("span", { class: "ce-sp" }),
      btn(fr ? "Dupliquer" : "Duplicate", () => this.duplicate(), {
        cls: "sm quiet hide-s",
        title: fr ? "Dupliquer (D)" : "Duplicate (D)",
      }),
      (() => {
        // « Déplacer » with arrows that move, not navigation chevrons: this moves the slide, it does not turn the page
        const b = btn(fr ? "Déplacer avant" : "Move earlier", () => this.move(-1), {
          cls: "sm ghost",
          title: fr ? "Déplacer avant (Alt+←)" : "Move earlier (Alt+←)",
          disabled: this.i === 0,
        });
        b.prepend(railIcon("l", "M19 12H5M11 6l-6 6 6 6"));
        return b;
      })(),
      (() => {
        const b = btn(fr ? "Déplacer après" : "Move later", () => this.move(1), {
          cls: "sm ghost",
          title: fr ? "Déplacer après (Alt+→)" : "Move later (Alt+→)",
          disabled: this.i >= this.course.steps.length - 1,
        });
        b.append(railIcon("r", "M5 12h14M13 6l6 6-6 6"));
        return b;
      })(),
      more,
    );
  }
  private moreMenu(anchor: HTMLElement) {
    const s = this.step;
    if (!s) return;
    const fr = this.lang === "fr";
    popover(
      anchor,
      [
        s.slide
          ? {
              label: fr
                ? "Convertir en page de lecture avec un instrument"
                : "Convert to a reading page with an instrument",
              sub: fr
                ? "Le premier instrument accompagne le texte"
                : "The first instrument goes beside the text",
              icon: "convert",
              onClick: () => this.convert(),
            }
          : {
              label: fr
                ? "Convertir en diapo libre"
                : "Convert to a designed slide",
              sub: fr
                ? "Scène, légendes et texte placés sur la diapo"
                : "Stage, callouts and text laid out on a slide",
              icon: "convert",
              onClick: () => this.convert(),
            },
        {
          label: fr ? "Changer de type…" : "Change what it teaches…",
          sub: fr
            ? "Le texte, la scène et les légendes restent"
            : "Text, scene and callouts stay",
          icon: "layout",
          onClick: () => this.changeKindMenu(anchor),
        },
        {
          label: fr ? "Supprimer la diapo" : "Delete the slide",
          icon: "trash",
          danger: true,
          onClick: () => this.deleteStep(),
        },
      ],
      { width: 300, align: "end" },
    );
  }
  private changeKindMenu(anchor: HTMLElement) {
    const s = this.step;
    if (!s) return;
    popover(
      anchor,
      TEMPLATES.filter((t) => t.id !== "slide" || !s.slide).map((t) => ({
        label: tr(t.title, this.lang),
        sub: tr(t.intent, this.lang),
        on: t.kind === s.kind,
        onClick: () => {
          const r = changeKind(this.course, s, t.id);
          this.apply(replaceStep(r.course, r.step), undefined, {
            inspector: true,
          });
          this.renderCentre();
        },
      })),
      {
        width: 340,
        align: "end",
        title: t2(this.lang, "Change to", "Changer en"),
        cls: "scroll",
      },
    );
  }
  private convert() {
    const s = this.step;
    if (!s) return;
    const next = s.slide
      ? toReaderStage(s, this.course)
      : toDesignedSlide(s, this.course);
    const before = this.course;
    this.apply(replaceStep(this.course, next), undefined, { inspector: true });
    this.renderCentre();
    this.toast(
      s.slide
        ? t2(
            this.lang,
            "Converted to reader + stage",
            "Converti en texte + scène",
          )
        : t2(
            this.lang,
            "Converted to a designed slide",
            "Converti en diapo libre",
          ),
      () => {
        this.apply(before, undefined, { inspector: true });
        this.renderCentre();
      },
    );
  }

  // ================================================================ step operations
  /** select a step by id (academy #edit=<id>&s=<step> links to the course already open) */
  goTo(stepId: string) {
    const i = this.course.steps.findIndex((s) => s.id === stepId);
    if (i >= 0) this.select(i, false);
  }
  select(i: number, notify = true) {
    if (i < 0 || i >= this.course.steps.length) return;
    // another slide picked while the « Nouvelle diapo » still has nothing: it goes away, the pick stays
    const p = this.pendingNew;
    if (p && this.course.steps[i].id !== p.id) {
      const want = this.course.steps[i].id;
      if (this.dropPending(false)) i = Math.max(0, this.course.steps.findIndex((s) => s.id === want));
    }
    const changed = i !== this.i;
    this.i = i;
    if (changed) this.reveal = null;
    this.renderSteps();
    this.renderTool();
    this.renderStepBar();
    this.renderCentre();
    this.inspector.render();
    this.renderRail();
    // a rail tab that only fits a designed slide closes on a Reader + Stage step; others re-draw for the step
    if (this.studio.tab && SLIDE_ONLY.has(this.studio.tab) && !this.step?.slide)
      this.closePanel();
    else if (changed && this.studio.tab === "templates") this.studio.refresh();
    else if (changed && this.studio.tab && SLIDE_ONLY.has(this.studio.tab))
      this.studio.refresh();
    if (notify && changed) this.o.onStep?.(this.step.id);
  }
  private insert(r: { course: Course; step: Step }) {
    const at = this.course.steps.length ? this.i + 1 : 0;
    this.apply(insertStep(r.course, r.step, at), undefined, { centre: false });
    this.select(at);
    this.liveEl.textContent = `${tr(r.step.title, this.lang)}: ${t2(this.lang, "added", "ajouté")}`;
  }
  /**
   * « Ajouter » (the strip's + tile, the Simulateur panel): a new slide showing « Que voulez-vous montrer ? ». It
   * only stays once a choice is made; Échap, « Annuler » or another slide takes it away, with nothing to undo.
   */
  newSlide(o: { end?: boolean } = {}) {
    this.dropPending(false);
    const prev = this.i;
    if (o.end && this.course.steps.length) this.i = this.course.steps.length - 1;
    this.addTemplate("slide", { layout: "blank" });
    const s = this.step;
    if (!s?.slide || !slideIsBare(s.slide) || this.course.steps.length < 2) return;
    this.pendingNew = { id: s.id, prev, depth: this.history.depth };
    // the card is drawn again with its « Ne pas ajouter · Échap », and takes the focus (Échap reaches the editor)
    if (this.emptyEl) this.emptyEl.dataset.kind = "";
    if (this.canvasEd) this.syncEmpty(this.canvasEd.canvas);
    this.emptyEl?.querySelector<HTMLElement>(".ce-fr")?.focus({ preventScroll: true });
  }
  /** Take the « Nouvelle diapo » away when it still has nothing chosen; true when it went. */
  private dropPending(reselect = true): boolean {
    const p = this.pendingNew;
    this.pendingNew = null;
    if (!p) return false;
    const j = this.course.steps.findIndex((s) => s.id === p.id);
    const s = this.course.steps[j];
    if (j < 0 || !slideIsBare(s?.slide) || this.emptyBlank.has(p.id)) return false;
    const back = this.history.discard(p.depth);
    if (back) {
      this.course = back;
      this.changed({ inspector: true, centre: false });
    } else this.apply(removeStep(this.course, j), undefined, { centre: false, inspector: true });
    this.thumbs.get(p.id)?.view?.destroy();
    this.thumbs.delete(p.id);
    this.liveEl.textContent = t2(this.lang, "No slide added", "Aucune diapo ajoutée");
    if (reselect) {
      this.i = -1;
      this.select(Math.max(0, Math.min(p.prev, this.course.steps.length - 1)));
    }
    return true;
  }
  addTemplate(id: TemplateId, o: { layout?: SlideCanvas["layout"] } = {}) {
    const cur = this.step;
    const sceneId = cur?.stage?.scene ?? cur?.slide?.scene;
    let suggested: ReturnType<typeof suggestGoals> = [];
    if (sceneId && (id === "try" || id === "fly")) {
      const info = this.stageInfo(sceneId);
      if (info)
        try {
          suggested = suggestGoals(
            stageView(info.sim, { cockpit: this.course.cockpit }),
            info.scene,
          );
        } catch {
          suggested = [];
        }
    }
    this.insert(
      makeStep(this.course, id, {
        scene: sceneId,
        layout: o.layout,
        suggested: suggested.slice(0, 3).map((x) => x.check),
      }),
    );
  }
  private async addFromTray(it: TrayItem, id: TemplateId) {
    let suggested: ReturnType<typeof suggestGoals> = [];
    if (id === "try" || id === "fly") {
      try {
        const sims = new SceneSims({
          scenes: { [it.scene.id]: it.scene },
          cockpit: it.scene.cockpit,
        });
        const e = sims.get(it.scene.id);
        if (e)
          suggested = suggestGoals(
            stageView(e.sim, { cockpit: it.scene.cockpit }),
            e.scene,
          );
        sims.destroy();
      } catch {
        suggested = [];
      }
    }
    // the capture's images: their real type and size from the store
    const refs: Record<string, AssetRef> = {};
    const thumb = it.thumb ?? it.scene.captured?.thumb;
    const still = it.still ?? it.scene.captured?.still;
    for (const [aid, role, w, hh] of [
      [thumb, "thumb", 320, 240],
      [still, "still", 480, 270],
    ] as const) {
      if (!aid || this.course.assets[aid]) continue;
      const blob = await this.store?.getAsset(aid).catch(() => null);
      if (blob)
        refs[aid] = {
          id: aid,
          mime: (blob.type || "image/jpeg") as AssetRef["mime"],
          w,
          h: hh,
          bytes: blob.size,
          role,
        };
    }
    this.insert(
      stepFromTray(
        this.course,
        it,
        id,
        { suggested: suggested.slice(0, 3).map((x) => x.check) },
        refs,
      ),
    );
    void this.store?.removeTray(it.id).then(() => this.tray.refresh());
  }
  private duplicate() {
    const r = duplicateStep(this.course, this.i);
    if (!r) return;
    this.apply(r.course, undefined, { centre: false });
    this.select(this.i + 1);
    this.toast(t2(this.lang, "Slide duplicated", "Diapo dupliquée"));
  }
  private move(d: number) {
    const to = this.i + d;
    if (to < 0 || to >= this.course.steps.length) return;
    this.apply(moveStep(this.course, this.i, to), undefined, { centre: false });
    this.i = to;
    this.renderSteps();
    this.renderStepBar();
  }
  private deleteStep() {
    const s = this.step;
    if (!s) return;
    const before = this.course;
    const at = this.i;
    this.apply(removeStep(this.course, this.i), undefined, { centre: false });
    this.i = Math.min(at, this.course.steps.length - 1);
    this.select(Math.max(0, this.i));
    this.renderCentre();
    this.toast(
      `${t2(this.lang, "Deleted:", "Supprimé :")} ${tr(s.title, this.lang)}`,
      () => {
        this.apply(before, undefined, { centre: false });
        this.select(at);
      },
    );
  }

  // ---------------------------------------------------------------- drag to reorder (mouse at once, touch after a press)
  private dragStart(e: PointerEvent, i: number, row: HTMLElement) {
    if (e.button !== 0) return;
    const touch = e.pointerType !== "mouse";
    // the filmstrip runs across (the list may still run down in a narrow layout)
    const across = getComputedStyle(this.stepsEl).flexDirection.startsWith(
      "row",
    );
    const pos = (ev: PointerEvent) => (across ? ev.clientX : ev.clientY);
    const d = {
      from: i,
      to: i,
      y0: pos(e),
      id: e.pointerId,
      started: false,
      timer: 0,
      row,
    };
    this.drag = d;
    const begin = () => {
      d.started = true;
      row.classList.add("dragging");
      this.stepsEl.classList.add("reordering");
      try {
        row.setPointerCapture(d.id);
      } catch {
        /* synthetic */
      }
    };
    if (touch) d.timer = window.setTimeout(begin, 320);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      if (!d.started) {
        if (touch) {
          if (Math.abs(pos(ev) - d.y0) > 8) cleanup();
          return;
        }
        if (Math.abs(pos(ev) - d.y0) < 6) return;
        begin();
      }
      ev.preventDefault();
      const rows = [...this.stepsEl.querySelectorAll<HTMLElement>(".ce-st")];
      let to = rows.length - 1;
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k].getBoundingClientRect();
        if (
          across
            ? ev.clientX < r.left + r.width / 2
            : ev.clientY < r.top + r.height / 2
        ) {
          to = k > d.from ? k - 1 : k;
          break;
        }
      }
      d.to = Math.max(0, Math.min(rows.length - 1, to));
      rows.forEach((r, k) =>
        r.classList.toggle(
          "drop-before",
          d.to !== d.from && k === (d.to > d.from ? d.to + 1 : d.to),
        ),
      );
      rows.forEach((r, k) =>
        r.classList.toggle(
          "drop-after",
          d.to !== d.from &&
            d.to > d.from &&
            d.to === rows.length - 1 &&
            k === rows.length - 1,
        ),
      );
      row.style.transform = across
        ? `translateX(${pos(ev) - d.y0}px)`
        : `translateY(${pos(ev) - d.y0}px)`;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const started = d.started;
      cleanup();
      if (started && d.to !== d.from) {
        this.apply(moveStep(this.course, d.from, d.to), undefined, {
          centre: false,
        });
        if (this.i === d.from) this.i = d.to;
        else if (d.from < this.i && d.to >= this.i) this.i--;
        else if (d.from > this.i && d.to <= this.i) this.i++;
        this.renderSteps();
        this.renderStepBar();
      }
      if (started) setTimeout(() => (this.drag = null), 0);
    };
    const cleanup = () => {
      clearTimeout(d.timer);
      row.classList.remove("dragging");
      row.style.transform = "";
      this.stepsEl.classList.remove("reordering");
      this.stepsEl
        .querySelectorAll(".drop-before, .drop-after")
        .forEach((x) => x.classList.remove("drop-before", "drop-after"));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!d.started) this.drag = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // ================================================================ checks
  private scheduleChecks(ms = 400) {
    clearTimeout(this.checksTimer);
    this.checksTimer = window.setTimeout(() => {
      try {
        this.checks = editorChecks(this.course, { airac: this.o.airac });
      } catch (e) {
        console.warn("checks", e);
        this.checks = [];
      }
      this.renderTop();
      this.renderSteps();
      this.checksPanel?.render(this.course, this.checks);
    }, ms);
  }
  private checksPanel: ChecksPanel | null = null;
  /** « 2 points à revoir » / « Rien à revoir » */
  private reviewSub(): string {
    const n = this.checks.length;
    const fr = this.lang === "fr";
    if (!n) return fr ? "Rien à revoir" : "Nothing to review";
    return fr
      ? `${n} ${n > 1 ? "points" : "point"} à revoir`
      : `${n} ${n > 1 ? "points" : "point"} to review`;
  }
  /** « Plus »: Vérifications, Exporter */
  private openMore() {
    const fr = this.lang === "fr";
    const items: MenuItem[] = [
      {
        label: fr ? "Vérifications" : "Checks",
        sub: this.reviewSub(),
        icon: "checks",
        onClick: () => this.openChecks(),
      },
    ];
    // « Voler et capturer » lives in the Simulateur panel only (one place, one step)
    // on a phone the bar keeps « ‹ · titre · Présenter · ⋯ »: Aperçu élève and Partager come here
    const phone = typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches;
    if (phone)
      items.unshift(
        {
          label: fr ? "Aperçu élève" : "Student preview",
          sub: fr ? "Le cours comme l’élève le voit, depuis cette diapo" : "The course as the student sees it, from this slide",
          icon: "play",
          disabled: !this.course.steps.length,
          onClick: () => this.testAsStudent(this.i),
        },
        {
          label: fr ? "Partager" : "Share",
          sub: fr ? "Un lien ou un fichier du cours" : "A link or a course file",
          icon: "share",
          disabled: !this.course.steps.length,
          onClick: () => this.share(this.checksBtn),
        },
      );
    if (!phone)
      items.push({
      label: fr ? "Exporter" : "Export",
      sub: fr ? "Un fichier de cours, un lien" : "A course file, a link",
      icon: "share",
      disabled: !this.course.steps.length,
      onClick: () => this.share(this.checksBtn),
    });
    popover(this.checksBtn, items, { align: "end", width: 320 });
  }
  private openChecks() {
    const panel = new ChecksPanel({
      lang: this.lang,
      onGoto: (id) => {
        closePop();
        const j = this.course.steps.findIndex((s) => s.id === id);
        if (j >= 0) this.select(j);
      },
      onClose: () => closePop(),
    });
    panel.render(this.course, this.checks);
    this.checksPanel = panel;
    popover(this.checksBtn, panel.el, {
      width: 400,
      align: "end",
      cls: "scroll",
    });
  }

  // ================================================================ saving
  private scheduleSave() {
    if (!this.store) return;
    if (this.saving !== "memory") this.saving = "pending";
    this.renderTop();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(
      () => void this.saveNow(),
      this.o.saveMs ?? 500,
    );
  }
  async saveNow(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    if (!this.store) return false;
    const no = this.changeNo;
    const c = { ...this.course, rev: Math.max(this.course.rev, this.savedRev) };
    if (this.saving !== "memory") this.saving = "saving";
    this.renderTop();
    const res = await this.store.save(c);
    if (this.destroyed) return res.ok;
    if (res.ok) {
      this.savedRev = res.course.rev;
      this.course = {
        ...this.course,
        rev: res.course.rev,
        updated: res.course.updated,
        ...(res.course.hash ? { hash: res.course.hash } : {}),
      };
      if (no === this.changeNo) this.history.amend(this.course);
      if (this.saving !== "memory")
        this.saving = no === this.changeNo ? "saved" : "pending";
    } else {
      this.saving = "error";
      this.toast(tr(res.message, this.lang));
    }
    this.renderTop();
    return res.ok;
  }
  /** edits since the last export (in memory-only mode they are lost with the tab) */
  private unexported = false;
  private onUnload = (e: BeforeUnloadEvent) => {
    if (this.saving === "pending") void this.saveNow();
    // private browsing / storage blocked: the course lives in this tab only, so ask before it is lost
    if (this.store?.backend === "memory" && this.unexported) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  // ================================================================ test, present, share, settings
  /** An empty course: say what to do instead of opening an empty player or presenter. */
  private needStepFirst() {
    this.toast(
      t2(
        this.lang,
        "Add a slide first: pick a template on the left, or a blank slide.",
        "Ajoutez une diapo d’abord : choisissez un modèle à gauche, ou une diapo vierge.",
      ),
    );
  }
  testAsStudent(from: number) {
    if (this.testEl) return;
    if (!this.course.steps.length) return this.needStepFirst();
    const s = this.course.steps[from];
    this.player?.destroy();
    this.player = null;
    this.canvasEd?.focus();
    const host = h("div", {
      class: "ce-test",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t2(this.lang, "Student preview", "Aperçu élève"),
    });
    document.body.append(host);
    this.testEl = host;
    const close = () => {
      this.testPlayer?.destroy();
      this.testPlayer = null;
      host.remove();
      this.testEl = null;
      document.removeEventListener("keydown", onEsc, true);
      if (!this.canvasEd) this.rebuildPreview();
      this.el.focus({ preventScroll: true });
    };
    const onEsc = (e: KeyboardEvent) => {
      // Esc inside a slide's Your turn returns to the slide (the overlay handles it), not out of the test
      if (
        e.key === "Escape" &&
        !document.querySelector(".ce-pop") &&
        !host.querySelector(".ga-yt")
      ) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onEsc, true);
    try {
      this.testPlayer = new CoursePlayer({
        course: this.course,
        store: null,
        preview: true,
        lang: this.lang,
        stepId: s?.id,
        mode: t2(this.lang, "Student preview · nothing is saved", "Aperçu élève · rien n’est enregistré"),
        assetUrl: (id) => this.assetUrl(id),
        // designed slides with Your turn: the same runner as the academy (nothing recorded in a test)
        renderSlide: yourTurnSlideRenderer({
          store: null,
          playerEl: () => this.testPlayer?.el ?? null,
          root: () => host,
          notify: (t) => this.toast(t),
        }),
        onExit: close,
        backLabel: (l) => t2(l, "Back to the editor", "Retour à l’éditeur"),
        onLang: (l) => this.setLang(l),
        navigate: () =>
          this.toast(
            t2(
              this.lang,
              "The flight in the simulator opens from the library, where students follow the course.",
              "Le vol au simulateur s’ouvre depuis la bibliothèque, là où les élèves suivent le cours.",
            ),
          ),
      });
      this.testPlayer.mount(host);
    } catch (e) {
      console.error("test", e);
      close();
    }
  }
  private present() {
    if (!this.course.steps.length) return this.needStepFirst();
    void this.saveNow().then(() => {
      const id = this.course.id;
      const st = this.step?.id ?? "";
      if (this.o.onPresent) this.o.onPresent(id, st);
      else
        this.go(
          `academy.html#present=${encodeURIComponent(id)}${st ? `&s=${encodeURIComponent(st)}` : ""}`,
        );
    });
  }
  /** Partager: the popover knows first whether the course fits in a link. When it does, the link is the primary
   *  action (shown in a read-only field); the file is the secondary one. When it does not, it says why first and the
   *  file is the only primary action. */
  private share(anchor: HTMLElement) {
    void this.shareOpen(anchor);
  }
  private async shareOpen(anchor: HTMLElement) {
    const fr = this.lang === "fr";
    const c = this.course;
    const images = courseHasImages(c);
    const r = await encodeCourseShare(c).catch(() => null);
    if (this.course !== c || !anchor.isConnected) return;
    const fits = !!r?.fits;
    const url = r?.fits ? new URL(courseShareLink(r.code), location.href).href : "";
    const body = h("div", { class: "ce-popbody ce-share" });
    const status = h("p", { class: "ce-note muted", role: "status" });
    const exp = btn(
      fits
        ? fr
          ? "Fichier : garde aussi les images"
          : "File: also keeps the images"
        : fr
          ? "Exporter le fichier du cours"
          : "Export the course file",
      async () => {
        if (!this.store) return;
        status.textContent = fr ? "Export…" : "Exporting…";
        await this.saveNow();
        const x = await exportCourse(this.store, c.id, this.lang);
        if (!x) {
          status.textContent = fr ? "Export impossible." : "Could not export.";
          return;
        }
        const a = h("a", {
          href: URL.createObjectURL(x.blob),
          download: x.filename,
        });
        document.body.append(a);
        a.click();
        a.remove();
        this.unexported = false;
        this.renderTop();
        status.textContent = `${x.filename} · ${Math.max(1, Math.round(x.bytes / 1024))} ${fr ? "Ko" : "KB"}${x.missing.length ? (fr ? ` · ${x.missing.length} image(s) absente(s)` : ` · ${x.missing.length} image(s) missing`) : ""}`;
      },
      {
        cls: fits ? "" : "primary",
        icon: fits ? "download" : "share",
        disabled: !this.store || (images && !c.shareConfirmed),
      },
    );
    const parts: Node[] = [];
    if (fits) {
      const field = h("input", {
        type: "text",
        class: "ce-in mono ce-share-url",
        readonly: true,
        value: url,
        "aria-label": fr ? "Lien du cours" : "Course link",
      }) as HTMLInputElement;
      field.addEventListener("focus", () => field.select());
      const copy = btn(
        fr ? "Copier le lien" : "Copy the link",
        async () => {
          try {
            await navigator.clipboard.writeText(url);
            status.textContent = fr ? "Lien copié." : "Link copied.";
          } catch {
            field.focus();
            field.select();
            status.textContent = fr
              ? "Copie bloquée par le navigateur : le lien est sélectionné, copiez-le (Ctrl+C)."
              : "The browser blocked the copy: the link is selected, copy it (Ctrl+C).";
          }
        },
        { cls: "primary", icon: "copy" },
      );
      parts.push(
        h(
          "p",
          { class: "ce-note" },
          fr
            ? "L’élève ouvre le lien sur son appareil : le cours s’ouvre, prêt à suivre."
            : "The student opens the link on their own device: the course opens, ready to follow.",
        ),
        field,
        h("div", { class: "ce-row" }, copy),
        h(
          "p",
          { class: "ce-note muted ce-share-or" },
          fr
            ? "Ou un fichier, pour un cours avec des images ou à archiver."
            : "Or a file, for a course with images or to keep.",
        ),
      );
    } else {
      parts.push(
        h(
          "p",
          { class: "ce-note warn" },
          images
            ? fr
              ? "Ce cours a des images : un lien ne peut pas les porter. Partagez le fichier du cours."
              : "This course has images: a link cannot carry them. Share the course file."
            : fr
              ? "Ce cours est trop long pour un lien. Partagez le fichier du cours."
              : "This course is too long for a link. Share the course file.",
        ),
      );
    }
    if (images)
      parts.push(
        sw(
          !!c.shareConfirmed,
          (on) => {
            this.apply({ ...this.course, shareConfirmed: on || undefined });
            closePop();
            this.share(anchor);
          },
          fr ? "J’ai le droit de partager ces images" : "I may share these images",
          {
            sub: fr
              ? "Photos importées : vérifiez leurs droits"
              : "Imported photos: check you hold the rights",
          },
        ),
      );
    parts.push(h("div", { class: "ce-row" }, exp));
    if (!fits)
      parts.push(
        h(
          "p",
          { class: "ce-note muted" },
          fr
            ? "L’élève ouvre le fichier dans la Bibliothèque, avec « Importer »."
            : "The student opens the file in the Library, with “Import”.",
        ),
      );
    body.append(...parts, status);
    popover(anchor, body, {
      width: 400,
      align: "end",
      title: fr ? "Partager le cours" : "Share the course",
    });
  }
  private courseSettings() {
    const fr = this.lang === "fr";
    const c = this.course;
    const set = (f: (x: Course) => void, key?: string) => {
      const n = clone(this.course);
      f(n);
      this.apply(n, key, { inspector: false });
    };
    const field = (label: string, ctl: Node) =>
      h(
        "div",
        { class: "ce-field" },
        h("div", { class: "ce-field-l" }, h("span", {}, label)),
        ctl,
      );
    const body = h(
      "div",
      { class: "ce-popbody" },
      field(
        fr ? "Titre (EN)" : "Title (EN)",
        textIn(c.title.en, (v) => set((x) => (x.title.en = v), "c.title.en")),
      ),
      field(
        fr ? "Titre (FR)" : "Title (FR)",
        textIn(c.title.fr ?? "", (v) =>
          set((x) => (v ? (x.title.fr = v) : delete x.title.fr), "c.title.fr"),
        ),
      ),
      field(
        fr ? "Résumé (EN)" : "Summary (EN)",
        textIn(
          c.summary?.en ?? "",
          (v) =>
            set(
              (x) => (x.summary = { ...(x.summary ?? {}), en: v }),
              "c.sum.en",
            ),
          { multi: true, rows: 2 },
        ),
      ),
      field(
        fr ? "Résumé (FR)" : "Summary (FR)",
        textIn(
          c.summary?.fr ?? "",
          (v) =>
            set(
              (x) =>
                (x.summary = {
                  en: x.summary?.en ?? "",
                  ...(v ? { fr: v } : {}),
                }),
              "c.sum.fr",
            ),
          { multi: true, rows: 2 },
        ),
      ),
      h(
        "div",
        { class: "ce-grid2" },
        field(
          fr ? "Auteur" : "Author",
          textIn(c.author.name, (v) =>
            set((x) => (x.author.name = v), "c.author"),
          ),
        ),
        field(
          fr ? "Club / école" : "Club / school",
          textIn(c.author.club ?? "", (v) =>
            set((x) => (x.author.club = v || undefined), "c.club"),
          ),
        ),
      ),
      sw(
        c.langs.includes("fr"),
        (on) => set((x) => (x.langs = on ? ["en", "fr"] : ["en"])),
        fr ? "Cours bilingue EN + FR" : "Bilingual course EN + FR",
        {
          sub: fr
            ? "Compte les textes sans français"
            : "Counts texts without French",
        },
      ),
      field(
        fr ? "Thème des diapos" : "Slide theme",
        themePicker(this.lang, c.theme ?? "classroom", (id) =>
          set((x) => (x.theme = id)),
        ),
      ),
      field(
        fr ? "Étiquettes" : "Tags",
        textIn(
          (c.tags ?? []).join(", "),
          (v) =>
            set(
              (x) =>
                (x.tags = v
                  .split(",")
                  .map((t) => t.trim().toLowerCase())
                  .filter(Boolean)),
              "c.tags",
            ),
          { ph: "ifr, holding, maths" },
        ),
      ),
    );
    popover(this.titleBtn, body, {
      width: 420,
      title: fr ? "Réglages du cours" : "Course settings",
      cls: "scroll",
    });
  }
  /** "/": find a step by its title (either language) or its kind. */
  private searchSteps() {
    const fr = this.lang === "fr";
    const input = h("input", {
      type: "search",
      class: "ce-in",
      placeholder: fr ? "Titre ou type de diapo" : "Slide title or kind",
      "aria-label": fr ? "Chercher une diapo" : "Find a slide",
    });
    const list = h("div", { class: "ce-found" });
    const fold = (x: string) =>
      x
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    let hits: number[] = [];
    const draw = () => {
      const q = fold(input.value.trim());
      hits = this.course.steps
        .map((s, i) => ({ s, i }))
        .filter(
          ({ s }) =>
            !q ||
            fold(
              `${s.title.en} ${s.title.fr ?? ""} ${kindLabel(s.kind, "en")} ${kindLabel(s.kind, "fr")}`,
            ).includes(q),
        )
        .map((x) => x.i)
        .slice(0, 12);
      list.replaceChildren(
        ...hits.map((i) => {
          const s = this.course.steps[i];
          const b = h(
            "button",
            { type: "button", class: "ce-menu-it" },
            h("span", { class: "ce-st-n" }, String(i + 1)),
            this.kindChip(s),
            h(
              "span",
              { class: "ce-menu-tx" },
              h("b", {}, tr(s.title, this.lang)),
            ),
          );
          b.addEventListener("click", () => {
            closePop();
            this.select(i);
          });
          return b;
        }),
      );
    };
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && hits.length) {
        e.preventDefault();
        closePop();
        this.select(hits[0]);
      }
    });
    draw();
    popover(
      this.el.querySelector("[data-add]") as HTMLElement,
      h("div", { class: "ce-popbody" }, input, list),
      {
        width: 340,
        title: fr ? "Aller à la diapo" : "Go to slide",
        cls: "scroll",
      },
    );
    input.focus();
  }
  private exit() {
    void this.saveNow().finally(() => {
      if (this.o.onExit) this.o.onExit();
      else this.go("academy.html");
    });
  }
  private go(url: string) {
    if (this.o.navigate) this.o.navigate(url);
    else location.assign(url);
  }

  // ================================================================ keyboard and paste
  private typing(t: EventTarget | null): boolean {
    const e = t as HTMLElement | null;
    return !!e?.closest?.(
      'input, textarea, select, [contenteditable="true"], .sle-text',
    );
  }
  /** Capture phase: one undo history for the whole course (the canvas surface does not keep its own). */
  private onKeyCapture(e: KeyboardEvent) {
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (!meta) return;
    const k = e.key.toLowerCase();
    if ((k === "z" || k === "y") && !this.typing(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      if ((k === "z" && e.shiftKey) || k === "y") this.redo();
      else this.undo();
    } else if (k === "s") {
      e.preventDefault();
      e.stopPropagation();
      this.share(
        this.el.querySelector(".ce-top .ce-btn.primary") as HTMLElement,
      );
    } else if (k === "p") {
      e.preventDefault();
      e.stopPropagation();
      this.present();
    }
  }
  private onKey(e: KeyboardEvent) {
    // the preview player listens on the document: keys typed in the editor stay in the editor
    e.stopPropagation();
    // Échap on « Que voulez-vous montrer ? » of a new slide: no slide is added
    if (
      e.key === "Escape" &&
      this.pendingNew?.id === this.step?.id &&
      !this.typing(e.target) &&
      !document.querySelector(".ce-pop")
    ) {
      e.preventDefault();
      this.dropPending();
      return;
    }
    if (
      e.defaultPrevented ||
      this.typing(e.target) ||
      document.querySelector(".ce-pop")
    )
      return;
    const inCanvas = !!(e.target as HTMLElement).closest?.(
      ".sle-surface, .sle-lib",
    );
    if (inCanvas) return;
    const meta = isMac ? e.metaKey : e.ctrlKey;
    if (meta) return;
    if (
      e.altKey &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      this.move(e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (e.altKey) return;
    switch (e.key) {
      case "n":
      case "N":
        e.preventDefault();
        this.openPanel("templates");
        break;
      case "d":
      case "D":
        e.preventDefault();
        this.duplicate();
        break;
      case "t":
      case "T":
        e.preventDefault();
        this.testAsStudent(this.i);
        break;
      case "/":
        e.preventDefault();
        this.searchSteps();
        break;
      case "C":
        // Shift+C only: a single letter must never take the author out of the editor
        if (!e.shiftKey) break;
        e.preventDefault();
        this.flyToCapture();
        break;
      case "Backspace":
      case "Delete":
        if (
          (e.target as HTMLElement).closest(".ce-steps") ||
          e.target === this.el
        ) {
          e.preventDefault();
          this.deleteStep();
        }
        break;
    }
  }
  /** A pasted image becomes an image block (designed slide) or a reader image. */
  private onPaste(e: ClipboardEvent) {
    if (this.typing(e.target)) return;
    const f = [...(e.clipboardData?.files ?? [])].find((x) =>
      x.type.startsWith("image/"),
    );
    if (!f || !this.step) return;
    e.preventDefault();
    if (this.canvasEd) void this.addImageBlock(f);
    else
      void this.importImage(f).then((r) => {
        if (r)
          this.setStep(
            {
              ...this.step,
              reader: [
                ...this.step.reader,
                { t: "image", asset: r.asset, alt: { en: "" } },
              ],
            },
            undefined,
            true,
          );
      });
  }

  destroy() {
    this.destroyed = true;
    if (this.saving === "pending") void this.saveNow();
    clearTimeout(this.saveTimer);
    clearTimeout(this.checksTimer);
    clearTimeout(this.previewTimer);
    clearTimeout(this.thumbTimer);
    window.removeEventListener("beforeunload", this.onUnload);
    closePop();
    this.studio.destroy();
    this.startEl?.destroy();
    this.teardownCentre();
    this.testPlayer?.destroy();
    this.testEl?.remove();
    for (const t of this.thumbs.values()) t.view?.destroy();
    this.sims.destroy();
    this.tray.destroy();
    this.ro?.disconnect();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.el.remove();
  }
}

/** Open the editor in `root` (academy.html#edit=<id>). */
export function openCourseEditor(
  root: HTMLElement,
  o: CourseEditorOptions,
): CourseEditor {
  const ed = new CourseEditor(o);
  ed.mount(root);
  return ed;
}
