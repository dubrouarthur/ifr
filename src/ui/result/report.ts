// Exercise result: the pure report builder. ResultInput (a plain object: LessonRun + recorder + observer in the app,
// fixtures in the tests) → ResultReport: the outcome, the standards with their tolerance and % of limit, the tiles,
// the numbered findings (where · what happened · why it matters · next time), help used, the timeline lanes.
// No DOM. Every sentence is a template from i18n.ts bound to measured values.
//
// Standards and tolerances (real-world first):
//  - Altitude ±100 ft, heading ±10°, airspeed ±10 kt, standard-rate turns: FAA-S-ACS-8C Instrument Rating, Area IV
//    Task A (instrument flight) and Area III Task B (holding).
//  - Course tracking and approaches ≤ ¾-scale CDI / glideslope deflection: FAA-S-ACS-8C IR.V.A, IR.VI.A/B.
//  - Holds: 1-minute inbound legs at or below 14,000 ft MSL, entries by sector (direct / teardrop / parallel): FAA
//    AIM 5-3-8; outbound wind correction about 3× the inbound one and outbound timing adjusted by the inbound error:
//    AIM 5-3-8 j.
//  - No descent below DA/MDA without visual references: 14 CFR 91.175; segment minimum altitudes and the MDA are
//    floors (14 CFR 91.175/91.177, AIM 5-4-5; ACS IR.VI.A: MDA +100/−0 ft): the debrief draws them at the published
//    altitude itself, never 100 ft below.
//  - Altitude corrections with a VS about twice the error, bank no greater than the heading change, lead the roll-out
//    by half the bank: FAA Instrument Flying Handbook (FAA-H-8083-15B) ch. 6; 5 × ground speed for a 3° path: IFH
//    ch. 10 / AIM 5-4-5.
//  - Stabilized approach gates: 1,000 ft above the airport in IMC, 500 ft in VMC, < 1,000 fpm (FSF ALAR Briefing
//    Note 7.1, FAA AC 120-71B; FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 9).
//  - Standard-rate bank ≈ TAS/10 + 7 (IFH ch. 6); power 100 RPM ≈ 5 kt in the C172S cruise tables (C172S POH §5).
// An ended exercise is not graded (no score, no verdict); a crash is "not met" with a safety finding (SPEC §4.3).
import { holdFrame, type HoldDef } from "../../nav/holding";
import { bearingDeg, distanceNm } from "../../nav/geo";
import { mmss, num, sgn, tx } from "./i18n";
import { LESSON_META } from "../../library/meta";
/** the exercise's title in the report's language (the curriculum writes English; library/meta.ts holds the French) */
const exTitleIn = (L: Lang, ex: { id: string; title: string }) => (L === "fr" ? (LESSON_META[ex.id]?.fr ?? ex.title) : ex.title);
import type {
  DevKind,
  Finding,
  FindingGroup,
  Gauge,
  HelpUse,
  Lang,
  Outcome,
  Phase,
  ResultInput,
  ResultReport,
  Span,
  StandardResult,
  StepRow,
  Tile,
  TimelineMark,
} from "./types";

// ---------------------------------------------------------------- deviation texts → kind and value

export interface Classified {
  kind: DevKind;
  value: number | null;
  limit: number | null;
}

const numIn = (s: string) => {
  const m = /([+\-−]?\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1].replace("−", "-")) : null;
};

/** what a step check() text reports (engine.ts devCheck, S.turnTo, trackRadial, the circuits' constraints) */
export function classify(text: string | null | undefined): Classified {
  const s = text ?? "";
  let m: RegExpExecArray | null;
  if ((m = /^Altitude ([+\-−]?\d+) ft/.exec(s)))
    return { kind: "alt", value: numIn(m[1]), limit: 100 };
  if ((m = /^Heading ([+\-−]?\d+)°/.exec(s)))
    return { kind: "hdg", value: numIn(m[1]), limit: 10 };
  if ((m = /^Overshot \d+ by (\d+)°/.exec(s)))
    return { kind: "hdg", value: Number(m[1]), limit: 10 };
  if ((m = /^Airspeed ([+\-−]?\d+) kt/.exec(s)))
    return { kind: "ias", value: numIn(m[1]), limit: 10 };
  if ((m = /^Bank (\d+)° \(max (\d+)\)/.exec(s)))
    return { kind: "bank", value: Number(m[1]), limit: Number(m[2]) };
  if (/^Bank \d+°/.test(s) || /^Turn rate/.test(s) || /wrong way/i.test(s))
    return { kind: "bank", value: numIn(s), limit: null };
  if ((m = /^Vertical speed ([+\-−]?\d+) fpm/.exec(s)))
    return { kind: "vs", value: numIn(m[1]), limit: null };
  if ((m = /^CDI ([\d.]+) dots \(max ([\d.]+)\)/.exec(s)))
    return { kind: "track", value: Number(m[1]), limit: Number(m[2]) };
  if (/^Off course|^Arc /.test(s))
    return { kind: "track", value: numIn(s), limit: null };
  if (/constraint/i.test(s))
    return { kind: "constraint", value: null, limit: null };
  if (/Stall|Overspeed|Too low|Too slow/i.test(s))
    return { kind: "control", value: null, limit: null };
  return { kind: "other", value: null, limit: null };
}

/** the altitude a step holds, from its text ("Maintain 4000 ft…", "…, maintain 3000 ft") */
export function stepTargetAlt(text: string): number | null {
  const m = /maintain (\d{3,5}) ft/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** spans of the same kind closer than 3 s are one deviation */
export function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  const sorted = [...spans].sort((a, b) => a.t0 - b.t0);
  for (const s of sorted) {
    const cur = [...out].reverse().find((o) => o.kind === s.kind);
    if (cur && s.t0 - cur.t1 <= 3) {
      cur.t1 = Math.max(cur.t1, s.t1);
      if (Math.abs(s.worst ?? 0) > Math.abs(cur.worst ?? 0)) {
        cur.worst = s.worst;
        cur.text = s.text;
        cur.tWorst = s.tWorst;
      }
    } else out.push({ ...s });
  }
  return out;
}

/** the spans of a run without an observer: one per step out of tolerance, at an unknown time */
function spansFromSteps(inp: ResultInput): Span[] {
  return inp.steps.flatMap((s, i) => {
    if (s.violationSec <= 0) return [];
    const c = classify(s.worst);
    const t0 = s.t0 ?? 0;
    return [
      {
        step: i,
        kind: c.kind,
        t0,
        t1: t0 + s.violationSec,
        text: s.worst ?? "",
        worst: c.value,
        tWorst: t0,
      },
    ];
  });
}

// ---------------------------------------------------------------- formatting helpers

const dur = (s: Span) => Math.max(0.5, s.t1 - s.t0);
const r0 = (v: number) => Math.round(v);
const pctNum = (p: number) => Math.round(p * 100);
const hdg3 = (h: number) =>
  String(Math.round(((h % 360) + 360) % 360) || 360).padStart(3, "0");
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function traceAt(inp: ResultInput, t: number) {
  let best = inp.trace[0];
  for (const p of inp.trace)
    if (Math.abs(p.t - t) < Math.abs((best?.t ?? 0) - t)) best = p;
  return best;
}

