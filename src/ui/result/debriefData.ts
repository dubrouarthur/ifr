// The debrief replay's data (SPEC §2.4, §4.2, §7): pure, no DOM. One model for an exercise (from the result sheet's
// ResultReport, re-timed onto the replay clock) and for a free flight (from the recorder's FAA ACS evaluation), so
// the debrief grades exercises as well as approaches and never says "not enough flight to grade" for a lesson.
//
//   lanes      deviations · failures · procedure items · help & cues · ATC, from the findings, the help log and the
//              recorder's events (classified by their text until the recorder logs a lane, SPEC R3)
//   moments    every finding, then (with "All events") every lane item, for the moment card's ‹ › paging
//   standards  the ACS table rows with the tolerance used (% of limit)
//   state      the aircraft state table at the playhead, with out-of-standard values flagged
//   csv        flight data and events (SPEC §7)
//
// Every time here is seconds from the start of the flight record (the ClipPlayer's clock).
import type {
  AcsReport,
  FlightEvent,
  Sample,
  Phase as RecPhase,
} from "../../sim/recorder";
import { eventLabel } from "./report";
import { mmss, num, tx } from "./i18n";
import { dx } from "./debriefStrings";
import type {
  Finding,
  HelpUse,
  Lang,
  NextPlan,
  Outcome,
  Phase,
  ResultInput,
  ResultReport,
} from "./types";

export type LaneKey = "deviation" | "failure" | "procedure" | "help" | "atc";
export const LANES: LaneKey[] = [
  "deviation",
  "failure",
  "procedure",
  "help",
  "atc",
];

export interface LaneItem {
  t: number;
  t1?: number;
  /** finding pin number (deviations) */
  n?: number;
  label: string;
  kind: "bad" | "warn" | "good" | "info";
}

export interface StdRow {
  id: string;
  label: string;
  sub?: string;
  tol: string;
  flew: string;
  verdict: "met" | "not-met" | "not-reached";
  /** met by the time allowance, but past the limit (a warning, never a green check) */
  exceeded?: boolean;
  /** ratio of the limit used (1.73 = 173 %) */
  pct: number | null;
  n?: number;
  safety?: boolean;
}

export interface Kpi {
  label: string;
  value: string;
  unit: string;
  sub: string;
  bad: boolean;
}

export interface Moment {
  kind: "finding" | "event";
  t0: number;
  t1: number;
  /** where the playhead goes (the worst moment of a finding) */
  t: number;
  lane: LaneKey;
  label: string;
  n?: number;
  finding?: Finding;
  item?: LaneItem;
}

export interface DebriefModel {
  source: "exercise" | "flight";
  lang: Lang;
  title: string;
  meta: string;
  /** "ACS IR.VI.B precision approach" (the eyebrow of the result) */
  task: string;
  outcome: Outcome;
  metCount: number;
  gradedCount: number;
  withHelp: boolean;
  /** an ungraded flight: why (in progress, not enough of an approach flown, ended early) */
  note?: string;
  durS: number;
  standards: StdRow[];
  findings: Finding[];
  help: HelpUse[];
  phases: Phase[];
  lanes: Record<LaneKey, LaneItem[]>;
  kpis: Kpi[];
  /** the governing trace: the target and its band (exercise), for the lanes' mini trace and the profile */
  ideal?: number;
  band?: [number, number];
  /** ungraded: the standards that would have applied, and from where */
  wouldGrade?: string[];
  plan?: NextPlan;
  attemptId: string;
}

// ---------------------------------------------------------------- event lanes

/** which lane a recorder event belongs to (null: not shown — session line, flight plan edits) */
export function laneOf(e: {
  text: string;
  kind: FlightEvent["kind"];
}): LaneKey | null {
  const s = e.text;
  if (/^(Training|CHECKRIDE)\b|^FMS /.test(s)) return null;
  if (
    /^(FAILURE|Restored)\b|^Instructor: (failed|restored)\b|fire|Engine (failure|out|stopped)|vacuum|alternator|pitot|static port/i.test(
      s,
    )
  )
    return "failure";
  if (/^ATC\b|ATC transmission|^(Tower|Approach|Center|Ground):/i.test(s))
    return "atc";
  if (/^Set up with help|^Instructor\b|^Hint\b|^Coach\b/i.test(s))
    return "help";
  if (
    /^CRASH|Stall warning|No visual references|below (minimums|the)|unstable|overspeed|Steep bank/i.test(
      s,
    )
  )
    return "deviation";
  if (e.kind === "bad") return "deviation";
  return "procedure";
}

