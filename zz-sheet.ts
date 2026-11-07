// TEMPORARY dev page (removed before hand-off): every slide of a generated briefing deck on one sheet.
import "./src/styles/course-canvas.css";
import { Sim } from "./src/sim/sim";
import { exercise } from "./src/train/curriculum";
import { LessonRun } from "./src/train/engine";
import { buildBriefingDeck } from "./src/lesson/briefingDeck";
import { renderSlide } from "./src/course/canvas/render";
import { SceneSims } from "./src/course/canvas/instruments";
import { findApproach } from "./src/nav/data";
import { approachPlate } from "./src/plates/plates";
const q = new URLSearchParams(location.search);
const id = q.get("ex") ?? "bai-turns";
const lang = (q.get("lang") ?? "fr") as "fr" | "en";
const ex = exercise(id);
const run = new LessonRun(ex, new Sim());
const st = run.rt.steps[0];
const setup = st?.setup ? st.setup(run.ctx(0)).map((i) => ({ label: i.label, ...(i.detail ? { detail: i.detail } : {}), ok: i.ok, ...(i.action ? { action: i.action.label } : {}) })) : [];
const rt = run.rt;
const c = buildBriefingDeck(ex, lang, {
  steps: rt.steps.map((s) => s.text),
  ...(rt.clearance ? { clearance: rt.clearance } : {}),
  ...(rt.quiz ? { quiz: { question: rt.quiz.question, options: rt.quiz.options, answer: rt.quiz.answer, explain: rt.quiz.explain } } : {}),
  ...(rt.hold ? { hold: { inbound: rt.hold.inbound, turn: rt.hold.turn, fix: rt.hold.fix.ident, legMin: rt.hold.legMin, altFt: rt.hold.altFt } } : {}),
  setup,
});
const sims = new SceneSims({ scenes: c.scenes, cockpit: c.cockpit });
const g = document.getElementById("g")!;
c.steps.forEach((s, i) => {
  const cell = document.createElement("div");
  cell.className = "cell";
  const lab = document.createElement("div");
  lab.className = "lab";
  lab.textContent = `${i + 1} ${s.id}`;
  cell.append(lab);
  g.append(cell);
  renderSlide(s.slide!, cell, {
    mode: "play", lang, theme: "cockpit", scenes: c.scenes, cockpit: c.cockpit, sims, step: s, reveal: Infinity,
    assetUrl: (a: string) => { const ap = a.startsWith("plate:") ? findApproach(a.slice(6)) : undefined; return ap ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(approachPlate(ap))}` : null; },
  });
});
(window as unknown as { __n: number }).__n = c.steps.length;
