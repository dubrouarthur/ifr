// Observes a flight in a hold and grades entry, timing, protection and altitude.
import { bearingDeg, distanceNm, wrap180, norm360 } from '../nav/geo';
import { acceptableEntries, holdEntry, holdFrame, teardropCourse, type HoldDef, type HoldEntry } from '../nav/holding';

export interface HoldSnapshot {
  lat: number;
  lon: number;
  alt: number;
  track: number;
  turnRate: number;
  gsKt: number;
  t: number;
}

export class HoldEvaluator {
  crossedAt: number | null = null;
  arrivalCourse = 0;
  correctEntry: HoldEntry | null = null;
  flownEntry: HoldEntry | null = null;
  /** the correct entry, plus its neighbour when the arrival course is within 5° of a sector boundary (AIM 5-3-8 j) */
  okEntries: HoldEntry[] = [];
  private votes = { TEARDROP: 0 };
  /** heading change (deg) turned opposite to the hold direction before the first lap */
  private oppTurn = 0;
  inboundTimes: number[] = [];
  outboundTimes: number[] = [];
  private inboundStart: number | null = null;
  private outboundStart: number | null = null;
  private lastX = 0;
  laps = 0;
  maxAltDev = 0;
  altOutSec = 0;
  maxNonHoldingSide = 0;
  maxHoldingSide = 0;
  maxOutboundNm = 0;
  private prevBrg: number | null = null;

  constructor(public def: HoldDef) {}

  update(s: HoldSnapshot, dt: number) {
    const h = this.def;
    const d = distanceNm(s, h.fix);
    const fr = holdFrame(h, s);
    const outbound = norm360(h.inbound + 180);
    if (this.crossedAt === null) {
      const brg = bearingDeg(s, h.fix);
      // crossing: very close, or the bearing to the fix swings past abeam
      const swung = this.prevBrg !== null && Math.abs(wrap180(brg - this.prevBrg)) > 100 && d < 1;
      if (d < 0.25 || swung) {
        this.crossedAt = s.t;
        this.arrivalCourse = s.track;
        this.correctEntry = holdEntry(h.inbound, h.turn, s.track);
        this.okEntries = acceptableEntries(h.inbound, h.turn, s.track);
        this.lastX = fr.x;
      }
      this.prevBrg = brg;
      return;
    }
    const t = s.t - this.crossedAt;
    // ---- entry classification (20–90 s after crossing, wings-level segments only)
    if (this.flownEntry === null) {
      if (t > 15 && t < 90 && Math.abs(s.turnRate) < 1 && Math.abs(wrap180(s.track - teardropCourse(h.inbound, h.turn))) < 15 && fr.y > -0.3) this.votes.TEARDROP += dt;
      const sign = h.turn === 'R' ? 1 : -1;
      if (t > 10 && s.turnRate * sign < -1) this.oppTurn += -s.turnRate * sign * dt;
      if (this.laps > 0 || t > 300) {
        this.flownEntry = this.oppTurn > 150 ? 'PARALLEL' : this.votes.TEARDROP > 8 ? 'TEARDROP' : 'DIRECT';
      }
    }
    void outbound;
    // ---- protection & altitude
    if (t > 5) {
      const dev = Math.abs(s.alt - h.altFt);
      this.maxAltDev = Math.max(this.maxAltDev, dev);
      if (dev > 100) this.altOutSec += dt;
    }
    const entryDone = this.laps > 0;
    this.maxNonHoldingSide = Math.max(this.maxNonHoldingSide, entryDone ? -fr.y : -fr.y - 1.2);
    this.maxHoldingSide = Math.max(this.maxHoldingSide, fr.y);
    this.maxOutboundNm = Math.max(this.maxOutboundNm, -fr.x);
    // ---- leg timing
    const onInbound = Math.abs(fr.y) < 0.6 && Math.abs(wrap180(s.track - h.inbound)) < 25 && fr.x < 0 && Math.abs(s.turnRate) < 1.2;
    if (onInbound && this.inboundStart === null) this.inboundStart = s.t;
    if (!onInbound && this.inboundStart !== null && fr.x < -0.5 && Math.abs(wrap180(s.track - h.inbound)) > 40) this.inboundStart = null;
    const onOutbound = fr.y > 0.4 && Math.abs(wrap180(s.track - outbound)) < 25 && Math.abs(s.turnRate) < 1.2;
    if (onOutbound && this.outboundStart === null && fr.x < 0.3) this.outboundStart = s.t;
    if (!onOutbound && this.outboundStart !== null) {
      if (s.t - this.outboundStart > 15) this.outboundTimes.push(s.t - this.outboundStart);
      this.outboundStart = null;
    }
    // fix crossing inbound
    if (this.lastX < 0 && fr.x >= 0 && Math.abs(fr.y) < 0.8) {
      if (this.inboundStart !== null) {
        const it = s.t - this.inboundStart;
        if (it > 15) this.inboundTimes.push(it);
      }
      this.inboundStart = null;
      this.laps++;
    }
    this.lastX = fr.x;
  }

  report(): { label: string; value: string; ok: boolean | null }[] {
    const r: { label: string; value: string; ok: boolean | null }[] = [];
    r.push({ label: 'Correct entry', value: this.correctEntry ?? '—', ok: null });
    r.push({ label: 'Entry flown', value: this.flownEntry ?? (this.crossedAt === null ? 'fix not reached' : 'in progress'), ok: this.flownEntry === null ? null : this.okEntries.includes(this.flownEntry) });
    const lastIn = this.inboundTimes[this.inboundTimes.length - 1];
    r.push({ label: 'Inbound leg time', value: lastIn ? `${Math.round(lastIn)} s (target 60 ± 15)` : '—', ok: lastIn ? Math.abs(lastIn - 60) <= 15 : null });
    r.push({ label: 'Laps completed', value: String(this.laps), ok: this.laps >= 2 ? true : null });
    r.push({ label: 'Altitude ±100 ft', value: `max ${Math.round(this.maxAltDev)} ft`, ok: this.crossedAt === null ? null : this.altOutSec < 5 });
    r.push({ label: 'Protected airspace', value: `non-holding side ${Math.max(0, this.maxNonHoldingSide).toFixed(1)} nm`, ok: this.crossedAt === null ? null : this.maxNonHoldingSide < 0.6 && this.maxHoldingSide < 4.5 });
    return r;
  }
}
