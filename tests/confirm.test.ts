// In-app confirmations (X07): the placement and focus rules of the confirm sheet, and no native confirm() / alert()
// left in the windows that used them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SHEET_BOTTOM_BELOW, confirmActions, initialFocusId, sheetPlacement } from '../src/ui/confirm';

const vp = { width: 1366, height: 1024 };
const box = { width: 360, height: 170 };

describe('confirm sheet placement', () => {
  it('docks at the bottom on a phone-width screen', () => {
    expect(sheetPlacement({ left: 10, top: 10, width: 80, height: 36 }, box, { width: SHEET_BOTTOM_BELOW - 1, height: 800 })).toEqual({ mode: 'bottom' });
  });
  it('is centred without an anchor, or when it does not fit', () => {
    expect(sheetPlacement(null, box, vp)).toEqual({ mode: 'center' });
    expect(sheetPlacement({ left: 0, top: 0, width: 0, height: 0 }, box, vp)).toEqual({ mode: 'center' });
    expect(sheetPlacement({ left: 400, top: 300, width: 80, height: 36 }, { width: 360, height: 1100 }, vp)).toEqual({ mode: 'center' });
  });
  it('opens below the button that asked, right edges aligned', () => {
    const p = sheetPlacement({ left: 900, top: 100, width: 120, height: 36 }, box, vp);
    expect(p).toEqual({ mode: 'anchored', left: 1020 - 360, top: 144 });
  });
  it('opens above the button near the bottom of the screen, and stays inside the viewport', () => {
    const p = sheetPlacement({ left: 20, top: 960, width: 60, height: 40 }, box, vp);
    expect(p.mode).toBe('anchored');
    if (p.mode !== 'anchored') return;
    expect(p.top + box.height).toBeLessThanOrEqual(960);
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + box.width).toBeLessThanOrEqual(vp.width - 12);
  });
});

describe('confirm sheet focus and actions', () => {
  it('a destructive question starts on Cancel, a plain one on the main action', () => {
    const del = confirmActions({ title: 'Delete?', confirmLabel: 'Delete', destructive: true });
    expect(del.map((a) => a.kind)).toEqual(['quiet', 'danger']);
    expect(initialFocusId(del, 'cancel')).toBe('cancel');
    const ok = confirmActions({ title: 'Go?', confirmLabel: 'Go' });
    expect(ok.map((a) => a.label)).toEqual(['Cancel', 'Go']);
    expect(initialFocusId(ok, 'cancel')).toBe('confirm');
    expect(confirmActions({ title: 'x', confirmLabel: 'Yes', cancelLabel: 'Keep editing' })[0].label).toBe('Keep editing');
  });
  it('several answers: the last primary action gets the focus', () => {
    const acts = [
      { id: 'cancel', label: 'Keep flying', kind: 'quiet' as const },
      { id: 'debrief', label: 'End and debrief', kind: 'primary' as const },
      { id: 'end', label: 'End', kind: 'primary' as const },
    ];
    expect(initialFocusId(acts, 'cancel')).toBe('end');
  });
});

describe('no native dialogs', () => {
  for (const f of ['src/ui/learn.ts', 'src/ui/instructor.ts', 'src/ui/circuitBuilder.ts']) {
    it(`${f} uses the in-app sheet`, () => {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/(^|[^.\w])(window\.)?(confirm|alert|prompt)\(/m);
      expect(src).toMatch(/confirmAction\(/);
    });
  }
});