/** "1.6 NM NE of PA" for the nearest known fix */
function wherePos(inp: ResultInput, t: number): string | null {
  const fixes = inp.hold ? [inp.hold.fix] : (inp.fixes ?? []);
  const p = traceAt(inp, t);
  if (!p || !fixes.length) return null;
  let best = fixes[0];
  let bd = Infinity;
  for (const f of fixes) {
    const d = distanceNm(f, p);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  if (bd > 40) return null;
  if (bd < 0.15) return tx(inp.lang, "where.entry", { fix: best.ident });
  const dir = COMPASS[Math.round(bearingDeg(best, p) / 45) % 8];
  return tx(inp.lang, "where.from", {
    d: num(inp.lang, bd, 1),
    dir: tx(inp.lang, `dir.${dir}`),
    fix: best.ident,
  });
}

// ---------------------------------------------------------------- the task (eyebrow)

/** ACS area and task of an exercise (FAA-S-ACS-8C; codes to be verified by a CFII before release, SPEC §11.2) */
export function taskKey(ex: ResultInput["ex"]): string | null {
  const id = ex.id;
  switch (ex.stage) {
    case "S1":
    case "S2":
      return /unusual/.test(id) ? "task.IV.B" : "task.IV.A";
    case "S3":
      return "task.V.A";
    case "S4":
      return "task.III.B";
    case "S5":
      return /ils|lpv|hilpt|vnav/.test(id) ? "task.VI.B" : "task.VI.A";
    case "S6":
      return "task.VI.C";
    case "S7":
      return "task.ck";
    case "S8":
      return "task.xc";
    default:
      return null;
  }
}

// ---------------------------------------------------------------- standards

interface Std extends StandardResult {
  /** the spans graded by this standard (findings) */
  spans: Span[];
  limit: number | null;
  kind?: DevKind;
}

const KIND_SKILL: Record<DevKind, string> = {
  alt: "alt",
  hdg: "hdg",
  ias: "ias",
  bank: "bank",
  vs: "vs",
  track: "track",
  constraint: "constraint",
  control: "control",
  other: "other",
};

function symGauge(lim: number, values: number[]): Gauge {
  const worst = Math.max(0, ...values.map(Math.abs));
  const span = Math.max(lim * 2, worst * 1.15);
  return { min: -span, max: span, lo: -lim, hi: lim, zero: 0, v: values };
}

/** the kinds whose standard is breached: a step out of tolerance longer than its own limit, or more time out of
 *  tolerance than the exercise allows (the engine's rules, LessonRun.finish) */
function breachedKinds(inp: ResultInput, spans: Span[]): Set<DevKind> {
  const out = new Set<DevKind>();
  const secs = new Map<DevKind, number>();
  for (const s of spans) secs.set(s.kind, (secs.get(s.kind) ?? 0) + dur(s));
  const dominant = (list: Span[]): DevKind | null => {
    const m = new Map<DevKind, number>();
    for (const s of list) m.set(s.kind, (m.get(s.kind) ?? 0) + dur(s));
    let best: DevKind | null = null;
    let bv = -1;
    for (const [k, v] of m) if (v > bv) [best, bv] = [k, v];
    return best;
  };
  inp.steps.forEach((s, i) => {
    if (s.limitSec !== undefined && s.violationSec > s.limitSec) {
      const k =
        dominant(spans.filter((x) => x.step === i)) ?? classify(s.worst).kind;
      out.add(k);
    }
  });
  const total = inp.steps.reduce((a, s) => a + s.violationSec, 0);
  if (total > inp.allowanceSec) {
    let any = false;
    for (const [k, v] of secs)
      if (v > inp.allowanceSec) {
        out.add(k);
        any = true;
      }
    if (!any) {
      const k = dominant(spans);
      if (k) out.add(k);
      else {
        const worstStep = [...inp.steps].sort(
          (a, b) => b.violationSec - a.violationSec,
        )[0];
        if (worstStep?.violationSec) out.add(classify(worstStep.worst).kind);
      }
    }
  }
  return out;
}

/** a crash absorbs only its final dive: the last seconds before impact (SPEC §2.3, A2) */
const CRASH_DIVE_SEC = 10;

/** a deviation that ran into the final dive, cut where the dive starts (its worst taken from the trace there when it
 *  was reached inside the dive) */
function cutSpan(inp: ResultInput, sp: Span, w0: number): Span {
  const out: Span = { ...sp, t1: Math.max(sp.t0, w0), intoDive: true };
  if (sp.tWorst <= w0) return out;
  const p = traceAt(inp, w0);
  const m =
    sp.kind === "alt" || sp.kind === "hdg" || sp.kind === "ias"
      ? inp.measured[sp.kind]
      : undefined;
  const target = m?.target;
  if (p && target !== undefined) {
    const v =
      sp.kind === "alt"
        ? p.alt - target
        : sp.kind === "ias"
          ? p.ias - target
          : ((((p.hdg - target + 180) % 360) + 360) % 360) - 180;
    out.worst = Math.round(v);
  }
  out.tWorst = w0;
  return out;
}

function stepStandards(
  inp: ResultInput,
  spans: Span[],
  breached: Set<DevKind>,
  skipAlt: boolean,
): Std[] {
  const L = inp.lang;
  const out: Std[] = [];
  const kinds: DevKind[] = [
    "alt",
    "hdg",
    "ias",
    "bank",
    "vs",
    "track",
    "constraint",
    "control",
    "other",
  ];
  for (const kind of kinds) {
    if (kind === "alt" && skipAlt) continue;
    const ks = spans.filter((s) => s.kind === kind);
    const meas =
      kind === "alt" || kind === "hdg" || kind === "ias"
        ? inp.measured[kind]
        : undefined;
    if (!ks.length && !meas && !breached.has(kind)) continue;
    const secs = ks.reduce((a, s) => a + dur(s), 0);
    const verdict = breached.has(kind) ? "not-met" : "met";
    const worstSpan = [...ks].sort(
      (a, b) => Math.abs(b.worst ?? 0) - Math.abs(a.worst ?? 0),
    )[0];
    const spanLimit =
      ks.map((s) => classify(s.text).limit).find((x) => x !== null) ?? null;
    const limit =
      kind === "alt" ? 100 : kind === "hdg" || kind === "ias" ? 10 : spanLimit;
    const worstAbs = Math.max(
      Math.abs(worstSpan?.worst ?? 0),
      meas?.maxAbs ?? 0,
    );
    const pct = limit ? worstAbs / limit : null;
    const grace =
      verdict === "met" && secs >= 1
        ? ` · ${tx(L, "w.grace", { s: r0(secs), g: r0(inp.allowanceSec) })}`
        : "";
    const pctTxt =
      pct !== null ? ` · ${tx(L, "pctShort", { p: pctNum(pct) })}` : "";
    let label = tx(L, `k.${kind}`);
    let value = "—";
    let unit = "";
    let short = "";
    let gauge: Gauge | undefined;
    const signedWorst = (() => {
      const cands: number[] = [];
      if (worstSpan?.worst !== null && worstSpan?.worst !== undefined)
        cands.push(worstSpan.worst);
      if (meas) cands.push(meas.min, meas.max);
      return cands.sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? 0;
    })();
    const markers = () => {
      const v: number[] = [];
      if (meas) v.push(meas.min, meas.max);
      for (const s of ks) if (s.worst !== null) v.push(s.worst);
      const lo = Math.min(...v);
      const hi = Math.max(...v);
      return v.length ? [...new Set([lo, hi])] : [];
    };
    switch (kind) {
      case "alt": {
        value = sgn(L, signedWorst);
        unit = tx(L, "u.ftMax");
        short = meas
          ? tx(L, "w.alt", { target: num(L, meas.target), lim: 100 })
          : tx(L, "w.altAny", { lim: 100 });
        gauge = symGauge(100, markers());
        break;
      }
      case "hdg":
        value = `${num(L, worstAbs)}°`;
        unit = tx(L, "u.max");
        short = meas
          ? tx(L, "w.hdg", { target: hdg3(meas.target), lim: 10 })
          : tx(L, "w.hdgAny", { lim: 10 });
        gauge = symGauge(10, markers());
        break;
      case "ias":
        // signed, like the altitude tile and the finding ("−14 kt"): the gauge's markers show both sides
        value = sgn(L, signedWorst);
        unit = tx(L, "u.kt");
        short = meas
          ? tx(L, "w.ias", { target: meas.target, lim: 10 })
          : tx(L, "w.iasAny", { lim: 10 });
        gauge = symGauge(10, markers());
        break;
      case "bank":
        label = tx(L, "k.bank");
        value =
          worstSpan?.worst !== null && worstSpan?.worst !== undefined
            ? `${num(L, Math.abs(worstSpan.worst), /rate/i.test(worstSpan.text) ? 1 : 0)}${/rate/i.test(worstSpan.text) ? "°/s" : "°"}`
            : "—";
        short = limit ? tx(L, "w.bank", { lim: limit }) : tx(L, "w.bankAny");
        if (limit)
          gauge = {
            min: 0,
            max: Math.max(limit * 1.5, worstAbs * 1.1),
            lo: 0,
            hi: limit,
            v: [worstAbs],
          };
        break;
      case "vs":
        value = num(L, Math.abs(worstSpan?.worst ?? 0));
        unit = tx(L, "u.fpm");
        short = tx(L, "w.vs");
        break;
      case "track":
        value =
          worstSpan?.worst !== null && worstSpan?.worst !== undefined
            ? num(L, Math.abs(worstSpan.worst), limit ? 1 : 0) +
              (limit ? "" : "°")
            : "—";
        unit = limit ? tx(L, "u.dotMax") : "";
        short = limit
          ? tx(L, "w.track", { lim: num(L, limit, 1) })
          : tx(L, "k.track");
        if (limit) gauge = symGauge(limit, [worstAbs]);
        break;
      default:
        value = `${r0(secs)}`;
        unit = tx(L, "u.s");
        short = tx(L, `w.${kind}`);
    }
    out.push({
      id: `step.${kind}`,
      skill: KIND_SKILL[kind],
      label,
      wording: `${short}${pctTxt}${grace}`,
      short,
      verdict,
      value,
      unit,
      pct,
      gauge,
      safety: kind === "control",
      spans: ks,
      limit,
      kind,
    });
  }
  return out;
}

function holdStandards(
  inp: ResultInput,
  altSpans: Span[],
  altBreached: boolean,
): Std[] {
  const L = inp.lang;
  const h = inp.hold!;
  const out: Std[] = [];
  const crossed = h.crossedAt !== null;
  const entryName = (e: string | null) => (e ? tx(L, `eb.entry.${e}`) : "—");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // entry (AIM 5-3-8 sectors; ±5° of a boundary either entry is accepted)
  {
    const ok = h.flownEntry ? h.okEntries.includes(h.flownEntry) : null;
    out.push({
      id: "hold.entry",
      skill: "entry",
      label: tx(L, "k.entry"),
      verdict: !crossed || ok === null ? "not-reached" : ok ? "met" : "not-met",
      value: h.flownEntry ? cap(entryName(h.flownEntry)) : "—",
      unit: "",
      wording: !h.flownEntry
        ? tx(L, "w.entryNone")
        : ok
          ? tx(L, "w.entry", { crs: hdg3(h.arrivalCourse) })
          : tx(L, "w.entryWrong", {
              entry: cap(entryName(h.correctEntry)),
              crs: hdg3(h.arrivalCourse),
            }),
      short: tx(L, "k.entry"),
      pct: null,
      spans: [],
      limit: null,
    });
  }
  // altitude ±100 ft in the hold (ACS IR.III.B)
  {
    const after = inp.trace.filter(
      (p) => crossed && p.t >= (h.crossedAt as number) + 5,
    );
    const devs = after.map((p) => p.alt - h.altFt);
    const lo = devs.length ? Math.min(...devs) : 0;
    const hi = devs.length ? Math.max(...devs) : 0;
    const spanWorst = altSpans.reduce(
      (a, s) => (Math.abs(s.worst ?? 0) > Math.abs(a) ? (s.worst ?? 0) : a),
      0,
    );
    const worst = [hi, lo, spanWorst].sort(
      (a, b) => Math.abs(b) - Math.abs(a),
    )[0];
    const worstAbs = Math.max(Math.abs(worst), crossed ? h.maxAltDev : 0);
    const met = (!crossed || h.altOutSec < 5) && !altBreached;
    const pct = worstAbs / 100;
    out.push({
      id: "hold.alt",
      skill: "alt",
      label: tx(L, "k.holdAlt"),
      verdict:
        !crossed && !altSpans.length ? "not-reached" : met ? "met" : "not-met",
      value: sgn(L, worst || worstAbs),
      unit: tx(L, "u.ftMax"),
      wording: `${tx(L, "w.holdAlt", { alt: num(L, h.altFt) })} · ${tx(L, "pctShort", { p: pctNum(pct) })}`,
      short: tx(L, "w.holdAlt", { alt: num(L, h.altFt) }),
      pct,
      gauge: symGauge(
        100,
        [...new Set([lo, hi])].filter((v) => v !== 0),
      ),
      spans: altSpans,
      limit: 100,
      kind: "alt",
    });
  }
  // inbound leg 1:00 ±0:15 (AIM 5-3-8: 1-minute inbound legs at or below 14,000 ft MSL), graded on the last lap
  {
    const ins = h.inboundTimes;
    const last = ins[ins.length - 1];
    const pct = last !== undefined ? Math.abs(last - 60) / 15 : null;
    const first =
      ins.length > 1 && Math.abs(ins[0] - 60) > 10
        ? ` · ${tx(L, "w.inboundLaps", { t: mmss(ins[0]) })}`
        : "";
    out.push({
      id: "hold.inbound",
      skill: "timing",
      label: tx(L, "k.inbound"),
      verdict:
        last === undefined
          ? "not-reached"
          : Math.abs(last - 60) <= 15
            ? "met"
            : "not-met",
      value: last !== undefined ? mmss(last) : "—",
      unit: last !== undefined ? tx(L, "u.lastLap") : "",
      wording: `${tx(L, "w.inbound")}${first}`,
      short: tx(L, "w.inbound"),
      pct,
      gauge:
        last !== undefined
          ? { min: 30, max: 90, lo: 45, hi: 75, zero: 60, v: ins.slice(-3) }
          : undefined,
      spans: [],
      limit: 15,
    });
  }
  // protected airspace: ≤ 0.6 NM on the non-holding side, < 4.5 NM on the holding side (holdEval.ts)
  if (crossed) {
    const d = Math.max(0, h.maxNonHoldingSide);
    const pct = Math.max(d / 0.6, h.maxHoldingSide / 4.5);
    out.push({
      id: "hold.protect",
      skill: "protect",
      label: tx(L, "k.protect"),
      verdict: d < 0.6 && h.maxHoldingSide < 4.5 ? "met" : "not-met",
      value: num(L, d, 1),
      unit: tx(L, "u.nm"),
      wording: `${tx(L, "w.protect")} · ${tx(L, "pctShort", { p: pctNum(pct) })}`,
      short: tx(L, "w.protect"),
      pct,
      gauge: { min: 0, max: Math.max(1.2, d * 1.2), lo: 0, hi: 0.6, v: [d] },
      spans: [],
      limit: 0.6,
    });
  }
  return out;
}

/** the recorder's ACS items (evaluateAcs, FAA-S-ACS-8C IR.VI.A/B/C, IR.VII) */
function acsStandards(inp: ResultInput): Std[] {
  const L = inp.lang;
  const out: Std[] = [];
  for (const it of inp.acs?.items ?? []) {
    const verdict =
      it.result === "PASS"
        ? "met"
        : it.result === "FAIL"
          ? "not-met"
          : "not-reached";
    const base = { spans: [] as Span[], verdict } as const;
    const n = numIn(it.actual);
    if (/^Aircraft control/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.crash",
        skill: "control",
        label: tx(L, "k.crash"),
        value: "—",
        unit: "",
        wording: tx(L, "w.crash"),
        short: tx(L, "w.crash"),
        pct: null,
        safety: true,
        limit: null,
      });
    } else if (
      /^Lateral guidance/.test(it.task) ||
      /^Vertical guidance/.test(it.task)
    ) {
      const vert = /^Vertical/.test(it.task);
      const d = n ?? 0;
      const pct = d / 1.5;
      const label = vert
        ? tx(L, "k.gs")
        : inp.ex.plate && /ils|loc|lda|bc/i.test(inp.ex.id)
          ? tx(L, "k.loc")
          : tx(L, "k.lat");
      out.push({
        ...base,
        id: vert ? "acs.gs" : "acs.loc",
        skill: vert ? "gs" : "loc",
        label,
        value: num(L, d, 1),
        unit: tx(L, "u.dotMax"),
        wording: `${tx(L, vert ? "w.gs" : "w.loc")} · ${tx(L, "pctShort", { p: pctNum(pct) })}`,
        short: tx(L, vert ? "w.gs" : "w.loc"),
        pct,
        gauge: symGauge(1.5, [d]),
        limit: 1.5,
      });
    } else if (/^Airspeed on final/.test(it.task)) {
      const ref = numIn(it.standard.replace(/^.*\(/, "")) ?? 90;
      const d = Math.abs(n ?? 0);
      const pct = d / 10;
      out.push({
        ...base,
        id: "acs.ias",
        skill: "ias",
        label: tx(L, "k.iasFinal"),
        value: `±${num(L, d)}`,
        unit: tx(L, "u.kt"),
        wording: `${tx(L, "w.iasFinal", { v: ref })} · ${tx(L, "pctShort", { p: pctNum(pct) })}`,
        short: tx(L, "w.iasFinal", { v: ref }),
        pct,
        gauge: symGauge(10, [-d, d]),
        limit: 10,
      });
    } else if (/^Final approach segment/.test(it.task)) {
      continue;
    } else if (/^Published altitudes/.test(it.task)) {
      const s = /(\d+) s below/.exec(it.actual);
      out.push({
        ...base,
        id: "acs.pubAlt",
        skill: "stepdown",
        label: tx(L, "k.pubAlt"),
        value: s ? s[1] : "0",
        unit: `${tx(L, "u.s")} ${tx(L, "val.below")}`,
        wording: tx(L, "w.pubAlt"),
        short: tx(L, "k.pubAlt"),
        pct: null,
        limit: null,
      });
    } else if (/^Decision altitude|^Minimum descent/.test(it.task)) {
      const da = /\((\d+) ft\)/.exec(it.actual);
      const below = /(\d+) s below/.exec(it.actual);
      out.push({
        ...base,
        id: "acs.da",
        skill: "da",
        label: tx(L, /^Decision/.test(it.task) ? "k.da" : "k.mda"),
        value: below ? below[1] : da ? num(L, Number(da[1])) : "—",
        unit: below ? `${tx(L, "u.s")} ${tx(L, "val.below")}` : da ? "ft" : "",
        wording: tx(L, "w.da"),
        short: tx(L, /^Decision/.test(it.task) ? "k.da" : "k.mda"),
        pct: null,
        limit: null,
      });
    } else if (/^Missed approach/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.missed",
        skill: "missed",
        label: tx(L, "k.missed"),
        value: tx(L, verdict === "met" ? "val.flown" : "val.notFlown"),
        unit: "",
        wording: tx(L, "w.missed"),
        short: tx(L, "k.missed"),
        pct: null,
        limit: null,
      });
    } else if (/^Stabilized/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.stable",
        skill: "stable",
        label: tx(L, "k.stable"),
        value: `${n ?? 0}`,
        unit: tx(L, "u.s"),
        wording: tx(L, "w.stable"),
        short: tx(L, "k.stable"),
        pct: null,
        limit: null,
      });
    } else if (/^Loss-of-control/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.loc2",
        skill: "control",
        label: tx(L, "k.loc2"),
        value: tx(L, verdict === "met" ? "val.none" : "val.seen"),
        unit: "",
        wording: tx(L, "w.loc2"),
        short: tx(L, "w.loc2"),
        pct: null,
        safety: true,
        limit: null,
      });
    } else if (/^Abnormal/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.abnormal",
        skill: "control",
        label: tx(L, "k.abnormal"),
        value: tx(L, verdict === "met" ? "val.done" : "val.notDone"),
        unit: "",
        wording: tx(L, "w.abnormal"),
        short: tx(L, "k.abnormal"),
        pct: null,
        limit: null,
      });
    } else if (/^Landing/.test(it.task)) {
      const fpm = /^(\d+) fpm/.exec(it.actual);
      const v = fpm ? Number(fpm[1]) : null;
      const pct = v !== null ? v / 600 : null;
      out.push({
        ...base,
        id: "acs.landing",
        skill: "landing",
        label: tx(L, "k.landing"),
        value: v !== null ? num(L, v) : "—",
        unit: v !== null ? tx(L, "u.fpm") : "",
        wording:
          tx(L, "w.landing") +
          (pct !== null ? ` · ${tx(L, "pctShort", { p: pctNum(pct) })}` : ""),
        short: tx(L, "w.landing"),
        pct,
        gauge:
          v !== null
            ? { min: 0, max: Math.max(900, v * 1.1), lo: 0, hi: 600, v: [v] }
            : undefined,
        limit: 600,
      });
    } else if (/^Hand-flown/.test(it.task)) {
      out.push({
        ...base,
        id: "acs.hand",
        skill: "hand",
        label: tx(L, "k.hand"),
        value: tx(L, verdict === "met" ? "val.yes" : "val.apUsed"),
        unit: "",
        wording: tx(L, "w.hand"),
        short: tx(L, "w.hand"),
        pct: null,
        limit: null,
      });
    }
  }
  return out;
}

