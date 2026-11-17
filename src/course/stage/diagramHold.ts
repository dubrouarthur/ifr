// Ground school stage — the hold, flown: an aircraft flies the arrival, the entry of its sector and the racetrack on a
// north-up map, at a few times real speed (stage/holdPath.ts: standard-rate turns, timed legs, the wind). One
// drawing teaches each part of the course, by what it shows:
//  - parts: the fix, the inbound leg (1 min), the outbound leg, the abeam point;
//  - sectors: the three entry sectors and the 70° line, the arrival's sector lit (AIM FIG 5-3-8, holdEntry());
//  - clock: the stopwatch, started abeam the fix, then the inbound leg timed;
//  - headings: the wind, the inbound heading and the outbound heading with the tripled drift.
// Drag 'crs': the student sets the arrival heading (drag the aircraft round the fix, or −10° / +10°, or the arrow
// keys): the sector lights up and the entry is flown. Drag 'wind': the wind dial (the presenter changes it live).
// `goals` (the entries trainer): arrival headings to set one after the other. The entry stays hidden and the aircraft
// waits until the student picks it (Directe / Décalée / Parallèle); a right pick ticks the goal (onGoal) and the
// entry is flown as the feedback. Without goals (the presenter's demonstration) the entry shows at once.
// live() / follow(): the presenter's heading, wind, pause and replay mirrored on the projector (canvas/diagramMirror.ts).
// Slide units (SPEC slides v2 §5): viewBox = the block, labels ≥ 24 × u, theme tokens only. Reduced motion: no
// animation, the whole path is drawn and the goals tick as soon as the heading is set.
import type { CalcDiagram, Lang } from "../types";
import { entrySector, type HoldEntry } from "../../nav/holding";
import { flyHold, sampleAt, type HoldFlight } from "./holdPath";
import { windDial } from "./diagramWind";
import {
  aircraftIcon,
  bearingVec,
  clamp,
  dragHandle,
  fixMark,
  FS,
  hdg3,
  head,
  L,
  lab,
  makeWidget,
  norm360,
  s,
  SW,
  tint,
  vecBearing,
  type DiagramOptions,
  type DiagramWidget,
  type Shell,
} from "./svgkit";
import { textWidth } from "../canvas/text";

/** NM from the fix where an arrival starts (the ring of the heading handle) */
const START_NM = 2;
export type HoldFlySpec = Extract<CalcDiagram, { kind: "holdFly" }>;

const ENTRY_WORD: Record<HoldEntry, [string, string]> = {
  DIRECT: ["Direct", "Directe"],
  TEARDROP: ["Teardrop", "Décalée"],
  PARALLEL: ["Parallel", "Parallèle"],
};
const ENTRY_HOW: Record<HoldEntry, [string, string]> = {
  DIRECT: [
    "At the fix, turn in the direction of the hold.",
    "Au repère, virez dans le sens de l’attente.",
  ],
  TEARDROP: [
    "At the fix, 30° off the outbound course for 1 min, then turn inbound.",
    "Au repère, 30° de l’axe d’éloignement pendant 1 min, puis virez.",
  ],
  PARALLEL: [
    "At the fix, parallel outbound for 1 min, then turn back more than 180°.",
    "Au repère, parallèle à l’axe pendant 1 min, puis revenez de plus de 180°.",
  ],
};
const mmss = (sec: number) => {
  const r = Math.max(0, Math.floor(sec));
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
const reducedMotion = (): boolean => {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};
/** Words wrapped to a width in slide units. Pure. */
export function wrapWords(
  text: string,
  size: number,
  width: number,
  weight = 500,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (line && textWidth(t, size, weight) > width) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** The arrival's sector lit by the drawing, and whether a goal heading is met by a course. Pure. */
export function goalIndex(
  goals: readonly number[],
  crs: number,
  tol = 5,
): number {
  return goals.findIndex(
    (g) => Math.abs(((((crs - g) % 360) + 540) % 360) - 180) <= tol,
  );
}

/** The flight a spec draws. Pure. */
export function holdFlightOf(spec: HoldFlySpec): HoldFlight {
  return flyHold({
    inbound: spec.inbound,
    turn: spec.turn,
    crs: spec.crs,
    tasKt: spec.tasKt,
    windDir: spec.windDir,
    windKt: spec.windKt,
    outFactor: spec.outFactor,
    outS: spec.outS,
    laps: spec.crs === undefined ? 2 : 1,
    startNm: START_NM,
  });
}

export interface HoldFlyOptions extends DiagramOptions {
  /** play the flight (the player); otherwise a still: the whole path drawn */
  animate?: boolean;
  /** the goal headings met so far (one flag per spec.goals) */
  onGoal?: (met: boolean[]) => void;
}

/** A button in the drawing (88 units high), Enter / Space like a click. */
function svgButton(
  sh: Shell,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  name: string,
  act: () => void,
  o: { cls?: string; color?: string; hidden?: boolean } = {},
): { g: SVGGElement; t: SVGTextElement } {
  const { u, p } = sh.c;
  const col = o.color ?? p.accent;
  const t = lab(sh.c, x + w / 2, y + h / 2 + 10 * u, text, {
    role: "pri",
    anchor: "middle",
    color: col,
    weight: 600,
  });
  const g = s(
    "g",
    {
      class: `cs-btn${o.cls ? ` ${o.cls}` : ""}`,
      role: "button",
      tabindex: o.hidden ? -1 : 0,
      "aria-label": name,
      style: o.hidden ? "display:none" : "cursor:pointer",
      // a button only for the phone's panel: its word is an attribute, never drawn
      ...(o.hidden ? { "data-label": text } : {}),
    },
    ...(o.hidden
      ? []
      : [
          s("rect", {
            x,
            y,
            width: w,
            height: h,
            rx: 12 * u,
            fill: tint(col, 0.1),
            stroke: col,
            "stroke-width": 3 * u,
          }),
          t,
        ]),
  );
  g.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    act();
  });
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act();
    }
  });
  return { g, t };
}

