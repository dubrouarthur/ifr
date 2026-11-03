// Live data link: streams own-ship telemetry over WebSocket to a local bridge (tools/efb-bridge.mjs),
// which re-broadcasts it as GDL 90 / XGPS for EFBs (ForeFlight, Garmin Pilot, SkyDemon, FltPlan Go, Avare…).
import type { Sim } from '../sim/sim';
import { toReal, currentRegion } from '../nav/world';

export type LinkState = 'off' | 'connecting' | 'on' | 'error';

export interface Telemetry {
  type: 'ownship';
  t: number;
  lat: number;
  lon: number;
  altFt: number;
  pressAltFt: number;
  gsKt: number;
  trackDeg: number;
  hdgDeg: number;
  pitchDeg: number;
  rollDeg: number;
  vsFpm: number;
  iasKt: number;
  onGround: boolean;
  callsign: string;
}

export function telemetry(sim: Sim): Telemetry {
  const d = sim.ac.data;
  const s = sim.ac.s;
  const real = toReal(s);
  const mv = currentRegion()?.magVar ?? 0;
  return { type: 'ownship', t: Date.now(), lat: real.lat, lon: real.lon, altFt: s.altFt, pressAltFt: d.pressAltFt, gsKt: d.gsKt, trackDeg: (d.trackTrue + mv + 360) % 360, hdgDeg: (d.hdgTrue + mv + 360) % 360, pitchDeg: d.pitchDeg, rollDeg: d.rollDeg, vsFpm: d.vsFpm, iasKt: d.iasKt, onGround: s.onGround, callsign: 'IFRSIM' };
}

export class DataLink {
  state: LinkState = 'off';
  url = 'ws://localhost:8765';
  error = '';
  sent = 0;
  private ws: WebSocket | null = null;
  private acc = 0;
  onChange?: () => void;

  connect(url: string) {
    this.disconnect();
    this.url = url;
    this.state = 'connecting';
    this.error = '';
    this.onChange?.();
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.state = 'on';
        this.onChange?.();
      };
      ws.onerror = () => {
        this.state = 'error';
        this.error = location.protocol === 'https:' && !/localhost|127\.0\.0\.1/.test(url) ? 'Browsers only allow ws:// to localhost from an https page — run the bridge on this computer.' : 'Could not reach the bridge. Is tools/efb-bridge.mjs running?';
        this.onChange?.();
      };
      ws.onclose = () => {
        if (this.state === 'on') this.state = 'off';
        this.ws = null;
        this.onChange?.();
      };
    } catch (e) {
      this.state = 'error';
      this.error = String(e);
      this.onChange?.();
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.state = 'off';
    this.onChange?.();
  }

  /** call every frame */
  update(sim: Sim, dt: number) {
    if (this.state !== 'on' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.acc += dt;
    if (this.acc < 0.2) return; // 5 Hz
    this.acc = 0;
    this.ws.send(JSON.stringify(telemetry(sim)));
    this.sent++;
  }
}