const RANK_V: Record<string, number> = {
  "not-met": 0,
  met: 1,
  "not-reached": 2,
};
/** failed first (safety first), then by % of limit */
export function orderStandards<T extends StandardResult>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const v = RANK_V[a.verdict] - RANK_V[b.verdict];
    if (v) return v;
    if (a.verdict === "not-met" && !!a.safety !== !!b.safety)
      return a.safety ? -1 : 1;
    return (b.pct ?? 0.3) - (a.pct ?? 0.3);
  });
}

// ---------------------------------------------------------------- findings

interface Cand extends Omit<Finding, "n"> {}

function backText(inp: ResultInput, s: Span): string {
  const step = inp.steps[s.step];
  if (s.intoDive) return tx(inp.lang, "what.intoDive", { t: mmss(s.t1) });
  const ended = step?.t1 !== undefined && s.t1 >= step.t1 - 0.5;
  return ended
    ? tx(inp.lang, "what.notBack")
    : tx(inp.lang, "what.back", { t: mmss(s.t1) });
}

function vsPart(inp: ResultInput, t: number): string {
  const p = traceAt(inp, t);
  if (!p || Math.abs(p.vs) < 300) return "";
  return tx(inp.lang, p.vs < 0 ? "what.vsDown" : "what.vsUp", {
    v: num(inp.lang, Math.round(Math.abs(p.vs) / 10) * 10),
  });
}

function whereLine(
  inp: ResultInput,
  step: number | null,
  t: number,
  secs: number | null,
): string {
  const parts: string[] = [];
  if (step !== null && inp.steps.length > 1)
    parts.push(tx(inp.lang, "where.step", { k: step + 1 }));
  const pos = wherePos(inp, t);
  if (pos) parts.push(pos);
  if (secs !== null)
    parts.push(tx(inp.lang, "where.out", { s: Math.max(1, r0(secs)) }));
  return parts.join(" · ");
}

