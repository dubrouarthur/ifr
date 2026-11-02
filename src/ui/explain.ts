// "Explain mode": labelled hotspots over every instrument, per cockpit type.
import { h, clear } from './dom';

type R = [number, number, number, number, string, string]; // x, y, w, h (logical 1024×768), title, explanation

const G1000_PFD: R[] = [
  [0, 0, 1024, 52, 'NAV / COM & GPS bar', 'Left: NAV1/NAV2 active (green = on the CDI) ↔ standby. Centre: next GPS waypoint, distance, desired track (DTK) and actual track (TRK). Right: COM radios.'],
  [250, 53, 524, 28, 'Autopilot annunciator', 'Green = active modes (lateral left, vertical right). White = armed, waiting to capture (e.g. LOC, GS, ALTS).'],
  [120, 92, 96, 384, 'Airspeed tape', 'Indicated airspeed in the box. Magenta line = 6-second trend. Colour bands: white flaps range, green normal, yellow caution, red VNE. TAS below.'],
  [232, 90, 540, 360, 'Attitude indicator', 'Pitch ladder and bank scale. Yellow chevron = your aircraft; magenta bars = flight director command. With SVT: terrain, runways and the green flight-path marker (where you are actually going).'],
  [740, 66, 150, 410, 'Altimeter & vertical deviation', 'Altitude in the box; selected altitude (cyan) on top; altimeter setting below; minimums bug. On the left: glideslope (green G) or glidepath (magenta V) diamond — fly toward it.'],
  [892, 118, 56, 300, 'Vertical speed', 'Feet per minute. Cyan bug = selected VS in VS mode.'],
  [360, 440, 310, 300, 'HSI', 'Rotating compass. Cyan bug = heading bug. Course arrow + deviation bar (green VOR/LOC, magenta GPS): fly toward the bar. Triangle = TO/FROM. Cyan needles = bearing pointers (BRG1/BRG2). Magenta diamond = ground track.'],
  [120, 470, 112, 56, 'Wind', 'Arrow = wind relative to the nose, direction/speed. ▼ headwind / ▲ tailwind and ◀▶ crosswind components (amber when large).'],
  [6, 534, 236, 176, 'Inset map', 'Moving map with the flight plan (magenta = active leg). INSET softkey toggles it.'],
  [786, 462, 106, 56, 'Minimums', 'Barometric minimums (DA/MDA). “MINIMUMS” flashes yellow when you descend below it.'],
  [0, 744, 1024, 24, 'Softkeys', 'Click the label (or the physical key under the screen): INSET, SVT, bearing pointers, CDI source, DME window, timer, transponder, minimums.'],
];
const G1000_MFD: R[] = [
  [0, 54, 152, 690, 'Engine indication', 'RPM, fuel flow, oil, EGT, vacuum, fuel quantity, flaps and trim position.'],
  [156, 54, 560, 690, 'Navigation map', 'North-up moving map with terrain (red = within 100 ft of your altitude, yellow = within 1000 ft, blue = sea), navaids, fixes and the flight plan. RANGE knob or wheel to zoom.'],
  [718, 54, 306, 690, 'Active flight plan', 'Waypoints with desired track, distance and altitude constraints. Magenta arrow = active leg. Bottom: approach status and CDI scale (ENR 2 NM · TERM 1 NM · APR 0.3 NM).'],
];
const STEAM_LEFT: R[] = [
  [30, 90, 292, 292, 'Airspeed', 'Knots. White arc = flap range, green = normal, yellow = caution, red line = never exceed.'],
  [366, 90, 292, 292, 'Attitude indicator', 'Miniature aircraft against the horizon; bank index at the top. Vacuum-driven: tumbles on a vacuum (AHRS) failure — use the turn coordinator and compass.'],
  [702, 90, 292, 292, 'Altimeter', 'Long hand = hundreds, short = thousands, thin = ten-thousands. Kollsman window = altimeter setting.'],
  [30, 432, 292, 292, 'Turn coordinator', 'Wings on the L/R mark = standard-rate turn (3°/s, 2 minutes for 360°). Ball = coordination: step on the ball.'],
  [366, 432, 292, 292, 'HSI / DG', 'Heading under the lubber line; orange heading bug. Course arrow + deviation bar; yellow side pointers = glideslope.'],
  [702, 432, 292, 292, 'Vertical speed', 'Hundreds of feet per minute, up or down.'],
  [0, 0, 1024, 60, 'Markers, compass & warnings', 'Outer-marker light (blue, flashing over MARLO), wet magnetic compass (lags and leads in turns), warning lights.'],
];
const STEAM_RIGHT: R[] = [
  [46, 60, 300, 300, 'CDI (VOR / LOC / GS)', 'OBS card set with CRS. Vertical needle = course deviation, horizontal needle = glideslope. TO/FROM flag. Follows the CDI source (NAV1, NAV2 or GPS).'],
  [46, 410, 300, 300, 'RMI', 'Compass card turns with heading. Yellow single needle = ADF (points to the NDB), green double needle = VOR2.'],
  [400, 54, 610, 236, 'GPS', 'Mini-map plus next waypoint, distance, DTK, track, ground speed and ETE.'],
  [400, 298, 610, 142, 'NAV/COM radios', 'Active (bright) and standby (dim) frequencies. NAV identifier shown when a station is received.'],
  [400, 446, 610, 110, 'ADF & DME', 'ADF frequency/timer; DME distance, ground speed and time to the station (NAV1).'],
  [400, 562, 610, 76, 'Autopilot (KAP 140 style)', 'Active lateral/vertical modes and armed modes; selected altitude or VS.'],
  [400, 644, 610, 116, 'Transponder & engine', 'Squawk code and mode; tachometer, fuel flow, oil temperature and fuel.'],
];
const AL_PFD: R[] = [
  [200, 6, 600, 92, 'Flight mode annunciator', 'Thrust · roll · pitch modes: green = engaged, white = armed. CMD = autopilot engaged, FD = flight director only.'],
  [110, 120, 110, 460, 'Speed tape', 'IAS box, magenta selected speed (bug), red/black barber pole above VNE and red low-speed band.'],
  [300, 130, 400, 420, 'Attitude (ADI)', 'Aircraft symbol, magenta FD bars, LOC scale below and GS scale on the right (magenta diamonds), radio altitude, BARO minimums.'],
  [740, 110, 150, 470, 'Altitude tape', 'Altitude box, magenta selected altitude on top, altimeter setting below, green minimums line.'],
  [890, 150, 80, 380, 'Vertical speed', 'Pointer from the left edge; value shown above 400 fpm.'],
  [220, 600, 560, 160, 'Heading', 'Heading box, magenta selected heading, white track line.'],
];
const AL_ND: R[] = [[0, 0, 1024, 768, 'Navigation display (MAP)', 'Heading-up arc: route (magenta = active), waypoints with constraints, navaids, ILS course (dashed). Top left: ground speed, TAS and wind; top right: next waypoint, ETA and distance.']];

