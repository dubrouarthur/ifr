import { h } from './dom';

export interface KnobOpts {
  label: string;
  sub?: string;
  dual?: boolean;
  /** delta = ±1 per detent; coarse when outer ring / shift */
  onTurn: (delta: number, coarse: boolean) => void;
  onPush?: () => void;
  title?: string;
}

/**
 * Rotary knob: mouse wheel, drag left/right, click left/right half, or tap the centre to push.
 * For dual knobs, the outer ring (outside 60% radius) or Shift gives the coarse value.
 */
export function knob(o: KnobOpts): HTMLElement {
  const tick = h('i', { class: 'tick' });
  const el = h('div', { class: `knob${o.dual ? ' dual' : ''}`, title: o.title ?? `${o.label}: scroll / drag / click sides${o.onPush ? ', click centre to push' : ''}`, role: 'slider', tabindex: 0, 'aria-label': o.label }, tick);
  let angle = 0;
  const turn = (d: number, coarse: boolean) => {
    angle += d * 15;
    tick.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    o.onTurn(d, coarse);
  };
  const isOuter = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return Math.hypot(dx, dy) > r.width * 0.3;
  };
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      turn(e.deltaY < 0 ? 1 : -1, e.shiftKey || (!!o.dual && isOuter(e)));
    },
    { passive: false },
  );
  let dragX: number | null = null;
  let acc = 0;
  let moved = false;
  let coarseDrag = false;
  el.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    acc = 0;
    moved = false;
    coarseDrag = e.shiftKey || (!!o.dual && isOuter(e));
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    acc += e.clientX - dragX;
    dragX = e.clientX;
    while (Math.abs(acc) > 12) {
      moved = true;
      const d = Math.sign(acc);
      acc -= d * 12;
      turn(d, coarseDrag);
    }
  });
  el.addEventListener('pointerup', (e) => {
    if (dragX !== null && !moved) {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const center = Math.abs(x - r.width / 2) < r.width * 0.16 && Math.abs(e.clientY - r.top - r.height / 2) < r.height * 0.16;
      if (center && o.onPush) o.onPush();
      else turn(x < r.width / 2 ? -1 : 1, e.shiftKey || (!!o.dual && isOuter(e)));
    }
    dragX = null;
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') turn(1, e.shiftKey);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') turn(-1, e.shiftKey);
    else if (e.key === 'Enter') o.onPush?.();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  return h('div', { class: 'knob-wrap' }, el, h('div', { class: 'knob-label' }, o.label, o.sub ? h('small', {}, o.sub) : null));
}

export function bkey(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  return h('button', { class: 'bkey', onclick: (e: Event) => { onClick(); (e.currentTarget as HTMLElement).blur(); }, title: title ?? label }, label);
}
