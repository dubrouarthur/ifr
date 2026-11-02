import { describe, it, expect } from 'vitest';
import { approachPlate, airportDiagram } from '../src/plates/plates';
import { APPROACHES, AIRPORTS } from '../src/nav/data';

describe('plates', () => {
  for (const ap of APPROACHES) {
    it(`renders ${ap.id}`, () => {
      const svg = approachPlate(ap);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(ap.name);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      for (const l of ap.final) if (l.fix.kind !== 'runway') expect(svg).toContain(l.fix.ident);
    });
  }
  for (const a of AIRPORTS) it(`airport diagram ${a.icao}`, () => {
    const svg = airportDiagram(a.icao);
    expect(svg).not.toContain('NaN');
    expect(svg).toContain(a.name);
  });
});
