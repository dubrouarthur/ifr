// Wind & turbulence model: winds aloft by layer with veering, surface boundary layer,
// gust surges with direction swing, Dryden-style filtered turbulence, mechanical turbulence near the ground.
import { DEG } from '../nav/geo';

export const KT = 0.514444;

export interface WindLayer {
  /** altitude AGL (ft) for the surface layer = 0, MSL for the layers aloft */
  altFt: number;
  dir: number; // from, degrees true
  kt: number;
  /** extra turbulence in this layer 0..1 */
  turb?: number;
}

export interface WindInputs {
  windDir: number;
  windKt: number;
  gustKt: number;
  turbulence: number;
  aloft?: WindLayer[];
  /** low-level wind shear: change of wind speed (kt) in the lowest 500 ft AGL */
  shearKt?: number;
}

/** Default winds aloft derived from the surface wind: veer ~25–40° and strengthen with height (Ekman spiral). */
export function defaultAloft(w: WindInputs): WindLayer[] {
  const k = Math.max(3, w.windKt);
  return [
    { altFt: 3000, dir: (w.windDir + 25) % 360, kt: Math.round(k * 1.55) },
    { altFt: 6000, dir: (w.windDir + 35) % 360, kt: Math.round(k * 1.9) },
    { altFt: 9000, dir: (w.windDir + 40) % 360, kt: Math.round(k * 2.3) },
  ];
}

function vec(dir: number, kt: number) {
  const to = (dir + 180) * DEG;
  return { e: Math.sin(to) * kt, n: Math.cos(to) * kt };
}
function toDirKt(e: number, n: number) {
  const kt = Math.hypot(e, n);
  const dir = ((Math.atan2(-e, -n) / DEG) + 360) % 360;
  return { dir, kt };
}

/** Steady wind (no gusts/turbulence) at an altitude, by vector interpolation between layers. */
export function steadyWind(w: WindInputs, altMsl: number, agl: number): { e: number; n: number; dir: number; kt: number } {
  const aloft = (w.aloft && w.aloft.length ? w.aloft : defaultAloft(w)).slice().sort((a, b) => a.altFt - b.altFt);
  // surface layer is defined at ~ 33 ft (10 m) AGL; the first aloft layer at its MSL altitude
  const surf = vec(w.windDir, w.windKt);
  const ground = altMsl - agl;
  const pts = [{ h: ground + 33, ...surf }, ...aloft.map((l) => ({ h: Math.max(l.altFt, ground + 300), ...vec(l.dir, l.kt) }))];
  let e: number, n: number;
  if (altMsl <= pts[0].h) {
    // boundary layer: logarithmic profile below 33 ft AGL
    const z0 = 0.15; // m, grass/low crops
    const z = Math.max(z0 * 1.5, agl * 0.3048);
    const f = Math.max(0, Math.log(z / z0) / Math.log(10 / z0));
    e = surf.e * f;
    n = surf.n * f;
  } else if (altMsl >= pts[pts.length - 1].h) {
    e = pts[pts.length - 1].e;
    n = pts[pts.length - 1].n;
  } else {
    let i = 0;
    while (i < pts.length - 2 && altMsl > pts[i + 1].h) i++;
    const a = pts[i];
    const b = pts[i + 1];
    const t = (altMsl - a.h) / (b.h - a.h);
    e = a.e + (b.e - a.e) * t;
    n = a.n + (b.n - a.n) * t;
  }
  // low-level shear: wind decreases (or increases) by shearKt over the lowest 500 ft
  if (w.shearKt && agl < 500) {
    const s = toDirKt(e, n);
    const kt = Math.max(0, s.kt - w.shearKt * (1 - agl / 500));
    const v = vec(s.dir, kt);
    e = v.e;
    n = v.n;
  }
  const r = toDirKt(e, n);
  return { e, n, dir: r.dir, kt: r.kt };
}

/** Gaussian random (Box–Muller) */
function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

export interface WindSample {
  /** air-mass velocity, m/s east/north/up */
  e: number;
  n: number;
  up: number;
  /** displayed wind (from), kt */
  dir: number;
  kt: number;
  /** angular turbulence (rad/s) applied to the airframe */
  p: number;
  q: number;
  /** current gust increment (kt above the mean) */
  gust: number;
}

/** Stateful sampler: gust surges and Dryden-like filtered turbulence. */
export class WindModel {
  private gust = 0; // kt
  private gustTarget = 0;
  private gustPhase: 'idle' | 'rise' | 'hold' | 'decay' = 'idle';
  private gustTimer = 4;
  private gustDirSwing = 0;
  private u = 0;
  private v = 0;
  private w = 0;
  private pr = 0;
  private qr = 0;

