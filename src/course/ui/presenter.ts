// Presenter console (package G, SPEC §6.3): academy.html#present=<id>[&s=<step>]. The current step at about 65 %
// (the real player, which the CFI operates), the next step, the presenter notes, the timer against the planned
// minutes, the reveal position, a black-screen toggle, the projector window and a strip of every step (a click moves
// the projector there). Keys: → / PageDown / Space next, ← / PageUp back, N (or B, .) black screen, P open the
// projector screen, Esc leaves (after lifting a black screen). Student-only buttons never show here or on the
// projector (UX logic §6).
import type { Course, Lang, Step } from "../types";
import type { CourseStore } from "../store";
import { h } from "../../ui/dom";
import {
  canvasSlideRenderer,
  playCourse,
  type CoursePlayer,
  type SlideHost,
  type SlideRenderer,
} from "./player";
import { DemoPanel } from "./demoPilot";
import "../../styles/presenter.css";
import { btn, L, ps, taskChip } from "./reader";
import { toDesignedSlide } from "./templates";
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
  step: ["Slide {n} of {t}", "Diapo {n} sur {t}"],
  next: ["Next slide", "Diapo suivante"],
  end: ["End of the course", "Fin du cours"],
  notes: ["Notes", "Notes"],
  noNotes: [
    "No presenter notes for this slide.",
    "Pas de notes pour cette diapo.",
  ],
  reveal: ["Reveal {r} of {n}", "Affichage {r} sur {n}"],
  projector: ["Open the projector screen", "Ouvrir l’écran de projection"],
  projectorOn: ["Projector open", "Projection ouverte"],
  projectorOnTip: [
    "The projector screen is open: a click brings it to the front",
    "L’écran de projection est ouvert : un clic le ramène devant",
  ],
  projectorHint: [
    "Drag the projector screen to the second display, then press F11 (or ⌃⌘F) for full screen. The class sees only that screen.",
    "Glissez l’écran de projection sur le second écran, puis F11 (ou ⌃⌘F) pour le plein écran. La classe ne voit que cet écran.",
  ],
  strip: [
    "Every slide: a click shows it on the projector",
    "Toutes les diapos : un clic l’affiche sur la projection",
  ],
  noChannel: [
    "This browser cannot link two windows: present from this window.",
    "Ce navigateur ne peut pas relier deux fenêtres : présentez depuis celle-ci.",
  ],
  black: ["Black screen", "Écran noir"],
  blackOn: ["Screen is black", "Écran noir actif"],
  exit: ["Leave the presentation", "Quitter la présentation"],
  planned: ["planned {m} min", "prévu {m} min"],
  keys: [
    "→ next · ← previous · N black screen · Esc leave",
    "→ suivant · ← précédent · N écran noir · Échap quitter",
  ],
  keysDemo: [
    "Space next · Esc closes the demonstration · N black screen",
    "Espace suivant · Échap ferme la démonstration · N écran noir",
  ],
  late: ["behind the plan", "en retard sur le plan"],
  resumed: ["Resumed at slide {n}", "Reprise à la diapo {n}"],
  startOver: ["Start over", "Recommencer"],
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
  private strip: HTMLElement;
  private stripViews: { destroy(): void }[] = [];
  private stripLang: Lang | null = null;
  private ready = false;
  /** the slide on screen (its live situations: the demonstration drives them, the projector mirrors them) */
  private slideHost: SlideHost | null = null;
  private demo: DemoPanel;
  private demoT = 0;
  /** the presentation picked up where it was left (said in the top bar, never a toast over the slide) */
  private resumedAt: number | null = null;
  private resumeObs: MutationObserver | null = null;
  /** the notes card, folded or not, while the demonstration is driven */
  private notesOpen = true;
  private stripWrap: HTMLElement;

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
    // secondary: « Suivant » is the one filled button of the presenter (audit item 40)
    this.projBtn = btn(st("projector", this.lang), "pr-projb", () =>
      this.openProjector(),
    );
    this.head = h("header", { class: "pr-head" });
    this.side = h("aside", {
      class: "pr-side",
      "aria-label": st("presenter", this.lang),
    });
    const main = h("div", { class: "pr-main" });
    this.strip = h("ol", { class: "pr-strip" });
    this.stripWrap = h(
      "nav",
      { class: "pr-stripwrap", "aria-label": st("strip", this.lang) },
      this.strip,
    );
    // the strip fades at an edge only while more slides hide past it
    this.stripWrap.addEventListener("scroll", () => this.stripFade(), { passive: true });
    this.el.append(
      this.head,
      h(
        "div",
        { class: "pr-body" },
        h(
          "div",
          { class: "pr-col" },
          main,
          this.stripWrap,
        ),
        this.side,
      ),
    );
    this.demo = new DemoPanel({
      lang: () => this.lang,
      course: o.course,
      store: o.store,
      ...(o.page ? { page: o.page } : {}),
      step: () => this.player.step,
      slide: () => this.slideHost,
      post: (m) => this.link.post(m),
      // « Suivant » is the presenter's one filled button: the demonstration's launchers stay outlined
      primary: () => false,
      changed: () => {
        if (this.ready) this.renderSide();
      },
    });
    const inner = o.renderSlide ?? canvasSlideRenderer;
    const renderSlide: SlideRenderer = (ctx) => {
      const host = inner(ctx);
      this.slideHost = host;
      // the presenter uses the slide's own strip: the strip flies, the demonstration lets go
      const touched = (e: Event) => {
        if ((e.target as HTMLElement | null)?.closest?.(".sl-strip"))
          this.demo.stripTouched();
      };
      host.el.addEventListener("pointerdown", touched, true);
      host.el.addEventListener("keydown", touched, true);
      // the instruments register while the slide is built: the card follows once it is on the page
      requestAnimationFrame(() => {
        if (this.slideHost === host && this.ready) this.demo.render();
      });
      return host;
    };
    this.player = playCourse(main, {
      course: o.course,
      store: o.store,
      lang: this.lang,
      stepId: o.stepId,
      mode: this.lang === "fr" ? "présentation" : "presenting",
      renderSlide,
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
        this.syncStrip();
      },
    });
    this.link.on((m) => {
      if (m.t === "hello") this.sync();
    });
    this.watchResume(main);
    this.ready = true;
    document.addEventListener("keydown", this.onKey);
    // the deck's keys go before the player's (arrows fly the aircraft instead of turning the page)
    window.addEventListener("keydown", this.onDemoKey, true);
    this.timer = window.setInterval(() => this.tick(), 250);
    this.demoT = window.setInterval(() => this.demo.tick(), 50);
    // back from the simulator (or reopened): the projector takes up this step at once
    this.sync();
    this.renderHead();
    this.renderSide();
    this.renderStrip();
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
    this.renderStrip();
  }
  destroy() {
    window.clearInterval(this.timer);
    window.clearInterval(this.demoT);
    document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keydown", this.onDemoKey, true);
    this.resumeObs?.disconnect();
    this.demo.destroy();
    this.link.post({ t: "bye" });
    this.link.close();
    this.thumbDestroy?.();
    for (const v of this.stripViews.splice(0)) v.destroy();
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
    // already open (the chip): bring it to the front, never reload it under the class's eyes
    if (this.projector && !this.projector.closed) {
      try {
        this.projector.focus();
      } catch {
        /* another window may refuse the focus */
      }
      return;
    }
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
    // the projector closed by hand: the button says so again
    const poll = window.setInterval(() => {
      if (!this.projector || this.projector.closed) {
        window.clearInterval(poll);
        if (this.ready) this.renderHead();
      }
    }, 1000);
  }
  private onDemoKey = (e: KeyboardEvent) => {
    // Space turns the page, as the deck says, even when one of its buttons or sliders has the focus
    const t = e.target as Node | null;
    if (
      e.key === " " &&
      this.demo.open &&
      t &&
      this.demo.el.contains(t) &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.player.next();
      return;
    }
    if (!this.demo.key(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
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
    if (k === "n" || k === "N" || k === "b" || k === "B" || k === ".") {
      this.setBlack(!this.black);
      e.preventDefault();
    } else if (k === "p" || k === "P") {
      this.openProjector();
      e.preventDefault();
    } else if (k === "Escape") {
      // Esc lifts a black screen first, closes the demonstration, then leaves the presentation
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (this.black) this.setBlack(false);
      else if (this.demo.open) this.demo.close();
      else this.o.onExit();
    }
  };

  /**
   * The player picks the presentation up where it was left and says so in a toast over the slide: the presenter
   * says it in its top bar instead (« Reprise à la diapo 4 · Recommencer »), the slide stays clear.
   */
  private watchResume(main: HTMLElement) {
    const toast = main.querySelector<HTMLElement>(".cp-toast");
    if (!toast || typeof MutationObserver === "undefined") return;
    const check = () => {
      if (toast.hidden) return;
      const n = this.player.stepIndex + 1;
      if (n > 1 && (toast.textContent ?? "").startsWith(ps("resumed", this.lang, { n }))) {
        toast.hidden = true;
        this.resumedAt = n - 1;
        if (this.ready) this.renderHead();
      }
    };
    this.resumeObs = new MutationObserver(check);
    this.resumeObs.observe(toast, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
  }
  private stripFade() {
    const w = this.stripWrap;
    const max = w.scrollWidth - w.clientWidth;
    w.classList.toggle("fade-l", w.scrollLeft > 4);
    w.classList.toggle("fade-r", max - w.scrollLeft > 4);
  }

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
    const open = !!this.projector && !this.projector.closed;
    // closed: an outlined button « Ouvrir l’écran de projection »; open: the chip « Projection ouverte ● »
    // (a click brings the projector window to the front). « Suivant » stays the one filled button.
    if (open)
      this.projBtn.replaceChildren(
        h("span", {}, st("projectorOn", lang)),
        h("i", { class: "pr-projdot", "aria-hidden": "true" }),
      );
    else this.projBtn.textContent = st("projector", lang);
    this.projBtn.classList.remove("primary");
    this.projBtn.classList.toggle("pr-projchip", open);
    this.projBtn.title = open ? st("projectorOnTip", lang) : "";
    if (this.ready && open !== this.el.classList.contains("proj-on"))
      queueMicrotask(() => this.demo.render());
    this.el.classList.toggle("proj-on", open || !this.link.ok);
    this.projBtn.disabled = !this.link.ok;
    // the same EN / FR segment as the player and the library (a white pill on grey)
    const langSeg = h(
      "div",
      {
        class: "cp-langseg pr-lang",
        role: "group",
        "aria-label": lang === "fr" ? "Langue" : "Language",
      },
      ...(["fr", "en"] as Lang[]).map((l) =>
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
    // picked up where it was left: said here while that slide is on, with the way back to the start
    if (this.resumedAt !== null && this.resumedAt !== this.player.stepIndex) this.resumedAt = null;
    let resumed: HTMLElement | null = null;
    if (this.resumedAt !== null) {
      const again = h("button", { type: "button", class: "pr-resume-b" }, st("startOver", lang));
      again.addEventListener("click", () => {
        this.resumedAt = null;
        this.player.goTo(0);
        this.renderHead();
      });
      resumed = h(
        "span",
        { class: "pr-resume", role: "status" },
        " · ",
        st("resumed", lang, { n: this.resumedAt + 1 }),
        " · ",
        again,
      );
    }
    this.head.replaceChildren(
      btn(st("exit", lang), "", () => this.o.onExit(), "back"),
      h(
        "div",
        { class: "pr-title" },
        // the page's one h1: the course being presented
        h("h1", { class: "pr-h1" }, L(this.o.course.title, lang)),
        h("span", { class: "pr-sub" }, this.stepEl, " · ", this.clock, resumed),
      ),
      h("span", { class: "pr-sp" }),
      langSeg,
      this.blackBtn,
      this.projBtn,
    );
  }
  /** Every step as a thumbnail: a click moves the presentation (and the projector) to that step. */
  private renderStrip() {
    for (const v of this.stripViews.splice(0)) v.destroy();
    this.stripLang = this.lang;
    const lang = this.lang;
    const c = this.o.course;
    this.strip.replaceChildren(
      ...this.player.steps.map((s, i) => {
        const pic = h("span", { class: "pr-st-pic", "aria-hidden": "true" });
        const b = h(
          "button",
          {
            type: "button",
            class: "pr-st",
            "data-i": String(i),
            title: `${i + 1}. ${L(s.title, lang)}`,
            "aria-label": `${lang === "fr" ? "Diapo" : "Slide"} ${i + 1} : ${L(s.title, lang)}`,
          },
          pic,
          h("span", { class: "pr-st-n num" }, String(i + 1)),
          // the kind of step (À vous, Question, Vol…) as a badge on its picture
          (() => {
            const k = taskChip(s, lang);
            if (k) k.classList.add("pr-st-k");
            return k;
          })(),
        );
        // every step gets a real picture: a slide as it is, any other step as the slide it would make
        let shown = s.slide;
        if (!shown)
          try {
            shown = toDesignedSlide(s, c).slide;
          } catch {
            shown = undefined;
          }
        // drawn once the console is on the page (the strip is built before it is mounted)
        let tries = 0;
        const draw = () => {
          if (this.stripLang !== lang || tries++ > 60) return;
          if (!pic.isConnected || !pic.clientWidth) {
            requestAnimationFrame(draw);
            return;
          }
          {
            try {
              const v = renderThumb(shown!, pic, {
                lang,
                theme: c.theme,
                brand: c.brand,
                scenes: c.scenes,
                cockpit: c.cockpit,
              });
              if (v) this.stripViews.push(v);
            } catch {
              /* the number and the title say it */
            }
          }
        };
        if (shown) requestAnimationFrame(draw);
        else pic.append(h("span", { class: "pr-st-t" }, L(s.title, lang)));
        b.addEventListener("click", () => this.player.goTo(i));
        return h("li", {}, b);
      }),
    );
    this.syncStrip();
  }
  private syncStrip() {
    const cur = this.player.stepIndex;
    this.strip.querySelectorAll<HTMLElement>(".pr-st").forEach((b) => {
      const on = Number(b.dataset.i) === cur;
      b.classList.toggle("on", on);
      if (on) {
        b.setAttribute("aria-current", "step");
        // the current slide comes into the strip's view (the strip only: the page never scrolls)
        const w = this.stripWrap;
        const li = b.parentElement ?? b;
        const left = li.offsetLeft;
        const right = left + li.offsetWidth;
        if (left < w.scrollLeft + 24 || right > w.scrollLeft + w.clientWidth - 24)
          w.scrollLeft = Math.max(0, left - (w.clientWidth - li.offsetWidth) / 2);
      } else b.removeAttribute("aria-current");
    });
    this.stripFade();
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
              taskChip(nxt, lang),
              h("b", {}, L(nxt.title, lang)),
            ),
          )
        : h("p", { class: "pr-muted" }, st("end", lang)),
    );
    const notes = cur.notes ? L(cur.notes, lang) : "";
    const notesBody = notes
      ? h(
          "div",
          { class: "pr-notes-t" },
          ...notes.split(/\n+/).map((p) => h("p", {}, p)),
        )
      : h("p", { class: "pr-muted" }, st("noNotes", lang));
    this.demo.render();
    const driving = this.demo.open;
    // driving the demonstration keeps the notes in sight, right under its controls, and they fold away
    let notesCard: HTMLElement;
    if (driving) {
      const d = h(
        "details",
        { class: "pr-card pr-notes pr-notes-fold" },
        h("summary", {}, h("h2", {}, st("notes", lang))),
        notesBody,
      ) as HTMLDetailsElement;
      d.open = this.notesOpen;
      d.addEventListener("toggle", () => (this.notesOpen = d.open));
      notesCard = d;
    } else notesCard = h("section", { class: "pr-card pr-notes" }, h("h2", {}, st("notes", lang)), notesBody);
    this.side.classList.toggle("pr-driving", driving);
    this.el.classList.toggle("pr-demo-on", driving);
    const parts: (HTMLElement | null)[] = driving
      ? [this.demo.el, notesCard, nextCard]
      : [this.demo.el, nextCard, notesCard];
    if (!this.link.ok)
      parts.push(h("p", { class: "pr-warn" }, st("noChannel", lang)));
    else if (!driving)
      parts.push(
        h("p", { class: "pr-muted pr-small" }, st("projectorHint", lang)),
      );
    parts.push(
      h("p", { class: "pr-keys" }, st(this.demo.open ? "keysDemo" : "keys", lang)),
    );
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
