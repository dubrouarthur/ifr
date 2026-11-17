// Projector window (package G, SPEC §6.3): academy.html#project=<id>. The player in the projector theme without its
// chrome (no top bar, no footer), following the presenter console: step and reveal, black screen, language, and the
// presenter's stage pose while it moves. It never simulates on its own, so it cannot drift.
import type { Course, Lang } from "../types";
import { h } from "../../ui/dom";
import {
  canvasSlideRenderer,
  playCourse,
  type CoursePlayer,
  type SlideHost,
  type SlideRenderer,
} from "./player";
import type { SimEntry } from "../canvas/instruments";
import { applyMirror, entryId, slideEntries, type SimMirror } from "./demoPilot";
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
  away: [
    "The instructor is showing this situation in the simulator. The course resumes here.",
    "L’instructeur montre la situation dans le simulateur. Le cours reprend ici.",
  ],
} as const;
const BADGE = {
  instructor: ["Demonstration by the instructor", "Démonstration par l’instructeur"],
  student: ["A student has the controls", "Un élève a les commandes"],
} as const;
/** the badge goes when the console stops telling who flies (closed, gone into the simulator) */
const BADGE_TTL_MS = 2500;

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
  /** the slide on screen: its instruments draw the console's aircraft (they never fly here) */
  private slideHost: SlideHost | null = null;
  private followed = new WeakSet<SimEntry>();
  private badge: HTMLElement;
  private badgeT = 0;
  private courseId: string;

  constructor(o: ProjectorOptions) {
    this.lang = o.lang;
    this.courseId = o.course.id;
    this.link = presentLink(o.course.id);
    this.el = h("div", { class: "pj-app", lang: this.lang });
    const main = h("div", { class: "pj-main" });
    this.blackEl = h("div", {
      class: "pj-black",
      hidden: true,
      "aria-hidden": "true",
    });
    this.wait = h("div", { class: "pj-wait", role: "status" });
    this.badge = h("div", { class: "pj-demo", hidden: true, role: "status" });
    this.el.append(main, this.badge, this.blackEl, this.wait);
    const inner = o.renderSlide ?? canvasSlideRenderer;
    const renderSlide: SlideRenderer = (ctx) => {
      const host = inner(ctx);
      this.slideHost = host;
      this.followed = new WeakSet();
      return host;
    };
    this.player = playCourse(main, {
      course: o.course,
      store: null,
      lang: this.lang,
      mode: this.lang === "fr" ? "projection" : "projector",
      renderSlide,
    });
    this.player.el.classList.add("cp-projector");
    this.link.on((m) => this.onMsg(m));
    this.link.post({ t: "hello", courseId: o.course.id });
    this.setWait(this.link.ok ? "waiting" : "noChannel");
    // a console opened later says hello too; re-ask a few times until one answers
    this.askAgain();
  }
  /** say hello every 2 s until a console answers (opened later, or back from the simulator) */
  private askAgain() {
    window.clearInterval(this.waitT);
    this.waitT = window.setInterval(() => {
      if (this.heard) window.clearInterval(this.waitT);
      else this.link.post({ t: "hello", courseId: this.courseId });
    }, 2000);
  }

  mount(root: HTMLElement) {
    root.append(this.el);
  }
  destroy() {
    window.clearInterval(this.waitT);
    window.clearTimeout(this.badgeT);
    this.link.close();
    this.player.destroy();
    this.el.remove();
  }
  /** The console's aircraft on the slide's instruments: drawn here, never flown here (so it cannot drift). */
  private follow(list: SimMirror[]) {
    const sims = this.slideHost?.sims;
    if (!sims || !list.length) return;
    const byId = new Map<string, SimEntry>();
    for (const e of slideEntries(sims)) byId.set(entryId(e), e);
    for (const m of list) {
      const e = byId.get(m.id);
      if (!e) continue;
      if (!this.followed.has(e)) {
        // the console flies it now: this window's copy of the animation stops, its clock stops
        if (e.motion && e.motion.state !== "handed") e.motion.handOver();
        sims.run(e, false);
        this.followed.add(e);
      }
      try {
        applyMirror(e.sim, m);
      } catch {
        continue;
      }
      sims.touch(e);
    }
    sims.ensureLoop();
  }
  /** The presenter replayed, paused or resumed an animation: this window plays its own copy the same way. */
  private anim(id: string, op: "replay" | "pause" | "resume") {
    const sims = this.slideHost?.sims;
    if (!sims) return;
    const e = slideEntries(sims).find((x) => entryId(x) === id);
    if (!e) return;
    if (op === "replay") {
      sims.restart(e);
      this.followed.delete(e);
    } else if (op === "pause") e.motion?.pause();
    else e.motion?.resume();
    sims.ensureLoop();
  }
  private setBadge(who: "instructor" | "student" | null) {
    window.clearTimeout(this.badgeT);
    this.badge.hidden = !who;
    this.badge.classList.toggle("student", who === "student");
    if (!who) return;
    const txt = BADGE[who][this.lang === "fr" ? 1 : 0];
    if (this.badge.textContent !== txt) this.badge.textContent = txt;
    this.badgeT = window.setTimeout(() => this.setBadge(null), BADGE_TTL_MS);
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
        this.setBadge(null);
        this.askAgain();
        break;
      case "away":
        if (m.on) {
          this.heard = false;
          this.setWait("away");
          this.setBadge(null);
          this.askAgain();
        }
        break;
      case "sims":
        if (m.stepId === this.player.step.id) this.follow(m.list);
        this.setBadge(m.who);
        break;
      case "anim":
        if (m.stepId === this.player.step.id) this.anim(m.id, m.op);
        break;
      case "diagram":
        if (m.stepId === this.player.step.id) this.slideHost?.diagrams?.apply(m.id, m.st);
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
