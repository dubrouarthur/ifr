// "Practise next": at most 3 ranked rows after a result, row 1 being the primary action (SPEC §5). Pure and
// deterministic: the report, the exercise and what the app can launch (next exercise, a simpler exercise for the
// skill, the hold-entry drill) in, the plan out.
import { mmss, tx } from "./i18n";
import type {
  Finding,
  Lang,
  NextItem,
  NextPlan,
  ResultReport,
  StopReason,
} from "./types";

export interface PractiseCtx {
  lang: Lang;
  ex: { id: string; title: string; minutes: number };
  /** the next exercise in the path (or in the curriculum) */
  next?: { id: string; title: string; minutes: number } | null;
  /** the exercise is a hold (the hold-entry drill applies) */
  hold: boolean;
  /** "Why did you stop?" (ended early only) */
  stopReason?: StopReason | null;
  /** a simpler exercise that trains a skill (curriculum map skill → exercise), excluding the current one */
  simpler?: (
    skill: string,
  ) => { id: string; title: string; minutes: number } | null;
}

/** skill → the exercise that trains it on its own (curriculum ids, src/train/curriculum.ts). The sheet offers it as
 *  "a simpler exercise" only when it comes before the current one in the curriculum. Aircraft control goes back to
 *  basic attitude flying (IFH ch. 6; unusual-attitude recovery, ACS IR.IV.B, comes later in Stage 1); the
 *  glideslope to the hand-flown ILS (a coupled approach does not train tracking it by hand). */
export const SKILL_LESSON: Record<string, string> = {
  alt: "bai-sl",
  hdg: "bai-sl",
  ias: "bai-sl",
  bank: "bai-turns",
  vs: "bai-climb",
  track: "nav-vor-in",
  control: "bai-sl",
  timing: "hold-direct",
  protect: "hold-direct",
  loc: "int-loc30",
  gs: "app-ils-hand",
  stepdown: "app-loc",
  da: "ma-da",
  missed: "ma-da",
  stable: "app-ils-hand",
};

/** the finding practise next works on: safety, then not met by % of limit, then time (SPEC §5.1.2) */
export function topFinding(findings: Finding[]): Finding | null {
  const rank = (f: Finding) =>
    f.group === "safety"
      ? 0
      : f.group === "not-met" || f.group === "procedure"
        ? 1
        : 2;
  return (
    [...findings].sort(
      (a, b) => rank(a) - rank(b) || (b.pct ?? 0) - (a.pct ?? 0) || a.t0 - b.t0,
    )[0] ?? null
  );
}

const skillName = (l: Lang, skill: string) => tx(l, `sk.${skill}`);