function helpText(L: Lang, x: HelpUse): string {
  if (x.kind === "setup") return tx(L, "help.setupLine", { what: x.text });
  if (x.kind === "ap") return tx(L, "help.apLine");
  return x.text;
}

/** lane items from the recorder events (clip time). `skip`: lanes another source fills (the report's findings and help) */
export function eventLanes(
  L: Lang,
  events: FlightEvent[],
  durS: number,
  skip: LaneKey[] = [],
): Record<LaneKey, LaneItem[]> {
  const out: Record<LaneKey, LaneItem[]> = {
    deviation: [],
    failure: [],
    procedure: [],
    help: [],
    atc: [],
  };
  for (const e of events) {
    const ln = laneOf(e);
    if (!ln || skip.includes(ln) || e.t < -0.5 || e.t > durS + 0.5) continue;
    out[ln].push({
      t: Math.max(0, Math.min(durS, e.t)),
      label: eventLabel(L, e),
      kind: e.kind,
    });
  }
  return out;
}

// ---------------------------------------------------------------- standards

/** the tolerance used of a free-flight ACS row: the flown number against the standard's number, same unit */
export function acsPct(standard: string, actual: string): number | null {
  const U = "(dots?|ft|kt|KIAS|fpm|°)";
  const lim = [
    ...standard.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`, "g")),
  ].pop();
  if (!lim) return null;
  const unit = lim[2].replace(/s$/, "");
  const v = new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${U}`).exec(
    actual.replace(/,/g, ""),
  );
  const L = Number(lim[1]);
  if (!v || v[2].replace(/s$/, "") !== unit || !(L > 0)) return null;
  return Math.abs(Number(v[1])) / L;
}

/** KPIs of the top bar: not met first, then the closest to the limit (at most `max`) */
export function kpisOf(rows: StdRow[], max = 3): Kpi[] {
  // a KPI is a measured number ("2,227 ft", "±8 kt", "max 0.99 dots"); words ("Touched down off-airport") stay in
  // the table and the moment card
  const graded = rows.filter(
    (r) => r.verdict !== "not-reached" && /^(max\s+)?[−\-+±]?\d/.test(r.flew),
  );
  const rank = [...graded].sort(
    (a, b) =>
      Number(b.verdict === "not-met") - Number(a.verdict === "not-met") ||
      (b.pct ?? -1) - (a.pct ?? -1),
  );
  return rank.slice(0, max).map((r) => {
    const m = /^(?:max\s+)?([−\-+±]?[\d.,:\u202f\u00a0 ]*\d)\s*(.*)$/.exec(r.flew);
    return {
      label: r.label,
      value: m ? m[1].trim() : r.flew,
      unit: m ? m[2] : "",
      sub: r.tol,
      bad: r.verdict === "not-met",
    };
  });
}

// ---------------------------------------------------------------- phases of a free flight

const PHASE_EN: Record<RecPhase, string> = {
  ground: "Ground",
  departure: "Departure",
  enroute: "En route",
  initial: "Initial approach",
  final: "Final",
  missed: "Missed approach",
  landed: "Landed",
};
const PHASE_FR: Record<RecPhase, string> = {
  ground: "Sol",
  departure: "Départ",
  enroute: "En route",
  initial: "Approche initiale",
  final: "Finale",
  missed: "Remise de gaz",
  landed: "Posé",
};

