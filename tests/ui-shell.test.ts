import { describe, it, expect, afterEach } from 'vitest';
import { introWanted, INTRO_SKIP_KEY } from '../src/ui/intro';

// a minimal localStorage for the intro's "skip" preference (the test environment has no DOM)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const loc = (search = '', hash = '') => ({ search, hash });

describe('intro (start page)', () => {
  afterEach(() => mem.clear());

  it('shows at a normal launch', () => {
    expect(introWanted(loc(), {})).toBe(true);
  });

  it('is skipped when the user asked for it', () => {
    localStorage.setItem(INTRO_SKIP_KEY, 'true');
    expect(introWanted(loc(), {})).toBe(false);
  });

  it('never covers a deep link into a flight', () => {
    expect(introWanted(loc('?scenario=ils27-vtf'), {})).toBe(false);
    expect(introWanted(loc('', '#circuit=abc'), {})).toBe(false);
    expect(introWanted(loc('?intro=0'), {})).toBe(false);
  });

  it('stays out of automated browsers unless forced', () => {
    expect(introWanted(loc(), { webdriver: true })).toBe(false);
    expect(introWanted(loc('?intro=1'), { webdriver: true })).toBe(true);
    localStorage.setItem(INTRO_SKIP_KEY, 'true');
    expect(introWanted(loc('?intro=1'), {})).toBe(true);
  });
});
