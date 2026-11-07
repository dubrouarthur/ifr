// Line icon set (24-unit grid, 1.6 stroke, round joins) — replaces emoji in the UI.
// Any UI string that starts with one of the mapped emoji is rendered as icon + text by `h()`.
const P = {
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
  plus: 'M12 5v14M5 12h14',
  slides: 'M3 4h18v13H3zM12 17v4M8 21h8M7 8h6M7 11.5h10',
  gauge: 'M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18zM12 12l4-4M7 16h10',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  instructor: 'M12 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6M5 20a7 7 0 0 1 14 0M19 4h2v4',
  feather: 'M20 4C10 4 6 10 6 18l-2 2M6 18c6 0 12-4 14-14M10 14h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  joystick: 'M12 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 8v7M6 15h12l1 5H5z',
  compass: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5z',
  // application chrome (top bar, menus, pedestal)
  layout: 'M3 4h18v16H3zM3 11h18M9 11v9',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  tablet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 18h4',
  plan: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8.5 17.5a1 1 0 1 0 0-.01M15.5 10.5a1 1 0 1 0 0-.01M9.5 16.5l5-5',
  keypad: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM7 6h10v4H7zM7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01M16.5 17h.01',
  pattern: 'M6 7h12a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6zM3 19h18M12 13v6',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17v.01',
  keyboard: 'M3 6h18v12H3zM6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M6.5 12.5h.01M17 12.5h.01M8 15h8M10 12.5h4',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  sound: 'M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13',
  mute: 'M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  learn: 'M2 9l10-5 10 5-10 5-10-5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
  records: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  direct: 'M4 12h13M13 7l5 5-5 5M20 5v14',
  restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  rate: 'M12 13l4-5M5 18a8 8 0 1 1 14 0',
  chevDown: 'M6 9l6 6 6-6',
  chevUp: 'M6 15l6-6 6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  // pedestal: a toggle switch (aircraft switch panel)
  toggle: 'M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7zM16 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  // cameras (view dock): windshield, aircraft from behind, orbit, control tower, fly-by camera
  camCockpit: 'M3 17c2.5-6 5.5-9 9-9s6.5 3 9 9M3 17h18M12 8v9M8 12.5l-1.5 4.5M16 12.5l1.5 4.5',
  camChase: 'M2 13h20M12 10.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 10.5V6M9.5 18.5h5',
  camOrbit: 'M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5c-2 0-3.8-.3-5.3-.9M6.7 15.6L5 18M6.7 15.6l2.8.3',
  camTower: 'M8 4h8l-1 5H9zM10 9l-1 12M14 9l1 12M7 21h10M9.5 14h5',
  camFlyby: 'M3 8h10v8H3zM13 11l5-3v8l-5-3M16 4l4 0M18 2l2 2-2 2',
  menu: 'M4 7h16M4 12h16M4 17h16',
};
/** icon names, for `svgIcon(I.check)` */
export const I = Object.fromEntries(Object.keys(P).map((k) => [k, k])) as { [K in keyof typeof P]: K };
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
  p.setAttribute('d', (P as Record<string, string>)[name] ?? P.plane);
  s.append(p);
  return s;
}

/** Split a leading emoji off a UI string: returns [iconName, rest] or null. */
export function leadingEmoji(t: string): [string, string] | null {
  for (const k of KEYS) if (t.startsWith(k)) return [EMOJI[k], t.slice(k.length).replace(/^\s+/, '')];
  return null;
}
