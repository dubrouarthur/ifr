// Connections & export: EFB live link, flight-plan / track export, school webhook, chart services.
import { h, clear, store } from './dom';
import { Modal } from './modals';
import type { Sim } from '../sim/sim';
import { DataLink } from '../connect/datalink';
import { garminFpl, xplaneFms, msfsPln, routeGpx, trackGpx, trackKml, trackCsv, download } from '../connect/exports';
import bridgeSrc from '../../tools/efb-bridge.mjs?raw';
import { navigraphConfig, setNavigraphConfig, navigraphSignIn, navigraphSignOut, navigraphRestore, onNavigraph } from '../connect/navigraph';

import { webhookCfg, postWebhook } from '../connect/webhook';
export { webhookCfg, postWebhook };

const EFBS = [
  ['ForeFlight', 'Devices → it appears automatically (GDL 90 / XGPS). Own-ship shows as “IFRTrnr”.'],
  ['Garmin Pilot', 'Settings → Connext / Flight Simulator: enable “Allow flight simulator” (XGPS on 49002).'],
  ['SkyDemon', 'Setup → Third-party devices → GDL 90 (port 4000).'],
  ['FltPlan Go', 'ADS-B → GDL 90 (port 4000).'],
  ['Avare / WingX / iFly', 'GDL 90 on UDP 4000.'],
];

