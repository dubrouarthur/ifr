// Instructor console UI: pairing screen, live map + flight data, and the five instructor panels
// (Failures, Weather, ATC, Session, Log). Built once; snapshots (4 Hz) only update text and state classes, so a
// slider being dragged or a field being typed in is never rebuilt under the instructor's finger.
import { h, clear } from "../ui/dom";
import { svgIcon, I } from "../ui/icons";
import {
  FAILURE_KEYS,
  FAILURE_TEXT,
  REPOSITIONS,
  REMOTE_WX_PRESETS,
  CODE_LEN,
  formatPairCode,
  fmtVis,
  pad3,
  turbulenceName,
  type FailureKey,
  type HostMsg,
  type RemoteCommand,
  type RemoteRoute,
  type RemoteSnapshot,
} from "../connect/remoteTypes";
import type { LinkState } from "./main";

export interface ConsoleActions {
  connect(code: string): boolean;
  send(c: RemoteCommand): number | null;
  disconnect(): void;
}

type Tab = "fail" | "wx" | "atc" | "session" | "log";
const TABS: { id: Tab; name: string; icon: string }[] = [
  { id: "fail", name: "Failures", icon: I.warning },
  { id: "wx", name: "Weather", icon: I.cloud },
  { id: "atc", name: "ATC", icon: I.direct },
  { id: "session", name: "Session", icon: I.pin },
  { id: "log", name: "Log", icon: I.records },
];

const mmss = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const hh = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
const fmtAlt = (ft: number) => Math.round(ft).toLocaleString("en-US");
const wrap360 = (d: number) => ((Math.round(d) % 360) + 360) % 360 || 360;
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/** append, skipping the parts that are not there */
const put = (el: HTMLElement, ...c: (Node | null)[]) => c.forEach((x) => x && el.append(x));

interface LogEntry {
  t: number;
  text: string;
  kind: "you" | "sim" | "bad" | "good";
}

/** a button that needs a second tap within 3 s (engine failure, end flight) */
function confirmTap(
  btn: HTMLButtonElement,
  armedText: string,
  act: () => void,
  onArm?: (armed: boolean) => void,
) {
  let armed: ReturnType<typeof setTimeout> | undefined;
  let saved = "";
  const lab = () => btn.querySelector(".lbl") as HTMLElement | null;
  btn.addEventListener("click", () => {
    if (armed) {
      clearTimeout(armed);
      armed = undefined;
      btn.classList.remove("armed");
      if (lab()) lab()!.textContent = saved;
      onArm?.(false);
      act();
      return;
    }
    saved = lab()?.textContent ?? "";
    if (lab()) lab()!.textContent = armedText;
    btn.classList.add("armed");
    onArm?.(true);
    armed = setTimeout(() => {
      armed = undefined;
      btn.classList.remove("armed");
      if (lab()) lab()!.textContent = saved;
      onArm?.(false);
    }, 3000);
  });
}

