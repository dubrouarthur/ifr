// Wind & turbulence model: winds aloft by layer with veering, surface boundary layer,
// gust surges with direction swing, Dryden turbulence (MIL-F-8785C spectra, low-frequency and smooth),
// mechanical turbulence near the ground.
import { simRandom } from './rng';
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
    { altFt: 3000, dir: (w.windDir + 25) % 360 || 360, kt: Math.round(k * 1.55) },
    { altFt: 6000, dir: (w.windDir + 35) % 360 || 360, kt: Math.round(k * 1.9) },
    { altFt: 9000, dir: (w.windDir + 40) % 360 || 360, kt: Math.round(k * 2.3) },
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
  while (u === 0) u = simRandom();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * simRandom());
}

/** Unit-variance first-order Gauss–Markov process with correlation time T, exact discretisation:
 *  the statistics do not depend on the step size. */
export function markov(x: number, dt: number, T: number): number {
  const a = Math.exp(-dt / Math.max(1e-3, T));
  return x * a + Math.sqrt(1 - a * a) * gauss();
}
/** First-order low-pass y -> x with time constant T, exact discretisation. */
export function lag(y: number, x: number, dt: number, T: number): number {
  return y + (x - y) * (1 - Math.exp(-dt / Math.max(1e-3, T)));
}

/** reference wing span (m) for the turbulence spatial filter (C172: 11 m) */
const SPAN = 11;

/** MIL-F-8785C / MIL-HDBK-1797 Dryden scale lengths (m) for a height (ft AGL). */
export function drydenScales(aglFt: number): { Lu: number; Lw: number } {
  const hi = 1750 * 0.3048;
  const h = Math.max(20, aglFt);
  const lowU = (h / Math.pow(0.177 + 0.000823 * Math.min(h, 1000), 1.2)) * 0.3048;
  const lowW = Math.min(h, 1000) * 0.3048;
  if (h <= 1000) return { Lu: lowU, Lw: lowW };
  if (h >= 2000) return { Lu: hi, Lw: hi };
  const t = (h - 1000) / 1000; // medium altitude: blend toward the isotropic 1750 ft scale
  const u1000 = (1000 / Math.pow(0.177 + 0.823, 1.2)) * 0.3048;
  return { Lu: u1000 + (hi - u1000) * t, Lw: lowW + (hi - lowW) * t };
}

export interface WindSample {
  /** air-mass velocity, m/s east/north/up */
  e: number;
  n: number;
  up: number;
  /** displayed wind (from), kt */
  dir: number;
  kt: number;
  /** turbulence angular velocity of the air mass (rad/s, Dryden p_g / q_g): the airframe's roll / pitch
   *  damping drags it along — it is not an angular acceleration and contains no white noise */
  p: number;
  q: number;
  /** current gust increment (kt above the mean) */
  gust: number;
}

/**
 * Stateful sampler: gust surges and Dryden turbulence.
 *
 * Turbulence is a *low-frequency* process: every component is white noise shaped by the Dryden filters
 * (first order for u, second order (1 + √3 T s)/(1 + T s)² for w, first order at π V / 4b for p), then
 * averaged over the airframe (a further first-order lag of 4b / πV: gust wavelengths shorter than the
 * wing produce no net force). The outputs are continuous with continuous slopes, so nothing on the panel
 * moves from one frame to the next by more than the airframe could follow. All filters are discretised
 * exactly, so the statistics are independent of the integration step.
 */