export class ConnectModal extends Modal {
  link = new DataLink();
  constructor(private sim: Sim, private toast: (m: string, k?: 'info' | 'good' | 'warn' | 'bad') => void) {
    super('Connections & export', 'md');
    this.link.url = store.get('ifr.link.url', 'ws://localhost:8765');
    this.link.onChange = () => {
      if (this.isOpen) this.render();
      if (this.link.state === 'on') this.toast('EFB link connected', 'good');
    };
  }
  open() {
    this.render();
    super.open();
  }
  private card(title: string, desc: string, ...kids: (HTMLElement | string | null)[]) {
    return h('section', { class: 'cx-card' }, h('div', { class: 'cx-h' }, h('b', {}, title), h('span', {}, desc)), ...kids);
  }
  private render() {
    clear(this.body);
    clear(this.foot);
    const fp = this.sim.fp;
    const rec = this.sim.rec;
    const hasPlan = fp.wpts.length >= 2;
    const hasTrack = rec.samples.length > 5;

    // ---- EFB live link
    const st = this.link.state;
    const url = h('input', { type: 'text', value: this.link.url, spellcheck: 'false' }) as HTMLInputElement;
    url.addEventListener('keydown', (e) => e.stopPropagation());
    const cmd = 'node efb-bridge.mjs';
    this.body.append(
      this.card('EFB live link', 'Show the simulated aircraft on ForeFlight, Garmin Pilot, SkyDemon, FltPlan Go, Avare… (GDL 90 + XGPS, like X-Plane).',
        h('ol', { class: 'cx-steps' },
          h('li', {}, 'Download the bridge and run it on this computer (Node 18+, no install): ', h('code', {}, cmd), ' ', h('button', { class: 'btn', onclick: () => download(bridgeSrc, 'efb-bridge.mjs', 'text/javascript') }, 'Download bridge'), ' ', h('button', { class: 'btn', onclick: () => { void navigator.clipboard?.writeText(cmd); this.toast('Command copied'); } }, 'Copy command')),
          h('li', {}, 'Connect the simulator to the bridge:'),
        ),
        h('div', { class: 'cx-row' },
          url,
          st === 'on'
            ? h('button', { class: 'btn danger', onclick: () => this.link.disconnect() }, 'Disconnect')
            : h('button', { class: 'btn primary', onclick: () => { store.set('ifr.link.url', url.value); this.link.connect(url.value); } }, st === 'connecting' ? 'Connecting…' : 'Connect'),
          h('span', { class: `cx-state ${st}` }, st === 'on' ? `● Live · ${this.link.sent} reports sent` : st === 'connecting' ? '● Connecting' : st === 'error' ? '● Error' : '● Off'),
        ),
        this.link.error ? h('p', { class: 'cx-err' }, this.link.error) : null,
        h('details', {}, h('summary', {}, '3. Set up your EFB (tablet on the same Wi-Fi)'), h('table', { class: 'items' }, ...EFBS.map(([a, b]) => h('tr', {}, h('td', {}, h('b', {}, a)), h('td', { class: 'muted' }, b))))),
        h('p', { class: 'muted cx-note' }, 'The Ardent Islands are fictional (mid-Atlantic coordinates): your EFB shows the aircraft over open ocean, which is fine for attitude, track and ownship display. Use the Charts drawer for the procedures.'),
      ),
    );

    // ---- Flight plan export
    const name = fp.approach ? `${fp.approach.airport}_${fp.approach.name}`.replace(/[^\w-]+/g, '_') : 'ifr_trainer_route';
    this.body.append(
      this.card('Export the flight plan', hasPlan ? `${fp.wpts.length} waypoints: ${fp.wpts.map((w) => w.ident).join(' ')}` : 'Load a route or an approach first.',
        h('div', { class: 'cx-row wrap' },
          h('button', { class: 'btn tile', disabled: !hasPlan, onclick: () => download(garminFpl(fp), `${name}.fpl`, 'application/xml') }, 'Garmin .fpl', h('small', {}, 'ForeFlight · Garmin Pilot · GTN')),
          h('button', { class: 'btn tile', disabled: !hasPlan, onclick: () => download(xplaneFms(fp, this.sim.ap.altSel), `${name}.fms`, 'text/plain') }, 'X-Plane .fms', h('small', {}, 'X-Plane 11/12')),
          h('button', { class: 'btn tile', disabled: !hasPlan, onclick: () => download(msfsPln(fp, this.sim.ap.altSel), `${name}.pln`, 'application/xml') }, 'MSFS .pln', h('small', {}, 'Flight Simulator')),
          h('button', { class: 'btn tile', disabled: !hasPlan, onclick: () => download(routeGpx(fp), `${name}.gpx`, 'application/gpx+xml') }, 'GPX route', h('small', {}, 'any GPS / map app')),
        ),
      ),
    );

    // ---- Track export
    const iso = new Date(Date.now() - (rec.samples[rec.samples.length - 1]?.t ?? 0) * 1000).toISOString();
    this.body.append(
      this.card('Export the flown track', hasTrack ? `${rec.samples.length} samples (2 Hz) of this flight.` : 'Fly a few minutes first.',
        h('div', { class: 'cx-row wrap' },
          h('button', { class: 'btn tile', disabled: !hasTrack, onclick: () => download(trackGpx(rec.samples, iso), 'ifr_trainer_track.gpx', 'application/gpx+xml') }, 'GPX track', h('small', {}, 'CloudAhoy · ForeFlight · Garmin')),
          h('button', { class: 'btn tile', disabled: !hasTrack, onclick: () => download(trackKml(rec.samples), 'ifr_trainer_track.kml', 'application/vnd.google-earth.kml+xml') }, 'KML 3D track', h('small', {}, 'Google Earth')),
          h('button', { class: 'btn tile', disabled: !hasTrack, onclick: () => download(trackCsv(rec.samples), 'ifr_trainer_track.csv', 'text/csv') }, 'CSV data', h('small', {}, 'Excel · analysis')),
        ),
      ),
    );

    // ---- Webhook
    const cfg = webhookCfg();
    const wh = h('input', { type: 'url', value: cfg.url, placeholder: 'https://hooks.zapier.com/… or your school’s endpoint', spellcheck: 'false' }) as HTMLInputElement;
    wh.addEventListener('keydown', (e) => e.stopPropagation());
    const auto = h('input', { type: 'checkbox', checked: cfg.auto }) as HTMLInputElement;
    const result = h('span', { class: 'muted' }, '');
    this.body.append(
      this.card('School webhook', 'POST every debrief (student, scenario, ACS result, score, failed tasks) as JSON to your school’s system — FlightLogger, Flight Schedule Pro via Zapier/Make, an LMS or a spreadsheet.',
        h('div', { class: 'cx-row' }, wh, h('button', { class: 'btn', onclick: () => { store.set('ifr.webhook', { url: wh.value.trim(), auto: auto.checked }); this.toast('Webhook saved', 'good'); } }, 'Save'), h('button', { class: 'btn', onclick: async () => { store.set('ifr.webhook', { url: wh.value.trim(), auto: auto.checked }); result.textContent = 'Sending…'; result.textContent = await postWebhook({ type: 'test', app: 'IFR Trainer', at: new Date().toISOString() }); } }, 'Send test')),
        h('label', { class: 'fc-check' }, auto, ' Send automatically after every debrief'),
        result,
      ),
    );

    // ---- Chart services
    this.body.append(
      this.card('Charts & planning services', 'Real-world chart subscriptions for study alongside the simulator.',
        h('div', { class: 'cx-row wrap' },
          h('a', { class: 'btn', href: 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/', target: '_blank', rel: 'noopener' }, 'FAA d-TPP ↗'),
          h('a', { class: 'btn', href: 'https://www.sia.aviation-civile.gouv.fr/', target: '_blank', rel: 'noopener' }, 'SIA (France) ↗'),
          h('a', { class: 'btn', href: 'https://www.simbrief.com/', target: '_blank', rel: 'noopener' }, 'SimBrief ↗'),
        ),
      ),
    );
    this.body.append(this.navigraphCard());
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'));
  }

  /** Navigraph account: device-flow sign-in; charts then appear in the EFB (source: Navigraph) */
  private navigraphCard(): HTMLElement {
    const chip = h('span', { class: 'ng-chip' });
    const line = h('p', { class: 'muted cx-note ng-line' });
    const code = h('div', { class: 'ng-code' });
    const cfg = navigraphConfig();
    const id = h('input', { type: 'text', placeholder: 'Client ID', value: cfg?.clientId ?? '', spellcheck: 'false' }) as HTMLInputElement;
    const sec = h('input', { type: 'password', placeholder: 'Client secret', value: cfg?.clientSecret ?? '' }) as HTMLInputElement;
    for (const i of [id, sec]) i.addEventListener('keydown', (e) => e.stopPropagation());
    const creds = h('div', { class: 'ng-creds', hidden: true },
      h('p', { class: 'muted cx-note' }, 'Navigraph requires an application client (developers.navigraph.com). Schools deploying this simulator set VITE_NAVIGRAPH_CLIENT_ID / VITE_NAVIGRAPH_CLIENT_SECRET at build time; or enter them here (stored in this browser).'),
      h('div', { class: 'cx-row' }, id, sec, h('button', { class: 'btn', onclick: () => { setNavigraphConfig(id.value.trim() && sec.value.trim() ? { clientId: id.value.trim(), clientSecret: sec.value.trim() } : null); this.toast('Navigraph credentials saved', 'good'); void navigraphRestore(); } }, 'Save')));
    const credBtn = h('button', { class: 'btn link', 'aria-expanded': 'false', onclick: () => { creds.hidden = !creds.hidden; credBtn.setAttribute('aria-expanded', String(!creds.hidden)); if (!creds.hidden) id.focus(); } }, 'Enter developer credentials…');
    const signIn = h('button', { class: 'btn primary', onclick: () => void navigraphSignIn((p) => { clear(code); code.append(h('span', {}, 'Open'), h('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.url.replace(/^https?:\/\//, '').slice(0, 48)), h('span', {}, 'and confirm the code'), h('b', {}, p.code)); }) }, 'Sign in with Navigraph');
    const signOut = h('button', { class: 'btn', onclick: () => void navigraphSignOut() }, 'Sign out');
    const charts = h('a', { class: 'btn', href: 'https://charts.navigraph.com/', target: '_blank', rel: 'noopener' }, 'Navigraph Charts ↗');
    onNavigraph((s, u) => {
      chip.className = `ng-chip ${s}`;
      chip.textContent = { unconfigured: 'Not available', 'signed-out': 'Signed out', pending: 'Waiting for confirmation', 'signed-in': `Signed in${u?.preferred_username ? ' · ' + u.preferred_username : ''}`, error: 'Sign-in failed' }[s];
      line.textContent = s === 'unconfigured' ? 'Navigraph sign-in is not enabled in this build. You can still open Navigraph Charts in a new tab.' : '';
      line.hidden = s !== 'unconfigured';
      signIn.style.display = s === 'signed-in' || s === 'unconfigured' ? 'none' : '';
      signOut.style.display = s === 'signed-in' ? '' : 'none';
      credBtn.style.display = s === 'signed-in' ? 'none' : '';
      if (s === 'signed-in') clear(code);
      code.hidden = !code.childNodes.length;
    });
    new MutationObserver(() => (code.hidden = !code.childNodes.length)).observe(code, { childList: true });
    return h('section', { class: 'cx-card ng-card' },
      h('div', { class: 'cx-h' }, h('div', { class: 'ng-title' }, h('b', {}, 'Navigraph'), chip), h('span', {}, 'Sign in with your Navigraph subscription to read the real charts (Jeppesen-based, worldwide) in the EFB — own-ship is drawn on georeferenced charts.')),
      line,
      h('div', { class: 'cx-row wrap' }, signIn, signOut, charts, h('span', { class: 'grow' }), credBtn),
      code,
      creds,
    );
  }
}
