// SIDs / STARs of the loaded region: which apply to a runway, and the fix sequence for a runway + transition.
import { TERMINAL } from './data';
import type { TermLeg, TerminalProc } from './types';

/** does a runway-transition name (RW28L, RW28B = 28L and 28R, ALL) serve this runway? */
export function servesRunway(name: string, runway: string): boolean {
  if (!name || name === 'ALL') return true;
  const n = name.replace(/^RW/, '');
  if (n === runway) return true;
  const num = runway.replace(/[LRC]$/, '');
  return n === `${num}B` || n === num;
}

export function sidsFor(airport: string, runway?: string): TerminalProc[] {
  return TERMINAL.filter((p) => p.kind === 'SID' && p.airport === airport && (!runway || !p.rwy.length || p.rwy.some((t) => servesRunway(t.name, runway))));
}
export function starsFor(airport: string): TerminalProc[] {
  return TERMINAL.filter((p) => p.kind === 'STAR' && p.airport === airport);
}
export function terminalProc(airport: string, kind: 'SID' | 'STAR', id: string): TerminalProc | undefined {
  return TERMINAL.find((p) => p.airport === airport && p.kind === kind && p.id === id);
}

/** Full leg sequence: SID = runway transition → common route → enroute transition;
 *  STAR = enroute transition → common route → runway transition. Consecutive duplicates merged. */
export function terminalLegs(p: TerminalProc, runway: string | null, transition: string | null): TermLeg[] {
  const rw = (runway ? p.rwy.find((t) => servesRunway(t.name, runway) && t.name !== 'ALL') ?? p.rwy.find((t) => t.name === 'ALL') : null) ?? (p.rwy.length === 1 ? p.rwy[0] : null);
  const enr = transition ? p.enr.find((t) => t.name === transition) : null;
  const parts = p.kind === 'SID' ? [rw?.legs ?? [], p.common, enr?.legs ?? []] : [enr?.legs ?? [], p.common, rw?.legs ?? []];
  const out: TermLeg[] = [];
  for (const l of parts.flat()) {
    const last = out[out.length - 1];
    if (l.fix && last?.fix?.ident === l.fix.ident) {
      out[out.length - 1] = { ...last, ...l };
      continue;
    }
    out.push(l);
  }
  return out;
}

/** human summary, e.g. "SSTIK5 (RW28B) → PORTE → KAYEX" */
export function terminalSummary(p: TerminalProc, runway: string | null, transition: string | null): string {
  const fixes = terminalLegs(p, runway, transition).filter((l) => l.fix).map((l) => l.fix!.ident);
  return `${p.id}${transition ? `.${transition}` : ''}: ${fixes.join(' ')}`;
}
