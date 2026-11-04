import { h } from './dom';

export interface KnobOpts {
  label: string;
  sub?: string;
  /** concentric outer ring (coarse) + inner knob (fine) */
  dual?: boolean;
  /** delta = ±1 per detent; coarse = outer ring (or Shift) */
  onTurn: (delta: number, coarse: boolean) => void;
  onPush?: () => void;
  /** live value shown in a bubble while turning */
  readout?: () => string;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * step buttons for touch / mouse-free use (a tap on the knob with a finger, or a right-click, opens them):
   * the fine and coarse step names (e.g. ['1°', '10°']); the push action is offered as a button (pushLabel)
   */
  stepLabels?: [string, string?];
  pushLabel?: string;
  /** explicit step rows (replace the rows derived from onTurn / stepLabels), e.g. CRS + BARO on one knob */
  steps?: () => StepRow[];
}

/** one row of the step pad: − / + buttons around a live value */
export interface StepRow {
  label: string;
  value: () => string;
  /** fine step name ('1°') and optional coarse step name ('10°') */
  fine: string;
  coarse?: string;
  onStep: (dir: 1 | -1, coarse: boolean) => void;
  push?: { label: string; fn: () => void; title?: string };
}

const DETENT_PX = 14;

/**
 * Rotary encoder. Drag (any direction) or scroll to turn; the outer ring of a dual knob is coarse,
 * the inner knob fine. A click without movement on the inner knob pushes it.
 */
export function knob(o: KnobOpts): HTMLElement {
  const ringMark = h('i', { class: 'mk' });
  const capMark = h('i', { class: 'mk' });
  const ring = h('div', { class: 'ring' }, ringMark);
  const cap = h('div', { class: 'cap' }, capMark, o.onPush ? h('b', { class: 'push' }) : null);
  const bubble = h('div', { class: 'bubble' });
  const el = h('div', { class: `pknob ${o.dual ? 'dual' : 'single'} ${o.size ?? 'md'}`, tabindex: 0, role: 'slider', 'aria-label': o.label, title: o.title ?? `${o.label} — drag or scroll${o.dual ? ' (outer ring = coarse, inner knob = fine)' : ''}${o.onPush ? ', click to push' : ''} · right-click or tap for step buttons` }, ring, cap, bubble);
  let ringA = 0;
  let capA = 0;
  let hideT = 0;
  const show = () => {
    if (!o.readout) return;
    bubble.textContent = o.readout();
    el.classList.add('show');
    clearTimeout(hideT);
    hideT = window.setTimeout(() => el.classList.remove('show'), 1300);
  };
  const turn = (d: number, coarse: boolean) => {
    if (o.dual && coarse) {
      ringA += d * 18;
      ring.style.transform = `rotate(${ringA}deg)`;
    } else {
      capA += d * 18;
      cap.style.transform = `rotate(${capA}deg)`;
      if (!o.dual) {
        ringA += d * 18;
        ring.style.transform = `rotate(${ringA}deg)`;
      }
    }
    el.classList.add('tick');
    setTimeout(() => el.classList.remove('tick'), 60);
    o.onTurn(d, coarse);
    show();
  };
  const isOuter = (e: MouseEvent) => {
    if (!o.dual) return e.shiftKey;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return Math.hypot(dx, dy) > r.width * 0.3 || e.shiftKey;
  };
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      turn(e.deltaY < 0 ? 1 : -1, isOuter(e));
    },
    { passive: false },
  );
  const rows = (): StepRow[] =>
    o.steps?.() ?? [
      {
        label: o.label,
        value: o.readout ?? (() => ''),
        fine: o.stepLabels?.[0] ?? '1',
        coarse: o.dual ? o.stepLabels?.[1] ?? '10' : undefined,
        onStep: (d, c) => turn(d, c),
        push: o.onPush ? { label: o.pushLabel ?? 'PUSH', fn: () => { o.onPush!(); show(); } } : undefined,
      },
    ];
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openSteps(el, rows());
  });
  let drag: { x: number; y: number; acc: number; coarse: boolean; moved: boolean; touch: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.focus({ preventScroll: true });
    drag = { x: e.clientX, y: e.clientY, acc: 0, coarse: isOuter(e), moved: false, touch: e.pointerType !== 'mouse' };
    el.classList.add('grab', drag.coarse ? 'g-ring' : 'g-cap');
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // clockwise feel: right or up = increase
    drag.acc += e.clientX - drag.x - (e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
    while (Math.abs(drag.acc) >= DETENT_PX) {
      drag.moved = true;
      const d = Math.sign(drag.acc);
      drag.acc -= d * DETENT_PX;
      turn(d, drag.coarse);
    }
  });
  const end = (e: PointerEvent) => {
    // a finger tap opens the step pad: big − / + buttons and the push action (a finger cannot "click" a
    // small concentric knob precisely, and a push by mistake would sync the bug)
    if (drag && !drag.moved && drag.touch && e.type === 'pointerup') {
      drag = null;
      el.classList.remove('grab', 'g-ring', 'g-cap');
      openSteps(el, rows());
      return;
    }
    if (drag && !drag.moved && !drag.coarse && o.onPush) {
      el.classList.add('pushed');
      setTimeout(() => el.classList.remove('pushed'), 140);
      o.onPush();
      show();
    } else if (drag && !drag.moved) show();
    drag = null;
    el.classList.remove('grab', 'g-ring', 'g-cap');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') turn(1, e.shiftKey);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') turn(-1, e.shiftKey);
    else if (e.key === 'Enter' || e.key === ' ') o.onPush?.();
    else if (e.key === '+' || e.key === '=') turn(1, false);
    else if (e.key === '-') turn(-1, false);
    else if (e.key === 'ContextMenu') openSteps(el, rows());
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  return h('div', { class: 'knob-wrap' }, el, h('div', { class: 'knob-label' }, o.label, o.sub ? h('small', {}, o.sub) : null));
}

