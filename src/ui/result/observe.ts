// Watches a LessonRun while it flies (one tick per lesson.update): the violation spans (when each deviation
// started and stopped, its worst value), step start and end times, deviations measured inside the tolerance on the
// steps that hold a target, and the sim-time ↔ lesson-time mapping. Then turns the run into a ResultInput.
// No DOM. This stands in for the engine hooks E2/E5 of the spec until they land in engine.ts.
import type { LessonRun } from "../../train/engine";
import { wrap180 } from "../../nav/geo";
import { classify } from "./report";
import type {
  EndedBy,
  HelpUse,
  Lang,
  Measure,
  ResultInput,
  Span,
  TracePoint,
} from "./types";

/** targets of a step that holds them: S.maintain "Maintain 4000 ft, heading 090, 100 KIAS for 3 min", and any step
 *  that says "maintain 3000 ft" (altitude only) */
export function stepTargets(text: string): {
  alt?: number;
  hdg?: number;
  ias?: number;
} {
  const m = /^Maintain (\d{3,5}) ft, heading (\d{3}), (\d{2,3}) KIAS/.exec(
    text,
  );
  if (m) return { alt: Number(m[1]), hdg: Number(m[2]), ias: Number(m[3]) };
  const a = /maintain (\d{3,5}) ft/i.exec(text);
  return a && !/^(Climb|Descend)/.test(text) ? { alt: Number(a[1]) } : {};
}

export class ResultObserver {
  run: LessonRun | null = null;
  spans: Span[] = [];
  private open: Span | null = null;
  stepT0: number[] = [];
  stepT1: number[] = [];
  measured: ResultInput["measured"] = {};
  /** (sim time, lesson time) pairs: events and samples map onto the lesson clock */
  private clock: [number, number][] = [];
  private lastIdx = 0;
  help: HelpUse[] = [];

  /** call after every lesson.update(dt) */
  tick(run: LessonRun) {
    if (run !== this.run) this.reset(run);
    const t = run.totalT;
    const simT = run.sim.time;
    const last = this.clock[this.clock.length - 1];
    if (!last || t - last[1] >= 2) this.clock.push([simT, t]);
    // the violation of this update belongs to the step that was flying when it was checked
    const step = run.idx !== this.lastIdx ? this.lastIdx : run.idx;
    if (run.idx !== this.lastIdx) {
      for (let i = this.lastIdx; i < run.idx; i++) this.stepT1[i] = t;
      this.stepT0[run.idx] = t;
      this.lastIdx = run.idx;
    }
    const v = run.currentViolation;
    if (v) {
      const c = classify(v);
      if (this.open && this.open.kind === c.kind && this.open.step === step) {
        this.open.t1 = t;
        if (
          c.value !== null &&
          Math.abs(c.value) > Math.abs(this.open.worst ?? 0)
        ) {
          this.open.worst = c.value;
          this.open.text = v;
          this.open.tWorst = t;
        }
      } else {
        this.close(t);
        this.open = {
          step,
          kind: c.kind,
          t0: t,
          t1: t,
          text: v,
          worst: c.value,
          tWorst: t,
        };
      }
    } else this.close(t);
    // deviations inside the tolerance, on steps that hold a target, once the step's grace is over
    const st = run.rt.steps[run.idx];
    if (
      st &&
      !run.checksSuspended &&
      run.stepT > (st.graceSec ?? 8) &&
      !run.finished
    ) {
      const tg = stepTargets(st.text);
      const d = run.sim.ac.data;
      if (tg.alt !== undefined)
        this.measure(
          "alt",
          run.sim.indicatedAlt() - tg.alt,
          tg.alt,
          t,
          run.idx,
        );
      if (tg.hdg !== undefined)
        this.measure("hdg", wrap180(d.hdgTrue - tg.hdg), tg.hdg, t, run.idx);
      if (tg.ias !== undefined)
        this.measure("ias", d.iasKt - tg.ias, tg.ias, t, run.idx);
    }
    if (run.finished) {
      this.close(t);
      this.stepT1[run.idx] ??= t;
    }
  }

  /** help shown outside the recorder events (a hint opened, a coach cue); help seen before the run's first
   *  update belongs to that run, not to the previous one */
  logHelp(h: HelpUse, run?: LessonRun) {
    if (run && run !== this.run) this.reset(run);
    this.help.push(h);
  }

  private measure(
    k: "alt" | "hdg" | "ias",
    dev: number,
    target: number,
    t: number,
    step: number,
  ) {
    const m: Measure = (this.measured[k] ??= {
      maxAbs: 0,
      min: 0,
      max: 0,
      t,
      target,
      step,
    });
    m.min = Math.min(m.min, dev);
    m.max = Math.max(m.max, dev);
    if (Math.abs(dev) > m.maxAbs) {
      m.maxAbs = Math.abs(dev);
      m.t = t;
      m.target = target;
      m.step = step;
    }
  }

  private close(t: number) {
    if (!this.open) return;
    this.open.t1 = Math.max(this.open.t1, t);
    this.spans.push(this.open);
    this.open = null;
  }

