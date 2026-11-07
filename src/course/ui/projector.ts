// Projector window (package G, SPEC §6.3): academy.html#project=<id>. The player in the projector theme without its
// chrome (no top bar, no footer), following the presenter console: step and reveal, black screen, language, and the
// presenter's stage pose while it moves. It never simulates on its own, so it cannot drift.
import type { Course, Lang } from "../types";
import { h } from "../../ui/dom";
import { playCourse, type CoursePlayer, type SlideRenderer } from "./player";
import { applyStagePose } from "../scene";
import { presentLink, type PresentLink, type PresentWire } from "../present";

const W = {
  waiting: [
    "Waiting for the presenter console… Open it from Present in the course library.",
    "En attente de la console du présentateur… Ouvrez-la avec Présenter dans la bibliothèque.",
  ],
  noChannel: [
    "This browser cannot link two windows: present from the console window.",
    "Ce navigateur ne peut pas relier deux fenêtres : présentez depuis la console.",
  ],
  ended: ["The presenter left.", "Le présentateur est parti."],
} as const;

export interface ProjectorOptions {
  course: Course;
  lang: Lang;
  renderSlide?: SlideRenderer;
}

export class Projector {
  readonly el: HTMLDivElement;
  private player: CoursePlayer;
  private link: PresentLink;
  private lang: Lang;
  private blackEl: HTMLElement;
  private wait: HTMLElement;
  private heard = false;
  private waitT = 0;

  constructor(o: ProjectorOptions) {
    this.lang = o.lang;
    this.link = presentLink(o.course.id);
    this.el = h("div", { class: "pj-app", lang: this.lang });
    const main = h("div", { class: "pj-main" });
    this.blackEl = h("div", {
      class: "pj-black",
      hidden: true,
      "aria-hidden": "true",
    });
    this.wait = h("div", { class: "pj-wait", role: "status" });
    this.el.append(main, this.blackEl, this.wait);
    this.player = playCourse(main, {
      course: o.course,
      store: null,
      lang: this.lang,
      mode: this.lang === "fr" ? "projection" : "projector",
      ...(o.renderSlide ? { renderSlide: o.renderSlide } : {}),
    });
    this.player.el.classList.add("cp-projector");
    this.link.on((m) => this.onMsg(m));
    this.link.post({ t: "hello", courseId: o.course.id });
    this.setWait(this.link.ok ? "waiting" : "noChannel");
    // a console opened later says hello too; re-ask a few times until one answers
    this.waitT = window.setInterval(() => {
      if (this.heard) window.clearInterval(this.waitT);
      else this.link.post({ t: "hello", courseId: o.course.id });
    }, 2000);
  }
  mount(root: HTMLElement) {
    root.append(this.el);
  }
  destroy() {
    window.clearInterval(this.waitT);
    this.link.close();
    this.player.destroy();
    this.el.remove();
  }
  private setWait(k: keyof typeof W | null) {
    this.wait.hidden = !k;
    if (k) this.wait.textContent = W[k][this.lang === "fr" ? 1 : 0];
  }
  private onMsg(m: PresentWire) {
    if (m.t !== "hello" && !this.heard) {
      this.heard = true;
      this.setWait(null);
    }
    switch (m.t) {
      case "goto":
        if (this.player.step.id !== m.stepId) this.player.goToId(m.stepId);
        if (this.player.reveal !== m.reveal) this.player.setReveal(m.reveal);
        break;
      case "black":
        this.blackEl.hidden = !m.on;
        break;
      case "lang":
        if (m.lang !== this.lang) {
          this.lang = m.lang;
          this.el.lang = m.lang;
          this.player.setLang(m.lang);
        }
        break;
      case "stage":
        try {
          applyStagePose(this.player.frame.sim, m.pose, m.av);
        } catch {
          /* a step without a stage */
        }
        break;
      case "action":
        this.player.frame.host.action(m.action);
        break;
      case "bye":
        this.heard = false;
        this.setWait("ended");
        break;
      default:
        break;
    }
  }
}

/** academy.html#project=<id>: the projector window. */
export function mountProjector(
  root: HTMLElement,
  o: ProjectorOptions,
): Projector {
  const p = new Projector(o);
  p.mount(root);
  return p;
}
