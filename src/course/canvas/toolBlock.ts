// Ground school — designed slides: the « Outil » element (block kind 'tool', course/tools). A live drawing worked out
// from a few numbers, beside the student's controls (steppers and sliders, choices, the tool's presets, « Animer »),
// all INSIDE the block's frame. The panel is drawn in slide units and zoomed so every target stays 44 CSS px on the
// screen it is shown on. In the presenter's console the same controls move the drawing and the projector follows
// (the slide's DiagramHub: live() / follow(), canvas/diagramMirror.ts). The editor and the thumbnails show it still.
// Reduced motion: nothing moves by itself (the airflow is drawn still, « Animer » steps instead of gliding).
import "../../styles/course-tools.css";
import type { Lang, SlideBlock } from "../types";
import type { BlockEnv, BlockView } from "./blocks";
import { taskMet, toolControls, toolDef, toolValues } from "../tools/index";
import {
  paramText,
  snapParam,
  toolColors,
  tr,
  type ToolDef,
  type ToolParam,
  type ToolValues,
  type ToolView,
} from "../tools/kit";

type Of = Extract<SlideBlock, { kind: "tool" }>;
const SVGNS = "http://www.w3.org/2000/svg";
const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const t2 = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
/** the targets of the panel at zoom 1, slide units (CSS: .sl-tc-btn, .sl-tc-range, chips) */
export const TOOL_TARGET = 72;
/** the zoom that keeps a target at 44 CSS px on a screen showing the slide at scale k */
export const toolZoom = (k: number): number =>
  k > 0 ? Math.max(1, Math.min(2.2, 44 / (TOOL_TARGET * k))) : 1;
/** where the panel goes: right of the drawing on a wide frame, under it otherwise */
export const toolSide = (b: Pick<Of, "panel" | "frame">): "right" | "below" =>
  b.panel ?? (b.frame.w / Math.max(1, b.frame.h) >= 1.45 ? "right" : "below");
const reducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

const ICON = {
  play: "M8 5v14l11-7z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  reset: "M12 5a7 7 0 1 1-6.6 4.7M5 4v5h5",
  check: "M5 12.5l4.5 4.5L19 7",
};
function icon(d: string, filled = false): SVGSVGElement {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "sl-tc-ic");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", d);
  if (filled) p.setAttribute("fill", "currentColor");
  else {
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2.4");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
  }
  s.append(p);
  return s;
}