  private reset(run: LessonRun) {
    this.run = run;
    this.spans = [];
    this.open = null;
    // a run seen on its first update started at lesson time 0
    const t0 = run.idx === 0 && run.totalT < 0.5 ? 0 : run.totalT;
    this.stepT0 = [t0];
    this.stepT1 = [];
    this.measured = {};
    this.clock = [[run.sim.time - (run.totalT - t0), t0]];
    this.lastIdx = run.idx;
    this.help = [];
  }

  /** lesson time of a sim time */
  toLesson(simT: number): number {
    const c = this.clock;
    if (!c.length) return 0;
    let i = c.length - 1;
    while (i > 0 && c[i][0] > simT) i--;
    return Math.max(0, simT - c[i][0] + c[i][1]);
  }
  /** sim time of a lesson time (replay from a finding) */
  toSim(t: number): number {
    const c = this.clock;
    if (!c.length) return t;
    let i = c.length - 1;
    while (i > 0 && c[i][1] > t) i--;
    return t - c[i][1] + c[i][0];
  }

  get startSim() {
    return this.clock[0]?.[0] ?? 0;
  }
}

export interface InputCtx {
  lang: Lang;
  endedBy: EndedBy;
  stageTitle?: string;
  pathPos?: ResultInput["pathPos"];
  attempt: { n: number; at: number };
  fixes?: ResultInput["fixes"];
  course?: string;
}

/** the ResultInput of a finished run (the observer may be null: spans then come from the step results) */
export function inputFromRun(
  run: LessonRun,
  obs: ResultObserver | null,
  ctx: InputCtx,
): ResultInput {
  const r = run.finished!;
  const sim = run.sim;
  const rec = sim.rec;
  const o = obs && obs.run === run ? obs : null;
  const toL = (simT: number) =>
    o ? o.toLesson(simT) : Math.max(0, simT - (sim.time - run.totalT));
  const start = o ? o.startSim : sim.time - run.totalT;
  const trace: TracePoint[] = rec.samples
    .filter((s) => s.t >= start - 0.5)
    .map((s) => ({
      t: toL(s.t),
      alt: s.alt,
      ias: s.ias,
      hdg: s.hdg,
      vs: s.vs,
      lat: s.lat,
      lon: s.lon,
      latDots: s.latDots,
      vertDots: s.vertDots,
    }));
  const he = run.holdEval;
  const hold = run.rt.hold;
  const w = sim.weather;
  return {
    lang: ctx.lang,
    ex: {
      id: run.ex.id,
      title: run.ex.title,
      stage: run.ex.stage,
      allowAp: run.ex.allowAp,
      minutes: run.ex.minutes,
      plate: run.ex.plate,
    },
    stageTitle: ctx.stageTitle,
    pathPos: ctx.pathPos,
    endedBy: ctx.endedBy,
    passed: r.passed,
    reason: r.reason,
    durationSec: r.durationSec,
    allowanceSec: run.rt.allowanceSec ?? 15,
    steps: r.steps.map((s, i) => ({
      text: s.text,
      done: s.done,
      violationSec: s.violationSec,
      worst: s.worst,
      limitSec: run.rt.steps[i]?.limitSec,
      t0: o?.stepT0[i],
      t1: o?.stepT1[i],
    })),
    idx: Math.min(run.idx, run.rt.steps.length - 1),
    spans: o ? [...o.spans] : [],
    measured: o ? { ...o.measured } : {},
    trace,
    events: rec.events
      .filter((e) => e.t >= start - 0.5)
      .map((e) => ({ t: toL(e.t), kind: e.kind, text: e.text, fr: e.fr })),
    hold:
      hold && he
        ? {
            fix: {
              ident: hold.fix.ident,
              lat: hold.fix.lat,
              lon: hold.fix.lon,
            },
            inbound: hold.inbound,
            turn: hold.turn,
            legMin: hold.legMin,
            altFt: hold.altFt,
            crossedAt: he.crossedAt === null ? null : toL(he.crossedAt),
            arrivalCourse: he.arrivalCourse,
            correctEntry: he.correctEntry,
            flownEntry: he.flownEntry,
            okEntries: [...he.okEntries],
            inboundTimes: [...he.inboundTimes],
            outboundTimes: [...he.outboundTimes],
            laps: he.laps,
            maxAltDev: he.maxAltDev,
            altOutSec: he.altOutSec,
            maxNonHoldingSide: he.maxNonHoldingSide,
            maxHoldingSide: he.maxHoldingSide,
          }
        : undefined,
    acs: r.acs
      ? { result: r.acs.result, items: r.acs.items.map((i) => ({ ...i })) }
      : undefined,
    crashed: sim.ac.s.crashed ?? null,
    handFlown: !run.ex.allowAp,
    checkride: sim.assess.mode === "checkride",
    attempt: ctx.attempt,
    course: ctx.course,
    fixes: ctx.fixes,
    help: o ? [...o.help] : [],
    wx: { ceilingFt: w.ceilingFt, windDir: w.windDir, windKt: w.windKt },
    exStandards: run.ex.standards,
  };
}