export class ExplainOverlay {
  on = false;
  constructor(private left: HTMLElement, private right: HTMLElement) {}
  set(on: boolean, cockpit: 'g1000' | 'steam' | 'airliner') {
    this.on = on;
    for (const s of [this.left, this.right]) s.querySelector('.explain')?.remove();
    if (!on) return;
    const sets: [HTMLElement, R[]][] = cockpit === 'g1000' ? [[this.left, G1000_PFD], [this.right, G1000_MFD]] : cockpit === 'steam' ? [[this.left, STEAM_LEFT], [this.right, STEAM_RIGHT]] : [[this.left, AL_PFD], [this.right, AL_ND]];
    for (const [screen, regions] of sets) {
      const layer = h('div', { class: 'explain' });
      for (const [x, y, w, hh, title, text] of regions) {
        layer.append(
          h('div', { class: `hot${y + hh > 560 ? ' up' : ''}`, style: `left:${(x / 1024) * 100}%;top:${(y / 768) * 100}%;width:${(w / 1024) * 100}%;height:${(hh / 768) * 100}%` },
            h('span', { class: 'tag' }, title),
            h('div', { class: 'tip' }, h('b', {}, title), h('span', {}, text)),
          ),
        );
      }
      screen.append(layer);
    }
  }
}

// ------------------------------------------------------------------ guided tour
export interface TourStep {
  sel: string;
  title: string;
  text: string;
}

export class Tour {
  private i = 0;
  private veil: HTMLElement;
  private spot: HTMLElement;
  private card: HTMLElement;
  constructor(private steps: TourStep[], private onEnd: () => void) {
    this.spot = h('div', { class: 'tour-spot' });
    this.card = h('div', { class: 'tour-card', role: 'dialog' });
    this.veil = h('div', { class: 'tour' }, this.spot, this.card);
  }
  start() {
    this.i = 0;
    document.body.append(this.veil);
    this.show();
    window.addEventListener('resize', this.reposition);
  }
  private reposition = () => this.show();
  private end() {
    this.veil.remove();
    window.removeEventListener('resize', this.reposition);
    this.onEnd();
  }
  private show() {
    const st = this.steps[this.i];
    const el = document.querySelector(st.sel) as HTMLElement | null;
    const r = el?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2 - 100, innerHeight / 2 - 50, 200, 100);
    const pad = 8;
    Object.assign(this.spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    clear(this.card);
    this.card.append(
      h('div', { class: 'tour-k' }, `${this.i + 1} / ${this.steps.length}`),
      h('h3', {}, st.title),
      h('p', {}, st.text),
      h('div', { class: 'tour-dots' }, ...this.steps.map((_, k) => h('i', { class: k === this.i ? 'on' : '' }))),
      h('div', { class: 'tour-btns' },
        h('button', { class: 'btn ghost', onclick: () => this.end() }, 'Skip tour'),
        h('span', { style: 'flex:1' }),
        this.i > 0 ? h('button', { class: 'btn', onclick: () => { this.i--; this.show(); } }, '← Back') : h('span', {}),
        h('button', { class: 'btn primary', onclick: () => { if (this.i < this.steps.length - 1) { this.i++; this.show(); } else this.end(); } }, this.i < this.steps.length - 1 ? 'Next →' : 'Start flying ✈'),
      ),
    );
    // place the card below or above the spotlight, inside the viewport
    const cw = Math.min(380, innerWidth - 32);
    const below = r.bottom + 16 + 220 < innerHeight;
    const left = Math.max(16, Math.min(innerWidth - cw - 16, r.left + r.width / 2 - cw / 2));
    Object.assign(this.card.style, { width: `${cw}px`, left: `${left}px`, top: below ? `${r.bottom + 16}px` : 'auto', bottom: below ? 'auto' : `${innerHeight - r.top + 16}px` });
  }
}
