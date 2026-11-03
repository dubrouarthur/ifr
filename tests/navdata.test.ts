// Sanity checks of the generated real-world navigation database (OurAirports + FAA CIFP).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const J = (p: string) => JSON.parse(fs.readFileSync(`public/navdata/${p}`, 'utf8'));

describe('real-world navdata', () => {
  it('index lists thousands of airports, with procedure flags', () => {
    const idx = J('index.json');
    expect(idx.length).toBeGreaterThan(5000);
    const sfo = idx.find((r: unknown[]) => r[0] === 'KSFO');
    expect(sfo[1]).toMatch(/San Francisco/i);
    expect(sfo[7] & 4).toBe(4); // has procedures
    expect(idx.find((r: unknown[]) => r[0] === 'LFPG')).toBeTruthy(); // worldwide airports
  });
  it('KSFO ILS 28R matches the published procedure', () => {
    const aps = J('proc/KSFO.json');
    const a = aps.find((x: { id: string }) => x.id === 'KSFO-I28R');
    expect(a.type).toBe('ILS');
    expect(a.navaid).toBe('IGWQ');
    const faf = a.final.find((l: { role?: string }) => l.role === 'FAF');
    expect(faf.fix.ident).toBe('AXMUL');
    expect(faf.altMin).toBe(1800);
    expect(a.final[a.final.length - 1].role).toBe('MAP');
    expect(a.transitions.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(['ARCHI', 'DUMBA']));
    const mahp = a.missed[a.missed.length - 1];
    expect(mahp.fix.ident).toBe('VIKYU');
    expect(mahp.hold.turn).toBe('R');
  });
  it('tiles carry runways, ILS and waypoints', () => {
    const t = J('tiles/35_-125.json');
    const sfo = t.airports.KSFO;
    expect(sfo.runways.length).toBeGreaterThanOrEqual(4);
    expect(sfo.ils.some((l: { id: string; f: number }) => l.id === 'IGWQ' && Math.abs(l.f - 111.7) < 0.01)).toBe(true);
    expect(sfo.magVar).toBeGreaterThan(10);
    expect(t.fixes.length).toBeGreaterThan(100);
  });
});