/** contiguous phases of the recorder samples (clip time), short flickers merged into their neighbour */
export function phasesOf(
  L: Lang,
  samples: { t: number; phase: RecPhase }[],
): Phase[] {
  const out: (Phase & { k: RecPhase })[] = [];
  for (const s of samples) {
    const last = out[out.length - 1];
    if (last && last.k === s.phase) last.t1 = s.t;
    else {
      if (last) last.t1 = s.t;
      out.push({
        t0: s.t,
        t1: s.t,
        k: s.phase,
        label: (L === "fr" ? PHASE_FR : PHASE_EN)[s.phase],
      });
    }
  }
  const merged: (Phase & { k: RecPhase })[] = [];
  for (const p of out) {
    const last = merged[merged.length - 1];
    if (last && (p.t1 - p.t0 < 8 || last.k === p.k)) last.t1 = p.t1;
    else merged.push({ ...p });
  }
  return merged.map(({ t0, t1, label }) => ({ t0, t1, label }));
}

// ---------------------------------------------------------------- the model: an exercise

export interface ReportSource {
  lang: Lang;
  rep: ResultReport;
  inp: ResultInput;
  /** lesson time → clip time */
  toClip: (lessonT: number) => number;
  durS: number;
  /** the recorder events, clip time */
  events: FlightEvent[];
  attemptId: string;
  dateMs: number;
  student?: string;
  plan?: NextPlan;
}

