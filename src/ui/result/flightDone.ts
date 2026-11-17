// « Vol terminé » (audit §28): a flight outside a course, not graded, ends on one short card (time, the track drawn
// small, three ways on) instead of the full graded debrief. The debrief stays one link away (« Débriefing détaillé »).
import { h, clear, fmtTime } from "../dom";
import { svgIcon, I } from "../icons";
import { Modal } from "../modals";
import { lang } from "../i18n";

/** what ended: a course flight, an exercise (lesson) or a graded approach keep their own result / debrief */
export interface EndedFlight {
  /** the flight was opened from a course (the course gets its result back) */
  fromCourse: boolean;
  /** an exercise with standards (its own result window) */
  exercise: boolean;
  /** the recorder graded it (an approach flown to the end) */
  graded: boolean;
}

/** true when the flight ends on the light card: nothing to grade, nothing to send back */
export function endsLight(f: EndedFlight): boolean {
  return !f.fromCourse && !f.exercise && !f.graded;
}

/** the track as SVG polyline points in a w×h box (north up, equal scale on both axes, centred); '' under 2 points */
export function trackPoints(
  pts: readonly { lat: number; lon: number }[],
  w: number,
  h: number,
  pad = 8,
): string {
  const p = pts.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (p.length < 2) return "";
  const lat0 = p.reduce((a, s) => a + s.lat, 0) / p.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = p.map((s) => s.lon * k);
  const ys = p.map((s) => -s.lat);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const sc = Math.min(w - 2 * pad, h - 2 * pad) / span;
  const ox = (w - (x1 - x0) * sc) / 2,
    oy = (h - (y1 - y0) * sc) / 2;
  return xs
    .map(
      (x, i) =>
        `${(ox + (x - x0) * sc).toFixed(1)},${(oy + (ys[i] - y0) * sc).toFixed(1)}`,
    )
    .join(" ");
}

const tx = (en: string, fr: string) => (lang() === "fr" ? fr : en);

export interface FlightDoneShow {
  title: string;
  durationSec: number;
  samples: readonly { lat: number; lon: number }[];
  /** back to the paused flight */
  onResume: () => void;
  /** the Simulateur page (quick flights) */
  onAnother: () => void;
  /** the library */
  onCourses: () => void;
  /** the full debrief (graded parts, replay, export) */
  onDetail: () => void;
  /** closed with Esc or × without a choice: the flight stays paused, still resumable */
  onDismiss?: () => void;
}

export class FlightDoneCard extends Modal {
  private o: FlightDoneShow | null = null;
  private chosen = false;
  constructor() {
    super("Flight ended", "sm");
    this.box.classList.add("fd-card");
    this.onClose = () => {
      if (!this.chosen) this.o?.onDismiss?.();
    };
  }
  show(o: FlightDoneShow) {
    this.o = o;
    this.chosen = false;
    this.render();
    this.open();
  }
  private render() {
    const o = this.o;
    if (!o) return;
    const title = tx("Flight ended", "Vol terminé");
    this.box.setAttribute("aria-label", title);
    const h2 = this.box.querySelector(":scope > header h2");
    if (h2) h2.textContent = title;
    clear(this.body);
    clear(this.foot);
    const W = 280,
      H = 140;
    const pts = trackPoints(o.samples, W, H);
    const go = (fn: () => void) => () => {
      this.chosen = true;
      this.close();
      fn();
    };
    this.body.append(
      h(
        "p",
        { class: "fd-line" },
        h("b", {}, o.title),
        " · ",
        h("span", { class: "fd-time" }, fmtTime(o.durationSec)),
      ),
      pts
        ? h(
            "div",
            {
              class: "fd-track",
              role: "img",
              "aria-label": tx(
                "Your track, seen from above",
                "Votre trajectoire, vue de dessus",
              ),
            },
            svgTrack(pts, W, H),
          )
        : h(
            "p",
            { class: "fd-none muted" },
            tx(
              "Too short to draw a track.",
              "Trop court pour tracer une trajectoire.",
            ),
          ),
      h(
        "div",
        { class: "fd-acts" },
        h(
          "button",
          {
            class: "btn primary",
            type: "button",
            "data-autofocus": "",
            onclick: go(o.onAnother),
          },
          svgIcon(I.plane, 16),
          tx("Another flight", "Un autre vol"),
        ),
        h(
          "button",
          { class: "btn", type: "button", onclick: go(o.onResume) },
          svgIcon(I.play, 16),
          tx("Resume the flight", "Reprendre le vol"),
        ),
        h(
          "button",
          { class: "btn", type: "button", onclick: go(o.onCourses) },
          svgIcon(I.slides, 16),
          tx("See the courses", "Voir les cours"),
        ),
      ),
      h(
        "button",
        { class: "linkbtn fd-detail", type: "button", onclick: go(o.onDetail) },
        tx("Detailed debrief", "Débriefing détaillé"),
      ),
    );
  }
}

function svgTrack(points: string, w: number, hgt: number): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("points", points);
  line.setAttribute("class", "fd-path");
  const [sx, sy] = points.split(" ")[0].split(",");
  const [ex, ey] = points.split(" ").slice(-1)[0].split(",");
  const dot = (x: string, y: string, c: string) => {
    const d = document.createElementNS(NS, "circle");
    d.setAttribute("cx", x);
    d.setAttribute("cy", y);
    d.setAttribute("r", "4");
    d.setAttribute("class", c);
    return d;
  };
  svg.append(line, dot(sx, sy, "fd-start"), dot(ex, ey, "fd-end"));
  return svg;
}
