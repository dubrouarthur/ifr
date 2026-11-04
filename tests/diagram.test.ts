// The hold-entry teaching diagram is drawn north-up in the real geometry and always shows the AIM entry.
import { it, expect } from 'vitest';
import { holdDiagramSvg } from '../src/train/diagram';
import { holdEntry } from '../src/nav/holding';

it('shows the AIM 5-3-8 entry and the clearance geometry for any hold and arrival', () => {
  for (let k = 0; k < 200; k++) {
    const inbound = (k * 37) % 360 || 360, turn = k % 2 ? 'R' : 'L', course = (k * 53 + 11) % 360;
    const svg = holdDiagramSvg(inbound, turn as 'R' | 'L', 'ARD', course);
    expect(svg).toContain(`YOUR ENTRY: ${holdEntry(inbound, turn as 'R' | 'L', course)}`);
    expect(svg).toContain('north up');
    expect(svg).not.toMatch(/NaN|undefined/);
  }
  // 'Hold EAST of ARD on the 090 radial, right turns' = inbound 270: the caption says east
  expect(holdDiagramSvg(270, 'R', 'ARD', 120)).toContain('Hold east of ARD');
});
