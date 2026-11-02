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
  const el = h('div', { class: `pknob ${o.dual ? 'dual' : 'single'} ${o.size ?? 'md'}`, tabindex: 0, role: 'slider', 'aria-label': o.label, title: o.title ?? `${o.label} — drag or scroll${o.dual ? ' (outer ring = coarse, inner knob = fine)' : ''}${o.onPush ? ', click to push' : ''}` }, ring, cap, bubble);
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
  let drag: { x: number; y: number; acc: number; coarse: boolean; moved: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.focus({ preventScroll: true });
    drag = { x: e.clientX, y: e.clientY, acc: 0, coarse: isOuter(e), moved: false };
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
  const end = () => {
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
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  return h('div', { class: 'knob-wrap' }, el, h('div', { class: 'knob-label' }, o.label, o.sub ? h('small', {}, o.sub) : null));
}

export function bkey(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  return h('button', { class: 'bkey', onclick: (e: Event) => { onClick(); (e.currentTarget as HTMLElement).blur(); }, title: title ?? label }, h('span', {}, label));
}
