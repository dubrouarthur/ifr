// Presenter console (package G, SPEC §6.3): academy.html#present=<id>[&s=<step>]. The current step at about 65 %
// (the real player, which the CFI operates), the next step, the presenter notes, the timer against the planned
// minutes, the reveal position, a black-screen toggle and the projector window. Keys: → / PageDown / Space next,
// ← / PageUp back, B or . black screen, R reset the scene, P open the projector, Esc leave.
import type { Course, Lang, Step } from "../types";
import type { CourseStore } from "../store";
import { h } from "../../ui/dom";
import { playCourse, type CoursePlayer, type SlideRenderer } from "./player";
import { btn, kindChip, L } from "./reader";
import { courseMinutes } from "./outline";
import { stagePoseOf } from "../scene";
import { renderThumb } from "../canvas/render";
import {
  clockText,
  presentLink,
  STAGE_PERIOD_MS,
  type PresentLink,
} from "../present";
import { academyHref } from "./library";

const S = {
  presenter: ["Presenter", "Présentateur"],
  step: ["Step {n} of {t}", "Étape {n} sur {t}"],
  next: ["Next", "Suivante"],
  end: ["End of the course", "Fin du cours"],
  notes: ["Notes", "Notes"],
  noNotes: [
    "No presenter notes for this step.",
    "Pas de notes pour cette étape.",
  ],
  reveal: ["Reveal {r} of {n}", "Affichage {r} sur {n}"],
  projector: ["Open the projector", "Ouvrir le projecteur"],
  projectorOn: ["Projector open", "Projecteur ouvert"],
  projectorHint: [
    "Drag the projector window to the second screen, then press F11 (or ⌃⌘F) for full screen.",
    "Glissez la fenêtre du projecteur sur le second écran, puis F11 (ou ⌃⌘F) pour le plein écran.",
  ],
  noChannel: [
    "This browser cannot link two windows: present from this window.",
    "Ce navigateur ne peut pas relier deux fenêtres : présentez depuis celle-ci.",
  ],
  black: ["Black screen", "Écran noir"],
  blackOn: ["Screen is black", "Écran noir actif"],
  exit: ["Leave", "Quitter"],
  planned: ["planned {m} min", "prévu {m} min"],
  keys: [
    "→ next · ← back · B black · R reset scene · P projector",
    "→ suivant · ← retour · B noir · R scène initiale · P projecteur",
  ],
  late: ["behind the plan", "en retard sur le plan"],
} as const;
const st = (
  k: keyof typeof S,
  lang: Lang,
  v: Record<string, string | number> = {},
) =>
  S[k][lang === "fr" ? 1 : 0].replace(/\{(\w+)\}/g, (_, x: string) =>
    String(v[x] ?? ""),
  );

export interface PresenterOptions {
  course: Course;
  store: CourseStore | null;
  lang: Lang;
  stepId?: string;
  onExit(): void;
  onLang?(l: Lang): void;
  onStep?(stepId: string): void;
  /** the slide renderer (academy passes the one that runs Your turn) */
  renderSlide?: SlideRenderer;
  /** the projector page (default academy.html) */
  page?: string;
}

export class Presenter {
  readonly el: HTMLDivElement;
  private player: CoursePlayer;
  private link: PresentLink;
  private lang: Lang;
  private t0 = Date.now();
  private timer = 0;
  private stageT = 0;
  private black = false;
  private projector: Window | null = null;
  private head: HTMLElement;
  private side: HTMLElement;
  private clock: HTMLElement;
  private stepEl: HTMLElement;
  private blackBtn: HTMLButtonElement;
  private projBtn: HTMLButtonElement;
  private state = { stepId: "", index: 0, reveal: 0 };
  private thumbDestroy: (() => void) | null = null;
  private ready = false;