interface Layout {
  pw: number;
  mapW: number;
  toPx: (x: number, y: number) => [number, number];
  fx: number;
  fy: number;
  /** NM → units */
  k: number;
}

export function createHoldFly(
  spec0: HoldFlySpec,
  o: HoldFlyOptions = {},
): DiagramWidget<HoldFlySpec> {
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const T = (en: string, frs: string) => L(lang, en, frs);
  const drag = new Set(o.drag ?? []);
  const show = new Set(spec0.show ?? ["parts"]);
  const animate = !!o.animate && !reducedMotion();
  const speed = clamp(spec0.speed ?? 8, 1, 30);
  const goals = spec0.goals ?? [];
  const met: boolean[] = goals.map(() => false);
  /** the entries trainer: the student names the entry before it is shown */
  const trainer = goals.length > 0 && drag.has("crs");
  let decided = !trainer;
  let wrong: HoldEntry[] = [];
  const revealed = () => !trainer || decided;
  let lastStatus = "";
  let flight: HoldFlight = holdFlightOf(spec0);
  let tSim = 0;
  let paused = false;
  let raf = 0;
  let last = 0;
  let wasConnected = false;
  let pendingGoal = -1;
  let lay: Layout | null = null;
  let svgEl: SVGSVGElement | null = null;
  // per draw
  let plane: SVGGElement | null = null;
  let trailEntry: SVGPolylineElement | null = null;
  let trailHold: SVGPolylineElement | null = null;
  let clockBig: SVGTextElement | null = null;
  let clockSub: SVGTextElement | null = null;
  let rePanel: (() => void) | null = null;
  // per build
  let handle: ReturnType<typeof dragHandle> | null = null;
  let pauseLabel: SVGTextElement | null = null;
  let getSpec: () => HoldFlySpec = () => spec0;
  let setSpec: (n: HoldFlySpec) => void = () => {};

  const panelW = (sh: Shell): number =>
    goals.length || drag.has("crs") ? Math.min(520 * sh.c.u, sh.c.W * 0.34) : 0;
  /** the play controls: none on a cover (a drawing that names nothing loops quietly) */
  const controls = () => animate && show.size > 0;
  const endT = () => {
    const ss = flight.samples;
    return ss.length ? ss[ss.length - 1].t : 0;
  };
  /** the time a still shows: the end of the entry, or well into the outbound leg of the first lap */
  const stillT = () => {
    if (!revealed()) return 0;
    if (getSpec().crs !== undefined) return flight.establishedT;
    const out = flight.samples.find(
      (x) =>
        x.phase === "outbound" && x.lap === 1 && x.clock && x.clock.s >= 35,
    );
    return out ? out.t : endT() * 0.4;
  };
  const entryWord = (e: HoldEntry) => ENTRY_WORD[e][fr ? 1 : 0];
  const tickGoal = () => {
    if (pendingGoal < 0 || met[pendingGoal]) return;
    const i = pendingGoal;
    met[i] = true;
    pendingGoal = -1;
    rePanel?.();
    o.onGoal?.([...met]);
    const e = entrySector(spec0.inbound, spec0.turn, goals[i]).entry;
    o.announce?.(
      met.every(Boolean)
        ? T("All three entries found.", "Les trois entrées sont trouvées.")
        : T(
            `Heading ${hdg3(goals[i])}: ${ENTRY_WORD[e][0].toLowerCase()} entry, goal met.`,
            `Cap ${hdg3(goals[i])} : entrée ${ENTRY_WORD[e][1].toLowerCase()}, objectif atteint.`,
          ),
    );
  };
  const setCrs = (v: number) => {
    const crs = Math.round(norm360(v)) || 360;
    const cur = getSpec();
    if (crs === Math.round(norm360(cur.crs ?? 0))) return;
    pendingGoal = goalIndex(goals, crs);
    tSim = 0;
    decided = !trainer;
    wrong = [];
    setSpec({ ...cur, crs });
    if (!trainer && !animate) tickGoal();
  };
  /** the student's answer: which entry for this arrival heading */
  const pick = (e: HoldEntry) => {
    const cur = getSpec();
    if (decided || cur.crs === undefined) return;
    const sec = entrySector(cur.inbound, cur.turn, cur.crs);
    if (sec.either.includes(e)) {
      decided = true;
      tSim = 0;
      setSpec({ ...cur });
      if (pendingGoal >= 0) tickGoal();
      else
        o.announce?.(
          T(
            `Right: ${ENTRY_WORD[sec.entry][0].toLowerCase()} entry.`,
            `Juste : entrée ${ENTRY_WORD[sec.entry][1].toLowerCase()}.`,
          ),
        );
    } else {
      if (!wrong.includes(e)) wrong = [...wrong, e];
      setSpec({ ...cur });
      o.announce?.(
        T(
          `Not ${ENTRY_WORD[e][0].toLowerCase()}: look which side of the lines the aircraft comes from.`,
          `Pas ${ENTRY_WORD[e][1].toLowerCase()} : regardez de quel côté des lignes arrive l’avion.`,
        ),
      );
    }
  };
  /** what the drawing shows, as words (the phone's panel under the slide reads it: data-status, 'cs-status') */
  const statusRows = (): { t: string; done?: boolean }[] => {
    const sp = getSpec();
    const rows: { t: string; done?: boolean }[] = [];
    if (sp.crs !== undefined) {
      const e = entrySector(sp.inbound, sp.turn, sp.crs).entry;
      rows.push({
        t: `${T("Arrival heading", "Cap d’arrivée")} ${hdg3(sp.crs)}° · ${T("entry", "entrée")} ${revealed() ? entryWord(e).toLowerCase() : "?"}`,
      });
      if (!revealed())
        rows.push({
          t: wrong.length
            ? T(
                `Not ${wrong.map((w) => ENTRY_WORD[w][0].toLowerCase()).join(", ")}: look which side of the lines the aircraft comes from.`,
                `Pas ${wrong.map((w) => ENTRY_WORD[w][1].toLowerCase()).join(", ")} : regardez de quel côté des lignes arrive l’avion.`,
              )
            : T("Which entry? Pick it below.", "Quelle entrée ? Choisissez-la ci-dessous."),
        });
    }
    if ((sp.windKt ?? 0) > 0.5 && drag.has("wind"))
      rows.push({
        t: T(
          `Wind ${hdg3(sp.windDir ?? 360)}/${Math.round(sp.windKt ?? 0)} · inbound heading ${hdg3(flight.inHdg)} · outbound ${hdg3(flight.outHdg)}`,
          `Vent ${hdg3(sp.windDir ?? 360)}/${Math.round(sp.windKt ?? 0)} · cap ${hdg3(flight.inHdg)} en rapprochement · ${hdg3(flight.outHdg)} en éloignement`,
        ),
      });
    goals.forEach((gh, i) => {
      const e = entrySector(sp.inbound, sp.turn, gh).entry;
      rows.push({
        t: `${T("Heading", "Cap")} ${hdg3(gh)} → ${met[i] ? entryWord(e).toLowerCase() : "?"}`,
        done: met[i],
      });
    });
    return rows;
  };
  const pushStatus = () => {
    const el = svgEl;
    if (!el) return;
    const j = JSON.stringify(statusRows());
    if (j === lastStatus) return;
    lastStatus = j;
    el.setAttribute("data-status", j);
    if (typeof CustomEvent === "function" && typeof el.dispatchEvent === "function")
      el.dispatchEvent(new CustomEvent("cs-status", { bubbles: true }));
  };

  const frame = (t: number) => {
    if (!lay) return;
    const toPx = lay.toPx;
    const smp = sampleAt(flight, t);
    if (plane) {
      const [px, py] = toPx(smp.x, smp.y);
      plane.setAttribute(
        "transform",
        `translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${smp.hdg.toFixed(1)})`,
      );
    }
    const pts = (keep: (ph: string) => boolean) => {
      let out = "";
      for (const x of flight.samples) {
        if (x.t > t) break;
        if (!keep(x.phase)) continue;
        const [a, b] = toPx(x.x, x.y);
        out += `${a.toFixed(1)},${b.toFixed(1)} `;
      }
      return out.trim();
    };
    trailEntry?.setAttribute(
      "points",
      pts((ph) => ph === "arrive" || ph === "entry"),
    );
    trailHold?.setAttribute(
      "points",
      pts((ph) => ph !== "arrive" && ph !== "entry"),
    );
    if (clockBig && clockSub) {
      const c = smp.clock;
      let big = "0:00";
      let sub = "";
      if (c && c.leg === "out") {
        big = mmss(c.s);
        sub =
          smp.phase === "entry"
            ? T("outbound · from the fix", "éloignement · depuis le repère")
            : T("outbound · from abeam", "éloignement · depuis le travers");
      } else if (c && c.leg === "in" && smp.lap >= 1) {
        big = mmss(c.s);
        sub = T("inbound · aim for 1:00", "rapprochement · visez 1:00");
      } else if (smp.phase === "turnIn") {
        big = mmss(flight.outS);
        sub = T("turn inbound", "virage vers le rapprochement");
      } else {
        // a teardrop or a parallel entry is timed from the fix; the hold itself from abeam
        sub =
          smp.phase === "arrive" && flight.entry && flight.entry !== "DIRECT"
            ? T("start it at the fix", "top chrono au repère")
            : T("start it abeam the fix", "top chrono au travers");
      }
      clockBig.textContent = big;
      clockSub.textContent = sub;
    }
    if (!trainer && t >= flight.establishedT) tickGoal();
  };

  const loop = (now: number) => {
    raf = 0;
    const el = svgEl;
    if (!el) return;
    if (el.isConnected) wasConnected = true;
    else if (wasConnected) return; // gone from the page: stop for good
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    if (!paused && revealed()) {
      // the arrival is only the way in: it plays faster than the entry and the hold
      const ph = sampleAt(flight, tSim).phase;
      tSim += dt * speed * (ph === "arrive" ? 2.5 : 1);
      // a short pause at the end, then again from the start
      if (tSim > endT() + 2 * speed) tSim = 0;
      frame(Math.min(tSim, endT()));
    }
    raf = requestAnimationFrame(loop);
  };

  function layout(sh: Shell, spec: HoldFlySpec): Layout {
    const { W, H, u } = sh.c;
    const pw = panelW(sh);
    const mapW = W - pw;
    let cxN = 0;
    let cyN = 0;
    // around the fix when an arrival is drawn: the ring it starts from (START_NM) and the widest entry
    let halfX = 2.15;
    let halfY = 2.15;
    let padX = 16 * u;
    let padY = 16 * u;
    if (spec.crs === undefined) {
      // around the racetrack flown with no wind, with room for the labels
      const still = flyHold({
        inbound: spec.inbound,
        turn: spec.turn,
        tasKt: spec.tasKt,
        laps: 1,
      });
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const q of still.samples) {
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y);
        y1 = Math.max(y1, q.y);
      }
      cxN = (x0 + x1) / 2;
      cyN = (y0 + y1) / 2;
      halfX = ((x1 - x0) / 2) * 1.08;
      halfY = ((y1 - y0) / 2) * 1.08;
      // the labels beside the legs (two lines) and beside the abeam point
      // the labels beside the legs (two lines) and beside the abeam point; a drawing that names nothing needs none
      padX = show.size ? Math.min(300 * u, mapW * 0.22) : 24 * u;
      padY = show.size ? Math.min(110 * u, H * 0.16) : 24 * u;
    }
    // a stopwatch over a racetrack takes a row at the top (around the fix, it fits in the map's free corner)
    const top = show.has("clock") && spec.crs === undefined ? 120 * u : 16 * u;
    // the play controls sit under the racetrack (around the fix, in the free corner of the map)
    const bottom = controls() && spec.crs === undefined ? 104 * u : 16 * u;
    const availH = H - top - bottom;
    const k = Math.max(
      20 * u,
      Math.min(
        (mapW - 2 * padX) / (2 * halfX),
        (availH - 2 * padY) / (2 * halfY),
      ),
    );
    const ox = mapW / 2;
    const oy = top + availH / 2;
    const toPx = (x: number, y: number): [number, number] => [
      ox + (x - cxN) * k,
      oy - (y - cyN) * k,
    ];
    const [fx, fy] = toPx(0, 0);
    return { pw, mapW, toPx, fx, fy, k };
  }

  function draw(sh: Shell, spec: HoldFlySpec) {
    const c = sh.c;
    const { u, p } = c;
    const ly = sh.layer;
    const L0 = layout(sh, spec);
    lay = L0;
    const { pw, mapW, toPx, fx, fy, k } = L0;
    const I = spec.inbound;
    const sg = spec.turn === "R" ? 1 : -1;
    const sector =
      spec.crs !== undefined ? entrySector(I, spec.turn, spec.crs) : null;
    const at = (b: number, r: number): [number, number] => {
      const [vx, vy] = bearingVec(b);
      return [fx + vx * r, fy + vy * r];
    };
    const side = (dx: number): "start" | "end" | "middle" =>
      dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";

    // the entry sectors (where the aircraft is: its bearing from the fix)
    if (show.has("sectors")) {
      const RC = 1.7 * k;
      const SECT: {
        e: HoldEntry;
        from: number;
        to: number;
        col: string;
        arc: string;
      }[] = [
        { e: "PARALLEL", from: 0, to: 110, col: p.heading, arc: "110°" },
        { e: "TEARDROP", from: 290, to: 360, col: p.wind, arc: "70°" },
        { e: "DIRECT", from: 110, to: 290, col: p.nav, arc: "180°" },
      ];
      const abs = (rel: number) => I + rel * sg;
      for (const S of SECT) {
        const a = at(abs(S.from), RC);
        const b = at(abs(S.to), RC);
        const lit = revealed() && sector?.entry === S.e;
        ly.append(
          s("path", {
            d: `M${fx} ${fy}L${a[0]} ${a[1]}A${RC} ${RC} 0 ${S.to - S.from > 180 ? 1 : 0} ${sg > 0 ? 1 : 0} ${b[0]} ${b[1]}Z`,
            fill: S.col,
            "fill-opacity": sector && revealed() ? (lit ? 0.28 : 0.06) : 0.14,
          }),
        );
      }
      ly.append(
        s("circle", {
          cx: fx,
          cy: fy,
          r: RC,
          fill: "none",
          stroke: p.line,
          "stroke-width": SW.grid * u,
        }),
      );
      const b70 = abs(110);
      const e1 = at(b70, RC);
      const e2 = at(b70 + 180, RC);
      const e3 = at(I, RC);
      ly.append(
        s("path", {
          d: `M${e1[0]} ${e1[1]}L${e2[0]} ${e2[1]}M${fx} ${fy}L${e3[0]} ${e3[1]}`,
          // a wrong answer: the lines that split the arrivals stand out
          stroke: wrong.length && !revealed() ? p.accent : p.muted,
          "stroke-width": (wrong.length && !revealed() ? SW.second : SW.constr) * u,
          fill: "none",
        }),
      );
      // where the arrival comes from (relative to the inbound course): a sector's name moves off its line
      const arrRel =
        spec.crs !== undefined
          ? norm360((norm360(spec.crs + 180) - I) * sg)
          : null;
      for (const S of SECT) {
        let mid = (S.from + S.to) / 2;
        if (arrRel !== null && arrRel >= S.from && arrRel <= S.to) {
          // the middle of the larger free part of the sector
          mid =
            arrRel - S.from >= S.to - arrRel
              ? (S.from + arrRel) / 2
              : (arrRel + S.to) / 2;
        }
        const q = at(abs(mid), RC * (S.e === "DIRECT" ? 0.72 : 0.68));
        const lit = sector?.entry === S.e;
        ly.append(
          lab(c, q[0], q[1] - 4 * u, ENTRY_WORD[S.e][fr ? 1 : 0], {
            role: "key",
            anchor: "middle",
            color: S.col,
            halo: p.bg,
            weight: lit ? 700 : 600,
          }),
          lab(c, q[0], q[1] + 28 * u, S.arc, {
            role: "sec",
            anchor: "middle",
            color: p.muted,
            halo: p.bg,
            italic: true,
          }),
        );
      }
      // the 70° line named outside the circle, at its end beyond the parallel sector
      const l70 = at(b70, RC + 28 * u);
      ly.append(
        lab(c, l70[0], l70[1] + 9 * u, T("70° line", "ligne des 70°"), {
          role: "sec",
          anchor: side(l70[0] - fx),
          color: p.ink2,
          halo: p.bg,
        }),
      );
    }
    // the path to fly, faint, then the trail drawn as the aircraft flies
    const all = flight.samples
      .filter((q) => revealed() || q.phase === "arrive")
      .map((q) =>
        toPx(q.x, q.y)
          .map((v) => v.toFixed(1))
          .join(","),
      )
      .join(" ");
    ly.append(
      s("polyline", {
        points: all,
        fill: "none",
        stroke: p.muted,
        "stroke-opacity": 0.55,
        "stroke-width": SW.constr * u,
        "stroke-dasharray": `${10 * u} ${10 * u}`,
        "stroke-linejoin": "round",
      }),
    );
    trailEntry = s("polyline", {
      fill: "none",
      stroke: p.accent,
      "stroke-width": SW.second * u,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
    trailHold = s("polyline", {
      fill: "none",
      stroke: p.track,
      "stroke-width": SW.hero * u,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
    ly.append(trailEntry, trailHold);
    // the fix, named on the non-holding side
    ly.append(fixMark(c, fx, fy, p.nav));
    // the fix named off the racetrack and the legs' labels: beyond the fix on the inbound course, or (with the
    // sectors, whose boundary runs there) 250° round from the inbound course, between the boundaries
    const fb = show.has("sectors") ? I + 250 * sg : I;
    const fl = at(fb, show.has("sectors") ? 50 * u : 40 * u);
    const [fvx] = bearingVec(fb);
    ly.append(
      lab(c, fl[0], fl[1] + 10 * u, spec.fix, {
        role: "pri",
        anchor: show.has("sectors") ? "middle" : side(fvx),
        color: p.nav,
        halo: p.bg,
      }),
    );
    const lap1 = flight.samples.filter((q) => q.lap === 1);
    // the middle of a leg of the first lap, and the way out of the racetrack square to that leg (on screen)
    const cen = lap1.length
      ? toPx(
          lap1.reduce((a0, q) => a0 + q.x, 0) / lap1.length,
          lap1.reduce((a0, q) => a0 + q.y, 0) / lap1.length,
        )
      : [fx, fy];
    const legOut = (ph: string) => {
      const arr = lap1.filter((q) => q.phase === ph);
      if (arr.length < 2) return null;
      const m = arr[Math.floor(arr.length / 2)];
      const [ax, ay] = toPx(arr[0].x, arr[0].y);
      const [bx, by] = toPx(arr[arr.length - 1].x, arr[arr.length - 1].y);
      const [mx, my] = toPx(m.x, m.y);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / len;
      let ny = (bx - ax) / len;
      if (nx * (mx - cen[0]) + ny * (my - cen[1]) < 0) [nx, ny] = [-nx, -ny];
      return { mx, my, nx, ny, ang: Math.atan2(by - ay, bx - ax) };
    };
    /** two lines beside a leg, outside the racetrack: stacked away from the leg, never on it */
    const legLabel = (
      ph: string,
      l1: string,
      l2: string,
      o1: { role: "pri" | "key"; color: string },
    ) => {
      const g0 = legOut(ph);
      if (!g0) return null;
      const d = 30 * u;
      const x = g0.mx + g0.nx * d;
      const y = g0.my + g0.ny * d;
      const an = side(g0.nx);
      const big = o1.role === "key" ? 32 : 28;
      // up: the second line nearest the leg; down: the first; sideways: centred on the leg
      const [y1, y2] =
        g0.ny < -0.5
          ? [y - 34 * u - 8 * u, y - 8 * u]
          : g0.ny > 0.5
            ? [y + big * u, y + big * u + 34 * u]
            : [y - 4 * u, y + 30 * u];
      ly.append(
        lab(c, x, y1, l1, {
          role: o1.role,
          anchor: an,
          color: o1.color,
          halo: p.bg,
        }),
        lab(c, x, y2, l2, { role: "sec", anchor: an, halo: p.bg }),
      );
      return g0;
    };
    // the parts of the hold
    if (show.has("parts")) {
      const gi = legLabel(
        "inbound",
        T("Inbound · 1 min", "Rapprochement · 1 min"),
        T("at or below 14,000 ft", "jusqu’à 14 000 ft (FL140)"),
        { role: "pri", color: p.track },
      );
      if (gi) ly.append(head(c, gi.mx, gi.my, gi.ang, p.track, 30));
      const go = legLabel(
        "outbound",
        T("Outbound", "Éloignement"),
        T("timed from abeam", "chronométré depuis le travers"),
        { role: "pri", color: p.track },
      );
      if (go) ly.append(head(c, go.mx, go.my, go.ang, p.track, 30));
    }
    if ((show.has("parts") || show.has("clock")) && !show.has("sectors")) {
      const ab = flight.abeam[0];
      if (ab) {
        const [ax, ay] = toPx(ab.x, ab.y);
        ly.append(
          s("line", {
            x1: fx,
            y1: fy,
            x2: ax,
            y2: ay,
            stroke: p.wind,
            "stroke-width": SW.constr * u,
            "stroke-dasharray": `${8 * u} ${8 * u}`,
          }),
          s("circle", { cx: ax, cy: ay, r: 11 * u, fill: p.wind }),
        );
        const [vx, vy] = bearingVec(I);
        ly.append(
          lab(
            c,
            ax + vx * 34 * u,
            ay + vy * 34 * u + 10 * u,
            T("Abeam: start the clock", "Travers : top chrono"),
            {
              role: "pri",
              anchor: side(vx),
              color: p.wind,
              halo: p.bg,
            },
          ),
        );
      }
    }
    // the headings in the wind
    if (show.has("headings")) {
      const wKt = spec.windKt ?? 0;
      const d = Math.abs(Math.round(norm360(flight.inHdg - I + 180) - 180));
      legLabel(
        "inbound",
        `${T("HDG", "Cap")} ${hdg3(flight.inHdg)}`,
        wKt > 0.5
          ? T(
              `inbound · ${d}° into the wind`,
              `rapprochement · ${d}° côté vent`,
            )
          : T("inbound · no wind", "rapprochement · sans vent"),
        { role: "key", color: p.heading },
      );
      legLabel(
        "outbound",
        `${T("HDG", "Cap")} ${hdg3(flight.outHdg)}`,
        wKt > 0.5
          ? T(
              `outbound · 3 × ${d}° = ${3 * d}°`,
              `éloignement · 3 × ${d}° = ${3 * d}°`,
            )
          : T("outbound", "éloignement"),
        { role: "key", color: p.heading },
      );
      // the wind over the racetrack
      if (wKt > 0.5) {
        const mi = lap1.find(
          (q) => q.phase === "inbound" && q.clock && q.clock.s > 20,
        );
        const mo = lap1.find(
          (q) => q.phase === "outbound" && q.clock && q.clock.s > 20,
        );
        if (mi && mo) {
          const [ax, ay] = toPx((mi.x + mo.x) / 2, (mi.y + mo.y) / 2);
          const [vx, vy] = bearingVec(spec.windDir ?? 0);
          const r = Math.min(70 * u, 0.4 * k);
          const x1 = ax + vx * r;
          const y1 = ay + vy * r;
          const x2 = ax - vx * r;
          const y2 = ay - vy * r;
          ly.append(
            s("line", {
              x1,
              y1,
              x2: x2 + vx * 20 * u,
              y2: y2 + vy * 20 * u,
              stroke: p.wind,
              "stroke-width": SW.second * u,
              "stroke-linecap": "round",
            }),
            head(c, x2, y2, Math.atan2(y2 - y1, x2 - x1), p.wind, 30),
          );
        }
      }
    }
    // the aircraft (moved by frame())
    plane = s(
      "g",
      { "aria-hidden": "true" },
      aircraftIcon(0, 0, 0, p.text, 2.4 * u),
    );
    ly.append(plane);
    // the stopwatch
    clockBig = null;
    clockSub = null;
    if (show.has("clock")) {
      const x = 32 * u;
      const y = 24 * u;
      const row = spec.crs === undefined;
      // a row (label and big digits, then what it times) or a column in the corner of the map
      ly.append(
        lab(c, x, y + 20 * u, T("STOPWATCH", "CHRONO"), {
          role: "sec",
          spacing: 0.08,
        }),
      );
      clockBig = lab(c, x, y + (row ? 88 : 96) * u, "0:00", {
        role: "key",
        color: p.wind,
        weight: 700,
      });
      clockBig.setAttribute("font-size", String((row ? 64 : 72) * u));
      const sx = row ? x + 200 * u : x;
      clockSub = lab(c, sx, y + (row ? 52 : 140) * u, "", {
        role: "sec",
        color: p.ink2,
      });
      ly.append(clockBig, clockSub);
      ly.append(
        lab(
          c,
          sx,
          y + (row ? 88 : 184) * u,
          `${T("outbound", "éloignement")} ${mmss(flight.outS)}`,
          { role: "sec", color: p.muted },
        ),
      );
    }
    // the ring the arriving aircraft starts from, and the heading handle on it
    if (handle && spec.crs !== undefined) {
      const r0 = START_NM * k;
      ly.append(
        s("circle", {
          cx: fx,
          cy: fy,
          r: r0,
          fill: "none",
          stroke: p.accent,
          "stroke-opacity": 0.55,
          "stroke-width": SW.grid * u,
          "stroke-dasharray": `${4 * u} ${12 * u}`,
        }),
      );
      const [ax, ay] = at(norm360(spec.crs + 180), r0);
      handle.move(ax, ay);
      handle.g.setAttribute("aria-valuenow", String(Math.round(spec.crs)));
      handle.g.setAttribute(
        "aria-valuetext",
        revealed() && sector
          ? `${T("heading", "cap")} ${hdg3(spec.crs)}, ${T("entry", "entrée")} ${entryWord(sector.entry).toLowerCase()}`
          : `${T("heading", "cap")} ${hdg3(spec.crs)}`,
      );
    }
    // the side panel: the heading, its entry, the goals
    rePanel = null;
    if (pw > 0) {
      const g = s("g");
      ly.append(g);
      const x0 = mapW + 24 * u;
      const wP = pw - 48 * u;
      const paint = () => {
        g.replaceChildren();
        let y = 44 * u;
        if (spec.crs !== undefined && sector) {
          g.append(
            lab(c, x0, y, T("ARRIVAL HEADING", "CAP D’ARRIVÉE"), {
              role: "sec",
              spacing: 0.08,
            }),
          );
          const big = lab(c, x0, y + 76 * u, `${hdg3(spec.crs)}°`, {
            role: "key",
            color: p.accent,
            weight: 700,
          });
          big.setAttribute("font-size", String(72 * u));
          g.append(big);
          y += 148 * u;
          if (!revealed()) {
            // the student's answer: three chips, the entry and its flight shown once the right one is picked
            g.append(
              lab(c, x0, y, T("WHICH ENTRY?", "QUELLE ENTRÉE ?"), {
                role: "sec",
                spacing: 0.08,
                color: p.text,
              }),
            );
            y += 20 * u;
            const gap = 12 * u;
            const cw = (wP - 2 * gap) / 3;
            const ENT: HoldEntry[] = ["DIRECT", "TEARDROP", "PARALLEL"];
            ENT.forEach((e, i) => {
              const no = wrong.includes(e);
              g.append(
                svgButton(
                  sh,
                  x0 + i * (cw + gap),
                  y,
                  cw,
                  88 * u,
                  entryWord(e),
                  no
                    ? T(
                        `${ENTRY_WORD[e][0]} entry: not this one`,
                        `Entrée ${ENTRY_WORD[e][1].toLowerCase()} : pas celle-ci`,
                      )
                    : T(
                        `${ENTRY_WORD[e][0]} entry`,
                        `Entrée ${ENTRY_WORD[e][1].toLowerCase()}`,
                      ),
                  () => pick(e),
                  { cls: "cs-chip", color: no ? p.muted : p.accent },
                ).g,
              );
            });
            y += 88 * u + 44 * u;
            for (const line of wrapWords(
              wrong.length
                ? T(
                    "Not that one: which side of the lines does the aircraft come from?",
                    "Pas celle-ci : de quel côté des lignes arrive l’avion ?",
                  )
                : T(
                    "The aircraft waits for your answer.",
                    "L’avion attend votre réponse.",
                  ),
              FS.sec * u,
              wP,
            )) {
              g.append(
                lab(c, x0, y, line, {
                  role: "sec",
                  color: wrong.length ? p.bad : p.ink2,
                  italic: !wrong.length,
                }),
              );
              y += 32 * u;
            }
            y += 28 * u;
          }
          if (revealed()) {
          g.append(
            lab(c, x0, y, T("ENTRY", "ENTRÉE"), { role: "sec", spacing: 0.08 }),
          );
          const col =
            sector.entry === "DIRECT"
              ? p.nav
              : sector.entry === "TEARDROP"
                ? p.wind
                : p.heading;
          const nm = lab(
            c,
            x0,
            y + 52 * u,
            ENTRY_WORD[sector.entry][fr ? 1 : 0],
            { role: "key", color: col, weight: 700 },
          );
          nm.setAttribute("font-size", String(48 * u));
          g.append(nm);
          y += 96 * u;
          for (const line of wrapWords(
            ENTRY_HOW[sector.entry][fr ? 1 : 0],
            FS.sec * u,
            wP,
          )) {
            g.append(lab(c, x0, y, line, { role: "sec", color: p.ink2 }));
            y += 32 * u;
          }
          if (sector.either.length > 1)
            for (const line of wrapWords(
              T(
                "Within 5° of a boundary: either entry.",
                "À 5° d’une limite : l’une ou l’autre.",
              ),
              FS.sec * u,
              wP,
            )) {
              g.append(
                lab(c, x0, y, line, {
                  role: "sec",
                  color: p.muted,
                  italic: true,
                }),
              );
              y += 32 * u;
            }
          y += 28 * u;
          }
        }
        if (goals.length) {
          g.append(
            s("line", {
              x1: x0,
              y1: y - 12 * u,
              x2: x0 + wP,
              y2: y - 12 * u,
              stroke: p.line,
              "stroke-width": SW.grid * u,
            }),
          );
          y += 28 * u;
          g.append(
            lab(
              c,
              x0,
              y,
              T("YOUR TURN · EACH HEADING, ITS ENTRY", "À VOUS · CHAQUE CAP, SON ENTRÉE"),
              { role: "sec", spacing: 0.04, color: p.text },
            ),
          );
          y += 16 * u;
          goals.forEach((gh, i) => {
            const cy = y + 32 * u;
            const done = met[i];
            g.append(
              s("circle", {
                cx: x0 + 18 * u,
                cy,
                r: 16 * u,
                fill: done ? p.nav : "none",
                stroke: done ? p.nav : p.muted,
                "stroke-width": 3 * u,
              }),
            );
            if (done)
              g.append(
                s("path", {
                  d: `M${x0 + 10 * u} ${cy}l${6 * u} ${6 * u}l${11 * u} -${12 * u}`,
                  fill: "none",
                  stroke: p.bg,
                  "stroke-width": 4 * u,
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                }),
              );
            const e = entrySector(spec.inbound, spec.turn, gh).entry;
            g.append(
              lab(
                c,
                x0 + 52 * u,
                cy + 10 * u,
                `${T("Heading", "Cap")} ${hdg3(gh)} → ${done ? entryWord(e).toLowerCase() : "?"}`,
                { role: "pri", color: done ? p.text : p.ink2 },
              ),
            );
            y += 60 * u;
          });
          if (met.length && met.every(Boolean)) {
            y += 20 * u;
            g.append(
              lab(
                c,
                x0,
                y,
                T("All three entries found.", "Les trois entrées sont trouvées."),
                { role: "pri", color: p.nav },
              ),
            );
          }
        }
      };
      paint();
      rePanel = () => {
        paint();
        pushStatus();
      };
    }
    pushStatus();
  }

  const widget = makeWidget<HoldFlySpec>(spec0, o, [1680, 720], "cs-holdfly", {
    clone: (x) => ({
      ...x,
      ...(x.show ? { show: [...x.show] } : {}),
      ...(x.goals ? { goals: [...x.goals] } : {}),
    }),
    build(sh, get, set) {
      getSpec = get;
      setSpec = set;
      svgEl = sh.svg;
      const { W, H, u, p } = sh.c;
      const spec = get();
      const L1 = layout(sh, spec);
      handle = null;
      if (drag.has("crs") && spec.crs !== undefined) {
        handle = dragHandle(sh.svg, p, {
          u: u * 1.2,
          color: p.accent,
          name: T(
            "Arrival heading: drag the aircraft round the fix, or use the arrow keys",
            "Cap d’arrivée : déplacez l’avion autour du repère, ou utilisez les flèches",
          ),
          onDrag: (x, y) =>
            setCrs(Math.round(vecBearing(L1.fx - x, L1.fy - y) / 5) * 5),
          onKey: (dx, dy, big) =>
            setCrs((get().crs ?? 0) + (dx || -dy) * (big ? 30 : 5)),
        });
        sh.top.append(handle.g);
        // −10° / +10° beside the heading in the panel
        const bw = 132 * u;
        const bh = 88 * u;
        const bx = W - 24 * u - 2 * bw - 16 * u;
        // under the panel's small label, level with the heading
        const by = 60 * u;
        sh.top.append(
          svgButton(
            sh,
            bx,
            by,
            bw,
            bh,
            "−10°",
            T("Heading minus 10°", "Cap moins 10°"),
            () => setCrs((get().crs ?? 0) - 10),
          ).g,
          svgButton(
            sh,
            bx + bw + 16 * u,
            by,
            bw,
            bh,
            "+10°",
            T("Heading plus 10°", "Cap plus 10°"),
            () => setCrs((get().crs ?? 0) + 10),
          ).g,
        );
      }
      if (drag.has("wind")) {
        const dialR = clamp(Math.min(W, H) * 0.075, 44 * u, 64 * u);
        windDial(
          sh,
          lang,
          L1.mapW - dialR - 40 * u,
          dialR + 52 * u,
          dialR,
          Math.max(
            40,
            Math.ceil(Math.max(spec.windKt ?? 0, 30) / 10) * 10 + 10,
          ),
          true,
          (dir, kt) => set({ ...get(), windDir: dir, windKt: kt }),
          () => ({ dir: get().windDir ?? 360, kt: get().windKt ?? 0 }),
          true,
        ).set(spec.windDir ?? 360, spec.windKt ?? 0);
        // the wind again as buttons, for the phone's panel under the slide (the dial is a few pixels there)
        const wind = (dd: number, dk: number) => {
          const cur = get();
          const kt = clamp(Math.round((cur.windKt ?? 0) + dk), 0, 60);
          const dir = Math.round(norm360((cur.windDir ?? 360) + dd)) || 360;
          widget.update({ ...cur, windDir: dir, windKt: kt });
          o.onChange?.(widget.spec());
        };
        const hide = { hidden: true, cls: "cs-proxy" };
        sh.top.append(
          svgButton(sh, 0, 0, 1, 1, T("Wind −10°", "Vent −10°"), T("Wind direction minus 10°", "Direction du vent moins 10°"), () => wind(-10, 0), hide).g,
          svgButton(sh, 0, 0, 1, 1, T("Wind +10°", "Vent +10°"), T("Wind direction plus 10°", "Direction du vent plus 10°"), () => wind(10, 0), hide).g,
          svgButton(sh, 0, 0, 1, 1, "−5 kt", T("Wind strength minus 5 kt", "Force du vent moins 5 kt"), () => wind(0, -5), hide).g,
          svgButton(sh, 0, 0, 1, 1, "+5 kt", T("Wind strength plus 5 kt", "Force du vent plus 5 kt"), () => wind(0, 5), hide).g,
        );
      }
      pauseLabel = null;
      if (controls()) {
        const bw = 168 * u;
        const bh = 88 * u;
        const y = H - bh - 12 * u;
        const x0 = 24 * u;
        const pz = svgButton(
          sh,
          x0,
          y,
          bw,
          bh,
          paused ? T("Play", "Lecture") : T("Pause", "Pause"),
          T("Pause or play the flight", "Mettre en pause ou reprendre le vol"),
          () => {
            paused = !paused;
            if (pauseLabel)
              pauseLabel.textContent = paused
                ? T("Play", "Lecture")
                : T("Pause", "Pause");
            o.onLive?.();
          },
        );
        pauseLabel = pz.t;
        const rp = svgButton(
          sh,
          x0 + bw + 16 * u,
          y,
          bw,
          bh,
          T("Replay", "Rejouer"),
          T("Fly it again from the start", "Revoler depuis le début"),
          () => {
            tSim = 0;
            paused = false;
            if (pauseLabel) pauseLabel.textContent = T("Pause", "Pause");
            frame(0);
            o.onLive?.();
          },
        );
        sh.top.append(pz.g, rp.g);
      }
    },
    draw(sh, spec) {
      flight = holdFlightOf(spec);
      draw(sh, spec);
      frame(animate ? Math.min(tSim, endT()) : stillT());
    },
    label(_sh, spec) {
      const f = flight;
      const e =
        spec.crs !== undefined && revealed()
          ? entrySector(spec.inbound, spec.turn, spec.crs).entry
          : null;
      const turns =
        spec.turn === "R"
          ? T("right turns", "virages à droite")
          : T("left turns", "virages à gauche");
      const arr =
        e && spec.crs !== undefined
          ? T(
              `Arrival heading ${hdg3(spec.crs)}: ${ENTRY_WORD[e][0].toLowerCase()} entry. `,
              `Arrivée au cap ${hdg3(spec.crs)} : entrée ${ENTRY_WORD[e][1].toLowerCase()}. `,
            )
          : "";
      return T(
        `Hold at ${spec.fix}, inbound ${hdg3(spec.inbound)}, ${turns}. ${arr}Inbound heading ${hdg3(f.inHdg)}, outbound heading ${hdg3(f.outHdg)} for ${mmss(f.outS)} from abeam the fix.`,
        `Attente à ${spec.fix}, rapprochement ${hdg3(spec.inbound)}, ${turns}. ${arr}Cap de rapprochement ${hdg3(f.inHdg)}, cap d’éloignement ${hdg3(f.outHdg)} pendant ${mmss(f.outS)} depuis le travers.`,
      );
    },
    note: () =>
      controls()
        ? T(`Time sped up × ${speed}`, `Temps accéléré × ${speed}`)
        : null,
  });
  if (animate && typeof requestAnimationFrame === "function")
    raf = requestAnimationFrame(loop);
  return {
    ...widget,
    live: () => ({
      spec: widget.spec(),
      t: tSim,
      paused,
      x: { decided, wrong: [...wrong], met: [...met] },
    }),
    follow(st) {
      const sp = st.spec as HoldFlySpec;
      const x = st.x as
        | { decided?: boolean; wrong?: HoldEntry[]; met?: boolean[] }
        | undefined;
      const metBefore = met.join();
      let redraw = JSON.stringify(sp) !== JSON.stringify(widget.spec());
      if (x) {
        if (typeof x.decided === "boolean" && x.decided !== decided) {
          decided = x.decided;
          redraw = true;
        }
        if (Array.isArray(x.wrong) && x.wrong.join() !== wrong.join()) {
          wrong = [...x.wrong];
          redraw = true;
        }
        if (Array.isArray(x.met))
          x.met.forEach((m, i) => {
            if (i < met.length) met[i] = !!m;
          });
      }
      if (met.join() !== metBefore) {
        redraw = true;
        o.onGoal?.([...met]);
      }
      if (typeof st.t === "number") tSim = st.t;
      if (typeof st.paused === "boolean") paused = st.paused;
      if (redraw) widget.update(sp);
      if (pauseLabel)
        pauseLabel.textContent = paused ? T("Play", "Lecture") : T("Pause", "Pause");
      frame(animate ? Math.min(tSim, endT()) : stillT());
    },
    destroy() {
      if (raf && typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(raf);
      raf = 0;
      widget.destroy();
    },
  };
}