export function practiseNext(rep: ResultReport, c: PractiseCtx): NextPlan {
  const L = c.lang;
  const m = c.ex.minutes;
  const items: Omit<NextItem, "primary">[] = [];
  const retry = (label: string, sub: string): Omit<NextItem, "primary"> => ({
    kind: "retry",
    label,
    sub,
    action: tx(L, "pn.act.fly"),
  });
  const brief = (lost = false): Omit<NextItem, "primary"> => ({
    kind: "brief",
    label: tx(L, lost ? "pn.briefLost" : "pn.brief"),
    sub: tx(L, "pn.briefSub", { title: c.ex.title }),
    action: tx(L, "pn.act.brief"),
    ref: c.ex.id,
  });
  const drill = (): Omit<NextItem, "primary"> => ({
    kind: "drill",
    label: tx(L, "pn.drill"),
    sub: tx(L, "pn.drillSub"),
    action: tx(L, "pn.act.start"),
  });
  const nextLesson = (): Omit<NextItem, "primary"> | null =>
    c.next
      ? {
          kind: "next-lesson",
          label: tx(L, "pn.next", { title: c.next.title }),
          sub: tx(L, "pn.nextSub", { m: c.next.minutes }),
          action: tx(L, "pn.act.brief"),
          ref: c.next.id,
        }
      : null;
  const simpler = (skill: string): Omit<NextItem, "primary"> | null => {
    if (skill === "entry" && c.hold) return drill();
    const s = c.simpler?.(skill);
    return s && s.id !== c.ex.id
      ? {
          kind: "lesson",
          label: s.title,
          sub: tx(L, "pn.lessonSub", {
            skill: skillName(L, skill),
            m: s.minutes,
          }),
          action: tx(L, "pn.act.brief"),
          ref: s.id,
        }
      : null;
  };
  let why = { lead: "", text: "" };

  if (rep.outcome === "ungraded") {
    const r = c.stopReason ?? null;
    const resume: Omit<NextItem, "primary"> = {
      kind: "resume",
      label: tx(L, "pn.resume", { t: mmss(rep.flown.sec) }),
      sub: tx(L, "pn.resumeSub"),
      action: tx(L, "pn.act.resume"),
    };
    const restart: Omit<NextItem, "primary"> = {
      kind: "restart",
      label: tx(L, "pn.restart"),
      sub: tx(L, "pn.restartSub", { m }),
      action: tx(L, "pn.act.fly"),
    };
    if (r === "lost") {
      items.push(restart, brief(true));
      if (c.hold) items.push(drill());
      why = { lead: tx(L, "pn.why.lost"), text: tx(L, "pn.why.lostText") };
    } else if (r === "restart-entry") {
      items.push(restart);
      if (c.hold) items.push(drill());
      items.push(brief());
      why = c.hold
        ? { lead: tx(L, "pn.why.entry"), text: tx(L, "pn.why.entryText") }
        : { lead: tx(L, "pn.why.restart"), text: tx(L, "pn.why.restartText") };
    } else if (r === "broken") {
      items.push(restart);
      if (rep.resumable) items.push(resume);
      why = { lead: tx(L, "pn.why.broken"), text: tx(L, "pn.why.brokenText") };
    } else {
      if (rep.resumable) items.push(resume);
      items.push(restart);
      why =
        r === "time"
          ? { lead: tx(L, "pn.why.time"), text: tx(L, "pn.why.timeText") }
          : { lead: tx(L, "pn.why.none"), text: tx(L, "pn.why.noneText") };
    }
  } else if (rep.outcome === "not-met") {
    const top = topFinding(rep.findings);
    const skill = top?.skill ?? "exercise";
    const std = rep.standards.find((s) => s.id === top?.standardId);
    items.push(
      retry(
        tx(L, "pn.retry"),
        tx(L, "pn.retryFocus", { skill: skillName(L, skill), m }),
      ),
    );
    items.push(brief());
    const s = simpler(skill);
    if (s) items.push(s);
    const notMet = rep.standards.filter((x) => x.verdict === "not-met").length;
    const exceeded = rep.standards.find((x) => x.exceeded);
    why = top?.group === "safety" ? {
      lead: tx(L, "pn.why.crash"),
      text: tx(L, "pn.why.crashText"),
    } : {
      lead: tx(L, "pn.why.notMet", { std: std?.label ?? tx(L, "k.exercise") }),
      text:
        notMet > 1
          ? tx(L, "pn.why.notMetTextN", { n: notMet })
          : exceeded
            ? tx(L, "pn.why.notMetTextEx", { std: exceeded.label })
            : tx(L, "pn.why.notMetText"),
    };
  } else {
    // met: the next exercise is the primary (SPEC A6), then flying it again without help or tighter
    const nl = nextLesson();
    const watch = topFinding(rep.findings.filter((f) => f.group === "watch"));
    if (nl) items.push(nl);
    if (rep.withHelp)
      items.push(
        retry(
          tx(L, "pn.retryNoHelp"),
          tx(L, "pn.retryNoHelpSub", { n: rep.help.length, m }),
        ),
      );
    else if (watch && (watch.pct ?? 0) >= 0.85)
      items.push(
        retry(
          tx(L, "pn.tighten", { skill: skillName(L, watch.skill) }),
          tx(L, "pn.tightenSub", { p: Math.round((watch.pct ?? 0) * 100), m }),
        ),
      );
    if (watch) {
      const s = simpler(watch.skill);
      if (s) items.push(s);
    } else if (c.hold) items.push(drill());
    if (!nl)
      items.unshift(retry(tx(L, "pn.retry"), tx(L, "pn.retrySub", { m })));
    const gc = rep.gradedCount;
    if (rep.withHelp)
      why = { lead: tx(L, "pn.why.help"), text: tx(L, rep.help.every((x) => x.kind === "ap") ? "pn.why.helpTextAp" : "pn.why.helpText") };
    else if (watch && watch.pct !== undefined)
      why = {
        lead: tx(L, "pn.why.met"),
        text: tx(L, "pn.why.metWatchText", {
          n: gc,
          skill: skillName(L, watch.skill).replace(/^./, (x) =>
            x.toUpperCase(),
          ),
          p: Math.round(watch.pct * 100),
        }),
      };
    else
      why = {
        lead: tx(L, "pn.why.met"),
        text: tx(L, "pn.why.metText", { n: gc }),
      };
  }
  // no duplicates, at most 3, one primary
  const seen = new Set<string>();
  const out: NextItem[] = [];
  for (const it of items) {
    const key = `${it.kind}:${it.ref ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, primary: out.length === 0 });
    if (out.length === 3) break;
  }
  return { why, items: out };
}