function spanFinding(
  inp: ResultInput,
  s: Span,
  std: Std,
  group: FindingGroup,
): Cand {
  const L = inp.lang;
  const secs = dur(s);
  const k = s.step + 1;
  const stepText = inp.steps[s.step]?.text ?? "";
  const target =
    s.kind === "alt"
      ? stepTargetAlt(stepText)
      : s.kind === "hdg"
        ? inp.measured.hdg?.step === s.step
          ? inp.measured.hdg.target
          : null
        : s.kind === "ias"
          ? inp.measured.ias?.step === s.step
            ? inp.measured.ias.target
            : null
          : null;
  const w = s.worst ?? 0;
  const d = Math.abs(w);
  const pct = std.limit ? d / std.limit : undefined;
  const watch = group === "watch";
  let title = "";
  let what = "";
  let next = tx(L, `next.${s.kind}`);
  const back = backText(inp, s);
  const vs = vsPart(inp, s.t0);
  switch (s.kind) {
    case "alt": {
      const alt = target !== null ? target + w : null;
      title =
        target !== null
          ? tx(L, w > 0 ? "t.altHi" : "t.altLo", {
              alt: num(L, alt as number),
              d: num(L, d),
              target: num(L, target),
            })
          : tx(L, "t.altAny", { d: num(L, d), k });
      what =
        target !== null
          ? tx(L, "what.alt", {
              d: num(L, d),
              dir: tx(L, w > 0 ? "what.dirAbove" : "what.dirBelow"),
              target: num(L, target),
              s: r0(secs),
              vs,
              back,
            })
          : tx(L, "what.altAny", { d: num(L, d), s: r0(secs), vs, back });
      const corr = Math.min(500, Math.max(100, Math.round((2 * d) / 50) * 50));
      next = watch
        ? tx(L, "next.altWatch", { d: num(L, d) })
        : tx(L, "next.alt", { vs: num(L, corr), d: num(L, d) });
      break;
    }
    case "hdg": {
      const over = /^Overshot/.test(s.text);
      const tgt = over
        ? (/Overshot (\d+)/.exec(s.text)?.[1] ?? "")
        : target !== null
          ? hdg3(target)
          : null;
      title = over
        ? tx(L, "t.overshot", { target: tgt ?? "", d: num(L, d) })
        : tgt
          ? tx(L, "t.hdg", { d: num(L, d), target: tgt })
          : tx(L, "t.hdgAny", { d: num(L, d), k });
      what = over
        ? tx(L, "what.overshot", {
            target: tgt ?? "",
            d: num(L, d),
            s: r0(secs),
          })
        : tx(L, "what.hdg", {
            d: num(L, d),
            target: tgt ?? "—",
            s: r0(secs),
            back,
          });
      const p = traceAt(inp, s.t0);
      const bank = Math.round((p?.ias ?? 90) / 10 + 7);
      next = over
        ? tx(L, "next.overshot", { lead: Math.round(bank / 2), bank })
        : tx(L, "next.hdg", { b: Math.min(r0(d), bank), d: num(L, d) });
      break;
    }
    case "ias": {
      const p = traceAt(inp, s.tWorst);
      title =
        target !== null
          ? tx(L, "t.ias", { d: sgn(L, w), target })
          : tx(L, "t.iasAny", { d: sgn(L, w), k });
      what = tx(L, "what.ias", {
        v: r0(p?.ias ?? (target ?? 0) + w),
        d: sgn(L, w),
        target: target ?? "—",
        s: r0(secs),
        back,
      });
      break;
    }
    case "bank": {
      title = tx(L, "t.bank", { text: s.text.replace(/\s*\(.*\)$/, "") });
      what = tx(L, "what.generic", {
        text: s.text,
        s: r0(secs),
        t0: mmss(s.t0),
        t1: mmss(s.t1),
        back,
      });
      const p = traceAt(inp, s.t0);
      const v = r0(p?.ias ?? 90);
      next = tx(L, "next.bank", { b: Math.round(v / 10 + 7), v });
      break;
    }
    case "vs":
      title = tx(L, "t.vs", { text: `${num(L, d)} ${tx(L, "u.fpm")}` });
      what = tx(L, "what.generic", {
        text: s.text,
        s: r0(secs),
        t0: mmss(s.t0),
        t1: mmss(s.t1),
        back,
      });
      break;
    default:
      title = tx(L, `t.${s.kind}`, { text: s.text, k });
      what = tx(L, "what.generic", {
        text: s.text,
        s: r0(secs),
        t0: mmss(s.t0),
        t1: mmss(s.t1),
        back,
      });
  }
  if (watch) {
    title =
      std.limit && pct !== undefined && pct <= 1
        ? tx(L, "t.watch", { what: title, p: pctNum(pct) })
        : tx(L, "t.watchGrace", { what: title, s: r0(secs) });
  }
  return {
    group,
    standardId: std.id,
    skill: std.skill,
    t0: s.t0,
    t1: s.t1,
    tWorst: s.tWorst,
    title,
    where: whereLine(inp, s.step, s.tWorst, secs),
    stdChip: std.short,
    stdText: watch
      ? pct !== undefined && pct > 1
        ? tx(L, "f.stdExceeded", { p: pctNum(Math.min(pct, 9.99)) })
        : tx(L, "f.stdWatch", {
            p: pct !== undefined ? pctNum(Math.min(pct, 9.99)) : "—",
          })
      : pct !== undefined
        ? tx(L, "f.stdNotMet", { p: pctNum(pct) })
        : tx(L, "f.stdNotMetPlain"),
    whatHappened: what,
    why: tx(L, `why.${s.kind}`),
    next,
    pct,
    value: s.kind === "alt" && target !== null ? Math.round(target + w) : undefined,
  };
}

function measuredWatch(inp: ResultInput, std: Std): Cand | null {
  const L = inp.lang;
  const kind = std.kind;
  if (!kind || (kind !== "alt" && kind !== "hdg" && kind !== "ias"))
    return null;
  const m = inp.measured[kind];
  if (!m || !std.limit) return null;
  const pct = m.maxAbs / std.limit;
  if (pct < 0.7 || pct > 1) return null;
  const signed = Math.abs(m.max) >= Math.abs(m.min) ? m.max : m.min;
  const what =
    kind === "alt"
      ? `${sgn(L, signed)} ft`
      : kind === "hdg"
        ? `${num(L, m.maxAbs)}°`
        : `${sgn(L, signed)} kt`;
  const label = tx(L, `k.${kind}`);
  return {
    group: "watch",
    standardId: std.id,
    skill: std.skill,
    t0: m.t - 2,
    t1: m.t + 2,
    tWorst: m.t,
    title: tx(L, "t.watch", { what: `${label} ${what}`, p: pctNum(pct) }),
    where: whereLine(inp, m.step, m.t, null),
    stdChip: std.short,
    stdText: tx(L, "f.stdWatch", { p: pctNum(pct) }),
    whatHappened: tx(L, "what.watch", {
      d: what,
      t: mmss(m.t),
      lim: kind === "alt" ? "±100 ft" : kind === "hdg" ? "±10°" : "±10 kt",
    }),
    why: tx(L, `why.${kind}`),
    next:
      kind === "alt"
        ? tx(L, "next.altWatch", { d: num(L, m.maxAbs) })
        : tx(L, `next.${kind}`, {
            b: Math.min(r0(m.maxAbs), 15),
            d: num(L, m.maxAbs),
          }),
    pct,
  };
}

function holdFindings(inp: ResultInput, stds: Std[]): Cand[] {
  const L = inp.lang;
  const h = inp.hold!;
  const out: Cand[] = [];
  if (h.crossedAt === null) return out;
  const t0 = h.crossedAt;
  const byId = (id: string) => stds.find((s) => s.id === id)!;
  const entryName = (e: string | null) => (e ? tx(L, `eb.entry.${e}`) : "—");
  const entry = byId("hold.entry");
  if (entry.verdict === "not-met") {
    out.push({
      group: "not-met",
      standardId: entry.id,
      skill: "entry",
      t0,
      t1: t0 + 60,
      tWorst: t0,
      title: tx(L, "t.entry", {
        flown: entryName(h.flownEntry),
        correct: entryName(h.correctEntry),
      }),
      where: tx(L, "where.entry", { fix: h.fix.ident }),
      stdChip: tx(L, "k.entry"),
      stdText: entry.wording,
      whatHappened: tx(L, "what.entry", {
        fix: h.fix.ident,
        crs: hdg3(h.arrivalCourse),
        flown: entryName(h.flownEntry),
        correct: entryName(h.correctEntry),
      }),
      why: tx(L, "why.entry"),
      next: tx(L, "next.entry"),
    });
  }
  // inbound legs, lap by lap
  const ins = h.inboundTimes;
  // lap n's inbound ends at the fix: about t0 + entry + n laps of (2 legs + 2 turns ≈ 4 min with 1-minute legs)
  const lapT = (i: number) => {
    const lapLen = 120 + h.legMin * 120;
    return Math.min(inp.durationSec, t0 + 90 + (i + 1) * lapLen);
  };
  ins.forEach((v, i) => {
    const err = Math.abs(v - 60);
    const last = i === ins.length - 1;
    const pct = err / 15;
    if (pct < 0.7) return;
    // a later lap back near 1:00: the student fixed it within the attempt (a watch item)
    const fixedIdx = ins.slice(i + 1).findIndex((x) => Math.abs(x - 60) / 15 < 0.7);
    if (err <= 15 || !last) {
      out.push(inboundCand(inp, i, v, "watch", pct, lapT(i), !last && fixedIdx >= 0 ? i + 2 + fixedIdx : undefined));
      return;
    }
    out.push(inboundCand(inp, i, v, "not-met", pct, lapT(i)));
  });
  const alt = byId("hold.alt");
  if (
    (alt.verdict === "not-met" && !alt.spans.length) ||
    (alt.verdict === "met" && (alt.pct ?? 0) >= 0.7)
  ) {
    const after = inp.trace.filter((p) => p.t >= t0 + 5);
    const wp = after.reduce(
      (a, p) => (Math.abs(p.alt - h.altFt) > Math.abs(a.alt - h.altFt) ? p : a),
      after[0] ?? inp.trace[0],
    );
    const dv = wp ? wp.alt - h.altFt : h.maxAltDev;
    const watch = alt.verdict === "met";
    out.push({
      group: watch ? "watch" : "not-met",
      standardId: alt.id,
      skill: "alt",
      t0: (wp?.t ?? t0) - 8,
      t1: (wp?.t ?? t0) + 8,
      tWorst: wp?.t ?? t0,
      title: watch
        ? tx(L, "t.holdAltWatch", {
            d: sgn(L, Math.round(dv)),
            p: pctNum(alt.pct ?? 0),
          })
        : tx(L, "t.holdAlt", {
            d: sgn(L, Math.round(dv)),
            alt: num(L, h.altFt),
          }),
      where: [tx(L, "where.hold"), wherePos(inp, wp?.t ?? t0)]
        .filter(Boolean)
        .join(" · "),
      stdChip: alt.short,
      stdText: watch
        ? tx(L, "f.stdWatch", { p: pctNum(alt.pct ?? 0) })
        : tx(L, "f.stdNotMet", { p: pctNum(alt.pct ?? 0) }),
      whatHappened: tx(L, "what.holdAlt", {
        d: num(L, Math.abs(Math.round(dv))),
        alt: num(L, h.altFt),
        s: r0(h.altOutSec),
      }),
      why: tx(L, "why.alt"),
      next: tx(L, "next.holdAlt"),
      pct: alt.pct ?? undefined,
    });
  }
  const pr = stds.find((s) => s.id === "hold.protect");
  if (pr && (pr.verdict === "not-met" || (pr.pct ?? 0) >= 0.7)) {
    // the moment furthest on the non-holding side
    let wp = inp.trace[0];
    let worst = -Infinity;
    for (const p of inp.trace)
      if (p.t >= t0) {
        const y = -holdFrame(h as unknown as HoldDef, p).y;
        if (y > worst) [worst, wp] = [y, p];
      }
    const watch = pr.verdict === "met";
    const d = Math.max(0, h.maxNonHoldingSide);
    out.push({
      group: watch ? "watch" : "not-met",
      standardId: pr.id,
      skill: "protect",
      t0: (wp?.t ?? t0) - 10,
      t1: (wp?.t ?? t0) + 10,
      tWorst: wp?.t ?? t0,
      title: watch
        ? tx(L, "t.watch", {
            what: tx(L, "t.protect", { d: num(L, d, 1) }),
            p: pctNum(pr.pct ?? 0),
          })
        : tx(L, "t.protect", { d: num(L, d, 1) }),
      where: [tx(L, "where.hold"), wherePos(inp, wp?.t ?? t0)]
        .filter(Boolean)
        .join(" · "),
      stdChip: pr.short,
      stdText: watch
        ? tx(L, "f.stdWatch", { p: pctNum(pr.pct ?? 0) })
        : tx(L, "f.stdNotMet", { p: pctNum(pr.pct ?? 0) }),
      whatHappened: tx(L, "what.protect", { d: num(L, d, 1) }),
      why: tx(L, "why.protect"),
      next: tx(L, "next.protect"),
      pct: pr.pct ?? undefined,
    });
  }
  return out;
}