export function bkey(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  return h('button', { class: 'bkey', onclick: (e: Event) => { onClick(); (e.currentTarget as HTMLElement).blur(); }, title: title ?? label }, h('span', {}, label));
}

// ------------------------------------------------------------------ auto-repeat (tap = one step, hold = repeat)
/**
 * Make a button step on press and repeat while it is held, faster and faster (380 ms, then 150 ms down to 40 ms).
 * Works with mouse, pen and touch; keyboard activation (Enter / Space) gives one step.
 */
export function autoRepeat(btn: HTMLElement, fn: () => void): HTMLElement {
  let t = 0;
  let t0 = 0;
  let done = 0;
  let active = false;
  const stop = () => {
    active = false;
    clearTimeout(t);
    btn.classList.remove('rep');
  };
  // steps are paced by the time held, not by counting timer callbacks: a slow frame never slows the repeat down
  const tick = () => {
    if (!active) return;
    const due = repeatSteps(performance.now() - t0);
    for (let n = 0; done < due && n < 12; n++, done++) fn();
    t = window.setTimeout(tick, 30);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    active = true;
    t0 = performance.now();
    done = 0;
    btn.classList.add('rep');
    try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    fn();
    t = window.setTimeout(tick, 30);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('lostpointercapture', stop);
  btn.addEventListener('click', (e) => {
    // keyboard activation only (a pointer press already stepped)
    if ((e as MouseEvent).detail === 0) fn();
  });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  return btn;
}

/** repeat steps due after holding for `ms` (the first step on press not included): none for 380 ms, then one every
 *  150 ms, each interval 14 % shorter down to 40 ms (about 18 steps after 1.5 s, 55 after 3 s) */
export function repeatSteps(ms: number): number {
  let e = ms - 380;
  if (e < 0) return 0;
  let n = 1;
  let iv = 150;
  while (e >= iv && n < 10000) {
    e -= iv;
    n++;
    iv = Math.max(40, iv * 0.86);
  }
  return n;
}

// ------------------------------------------------------------------ step pad (popover)
let pad: HTMLElement | null = null;
let padAnchor: HTMLElement | null = null;
let padTimer = 0;
const padClose = () => {
  if (!pad) return;
  pad.remove();
  pad = null;
  padAnchor?.classList.remove('stepping');
  padAnchor = null;
  clearInterval(padTimer);
  document.removeEventListener('pointerdown', padOutside, true);
  document.removeEventListener('keydown', padKey, true);
};
const padOutside = (e: Event) => {
  if (pad && !pad.contains(e.target as Node) && !padAnchor?.contains(e.target as Node)) padClose();
};
const padKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopPropagation();
    e.preventDefault();
    padClose();
  }
};
export const stepsOpen = () => !!pad;
export const closeSteps = () => padClose();

/**
 * Open the step pad next to `anchor`: per row a live value with big − / + buttons (fine and coarse), and the
 * push action. Tap = one step, hold = repeat. Closes on a tap outside, Escape or the close button.
 */