  constructor(private o: PresenterOptions) {
    this.lang = o.lang;
    this.link = presentLink(o.course.id);
    this.el = h("div", { class: "pr-app", lang: this.lang });
    this.clock = h("span", { class: "pr-clock num", "aria-live": "off" });
    this.stepEl = h("span", { class: "pr-stepno num" });
    this.blackBtn = btn(st("black", this.lang), "", () =>
      this.setBlack(!this.black),
    );
    this.blackBtn.setAttribute("aria-pressed", "false");
    this.projBtn = btn(st("projector", this.lang), "primary", () =>
      this.openProjector(),
    );
    this.head = h("header", { class: "pr-head" });
    this.side = h("aside", {
      class: "pr-side",
      "aria-label": st("presenter", this.lang),
    });
    const main = h("div", { class: "pr-main" });
    this.el.append(this.head, h("div", { class: "pr-body" }, main, this.side));
    this.player = playCourse(main, {
      course: o.course,
      store: o.store,
      lang: this.lang,
      stepId: o.stepId,
      mode: this.lang === "fr" ? "présentation" : "presenting",
      ...(o.renderSlide ? { renderSlide: o.renderSlide } : {}),
      onExit: () => o.onExit(),
      onLang: (l) => this.setLang(l),
      onStep: (id) => o.onStep?.(id),
      onState: (s) => {
        this.state = s;
        this.link.post({ t: "goto", stepId: s.stepId, reveal: s.reveal });
        // the player reports its first step while it is being built
        if (!this.ready) return;
        this.renderSide();
        this.renderHead();
      },
    });
    this.link.on((m) => {
      if (m.t === "hello") this.sync();
    });
    this.ready = true;
    document.addEventListener("keydown", this.onKey);
    this.timer = window.setInterval(() => this.tick(), 250);
    this.renderHead();
    this.renderSide();
  }
  mount(root: HTMLElement) {
    root.append(this.el);
  }
  goTo(stepId: string) {
    if (this.player.step.id !== stepId) this.player.goToId(stepId);
  }
  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.el.lang = l;
    this.player.setLang(l);
    this.link.post({ t: "lang", lang: l });
    this.o.onLang?.(l);
    this.blackBtn.textContent = this.black ? st("blackOn", l) : st("black", l);
    this.renderHead();
    this.renderSide();
  }
  destroy() {
    window.clearInterval(this.timer);
    document.removeEventListener("keydown", this.onKey);
    this.link.post({ t: "bye" });
    this.link.close();
    this.thumbDestroy?.();
    this.player.destroy();
    this.el.remove();
  }

  // ---------------------------------------------------------------- sync
  private sync() {
    this.link.post({ t: "lang", lang: this.lang });
    this.link.post({
      t: "goto",
      stepId: this.state.stepId || this.player.step.id,
      reveal: this.player.reveal,
    });
    this.link.post({ t: "black", on: this.black });
  }
  private tick() {
    this.renderClock();
    // the stage pose, while the stage moves (≤10 Hz)
    const now = Date.now();
    if (now - this.stageT < STAGE_PERIOD_MS) return;
    this.stageT = now;
    const f = this.player.frame;
    if (f.mode === "live" || f.mode === "clip") {
      const sim = f.sim;
      this.link.post({
        t: "stage",
        pose: stagePoseOf(sim),
        av: { ...sim.av },
        paused: !!sim.paused,
      });
    }
  }
  private setBlack(on: boolean) {
    this.black = on;
    this.link.post({ t: "black", on });
    this.blackBtn.classList.toggle("on", on);
    this.blackBtn.setAttribute("aria-pressed", on ? "true" : "false");
    this.blackBtn.textContent = on
      ? st("blackOn", this.lang)
      : st("black", this.lang);
  }
  private openProjector() {
    const url = academyHref(
      { k: "project", id: this.o.course.id },
      this.o.page,
    );
    try {
      this.projector = window.open(
        url,
        "ifr-projector",
        "popup,width=1280,height=720",
      );
    } catch {
      this.projector = null;
    }
    this.renderHead();
    window.setTimeout(() => this.sync(), 800);
  }
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.closest("input, textarea, select, [contenteditable='true']") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey)
    )
      return;
    const k = e.key;
    if (k === "b" || k === "B" || k === ".") {
      this.setBlack(!this.black);
      e.preventDefault();
    } else if (k === "r" || k === "R") {
      this.player.frame.host.reset();
      e.preventDefault();
    } else if (k === "p" || k === "P") {
      this.openProjector();
      e.preventDefault();
    } else if (k === "Escape" && this.black) {
      this.setBlack(false);
      e.preventDefault();
    }
  };

  // ---------------------------------------------------------------- render
  private renderClock() {
    const el = (Date.now() - this.t0) / 1000;
    const planned = courseMinutes(this.player.steps);
    const soFar = courseMinutes(
      this.player.steps.slice(0, this.player.stepIndex + 1),
    );
    this.clock.textContent = `${clockText(el)} · ${st("planned", this.lang, { m: planned })}`;
    const late = soFar > 0 && el / 60 > soFar * 1.1;
    this.clock.classList.toggle("late", late);
    this.clock.title = late ? st("late", this.lang) : "";
  }
  private renderHead() {
    const lang = this.lang;
    const n = this.player.steps.length;
    this.stepEl.textContent = st("step", lang, {
      n: this.player.stepIndex + 1,
      t: n,
    });
    this.renderClock();
    this.projBtn.textContent =
      this.projector && !this.projector.closed
        ? st("projectorOn", lang)
        : st("projector", lang);
    this.projBtn.disabled = !this.link.ok;
    // the same EN / FR segment as the player and the library (a white pill on grey)
    const langSeg = h(
      "div",
      { class: "cp-langseg pr-lang", role: "group", "aria-label": lang === "fr" ? "Langue" : "Language" },
      ...(["en", "fr"] as Lang[]).map((l) =>
        h(
          "button",
          {
            type: "button",
            class: l === lang ? "on" : "",
            "aria-pressed": l === lang ? "true" : "false",
            lang: l,
            onclick: () => this.setLang(l),
          },
          l.toUpperCase(),
        ),
      ),
    );
    this.head.replaceChildren(
      btn(st("exit", lang), "", () => this.o.onExit(), "back"),
      h(
        "div",
        { class: "pr-title" },
        // the page's one h1: the course being presented
        h("h1", { class: "pr-h1" }, L(this.o.course.title, lang)),
        h("span", { class: "pr-sub" }, this.stepEl, " · ", this.clock),
      ),
      h("span", { class: "pr-sp" }),
      langSeg,
      this.blackBtn,
      this.projBtn,
    );
  }
  private renderSide() {
    const lang = this.lang;
    const steps = this.player.steps;
    const cur: Step = this.player.step;
    const nxt: Step | undefined = steps[this.player.stepIndex + 1];
    this.thumbDestroy?.();
    this.thumbDestroy = null;
    const thumb = h("div", { class: "pr-thumb" });
    if (nxt?.slide) {
      try {
        const v = renderThumb(nxt.slide, thumb, {
          lang,
          theme: this.o.course.theme,
          brand: this.o.course.brand,
          scenes: this.o.course.scenes,
          cockpit: this.o.course.cockpit,
        });
        this.thumbDestroy = () => v?.destroy?.();
      } catch {
        /* the title is enough */
      }
    }
    const nextCard = h(
      "section",
      { class: "pr-card" },
      h("h2", {}, st("next", lang)),
      nxt
        ? h(
            "div",
            { class: "pr-next" },
            nxt.slide ? thumb : null,
            h(
              "div",
              { class: "pr-next-t" },
              kindChip(nxt.kind, lang),
              h("b", {}, L(nxt.title, lang)),
            ),
          )
        : h("p", { class: "pr-muted" }, st("end", lang)),
    );
    const notes = cur.notes ? L(cur.notes, lang) : "";
    const notesCard = h(
      "section",
      { class: "pr-card pr-notes" },
      h("h2", {}, st("notes", lang)),
      notes
        ? h(
            "div",
            { class: "pr-notes-t" },
            ...notes.split(/\n+/).map((p) => h("p", {}, p)),
          )
        : h("p", { class: "pr-muted" }, st("noNotes", lang)),
    );
    const parts: (HTMLElement | null)[] = [nextCard, notesCard];
    if (!this.link.ok)
      parts.push(h("p", { class: "pr-warn" }, st("noChannel", lang)));
    else
      parts.push(
        h("p", { class: "pr-muted pr-small" }, st("projectorHint", lang)),
      );
    parts.push(h("p", { class: "pr-keys" }, st("keys", lang)));
    this.side.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }
}

/** academy.html#present=<id>: the console. */
export function mountPresenter(
  root: HTMLElement,
  o: PresenterOptions,
): Presenter {
  const p = new Presenter(o);
  p.mount(root);
  return p;
}