// ================================================================== moving map
const RANGES = [1, 2, 5, 10, 20, 40, 80];
class MovingMap {
  el: HTMLElement;
  private cv = h("canvas", {
    class: "rc-map-cv",
    "aria-label": "Moving map: aircraft position, route and track",
  });
  private ctx = this.cv.getContext("2d")!;
  private rangeEl = h("span", { class: "rc-map-range" });
  private centerBtn: HTMLButtonElement;
  private range = Number(store.get("ifr.remote.range")) || 10;
  /** pick the range that shows the next waypoint and the destination; any manual zoom turns it off */
  private auto = true;
  private follow = true;
  private center: { lat: number; lon: number } | null = null;
  private snap: RemoteSnapshot | null = null;
  private snapAt = 0;
  private route: RemoteRoute | null = null;
  private trail: { lat: number; lon: number }[] = [];
  private w = 0;
  private hgt = 0;
  private dpr = 1;
  private raf = 0;
  private colors: Record<string, string> = {};
  constructor() {
    const zoom = (dir: number) => {
      const i = RANGES.findIndex((r) => r >= this.range - 1e-6);
      const ni = Math.max(
        0,
        Math.min(RANGES.length - 1, (i < 0 ? RANGES.length - 1 : i) + dir),
      );
      this.auto = false;
      this.setRange(RANGES[ni]);
    };
    this.centerBtn = h(
      "button",
      {
        class: "rc-map-btn rc-map-center",
        type: "button",
        "aria-label": "Center on the aircraft",
        title: "Center on the aircraft",
        onclick: () => {
          this.follow = true;
          this.auto = true;
          this.centerBtn.classList.remove("on");
          this.setRange(this.range);
        },
      },
      svgIcon(I.target, 20),
    );
    this.el = h(
      "div",
      { class: "rc-map" },
      this.cv,
      h(
        "div",
        { class: "rc-map-ctl" },
        h(
          "button",
          {
            class: "rc-map-btn",
            type: "button",
            "aria-label": "Zoom in",
            onclick: () => zoom(-1),
          },
          "+",
        ),
        h(
          "button",
          {
            class: "rc-map-btn",
            type: "button",
            "aria-label": "Zoom out",
            onclick: () => zoom(1),
          },
          "−",
        ),
        this.centerBtn,
      ),
      h("div", { class: "rc-map-n", "aria-hidden": "true" }, "N"),
      this.rangeEl,
    );
    new ResizeObserver(() => this.resize()).observe(this.el);
    this.pointer();
    this.el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.auto = false;
        this.setRange(this.range * (e.deltaY > 0 ? 1.25 : 0.8));
      },
      { passive: false },
    );
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.(
      "change",
      () => {
        this.colors = {};
        this.kick();
      },
    );
    this.setRange(this.range);
  }
  private setRange(r: number) {
    this.range = Math.max(0.5, Math.min(120, r));
    store.set("ifr.remote.range", String(this.range));
    this.rangeEl.textContent = `${this.range < 1 ? this.range.toFixed(1) : Math.round(this.range)} NM${this.auto ? " · Auto" : ""}`;
    this.kick();
  }
  private pointer() {
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let range0 = 0;
    this.cv.addEventListener("pointerdown", (e) => {
      this.cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        range0 = this.range;
      }
    });
    this.cv.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0 && d > 0) {
          this.auto = false;
          this.setRange(range0 * (pinch0 / d));
        }
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const c = this.center ?? this.pos();
      if (!c) return;
      const k = this.pxPerNm();
      this.center = {
        lat: c.lat + dy / k / 60,
        lon: c.lon - dx / k / 60 / Math.cos((c.lat * Math.PI) / 180),
      };
      this.follow = false;
      this.centerBtn.classList.add("on");
      this.kick();
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch0 = 0;
    };
    this.cv.addEventListener("pointerup", up);
    this.cv.addEventListener("pointercancel", up);
  }
  private resize() {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.hgt = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.hgt * this.dpr);
    this.kick();
  }
  setSnap(s: RemoteSnapshot) {
    const last = this.trail[this.trail.length - 1];
    // a reposition or a restart: start a new trail instead of drawing a line across the map
    if (
      last &&
      Math.hypot(
        s.lat - last.lat,
        (s.lon - last.lon) * Math.cos((s.lat * Math.PI) / 180),
      ) *
        60 >
        3
    )
      this.trail = [];
    if (!last || Math.hypot(s.lat - last.lat, s.lon - last.lon) > 0.0004)
      this.trail.push({ lat: s.lat, lon: s.lon });
    if (this.trail.length > 3000)
      this.trail.splice(0, this.trail.length - 3000);
    this.snap = s;
    this.snapAt = performance.now();
    this.kick();
  }
  setRoute(r: RemoteRoute) {
    this.route = r;
    this.kick();
  }
  clearTrail() {
    this.trail = [];
  }
  /** dead-reckoned position between snapshots (smooth movement at 4 Hz updates) */
  private pos(): { lat: number; lon: number } | null {
    const s = this.snap;
    if (!s) return null;
    if (s.paused || (s.onGround && s.gsKt < 1))
      return { lat: s.lat, lon: s.lon };
    const dt = Math.min(1, (performance.now() - this.snapAt) / 1000);
    const nm = (s.gsKt * dt) / 3600;
    const tr = ((s.trk + (s.magVar ?? 0)) * Math.PI) / 180;
    return {
      lat: s.lat + (nm * Math.cos(tr)) / 60,
      lon: s.lon + (nm * Math.sin(tr)) / 60 / Math.cos((s.lat * Math.PI) / 180),
    };
  }
  private pxPerNm() {
    return (Math.min(this.w, this.hgt) / 2 - 18) / this.range;
  }
  /** auto range: the smallest standard range that keeps the next waypoint and the destination airport in view
   *  (with room for their labels), never jumping back and forth */
  private autoRange(ac: { lat: number; lon: number }) {
    const s = this.snap;
    const r = this.route;
    if (!this.auto || !this.follow || !s || !r) return;
    const pts: { lat: number; lon: number }[] = [];
    const to = r.wpts[r.active];
    if (to) pts.push(to);
    const dest = s.approach?.airport
      ? r.airports.find((a) => a.ident === s.approach!.airport)
      : null;
    if (dest) pts.push(dest);
    if (!pts.length) return;
    const half = Math.min(this.w, this.hgt) / 2 - 18;
    const hx = Math.max(40, this.w / 2 - 56);
    const hy = Math.max(40, this.hgt / 2 - 40);
    const cos = Math.cos((ac.lat * Math.PI) / 180);
    let need = 0;
    for (const p of pts) {
      const dx = Math.abs((p.lon - ac.lon) * cos * 60);
      const dy = Math.abs((p.lat - ac.lat) * 60);
      need = Math.max(need, (dx * half) / hx, (dy * half) / hy);
    }
    const fit = RANGES.find((x) => x >= Math.max(2, need)) ?? RANGES[RANGES.length - 1];
    // zoom out at once; zoom in only with a clear margin (no flicker at a boundary)
    if (fit > this.range || (fit < this.range && need < fit * 0.85)) {
      this.range = fit;
      this.rangeEl.textContent = `${fit} NM · Auto`;
    }
  }
  private kick() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
      if (
        this.snap &&
        !this.snap.paused &&
        performance.now() - this.snapAt < 1200
      )
        this.kick();
    });
  }
  private color(k: string) {
    if (!this.colors[k])
      this.colors[k] =
        getComputedStyle(this.el).getPropertyValue(`--map-${k}`).trim() ||
        "#888";
    return this.colors[k];
  }
  private drawLabels(labels: { text: string; x: number; y: number; color: string; weight: number; prio: number; size?: number }[], acx: number, acy: number, font: (w: number, px: number) => string, segs: [number, number, number, number][]) {
    const c = this.ctx;
    const taken: [number, number, number, number][] = [[acx - 18, acy - 18, acx + 18, acy + 18]];
    const boxHit = (r: [number, number, number, number]) => taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1]);
    // does a drawn line (route leg, track vector) cross the label box? (Liang-Barsky clip)
    const segHit = (r: [number, number, number, number]) =>
      segs.some(([x1, y1, x2, y2]) => {
        let t0 = 0,
          t1 = 1;
        const dx = x2 - x1,
          dy = y2 - y1;
        const P = [-dx, dx, -dy, dy];
        const Q = [x1 - r[0], r[2] - x1, y1 - r[1], r[3] - y1];
        for (let i = 0; i < 4; i++) {
          if (P[i] === 0) {
            if (Q[i] < 0) return false;
          } else {
            const t = Q[i] / P[i];
            if (P[i] < 0) t0 = Math.max(t0, t);
            else t1 = Math.min(t1, t);
            if (t0 > t1) return false;
          }
        }
        return true;
      });
    let strict = true;
    const hit = (r: [number, number, number, number]) => boxHit(r) || (strict && segHit(r));
    // every symbol is an obstacle too
    for (const l of labels) taken.push([l.x - 6, l.y - 6, l.x + 6, l.y + 6]);
    c.textAlign = "left";
    c.lineJoin = "round";
    for (const l of [...labels].sort((a, b) => a.prio - b.prio)) {
      c.font = font(l.weight, l.size ?? 12.5);
      const w = c.measureText(l.text).width;
      const spots: [number, number][] = [[l.x + 9, l.y - 9], [l.x + 9, l.y + 17], [l.x - 9 - w, l.y - 9], [l.x - 9 - w, l.y + 17], [l.x - w / 2, l.y - 12], [l.x - w / 2, l.y + 22]];
      let spot: [number, number] | null = null;
      // first a spot clear of every line, then one clear of the other labels only
      for (strict = true; !spot; strict = false) {
        for (const [tx, ty] of spots) {
          const r: [number, number, number, number] = [tx - 2, ty - 12, tx + w + 2, ty + 3];
          if (!hit(r)) { spot = [tx, ty]; taken.push(r); break; }
        }
        if (!strict) break;
      }
      // the active waypoint is always named
      if (!spot && l.prio === 0) spot = spots[0];
      if (!spot) continue;
      c.lineWidth = 4;
      c.strokeStyle = this.color("bg");
      c.strokeText(l.text, spot[0], spot[1]);
      c.fillStyle = l.color;
      c.fillText(l.text, spot[0], spot[1]);
    }
  }
  private draw() {
    const c = this.ctx;
    const W = this.w;
    const H = this.hgt;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    // hidden (pairing screen) or not laid out yet
    if (W < 60 || H < 60) return;
    const ac = this.pos();
    if (ac) this.autoRange(ac);
    const ctr = this.follow || !this.center ? ac : this.center;
    if (!ctr) {
      c.fillStyle = this.color("muted");
      c.font = "500 14px Inter, system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText("Waiting for the aircraft position…", W / 2, H / 2);
      return;
    }
    const k = this.pxPerNm();
    const cos = Math.cos((ctr.lat * Math.PI) / 180);
    const X = (p: { lat: number; lon: number }) =>
      W / 2 + (p.lon - ctr.lon) * cos * 60 * k;
    const Y = (p: { lat: number; lon: number }) =>
      H / 2 - (p.lat - ctr.lat) * 60 * k;
    const font = (w: number, px: number) =>
      `${w} ${px}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
    // range ring around the aircraft
    if (ac) {
      c.strokeStyle = this.color("ring");
      c.lineWidth = 1;
      c.setLineDash([4, 5]);
      c.beginPath();
      c.arc(X(ac), Y(ac), this.range * k, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    // labels are placed last, around their symbol, never over the aircraft or another label
    const labels: { text: string; x: number; y: number; color: string; weight: number; prio: number; size?: number }[] = [];
    // airports: runways as bars, ident beside
    for (const a of this.route?.airports ?? []) {
      const ax = X(a),
        ay = Y(a);
      if (ax < -80 || ay < -80 || ax > W + 80 || ay > H + 80) continue;
      c.strokeStyle = this.color("rwy");
      c.lineCap = "butt";
      let drew = false;
      for (const [la1, lo1, la2, lo2] of a.rwys) {
        const x1 = X({ lat: la1, lon: lo1 }),
          y1 = Y({ lat: la1, lon: lo1 }),
          x2 = X({ lat: la2, lon: lo2 }),
          y2 = Y({ lat: la2, lon: lo2 });
        const len = Math.hypot(x2 - x1, y2 - y1);
        c.lineWidth = len < 8 ? 2 : Math.max(3, Math.min(7, k * 0.04));
        if (len < 3) continue;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
        drew = true;
      }
      if (!drew) {
        c.lineWidth = 2;
        c.beginPath();
        c.arc(ax, ay, 5, 0, Math.PI * 2);
        c.stroke();
      }
      // the destination is named like a waypoint; the other airports stay quiet (declutter)
      const dest = a.ident === this.snap?.approach?.airport;
      labels.push({ text: a.ident, x: ax, y: ay, color: this.color(dest ? "apt" : "muted"), weight: dest ? 700 : 500, prio: dest ? 1 : 4, size: dest ? 12.5 : 11.5 });
    }
    // route: magenta active leg, the rest in ink
    const r = this.route;
    const segs: [number, number, number, number][] = [];
    if (r && r.wpts.length) {
      c.lineCap = "round";
      c.lineJoin = "round";
      for (let i = 1; i < r.wpts.length; i++) {
        const a = r.wpts[i - 1],
          b = r.wpts[i];
        const act = i === r.active;
        c.strokeStyle = act ? this.color("magenta") : this.color("route");
        c.lineWidth = act ? 3.5 : 2;
        c.beginPath();
        c.moveTo(X(a), Y(a));
        c.lineTo(X(b), Y(b));
        c.stroke();
        segs.push([X(a), Y(a), X(b), Y(b)]);
      }
      if (ac && r.wpts[r.active] && r.active === 0) {
        c.strokeStyle = this.color("magenta");
        c.lineWidth = 3.5;
        c.beginPath();
        c.moveTo(X(ac), Y(ac));
        c.lineTo(X(r.wpts[0]), Y(r.wpts[0]));
        c.stroke();
        segs.push([X(ac), Y(ac), X(r.wpts[0]), Y(r.wpts[0])]);
      }
      r.wpts.forEach((p, i) => {
        const x = X(p),
          y = Y(p);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
        const act = i === r.active;
        c.fillStyle = this.color("bg");
        c.strokeStyle = act ? this.color("magenta") : this.color("route");
        c.lineWidth = 2;
        // fly-by waypoint: a four-point star (Garmin / Jeppesen style)
        c.beginPath();
        const s = 6;
        c.moveTo(x, y - s);
        c.lineTo(x + 2, y - 2);
        c.lineTo(x + s, y);
        c.lineTo(x + 2, y + 2);
        c.lineTo(x, y + s);
        c.lineTo(x - 2, y + 2);
        c.lineTo(x - s, y);
        c.lineTo(x - 2, y - 2);
        c.closePath();
        c.fill();
        c.stroke();
        labels.push({ text: p.ident, x, y, color: act ? this.color("magenta") : this.color("ink"), weight: act ? 700 : 600, prio: act ? 0 : 3 });
      });
    }
    // flown track
    if (this.trail.length > 1) {
      c.strokeStyle = this.color("trail");
      c.lineWidth = 2;
      c.lineJoin = "round";
      c.beginPath();
      this.trail.forEach((p, i) =>
        i ? c.lineTo(X(p), Y(p)) : c.moveTo(X(p), Y(p)),
      );
      if (ac) c.lineTo(X(ac), Y(ac));
      c.stroke();
    }
    if (!ac || !this.snap) return;
    const s = this.snap;
    const x = X(ac),
      y = Y(ac);
    const mv = s.magVar ?? 0;
    // one-minute track vector
    if (!s.onGround && s.gsKt > 20) {
      const tr = ((s.trk + mv) * Math.PI) / 180;
      const len = (s.gsKt / 60) * k;
      c.strokeStyle = this.color("ink");
      c.lineWidth = 1.5;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.sin(tr) * len, y - Math.cos(tr) * len);
      c.stroke();
      c.setLineDash([]);
      segs.push([x, y, x + Math.sin(tr) * len, y - Math.cos(tr) * len]);
    }
    // own ship
    c.save();
    c.translate(x, y);
    c.rotate(((s.hdg + mv) * Math.PI) / 180);
    c.scale(1.15, 1.15);
    c.beginPath();
    const P: [number, number][] = [
      [0, -13],
      [2, -9],
      [2, -4],
      [12, 2],
      [12, 5],
      [2, 2],
      [1.5, 8],
      [5, 11],
      [5, 13],
      [0, 12],
      [-5, 13],
      [-5, 11],
      [-1.5, 8],
      [-2, 2],
      [-12, 5],
      [-12, 2],
      [-2, -4],
      [-2, -9],
    ];
    P.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.lineWidth = 3;
    c.strokeStyle = this.color("bg");
    c.stroke();
    c.fillStyle = this.color("ship");
    c.fill();
    c.restore();
    this.drawLabels(labels, x, y, font, segs);
    if (!this.follow && (x < 0 || y < 0 || x > W || y > H)) {
      c.fillStyle = this.color("muted");
      c.font = font(600, 12);
      c.textAlign = "center";
      c.fillText(
        "Aircraft off the map: tap the target to center",
        W / 2,
        H - 14,
      );
    }
  }
}

// ================================================================== console
export class Console {
  private root: HTMLElement;
  private pairEl = h("div", { class: "rc-pair" });
  private appEl = h("div", { class: "rc-app" });
  private state: LinkState = "idle";
  private code = "";
  private snap: RemoteSnapshot | null = null;
  private route: RemoteRoute | null = null;
  private log: LogEntry[] = [];
  private pending = new Map<number, { c: RemoteCommand; at: number }>();
  private tab: Tab = (store.get("ifr.remote.tab") as Tab) || "fail";
  private map = new MovingMap();
  // top bar & live strip
  private connEl = h("div", { class: "rc-conn" });
  private clockEl = h("b", { class: "rc-clock" });
  private freezeBtn!: HTMLButtonElement;
  private bannerEl = h("div", {
    class: "rc-banner",
    role: "status",
    "aria-live": "polite",
  });
  private flightEl = h("div", { class: "rc-flight" });
  private dataEl = h("div", { class: "rc-data" });
  private toastEl = h("div", {
    class: "rc-toast",
    role: "status",
    "aria-live": "polite",
  });
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private panels = {} as Record<Tab, HTMLElement>;
  private tabBtns = {} as Record<Tab, HTMLButtonElement>;
  private updaters: (() => void)[] = [];
  private wasConnected = false;

  constructor(
    root: HTMLElement,
    private act: ConsoleActions,
  ) {
    this.root = root;
    root.classList.add("rc");
    root.append(this.pairEl, this.appEl);
    this.buildApp();
  }

  // ---------------------------------------------------------------- link state
  setLink(s: LinkState, msg: string, code: string, local: boolean) {
    const prev = this.state;
    this.state = s;
    this.code = code || this.code;
    const inApp =
      (s === "connecting" && this.wasConnected) ||
      s === "connected" ||
      s === "reconnecting";
    if (s === "connected") {
      if (!this.wasConnected)
        this.addLog({
          t: this.snap?.t ?? 0,
          text: `Connected to the simulator${local ? " (this browser)" : ""}`,
          kind: "good",
        });
      else if (prev === "reconnecting")
        this.addLog({
          t: this.snap?.t ?? 0,
          text: "Reconnected",
          kind: "good",
        });
      this.wasConnected = true;
    }
    if (s === "reconnecting" && prev === "connected")
      this.addLog({
        t: this.snap?.t ?? 0,
        text: "Connection lost",
        kind: "bad",
      });
    this.root.classList.toggle("in-app", inApp);
    if (!inApp) this.renderPair(s, msg);
    this.renderConn(msg, local);
    this.refresh();
  }

  onHost(m: HostMsg) {
    if (m.k === "snap") {
      const prev = this.snap;
      this.snap = m.s;
      this.diff(prev, m.s);
      this.map.setSnap(m.s);
      this.refresh();
    } else if (m.k === "route") {
      this.route = m.r;
      this.map.setRoute(m.r);
      this.updateAtcFixes();
    } else if (m.k === "ack") {
      const c = this.pending.get(m.id)?.c;
      this.pending.delete(m.id);
      // show the new state at once: the next snapshot (already sent after the command) confirms it
      if (m.ok && c && this.snap) {
        if (c.type === "freeze" || c.type === "unfreeze") {
          this.snap = { ...this.snap, frozen: c.type === "freeze", paused: c.type === "freeze" };
        } else if (c.type === "pause" || c.type === "resume") {
          this.snap = { ...this.snap, paused: c.type === "pause" };
        }
      }
      this.refresh();
      this.toast(m.text, m.ok ? "good" : "bad");
      if (!m.ok)
        this.addLog({ t: this.snap?.t ?? 0, text: m.text, kind: "bad" });
      else if (c)
        this.addLog({ t: this.snap?.t ?? 0, text: m.text, kind: "you" });
    }
  }

  /** a freeze or pause on its way: a second tap before the simulator answers must not undo it */
  private inFlight(kind: "freeze" | "pause") {
    const now = performance.now();
    for (const { c, at } of this.pending.values()) {
      if (now - at > 3000) continue;
      if (kind === "freeze" && (c.type === "freeze" || c.type === "unfreeze")) return true;
      if (kind === "pause" && (c.type === "pause" || c.type === "resume")) return true;
    }
    return false;
  }
  private send(c: RemoteCommand) {
    if ((c.type === "freeze" || c.type === "unfreeze") && this.inFlight("freeze")) return false;
    if ((c.type === "pause" || c.type === "resume") && this.inFlight("pause")) return false;
    const id = this.act.send(c);
    if (id === null) {
      this.toast("Not connected to the simulator", "bad");
      return false;
    }
    this.pending.set(id, { c, at: performance.now() });
    if (c.type === "freeze" || c.type === "unfreeze" || c.type === "pause" || c.type === "resume") this.refresh();
    if (c.type === "failure") this.ownFail.set(c.key, c.on);
    return true;
  }
  /** failure states the instructor asked for: seeing them arrive in a snapshot is not news */
  private ownFail = new Map<FailureKey, boolean>();

  /** what changed in the flight that the instructor did not do: logged as the session timeline */
  private diff(a: RemoteSnapshot | null, b: RemoteSnapshot) {
    if (!a) {
      this.addLog({
        t: b.t,
        text: `Flight: ${b.flight ?? b.lesson?.title ?? "Free flight"}`,
        kind: "sim",
      });
      return;
    }
    if (b.t + 2 < a.t) {
      this.map.clearTrail();
      this.addLog({
        t: b.t,
        text: `Flight restarted: ${b.flight ?? ""}`,
        kind: "sim",
      });
    }
    if ((b.flight ?? "") !== (a.flight ?? "") && b.t >= a.t)
      this.addLog({
        t: b.t,
        text: `Flight: ${b.flight ?? "Free flight"}`,
        kind: "sim",
      });
    if (b.phase !== a.phase)
      this.addLog({ t: b.t, text: `Phase: ${b.phase.charAt(0).toUpperCase()}${b.phase.slice(1)}`, kind: "sim" });
    if (b.lesson && b.lesson.step && b.lesson.step !== a.lesson?.step)
      this.addLog({
        t: b.t,
        text: `Lesson step: ${b.lesson.step}`,
        kind: "sim",
      });
    if (b.approach?.id !== a.approach?.id && b.approach)
      this.addLog({
        t: b.t,
        text: `Approach loaded: ${b.approach.name}`,
        kind: "sim",
      });
    if (b.approach?.active && !a.approach?.active)
      this.addLog({ t: b.t, text: "Approach activated", kind: "sim" });
    for (const k of FAILURE_KEYS) {
      if (
        b.failures[k] !== a.failures[k] &&
        !(this.ownFail.get(k) === b.failures[k] && this.ownFail.delete(k))
      ) {
        this.addLog({
          t: b.t,
          text: `${FAILURE_TEXT[k].name} ${b.failures[k] ? "failed" : "restored"} on the simulator`,
          kind: b.failures[k] ? "bad" : "sim",
        });
      }
    }
    if (b.crashed && !a.crashed)
      this.addLog({ t: b.t, text: "Aircraft crashed", kind: "bad" });
  }

  private addLog(e: LogEntry) {
    this.log.unshift(e);
    if (this.log.length > 400) this.log.length = 400;
    if (this.tab === "log") this.renderLog();
    this.tabBtns.log?.classList.toggle(
      "dot",
      this.tab !== "log" && e.kind === "bad",
    );
  }

  private toast(text: string, kind: "good" | "bad" | "info" = "info") {
    this.toastEl.textContent = text;
    this.toastEl.className = `rc-toast show ${kind}`;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove("show"), 2600);
  }

  // ---------------------------------------------------------------- pairing screen
  private renderPair(s: LinkState, msg: string) {
    clear(this.pairEl);
    const busy = s === "connecting";
    const input = h("input", {
      class: "rc-code-in",
      type: "text",
      inputmode: "text",
      autocapitalize: "characters",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
      maxlength: 8,
      placeholder: "ABC 234",
      "aria-label": "Pairing code",
      // a code from an ended pairing is never valid again
      value: this.code && s !== "ended" ? formatPairCode(this.code) : "",
    });
    const go = h(
      "button",
      { class: "rc-btn primary big", type: "submit", disabled: busy },
      busy ? "Connecting…" : "Connect",
    );
    const valid = () => input.value.replace(/[\s-]/g, "").length === CODE_LEN;
    const sync = () => {
      if (!busy) go.disabled = !valid();
    };
    input.addEventListener("input", () => {
      const raw = input.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, CODE_LEN);
      input.value = raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
      sync();
    });
    sync();
    const err =
      s === "notfound" || s === "refused" || s === "ended" || s === "error";
    const head =
      s === "refused"
        ? "Another instructor is connected"
        : s === "ended"
          ? "Session ended"
          : s === "notfound"
            ? "Code not found"
            : s === "error"
              ? "Cannot connect"
              : "Instructor console";
    const form = h(
      "form",
      {
        class: "rc-pair-form",
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (!this.act.connect(input.value))
            this.renderPair(
              "notfound",
              "That is not a valid code: 6 letters and digits, as shown on the simulator.",
            );
        },
      },
      h(
        "label",
        { class: "rc-lab", for: "rc-code" },
        "Code shown on the simulator",
      ),
      input,
      go,
    );
    input.id = "rc-code";
    this.pairEl.append(
      h(
        "div",
        { class: "rc-pair-card" },
        h(
          "div",
          { class: "rc-pair-mark", "aria-hidden": "true" },
          svgIcon(I.tablet, 28),
        ),
        h("h1", {}, head),
        err && msg
          ? h("p", { class: s === "ended" ? "rc-pair-note" : "rc-pair-err", role: "alert" }, s === "ended" ? `${msg} To pair again, open the pairing on the simulator and scan the new code.` : msg)
          : h(
              "p",
              { class: "rc-pair-lead" },
              busy && msg
                ? msg
                : "Run the simulator session from this phone or tablet: failures, weather, vectors, reposition and freeze, with the aircraft on a live map.",
            ),
        form,
        h(
          "div",
          { class: "rc-pair-help" },
          h("b", {}, "Where is the code?"),
          h(
            "span",
            {},
            "On the simulator, open the Instructor station (key I) and choose “Pair a phone or tablet”. Scanning the QR code with the camera opens this page already paired.",
          ),
        ),
      ),
    );
    if (!busy)
      setTimeout(() => {
        if (!matchMedia("(pointer: coarse)").matches) input.focus();
      }, 0);
  }

  // ---------------------------------------------------------------- app
  private buildApp() {
    this.freezeBtn = h(
      "button",
      {
        class: "rc-btn rc-freeze",
        type: "button",
        onclick: () =>
          this.send({ type: this.snap?.frozen ? "unfreeze" : "freeze" }),
      },
      svgIcon(I.pause, 18),
      h("span", { class: "lbl" }, "Freeze"),
    );
    const top = h(
      "header",
      { class: "rc-top" },
      this.connEl,
      h("div", { class: "rc-top-r" }, this.clockEl, this.freezeBtn),
    );
    const tabs = h(
      "nav",
      {
        class: "rc-tabs",
        role: "tablist",
        "aria-label": "Instructor controls",
      },
      ...TABS.map(
        (t) =>
          (this.tabBtns[t.id] = h(
            "button",
            {
              class: "rc-tab",
              type: "button",
              role: "tab",
              "aria-controls": `rc-p-${t.id}`,
              onclick: () => this.setTab(t.id),
            },
            svgIcon(t.icon, 22),
            h("span", {}, t.name),
          )),
      ),
    );
    this.panels.fail = this.buildFailures();
    this.panels.wx = this.buildWeather();
    this.panels.atc = this.buildAtc();
    this.panels.session = this.buildSession();
    this.panels.log = h("div", { class: "rc-logp" });
    const panelWrap = (this.panelWrap = h("div", { class: "rc-panels" }));
    for (const t of TABS) {
      const p = this.panels[t.id];
      p.id = `rc-p-${t.id}`;
      p.classList.add("rc-panel");
      p.setAttribute("role", "tabpanel");
      panelWrap.append(p);
    }
    this.appEl.append(
      top,
      this.bannerEl,
      h(
        "main",
        { class: "rc-main" },
        h(
          "section",
          { class: "rc-live", "aria-label": "Live flight" },
          this.flightEl,
          this.map.el,
          this.dataEl,
        ),
        h("section", { class: "rc-work" }, panelWrap, tabs),
      ),
      this.toastEl,
    );
    this.setTab(TABS.some((t) => t.id === this.tab) ? this.tab : "fail");
  }

  private panelWrap: HTMLElement | null = null;
  private setTab(t: Tab) {
    if (t !== this.tab && this.panelWrap) this.panelWrap.scrollTop = 0;
    this.tab = t;
    store.set("ifr.remote.tab", t);
    for (const x of TABS) {
      this.panels[x.id].hidden = x.id !== t;
      this.tabBtns[x.id].classList.toggle("on", x.id === t);
      this.tabBtns[x.id].setAttribute("aria-selected", String(x.id === t));
    }
    if (t === "log") {
      this.tabBtns.log.classList.remove("dot");
      this.renderLog();
    }
    this.refresh();
  }

  private renderConn(msg: string, local: boolean) {
    clear(this.connEl);
    const s = this.state;
    const k =
      s === "connected"
        ? "on"
        : s === "reconnecting" || s === "connecting"
          ? "warn"
          : "off";
    this.connEl.className = `rc-conn ${k}`;
    this.connEl.append(
      h("i", { "aria-hidden": "true" }),
      h(
        "div",
        {},
        h(
          "b",
          {},
          s === "connected"
            ? "Connected"
            : s === "reconnecting"
              ? "Reconnecting…"
              : s === "connecting"
                ? "Connecting…"
                : "Not connected",
        ),
        h(
          "small",
          {},
          s === "connected"
            ? `${local ? "This browser" : "Simulator"} · ${formatPairCode(this.code)}`
            : msg || formatPairCode(this.code),
        ),
      ),
    );
  }

  /** everything that depends on the snapshot or the link */
  private refresh() {
    const s = this.snap;
    const live = this.state === "connected";
    this.root.classList.toggle("offline", !live);
    this.clockEl.textContent = s ? mmss(s.t) : "--:--";
    const frozen = !!s?.frozen;
    this.freezeBtn.classList.toggle("on", frozen);
    (this.freezeBtn.querySelector(".lbl") as HTMLElement).textContent = frozen
      ? "Unfreeze"
      : "Freeze";
    this.freezeBtn.replaceChild(
      svgIcon(frozen ? I.play : I.pause, 18),
      this.freezeBtn.firstChild!,
    );
    this.freezeBtn.disabled = !live || !s;
    // banner: the one thing the instructor must know now
    const ban = !live
      ? this.state === "reconnecting" || this.state === "connecting"
        ? [
            "warn",
            "Connection lost. Reconnecting… Controls wait for the simulator.",
          ]
        : null
      : s?.crashed
        ? ["bad", "The aircraft crashed. Restart it from Session."]
        : frozen
          ? ["info", "Frozen. Only you can unfreeze it."]
          : s?.paused
            ? ["info", "Paused. The student can resume."]
            : null;
    this.bannerEl.className = `rc-banner${ban ? ` show ${ban[0]}` : ""}`;
    this.bannerEl.textContent = ban ? ban[1] : "";
    if (!s) {
      clear(this.flightEl);
      this.flightEl.append(h("b", {}, "Waiting for the flight…"));
      clear(this.dataEl);
      return;
    }
    // flight header
    clear(this.flightEl);
    const phase = s.onGround
      ? s.gsKt > 2
        ? "Taxi / ground roll"
        : "On the ground"
      : s.phase;
    put(
      this.flightEl,
      h(
        "div",
        { class: "rc-flight-h" },
        h("b", {}, s.lesson?.title ?? s.flight ?? "Free flight"),
        h("span", { class: "rc-chip" }, phase.charAt(0).toUpperCase() + phase.slice(1)),
      ),
      s.lesson?.step
        ? h(
            "p",
            { class: "rc-step" },
            s.lesson.steps
              ? h(
                  "small",
                  {},
                  `Step ${(s.lesson.stepIdx ?? 0) + 1} of ${s.lesson.steps}`,
                )
              : null,
            s.lesson.step,
          )
        : s.approach
          ? h(
              "p",
              { class: "rc-step" },
              h(
                "small",
                {},
                s.approach.active ? "Approach active" : "Approach loaded",
              ),
              s.approach.name,
            )
          : null,
    );
    // data strip
    clear(this.dataEl);
    const cell = (k: string, v: string, u = "", cls = "") =>
      h(
        "div",
        { class: `rc-d ${cls}` },
        h("small", {}, k),
        h("b", {}, v, u ? h("i", {}, u) : null),
      );
    const vs = Math.round(s.vsFpm / 10) * 10;
    this.dataEl.append(
      cell("ALT", fmtAlt(s.altFt), "ft"),
      cell("IAS", String(s.iasKt), "kt"),
      cell("HDG", `${pad3(s.hdg)}°`),
      cell("VS", `${vs > 0 ? "+" : ""}${fmtAlt(vs)}`, "fpm"),
      cell("GS", String(s.gsKt), "kt", "rc-d-opt"),
      cell(
        s.wpt ? `TO ${s.wpt.ident}` : "NEXT",
        s.wpt ? s.wpt.distNm.toFixed(1) : "—",
        s.wpt ? "NM" : "",
        "rc-d-wpt",
      ),
    );
    for (const u of this.updaters) u();
  }

  // ---------------------------------------------------------------- Failures
  private buildFailures(): HTMLElement {
    const p = h("div", {});
    const restore = h(
      "button",
      {
        class: "rc-btn quiet small",
        type: "button",
        onclick: () =>
          FAILURE_KEYS.forEach(
            (k) =>
              this.snap?.failures[k] &&
              this.send({ type: "failure", key: k, on: false }),
          ),
      },
      "Restore all",
    );
    const grid = h("div", { class: "rc-fails" });
    const tiles = {} as Record<FailureKey, HTMLButtonElement>;
    for (const k of FAILURE_KEYS) {
      const t = FAILURE_TEXT[k];
      const b = h(
        "button",
        { class: "rc-fail", type: "button", "aria-pressed": "false" },
        h(
          "span",
          { class: "rc-fail-st" },
          h("i", {}),
          h("span", { class: "lbl" }, "Working"),
        ),
        h("b", {}, t.name),
        h("small", {}, t.sub),
      );
      const toggle = () =>
        this.send({ type: "failure", key: k, on: !this.snap?.failures[k] });
      if (k === "engine") confirmTap(b, "Tap again to fail", toggle);
      else b.addEventListener("click", toggle);
      // a restore needs no confirmation
      if (k === "engine")
        b.addEventListener(
          "click",
          (e) => {
            if (this.snap?.failures.engine) {
              e.stopImmediatePropagation();
              toggle();
            }
          },
          { capture: true },
        );
      tiles[k] = b;
      grid.append(b);
    }
    p.append(
      h(
        "div",
        { class: "rc-sec-h" },
        h(
          "div",
          {},
          h("h2", {}, "Failures"),
          h("small", {}, "Tap a system to fail it. Tap again to restore."),
        ),
        restore,
      ),
      grid,
    );
    this.updaters.push(() => {
      const f = this.snap?.failures;
      let any = false;
      for (const k of FAILURE_KEYS) {
        const on = !!f?.[k];
        any ||= on;
        const b = tiles[k];
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        if (!b.classList.contains("armed"))
          (b.querySelector(".lbl") as HTMLElement).textContent = on
            ? "Failed"
            : "Working";
      }
      restore.hidden = !any;
    });
    return p;
  }

  // ---------------------------------------------------------------- Weather
  private buildWeather(): HTMLElement {
    const p = h("div", {});
    const now = h("div", { class: "rc-wxnow" });
    const VIS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 7, 10];
    const CEIL_NONE = 51; // slider step past 5,000 ft: no ceiling
    const f = { ceil: 9, vis: 4, dir: 25, spd: 12, gust: 0, turb: 15 };
    let dirty = false;
    const apply = h(
      "button",
      { class: "rc-btn primary", type: "button", disabled: true },
      "Apply weather",
    );
    const reset = h(
      "button",
      { class: "rc-btn quiet", type: "button", disabled: true },
      "Undo changes",
    );
    const rows: {
      input: HTMLInputElement;
      out: HTMLElement;
      get(): number;
      set(v: number): void;
      text(): string;
    }[] = [];
    const slider = (
      label: string,
      min: number,
      max: number,
      step: number,
      key: keyof typeof f,
      text: () => string,
    ) => {
      const out = h("output", {});
      const input = h("input", {
        type: "range",
        min,
        max,
        step,
        "aria-label": label,
      });
      const row = {
        input,
        out,
        get: () => f[key],
        set: (v: number) => {
          f[key] = v;
          input.value = String(v);
          out.textContent = text();
        },
        text,
      };
      input.addEventListener("input", () => {
        f[key] = Number(input.value);
        out.textContent = text();
        dirty = true;
        apply.disabled = reset.disabled = !this.isLive();
        syncOuts();
      });
      rows.push(row);
      return h(
        "label",
        { class: "rc-slider" },
        h("span", {}, label),
        out,
        input,
      );
    };
    const syncOuts = () => rows.forEach((r) => (r.out.textContent = r.text()));
    const ceilFt = () => (f.ceil >= CEIL_NONE ? 20000 : f.ceil * 100);
    const grid = h(
      "div",
      { class: "rc-sliders" },
      slider("Ceiling", 0, CEIL_NONE, 1, "ceil", () =>
        f.ceil >= CEIL_NONE
          ? "None"
          : f.ceil === 0
            ? "Surface (fog)"
            : `${fmtAlt(f.ceil * 100)} ft`,
      ),
      slider(
        "Visibility",
        0,
        VIS.length - 1,
        1,
        "vis",
        () => `${fmtVis(VIS[f.vis])} SM`,
      ),
      slider("Wind from", 1, 36, 1, "dir", () =>
        f.spd === 0 ? "Calm" : `${pad3(f.dir * 10)}°`,
      ),
      slider("Wind speed", 0, 40, 1, "spd", () =>
        f.spd === 0 ? "Calm" : `${f.spd} kt`,
      ),
      slider("Gusts", 0, 50, 1, "gust", () =>
        f.gust <= f.spd ? "None" : `${f.gust} kt`,
      ),
      slider("Turbulence", 0, 100, 5, "turb", () =>
        turbulenceName(f.turb / 100),
      ),
    );
    const load = () => {
      const w = this.snap?.weather;
      if (!w) return;
      const vi = VIS.reduce(
        (bi, v, i) =>
          Math.abs(v - w.visibilitySm) < Math.abs(VIS[bi] - w.visibilitySm)
            ? i
            : bi,
        0,
      );
      f.ceil = w.ceilingFt >= 5100 ? CEIL_NONE : Math.round(w.ceilingFt / 100);
      f.vis = vi;
      f.dir = Math.round(w.windDir / 10) % 36 || 36;
      f.spd = Math.round(w.windKt);
      f.gust = Math.round(w.gustKt);
      f.turb = Math.round((w.turbulence * 100) / 5) * 5;
      rows.forEach((r) => r.set(r.get()));
      dirty = false;
      apply.disabled = reset.disabled = true;
    };
    apply.addEventListener("click", () => {
      const gust = f.gust > f.spd ? f.gust : 0;
      if (
        this.send({
          type: "weather",
          ceilingFt: ceilFt(),
          visibilitySm: VIS[f.vis],
          windDir: (f.dir * 10) % 360,
          windKt: f.spd,
          gustKt: gust,
          turbulence: f.turb / 100,
        })
      ) {
        dirty = false;
        apply.disabled = reset.disabled = true;
      }
    });
    reset.addEventListener("click", load);
    const presets = h(
      "div",
      { class: "rc-presets" },
      ...REMOTE_WX_PRESETS.map((x) =>
        h(
          "button",
          {
            class: "rc-preset",
            type: "button",
            onclick: () => {
              const w = this.snap?.weather;
              // a preset keeps the wind direction: only the instructor's sliders turn the wind
              if (
                this.send({
                  type: "weather",
                  ...x.wx,
                  windDir: w ? w.windDir % 360 : 250,
                })
              ) {
                dirty = false;
              }
            },
          },
          h("b", {}, x.name),
          h("small", {}, x.desc),
        ),
      ),
    );
    p.append(
      h(
        "div",
        { class: "rc-sec-h" },
        h(
          "div",
          {},
          h("h2", {}, "Weather"),
          h("small", {}, "Changes apply at once on the simulator."),
        ),
      ),
      now,
      h("h3", { class: "rc-sub" }, "Presets"),
      presets,
      h("h3", { class: "rc-sub" }, "Set your own"),
      grid,
      h("div", { class: "rc-actions" }, reset, apply),
    );
    let loaded = false;
    this.updaters.push(() => {
      const w = this.snap?.weather;
      if (!w) return;
      clear(now);
      const cell = (k: string, v: string) =>
        h("div", {}, h("small", {}, k), h("b", {}, v));
      now.append(
        cell(
          "Wind",
          w.windKt < 1
            ? "Calm"
            : `${pad3(w.windDir)}° / ${Math.round(w.windKt)}${w.gustKt > w.windKt ? `G${Math.round(w.gustKt)}` : ""} kt`,
        ),
        cell("Visibility", `${fmtVis(w.visibilitySm)} SM`),
        cell(
          "Ceiling",
          w.ceilingFt >= 12000 ? "None" : `${fmtAlt(w.ceilingFt)} ft`,
        ),
        cell("Turbulence", turbulenceName(w.turbulence)),
      );
      if (!dirty) {
        load();
        loaded = true;
      }
      void loaded;
      if (dirty) apply.disabled = !this.isLive();
      presets
        .querySelectorAll("button")
        .forEach((b) => ((b as HTMLButtonElement).disabled = !this.isLive()));
    });
    return p;
  }

  private isLive() {
    return this.state === "connected" && !!this.snap;
  }

  // ---------------------------------------------------------------- ATC
  private atcFixes = h("div", { class: "rc-chips" });
  private buildAtc(): HTMLElement {
    const p = h("div", {});
    let hdg = 0;
    let alt = 0;
    let touchedH = false;
    let touchedA = false;
    const hdgOut = h("b", { class: "rc-pick-v" });
    const altOut = h("b", { class: "rc-pick-v" });
    const hdgHint = h("small", { class: "rc-pick-hint" });
    const altHint = h("small", { class: "rc-pick-hint" });
    const paint = () => {
      const s = this.snap;
      hdgOut.textContent = `${pad3(hdg)}°`;
      altOut.textContent = `${fmtAlt(alt)} ft`;
      if (s) {
        const d = ((hdg - s.hdg + 540) % 360) - 180;
        hdgHint.textContent =
          Math.abs(d) < 3
            ? "Present heading"
            : `Turn ${d > 0 ? "right" : "left"} ${Math.abs(Math.round(d))}°`;
        const da = alt - s.altFt;
        altHint.textContent =
          Math.abs(da) < 60
            ? "Present altitude"
            : `${da > 0 ? "Climb" : "Descend"} ${fmtAlt(Math.abs(Math.round(da / 100) * 100))} ft`;
      }
    };
    const stepBtn = (lab: string, f: () => void, aria: string) =>
      h(
        "button",
        {
          class: "rc-step-btn",
          type: "button",
          "aria-label": aria,
          onclick: () => {
            f();
            paint();
          },
        },
        lab,
      );
    const sendH = h(
      "button",
      { class: "rc-btn primary", type: "button" },
      "Send heading",
    );
    const sendA = h(
      "button",
      { class: "rc-btn primary", type: "button" },
      "Send altitude",
    );
    sendH.addEventListener("click", () => {
      if (this.send({ type: "vector", hdg })) touchedH = false;
    });
    sendA.addEventListener("click", () => {
      if (this.send({ type: "vector", alt })) touchedA = false;
    });
    const picker = (
      title: string,
      out: HTMLElement,
      hint: HTMLElement,
      steps: HTMLElement[],
      send: HTMLElement,
    ) =>
      h(
        "div",
        { class: "rc-pick" },
        h("div", { class: "rc-pick-h" }, h("span", {}, title), hint),
        h(
          "div",
          { class: "rc-pick-row" },
          steps[0],
          steps[1],
          out,
          steps[2],
          steps[3],
        ),
        send,
      );
    const H = (d: number) => () => {
      hdg = wrap360(hdg + d);
      touchedH = true;
    };
    const A = (d: number) => () => {
      alt = Math.max(0, Math.min(17900, Math.round((alt + d) / 100) * 100));
      touchedA = true;
    };
    // free text: direct-to fix and a message
    const fixIn = h("input", {
      class: "rc-in",
      type: "text",
      placeholder: "Fix, VOR or airport",
      autocapitalize: "characters",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: 7,
      "aria-label": "Direct to fix",
    });
    const sendFix = () => {
      const v = fixIn.value.trim().toUpperCase();
      if (
        /^[A-Z0-9]{2,7}$/.test(v) &&
        this.send({ type: "directTo", ident: v })
      )
        fixIn.value = "";
    };
    fixIn.addEventListener("keydown", (e) => e.key === "Enter" && sendFix());
    const msgIn = h("input", {
      class: "rc-in",
      type: "text",
      placeholder: "Type a message",
      maxlength: 200,
      enterkeyhint: "send",
      "aria-label": "Message to the student",
    });
    const sendMsg = (t: string) => {
      if (t.trim() && this.send({ type: "message", text: t.trim() }))
        msgIn.value = "";
    };
    msgIn.addEventListener(
      "keydown",
      (e) => e.key === "Enter" && sendMsg(msgIn.value),
    );
    const QUICK = [
      "Report established",
      "Check your altimeter",
      "Expect the ILS",
      "Fly the published missed approach",
      "Hold as published",
      "Go around",
      "Nice work",
    ];
    p.append(
      h(
        "div",
        { class: "rc-sec-h" },
        h(
          "div",
          {},
          h("h2", {}, "ATC"),
          h(
            "small",
            {},
            "Vectors are spoken on the radio. The student must fly them.",
          ),
        ),
      ),
      h(
        "div",
        { class: "rc-picks" },
        picker(
          "Heading",
          hdgOut,
          hdgHint,
          [
            stepBtn("−30", H(-30), "Heading minus 30"),
            stepBtn("−10", H(-10), "Heading minus 10"),
            stepBtn("+10", H(10), "Heading plus 10"),
            stepBtn("+30", H(30), "Heading plus 30"),
          ],
          sendH,
        ),
        picker(
          "Altitude",
          altOut,
          altHint,
          [
            stepBtn("−1000", A(-1000), "Altitude minus 1000"),
            stepBtn("−100", A(-100), "Altitude minus 100"),
            stepBtn("+100", A(100), "Altitude plus 100"),
            stepBtn("+1000", A(1000), "Altitude plus 1000"),
          ],
          sendA,
        ),
      ),
      h("h3", { class: "rc-sub" }, "Direct to"),
      this.atcFixes,
      h(
        "div",
        { class: "rc-inrow" },
        fixIn,
        h(
          "button",
          { class: "rc-btn", type: "button", onclick: sendFix },
          "Send",
        ),
      ),
      h("h3", { class: "rc-sub" }, "Message to the student"),
      h(
        "div",
        { class: "rc-chips" },
        ...QUICK.map((q) =>
          h(
            "button",
            { class: "rc-chip-btn", type: "button", onclick: () => sendMsg(q) },
            q,
          ),
        ),
      ),
      h(
        "div",
        { class: "rc-inrow" },
        msgIn,
        h(
          "button",
          {
            class: "rc-btn",
            type: "button",
            onclick: () => sendMsg(msgIn.value),
          },
          "Send",
        ),
      ),
    );
    this.updaters.push(() => {
      const s = this.snap;
      if (!s) return;
      if (!touchedH) hdg = wrap360(Math.round(s.hdg / 5) * 5);
      if (!touchedA) alt = Math.max(0, Math.round(s.altFt / 100) * 100);
      paint();
      const live = this.isLive();
      for (const b of p.querySelectorAll("button"))
        (b as HTMLButtonElement).disabled = !live;
    });
    this.updateAtcFixes();
    return p;
  }
  private updateAtcFixes() {
    clear(this.atcFixes);
    const r = this.route;
    const seen = new Set<string>();
    const list = (r?.wpts ?? [])
      .filter(
        (w, i) =>
          i >= r!.active &&
          /^[A-Z0-9]{2,7}$/.test(w.ident) &&
          !seen.has(w.ident) &&
          (seen.add(w.ident), true),
      )
      .slice(0, 12);
    if (!list.length) {
      this.atcFixes.append(
        h(
          "small",
          { class: "rc-muted" },
          "Waypoints of the flight plan appear here.",
        ),
      );
      return;
    }
    this.atcFixes.append(
      ...list.map((w) =>
        h(
          "button",
          {
            class: "rc-chip-btn",
            type: "button",
            disabled: !this.isLive(),
            onclick: () => this.send({ type: "directTo", ident: w.ident }),
          },
          w.ident,
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- Session
  private buildSession(): HTMLElement {
    const p = h("div", {});
    const pause = h(
      "button",
      {
        class: "rc-btn big",
        type: "button",
        onclick: () =>
          this.send({ type: this.snap?.paused ? "resume" : "pause" }),
      },
      svgIcon(I.pause, 18),
      h("span", { class: "lbl" }, "Pause"),
    );
    const freeze = h(
      "button",
      {
        class: "rc-btn big",
        type: "button",
        onclick: () =>
          this.send({ type: this.snap?.frozen ? "unfreeze" : "freeze" }),
      },
      svgIcon(I.hand, 18),
      h("span", { class: "lbl" }, "Freeze"),
    );
    const repo = h(
      "div",
      { class: "rc-repo" },
      ...REPOSITIONS.map((r) =>
        h(
          "button",
          {
            class: "rc-btn",
            type: "button",
            "data-k": r.where,
            onclick: () => this.send({ type: "reposition", where: r.where }),
          },
          r.name,
        ),
      ),
    );
    const repoNote = h("small", { class: "rc-muted" });
    const restart = h(
      "button",
      { class: "rc-btn", type: "button" },
      svgIcon(I.restart, 18),
      h("span", { class: "lbl" }, "Restart flight"),
    );
    const end = h(
      "button",
      { class: "rc-btn danger", type: "button" },
      svgIcon(I.flag, 18),
      h("span", { class: "lbl" }, "End flight"),
    );
    confirmTap(restart, "Tap again to restart", () =>
      this.send({ type: "restart" }),
    );
    confirmTap(end, "Tap again to end", () => this.send({ type: "end" }));
    const connInfo = h("div", { class: "rc-conninfo" });
    const leave = h(
      "button",
      {
        class: "rc-btn quiet",
        type: "button",
        onclick: () => {
          this.wasConnected = false;
          this.snap = null;
          this.route = null;
          this.act.disconnect();
        },
      },
      "Disconnect this console",
    );
    p.append(
      h(
        "div",
        { class: "rc-sec-h" },
        h(
          "div",
          {},
          h("h2", {}, "Session"),
          h(
            "small",
            {},
            "Pause lets the student resume. Freeze holds the simulator until you release it.",
          ),
        ),
      ),
      h("div", { class: "rc-two" }, pause, freeze),
      h("h3", { class: "rc-sub" }, "Reposition on the approach"),
      repo,
      repoNote,
      h("h3", { class: "rc-sub" }, "Flight"),
      h("div", { class: "rc-two" }, restart, end),
      h("h3", { class: "rc-sub" }, "Connection"),
      connInfo,
      leave,
    );
    this.updaters.push(() => {
      const s = this.snap;
      const live = this.isLive();
      (pause.querySelector(".lbl") as HTMLElement).textContent =
        s?.paused && !s.frozen ? "Resume" : "Pause";
      pause.replaceChild(
        svgIcon(s?.paused && !s.frozen ? I.play : I.pause, 18),
        pause.firstChild!,
      );
      pause.disabled = !live || !!s?.frozen;
      (freeze.querySelector(".lbl") as HTMLElement).textContent = s?.frozen
        ? "Unfreeze"
        : "Freeze";
      freeze.classList.toggle("on", !!s?.frozen);
      freeze.disabled = !live;
      const ap = s?.approach;
      repo
        .querySelectorAll("button")
        .forEach((b) => ((b as HTMLButtonElement).disabled = !live || !ap));
      repoNote.textContent = ap
        ? `${ap.name}${ap.airport ? ` · ${ap.airport}` : ""}`
        : "Load an approach on the simulator to reposition along it.";
      restart.disabled = end.disabled = !live;
      clear(connInfo);
      connInfo.append(
        h(
          "div",
          {},
          h("small", {}, "Code"),
          h("b", {}, formatPairCode(this.code)),
        ),
        h(
          "div",
          {},
          h("small", {}, "Link"),
          h(
            "b",
            {},
            this.state === "connected"
              ? "Live, 4 updates per second"
              : "Reconnecting",
          ),
        ),
      );
    });
    return p;
  }

  // ---------------------------------------------------------------- Log
  private renderLog() {
    const p = this.panels.log;
    clear(p);
    p.append(
      h(
        "div",
        { class: "rc-sec-h" },
        h(
          "div",
          {},
          h("h2", {}, "Session log"),
          h(
            "small",
            {},
            "Your actions and what happened in the flight, newest first. The simulator records them in the debrief too.",
          ),
        ),
      ),
    );
    if (!this.log.length) {
      p.append(h("p", { class: "rc-muted" }, "Nothing yet."));
      return;
    }
    p.append(
      h(
        "ol",
        { class: "rc-log" },
        ...this.log.map((e) =>
          h(
            "li",
            { class: e.kind },
            h("time", {}, mmss(e.t)),
            h("span", {}, e.text),
            e.kind === "you" ? h("small", {}, "You") : null,
          ),
        ),
      ),
    );
  }
}