export class WindModel {
  private gust = 0; // kt
  private gustOut = 0; // kt, smoothed surge
  private gustTarget = 0;
  private gustPhase: 'idle' | 'rise' | 'hold' | 'decay' = 'idle';
  private gustTimer = 4;
  private gustDirSwing = 0;
  // unit-variance shaping-filter states
  private mu = 0;
  private mv = 0;
  private mw1 = 0;
  private mw2 = 0;
  private mp1 = 0;
  private mp2 = 0;
  // airframe-averaged outputs (m/s, rad/s)
  private u = 0;
  private v = 0;
  private w = 0;
  private wPrev = 0;
  private qg = 0;

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
          this.gustTarget = gustSpan * (0.55 + simRandom() * 0.45);
          this.gustDirSwing = (simRandom() - 0.5) * 30;
          this.gustTimer = 1.5 + simRandom() * 1.5;
        }
        this.gust = lag(this.gust, 0, dt, 1 / 0.8);
        break;
      case 'rise':
        this.gust = lag(this.gust, this.gustTarget, dt, 1 / 2.2);
        if (this.gustTimer <= 0) {
          this.gustPhase = 'hold';
          this.gustTimer = 1 + simRandom() * 2;
        }
        break;
      case 'hold':
        if (this.gustTimer <= 0) {
          this.gustPhase = 'decay';
          this.gustTimer = 2 + simRandom() * 2;
        }
        break;
      case 'decay':
        this.gust = lag(this.gust, 0, dt, 1 / 0.9);
        if (this.gustTimer <= 0) {
          this.gustPhase = 'idle';
          this.gustTimer = 3 + simRandom() * 9;
        }
        break;
    }
    // the surge itself is smoothed (an air mass accelerates, it does not switch)
    this.gustOut = lag(this.gustOut, this.gust, dt, 0.6);
    const gustKt = this.gustOut * gustFade;
    const dirNow = st.dir + this.gustDirSwing * (gustSpan > 0 ? gustKt / Math.max(1, gustSpan) : 0);
    const ktNow = st.kt + gustKt;
    const base = vec(dirNow, ktNow);

    // ---- Dryden turbulence
    const layerTurb = (wi.aloft ?? []).reduce((m, l) => (Math.abs(l.altFt - altMsl) < 1500 ? Math.max(m, l.turb ?? 0) : m), 0);
    // mechanical turbulence: eddies shed by terrain and obstacles once the surface wind exceeds ~8 kt
    const mech = agl < 2000 ? Math.min(0.6, (Math.max(0, wi.windKt - 8) / 35) * (1 - agl / 2000)) : 0;
    const intensity = onGround ? 0 : Math.min(1.2, wi.turbulence + layerTurb + mech);
    const sigU = intensity * 2.6; // m/s horizontal (moderate ≈ 0.5 → 1.3 m/s)
    const sigW = sigU * 0.8; // vertical
    const V = Math.max(25, tasMs);
    const { Lu, Lw } = drydenScales(agl);
    const Tu = Lu / V;
    const Tw = Lw / V;
    const Tb = (4 * SPAN) / (Math.PI * V); // airframe averaging / Dryden p-gust corner
    // u, v: first-order Dryden (unit-variance Markov), then airframe averaging
    this.mu = markov(this.mu, dt, Tu);
    this.mv = markov(this.mv, dt, Tu);
    this.u = lag(this.u, sigU * this.mu, dt, Tb);
    this.v = lag(this.v, sigU * this.mv, dt, Tb);
    // w: second-order Dryden (1 + √3 Tw s)/(1 + Tw s)²: mw2 = white/(1 + Tw s)², mw2 + √3 Tw ṁw2 has
    // variance 2 when mw1 is a unit Markov process, hence the 1/√2
    this.mw1 = markov(this.mw1, dt, Tw);
    this.mw2 = lag(this.mw2, this.mw1, dt, Tw);
    const wRaw = (this.mw2 + Math.sqrt(3) * (this.mw1 - this.mw2)) / Math.SQRT2;
    this.wPrev = this.w;
    this.w = lag(this.w, sigW * wRaw, dt, Tb);
    // p_g: Dryden roll gust (antisymmetric vertical gust over the span), two first-order stages at π V / 4b
    // (variance 1/2 after the second stage, hence √2); σp = σw √(0.8 π² (π/4b)^⅓ / (8 b Lw^⅔))
    // (eddies smaller than the span cannot roll the wing: Lw is floored at 2 b for p_g)
    const sigP = sigW * Math.sqrt((0.8 * Math.PI * Math.PI * Math.cbrt(Math.PI / (4 * SPAN))) / (8 * SPAN * Math.pow(Math.max(Lw, 2 * SPAN), 2 / 3)));
    this.mp1 = markov(this.mp1, dt, Tb);
    this.mp2 = lag(this.mp2, this.mp1, dt, Tb);
    const p = sigP * Math.SQRT2 * this.mp2;
    // q_g: the tail meets the vertical gust after the wing (q_g = −ẇ_g / V), smoothed like the rest
    this.qg = lag(this.qg, dt > 0 ? -(this.w - this.wPrev) / dt / V : 0, dt, Tb);

    const e = base.e * KT + (onGround ? 0 : this.u);
    const n = base.n * KT + (onGround ? 0 : this.v);
    const shown = toDirKt(base.e, base.n);
    return { e, n, up: onGround ? 0 : this.w, dir: shown.dir, kt: shown.kt, p: onGround ? 0 : p, q: onGround ? 0 : this.qg, gust: gustKt };
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