function inboundCand(
  inp: ResultInput,
  i: number,
  v: number,
  group: FindingGroup,
  pct: number,
  t: number,
  fixedOn?: number,
): Cand {
  const L = inp.lang;
  const h = inp.hold!;
  const out = h.outboundTimes[i];
  const nextOut = (out ?? 60) + (60 - v);
  const title = fixedOn
    ? tx(L, "t.inboundFixed", { lap: i + 1, t: mmss(v), next: fixedOn })
    : group === "watch"
      ? tx(L, "t.inboundWatch", { lap: i + 1, t: mmss(v), p: pctNum(pct) })
      : tx(L, "t.inbound", { lap: i + 1, t: mmss(v) });
  return {
    group,
    standardId: "hold.inbound",
    skill: "timing",
    t0: t - Math.min(v, 60),
    t1: t,
    tWorst: t,
    title,
    where: [
      tx(L, "where.lap", { lap: i + 1 }),
      out !== undefined ? tx(L, "where.outbound", { t: mmss(out) }) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    stdChip: tx(L, "w.inbound"),
    stdText:
      group === "watch"
        ? tx(L, "f.stdInboundWatch", { p: pctNum(pct) })
        : tx(L, "f.stdInbound"),
    whatHappened:
      out !== undefined
        ? tx(L, "what.inbound", { lap: i + 1, in: mmss(v), out: mmss(out) })
        : tx(L, "what.inboundNoOut", { lap: i + 1, in: mmss(v) }),
    why: tx(L, "why.inbound"),
    next: tx(L, "next.inbound", {
      in: mmss(v),
      out: mmss(Math.max(30, nextOut)),
    }),
    pct,
  };
}

function acsFindings(
  inp: ResultInput,
  stds: Std[],
  haveControlSpans: boolean,
): Cand[] {
  const L = inp.lang;
  const out: Cand[] = [];
  const ev = (re: RegExp) => inp.events.find((e) => re.test(e.text));
  const endT = inp.durationSec;
  for (const s of stds) {
    if (!s.id.startsWith("acs.")) continue;
    const bad = s.verdict === "not-met";
    const near = !bad && (s.pct ?? 0) >= 0.7 && (s.pct ?? 0) <= 1;
    if (!bad && !near) continue;
    const group: FindingGroup = near
      ? "watch"
      : s.safety
        ? "safety"
        : "not-met";
    const stdText = near
      ? tx(L, "f.stdWatch", { p: pctNum(s.pct ?? 0) })
      : s.pct !== null
        ? tx(L, "f.stdNotMet", { p: pctNum(s.pct) })
        : tx(L, "f.stdNotMetPlain");
    const mk = (
      t: number,
      title: string,
      what: string,
      why: string,
      next: string,
      t1 = t + 6,
    ): Cand => ({
      group,
      standardId: s.id,
      skill: s.skill,
      t0: Math.max(0, t - 4),
      t1: Math.min(endT, t1),
      tWorst: t,
      title,
      where: whereLine(inp, null, t, null) || tx(L, "where.final"),
      stdChip: s.short,
      stdText,
      whatHappened: what,
      why,
      next,
      pct: s.pct ?? undefined,
    });
    const item = inp.acs!.items.find((i) => i.task && s.id === acsIdOf(i.task));
    switch (s.id) {
      case "acs.loc":
      case "acs.gs": {
        const vert = s.id === "acs.gs";
        const pts = inp.trace.filter(
          (p) =>
            (vert ? p.vertDots : p.latDots) !== null &&
            (vert ? p.vertDots : p.latDots) !== undefined,
        );
        const wp = pts.reduce(
          (a, p) =>
            Math.abs((vert ? p.vertDots : p.latDots) ?? 0) >
            Math.abs((vert ? a.vertDots : a.latDots) ?? 0)
              ? p
              : a,
          pts[0] ?? inp.trace[inp.trace.length - 1],
        );
        const d = Math.abs(
          (vert ? wp?.vertDots : wp?.latDots) ?? numIn(item?.actual ?? "") ?? 0,
        );
        const what = s.label.toLowerCase();
        const gsKt = r0(wp?.ias ?? 90);
        out.push(
          mk(
            wp?.t ?? endT,
            tx(L, near ? "t.locWatch" : "t.locFail", { d: num(L, d, 1), what }),
            tx(L, "what.loc", {
              d: num(L, d, 1),
              t: mmss(wp?.t ?? endT),
              alt: wp ? ` · ${num(L, Math.round(wp.alt / 10) * 10)} ft` : "",
            }),
            tx(L, "why.loc"),
            vert
              ? tx(L, "next.gs", {
                  vs: num(L, Math.round((gsKt * 5) / 10) * 10),
                  gs: gsKt,
                })
              : tx(L, "next.loc"),
          ),
        );
        break;
      }
      case "acs.ias": {
        const d = Math.abs(numIn(item?.actual ?? "") ?? 0);
        const ref = numIn((item?.standard ?? "").replace(/^.*\(/, "")) ?? 90;
        const pts = inp.trace.filter(
          (p) => p.latDots !== null && p.latDots !== undefined,
        );
        const wp = pts.reduce(
          (a, p) => (Math.abs(p.ias - ref) > Math.abs(a.ias - ref) ? p : a),
          pts[0] ?? inp.trace[inp.trace.length - 1],
        );
        out.push(
          mk(
            wp?.t ?? endT,
            near
              ? tx(L, "t.watch", {
                  what: tx(L, "t.iasFinal", { d: num(L, d) }),
                  p: pctNum(s.pct ?? 0),
                })
              : tx(L, "t.iasFinal", { d: num(L, d) }),
            tx(L, "what.iasFinal", { d: num(L, d), v: ref }),
            tx(L, "why.iasFinal"),
            tx(L, "next.iasFinal"),
          ),
        );
        break;
      }
      case "acs.pubAlt": {
        const e = ev(/^Descended below \d+ ft before the fix/);
        const floor = e ? Number(/below (\d+)/.exec(e.text)?.[1]) : null;
        const secs = numIn(item?.actual ?? "") ?? 0;
        out.push(
          mk(
            e?.t ?? endT,
            floor
              ? tx(L, "t.pubAlt", { floor: num(L, floor) })
              : tx(L, "t.pubAltAny", { s: secs }),
            floor
              ? tx(L, "what.pubAlt", { floor: num(L, floor), s: secs })
              : tx(L, "what.pubAltAny", { s: secs }),
            tx(L, "why.pubAlt"),
            tx(L, "next.pubAlt"),
            (e?.t ?? endT) + Math.max(4, secs),
          ),
        );
        break;
      }
      case "acs.da": {
        const e = ev(/below minimums without visual/i) ?? ev(/^Minimums/);
        out.push(
          mk(
            e?.t ?? endT,
            tx(L, "t.da"),
            tx(L, "what.da", { s: numIn(item?.actual ?? "") ?? 0 }),
            tx(L, "why.da"),
            tx(L, "next.da"),
          ),
        );
        break;
      }
      case "acs.missed": {
        const e = ev(/No visual references at minimums/);
        out.push(
          mk(
            e?.t ?? endT,
            tx(L, "t.missed"),
            tx(L, "what.missed"),
            tx(L, "why.missed"),
            tx(L, "next.missed"),
          ),
        );
        break;
      }
      case "acs.stable": {
        const e = ev(/^Unstabilized/);
        out.push(
          mk(
            e?.t ?? endT,
            tx(L, "t.stable"),
            tx(L, "what.stable", { s: numIn(item?.actual ?? "") ?? 0 }),
            tx(L, "why.stable"),
            tx(L, "next.stable"),
          ),
        );
        break;
      }
      case "acs.loc2": {
        if (haveControlSpans) break;
        const e = ev(/^Stall warning|overspeed|bank/i);
        out.push(
          mk(
            e?.t ?? endT,
            tx(L, "t.loc2", { what: item?.actual ?? "" }),
            tx(L, "what.loc2", { what: item?.actual ?? "" }),
            tx(L, "why.control"),
            tx(L, "next.control"),
          ),
        );
        break;
      }
      case "acs.landing": {
        const e = ev(/^Touchdown/);
        const act = landingText(L, item?.actual ?? "");
        out.push(
          mk(
            e?.t ?? endT,
            near
              ? tx(L, "t.watch", {
                  what: tx(L, "t.landing", { what: act }),
                  p: pctNum(s.pct ?? 0),
                })
              : tx(L, "t.landing", { what: act }),
            tx(L, "what.landing", { what: e ? landingText(L, e.text) : act }),
            tx(L, "why.landing"),
            tx(L, "next.landing"),
          ),
        );
        break;
      }
      case "acs.hand": {
        const e = ev(/^Autopilot engaged/);
        out.push(
          mk(
            e?.t ?? 0,
            tx(L, "t.hand"),
            tx(L, "what.hand"),
            tx(L, "why.hand"),
            tx(L, "next.hand"),
          ),
        );
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function acsIdOf(task: string): string {
  if (/^Aircraft control/.test(task)) return "acs.crash";
  if (/^Lateral guidance/.test(task)) return "acs.loc";
  if (/^Vertical guidance/.test(task)) return "acs.gs";
  if (/^Airspeed on final/.test(task)) return "acs.ias";
  if (/^Published altitudes/.test(task)) return "acs.pubAlt";
  if (/^Decision altitude|^Minimum descent/.test(task)) return "acs.da";
  if (/^Missed approach/.test(task)) return "acs.missed";
  if (/^Stabilized/.test(task)) return "acs.stable";
  if (/^Loss-of-control/.test(task)) return "acs.loc2";
  if (/^Abnormal/.test(task)) return "acs.abnormal";
  if (/^Landing/.test(task)) return "acs.landing";
  if (/^Hand-flown/.test(task)) return "acs.hand";
  return "acs.other";
}

const GROUP_RANK: Record<FindingGroup, number> = {
  safety: 0,
  "not-met": 1,
  procedure: 1,
  watch: 2,
};

/** numbering (SPEC §2.2): by group (safety, not met, then watch), then by time; at most `max` */
export function numberFindings(c: Cand[], max = 6): Finding[] {
  return [...c]
    .sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || a.t0 - b.t0)
    .slice(0, max)
    .map((f, i) => ({ ...f, n: i + 1 }));
}

// ---------------------------------------------------------------- help

/** help used (never graded): "Set it" setup items, hints, the autopilot where the exercise allows it */
export function helpFrom(inp: ResultInput): HelpUse[] {
  const out: HelpUse[] = [];
  for (const e of inp.events) {
    const m = /^Set up with help: (.+)$/.exec(e.text);
    if (m) out.push({ t: e.t, kind: "setup", text: m[1] });
    else if (inp.ex.allowAp && /^Autopilot engaged/.test(e.text))
      out.push({ t: e.t, kind: "ap", text: e.text });
  }
  for (const h of inp.help ?? []) out.push(h);
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- the report

export function buildReport(inp: ResultInput): ResultReport {
  const L: Lang = inp.lang;
  const rawSpans = inp.spans.length ? inp.spans : spansFromSteps(inp);
  let spans = mergeSpans(rawSpans);
  const crashed0 = inp.endedBy === "crash" || !!inp.crashed;
  // a crash is one safety finding (SPEC §2.3, A2): the deviations of the final dive into the ground, and what was
  // measured during it, belong to the crash, not to the altitude or airspeed tiles
  // Only the last CRASH_DIVE_SEC are absorbed: a deviation that began earlier (an altitude bust a minute and a half
  // before impact) stays graded on its own, cut where the final dive starts, so the student sees the cause.
  let dive: Span | null = null;
  if (crashed0) {
    const w0 = Math.max(0, inp.durationSec - CRASH_DIVE_SEC);
    const atEnd = spans.filter((sp) => sp.t1 >= inp.durationSec - 1.5);
    const fin = atEnd.filter((sp) => sp.t0 >= w0 - 1);
    const cut = atEnd.filter((sp) => !fin.includes(sp));
    if (cut.length)
      spans = spans.map((sp) => (cut.includes(sp) ? cutSpan(inp, sp, w0) : sp));
    if (fin.length || cut.length) {
      const t0 = fin.length ? Math.min(...fin.map((sp) => sp.t0)) : w0;
      dive = fin.find((sp) => sp.kind === "alt") ?? fin[0] ?? null;
      spans = spans.filter((sp) => !fin.includes(sp));
      const measured: ResultInput["measured"] = {};
      for (const k of ["alt", "hdg", "ias"] as const) {
        const m = inp.measured[k];
        if (m && m.t < t0 - 1) measured[k] = m;
      }
      inp = { ...inp, measured };
    }
  }
  // the continuous measure is finer than the check's text: a span that holds the worst measured moment takes it (by
  // time: the tile, the finding and the % of limit then read one number)
  for (const sp of spans) {
    if (sp.kind !== "alt" && sp.kind !== "hdg" && sp.kind !== "ias") continue;
    const m = inp.measured[sp.kind];
    if (m && m.t >= sp.t0 - 2 && m.t <= sp.t1 + 2 && m.maxAbs > Math.abs(sp.worst ?? 0)) {
      sp.worst = Math.sign(sp.worst ?? (m.max >= -m.min ? 1 : -1)) * m.maxAbs;
      sp.tWorst = m.t;
    }
  }
  const crashed = inp.endedBy === "crash" || !!inp.crashed;
  const ungraded = inp.endedBy === "user" && !crashed;
  const graded = !ungraded;
  const breached =
    graded && inp.passed ? new Set<DevKind>() : crashed ? breachedBySpans(inp, spans) : breachedKinds(inp, spans);
  const help = helpFrom(inp);

  // ---- standards
  const hold = inp.hold;
  const holdOn = !!hold && (hold.crossedAt !== null || graded);
  let stds: Std[] = stepStandards(inp, spans, breached, holdOn);
  if (holdOn)
    stds.push(
      ...holdStandards(
        inp,
        spans.filter((s) => s.kind === "alt"),
        breached.has("alt"),
      ),
    );
  stds.push(...acsStandards(inp));
  const allDone = inp.steps.every((s) => s.done) || inp.endedBy === "drill-end";
  if (crashed && !stds.some((s) => s.id === "acs.crash"))
    stds.push({
      id: "acs.crash",
      skill: "control",
      label: tx(L, "k.crash"),
      verdict: "not-met",
      value: "—",
      unit: "",
      wording: tx(L, "w.crash"),
      short: tx(L, "w.crash"),
      pct: null,
      safety: true,
      spans: [],
      limit: null,
    });
  const doneCount = inp.steps.filter((s) => s.done).length;
  if (graded && ((!allDone && !crashed) || !stds.length)) {
    stds.push({
      id: "steps",
      skill: "steps",
      label: tx(L, "k.steps"),
      verdict: allDone ? "met" : "not-met",
      value: `${doneCount}`,
      unit: tx(L, "u.stepsOf", { n: inp.steps.length }),
      wording: tx(L, "w.steps", { k: doneCount, n: inp.steps.length }),
      short: tx(L, "k.steps"),
      pct: null,
      spans: [],
      limit: null,
    });
  }
  // the engine's verdict is authoritative: a fail always names a standard not met
  if (graded && !inp.passed && !stds.some((s) => s.verdict === "not-met"))
    stds.push({
      id: "exercise",
      skill: "exercise",
      label: tx(L, "k.exercise"),
      verdict: "not-met",
      value: "—",
      unit: "",
      wording: inp.reason,
      short: tx(L, "k.exercise"),
      pct: null,
      spans: [],
      limit: null,
    });
  // a pass never shows a standard not met (ACS item already counted in the engine's verdict)
  if (graded && inp.passed)
    stds = stds.map((s) =>
      s.verdict === "not-met" ? { ...s, verdict: "met" } : s,
    );
  stds = orderStandards(stds);
  // a standard not met says "% of limit" in full
  for (const st of stds)
    if (st.verdict === "not-met" && st.pct !== null) {
      const p = pctNum(st.pct);
      st.wording = st.wording.replace(tx(L, "pctShort", { p }), tx(L, "pct", { p }));
    }
  // met by the exercise's time allowance, yet past the ACS limit (airspeed 14 kt off for 5 s against ±10 kt): never
  // shown green as "within standards" — amber, "past the limit briefly, N s of the M s allowed"
  for (const st of stds)
    if (st.verdict === "met" && st.pct !== null && st.pct > 1) {
      st.exceeded = true;
      const secs = r0(st.spans.reduce((a, x) => a + dur(x), 0));
      const ex = tx(L, "w.exceeded", { s: secs, g: r0(inp.allowanceSec) });
      const p = pctNum(st.pct);
      st.wording = `${st.short} · ${tx(L, "pct", { p })} · ${ex}`;
    }

  // ---- findings
  const cands: Cand[] = [];
  const stdOf = (kind: DevKind) =>
    stds.find((s) => s.kind === kind && s.spans.some((x) => x.kind === kind)) ??
    stds.find((s) => s.kind === kind);
  const byKind = new Map<DevKind, Span[]>();
  for (const s of spans) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);
  for (const [kind, list] of byKind) {
    const std = stdOf(kind);
    if (!std) continue;
    const failing = breached.has(kind) || std.verdict === "not-met";
    const sorted = [...list].sort((a, b) => dur(b) - dur(a));
    if (failing) {
      sorted.forEach((s, i) => {
        if (i === 0 || dur(s) >= 1.5)
          cands.push(
            spanFinding(inp, s, std, kind === "control" ? "safety" : "not-met"),
          );
      });
    } else {
      sorted
        .filter((s) => dur(s) >= 1.5)
        .slice(0, 2)
        .forEach((s) =>
          cands.push(
            spanFinding(
              inp,
              s,
              std,
              kind === "control" && graded ? "watch" : "watch",
            ),
          ),
        );
    }
  }
  for (const s of stds)
    if (s.verdict === "met" && !s.spans.length) {
      const w = measuredWatch(inp, s);
      if (w) cands.push(w);
    }
  if (holdOn) cands.push(...holdFindings(inp, stds));
  if (inp.acs) cands.push(...acsFindings(inp, stds, byKind.has("control")));
  if (crashed && !cands.some((c) => c.standardId === "acs.crash")) {
    const e = inp.events.find((x) => /^CRASH/.test(x.text));
    const t = e?.t ?? inp.durationSec;
    const what = crashText(L, (inp.crashed ?? e?.text.replace(/^CRASH — /, "") ?? "").replace(/^Crash: /, ""));
    const pos = wherePos(inp, t);
    const std = stds.find((s) => s.id === "acs.crash")!;
    cands.push({
      group: "safety",
      standardId: std.id,
      skill: "control",
      t0: dive ? dive.t0 : Math.max(0, t - 6),
      t1: t,
      tWorst: t,
      title: tx(L, "t.crash", { what, t: mmss(t) }),
      where:
        [
          inp.steps.length > 1
            ? tx(L, "where.step", {
                k: Math.min(inp.idx, inp.steps.length - 1) + 1,
              })
            : null,
          pos,
        ]
          .filter(Boolean)
          .join(" · ") || tx(L, "where.end"),
      stdChip: std.short,
      stdText: tx(L, "f.stdNotMetPlain"),
      whatHappened:
        tx(L, "what.crash", { what, t: mmss(t), where: pos ? ` · ${pos}` : "" }) +
        (dive ? ` ${tx(L, "what.crashDive", { t0: mmss(dive.t0), vs: vsPart(inp, dive.t0) ? num(L, Math.round(Math.abs(traceAt(inp, dive.t0)?.vs ?? 0) / 10) * 10) : "—" })}` : ""),
      why: tx(L, "why.crash"),
      next: tx(L, "next.crash"),
    });
  }
  const stepsStd = stds.find(
    (s) => s.id === "steps" && s.verdict === "not-met",
  );
  if (stepsStd && !crashed) {
    const k = Math.min(inp.idx, inp.steps.length - 1);
    cands.push({
      group: "not-met",
      standardId: "steps",
      skill: "steps",
      t0: Math.max(0, inp.durationSec - 10),
      t1: inp.durationSec,
      tWorst: inp.durationSec,
      title: tx(L, "t.steps", { k: doneCount, n: inp.steps.length }),
      where: tx(L, "where.end"),
      stdChip: stepsStd.short,
      stdText: stepsStd.wording,
      whatHappened: tx(L, "what.steps", {
        k: k + 1,
        text: inp.steps[k]?.text ?? "",
      }),
      why: tx(L, "why.steps"),
      next: tx(L, "next.steps"),
    });
  }
  const exStd = stds.find((s) => s.id === "exercise");
  if (exStd)
    cands.push({
      group: "not-met",
      standardId: "exercise",
      skill: "exercise",
      t0: Math.max(0, inp.durationSec - 10),
      t1: inp.durationSec,
      tWorst: inp.durationSec,
      title: tx(L, "t.exercise", { reason: inp.reason }),
      where: tx(L, "where.end"),
      stdChip: exStd.short,
      stdText: inp.reason,
      whatHappened: tx(L, "what.exercise", { reason: inp.reason }),
      why: tx(L, "why.exercise"),
      next: tx(L, "next.exercise"),
    });
  // an ended exercise only keeps what is already final (a breach cannot be undone by stopping)
  const kept = ungraded ? cands.filter((c) => c.group !== "watch") : cands;
  const findings = numberFindings(kept);
  for (const s of stds)
    s.findingN = findings.find((f) => f.standardId === s.id)?.n;

  // ---- counts, outcome
  const gradedStds = stds.filter((s) => s.verdict !== "not-reached");
  const metCount = gradedStds.filter((s) => s.verdict === "met").length;
  const outcome: Outcome = ungraded
    ? "ungraded"
    : crashed
      ? "not-met"
      : inp.passed
        ? "met"
        : "not-met";

  // ---- timeline
  const timelineSec = ungraded
    ? Math.max(inp.ex.minutes * 60, inp.durationSec * 1.15)
    : Math.max(1, inp.durationSec);
  const phases = phasesOf(inp, timelineSec, ungraded);
  const fMarks: TimelineMark[] = findings.map((f) => ({
    t: f.t0,
    t1: Math.max(f.t1, f.t0 + 1),
    n: f.n,
    label: f.title,
    kind: f.group === "watch" ? "warn" : "bad",
  }));
  const eMarks = eventMarks(inp, ungraded);
  const hMarks: TimelineMark[] = help.map((x) => ({
    t: x.t,
    label: helpLabel(L, x),
    kind: "warn",
  }));
  const trace = traceOf(inp);

  // ---- tiles
  const tiles: Tile[] = ungraded
    ? ungradedTiles(inp, stds)
    : stds
        .slice(0, 5)
        .map((s) => ({
          kind: "std",
          label: s.label,
          verdict: s.verdict,
          exceeded: s.exceeded,
          value: s.value,
          unit: s.unit,
          sub: s.wording,
          gauge: s.gauge,
        }));
  if (!ungraded && tiles.length < 4) {
    tiles.push({
      kind: "info",
      label: tx(L, "u.steps"),
      value: `${doneCount}`,
      unit: tx(L, "u.stepsOf", { n: inp.steps.length }),
      sub: inp.steps.length === 1 ? inp.steps[0].text : tx(L, "k.steps"),
    });
    if (tiles.length < 4)
      tiles.push({
        kind: "info",
        label: tx(L, "u.flown"),
        value: mmss(inp.durationSec),
        sub: tx(L, "u.flownOf", { m: inp.ex.minutes }),
      });
  }

  // ---- steps (what you flew) and what would have been graded
  const steps: StepRow[] = inp.steps.map((s, i) => {
    const state: StepRow["state"] = s.done
      ? "done"
      : i === inp.idx
        ? "at"
        : "not-reached";
    const t1 = state === "at" ? inp.durationSec : s.t1;
    const helped =
      s.t0 !== undefined &&
      help.some(
        (x) =>
          x.kind === "setup" &&
          x.t >= (s.t0 as number) - 1 &&
          x.t <= (t1 ?? Infinity),
      );
    return {
      text: s.text,
      state,
      t0: state === "not-reached" ? undefined : s.t0,
      t1: state === "not-reached" ? undefined : t1,
      note:
        state === "done" && helped
          ? tx(L, "step.doneHelp")
          : state === "at"
            ? tx(L, "step.atNote")
            : undefined,
    };
  });
  const wouldGrade = ungraded ? wouldGradeOf(inp) : [];

  // ---- headline, summary
  const watch = findings.filter((f) => f.group === "watch");
  const notMet = gradedStds.filter((s) => s.verdict === "not-met");
  // a standard past its limit (within the time allowance) is never "within standards"
  const exceeded = gradedStds.filter((s) => s.exceeded);
  const exText = () =>
    exceeded.length === 1
      ? tx(L, "s.exceeded1", { std: exceeded[0].label })
      : tx(L, "s.exceededN", { n: exceeded.length });
  let headline = "";
  let summary = "";
  if (outcome === "ungraded") {
    const k = Math.min(inp.idx, inp.steps.length - 1) + 1;
    const hd = hold && hold.crossedAt === null ? distToFix(inp) : null;
    headline =
      hd !== null
        ? tx(L, "h.stoppedHold", {
            t: mmss(inp.durationSec),
            d: num(L, hd, 1),
            fix: hold!.fix.ident,
          })
        : tx(L, "h.stopped", {
            t: mmss(inp.durationSec),
            k,
            n: inp.steps.length,
          });
    summary = tx(L, hold ? "s.ungradedHold" : "s.ungraded");
  } else if (outcome === "not-met") {
    headline = findings.find((f) => f.group !== "watch")?.title ?? inp.reason;
    // the sub line reads "2 of 3 standards met · everything else was within standards"; with nothing else
    // graded ("0 of 1") it says nothing more, and a crash says why it is not a score
    summary = crashed
      ? tx(L, "s.crash")
      : notMet.length >= gradedStds.length
        ? ""
        : exceeded.length
          ? exText()
          : notMet.length <= 1
            ? tx(L, "s.notMet1")
            : tx(L, "s.notMetN", { n: notMet.length });
  } else {
    const ha = stds.find((s) => s.id === "hold.alt");
    const altStd = stds.find((s) => s.id === "step.alt");
    if (hold && hold.flownEntry && ha)
      headline = tx(L, "h.metHold", {
        // "Direct entry, …" starts the sentence in EN; FR reads "Entrée directe, …"
        entry: L === "fr" ? tx(L, `eb.entry.${hold.flownEntry}`).toLowerCase() : tx(L, `eb.entry.${hold.flownEntry}`).replace(/^./, (c) => c.toUpperCase()),
        alt: num(L, hold.altFt),
        dev: num(L, Math.round(Math.abs(ha.pct ?? 0) * 100)),
      });
    else if (altStd && altStd.pct !== null)
      headline = tx(L, "h.metAlt", {
        title: exTitleIn(L, inp.ex),
        dev: num(L, Math.round(altStd.pct * 100)),
      });
    else headline = tx(L, "h.met", { title: exTitleIn(L, inp.ex) });
    summary = exceeded.length
      ? exText()
      : watch.length === 0
        ? tx(L, "s.metClean")
        : watch.length === 1
          ? tx(L, "s.metWatch1")
          : tx(L, "s.metWatch", { w: watch.length });
  }

  const tk = taskKey(inp.ex);
  const acsTask = tk ? tx(L, tk) : "";
  // plain words first ("Holding · PA · inbound 270°…"); the ACS code is a reference at the end of the line, not
  // the headline: a first-time PPL / LAPL student does not read FAA codes
  const m = /^(ACS(?: IR\.[IVX]+(?:\.[A-Z])?)?)\s+(.+)$/.exec(acsTask);
  const task = m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : acsTask;
  const taskRef = m ? `FAA ${m[1]}` : "";
  const eb: string[] = [];
  if (task) eb.push(task);
  if (hold)
    eb.push(
      tx(L, "eb.hold", {
        fix: hold.fix.ident,
        inb: hdg3(hold.inbound),
        turn: tx(L, hold.turn === "R" ? "eb.right" : "eb.left"),
        alt: num(L, hold.altFt),
      }),
    );
  else eb.push(exTitleIn(L, inp.ex));
  if (inp.checkride) eb.push(tx(L, "eb.checkride"));
  eb.push(tx(L, inp.ex.allowAp ? "eb.ap" : "eb.hand"));
  if (inp.wx) {
    if (inp.wx.ceilingFt < 10000)
      eb.push(tx(L, "eb.ceiling", { v: num(L, inp.wx.ceilingFt) }));
    if (inp.wx.windKt >= 3)
      eb.push(
        tx(L, "eb.wind", {
          d: hdg3(inp.wx.windDir),
          v: Math.round(inp.wx.windKt),
        }),
      );
  }

  return {
    outcome,
    endedBy: inp.endedBy,
    task,
    taskRef,
    eyebrow: [...eb, ...(taskRef ? [taskRef] : [])].join(" · "),
    headline,
    summary,
    standards: stds.map(({ spans: _s, limit: _l, kind: _k, ...rest }) => rest),
    metCount: ungraded ? 0 : metCount,
    gradedCount: ungraded ? 0 : gradedStds.length,
    tiles,
    findings,
    help,
    phases,
    marks: { findings: fMarks, events: eMarks, help: hMarks },
    trace,
    steps,
    wouldGrade,
    flown: { sec: inp.durationSec, expectedSec: inp.ex.minutes * 60 },
    timelineSec,
    withHelp: outcome === "met" && help.length > 0,
    resumable: ungraded,
  };
}

function distToFix(inp: ResultInput): number | null {
  const h = inp.hold;
  const p = inp.trace[inp.trace.length - 1];
  if (!h || !p) return null;
  return distanceNm(h.fix, p);
}

function helpLabel(L: Lang, x: HelpUse): string {
  if (x.kind === "setup") return tx(L, "help.setupShort");
  if (x.kind === "ap") return tx(L, "help.apShort");
  return x.text;
}

function phasesOf(inp: ResultInput, T: number, ungraded: boolean): Phase[] {
  const out: Phase[] = [];
  const n = inp.steps.length;
  const flownEnd = inp.durationSec;
  let last = 0;
  inp.steps.forEach((s, i) => {
    const reached = s.done || i <= inp.idx;
    if (reached) {
      const t0 = s.t0 ?? last;
      const t1 = s.done ? (s.t1 ?? t0) : flownEnd;
      out.push({ t0, t1: Math.max(t0, t1), label: s.text });
      last = Math.max(last, t1);
    }
  });
  // steps never reached: hatched, shared out over the rest of the expected time
  if (ungraded) {
    const rest = inp.steps
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !s.done && i > inp.idx);
    const w = rest.length ? (T - flownEnd) / rest.length : 0;
    rest.forEach(({ s }, k) =>
      out.push({
        t0: flownEnd + k * w,
        t1: flownEnd + (k + 1) * w,
        label: s.text,
        ghost: true,
      }),
    );
  }
  if (!out.length && n) out.push({ t0: 0, t1: T, label: inp.steps[0].text });
  return out;
}

function eventMarks(inp: ResultInput, ungraded: boolean): TimelineMark[] {
  const L = inp.lang;
  const keep = inp.events.filter((e) => {
    if (
      /^Set up with help|^Training:|^CHECKRIDE:|100 above minimums|^Expected procedure/.test(
        e.text,
      )
    )
      return false;
    if (e.kind === "info")
      return /Crossed FAF|^Passed|Liftoff|Touchdown|Minimums|captured/.test(
        e.text,
      );
    return true;
  });
  const sorted = [...keep]
    .sort(
      (a, b) =>
        (a.kind === "info" ? 1 : 0) - (b.kind === "info" ? 1 : 0) || a.t - b.t,
    )
    .slice(0, 8);
  const out: TimelineMark[] = sorted.map((e) => ({
    t: e.t,
    label: eventLabel(L, e),
    kind: e.kind,
  }));
  if (inp.hold?.crossedAt !== null && inp.hold?.crossedAt !== undefined)
    out.push({
      t: inp.hold.crossedAt,
      label: `${inp.hold.fix.ident} · ${tx(L, "tl.entry")}`,
      kind: "info",
    });
  if (ungraded)
    out.push({
      t: inp.durationSec,
      label: tx(L, "tl.endedHere"),
      kind: "info",
    });
  return out.sort((a, b) => a.t - b.t);
}

function traceOf(inp: ResultInput): ResultReport["trace"] {
  const step = Math.max(1, Math.ceil(inp.trace.length / 600));
  const pts = inp.trace
    .filter((_, i) => i % step === 0)
    .map((p) => ({ t: p.t, v: p.alt }));
  const targets = [
    ...new Set(
      inp.steps
        .map((s) => stepTargetAlt(s.text))
        .filter((v): v is number => v !== null),
    ),
  ];
  const ideal = inp.hold
    ? inp.hold.altFt
    : targets.length === 1
      ? targets[0]
      : undefined;
  const vals = pts.map((p) => p.v);
  let lo = vals.length ? Math.min(...vals) : (ideal ?? 0) - 200;
  let hi = vals.length ? Math.max(...vals) : (ideal ?? 0) + 200;
  if (ideal !== undefined) {
    lo = Math.min(lo, ideal - 150);
    hi = Math.max(hi, ideal + 150);
  }
  const pad = Math.max(40, (hi - lo) * 0.08);
  const span = hi - lo + pad * 2;
  const unit = span > 1500 ? 500 : span > 600 ? 200 : 100;
  return {
    param: "alt",
    points: pts,
    ideal,
    band: ideal !== undefined ? [ideal - 100, ideal + 100] : undefined,
    range: [
      Math.floor((lo - pad) / unit) * unit,
      Math.ceil((hi + pad) / unit) * unit,
    ],
    unit: "ft",
  };
}

function ungradedTiles(inp: ResultInput, stds: Std[]): Tile[] {
  const L = inp.lang;
  const k = Math.min(inp.idx, inp.steps.length - 1) + 1;
  const n = wouldGradeOf(inp).length || stds.length;
  const hold = inp.hold;
  return [
    {
      kind: "info",
      label: tx(L, "u.result"),
      value: "—",
      sub: tx(L, "u.resultSub"),
    },
    {
      kind: "info",
      label: tx(L, "u.flown"),
      value: mmss(inp.durationSec),
      unit: tx(L, "u.flownOf", { m: inp.ex.minutes }),
      sub: tx(L, "u.flownSub"),
    },
    {
      kind: "info",
      label: tx(L, "u.steps"),
      value: `${inp.steps.filter((s) => s.done).length}`,
      unit: tx(L, "u.stepsOf", { n: inp.steps.length }),
      sub: tx(L, "u.stepsSub", { k }),
    },
    {
      kind: "info",
      label: tx(L, "u.graded"),
      value: "0",
      unit: tx(L, "u.gradedOf", { n }),
      sub:
        hold && hold.crossedAt === null
          ? tx(L, "u.gradedSubHold", { fix: hold.fix.ident })
          : tx(L, "u.gradedSub"),
    },
  ];
}

function wouldGradeOf(inp: ResultInput): string[] {
  const L = inp.lang;
  const h = inp.hold;
  if (h)
    return [
      tx(L, "k.entry"),
      tx(L, "w.holdAlt", { alt: num(L, h.altFt) }),
      `${tx(L, "k.inbound")} ${tx(L, "w.inbound")}`,
      tx(L, "w.protect"),
    ];
  return inp.exStandards ?? [];
}

/** the standards a crash leaves breached before its final dive: a kind out of tolerance longer than the allowance,
 *  or longer than a step's own limit */
function breachedBySpans(inp: ResultInput, spans: Span[]): Set<DevKind> {
  const out = new Set<DevKind>();
  const secs = new Map<DevKind, number>();
  for (const s of spans) secs.set(s.kind, (secs.get(s.kind) ?? 0) + dur(s));
  for (const [k, v] of secs) if (v > inp.allowanceSec) out.add(k);
  inp.steps.forEach((st, i) => {
    if (st.limitSec === undefined) return;
    const m = new Map<DevKind, number>();
    for (const s of spans) if (s.step === i) m.set(s.kind, (m.get(s.kind) ?? 0) + dur(s));
    for (const [k, v] of m) if (v > st.limitSec) out.add(k);
  });
  return out;
}

/** the aircraft's crash reason (aircraft.ts) in the language of the sheet */
/** an event of the recorder in the UI language: its own FR text, the crash reason, or the common info events */
export function eventLabel(L: Lang, e: { text: string; fr?: string }): string {
  const c = /^CRASH — (.+)$/.exec(e.text);
  if (c) return tx(L, "tl.crash", { what: crashText(L, c[1]) });
  if (L !== "fr") return e.text;
  if (e.fr) return e.fr;
  const t = e.text;
  const FIXED: Record<string, string> = {
    Touchdown: "Toucher des roues",
    Liftoff: "Décollage",
    "Autopilot engaged": "Pilote automatique engagé",
    "Autopilot disconnected": "Pilote automatique déconnecté",
    "Glideslope captured": "Glide capté",
    "Glidepath captured": "Plan de descente capté",
    "Aircraft stopped on the runway": "Avion arrêté sur la piste",
    "Runway environment in sight at minimums": "Environnement de piste en vue aux minima",
    "No visual references at minimums — missed approach required":
      "Pas de références visuelles aux minima — remise de gaz obligatoire",
    "100 above minimums": "100 au-dessus des minima",
  };
  if (FIXED[t]) return FIXED[t];
  const cap = /^(\w+) captured$/.exec(t);
  if (cap) return `${cap[1]} capté`;
  let m = /^Crossed FAF (\w+) at (\d+) ft$/.exec(t);
  if (m) return `FAF ${m[1]} passé à ${num(L, Number(m[2]))} ft`;
  m = /^Minimums — LAT (-?[\d.]+) dots, VERT (-?[\d.]+) dots, (\d+) KIAS$/.exec(t);
  if (m) return `Minima — LAT ${m[1].replace(".", ",")} pt, VERT ${m[2].replace(".", ",")} pt, ${m[3]} KIAS`;
  m = /^(Liftoff|Stall warning) at (\d+) KIAS$/.exec(t);
  if (m) return `${m[1] === "Liftoff" ? "Décollage" : "Alarme de décrochage"} à ${m[2]} KIAS`;
  if (/^Touchdown RWY /.test(t)) return landingText(L, t);
  return t.replace(/^Passed /, "Passage ");
}

export function crashText(L: Lang, raw: string): string {
  const m = /^Hard impact \((-?\d+) fpm\)/.exec(raw);
  if (m) return tx(L, "crash.hard", { v: num(L, Number(m[1])) });
  if (/^Wing strike/.test(raw)) return tx(L, "crash.wing");
  if (/^Nose-wheel strike/.test(raw)) return tx(L, "crash.nose");
  if (/^Touched down off-airport/.test(raw)) return tx(L, "crash.off");
  return raw;
}

/** the recorder's landing words (ACS row, touchdown event) in the language of the sheet */
export function landingText(L: Lang, raw: string): string {
  const fpm = L === "fr" ? "ft/min" : "fpm";
  const n = (v: string) => num(L, Number(v));
  let m = /^(-?\d+) fpm, (-?\d+) ft past threshold$/.exec(raw);
  if (m) return L === "fr" ? `${n(m[1])} ${fpm}, ${n(m[2])} ft après le seuil` : `${n(m[1])} ${fpm}, ${n(m[2])} ft past the threshold`;
  if (raw === "off runway") return L === "fr" ? "hors piste" : "off the runway";
  m = /^Touchdown RWY (\w+) (\w+) at (\d+) fpm, (\d+) KIAS, (\d+) ft (left|right) of centerline$/.exec(raw);
  if (m)
    return L === "fr"
      ? `Toucher piste ${m[1]} ${m[2]} à ${n(m[3])} ${fpm}, ${m[4]} KIAS, ${n(m[5])} ft à ${m[6] === "left" ? "gauche" : "droite"} de l’axe`
      : `Touchdown RWY ${m[1]} ${m[2]} at ${n(m[3])} ${fpm}, ${m[4]} KIAS, ${n(m[5])} ft ${m[6]} of the centreline`;
  return raw;
}