export function fromReport(s: ReportSource): DebriefModel {
  const { rep, inp, lang: L, durS } = s;
  const c = (t: number) => Math.max(0, Math.min(durS, s.toClip(t)));
  const findings: Finding[] = rep.findings.map((f) => ({
    ...f,
    t0: c(f.t0),
    t1: c(f.t1),
    tWorst: c(f.tWorst),
  }));
  const help: HelpUse[] = rep.help.map((x) => ({ ...x, t: c(x.t) }));
  const lanes = eventLanes(L, s.events, durS, ["deviation", "help"]);
  lanes.deviation = findings.map((f) => ({
    t: f.t0,
    t1: f.t1,
    n: f.n,
    label: f.title,
    kind: f.group === "watch" ? "warn" : "bad",
  }));
  lanes.help = help.map((x) => ({
    t: x.t,
    label: helpText(L, x),
    kind: "warn",
  }));
  const phases = rep.phases
    .filter((p) => !p.ghost)
    .map((p) => ({ ...p, t0: c(p.t0), t1: c(p.t1) }))
    .filter((p) => p.t1 > p.t0 + 0.5);
  const standards: StdRow[] = rep.standards.map((x) => ({
    id: x.id,
    label: x.label,
    tol: x.short && x.short !== x.label ? x.short : x.wording.replace(/ · \d+ %.*$/, "") || x.short,
    flew:
      x.verdict === "not-reached"
        ? dx(L, "t.notFlown")
        : x.value === "—"
          ? "—"
          : `${x.value}${x.unit ? ` ${x.unit}` : ""}`,
    verdict: x.verdict,
    exceeded: x.exceeded,
    pct: x.pct,
    n: x.findingN,
    safety: x.safety,
  }));
  const date = new Intl.DateTimeFormat(L === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(s.dateMs);
  const meta = [
    date,
    s.student || null,
    tx(L, "sheet.attempt", { n: inp.attempt.n, date: "" }).replace(/ · $/, ""),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    source: "exercise",
    lang: L,
    title: inp.ex.title,
    meta,
    task: rep.eyebrow.split(" · ")[0] ?? "",
    outcome: rep.outcome,
    metCount: rep.metCount,
    gradedCount: rep.gradedCount,
    withHelp: rep.withHelp,
    note:
      rep.outcome === "ungraded" ? rep.summary.replace(/\*\*/g, "") : undefined,
    durS,
    standards,
    findings,
    help,
    phases,
    lanes,
    kpis: kpisOf(standards),
    ideal: rep.trace.ideal,
    band: rep.trace.band,
    plan: s.plan,
    wouldGrade: rep.outcome === "ungraded" && rep.wouldGrade.length ? rep.wouldGrade : undefined,
    attemptId: s.attemptId,
  };
}

// ---------------------------------------------------------------- the model: a free flight

export interface FlightSource {
  lang: Lang;
  /** recorder samples and events, clip time */
  samples: { t: number; phase: RecPhase }[];
  events: FlightEvent[];
  acs: AcsReport;
  durS: number;
  title: string;
  /** an exercise still flying: never graded here (its own result grades it when it ends) */
  inProgress?: boolean;
  attemptId: string;
  dateMs: number;
  student?: string;
  /** "Checkride" / "Training" */
  mode?: string;
}

export function fromFlight(s: FlightSource): DebriefModel {
  const L = s.lang;
  const standards: StdRow[] = s.acs.items.map((i, k) => ({
    id: `acs.${k}`,
    label: i.task,
    tol: i.standard,
    flew: i.result === "N/A" ? dx(L, "t.notFlown") : i.actual,
    verdict:
      i.result === "PASS"
        ? "met"
        : i.result === "FAIL"
          ? "not-met"
          : "not-reached",
    pct: i.result === "N/A" ? null : acsPct(i.standard, i.actual),
    safety: /accident|Aircraft control/i.test(i.task),
  }));
  const lanes = eventLanes(L, s.events, s.durS);
  // warnings and faults are the moments of a free flight: numbered like findings
  lanes.deviation = lanes.deviation.map((x, i) => ({ ...x, n: i + 1 }));
  const graded = standards.filter((r) => r.verdict !== "not-reached");
  const metCount = graded.filter((r) => r.verdict === "met").length;
  const outcome: Outcome = s.inProgress
    ? "ungraded"
    : s.acs.result === "PASS"
      ? "met"
      : s.acs.result === "FAIL"
        ? "not-met"
        : "ungraded";
  const date = new Intl.DateTimeFormat(L === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(s.dateMs);
  return {
    source: "flight",
    lang: L,
    title: s.title,
    meta: [date, s.student || null, s.mode || null].filter(Boolean).join(" · "),
    task: s.inProgress ? dx(L, "d.inProgress") : "FAA-S-ACS-8C · IR.VI",
    outcome,
    metCount,
    gradedCount: graded.length,
    withHelp: lanes.help.length > 0,
    note: s.inProgress
      ? dx(L, "d.inProgressNote")
      : outcome === "ungraded"
        ? dx(L, "d.flightUngraded")
        : undefined,
    durS: s.durS,
    standards: s.inProgress ? [] : standards,
    findings: [],
    help: lanes.help.map((x) => ({
      t: x.t,
      kind: "instructor",
      text: x.label,
    })),
    phases: phasesOf(L, s.samples),
    lanes,
    kpis: s.inProgress ? [] : kpisOf(standards),
    attemptId: s.attemptId,
  };
}

// ---------------------------------------------------------------- moments

/** the moment card's list: the findings (or, in a free flight, the numbered warnings), then every lane item when
 *  "All events" is on, in time order */
export function momentsOf(m: DebriefModel, allEvents: boolean): Moment[] {
  const out: Moment[] = m.findings.map((f) => ({
    kind: "finding",
    t0: f.t0,
    t1: f.t1,
    t: f.tWorst,
    lane: "deviation",
    label: f.title,
    n: f.n,
    finding: f,
  }));
  if (m.source === "flight")
    for (const x of m.lanes.deviation)
      out.push({
        kind: "event",
        t0: x.t,
        t1: x.t1 ?? x.t,
        t: x.t,
        lane: "deviation",
        label: x.label,
        n: x.n,
        item: x,
      });
  if (allEvents) {
    const ev: Moment[] = [];
    for (const ln of LANES) {
      if (ln === "deviation") continue;
      for (const x of m.lanes[ln])
        ev.push({
          kind: "event",
          t0: x.t,
          t1: x.t1 ?? x.t,
          t: x.t,
          lane: ln,
          label: x.label,
          item: x,
        });
    }
    ev.sort((a, b) => a.t - b.t);
    out.push(...ev);
  }
  return out;
}

/** the moment under the playhead (a finding's span, with 3 s either side), or -1 */
export function momentAt(list: Moment[], t: number): number {
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (x.kind !== "finding" && !(x.lane === "deviation")) continue;
    if (t >= x.t0 - 3 && t <= x.t1 + 3) {
      if (best < 0 || x.t1 - x.t0 < list[best].t1 - list[best].t0) best = i;
    }
  }
  return best;
}

/** the previous / next lane item from t (J / K, the transport's ⏮ ⏭) */
export function neighbourTime(
  m: DebriefModel,
  t: number,
  dir: 1 | -1,
  lanes: LaneKey[] = LANES,
): number | null {
  const ts = lanes
    .flatMap((ln) => m.lanes[ln].map((x) => x.t))
    .concat(m.findings.map((f) => f.t0))
    .sort((a, b) => a - b);
  if (dir > 0) return ts.find((x) => x > t + 0.5) ?? null;
  for (let i = ts.length - 1; i >= 0; i--) if (ts[i] < t - 0.5) return ts[i];
  return null;
}

// ---------------------------------------------------------------- the state at the playhead

export interface SampleAt {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  ias: number;
  vs: number;
  hdg: number;
  bank: number;
  pitch: number;
  latDots: number | null;
  vertDots: number | null;
  ap: boolean;
  agl: number;
}

/** the recorded sample at t, interpolated (2 Hz recorder) */
export function sampleAt(
  S: Sample[] | (Omit<Sample, "t"> & { t: number })[],
  t: number,
): SampleAt | null {
  if (!S.length) return null;
  let lo = 0;
  let hi = S.length - 1;
  if (t <= S[0].t) hi = 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = S[lo];
  const b = S[Math.min(S.length - 1, lo + 1)];
  const k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const l = (x: number, y: number) => x + (y - x) * k;
  const ln = (x: number | null, y: number | null) =>
    x === null || y === null ? (k < 0.5 ? x : y) : l(x, y);
  let dh = b.hdg - a.hdg;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return {
    t,
    lat: l(a.lat, b.lat),
    lon: l(a.lon, b.lon),
    alt: l(a.alt, b.alt),
    ias: l(a.ias, b.ias),
    vs: l(a.vs, b.vs),
    hdg: (((a.hdg + dh * k) % 360) + 360) % 360,
    bank: l(a.bank, b.bank),
    pitch: l(a.pitch, b.pitch),
    latDots: ln(a.latDots, b.latDots),
    vertDots: ln(a.vertDots, b.vertDots),
    ap: k < 0.5 ? a.ap : b.ap,
    agl: l(a.agl, b.agl),
  };
}

export interface StateView {
  alt: number;
  /** the altitude the exercise or segment asks for, and the band around it (± ft) */
  target?: { v: number; band: number };
  vs: number;
  ias: number;
  hdg: number;
  trk?: number;
  latDots: number | null;
  vertDots: number | null;
  /** the CDI source is a localizer (LOC / ILS) */
  loc?: boolean;
  /** the tracking standard applies here (FAF to DA: not on the ground, not below 200 ft AGL) */
  gradeDots?: boolean;
  altSel?: number | null;
  rpm?: number | null;
  ap: boolean;
  apModes?: string;
}

export interface StateRow {
  key: string;
  label: string;
  value: string;
  bad?: boolean;
}

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");

/** the aircraft state table (SPEC §2.4): values beyond the standard in red — altitude ±100 ft of the target, the
 *  CDI and glideslope beyond ¾ scale (1.5 dots; FAA-S-ACS-8C IR.VI.A/B "¾-scale deflection") */
export function stateRows(L: Lang, v: StateView): StateRow[] {
  const rows: StateRow[] = [];
  rows.push({
    key: "alt",
    label: dx(L, "s.alt"),
    value: `${num(L, Math.round(v.alt / 10) * 10)} ft`,
    bad: v.target ? Math.abs(v.alt - v.target.v) > v.target.band : false,
  });
  if (v.target) {
    const d = Math.round(v.alt - v.target.v);
    rows.push({
      key: "dev",
      label: dx(L, "s.vsTarget", { v: num(L, v.target.v) }),
      value: `${d > 0 ? "+" : ""}${num(L, d)} ft`,
      bad: Math.abs(d) > v.target.band,
    });
  }
  rows.push({
    key: "vs",
    label: dx(L, "s.vs"),
    value: `${num(L, Math.round(v.vs / 10) * 10)} fpm`,
  });
  rows.push({
    key: "ias",
    label: dx(L, "s.ias"),
    value: `${Math.round(v.ias)} kt`,
  });
  rows.push({
    key: "hdg",
    label: dx(L, "s.hdg"),
    value:
      v.trk === undefined
        ? `${pad3(v.hdg)}°`
        : `${pad3(v.hdg)}° · ${pad3(v.trk)}°`,
  });
  const dots = (x: number | null, lat: boolean) => {
    if (x === null) return dx(L, "s.noSignal");
    const a = Math.abs(x);
    if (a < 0.1) return dx(L, "s.centred");
    const val = num(L, a, 1);
    // recorder sign: latDots > 0 = needle right of centre (fly right: the course is to the right); vertDots > 0 = fly up
    return lat
      ? dx(L, x > 0 ? "s.dotR" : "s.dotL", { v: val })
      : dx(L, x > 0 ? "s.dotLo" : "s.dotHi", { v: val });
  };
  rows.push({
    key: "lat",
    label: dx(L, v.loc ? "s.loc" : "s.cdi"),
    value: dots(v.latDots, true),
    bad: v.gradeDots !== false && v.latDots !== null && Math.abs(v.latDots) > 1.5,
  });
  if (v.vertDots !== null)
    rows.push({
      key: "gs",
      label: dx(L, "s.gs"),
      value: dots(v.vertDots, false),
      bad: v.gradeDots !== false && Math.abs(v.vertDots) > 1.5,
    });
  if (v.altSel !== undefined && v.altSel !== null)
    rows.push({
      key: "sel",
      label: dx(L, "s.altSel"),
      value: `${num(L, v.altSel)} ft`,
    });
  const pw = v.rpm ? `${num(L, Math.round(v.rpm / 10) * 10)} RPM` : "—";
  rows.push({
    key: "pwr",
    label: dx(L, "s.power"),
    value: `${pw} · ${v.ap ? (v.apModes ? `AP ${v.apModes}` : dx(L, "s.on")) : dx(L, "s.off")}`,
  });
  return rows;
}

// ---------------------------------------------------------------- export (SPEC §7)

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** flight data CSV: one row per sample (clip time) */
export function samplesCsv(S: Sample[], t0: number): string {
  const head =
    "t,lat,lon,alt_ft,agl_ft,ias_kt,vs_fpm,hdg,bank,pitch,lat_dots,vert_dots,ap,phase";
  const rows = S.map((s) =>
    [
      (s.t - t0).toFixed(1),
      s.lat.toFixed(6),
      s.lon.toFixed(6),
      Math.round(s.alt),
      Math.round(s.agl),
      Math.round(s.ias),
      Math.round(s.vs),
      Math.round(s.hdg),
      s.bank.toFixed(1),
      s.pitch.toFixed(1),
      s.latDots === null ? "" : s.latDots.toFixed(2),
      s.vertDots === null ? "" : s.vertDots.toFixed(2),
      s.ap ? 1 : 0,
      s.phase,
    ].join(","),
  );
  return [head, ...rows].join("\n");
}

/** events CSV: one row per lane item, findings with their standard and % of limit */
export function eventsCsv(m: DebriefModel): string {
  const head = "t,t1,lane,n,text,standard_id,pct_of_limit";
  const rows: string[] = [];
  for (const ln of LANES)
    for (const x of m.lanes[ln]) {
      const f =
        x.n !== undefined ? m.findings.find((q) => q.n === x.n) : undefined;
      rows.push(
        [
          x.t.toFixed(1),
          x.t1 !== undefined ? x.t1.toFixed(1) : "",
          ln,
          x.n ?? "",
          csvCell(x.label),
          f?.standardId ?? "",
          f?.pct !== undefined ? Math.round(f.pct * 100) : "",
        ].join(","),
      );
    }
  rows.sort((a, b) => parseFloat(a) - parseFloat(b));
  return [head, ...rows].join("\n");
}

/** "5:03 / 11:10" */
export const clockText = (t: number, dur: number) =>
  `${mmss(t)} / ${mmss(dur)}`;