export function openSteps(anchor: HTMLElement, rows: StepRow[], title?: string): HTMLElement {
  const again = padAnchor === anchor;
  padClose();
  if (again) return anchor; // a second tap on the same control closes it
  const vals: [HTMLElement, () => string][] = [];
  const refresh = () => vals.forEach(([el, f]) => { const v = f(); if (el.textContent !== v) el.textContent = v; });
  const btn = (label: string, aria: string, fn: () => void, cls = '') => autoRepeat(h('button', { type: 'button', class: `sp-b ${cls}`, 'aria-label': aria }, label), () => { fn(); refresh(); });
  const body = rows.map((r) => {
    const v = h('output', { class: 'sp-v' }, r.value());
    vals.push([v, r.value]);
    return h('div', { class: `sp-row${r.coarse ? ' dual' : ''}` },
      // a single row is named by the pad title already
      rows.length > 1 ? h('div', { class: 'sp-l' }, r.label) : null,
      h('div', { class: 'sp-ctl' },
        r.coarse ? btn(`−${r.coarse}`, `${r.label} minus ${r.coarse}`, () => r.onStep(-1, true), 'big') : null,
        btn(`−${r.fine}`, `${r.label} minus ${r.fine}`, () => r.onStep(-1, false)),
        v,
        btn(`+${r.fine}`, `${r.label} plus ${r.fine}`, () => r.onStep(1, false)),
        r.coarse ? btn(`+${r.coarse}`, `${r.label} plus ${r.coarse}`, () => r.onStep(1, true), 'big') : null,
      ),
      r.push ? h('button', { type: 'button', class: 'sp-push', title: r.push.title ?? r.push.label, onclick: () => { r.push!.fn(); refresh(); } }, r.push.label) : null,
    );
  });
  pad = h('div', { class: 'steppad', role: 'dialog', 'aria-label': title ?? rows.map((r) => r.label).join(' / ') },
    h('div', { class: 'sp-h' }, h('b', {}, title ?? rows.map((r) => r.label).join(' · ')), h('span', { class: 'sp-hint' }, 'Tap = 1 step · hold = repeat'), h('button', { type: 'button', class: 'sp-x', 'aria-label': 'Close', onclick: () => padClose() }, '×')),
    ...body,
  );
  document.body.append(pad);
  padAnchor = anchor;
  anchor.classList.add('stepping');
  // place it above the control when there is room, else below; always inside the window
  const r = anchor.getBoundingClientRect();
  const pw = pad.offsetWidth;
  const ph = pad.offsetHeight;
  const m = 8;
  let x = r.left + r.width / 2 - pw / 2;
  x = Math.max(m, Math.min(innerWidth - pw - m, x));
  let y = r.top - ph - 10;
  if (y < m) y = Math.min(innerHeight - ph - m, r.bottom + 10);
  // beside the control when neither above nor below has room (a knob in a tall side column)
  if (y < m || (y < r.bottom && y + ph > r.top)) {
    y = Math.max(m, Math.min(innerHeight - ph - m, r.top + r.height / 2 - ph / 2));
    x = r.right + 10 + pw < innerWidth - m ? r.right + 10 : Math.max(m, r.left - pw - 10);
  }
  pad.style.left = `${Math.round(x)}px`;
  pad.style.top = `${Math.round(y)}px`;
  padTimer = window.setInterval(refresh, 200);
  setTimeout(() => {
    document.addEventListener('pointerdown', padOutside, true);
    document.addEventListener('keydown', padKey, true);
  });
  // focus the pad itself (Tab reaches the buttons) — a ring on the first button would read as "selected"
  pad.tabIndex = -1;
  pad.focus({ preventScroll: true });
  return pad;
}

// ------------------------------------------------------------------ long-press tips (touch has no hover)
/**
 * On a touch screen, holding a finger on any control with a `title` for half a second shows that title in a
 * small tip; the click that follows the long press is swallowed so the control is not triggered by accident.
 */
export function installLongPressTips(root: Document = document): void {
  let timer = 0;
  let start: { x: number; y: number; el: HTMLElement } | null = null;
  let tip: HTMLElement | null = null;
  let swallow = false;
  const hide = () => {
    tip?.remove();
    tip = null;
  };
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    hide();
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[title], [data-tip]');
    if (!el || el.closest('.steppad')) return;
    start = { x: e.clientX, y: e.clientY, el };
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!start) return;
      const text = start.el.dataset.tip || start.el.getAttribute('title') || '';
      if (!text) return;
      tip = h('div', { class: 'lp-tip', role: 'tooltip' }, text);
      document.body.append(tip);
      const r = start.el.getBoundingClientRect();
      const w = tip.offsetWidth;
      const th = tip.offsetHeight;
      const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const y = r.top - th - 10 >= 8 ? r.top - th - 10 : Math.min(innerHeight - th - 8, r.bottom + 10);
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;
      swallow = !start.el.closest('.pknob, .stick, .lever, input, [data-hold]');
    }, 520);
  }, true);
  root.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      clearTimeout(timer);
      start = null;
    }
  }, true);
  const up = () => {
    clearTimeout(timer);
    start = null;
    if (tip) setTimeout(hide, 1600);
  };
  root.addEventListener('pointerup', up, true);
  root.addEventListener('pointercancel', () => { up(); swallow = false; }, true);
  root.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // iOS: the long-press callout / selection menu would cover the tip
  root.addEventListener('contextmenu', (e) => { if (tip) e.preventDefault(); }, true);
}
