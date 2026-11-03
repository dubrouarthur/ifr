// Automatic aural callouts like a modern transport / glass GA aircraft: radio-altitude callouts, approaching
// minimums / minimums (baro), retard, and GPWS-style alerts (sink rate, pull up, glideslope, bank angle).
// Pure logic: update() returns the clip ids to play; the audio layer plays /audio/callouts/<id>.mp3.

export type CalloutProfile = 'off' | 'ga' | 'airline';

export interface CalloutInput {
  aglFt: number;
  baroAltFt: number;
  vsFpm: number;
  minimums: number | null;
  onGround: boolean;
  bankDeg: number;
  gsDots: number | null; // + = aircraft below the glideslope (fly up)
  approachActive: boolean;
  throttle: number;
  stall: boolean;
}

const RA_AIRLINE = [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10];
const RA_GA = [500];

export class CalloutMonitor {
  profile: CalloutProfile = 'ga';
  private armed = new Set<string>();
  private cooldown: Record<string, number> = {};
  private t = 0;
  private lastAgl = Infinity;

  reset() {
    this.armed.clear();
    this.cooldown = {};
    this.lastAgl = Infinity;
  }

  update(dt: number, s: CalloutInput): string[] {
    this.t += dt;
    if (this.profile === 'off') return [];
    const out: string[] = [];
    const say = (id: string, repeat = 0) => {
      if (repeat > 0) {
        if ((this.cooldown[id] ?? -1e9) + repeat > this.t) return;
        this.cooldown[id] = this.t;
      }
      out.push(id);
    };
    const descending = s.vsFpm < -100;
    if (s.onGround) {
      this.lastAgl = s.aglFt;
      // re-arm everything on the ground for the next approach
      for (const k of [...this.armed]) this.armed.delete(k);
      return out;
    }
    // radio altitude callouts: fire when descending through a threshold; re-arm 200 ft above it
    const ra = this.profile === 'airline' ? RA_AIRLINE : RA_GA;
    for (const h of ra) {
      const key = `ra${h}`;
      if (s.aglFt > h + Math.max(15, Math.min(200, h * 0.1))) this.armed.add(key);
      if (this.armed.has(key) && descending && this.lastAgl >= h && s.aglFt < h) {
        this.armed.delete(key);
        say(String(h));
      }
    }
    // minimums (baro)
    if (s.minimums !== null) {
      const above = s.baroAltFt - s.minimums;
      if (above > 250) {
        this.armed.add('plus100');
        this.armed.add('minimums');
      }
      if (this.armed.has('plus100') && descending && above < 100 && above > 20) {
        this.armed.delete('plus100');
        say('plus100');
      }
      if (this.armed.has('minimums') && descending && above <= 0) {
        this.armed.delete('minimums');
        say('minimums');
      }
    }
    // retard (airline): 20 ft with power still above idle
    if (this.profile === 'airline' && s.aglFt < 22 && s.aglFt > 2 && descending && s.throttle > 0.08) say('retard', 2.5);
    // GPWS mode 1: excessive descent rate (simplified envelope)
    if (s.aglFt < 2450 && s.aglFt > 30) {
      const limSink = 1000 + s.aglFt * 0.9; // sink rate boundary
      const limPull = 1500 + s.aglFt * 1.4; // pull up boundary
      if (-s.vsFpm > limPull) say('pullup', 1.6);
      else if (-s.vsFpm > limSink) say('sinkrate', 2.5);
    }
    // GPWS mode 5: below the glideslope on an ILS approach
    if (s.approachActive && s.gsDots !== null && s.aglFt < 1000 && s.aglFt > 50 && s.gsDots > 1.3) say('glideslope', 3);
    // bank angle
    if (Math.abs(s.bankDeg) > (s.aglFt < 150 ? 15 : 40) && s.aglFt > 5) say('bankangle', 3);
    if (this.profile === 'airline' && s.stall) say('stall', 1.2);
    this.lastAgl = s.aglFt;
    return out;
  }
}
