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
import { LibraryPanel } from "../canvas/libraryPanel";
import { SceneSims } from "../canvas/instruments";
import { renderThumb, type SlideView } from "../canvas/render";
import {
  libraryItem,
  type BlockDraft,
  type LibraryTab,
} from "../canvas/factory";
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
  makeStep,
  moveStep,
  removeStep,
  replaceStep,
  revealsOf,
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
  pacingText,
  type EditorCheck,
} from "./checksPanel";
import {
  Inspector,
  btn,
  ico,
  layoutPicker,
  popover,
  closePop,
  seg,
  sw,
  t2,
  textIn,
  themePicker,
  type InspectorHost,
  type StageInfo,
} from "./inspector";
import { TrayView } from "./tray";
import "../../styles/course-editor.css";

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
const isIpad = () =>
  typeof navigator !== "undefined" &&
  (/iPad/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

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

const BLOCK_TOOLS: { id: string; icon: string; label: [string, string] }[] = [
  { id: "text", icon: "text", label: ["Text", "Texte"] },
  { id: "image", icon: "image", label: ["Image", "Image"] },
  { id: "shape", icon: "shape", label: ["Shape", "Forme"] },
  { id: "arrow", icon: "arrow", label: ["Arrow", "Flèche"] },
  { id: "callout", icon: "callout", label: ["Callout", "Légende"] },
  { id: "marker", icon: "marker", label: ["Marker", "Repère"] },
  { id: "diagram", icon: "diagram", label: ["Diagram", "Schéma"] },
  { id: "instrument", icon: "gauge", label: ["Instrument", "Instrument"] },
  { id: "viewport", icon: "viewport", label: ["Sim view", "Vue simu"] },
  { id: "quiz", icon: "quiz", label: ["Quiz", "Quiz"] },
  { id: "calc", icon: "calc", label: ["Calc", "Calcul"] },
];

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
  private libPanel: LibraryPanel | null = null;
  private drawer: HTMLElement | null = null;
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
      onFlyToCapture: () => this.flyToCapture(),
      assetUrl: (id) => this.assetUrl(id),
    });
    this.inspector = new Inspector(this);
    this.build();
    if (this.store && this.store.backend === "memory") this.saving = "memory";
    this.renderAll();
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
      if (this.o.onFlyToCapture) this.o.onFlyToCapture(this.course.id);
      else
        this.go(
          `index.html?capture=${encodeURIComponent(this.course.id)}&return=${encodeURIComponent(location.href)}`,
        );
    });
  }
  toast(msg: string, undo?: () => void) {
    clearTimeout(this.toastTimer);
    const fr = this.lang === "fr";
    this.toastEl.replaceChildren(h("span", {}, msg));
    if (undo)
      this.toastEl.append(
        btn(
          fr ? "Annuler" : "Undo",
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
      undo ? 6000 : 3200,
    );
  }

  // ================================================================ building
  private build() {
    const fr = this.lang === "fr";
    // top bar
    this.titleBtn = h("button", {
      type: "button",
      class: "ce-ttl-b",
      title: fr ? "Réglages du cours" : "Course settings",
    });
    this.titleBtn.addEventListener("click", () => this.courseSettings());
    this.subEl = h("span", { class: "ce-sub-l" });
    this.statusEl = h("span", { class: "ce-status" });
    this.checksBtn = btn(
      fr ? "Vérifications" : "Checks",
      () => this.openChecks(),
      { cls: "sm hide-s", icon: "checks" },
    );
    const back = btn("", () => this.exit(), {
      cls: "ic",
      icon: "back",
      title: fr ? "Retour à la bibliothèque" : "Back to the course library",
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
      ...(this.captureReady
        ? [
            btn(
              fr ? "Voler pour capturer" : "Fly to capture",
              () => this.flyToCapture(),
              { cls: "sm", icon: "pulse", kbd: "⇧C" },
            ),
          ]
        : []),
      this.checksBtn,
      btn(fr ? "Aperçu" : "Preview", () => this.testAsStudent(0), {
        cls: "sm hide-s",
      }),
      btn(fr ? "Présenter" : "Present", () => this.present(), { cls: "sm" }),
      (() => {
        const b = btn(fr ? "Partager" : "Share", () => this.share(b), {
          cls: "sm primary",
        });
        return b;
      })(),
    );
    // left
    const add = btn(fr ? "Ajouter" : "Add", () => this.addMenu(add), {
      cls: "sm",
      icon: "plus",
      title: fr ? "Nouvelle étape (N)" : "New step (N)",
    });
    add.setAttribute("data-add", "");
    this.stepsEl = h("ol", {
      class: "ce-steps",
      role: "listbox",
      tabindex: "0",
      "aria-label": fr ? "Étapes du cours" : "Course steps",
    });
    this.stepsEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (e.altKey) return;
        e.preventDefault();
        this.select(this.i + (e.key === "ArrowDown" ? 1 : -1));
      }
    });
    this.adviceEl = h("button", { type: "button", class: "ce-advice" });
    this.adviceEl.addEventListener("click", () => {
      const r = pacingRuns(this.course.steps)[0];
      if (r) this.select(r[0]);
    });
    const left = h(
      "aside",
      { class: "ce-col ce-left" },
      this.tray.el,
      h(
        "div",
        { class: "ce-sect" },
        h("span", { class: "ce-label" }, fr ? "Étapes" : "Steps"),
        add,
      ),
      this.stepsEl,
      this.adviceEl,
    );
    // centre
    this.toolEl = h("div", { class: "ce-ctool" });
    this.stageArea = h("div", { class: "ce-stagearea" });
    this.stepBar = h("div", { class: "ce-stepbar" });
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
      this.stepBar,
      this.hintEl,
    );
    this.toastEl = h("div", { class: "ce-toast", role: "status" });
    this.toastEl.hidden = true;
    this.liveEl = h("div", { class: "ce-sr", "aria-live": "polite" });
    this.el.append(
      top,
      h("div", { class: "ce-body" }, left, center, this.inspector.el),
      this.toastEl,
      this.liveEl,
    );
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.fitDevice());
      this.ro.observe(this.stageArea);
    }
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
    // the canvas reloads the restored slide, keeping what is still selected
    const s = this.step;
    if (s?.slide && this.canvasEd && this.canvasFor === s.id) {
      const ids = this.sel.map((b) => b.id);
      this.canvasEd.load(s.slide);
      this.canvasEd.select(
        ids.filter((x) => s.slide!.blocks.some((b) => b.id === x)),
      );
    } else this.renderCentre();
  }

  // ================================================================ rendering
  private renderAll() {
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
    this.subEl.textContent = `${n} ${fr ? (n > 1 ? "étapes" : "étape") : n === 1 ? "step" : "steps"} · ${fr ? "environ" : "about"} ${courseMinutes(c)} min · ${langs} · `;
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
      const nudge = h("button", { type: "button", class: "ce-tag warn ce-nudge", title: fr ? "Ce navigateur ne garde pas les cours : exportez un fichier" : "This browser does not keep courses: export a file" }, fr ? "exportez avant de fermer" : "export before closing");
      nudge.addEventListener("click", () => this.share(this.el.querySelector(".ce-top .ce-btn.primary") as HTMLElement));
      this.statusEl.append(" ", nudge);
    } else if (stale) {
      const nudge = h("button", { type: "button", class: "ce-tag warn ce-nudge", title: fr ? "Exportez une copie dans un fichier" : "Export a copy to a file" }, fr ? "pas exporté depuis 7 jours" : "not exported for 7 days");
      nudge.addEventListener("click", () => this.share(this.el.querySelector(".ce-top .ce-btn.primary") as HTMLElement));
      this.statusEl.append(" ", nudge);
    }
    const errs = this.checks.filter((x) => x.level === "error").length;
    const warns = this.checks.length - errs;
    const badge =
      this.checksBtn.querySelector(".ce-count") ??
      h("span", { class: "ce-count" });
    badge.textContent = String(this.checks.length);
    badge.className = `ce-count${errs ? " err" : warns ? " warn" : " ok"}`;
    if (!badge.parentElement) this.checksBtn.append(badge);
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
      row.addEventListener("click", () => {
        if (this.drag?.started) return;
        this.select(i);
      });
      frag.push(row);
    });
    if (!c.steps.length)
      frag.push(
        h(
          "li",
          { class: "ce-empty" },
          t2(
            lang,
            "No steps yet. Add one, or capture a moment in the cockpit.",
            "Pas encore d’étape. Ajoutez-en une, ou capturez un moment au cockpit.",
          ),
        ),
      );
    this.stepsEl.replaceChildren(...frag);
    this.stepsEl
      .querySelector(".ce-st.sel")
      ?.scrollIntoView({ block: "nearest" });
    // pacing advisory
    const run = pacingRuns(c.steps)[0];
    this.adviceEl.hidden = !run;
    if (run)
      this.adviceEl.replaceChildren(
        ico("warn"),
        h("span", {}, pacingText(run, lang)),
      );
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
  private pumpThumbs() {
    if (this.thumbTimer || !this.thumbQueue.length) return;
    const run = () => {
      this.thumbTimer = 0;
      const job = this.thumbQueue.shift();
      if (job && !this.destroyed) job();
      if (this.thumbQueue.length) this.thumbTimer = window.setTimeout(run, 16);
    };
    this.thumbTimer = window.setTimeout(run, 60);
  }
  private makeSims(): SceneSims {
    this.simsKey =
      String(JSON.stringify(this.course.scenes).length) +
      Object.keys(this.course.scenes).join(",");
    return new SceneSims({
      scenes: this.course.scenes,
      cockpit: this.course.cockpit,
    });
  }
  private ensureSims() {
    const k =
      String(JSON.stringify(this.course.scenes).length) +
      Object.keys(this.course.scenes).join(",");
    if (k !== this.simsKey) {
      this.sims.destroy();
      this.sims = this.makeSims();
    }
  }

  // ---------------------------------------------------------------- toolbar
  private renderTool() {
    const s = this.step;
    const fr = this.lang === "fr";
    const miss = courseMissingFr(this.course);
    const langSeg = h(
      "div",
      {
        class: "ce-seg",
        role: "radiogroup",
        "aria-label": fr ? "Langue du contenu" : "Content language",
      },
      ...(["en", "fr"] as Lang[]).map((l) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "radio",
            class: this.lang === l ? "on" : "",
            "aria-checked": this.lang === l ? "true" : "false",
          },
          l.toUpperCase(),
        );
        if (l === "fr" && miss && this.course.langs.includes("fr"))
          b.append(
            h(
              "span",
              { class: "ce-tag warn" },
              fr ? `${miss} manquant${miss > 1 ? "s" : ""}` : `${miss} missing`,
            ),
          );
        b.addEventListener("click", () => this.setLang(l));
        return b;
      }),
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
                  label: s.slide && k === 0 ? (fr ? "Début" : "Start") : String(s.slide ? k : k + 1),
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
      const tools = h(
        "div",
        {
          class: "ce-blocktools",
          role: "toolbar",
          "aria-label": fr ? "Ajouter un bloc" : "Add a block",
        },
        ...BLOCK_TOOLS.map((t) => {
          const b = h(
            "button",
            { type: "button", class: "ce-bt", title: t.label[fr ? 1 : 0] },
            ico(t.icon),
            h("span", {}, t.label[fr ? 1 : 0]),
          );
          b.addEventListener("click", () => this.blockTool(t.id, b));
          return b;
        }),
      );
      const layoutB = btn(
        fr ? "Mise en page" : "Layout",
        () => {
          popover(
            layoutB,
            layoutPicker(this.lang, s.slide?.layout, this.course, (id) => {
              closePop();
              this.applyLayout(id);
            }),
            { width: 520, title: fr ? "Mise en page" : "Layout" },
          );
        },
        { cls: "sm", icon: "layout" },
      );
      const themeB = btn(
        fr ? "Thème" : "Theme",
        () => {
          const cur = s.slide?.theme ?? this.course.theme ?? "cockpit";
          const box = h("div", { class: "ce-popbody" });
          box.append(
            themePicker(this.lang, cur, (id) => {
              closePop();
              // the course theme; this slide follows it (other slides keep an override they chose)
              const st = this.step;
              const steps = this.course.steps.map((x) => {
                if (x.id !== st?.id || !x.slide?.theme) return x;
                const { theme: _t, ...rest } = x.slide;
                void _t;
                return { ...x, slide: rest };
              });
              this.apply({ ...this.course, theme: id, steps }, undefined, {
                inspector: true,
              });
              this.canvasFor = "";
              this.renderCentre();
            }),
            h(
              "p",
              { class: "ce-note muted" },
              fr
                ? "Appliqué à tout le cours. Une diapo peut garder le sien (onglet Diapo)."
                : "Applied to the whole course. A slide can keep its own (Slide tab).",
            ),
          );
          popover(themeB, box, {
            width: 420,
            title: fr ? "Thème du cours" : "Course theme",
          });
        },
        { cls: "sm", icon: "theme" },
      );
      const libB = btn(
        fr ? "Bibliothèque" : "Library",
        () => this.toggleLibrary(),
        { cls: `sm${this.drawer ? " on" : ""}`, icon: "library" },
      );
      // always-visible Undo / Redo (an iPad has no ⌘Z)
      const undoB = btn("", () => this.undo(), {
        cls: "sm ic ce-undo",
        icon: "undo",
        title: t2(this.lang, "Undo (⌘Z)", "Annuler (⌘Z)"),
        disabled: !this.history.canUndo,
      });
      const redoB = btn("", () => this.redo(), {
        cls: "sm ic ce-redo",
        icon: "redo",
        title: t2(this.lang, "Redo (⇧⌘Z)", "Rétablir (⇧⌘Z)"),
        disabled: !this.history.canRedo,
      });
      this.toolEl.replaceChildren(
        h(
          "div",
          { class: "ce-ctool-row" },
          undoB,
          redoB,
          layoutB,
          themeB,
          libB,
          h("span", { class: "ce-sp" }),
          langSeg,
          revealSeg,
        ),
        tools,
      );
      this.toolEl.classList.add("two");
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
    this.libPanel?.setLang(l);
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
    this.closeLibrary(false);
    if (!s) {
      this.teardownCentre();
      this.stageArea.replaceChildren(
        h(
          "div",
          { class: "ce-blank" },
          h(
            "p",
            {},
            t2(
              this.lang,
              "Add a first step: an Explain on a live instrument is a good start.",
              "Ajoutez une première étape : une explication sur un instrument en direct est un bon début.",
            ),
          ),
          btn(
            t2(this.lang, "Add a step", "Ajouter une étape"),
            (e) => this.addMenu(e.currentTarget as HTMLElement),
            { cls: "primary", icon: "plus" },
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
        onChange: (c, final) => {
          if (!final) return;
          const st = this.step;
          if (!st || st.id !== this.canvasFor) return;
          this.apply(replaceStep(this.course, { ...st, slide: c }), undefined, {
            centre: false,
            inspector:
              this.inspector.currentTab === "block" &&
              !this.inspector.el.contains(document.activeElement),
          });
        },
        onSelect: (_ids, blocks) => {
          this.sel = blocks;
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
  private teardownCentre() {
    this.player?.destroy();
    this.player = null;
    this.canvasEd?.destroy();
    this.canvasEd = null;
    this.canvasFor = "";
    this.sel = [];
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
              "Dans l’aperçu, En vol reste ici : utilisez Tester comme élève.",
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
              "This step cannot be previewed yet: see Checks.",
              "Ce pas ne peut pas encore être prévisualisé : voir Vérifications.",
            ),
          ),
        ),
      );
    }
  }

  // ---------------------------------------------------------------- designed slides: toolbar, library
  private blockTool(id: string, anchor: HTMLElement) {
    const ed = this.canvasEd;
    if (!ed) return;
    const fr = this.lang === "fr";
    const add = (itemId: string) => {
      const it = libraryItem(itemId);
      if (it) ed.add(it.make());
    };
    switch (id) {
      case "text":
        popover(
          anchor,
          (
            [
              ["text:title", fr ? "Titre" : "Title"],
              ["text:heading", fr ? "Intertitre" : "Heading"],
              ["text:body", fr ? "Texte" : "Body text"],
              ["text:number", fr ? "Grand chiffre" : "Big number"],
              ["text:quote", fr ? "Citation" : "Quote"],
              ["text:mono", fr ? "Clairance / METAR" : "Clearance / METAR"],
              ["text:label", fr ? "Étiquette" : "Label"],
              ["text:caption", fr ? "Légende" : "Caption"],
            ] as const
          ).map(([k, l]) => ({
            label: l,
            icon: "text",
            onClick: () => add(k),
          })),
          { width: 240, title: fr ? "Texte" : "Text" },
        );
        break;
      case "image":
        popover(
          anchor,
          [
            {
              label: fr ? "Depuis cet appareil…" : "From this device…",
              sub: fr ? "WebP, 1600 px au plus" : "WebP, 1600 px at most",
              icon: "image",
              onClick: () => {
                const i = h("input", {
                  type: "file",
                  accept: "image/png,image/jpeg,image/webp,image/gif",
                });
                i.addEventListener("change", async () => {
                  const f = i.files?.[0];
                  if (f) await this.addImageBlock(f);
                });
                i.click();
              },
            },
            {
              label: fr ? "Photos de la bibliothèque" : "Library photos",
              icon: "library",
              onClick: () => this.openLibrary("photos"),
            },
            {
              label: fr ? "Icônes d’aviation" : "Aviation icons",
              icon: "library",
              onClick: () => this.openLibrary("icons"),
            },
          ],
          { width: 260 },
        );
        break;
      case "shape":
        popover(
          anchor,
          (
            [
              ["shape:rect", fr ? "Rectangle plein" : "Filled box"],
              ["shape:frame", fr ? "Cadre" : "Frame"],
              ["shape:ellipse", fr ? "Ellipse" : "Ellipse"],
              ["shape:line", fr ? "Ligne" : "Line"],
              ["shape:triangle", fr ? "Triangle" : "Triangle"],
            ] as const
          ).map(([k, l]) => ({
            label: l,
            icon: "shape",
            onClick: () => add(k),
          })),
          { width: 220 },
        );
        break;
      case "arrow":
        add("shape:arrow");
        break;
      case "callout":
        add("shape:callout");
        break;
      case "marker":
        add("shape:marker");
        break;
      case "diagram":
        this.openLibrary("diagrams");
        break;
      case "instrument":
        this.openLibrary("instruments");
        break;
      case "viewport":
        add("interactive:viewport");
        break;
      case "quiz":
        add("interactive:quiz");
        break;
      case "calc":
        add("interactive:calc");
        break;
    }
  }
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
  private openLibrary(tab: LibraryTab) {
    if (!this.canvasEd) return;
    if (this.drawer && this.libPanel) {
      this.libPanel.setTab(tab);
      return;
    }
    const ed = this.canvasEd;
    this.libPanel = new LibraryPanel({
      lang: this.lang,
      theme: this.step?.slide?.theme ?? this.course.theme ?? "cockpit",
      target: {
        add: (d) => {
          ed.add(d);
          // below 1280 px the drawer covers the slide: close it so the new block and its handles show
          if (window.innerWidth < 1280) this.closeLibrary();
        },
        dropAt: (d, x, y) => ed.dropAt(d, x, y),
        isOverSlide: (x, y) => ed.isOverSlide(x, y),
      },
      tab,
      cockpit: this.course.cockpit,
    });
    const close = btn("", () => this.closeLibrary(), {
      cls: "ic",
      icon: "x",
      title: t2(this.lang, "Close the library", "Fermer la bibliothèque"),
    });
    this.drawer = h(
      "div",
      { class: "ce-drawer" },
      h("div", { class: "ce-drawer-x" }, close),
      this.libPanel.el,
    );
    this.stageArea.append(this.drawer);
    this.renderTool();
  }
  private toggleLibrary() {
    if (this.drawer) this.closeLibrary();
    else this.openLibrary("instruments");
  }
  private closeLibrary(render = true) {
    if (!this.drawer) return;
    this.libPanel?.destroy();
    this.libPanel = null;
    this.drawer.remove();
    this.drawer = null;
    if (render) this.renderTool();
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
    if (s.slide.theme) slide.theme = s.slide.theme;
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
    const more = btn("", () => this.moreMenu(more), {
      cls: "ic",
      icon: "dots",
      title: fr ? "Plus" : "More",
    });
    this.stepBar.replaceChildren(
      this.kindChip(s),
      h(
        "span",
        { class: "ce-sbt" },
        h("b", {}, t.head),
        t.tail ? ` · ${t.tail}` : "",
      ),
      h("span", { class: "ce-sp" }),
      btn(fr ? "Dupliquer" : "Duplicate", () => this.duplicate(), {
        cls: "sm quiet hide-s",
        title: fr ? "Dupliquer (D)" : "Duplicate (D)",
      }),
      btn("", () => this.move(-1), {
        cls: "ic",
        icon: "up",
        title: fr ? "Monter (Alt+↑)" : "Move up (Alt+↑)",
        disabled: this.i === 0,
      }),
      btn("", () => this.move(1), {
        cls: "ic",
        icon: "down",
        title: fr ? "Descendre (Alt+↓)" : "Move down (Alt+↓)",
        disabled: this.i >= this.course.steps.length - 1,
      }),
      more,
      btn(
        fr ? "Tester comme élève" : "Test as student",
        () => this.testAsStudent(this.i),
        {
          cls: "sm",
          icon: "play",
          title: fr ? "Tester comme élève (T)" : "Test as student (T)",
        },
      ),
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
                ? "Convertir en texte + scène"
                : "Convert to reader + stage",
              sub: fr
                ? "Le premier instrument devient la scène"
                : "The first instrument becomes the stage",
              icon: "convert",
              onClick: () => this.convert(),
            }
          : {
              label: fr
                ? "Convertir en diapositive libre"
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
          label: fr ? "Dupliquer" : "Duplicate",
          icon: "copy",
          onClick: () => this.duplicate(),
        },
        {
          label: fr ? "Supprimer l’étape" : "Delete the step",
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
            "Converti en diapositive libre",
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
    const changed = i !== this.i;
    this.i = i;
    if (changed) this.reveal = null;
    this.renderSteps();
    this.renderTool();
    this.renderStepBar();
    this.renderCentre();
    this.inspector.render();
    if (notify && changed) this.o.onStep?.(this.step.id);
  }
  private insert(r: { course: Course; step: Step }) {
    const at = this.course.steps.length ? this.i + 1 : 0;
    this.apply(insertStep(r.course, r.step, at), undefined, { centre: false });
    this.select(at);
    this.liveEl.textContent = `${tr(r.step.title, this.lang)}: ${t2(this.lang, "added", "ajouté")}`;
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
      if (blob) refs[aid] = { id: aid, mime: (blob.type || "image/jpeg") as AssetRef["mime"], w, h: hh, bytes: blob.size, role };
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
  private addMenu(anchor: HTMLElement) {
    const fr = this.lang === "fr";
    const box = h("div", { class: "ce-addmenu" });
    const grid = h("div", { class: "ce-tmpls" });
    for (const t of TEMPLATES.filter((x) => x.id !== "slide")) {
      const k = KINDS[t.kind] ?? KINDS.page;
      const b = h(
        "button",
        { type: "button", class: "ce-tmpl" },
        h("span", { class: `ce-kind k-${k.cls}` }, tr(t.title, this.lang)),
        h("small", {}, tr(t.intent, this.lang)),
      );
      b.addEventListener("click", () => {
        closePop();
        this.addTemplate(t.id);
      });
      grid.append(b);
    }
    box.append(
      h(
        "div",
        { class: "ce-label" },
        fr ? "Ce que fait l’élève" : "What the student does",
      ),
      grid,
      h(
        "div",
        { class: "ce-label" },
        fr ? "Diapositive libre" : "Designed slide",
      ),
      layoutPicker(this.lang, undefined, this.course, (id) => {
        closePop();
        this.addTemplate("slide", { layout: id });
      }),
    );
    popover(anchor, box, {
      width: 560,
      title: fr ? "Nouvelle étape" : "New step",
      cls: "scroll",
    });
  }
  private duplicate() {
    const r = duplicateStep(this.course, this.i);
    if (!r) return;
    this.apply(r.course, undefined, { centre: false });
    this.select(this.i + 1);
    this.toast(t2(this.lang, "Step duplicated", "Étape dupliquée"));
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
      `${t2(this.lang, "Deleted", "Supprimé")}: ${tr(s.title, this.lang)}`,
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
    const d = {
      from: i,
      to: i,
      y0: e.clientY,
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
          if (Math.abs(ev.clientY - d.y0) > 8) cleanup();
          return;
        }
        if (Math.abs(ev.clientY - d.y0) < 6) return;
        begin();
      }
      ev.preventDefault();
      const rows = [...this.stepsEl.querySelectorAll<HTMLElement>(".ce-st")];
      let to = rows.length - 1;
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
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
      row.style.transform = `translateY(${ev.clientY - d.y0}px)`;
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
  testAsStudent(from: number) {
    if (this.testEl) return;
    const s = this.course.steps[from];
    this.player?.destroy();
    this.player = null;
    this.canvasEd?.focus();
    const host = h("div", {
      class: "ce-test",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t2(this.lang, "Test as student", "Tester comme élève"),
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
      if (e.key === "Escape" && !document.querySelector(".ce-pop") && !host.querySelector(".ga-yt")) {
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
        mode: t2(this.lang, "test run, not recorded", "essai, non enregistré"),
        assetUrl: (id) => this.assetUrl(id),
        // designed slides with Your turn: the same runner as the academy (nothing recorded in a test)
        renderSlide: yourTurnSlideRenderer({
          store: null,
          playerEl: () => this.testPlayer?.el ?? null,
          root: () => host,
          notify: (t) => this.toast(t),
        }),
        onExit: close,
        onLang: (l) => this.setLang(l),
        navigate: () =>
          this.toast(
            t2(
              this.lang,
              "Fly it opens the cockpit from the published course.",
              "En vol ouvre le cockpit depuis le cours publié.",
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
  private share(anchor: HTMLElement) {
    const fr = this.lang === "fr";
    const c = this.course;
    const body = h("div", { class: "ce-popbody ce-share" });
    const status = h("p", { class: "ce-note muted" });
    const images = courseHasImages(c);
    const exp = btn(
      fr ? "Exporter un fichier .ifrcourse" : "Export an .ifrcourse file",
      async () => {
        if (!this.store) return;
        status.textContent = fr ? "Export…" : "Exporting…";
        await this.saveNow();
        const r = await exportCourse(this.store, c.id);
        if (!r) {
          status.textContent = fr ? "Export impossible." : "Could not export.";
          return;
        }
        const a = h("a", {
          href: URL.createObjectURL(r.blob),
          download: r.filename,
        });
        document.body.append(a);
        a.click();
        a.remove();
        this.unexported = false;
        this.renderTop();
        status.textContent = `${r.filename} · ${Math.max(1, Math.round(r.bytes / 1024))} ${fr ? "Ko" : "KB"}${r.missing.length ? (fr ? ` · ${r.missing.length} image(s) absente(s)` : ` · ${r.missing.length} image(s) missing`) : ""}`;
      },
      {
        cls: "primary",
        icon: "share",
        disabled: !this.store || (images && !c.shareConfirmed),
      },
    );
    const link = btn(
      fr ? "Copier un lien" : "Copy a link",
      async () => {
        const r = await encodeCourseShare(this.course);
        if (!r.fits) {
          status.textContent =
            r.reason === "images"
              ? fr
                ? "Le cours a des images : exportez un fichier."
                : "The course has images: export a file instead."
              : fr
                ? "Trop long pour un lien : exportez un fichier."
                : "Too long for a link: export a file instead.";
          return;
        }
        const url = new URL(courseShareLink(r.code), location.href).href;
        try {
          await navigator.clipboard.writeText(url);
          status.textContent = fr ? "Lien copié." : "Link copied.";
        } catch {
          status.replaceChildren(textIn(url, () => {}, { mono: true }));
        }
      },
      { icon: "copy" },
    );
    body.append(
      h(
        "p",
        { class: "ce-note" },
        fr
          ? "Un fichier garde tout : texte, scènes, séquences et images. Un lien suffit pour un cours sans image."
          : "A file keeps everything: text, scenes, clips and images. A link is enough for a course without images.",
      ),
      ...(images
        ? [
            sw(
              !!c.shareConfirmed,
              (on) => {
                this.apply({ ...this.course, shareConfirmed: on || undefined });
                closePop();
                this.share(anchor);
              },
              fr
                ? "J’ai le droit de partager ces images"
                : "I may share these images",
              {
                sub: fr
                  ? "Photos importées : vérifiez leurs droits"
                  : "Imported photos: check you hold the rights",
              },
            ),
          ]
        : []),
      h("div", { class: "ce-row" }, exp, link),
      status,
    );
    popover(anchor, body, {
      width: 380,
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
        fr ? "Thème des diapositives" : "Slide theme",
        themePicker(this.lang, c.theme ?? "cockpit", (id) =>
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
    const input = h("input", { type: "search", class: "ce-in", placeholder: fr ? "Titre ou type d’étape" : "Step title or kind", "aria-label": fr ? "Chercher une étape" : "Find a step" });
    const list = h("div", { class: "ce-found" });
    const fold = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let hits: number[] = [];
    const draw = () => {
      const q = fold(input.value.trim());
      hits = this.course.steps
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !q || fold(`${s.title.en} ${s.title.fr ?? ""} ${kindLabel(s.kind, "en")} ${kindLabel(s.kind, "fr")}`).includes(q))
        .map((x) => x.i)
        .slice(0, 12);
      list.replaceChildren(
        ...hits.map((i) => {
          const s = this.course.steps[i];
          const b = h("button", { type: "button", class: "ce-menu-it" }, h("span", { class: "ce-st-n" }, String(i + 1)), this.kindChip(s), h("span", { class: "ce-menu-tx" }, h("b", {}, tr(s.title, this.lang))));
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
    popover(this.el.querySelector("[data-add]") as HTMLElement, h("div", { class: "ce-popbody" }, input, list), { width: 340, title: fr ? "Aller à l’étape" : "Go to step", cls: "scroll" });
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
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      this.move(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.altKey) return;
    switch (e.key) {
      case "n":
      case "N":
        e.preventDefault();
        this.addMenu(this.el.querySelector("[data-add]") as HTMLElement);
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
    this.closeLibrary(false);
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