  sample(dt: number, wi: WindInputs, altMsl: number, agl: number, tasMs: number, onGround: boolean): WindSample {
    const st = steadyWind(wi, altMsl, agl);
    // ---- gust surges (only below ~3000 ft AGL, where gusts are reported)
    const gustSpan = Math.max(0, wi.gustKt - wi.windKt);
    const gustFade = Math.max(0, 1 - agl / 3000);
    this.gustTimer -= dt;
    switch (this.gustPhase) {
      case 'idle':
        if (gustSpan > 0 && this.gustTimer <= 0) {
          this.gustPhase = 'rise';
          this.gustTarget = gustSpan * (0.55 + Math.random() * 0.45);
          this.gustDirSwing = (Math.random() - 0.5) * 30;
          this.gustTimer = 1.5 + Math.random() * 1.5;
        }
        this.gust += (0 - this.gust) * Math.min(1, dt * 0.8);
        break;
      case 'rise':
        this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 2.2);
        if (this.gustTimer <= 0) {
          this.gustPhase = 'hold';
          this.gustTimer = 1 + Math.random() * 2;
        }
        break;
      case 'hold':
        if (this.gustTimer <= 0) {
          this.gustPhase = 'decay';
          this.gustTimer = 2 + Math.random() * 2;
        }
        break;
      case 'decay':
        this.gust += (0 - this.gust) * Math.min(1, dt * 0.9);
        if (this.gustTimer <= 0) {
          this.gustPhase = 'idle';
          this.gustTimer = 3 + Math.random() * 9;
        }
        break;
    }
    const gustKt = this.gust * gustFade;
    const dirNow = st.dir + this.gustDirSwing * (gustSpan > 0 ? gustKt / Math.max(1, gustSpan) : 0);
    const ktNow = st.kt + gustKt;
    const base = vec(dirNow, ktNow);

    // ---- Dryden-like turbulence: first-order shaping filters on white noise
    const layerTurb = (wi.aloft ?? []).reduce((m, l) => (Math.abs(l.altFt - altMsl) < 1500 ? Math.max(m, l.turb ?? 0) : m), 0);
    const mech = agl < 2000 ? Math.min(0.6, (wi.windKt / 40) * (1 - agl / 2000)) : 0; // mechanical turbulence with strong surface wind
    const intensity = onGround ? 0 : Math.min(1.2, wi.turbulence + layerTurb + mech);
    const sigma = intensity * 2.6; // m/s
    const V = Math.max(25, tasMs);
    const Lu = agl < 1000 ? Math.max(60, agl * 0.3048 * 1.3 + 30) : 530; // m, MIL-F-8785C style
    const Lw = agl < 1000 ? Math.max(20, agl * 0.3048 * 0.5 + 10) : 530;
    const au = Math.min(1, (V / Lu) * dt);
    const aw = Math.min(1, (V / Lw) * dt);
    this.u += (sigma * Math.sqrt(2 / Math.max(au, 1e-4)) * gauss() * au - this.u * au) ;
    this.v += (sigma * Math.sqrt(2 / Math.max(au, 1e-4)) * gauss() * au - this.v * au);
    this.w += (sigma * 0.8 * Math.sqrt(2 / Math.max(aw, 1e-4)) * gauss() * aw - this.w * aw);
    const ar = Math.min(1, dt * 3);
    this.pr += (gauss() * intensity * 0.35 - this.pr) * ar;
    this.qr += (gauss() * intensity * 0.08 - this.qr) * ar;
    const e = base.e * KT + (onGround ? 0 : this.u);
    const n = base.n * KT + (onGround ? 0 : this.v);
    const shown = toDirKt(base.e, base.n);
    return { e, n, up: onGround ? 0 : this.w, dir: shown.dir, kt: shown.kt, p: this.pr, q: this.qr, gust: gustKt };
  }
}

/** Head/cross-wind components for a heading (positive head = headwind, positive cross = from the right). */
export function components(windDir: number, windKt: number, heading: number): { head: number; cross: number } {
  const rel = (windDir - heading) * DEG;
  return { head: windKt * Math.cos(rel), cross: windKt * Math.sin(rel) };
}

/** Wind correction angle (deg, + = right) and ground speed to fly a true course at a TAS. */
export function windTriangle(course: number, tasKt: number, windDir: number, windKt: number): { wca: number; gs: number; heading: number } {
  const c = components(windDir, windKt, course);
  const s = Math.max(-0.99, Math.min(0.99, c.cross / Math.max(1, tasKt)));
  const wca = Math.asin(s) / DEG;
  const gs = tasKt * Math.cos(wca * DEG) - c.head;
  return { wca, gs, heading: ((course + wca) % 360 + 360) % 360 };
}