export function toolBlock(b: Of, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-tool");
  const def = toolDef(b.tool);
  const lang = env.lang;
  if (!def) {
    el.classList.add("sl-missing");
    el.textContent = t2(lang, "Unknown tool", "Outil inconnu");
    return { el, block: b, destroy: () => el.remove() };
  }
  const D: ToolDef = def;
  const play = env.mode === "play";
  const reduced = reducedMotion();
  const colors = toolColors(env.theme);
  const start = toolValues(D, b.p);
  let p: ToolValues = { ...start };
  const keys = toolControls(D, b);
  const side = toolSide(b);
  el.dataset.side = side;
  el.dataset.tool = D.id;
  if (!play) el.classList.add("is-static");

  // ---------------------------------------------------------------- the drawing
  const fig = mk("div", "sl-tool-fig");
  const art = mk("div", "sl-tool-art");
  fig.append(art);
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${D.view.w} ${D.view.h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "font-family",
    "var(--sl-font-body, Inter, system-ui, sans-serif)",
  );
  art.append(svg);
  el.append(fig);

  // ---------------------------------------------------------------- the panel
  const panel = mk("div", "sl-tool-panel");
  const inner = mk("div", "sl-tool-in");
  panel.append(inner);
  if (!play) panel.setAttribute("inert", "");
  let taskRow: HTMLElement | null = null;
  if (b.task) {
    taskRow = mk("div", "sl-tool-task");
    const ic = mk("span", "sl-tool-task-ic");
    ic.append(icon(ICON.check));
    taskRow.append(ic, mk("span", "sl-tool-task-t", tr(b.task.prompt, lang)));
    inner.append(taskRow);
  }
  // the values read out: a row under the drawing (large, readable from the back of the room)
  const roList = mk("dl", "sl-tool-ro");
  fig.append(roList);
  const ctrlBox = mk("div", "sl-tool-ctrls");
  inner.append(ctrlBox);
  const say = mk("div", "sl-sr");
  say.setAttribute("aria-live", "polite");
  el.append(say);

  type Ctl = { q: ToolParam; sync(): void };
  const ctls: Ctl[] = [];
  for (const k of keys) {
    const q = D.params.find((x) => x.key === k)!;
    const box = mk("div", `sl-tc${q.choices ? " is-choice" : ""}`);
    const head = mk("div", "sl-tc-head");
    const name = mk("span", "sl-tc-n", tr(q.label, lang));
    const out = mk("output", "sl-tc-v");
    head.append(name, out);
    box.append(head);
    if (q.choices) {
      const seg = mk("div", "sl-tc-seg");
      seg.setAttribute("role", "radiogroup");
      seg.setAttribute("aria-label", tr(q.label, lang));
      const btns = q.choices.map((ch, i) => {
        const bt = mk("button", "sl-tc-opt", tr(ch, lang));
        bt.type = "button";
        bt.setAttribute("role", "radio");
        bt.addEventListener("click", () =>
          change({ ...p, [q.key]: i }, "user"),
        );
        seg.append(bt);
        return bt;
      });
      box.append(seg);
      ctls.push({
        q,
        sync() {
          const v = Math.round(p[q.key]);
          btns.forEach((bt, i) => {
            bt.setAttribute("aria-checked", i === v ? "true" : "false");
            bt.tabIndex = i === v ? 0 : -1;
          });
          out.textContent = paramText(q, p[q.key], lang);
        },
      });
      seg.addEventListener("keydown", (e) => {
        const d =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : 0;
        if (!d) return;
        e.preventDefault();
        const n = q.choices!.length;
        const v = (Math.round(p[q.key]) + d + n) % n;
        change({ ...p, [q.key]: v }, "user");
        btns[v].focus();
      });
    } else {
      const row = mk("div", "sl-tc-row");
      const minus = mk("button", "sl-tc-btn", "−");
      const plus = mk("button", "sl-tc-btn", "+");
      minus.type = plus.type = "button";
      minus.setAttribute(
        "aria-label",
        t2(
          lang,
          `Decrease: ${tr(q.label, "en")}`,
          `Diminuer : ${tr(q.label, "fr")}`,
        ),
      );
      plus.setAttribute(
        "aria-label",
        t2(
          lang,
          `Increase: ${tr(q.label, "en")}`,
          `Augmenter : ${tr(q.label, "fr")}`,
        ),
      );
      const range = mk("input", "sl-tc-range");
      range.type = "range";
      range.min = String(q.min);
      range.max = String(q.max);
      range.step = String(q.step);
      range.setAttribute("aria-label", tr(q.label, lang));
      range.addEventListener("input", () =>
        change({ ...p, [q.key]: snapParam(q, Number(range.value)) }, "user"),
      );
      const bump = (d: number) =>
        change({ ...p, [q.key]: snapParam(q, p[q.key] + d * q.step) }, "user");
      // press and hold repeats (a heading swept 30° without thirty taps)
      for (const [bt, d] of [
        [minus, -1],
        [plus, 1],
      ] as const) {
        let rep: number | null = null;
        let hold: number | null = null;
        const stop = () => {
          if (hold !== null) clearTimeout(hold);
          if (rep !== null) clearInterval(rep);
          hold = rep = null;
        };
        bt.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          stop();
          hold = window.setTimeout(
            () => (rep = window.setInterval(() => bump(d), 70)),
            420,
          );
        });
        for (const ev of ["pointerup", "pointerleave", "pointercancel"])
          bt.addEventListener(ev, stop);
        bt.addEventListener("click", () => {
          if (rep === null) bump(d);
          stop();
        });
      }
      row.append(minus, range, plus);
      box.append(row);
      ctls.push({
        q,
        sync() {
          const v = p[q.key];
          range.value = String(v);
          const txt = paramText(q, v, lang);
          range.setAttribute("aria-valuetext", txt);
          out.textContent = txt;
          minus.disabled = !q.wrap && v <= q.min + 1e-9;
          plus.disabled = !q.wrap && v >= q.max - 1e-9;
          range.style.setProperty(
            "--pc",
            `${((v - q.min) / (q.max - q.min)) * 100}%`,
          );
        },
      });
    }
    ctrlBox.append(box);
  }
  // presets, « Animer », back to the start
  const acts = mk("div", "sl-tool-acts");
  let animBtn: HTMLButtonElement | null = null;
  let resetBtn: HTMLButtonElement | null = null;
  if (keys.length) {
    for (const pr of D.presets) {
      const bt = mk("button", "sl-tc-chip", tr(pr.label, lang));
      bt.type = "button";
      bt.addEventListener("click", () => {
        stopSweep();
        change(toolValues(D, { ...p, ...pr.p }), "user");
      });
      acts.append(bt);
    }
    if (D.sweep && keys.includes(D.sweep.key)) {
      animBtn = mk("button", "sl-tc-chip is-anim");
      animBtn.type = "button";
      animBtn.addEventListener("click", () =>
        sweeping ? stopSweep() : startSweep(),
      );
      acts.append(animBtn);
    }
    resetBtn = mk("button", "sl-tc-chip is-reset");
    resetBtn.type = "button";
    resetBtn.append(
      icon(ICON.reset),
      mk("span", "", t2(lang, "Start values", "Valeurs de départ")),
    );
    resetBtn.addEventListener("click", () => {
      stopSweep();
      change({ ...start }, "user");
    });
    acts.append(resetBtn);
    inner.append(acts);
  }
  el.append(panel);
  if (!keys.length && !b.task) el.classList.add("no-ctrls");

  // ---------------------------------------------------------------- state
  let view: ToolView | null = null;
  const t0 = performance.now();
  const draw = (t = 0) => {
    view = D.draw(p, {
      lang,
      c: colors,
      t,
      moving: play && !reduced && !!D.animated,
    });
    svg.innerHTML = view.svg; // our own markup: kit.ts Svg escapes every text
    svg.setAttribute("aria-label", `${tr(D.title, lang)}. ${view.say}`);
  };
  const roRows: { dt: HTMLElement; dd: HTMLElement }[] = [];
  const syncReadouts = () => {
    const list = view?.readouts ?? [];
    while (roRows.length < list.length) {
      const row = mk("div", "sl-tool-ro-r");
      const dt = mk("dt");
      const dd = mk("dd");
      row.append(dt, dd);
      roList.append(row);
      roRows.push({ dt, dd });
    }
    roRows.forEach((r, i) => {
      const x = list[i];
      (r.dt.parentElement as HTMLElement).hidden = !x;
      if (!x) return;
      r.dt.textContent = tr(x.label, lang);
      r.dd.textContent = x.value;
      r.dd.dataset.tone = x.tone ?? "plain";
    });
  };
  let met = false;
  const syncAll = () => {
    for (const c of ctls) c.sync();
    if (resetBtn)
      resetBtn.hidden = keys.every((k) => Math.abs(p[k] - start[k]) < 1e-9);
    if (animBtn) {
      animBtn.replaceChildren(
        icon(sweeping ? ICON.pause : ICON.play, true),
        mk(
          "span",
          "",
          sweeping
            ? t2(lang, "Stop", "Arrêter")
            : t2(lang, "Animate", "Animer"),
        ),
      );
      animBtn.setAttribute("aria-pressed", sweeping ? "true" : "false");
    }
    syncReadouts();
    if (b.task && taskRow) {
      const ok = taskMet(b, p);
      taskRow.classList.toggle("done", ok);
      if (ok && !met && play) {
        met = true;
        env.fire("goalMet");
        announce(t2(lang, "Found. ", "Trouvé. ") + (view?.say ?? ""));
      }
    }
  };
  let sayT: number | null = null;
  function announce(t: string) {
    say.textContent = "";
    requestAnimationFrame(() => (say.textContent = t));
  }
  let lastPost = 0;
  let postT: number | null = null;
  const hub = play ? env.diagrams : undefined;
  const post = (force: boolean) => {
    if (!hub) return;
    const now = performance.now();
    if (force || now - lastPost > 100) {
      lastPost = now;
      hub.changed(b.id);
    } else if (postT === null)
      postT = window.setTimeout(() => {
        postT = null;
        lastPost = performance.now();
        hub.changed(b.id);
      }, 110);
  };
  function change(next: ToolValues, src: "user" | "remote" | "anim") {
    p = next;
    if (!loop) draw(0);
    else draw((performance.now() - t0) / 1000);
    syncAll();
    if (src === "remote") return;
    post(src === "user");
    if (src === "user") {
      if (sayT !== null) clearTimeout(sayT);
      sayT = window.setTimeout(() => view && announce(view.say), 700);
    }
  }

  // ---------------------------------------------------------------- « Animer »
  let sweeping = false;
  let sweepRaf: number | null = null;
  let sweepTimer: number | null = null;
  function startSweep() {
    const sw = D.sweep;
    if (!sw) return;
    const q = D.params.find((x) => x.key === sw.key)!;
    sweeping = true;
    if (reduced) {
      // no gliding: six still steps, one every 0.9 s
      let i = 0;
      const n = 6;
      const stepTo = () => {
        change(
          {
            ...p,
            [sw.key]: snapParam(q, sw.from + ((sw.to - sw.from) * i) / n),
          },
          "anim",
        );
        if (++i > n) stopSweep();
      };
      stepTo();
      sweepTimer = window.setInterval(stepTo, 900);
    } else {
      const a0 = performance.now();
      const tick = () => {
        const f = Math.min(1, (performance.now() - a0) / (sw.s * 1000));
        change(
          { ...p, [sw.key]: snapParam(q, sw.from + (sw.to - sw.from) * f) },
          "anim",
        );
        if (f >= 1) stopSweep();
        else sweepRaf = requestAnimationFrame(tick);
      };
      tick();
    }
    syncAll();
  }
  function stopSweep() {
    if (!sweeping) return;
    sweeping = false;
    if (sweepRaf !== null) cancelAnimationFrame(sweepRaf);
    if (sweepTimer !== null) clearInterval(sweepTimer);
    sweepRaf = sweepTimer = null;
    syncAll();
    post(true);
  }

  // ---------------------------------------------------------------- the moving air (play, no reduced motion)
  let loop: number | null = null;
  let lastFrame = 0;
  if (play && !reduced && D.animated) {
    const frame = (now: number) => {
      loop = requestAnimationFrame(frame);
      if (!el.isConnected || now - lastFrame < 33) return;
      lastFrame = now;
      draw((now - t0) / 1000);
    };
    loop = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- the presenter's console ↔ the projector
  const unhub = hub?.add(b.id, {
    live: () => ({ spec: { ...p }, paused: !sweeping }),
    follow: (st) => {
      const sp = st.spec as ToolValues | null;
      if (!sp || typeof sp !== "object") return;
      const next = toolValues(D, sp);
      if (D.params.every((q) => next[q.key] === p[q.key])) return;
      change(next, "remote");
    },
  });

  // ---------------------------------------------------------------- size
  const layout = () => {
    const z = play ? toolZoom(env.scale()) : 1;
    const W = b.frame.w;
    const H = b.frame.h;
    panel.style.setProperty("zoom", String(z));
    // the drawing takes the rest of the frame (flex): only the panel is sized here, in its own zoomed units
    if (side === "right") {
      const pw = Math.round(Math.min(620, Math.max(380, W * 0.34)));
      panel.style.width = `${pw / z}px`;
      panel.style.height = `${H / z}px`;
    } else {
      panel.style.width = `${W / z}px`;
      panel.style.maxHeight = `${(H * 0.6) / z}px`;
    }
  };
  draw(0);
  syncAll();
  layout();
  return {
    el,
    block: b,
    layout,
    destroy: () => {
      unhub?.();
      if (loop !== null) cancelAnimationFrame(loop);
      stopSweep();
      if (sayT !== null) clearTimeout(sayT);
      if (postT !== null) clearTimeout(postT);
      el.remove();
    },
  };
}
