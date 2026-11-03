// Line icon set (24-unit grid, 1.6 stroke, round joins) — replaces emoji in the UI.
// Any UI string that starts with one of the mapped emoji is rendered as icon + text by `h()`.
const P: Record<string, string> = {
  home: 'M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  approach: 'M3 6l11 7M14 13l7 4M4 20h16M15 20l1.5-3M9 20l.5-1',
  depart: 'M3 18l18-0M5 14l14-7M13 7.5l3-1.5 2 1-6 4',
  route: 'M5 18a2 2 0 1 0 0-.01M19 6a2 2 0 1 0 0-.01M7 17l3-6 4 2 4-6',
  hold: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM12 7l2-2M12 7l2 2',
  tools: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  attitude: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3.5 13.5h17M8 11h8M12 3v3',
  warning: 'M12 4l9 16H3zM12 10v4M12 17v.01',
  badge: 'M12 3l2.5 2 3.2-.3.6 3.1 2.6 1.9-1.5 2.8 1 3-3 1-1.3 2.9-3-1-3 1-1.3-2.9-3-1 1-3L3 9.7l2.6-1.9.6-3.1 3.2.3zM9 12l2 2 4-4',
  plane: 'M2.5 13.5l7-1.5 4.5-7.5h2l-2 7.5 6-1.2 1.5-2.3h1.5l-1 4 1 4h-1.5L20 14.2l-6-1.2 2 7.5h-2L9.5 13z',
  stopwatch: 'M12 8v5l3 2M9 2h6M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h6',
  document: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L3.5 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5',
  check: 'M4 12l5 5L20 6',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dusk: 'M3 18h18M6 14a6 6 0 0 1 12 0M12 4v3M4.2 8.2l2 2M19.8 8.2l-2 2M5 21h14',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  dice: 'M5 5h14v14H5zM9 9v.01M15 15v.01M15 9v.01M9 15v.01M12 12v.01',
  screen: 'M3 5h18v12H3zM8 21h8M12 17v4',
  gauge: 'M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18zM12 12l4-4M7 16h10',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  instructor: 'M12 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6M5 20a7 7 0 0 1 14 0M19 4h2v4',
  feather: 'M20 4C10 4 6 10 6 18l-2 2M6 18c6 0 12-4 14-14M10 14h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  joystick: 'M12 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 8v7M6 15h12l1 5H5z',
  compass: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5z',
};
const EMOJI: Record<string, string> = {
  '🏠': 'home', '🛬': 'approach', '🛫': 'depart', '🧭': 'route', '🔁': 'hold', '🛠️': 'tools', '🛠': 'tools', '🎯': 'target', '⚠️': 'warning', '⚠': 'warning',
  '🎓': 'badge', '✈️': 'plane', '✈': 'plane', '🛩️': 'plane', '⚡': 'stopwatch', '📋': 'clipboard', '📄': 'document', '✋': 'hand', '✅': 'check',
  '📍': 'pin', '☀️': 'sun', '🌇': 'dusk', '🌙': 'moon', '🎲': 'dice', '🖥️': 'screen', '⏱️': 'gauge', '🧑‍🏫': 'instructor', '🕊️': 'feather', '🔗': 'link', '🕹️': 'joystick',
};
const KEYS = Object.keys(EMOJI).sort((a, b) => b.length - a.length);

export function svgIcon(name: string, size = 16): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'ico');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', P[name] ?? P.plane);
  s.append(p);
  return s;
}

/** Split a leading emoji off a UI string: returns [iconName, rest] or null. */
export function leadingEmoji(t: string): [string, string] | null {
  for (const k of KEYS) if (t.startsWith(k)) return [EMOJI[k], t.slice(k.length).replace(/^\s+/, '')];
  return null;
}
