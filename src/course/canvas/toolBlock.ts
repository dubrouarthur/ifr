// Ground school — designed slides: the « Outil » element (block kind 'tool', course/tools). A live drawing worked out
// from a few numbers, beside the student's controls (steppers and sliders, choices, the tool's presets, « Animer »),
// all INSIDE the block's frame. The panel is drawn in slide units and zoomed so every target stays 44 CSS px on the
// screen it is shown on. In the presenter's console the same controls move the drawing and the projector follows
// (the slide's DiagramHub: live() / follow(), canvas/diagramMirror.ts). The editor and the thumbnails show it still.
// Reduced motion: nothing moves by itself (the airflow is drawn still, « Animer » steps instead of gliding).
import "../../styles/course-tools.css";
import type { Lang, SlideBlock } from "../types";
import type { BlockEnv, BlockView } from "./blocks";
import {
  blockStart,
  liveControls,
  taskMet,
  toolDef,
  toolTask,
  toolValues,
} from "../tools/index";
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
  more: "M6 9l6 6 6-6",
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
  // a task's givens are set and their controls not offered (tools/index.ts liveControls)
  const start = blockStart(D, b);
  let p: ToolValues = { ...start };
  const keys = liveControls(D, b);
  const own = toolTask(D, b);
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
      // on a focused − / +, the arrows work the value (never the slide behind)
      for (const bt of [minus, plus])
        bt.addEventListener("keydown", (e) => {
          const d =
            e.key === "ArrowUp" || e.key === "ArrowRight"
              ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft"
                ? -1
                : 0;
          if (!d) return;
          e.preventDefault();
          bump(d);
        });
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
  // presets, « Animer », back to the start. While a task is on, no presets and no « Animer »: they would give the
  // answer. When the panel would not fit its frame, the presets fold behind one « Préréglages » chip (layout()).
  const acts = mk("div", "sl-tool-acts");
  let animBtn: HTMLButtonElement | null = null;
  let resetBtn: HTMLButtonElement | null = null;
  let menuBtn: HTMLButtonElement | null = null;
  const presetBox = mk("div", "sl-tool-presets");
  presetBox.id = `sl-tool-pr-${b.id}`;
  const setMenu = (open: boolean) => {
    panel.classList.toggle("menu-open", open);
    menuBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  };
  if (keys.length) {
    if (!b.task && D.presets.length) {
      for (const pr of D.presets) {
        const bt = mk("button", "sl-tc-chip", tr(pr.label, lang));
        bt.type = "button";
        bt.addEventListener("click", () => {
          stopSweep();
          change(toolValues(D, { ...p, ...pr.p }), "user");
          if (panel.classList.contains("menu-open")) {
            setMenu(false);
            menuBtn?.focus();
          }
        });
        presetBox.append(bt);
      }
      menuBtn = mk("button", "sl-tc-chip sl-tool-menu");
      menuBtn.type = "button";
      menuBtn.setAttribute("aria-controls", presetBox.id);
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.append(
        mk("span", "", t2(lang, "Presets", "Préréglages")),
        icon(ICON.more),
      );
      menuBtn.addEventListener("click", () =>
        setMenu(!panel.classList.contains("menu-open")),
      );
      acts.append(presetBox, menuBtn);
    }
    if (!b.task && D.sweep && keys.includes(D.sweep.key)) {
      animBtn = mk("button", "sl-tc-chip is-anim");
      animBtn.type = "button";
      animBtn.addEventListener("click", () =>
        sweeping ? stopSweep() : startSweep(),
      );
      acts.append(animBtn);
    }
    // one icon, always in its place (greyed at the start values): the row never jumps
    resetBtn = mk("button", "sl-tc-chip is-reset");
    resetBtn.type = "button";
    const resetName = t2(lang, "Start values", "Valeurs de départ");
    resetBtn.setAttribute("aria-label", resetName);
    resetBtn.title = resetName;
    resetBtn.append(icon(ICON.reset));
    resetBtn.addEventListener("click", () => {
      stopSweep();
      change({ ...start }, "user");
    });
    acts.append(resetBtn);
    inner.append(acts);
  }
  el.append(panel);
  if (!keys.length && !b.task) el.classList.add("no-ctrls");
  // inside the panel the arrows belong to the control in focus, never to the player behind (next slide)
  panel.addEventListener("keydown", (e) => {
    if (e.key.startsWith("Arrow")) e.stopPropagation();
    if (e.key === "Escape" && panel.classList.contains("menu-open")) {
      e.stopPropagation();
      setMenu(false);
      menuBtn?.focus();
    }
  });

  // ---------------------------------------------------------------- state
  let view: ToolView | null = null;
  // the values a task keeps hidden until it is met (then they stay shown)
  let met = false;
  const hide = (): ReadonlySet<string> | undefined =>
    own?.hides?.length && !met ? new Set(own.hides) : undefined;
  let label = "";
  // drawn once per change: what moves by itself (the airflow) moves in CSS (course-tools.css), not by redrawing
  const draw = () => {
    view = D.draw(p, {
      lang,
      c: colors,
      t: 0,
      moving: play && !reduced && !!D.animated,
      hide: hide(),
    });
    svg.innerHTML = view.svg; // our own markup: kit.ts Svg escapes every text
    const next = `${tr(D.title, lang)}. ${view.say}`;
    if (next !== label) svg.setAttribute("aria-label", (label = next));
  };
  const roRows: { dt: HTMLElement; dd: HTMLElement }[] = [];
  const syncReadouts = () => {
    const list = view?.readouts ?? [];
    const hidden = hide();
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
      const masked = !!x.key && !!hidden?.has(x.key);
      r.dt.textContent = tr(x.label, lang);
      r.dd.textContent = masked ? "?" : x.value;
      r.dd.dataset.tone = masked ? "plain" : (x.tone ?? "plain");
    });
  };
  let lastSrc: "user" | "remote" | "anim" | "start" = "start";
  const syncAll = () => {
    for (const c of ctls) c.sync();
    if (resetBtn)
      resetBtn.disabled = keys.every((k) => Math.abs(p[k] - start[k]) < 1e-9);
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
    if (b.task && taskRow) {
      const ok = taskMet(D, b, p);
      taskRow.classList.toggle("done", ok);
      // found by the student (or the presenter's console), never by the starting values or an animation
      if (ok && !met && play && (lastSrc === "user" || lastSrc === "remote")) {
        met = true;
        if (own?.hides?.length) draw(); // the hidden values come back
        env.fire("goalMet");
        announce(t2(lang, "Found. ", "Trouvé. ") + (view?.say ?? ""));
      }
    }
    syncReadouts();
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
    lastSrc = src;
    draw();
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
  // ---------------------------------------------------------------- a small screen: the tool opens full screen
  // Under this scale the panel cannot keep 44 px targets inside the frame (a phone, a tablet held upright): the
  // slide shows the drawing and its values, and « Manipuler » opens the tool over the whole screen, in CSS pixels.
  let compact = false;
  let kCompact = -1;
  let sheet: HTMLElement | null = null;
  let hudBtn: HTMLButtonElement | null = null;
  const hud: {
    el: HTMLElement;
    at: [number, number];
    origin: [number, number];
  }[] = [];
  if (play && (keys.length || b.task)) {
    hudBtn = mk("button", "sl-hud-btn sl-tool-open is-off");
    hudBtn.type = "button";
    hudBtn.append(
      icon(ICON.play, true),
      mk("span", "", t2(lang, "Try it", "Manipuler")),
    );
    hudBtn.setAttribute(
      "aria-label",
      t2(
        lang,
        `Try it: ${tr(D.title, lang)}`,
        `Manipuler : ${tr(D.title, lang)}`,
      ),
    );
    hudBtn.addEventListener("click", () => openSheet());
    // hung under the block's frame (never over the drawing and its values)
    hud.push({ el: hudBtn, at: [1, 1], origin: [1, 0] });
  }
  const onSheetKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeSheet();
    }
  };
  // the sheet is modal: everything else on the page is inert while it is open (focus stays in it)
  let inerted: Element[] = [];
  function openSheet() {
    if (sheet) return;
    setMenu(false);
    panel.classList.remove("is-menu");
    const view = el.closest(".sl-view") as HTMLElement | null;
    sheet = mk("div", "sl-tool-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", tr(D.title, lang));
    // the slide theme's colours (the sheet lives outside the scaled slide)
    if (view)
      for (let i = 0; i < view.style.length; i++) {
        const k = view.style[i];
        if (k.startsWith("--"))
          sheet.style.setProperty(k, view.style.getPropertyValue(k));
      }
    const close = mk("button", "sl-tool-sheet-x");
    close.type = "button";
    close.setAttribute(
      "aria-label",
      t2(lang, "Back to the slide", "Revenir à la diapo"),
    );
    close.append(icon("M6 6l12 12M18 6L6 18"));
    close.addEventListener("click", () => closeSheet());
    const hd = mk("div", "sl-tool-sheet-hd");
    hd.append(mk("h2", "", tr(D.title, lang)), close);
    art.style.aspectRatio = `${D.view.w} / ${D.view.h}`;
    sheet.append(hd, fig, panel);
    sheet.addEventListener("keydown", onSheetKey);
    document.body.append(sheet);
    for (const x of Array.from(document.body.children))
      if (x !== sheet && !x.hasAttribute("inert")) {
        x.setAttribute("inert", "");
        inerted.push(x);
      }
    (panel.querySelector("button, input") as HTMLElement | null)?.focus();
  }
  function closeSheet() {
    if (!sheet) return;
    for (const x of inerted) x.removeAttribute("inert");
    inerted = [];
    art.style.aspectRatio = "";
    el.prepend(fig);
    el.append(panel);
    sheet.remove();
    sheet = null;
    if (hudBtn?.isConnected) hudBtn.focus();
    layout();
  }

  // ---------------------------------------------------------------- size
  // the panel never hides a control below a scroll inside the slide: when it does not fit the frame the presets
  // fold behind « Préréglages », and if that is not enough (a small screen) the tool opens full screen instead
  const overflows = () => panel.scrollHeight > panel.clientHeight + 1;
  function layout() {
    const k = env.scale();
    let small = play && k > 0 && k < 0.42 && !!hudBtn;
    if (sheet) {
      if (small || k === kCompact) return;
      closeSheet(); // the screen grew: back on the slide (closeSheet lays out again)
      return;
    }
    el.classList.remove("is-compact");
    const z = play ? toolZoom(k) : 1;
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
    if (!small) {
      const open = panel.classList.contains("menu-open");
      panel.classList.remove("is-menu", "menu-open");
      if (menuBtn && overflows()) panel.classList.add("is-menu");
      if (open && panel.classList.contains("is-menu")) setMenu(true);
      else setMenu(false);
      if (hudBtn && overflows()) small = true;
    }
    compact = small;
    kCompact = k;
    el.classList.toggle("is-compact", compact);
    hudBtn?.classList.toggle("is-off", !compact);
  }
  draw();
  syncAll();
  layout();
  return {
    el,
    block: b,
    ...(hud.length ? { hud } : {}),
    layout,
    destroy: () => {
      closeSheet();
      hudBtn?.remove();
      unhub?.();
      stopSweep();
      if (sayT !== null) clearTimeout(sayT);
      if (postT !== null) clearTimeout(postT);
      el.remove();
    },
  };
}
