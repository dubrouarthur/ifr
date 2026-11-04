// Procedural Cessna 172S Skyhawk for the exterior views.
// Built once from lofted cross-sections (no external asset): fuselage with cowling and tapered tail cone,
// NACA 2412 high wing with dihedral, struts and tips, stabiliser / fin / dorsal fin, separately hinged
// ailerons, flaps, elevator (with trim tab) and rudder, spinner and twisted two-blade propeller with a blur
// disc, tricycle gear with wheel fairings, nav / strobe / beacon / landing lights, a painted livery
// (white, navy and red cheat lines, N172SP) on a single texture atlas, a ground blob shadow and a
// landing-light pool.
//
// Model space: metres, origin on the ground under the main axles, +x right wing, +y up, nose toward -z
// (the same convention as the cockpit camera, so the group takes rotation (pitch, -hdg, -roll) order YXZ).
// Authoring uses station coordinates: X aft of the spinner tip, BL right of the centreline, WL above the ground.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const DEG = Math.PI / 180;
/** published C172S dimensions */
export const C172_DIMS = { span: 11.0, length: 8.28, height: 2.72 };
/** main axle station: the model origin */
const X_MAIN = 2.66;
const P = (X: number, BL: number, WL: number) =>
  new THREE.Vector3(BL, WL, X - X_MAIN);

/** control-surface travel (deg) */
export const TRAVEL = {
  aileronUp: 20,
  aileronDown: 15,
  elevatorUp: 25,
  elevatorDown: 20,
  rudder: 20,
  flaps: 30,
  tab: 18,
  noseSteer: 10,
};

// ------------------------------------------------------------------ geometry helpers
interface RingPt {
  p: THREE.Vector3;
  uv: [number, number];
}
/** one station of a loft: groups of points (consecutive groups share their end points → hard edges) */
type Ring = RingPt[][];

const WHITE_UV: [number, number] = [0.9, 0.1];

function orient(
  geo: THREE.BufferGeometry,
  inside: (vi: number) => THREE.Vector3,
) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const idx = geo.getIndex()!;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  let sum = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const ia = idx.getX(t),
      ib = idx.getX(t + 1),
      ic = idx.getX(t + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    const area = n.length();
    if (area < 1e-12) continue;
    m.copy(a)
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3)
      .sub(inside(ia));
    sum += Math.sign(n.dot(m)) * area;
  }
  if (sum < 0) {
    const arr = idx.array as Uint32Array | Uint16Array;
    for (let t = 0; t < arr.length; t += 3) {
      const tmp = arr[t + 1];
      arr[t + 1] = arr[t + 2];
      arr[t + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
}

function makeGeo(
  pos: number[],
  uv: number[],
  index: number[],
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * Loft rings into surfaces: one smooth surface per group, plus optional end caps (fan from the centroid).
 * `inside(i)` is a point inside the body at station i, used to orient every surface outward.
 */
function loft(
  rings: Ring[],
  inside: (i: number) => THREE.Vector3,
  caps: [boolean, boolean] = [true, true],
  closed = false,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const ng = rings[0].length;
  for (let g = 0; g < ng; g++) {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      st: number[] = [];
    const n = rings[0][g].length;
    for (let i = 0; i < rings.length; i++)
      for (const q of rings[i][g]) {
        pos.push(q.p.x, q.p.y, q.p.z);
        uv.push(q.uv[0], q.uv[1]);
        st.push(i);
      }
    for (let i = 0; i < rings.length - 1; i++)
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j,
          b = a + 1,
          c = a + n,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = makeGeo(pos, uv, idx);
    orient(geo, (vi) => inside(st[vi]));
    geo.computeVertexNormals();
    if (closed) {
      // the loop's first and last points coincide: average their normals so the seam does not show
      const nr = geo.getAttribute("normal") as THREE.BufferAttribute;
      const v = new THREE.Vector3(),
        w = new THREE.Vector3();
      for (let i = 0; i < rings.length; i++) {
        const a = i * n,
          b = i * n + n - 1;
        v.fromBufferAttribute(nr, a)
          .add(w.fromBufferAttribute(nr, b))
          .normalize();
        nr.setXYZ(a, v.x, v.y, v.z);
        nr.setXYZ(b, v.x, v.y, v.z);
      }
    }
    out.push(geo);
  }
  // caps
  for (const [k, ri, ref] of [
    [0, 0, 1],
    [1, rings.length - 1, rings.length - 2],
  ] as const) {
    if (!caps[k]) continue;
    const outline: RingPt[] = [];
    for (const grp of rings[ri])
      for (let j = 0; j < grp.length; j++)
        if (outline.length === 0 || j > 0) outline.push(grp[j]);
    const cen = new THREE.Vector3();
    for (const q of outline) cen.add(q.p);
    cen.multiplyScalar(1 / outline.length);
    const pos: number[] = [cen.x, cen.y, cen.z],
      uv: number[] = [...outline[0].uv],
      idx: number[] = [];
    for (const q of outline) {
      pos.push(q.p.x, q.p.y, q.p.z);
      uv.push(q.uv[0], q.uv[1]);
    }
    for (let j = 1; j < outline.length; j++) idx.push(0, j, j + 1);
    if (outline[0].p.distanceTo(outline[outline.length - 1].p) > 1e-6)
      idx.push(0, outline.length, 1);
    const geo = makeGeo(pos, uv, idx);
    // inside = the neighbouring station's centroid (the body continues that way)
    const inner = new THREE.Vector3();
    let cnt = 0;
    for (const grp of rings[ref])
      for (const q of grp) {
        inner.add(q.p);
        cnt++;
      }
    inner.multiplyScalar(1 / cnt);
    orient(geo, () => inner);
    geo.computeVertexNormals();
    out.push(geo);
  }
  return out;
}

/** NACA 4-digit upper / lower surface heights (chord units) */
function naca(
  xc: number,
  t: number,
  m: number,
  p: number,
): { yu: number; yl: number; yc: number; yt: number } {
  const x = Math.max(0, Math.min(1, xc));
  const yt =
    5 *
    t *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x ** 3 -
      0.1036 * x ** 4);
  const yc =
    m === 0
      ? 0
      : x < p
        ? (m / (p * p)) * (2 * p * x - x * x)
        : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
  return { yu: yc + yt, yl: yc - yt, yc, yt };
}
/** cosine-spaced samples on [a, b] (denser near a when a = 0) */
function spacing(a: number, b: number, n: number, full = false): number[] {
  const r: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    r.push(
      full ? a + (b - a) * (1 - Math.cos((s * Math.PI) / 2)) : a + (b - a) * s,
    );
  }
  return r;
}

/**
 * An airfoil-like section in a 2-D plane (a = chordwise, b = thickness), mapped to 3-D by `map`.
 * Main surface: LE (xc = 0) to the hinge cut xc1 (flat spar face when xc1 < 1).
 */
function mainSection(
  t: number,
  m: number,
  p: number,
  xc1: number,
  n: number,
  map: (xc: number, y: number) => THREE.Vector3,
  uv: (xc: number, y: number) => [number, number],
): Ring {
  const xs = spacing(0, xc1, n, true);
  const skin: RingPt[] = [];
  for (let i = xs.length - 1; i >= 0; i--) {
    const f = naca(xs[i], t, m, p);
    skin.push({ p: map(xs[i], f.yl), uv: uv(xs[i], f.yl) });
  }
  for (let i = 1; i < xs.length; i++) {
    const f = naca(xs[i], t, m, p);
    skin.push({ p: map(xs[i], f.yu), uv: uv(xs[i], f.yu) });
  }
  if (xc1 >= 0.999) return [skin];
  const f = naca(xc1, t, m, p);
  const spar: RingPt[] = [];
  for (let k = 0; k <= 2; k++) {
    const y = f.yu + ((f.yl - f.yu) * k) / 2;
    spar.push({ p: map(xc1, y), uv: uv(xc1, y) });
  }
  return [skin, spar];
}

/**
 * Control-surface section: rounded nose centred on the hinge (radius = the half thickness there),
 * tapering to the trailing edge. `a` runs from the hinge (0) to the TE (len); thickness along b.
 */
function surfaceSection(
  len: number,
  halfT: number,
  centreB: number,
  n: number,
  map: (a: number, b: number) => THREE.Vector3,
  uv: (a: number, b: number) => [number, number],
  cut = 0,
): Ring {
  const pts: [number, number][] = [];
  const aEnd = len - cut;
  const th = (a: number) => Math.max(0.0015, halfT * (1 - a / len) ** 1.1);
  const cb = (a: number) => centreB * (1 - a / len);
  // lower surface TE → hinge
  for (let i = n; i >= 0; i--) {
    const a = (aEnd * i) / n;
    pts.push([a, cb(a) - th(a)]);
  }
  // nose semicircle
  for (let k = 1; k < 8; k++) {
    const ang = -Math.PI / 2 - (Math.PI * k) / 8;
    pts.push([halfT * Math.cos(ang), centreB + halfT * Math.sin(ang)]);
  }
  // upper surface hinge → TE
  for (let i = 0; i <= n; i++) {
    const a = (aEnd * i) / n;
    pts.push([a, cb(a) + th(a)]);
  }
  const pt = ([a, b]: [number, number]): RingPt => ({
    p: map(a, b),
    uv: uv(a, b),
  });
  // the trailing edge (or the tab cut-out) closed by its own flat face
  return [pts.map(pt), [pts[pts.length - 1], pts[0]].map(pt)];
}

// ------------------------------------------------------------------ fuselage definition
interface Sec {
  X: number;
  zb: number;
  zt: number;
  hw: number;
  zc: number;
  nT: number;
  nB: number;
}
const FUSE: Sec[] = [
  { X: 0.3, zb: 0.97, zt: 1.43, hw: 0.37, zc: 1.2, nT: 2.3, nB: 2.4 },
  { X: 0.34, zb: 0.91, zt: 1.47, hw: 0.43, zc: 1.2, nT: 2.4, nB: 2.6 },
  { X: 0.45, zb: 0.85, zt: 1.52, hw: 0.47, zc: 1.2, nT: 2.5, nB: 2.7 },
  { X: 0.7, zb: 0.78, zt: 1.56, hw: 0.51, zc: 1.2, nT: 2.6, nB: 2.8 },
  { X: 1.05, zb: 0.73, zt: 1.6, hw: 0.535, zc: 1.22, nT: 2.8, nB: 3.0 },
  { X: 1.36, zb: 0.715, zt: 1.635, hw: 0.55, zc: 1.26, nT: 3.0, nB: 3.2 },
  { X: 1.66, zb: 0.705, zt: 1.84, hw: 0.56, zc: 1.3, nT: 3.0, nB: 3.4 },
  { X: 1.96, zb: 0.7, zt: 1.985, hw: 0.56, zc: 1.31, nT: 3.0, nB: 3.4 },
  { X: 2.6, zb: 0.71, zt: 1.995, hw: 0.56, zc: 1.31, nT: 3.0, nB: 3.4 },
  { X: 3.2, zb: 0.76, zt: 1.965, hw: 0.545, zc: 1.33, nT: 2.8, nB: 3.2 },
  { X: 3.72, zb: 0.85, zt: 1.8, hw: 0.48, zc: 1.33, nT: 2.6, nB: 3.0 },
  { X: 4.5, zb: 0.95, zt: 1.57, hw: 0.36, zc: 1.27, nT: 2.4, nB: 2.8 },
  { X: 5.4, zb: 1.025, zt: 1.39, hw: 0.26, zc: 1.21, nT: 2.3, nB: 2.6 },
  { X: 6.3, zb: 1.065, zt: 1.28, hw: 0.17, zc: 1.17, nT: 2.2, nB: 2.4 },
  { X: 7.1, zb: 1.09, zt: 1.215, hw: 0.1, zc: 1.15, nT: 2.2, nB: 2.2 },
  { X: 7.6, zb: 1.105, zt: 1.19, hw: 0.05, zc: 1.148, nT: 2.0, nB: 2.0 },
  { X: 7.76, zb: 1.13, zt: 1.17, hw: 0.012, zc: 1.15, nT: 2.0, nB: 2.0 },
];
const FX0 = FUSE[0].X,
  FX1 = FUSE[FUSE.length - 1].X;

/** Catmull-Rom interpolation of the section keys */
export function section(X: number): Sec {
  const k = FUSE;
  let i = 0;
  while (i < k.length - 2 && X > k[i + 1].X) i++;
  const a = k[Math.max(0, i - 1)],
    b = k[i],
    c = k[i + 1],
    d = k[Math.min(k.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (X - b.X) / (c.X - b.X)));
  const cr = (f: (s: Sec) => number) => {
    const p0 = f(a),
      p1 = f(b),
      p2 = f(c),
      p3 = f(d);
    const t2 = t * t,
      t3 = t2 * t;
    const v =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    // never overshoot outside the two keys' range by much (keeps the tail cone from bulging)
    const lo = Math.min(p1, p2),
      hi = Math.max(p1, p2),
      m = (hi - lo) * 0.15 + 1e-4;
    return Math.max(lo - m, Math.min(hi + m, v));
  };
  return {
    X,
    zb: cr((s) => s.zb),
    zt: cr((s) => s.zt),
    hw: cr((s) => s.hw),
    zc: cr((s) => s.zc),
    nT: cr((s) => s.nT),
    nB: cr((s) => s.nB),
  };
}
const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
/** fuselage surface point for an angle θ (0 = right side, π/2 = top) */
function fusePoint(s: Sec, th: number): [number, number] {
  const c = Math.cos(th),
    sn = Math.sin(th);
  const e = sn >= 0 ? s.nT : s.nB;
  const x = s.hw * spow(c, 2 / e);
  const y =
    sn >= 0
      ? s.zc + (s.zt - s.zc) * Math.abs(sn) ** (2 / e)
      : s.zc - (s.zc - s.zb) * Math.abs(sn) ** (2 / e);
  return [x, y];
}
const fuseU = (X: number) => (X - FX0) / (FX1 - FX0);
/** atlas v of a fuselage angle (θ from -π/2 at the belly round to 3π/2) */
const fuseV = (th: number) =>
  0.25 + 0.75 * ((th + Math.PI / 2) / (2 * Math.PI));
/** fin / rudder atlas region */
const finUV = (X: number, WL: number): [number, number] => [
  ((X - 6.6) / 1.75) * 0.5,
  0.01 + ((WL - 0.95) / 1.85) * 0.22,
];

// ------------------------------------------------------------------ wing definition
const WING = {
  semi: 5.5,
  rootChord: 1.63,
  tipChord: 1.12,
  taperStart: 2.55,
  te: 3.53,
  wlRoot: 1.975,
  dihedral: 1.73 * DEG,
  flap: { bl0: 0.62, bl1: 2.92, hinge: 3.06 },
  aileron: { bl0: 2.98, bl1: 5.06, hinge: 3.22 },
};
const wingChord = (bl: number) => {
  const b = Math.abs(bl);
  if (b <= WING.taperStart) return WING.rootChord;
  return (
    WING.rootChord -
    ((Math.min(b, 5.3) - WING.taperStart) / (5.3 - WING.taperStart)) *
      (WING.rootChord - WING.tipChord)
  );
};
const wingLE = (bl: number) => WING.te - wingChord(bl);
const wingWL = (bl: number) =>
  WING.wlRoot + Math.abs(bl) * Math.tan(WING.dihedral);

// ------------------------------------------------------------------ livery
const LIVERY = {
  white: "#f3f4f1",
  navy: "#1c2d52",
  red: "#b3262d",
  glass: "#0d141c",
  seam: "#c3c7ca",
};
/** main cheat line: lower and upper waterline of the navy band along X */
const STRIPE: [number, number, number][] = [
  // X, lower WL, upper WL
  [0.3, 1.0, 1.08],
  [0.9, 1.03, 1.14],
  [1.6, 1.09, 1.22],
  [3.0, 1.15, 1.3],
  [3.8, 1.14, 1.28],
  [4.6, 1.1, 1.21],
  [5.6, 1.09, 1.17],
  [6.6, 1.1, 1.16],
  [7.8, 1.12, 1.175],
];
function lerpTable(
  tab: [number, number, number][],
  X: number,
  col: 1 | 2,
): number {
  if (X <= tab[0][0]) return tab[0][col];
  for (let i = 0; i < tab.length - 1; i++)
    if (X <= tab[i + 1][0]) {
      const t = (X - tab[i][0]) / (tab[i + 1][0] - tab[i][0]);
      const s = t * t * (3 - 2 * t);
      return tab[i][col] + (tab[i + 1][col] - tab[i][col]) * s;
    }
  return tab[tab.length - 1][col];
}

type Mode = "color" | "rough";
/**
 * The side-view livery painted in (X, WL) space: X ∈ [FX0, FX1] across, WL ∈ [0.6, 2.1] up. The right side
 * gets the registration mirrored (X runs nose→tail left to right in the image but tail→nose seen from the right).
 */
const SIDE = { W: 2048, H: 420, wl0: 0.6, wl1: 2.1 };
function paintSide(mode: Mode, mirrorText: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIDE.W;
  c.height = SIDE.H;
  const g = c.getContext("2d")!;
  const px = (X: number) => ((X - FX0) / (FX1 - FX0)) * SIDE.W;
  const py = (WL: number) =>
    (1 - (WL - SIDE.wl0) / (SIDE.wl1 - SIDE.wl0)) * SIDE.H;
  const R = (r: number) => `rgb(${r},${r},${r})`;
  const col = (k: keyof typeof LIVERY) =>
    mode === "color"
      ? LIVERY[k]
      : R(k === "glass" ? 18 : k === "seam" ? 120 : k === "white" ? 92 : 100);
  g.fillStyle = col("white");
  g.fillRect(0, 0, SIDE.W, SIDE.H);
  // cheat lines
  const band = (
    lo: (X: number) => number,
    hi: (X: number) => number,
    x0: number,
    x1: number,
    fill: string,
  ) => {
    g.beginPath();
    for (let X = x0; X <= x1 + 1e-6; X += 0.05) g.lineTo(px(X), py(hi(X)));
    for (let X = x1; X >= x0 - 1e-6; X -= 0.05) g.lineTo(px(X), py(lo(X)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const lo = (X: number) => lerpTable(STRIPE, X, 1);
  const hi = (X: number) => lerpTable(STRIPE, X, 2);
  band(lo, hi, FX0, FX1, col("navy"));
  band(
    (X) => hi(X) + 0.022,
    (X) => hi(X) + 0.045,
    0.6,
    FX1,
    col("red"),
  );
  band(
    (X) => lo(X) - 0.03,
    (X) => lo(X) - 0.018,
    1.2,
    6.4,
    col("navy"),
  );
  // panel lines: cowling seam, doors, baggage door, tail-cone rivet line
  g.strokeStyle = col("seam");
  g.lineWidth = 1.6;
  const line = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([X, WL], i) =>
      i ? g.lineTo(px(X), py(WL)) : g.moveTo(px(X), py(WL)),
    );
    g.stroke();
  };
  line([
    [1.34, 0.72],
    [1.34, 1.64],
  ]);
  line([
    [0.62, 1.27],
    [1.3, 1.31],
  ]);
  line([
    [1.98, 0.8],
    [1.98, 1.93],
    [3.02, 1.93],
    [3.02, 0.82],
    [1.98, 0.8],
  ]); // door
  line([
    [3.3, 0.98],
    [3.3, 1.32],
    [3.72, 1.3],
    [3.72, 0.99],
    [3.3, 0.98],
  ]); // baggage door
  line([
    [2.5, 1.2],
    [2.6, 1.2],
  ]); // door handle
  g.lineWidth = 3;
  line([
    [2.48, 1.205],
    [2.62, 1.205],
  ]);
  // windows: door window, rear side window, aft quarter window
  const glass = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([X, WL], i) =>
      i ? g.lineTo(px(X), py(WL)) : g.moveTo(px(X), py(WL)),
    );
    g.closePath();
    if (mode === "color") {
      const gr = g.createLinearGradient(0, py(1.95), 0, py(1.4));
      gr.addColorStop(0, "#2a3a4c");
      gr.addColorStop(0.55, LIVERY.glass);
      gr.addColorStop(1, "#1a2430");
      g.fillStyle = gr;
    } else g.fillStyle = col("glass");
    g.fill();
    g.strokeStyle = mode === "color" ? "#5b6168" : R(110);
    g.lineWidth = 3;
    g.stroke();
  };
  glass([
    [1.68, 1.49],
    [2.0, 1.9],
    [2.96, 1.9],
    [2.96, 1.47],
    [1.88, 1.45],
  ]);
  glass([
    [3.06, 1.47],
    [3.06, 1.9],
    [3.56, 1.88],
    [3.62, 1.5],
  ]);
  glass([
    [3.72, 1.52],
    [3.74, 1.78],
    [4.08, 1.66],
    [4.12, 1.55],
  ]);
  // registration on the aft fuselage, 9 in characters
  if (mode === "color") {
    g.save();
    const X0 = 4.4,
      X1 = 5.62,
      base = 1.205,
      cap = 0.22;
    const w = px(X1) - px(X0),
      hpx = py(base) - py(base + cap);
    g.font = `bold ${Math.round(hpx * 1.33)}px "Helvetica Neue", Arial, sans-serif`;
    g.textBaseline = "alphabetic";
    g.fillStyle = LIVERY.navy;
    const cx = (px(X0) + px(X1)) / 2;
    g.translate(cx, py(base));
    if (mirrorText) g.scale(-1, 1);
    const tw = g.measureText("N172SP").width;
    g.scale(Math.min(1, w / tw), 1);
    g.textAlign = "center";
    g.fillText("N172SP", 0, 0);
    g.restore();
  }
  return c;
}

/** the full texture atlas: fuselage (warped from the side views) + fin region + plain white */
function buildAtlas(mode: Mode): HTMLCanvasElement {
  const W = 2048,
    H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const R = (r: number) => `rgb(${r},${r},${r})`;
  g.fillStyle = mode === "color" ? LIVERY.white : R(92);
  g.fillRect(0, 0, W, H);
  // fuselage: each atlas pixel → (X, θ) → side + WL → side-view pixel
  const left = paintSide(mode, false)
    .getContext("2d")!
    .getImageData(0, 0, SIDE.W, SIDE.H).data;
  const right = paintSide(mode, true)
    .getContext("2d")!
    .getImageData(0, 0, SIDE.W, SIDE.H).data;
  const FH = Math.round(H * 0.75);
  const img = g.getImageData(0, 0, W, FH);
  const rowTh = new Float32Array(FH);
  for (let y = 0; y < FH; y++) {
    const v = 1 - (y + 0.5) / H; // canvas row → atlas v (flipY)
    rowTh[y] = ((v - 0.25) / 0.75) * 2 * Math.PI - Math.PI / 2;
  }
  for (let x = 0; x < W; x++) {
    const X = FX0 + ((x + 0.5) / W) * (FX1 - FX0);
    const s = section(X);
    const sx = Math.min(
      SIDE.W - 1,
      Math.max(0, Math.round(((X - FX0) / (FX1 - FX0)) * SIDE.W)),
    );
    for (let y = 0; y < FH; y++) {
      const th = rowTh[y];
      const [, WL] = fusePoint(s, th);
      const src = Math.cos(th) >= 0 ? right : left;
      const sy = Math.min(
        SIDE.H - 1,
        Math.max(
          0,
          Math.round((1 - (WL - SIDE.wl0) / (SIDE.wl1 - SIDE.wl0)) * SIDE.H),
        ),
      );
      const si = (sy * SIDE.W + sx) * 4,
        di = (y * W + x) * 4;
      img.data[di] = src[si];
      img.data[di + 1] = src[si + 1];
      img.data[di + 2] = src[si + 2];
      img.data[di + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // windscreen on the top-front, drawn in (X, θ) directly
  const ax = (X: number) => ((X - FX0) / (FX1 - FX0)) * W;
  const ay = (th: number) => (1 - fuseV(th)) * H;
  const ws: [number, number][] = [
    [1.39, 0.78],
    [1.66, 0.42],
    [1.95, 0.3],
    [1.95, Math.PI - 0.3],
    [1.66, Math.PI - 0.42],
    [1.39, Math.PI - 0.78],
  ];
  g.beginPath();
  ws.forEach(([X, th], i) =>
    i ? g.lineTo(ax(X), ay(th)) : g.moveTo(ax(X), ay(th)),
  );
  g.closePath();
  if (mode === "color") {
    const gr = g.createLinearGradient(ax(1.39), 0, ax(1.95), 0);
    gr.addColorStop(0, "#16202b");
    gr.addColorStop(1, "#2b3b4d");
    g.fillStyle = gr;
  } else g.fillStyle = R(14);
  g.fill();
  g.strokeStyle = mode === "color" ? "#60666d" : R(110);
  g.lineWidth = 3;
  g.stroke();
  // dark anti-glare panel ahead of the windscreen? (C172s are plain white) — oil-door outline on the cowl top
  g.strokeStyle = mode === "color" ? LIVERY.seam : R(120);
  g.lineWidth = 2;
  g.strokeRect(
    ax(0.78),
    ay(Math.PI / 2 + 0.28),
    ax(1.08) - ax(0.78),
    ay(Math.PI / 2 - 0.28) - ay(Math.PI / 2 + 0.28),
  );
  // fin & rudder: navy/red sweep matching the fuselage cheat line
  const fx = (X: number) => finUV(X, 0)[0] * W;
  const fy = (WL: number) => (1 - finUV(0, WL)[1]) * H;
  const poly = (pts: [number, number][], fill: string) => {
    g.beginPath();
    pts.forEach(([X, WL], i) =>
      i ? g.lineTo(fx(X), fy(WL)) : g.moveTo(fx(X), fy(WL)),
    );
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  if (mode === "color") {
    poly(
      [
        [6.6, 1.55],
        [8.4, 2.05],
        [8.4, 2.22],
        [6.6, 1.72],
      ],
      LIVERY.navy,
    );
    poly(
      [
        [6.6, 1.77],
        [8.4, 2.27],
        [8.4, 2.31],
        [6.6, 1.81],
      ],
      LIVERY.red,
    );
  }
  return c;
}

/** radial gradient helpers for sprites, shadow and the prop disc */
function canvasTex(
  size: number,
  draw: (g: CanvasRenderingContext2D, s: number) => void,
  srgb = true,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ lights shader
const lightVert = `
attribute vec3 color; attribute float size; attribute float kind; attribute vec3 ldir; attribute float cone; attribute float phase;
uniform float uTime; uniform float uNav; uniform float uStrobe; uniform float uBeacon; uniform float uLand; uniform float uDay; uniform float uFocal;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 0.5);
  vec3 toCam = normalize(-mv.xyz);
  vec3 nd = normalize(normalMatrix * ldir);
  float vis = cone < -1.5 ? 1.0 : smoothstep(cone - 0.12, cone + 0.04, dot(nd, toCam));
  float a = 0.0;
  float minPx = 0.0;
  if (kind < 0.5) { a = uNav; minPx = mix(2.6, 0.0, uDay); }
  else if (kind < 1.5) { float ph = fract(uTime / 1.1 + phase); a = uStrobe * (step(ph, 0.035) + step(abs(ph - 0.11), 0.025)) * 2.2; minPx = 3.0; }
  else if (kind < 2.5) { float ph = fract(uTime * 0.75 + phase); a = uBeacon * pow(max(0.0, sin(ph * 6.2832)), 8.0) * 1.6; minPx = mix(2.4, 0.0, uDay); }
  else { a = uLand; minPx = 3.0; }
  vAlpha = a * vis * mix(1.0, 0.55, uDay);
  vColor = color;
  // by day a lamp is a small bright point (strobes stay punchy); at night the glow blooms
  float daySize = kind > 0.5 && kind < 1.5 ? mix(1.0, 0.8, uDay) : mix(1.0, 0.4, uDay);
  gl_PointSize = clamp(size * daySize * uFocal / dist, minPx, 90.0);
  gl_Position = projectionMatrix * mv;
  if (vAlpha < 0.004) gl_PointSize = 0.0;
}`;
const lightFrag = `
uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor * t.a * vAlpha, 1.0); if (t.a * vAlpha < 0.005) discard;
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ the aircraft
export interface AircraftAnim {
  aileron: number; // -1..1 (+ = roll right)
  elevator: number; // -1..1 (+ = nose up), trim already added
  trim: number; // -1..1 (+ = nose up)
  rudder: number; // -1..1 (+ = yaw right)
  flaps: number; // 0..1 actual position
  rpm: number;
  gsMps: number;
  onGround: boolean;
  aglFt: number;
  dt: number;
  t: number;
  /** 0 = night .. 1 = bright day (light glow strength) */
  day: number;
}

export interface Hinged {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
}

export class Aircraft3D {
  /** the airframe, posed in the scene by the caller */
  readonly group = new THREE.Group();
  /** ground-aligned blob shadow and landing-light pool (world space, placed by placeGround) */
  readonly shadow: THREE.Mesh;
  readonly pool: THREE.Mesh;
  readonly paint: THREE.MeshStandardMaterial;
  readonly materials: THREE.MeshStandardMaterial[] = [];
  readonly parts: {
    aileronL: Hinged;
    aileronR: Hinged;
    flapL: Hinged;
    flapR: Hinged;
    elevator: Hinged;
    tab: Hinged;
    rudder: Hinged;
    prop: THREE.Mesh;
    disc: THREE.Mesh;
    wheels: THREE.Mesh[];
    noseGear: THREE.Object3D;
  };
  /** current light switch state (automatic unless overridden) */
  lights = { nav: true, strobe: false, beacon: false, landing: false };
  lightOverride: Partial<Aircraft3D["lights"]> | null = null;
  private lightsMat: THREE.ShaderMaterial;
  private propAngle = 0;
  private wheelAngle = 0;
  private envRT: THREE.WebGLRenderTarget | null = null;

  constructor(opts: { textures?: boolean } = {}) {
    const tex = opts.textures ?? typeof document !== "undefined";
    this.group.name = "C172";
    this.group.rotation.order = "YXZ";
    // materials
    let atlas: THREE.Texture | null = null,
      rough: THREE.Texture | null = null;
    if (tex) {
      atlas = new THREE.CanvasTexture(buildAtlas("color"));
      atlas.colorSpace = THREE.SRGBColorSpace;
      atlas.anisotropy = 4;
      rough = new THREE.CanvasTexture(buildAtlas("rough"));
      rough.anisotropy = 4;
    }
    this.paint = new THREE.MeshStandardMaterial({
      color: tex ? 0xffffff : 0xf3f4f1,
      map: atlas,
      roughnessMap: rough,
      roughness: tex ? 1 : 0.36,
      metalness: 0,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x24272b,
      roughness: 0.55,
      metalness: 0.2,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xc9ced3,
      roughness: 0.22,
      metalness: 1,
    });
    const tire = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 0.92,
      metalness: 0,
    });
    const propMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.45,
    });
    this.materials.push(this.paint, dark, metal, tire, propMat);

    // ---------------- static airframe
    const paintGeos: THREE.BufferGeometry[] = [];
    const darkGeos: THREE.BufferGeometry[] = [];
    const metalGeos: THREE.BufferGeometry[] = [];
    paintGeos.push(...this.fuselage());
    paintGeos.push(...this.wings());
    paintGeos.push(...this.tail());
    paintGeos.push(...this.struts());
    const gear = this.gear();
    paintGeos.push(...gear.paint);
    metalGeos.push(...gear.metal);
    paintGeos.push(this.spinner());
    darkGeos.push(...this.details());
    const add = (
      geos: THREE.BufferGeometry[],
      mat: THREE.Material,
      name: string,
    ) => {
      const g = mergeGeometries(geos, false);
      if (!g) throw new Error(`merge failed: ${name}`);
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      this.group.add(m);
      return m;
    };
    add(paintGeos, this.paint, "airframe");
    add(darkGeos, dark, "details");
    add(metalGeos, metal, "metal");

    // ---------------- hinged surfaces
    const cs = this.controlSurfaces();
    // ---------------- wheels
    const wheels: THREE.Mesh[] = [];
    const wheelGeo = (r: number, w: number) => {
      const g = new THREE.CylinderGeometry(r, r, w, 28, 1).rotateZ(Math.PI / 2);
      // a slightly rounded tyre: shrink the cap edges
      const hub = new THREE.CylinderGeometry(
        r * 0.55,
        r * 0.55,
        w * 1.04,
        16,
      ).rotateZ(Math.PI / 2);
      const merged = mergeGeometries(
        [g.toNonIndexed(), hub.toNonIndexed()],
        false,
      )!;
      return merged;
    };
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(wheelGeo(0.215, 0.15), tire);
      m.position.copy(P(X_MAIN, s * 1.27, 0.215));
      wheels.push(m);
      this.group.add(m);
    }
    const noseGear = new THREE.Group();
    noseGear.position.copy(P(1.0, 0, 0.18));
    const nw = new THREE.Mesh(wheelGeo(0.18, 0.12), tire);
    noseGear.add(nw);
    wheels.push(nw);
    {
      // steerable nose fork, fairing and oleo, built around the axle
      const fair = this.fairing(0, 0.18, 1.0, 0.085, 0.2, 0.56).map((g) =>
        g.translate(0, -0.18, -(1.0 - X_MAIN)),
      );
      const m = new THREE.Mesh(mergeGeometries(fair, false)!, this.paint);
      noseGear.add(m);
      const oleo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10).translate(
        0,
        0.36,
        0.02,
      );
      const fork = new THREE.BoxGeometry(0.16, 0.05, 0.08).translate(
        0,
        0.17,
        0,
      );
      noseGear.add(new THREE.Mesh(mergeGeometries([oleo, fork], false)!, metal));
    }
    this.group.add(noseGear);

    // ---------------- propeller
    const prop = new THREE.Mesh(this.propeller(), propMat);
    prop.position.copy(P(0.27, 0, 1.22));
    prop.name = "propeller";
    this.group.add(prop);
    const discTex = tex
      ? canvasTex(256, (g, s) => {
          const r = s / 2;
          const gr = g.createRadialGradient(r, r, r * 0.16, r, r, r);
          gr.addColorStop(0, "rgba(40,42,46,0)");
          gr.addColorStop(0.25, "rgba(40,42,46,0.2)");
          gr.addColorStop(0.84, "rgba(48,50,54,0.2)");
          gr.addColorStop(0.86, "rgba(225,225,225,0.2)");
          gr.addColorStop(0.9, "rgba(170,60,60,0.16)");
          gr.addColorStop(0.97, "rgba(170,60,60,0.08)");
          gr.addColorStop(1, "rgba(190,40,40,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, s, s);
        })
      : null;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.955, 48),
      new THREE.MeshBasicMaterial({
        map: discTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    disc.position.copy(P(0.27, 0, 1.22));
    disc.renderOrder = 2;
    disc.name = "propDisc";
    this.group.add(disc);

    // ---------------- lights
    const L: {
      p: THREE.Vector3;
      c: [number, number, number];
      size: number;
      kind: number;
      dir: [number, number, number];
      cone: number;
      phase: number;
    }[] = [];
    const tipX = wingLE(5.5) + 0.06,
      tipWL = wingWL(5.5);
    const s55 = Math.sin(55 * DEG),
      c55 = Math.cos(55 * DEG);
    L.push({
      p: P(tipX, -5.49, tipWL),
      c: [1, 0.12, 0.08],
      size: 0.6,
      kind: 0,
      dir: [-s55, 0, -c55],
      cone: c55,
      phase: 0,
    });
    L.push({
      p: P(tipX, 5.49, tipWL),
      c: [0.15, 1, 0.35],
      size: 0.6,
      kind: 0,
      dir: [s55, 0, -c55],
      cone: c55,
      phase: 0,
    });
    L.push({
      p: P(8.27, 0, 1.13),
      c: [1, 0.97, 0.9],
      size: 0.5,
      kind: 0,
      dir: [0, 0, 1],
      cone: Math.cos(70 * DEG),
      phase: 0,
    });
    L.push({
      p: P(tipX + 0.12, -5.49, tipWL + 0.02),
      c: [1, 1, 1],
      size: 1.5,
      kind: 1,
      dir: [0, 0, 0],
      cone: -2,
      phase: 0,
    });
    L.push({
      p: P(tipX + 0.12, 5.49, tipWL + 0.02),
      c: [1, 1, 1],
      size: 1.5,
      kind: 1,
      dir: [0, 0, 0],
      cone: -2,
      phase: 0,
    });
    L.push({
      p: P(7.66, 0, 2.69),
      c: [1, 0.1, 0.06],
      size: 0.9,
      kind: 2,
      dir: [0, 0, 0],
      cone: -2,
      phase: 0,
    });
    L.push({
      p: P(wingLE(2.3) - 0.01, -2.3, wingWL(2.3) - 0.02),
      c: [1, 0.96, 0.86],
      size: 1.3,
      kind: 3,
      dir: [0, -0.06, -1],
      cone: Math.cos(28 * DEG),
      phase: 0,
    });
    L.push({
      p: P(wingLE(2.55) - 0.01, -2.55, wingWL(2.55) - 0.02),
      c: [1, 0.96, 0.86],
      size: 1.1,
      kind: 3,
      dir: [0.18, -0.1, -1],
      cone: Math.cos(34 * DEG),
      phase: 0,
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        L.flatMap((l) => [l.p.x, l.p.y, l.p.z]),
        3,
      ),
    );
    lg.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        L.flatMap((l) => l.c),
        3,
      ),
    );
    lg.setAttribute(
      "size",
      new THREE.Float32BufferAttribute(
        L.map((l) => l.size),
        1,
      ),
    );
    lg.setAttribute(
      "kind",
      new THREE.Float32BufferAttribute(
        L.map((l) => l.kind),
        1,
      ),
    );
    lg.setAttribute(
      "ldir",
      new THREE.Float32BufferAttribute(
        L.flatMap((l) => (l.cone < -1.5 ? [0, 1, 0] : l.dir)),
        3,
      ),
    );
    lg.setAttribute(
      "cone",
      new THREE.Float32BufferAttribute(
        L.map((l) => l.cone),
        1,
      ),
    );
    lg.setAttribute(
      "phase",
      new THREE.Float32BufferAttribute(
        L.map((l) => l.phase),
        1,
      ),
    );
    const glow = tex
      ? canvasTex(
          64,
          (g, s) => {
            const gr = g.createRadialGradient(
              s / 2,
              s / 2,
              0,
              s / 2,
              s / 2,
              s / 2,
            );
            gr.addColorStop(0, "rgba(255,255,255,1)");
            gr.addColorStop(0.12, "rgba(255,255,255,0.95)");
            gr.addColorStop(0.35, "rgba(255,255,255,0.32)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gr;
            g.fillRect(0, 0, s, s);
          },
          false,
        )
      : null;
    this.lightsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uNav: { value: 1 },
        uStrobe: { value: 0 },
        uBeacon: { value: 0 },
        uLand: { value: 0 },
        uDay: { value: 1 },
        uFocal: { value: 800 },
        uMap: { value: glow },
      },
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(lg, this.lightsMat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    pts.name = "lights";
    this.group.add(pts);
    // lens covers (unlit, so they read as lit lamps up close)
    {
      const lens = (p: THREE.Vector3, col: number, r: number) => {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 10, 6),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        m.position.copy(p);
        m.scale.set(1, 0.7, 1.3);
        this.group.add(m);
      };
      lens(P(tipX, -5.45, tipWL), 0xd0201a, 0.045);
      lens(P(tipX, 5.45, tipWL), 0x18c040, 0.045);
      lens(P(7.66, 0, 2.665), 0xb01010, 0.045);
      lens(P(8.25, 0, 1.13), 0xf4f0e0, 0.03);
    }

    // ---------------- shadow & landing-light pool
    const shTex = tex
      ? canvasTex(
          256,
          (g, s) => {
            // top-view silhouette, blurred (nose up in the texture = -z)
            const k = s / 13;
            const cx = s / 2,
              cy = s / 2;
            const X = (x: number) => cx + x * k,
              Z = (z: number) => cy + z * k;
            // alphaMap reads the green channel: white silhouette on black
            g.fillStyle = "#000";
            g.fillRect(0, 0, s, s);
            g.filter = "blur(4px)";
            g.fillStyle = "#fff";
            g.beginPath();
            g.ellipse(X(0), Z(1.2), 0.55 * k, 4.1 * k, 0, 0, Math.PI * 2);
            g.fill();
            g.fillRect(X(-5.5), Z(wingLE(0) - X_MAIN), 11 * k, 1.63 * k * 0.95);
            g.fillRect(X(-1.72), Z(6.9 - X_MAIN), 3.45 * k, 1.1 * k);
          },
          false,
        )
      : null;
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        fog: false,
        alphaMap: shTex,
      }),
    );
    this.shadow.renderOrder = 1;
    this.shadow.name = "shadow";
    this.shadow.frustumCulled = false;
    const poolTex = tex
      ? canvasTex(
          128,
          (g, s) => {
            const gr = g.createRadialGradient(
              s / 2,
              s / 2,
              0,
              s / 2,
              s / 2,
              s / 2,
            );
            gr.addColorStop(0, "rgba(255,255,255,1)");
            gr.addColorStop(0.45, "rgba(255,255,255,0.5)");
            gr.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gr;
            g.fillRect(0, 0, s, s);
          },
          false,
        )
      : null;
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: poolTex,
        color: 0xfff1d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5,
        fog: false,
      }),
    );
    this.pool.renderOrder = 1;
    this.pool.name = "landingLightPool";
    this.pool.frustumCulled = false;

    this.parts = { ...cs, prop, disc, wheels, noseGear };
  }

  // ---------------------------------------------------------------- airframe builders
  private fuselage(): THREE.BufferGeometry[] {
    const rings: Ring[] = [];
    const NS = 56;
    const xs: number[] = [];
    for (let X = FX0; X < FX1 - 1e-6; X += X < 2 ? 0.05 : 0.09) xs.push(X);
    xs.push(FX1);
    for (const X of xs) {
      const s = section(X);
      const grp: RingPt[] = [];
      for (let j = 0; j <= NS; j++) {
        const th = -Math.PI / 2 + (j / NS) * 2 * Math.PI;
        const [bl, wl] = fusePoint(s, th);
        grp.push({ p: P(X, bl, wl), uv: [fuseU(X), fuseV(th)] });
      }
      rings.push([grp]);
    }
    const geos = loft(
      rings,
      (i) => P(xs[i], 0, section(xs[i]).zc),
      [true, true],
      true,
    );
    return geos;
  }

  private wingStrip(
    side: number,
    bls: number[],
    cut: (bl: number) => number,
    caps: [boolean, boolean],
  ): THREE.BufferGeometry[] {
    const rings: Ring[] = [];
    for (const b of bls) {
      const c = wingChord(b),
        le = wingLE(b),
        wl = wingWL(b);
      // rounded tip: thickness and camber fade over the last 20 cm
      const tipK =
        b > 5.3 ? Math.sqrt(Math.max(0.02, 1 - ((b - 5.3) / 0.2) ** 2)) : 1;
      const chordK = b > 5.3 ? 0.55 + 0.45 * tipK : 1;
      const cc = c * chordK,
        lee = le + (c - cc) * 0.5;
      const xc1 = cut(b);
      rings.push(
        mainSection(
          0.12 * tipK,
          0.02 * tipK,
          0.4,
          xc1,
          16,
          (xc, y) => P(lee + xc * cc, side * b, wl + y * cc),
          () => WHITE_UV,
        ),
      );
    }
    return loft(
      rings,
      (i) =>
        P(
          wingLE(bls[i]) + 0.4 * wingChord(bls[i]),
          side * bls[i],
          wingWL(bls[i]),
        ),
      caps,
    );
  }

  private wings(): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    const cutAt = (hx: number) => (bl: number) =>
      (hx - wingLE(bl)) / wingChord(bl);
    const lin = (a: number, b: number, n: number) =>
      Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
    for (const s of [-1, 1]) {
      out.push(
        ...this.wingStrip(s, lin(0, WING.flap.bl0, 2), () => 1, [false, true]),
      );
      out.push(
        ...this.wingStrip(
          s,
          lin(WING.flap.bl0, WING.flap.bl1, 4),
          cutAt(WING.flap.hinge),
          [true, true],
        ),
      );
      out.push(
        ...this.wingStrip(s, lin(WING.flap.bl1, WING.aileron.bl0, 1), () => 1, [
          true,
          true,
        ]),
      );
      out.push(
        ...this.wingStrip(
          s,
          lin(WING.aileron.bl0, WING.aileron.bl1, 6),
          cutAt(WING.aileron.hinge),
          [true, true],
        ),
      );
      out.push(
        ...this.wingStrip(
          s,
          [...lin(WING.aileron.bl1, 5.3, 2), 5.36, 5.42, 5.47, 5.5],
          () => 1,
          [true, true],
        ),
      );
    }
    return out;
  }

  /** builds a hinged control surface over [bl0, bl1] of a lifting surface and returns it posed in place */
  private hinged(
    name: string,
    axisFrom: THREE.Vector3,
    axisTo: THREE.Vector3,
    geos: THREE.BufferGeometry[],
  ): Hinged {
    const pivot = new THREE.Object3D();
    pivot.name = name;
    pivot.position.copy(axisFrom);
    const axis = axisTo.clone().sub(axisFrom).normalize();
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
    pivot.updateMatrix();
    const inv = pivot.matrix.clone().invert();
    const g = mergeGeometries(geos, false)!;
    g.applyMatrix4(inv);
    const mesh = new THREE.Mesh(g, this.paint);
    mesh.name = `${name}Surface`;
    pivot.add(mesh);
    this.group.add(pivot);
    return { pivot, mesh };
  }

  private wingSurface(
    side: number,
    bl0: number,
    bl1: number,
    hinge: number,
    n: number,
  ): THREE.BufferGeometry[] {
    const rings: Ring[] = [];
    const bls = Array.from(
      { length: n + 1 },
      (_, i) => bl0 + ((bl1 - bl0) * i) / n,
    );
    for (const b of bls) {
      const c = wingChord(b),
        le = wingLE(b),
        wl = wingWL(b);
      const xc = (hinge - le) / c;
      const f = naca(xc, 0.12, 0.02, 0.4);
      const len = WING.te - hinge;
      rings.push(
        surfaceSection(
          len,
          f.yt * c * 0.97,
          f.yc * c,
          10,
          (a, y) => P(hinge + a, side * b, wl + y),
          () => WHITE_UV,
        ),
      );
    }
    return loft(rings, (i) => {
      const b = bls[i];
      const f = naca((hinge - wingLE(b)) / wingChord(b), 0.12, 0.02, 0.4);
      return P(
        hinge + (WING.te - hinge) * 0.3,
        side * b,
        wingWL(b) + f.yc * wingChord(b) * 0.7,
      );
    });
  }

  private hingeLine(
    side: number,
    bl0: number,
    bl1: number,
    hinge: number,
  ): [THREE.Vector3, THREE.Vector3] {
    const y = (b: number) =>
      wingWL(b) +
      naca((hinge - wingLE(b)) / wingChord(b), 0.12, 0.02, 0.4).yc *
        wingChord(b);
    const a = P(hinge, side * bl0, y(bl0)),
      b = P(hinge, side * bl1, y(bl1));
    // axis always points to +x so a positive rotation moves the trailing edge down on both sides
    return side > 0 ? [a, b] : [b, a];
  }

  private controlSurfaces() {
    const mk = (
      name: string,
      side: number,
      d: { bl0: number; bl1: number; hinge: number },
      n: number,
    ) => {
      const [a, b] = this.hingeLine(side, d.bl0 + 0.01, d.bl1 - 0.01, d.hinge);
      return this.hinged(
        name,
        a,
        b,
        this.wingSurface(side, d.bl0 + 0.01, d.bl1 - 0.01, d.hinge, n),
      );
    };
    const aileronL = mk("aileronL", -1, WING.aileron, 6);
    const aileronR = mk("aileronR", 1, WING.aileron, 6);
    const flapL = mk("flapL", -1, WING.flap, 4);
    const flapR = mk("flapR", 1, WING.flap, 4);
    // elevator: both halves on one hinge line, right half with the trim tab cut-out
    const EH = 7.72,
      EWL = 1.15;
    const elevTE = (b: number) => 8.18 - (Math.abs(b) / 1.725) ** 2.2 * 0.2;
    const stabHalfT = (b: number) => {
      const c = 8.18 - stabLE(b);
      return naca((EH - stabLE(b)) / c, STAB_T, 0, 0.4).yt * c * 0.97;
    };
    const elevGeos: THREE.BufferGeometry[] = [];
    const tabCut = (b: number) => (b > 0.30005 && b < 0.78005 ? 0.1 : 0);
    for (const s of [-1, 1]) {
      const bls = [
        0.16, 0.3, 0.3001, 0.5, 0.78, 0.7801, 1.0, 1.25, 1.45, 1.6, 1.68, 1.72,
      ];
      const rings: Ring[] = bls.map((b) => {
        const tipK =
          b > 1.55
            ? Math.sqrt(Math.max(0.05, 1 - ((b - 1.55) / 0.18) ** 2))
            : 1;
        const len = (elevTE(b) - EH) * (0.4 + 0.6 * tipK);
        return surfaceSection(
          len,
          stabHalfT(b) * tipK,
          0,
          8,
          (a, y) => P(EH + a, s * b, EWL + y),
          () => WHITE_UV,
          s > 0 ? tabCut(b) : 0,
        );
      });
      elevGeos.push(...loft(rings, (i) => P(EH + 0.12, s * bls[i], EWL)));
    }
    const elevator = this.hinged(
      "elevator",
      P(EH, -1.7, EWL),
      P(EH, 1.7, EWL),
      elevGeos,
    );
    // trim tab (child of the elevator)
    const tabRings: Ring[] = [0.3, 0.54, 0.78].map((b) => {
      const len = elevTE(b) - EH;
      const h = stabHalfT(b) * Math.max(0.0015, (0.1 / len) ** 1.1);
      return surfaceSection(
        0.1,
        Math.max(0.004, h),
        0,
        4,
        (a, y) => P(EH + len - 0.1 + a, b, EWL + y),
        () => WHITE_UV,
      );
    });
    const tabGeos = loft(tabRings, (i) =>
      P(
        EH + elevTE([0.3, 0.54, 0.78][i]) - EH - 0.06,
        [0.3, 0.54, 0.78][i],
        EWL,
      ),
    );
    const tabPivot = new THREE.Object3D();
    tabPivot.name = "trimTab";
    const tabAxis = P(EH + elevTE(0.3) - EH - 0.1, 0.3, EWL);
    tabPivot.position
      .copy(tabAxis)
      .applyMatrix4(elevator.pivot.matrix.clone().invert());
    tabPivot.updateMatrix();
    const tg = mergeGeometries(tabGeos, false)!;
    tg.applyMatrix4(elevator.pivot.matrix.clone().invert()).applyMatrix4(
      tabPivot.matrix.clone().invert(),
    );
    const tabMesh = new THREE.Mesh(tg, this.paint);
    tabPivot.add(tabMesh);
    elevator.mesh.add(tabPivot);
    const tab: Hinged = { pivot: tabPivot, mesh: tabMesh };
    // rudder: hinge line swept slightly aft, axis pointing up
    const RH = rudderHinge;
    const rTE: [number, number][] = [
      [1.02, 8.2],
      [1.1, 8.28],
      [1.35, 8.28],
      [1.7, 8.235],
      [2.0, 8.195],
      [2.3, 8.155],
      [2.48, 8.11],
      [2.56, 8.04],
      [2.61, 7.95],
    ];
    const rRings: Ring[] = rTE.map(([wl, te]) => {
      const len = te - RH(wl);
      const ht = finHalfT(wl) * 0.97;
      return surfaceSection(
        len,
        ht,
        0,
        8,
        (a, y) => P(RH(wl) + a, y, wl),
        (a) => finUV(RH(wl) + a, wl),
      );
    });
    const rudder = this.hinged(
      "rudder",
      P(RH(1.02), 0, 1.02),
      P(RH(2.62), 0, 2.62),
      loft(rRings, (i) => P(RH(rTE[i][0]) + 0.1, 0, rTE[i][0])),
    );
    return { aileronL, aileronR, flapL, flapR, elevator, tab, rudder };
  }

  private tail(): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    const EH = 7.72,
      EWL = 1.15;
    // horizontal stabiliser (symmetric section, LE swept, straight hinge)
    for (const s of [-1, 1]) {
      const bls = [0, 0.4, 0.8, 1.2, 1.5, 1.62, 1.69, 1.725];
      const rings: Ring[] = bls.map((b) => {
        const chordTot = 8.18 - stabLE(b);
        const tipK =
          b > 1.5 ? Math.sqrt(Math.max(0.03, 1 - ((b - 1.5) / 0.225) ** 2)) : 1;
        const le = stabLE(b) + (1 - tipK) * 0.35;
        const xc1 = (EH - le) / (8.18 - le);
        return mainSection(
          STAB_T * (chordTot / (8.18 - le)) * Math.max(0.3, tipK),
          0,
          0.4,
          Math.min(0.999, xc1),
          12,
          (xc, y) => P(le + xc * (8.18 - le), s * b, EWL + y * (8.18 - le)),
          () => WHITE_UV,
        );
      });
      out.push(
        ...loft(rings, (i) => P((stabLE(bls[i]) + EH) / 2, s * bls[i], EWL), [
          false,
          true,
        ]),
      );
    }
    // vertical fin (fixed part), swept LE, up to the rudder hinge
    const RH = rudderHinge;
    const wls = [1.15, 1.4, 1.7, 2.0, 2.3, 2.5, 2.58, 2.62];
    const fr: Ring[] = wls.map((wl) => {
      const le = finLE(wl),
        te = finTE(wl);
      const c = te - le;
      const xc1 = (RH(wl) - le) / c;
      return mainSection(
        FIN_T * finTopK(wl),
        0,
        0.4,
        xc1,
        12,
        (xc, y) => P(le + xc * c, y * c, wl),
        (xc) => finUV(le + xc * c, wl),
      );
    });
    out.push(
      ...loft(fr, (i) => P((finLE(wls[i]) + RH(wls[i])) / 2, 0, wls[i]), [
        false,
        true,
      ]),
    );
    // dorsal fin: a thin wedge from the aft cabin to the fin leading edge
    const dr: Ring[] = [];
    const dX: number[] = [];
    for (let X = 4.9; X <= 7.0001; X += 0.15) dX.push(X);
    for (const X of dX) {
      const s = section(X);
      const t = (X - 4.9) / 2.1;
      const top = s.zt + 0.005 + Math.max(0.004, t ** 1.7 * (1.78 - s.zt));
      const hw = 0.012 + 0.03 * (1 - t * 0.5);
      const pts: [number, number][] = [
        [-hw - 0.03, s.zt - 0.04],
        [-hw, s.zt],
        [-hw * 0.4, (s.zt + top) / 2],
        [0, top],
        [hw * 0.4, (s.zt + top) / 2],
        [hw, s.zt],
        [hw + 0.03, s.zt - 0.04],
      ];
      dr.push([pts.map(([bl, wl]) => ({ p: P(X, bl, wl), uv: finUV(X, wl) }))]);
    }
    out.push(
      ...loft(dr, (i) => P(dX[i], 0, section(dX[i]).zt - 0.1), [false, true]),
    );
    // fin-top cap with the beacon housing
    out.push(withUV(new THREE.CylinderGeometry(0.025, 0.032, 0.06, 10).translate(0, 2.65, 7.66 - X_MAIN)));
    return out;
  }

  private struts(): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const a = P(2.36, s * 0.5, 0.9),
        bb = 2.95;
      const b = P(wingLE(bb) + 0.38, s * bb, wingWL(bb) - 0.03);
      const rings: Ring[] = [];
      const n = 6;
      const fwd = new THREE.Vector3(0, 0, 1);
      const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a).normalize(), fwd).normalize();
      for (let i = 0; i <= n; i++) {
        const c = a.clone().lerp(b, i / n);
        const grp: RingPt[] = [];
        for (let k = 0; k <= 16; k++) {
          const ang = (k / 16) * Math.PI * 2;
          // streamlined section: chord along the flight direction, thin across, a sharper trailing edge
          const ca = Math.cos(ang);
          grp.push({
            p: c.clone().addScaledVector(fwd, ca * (ca > 0 ? 0.07 : 0.045)).addScaledVector(nrm, Math.sin(ang) * 0.02 * (ca > 0 ? 1 - ca * 0.6 : 1)),
            uv: WHITE_UV,
          });
        }
        rings.push([grp]);
      }
      out.push(
        ...loft(rings, (i) => a.clone().lerp(b, i / n), [true, true], true),
      );
      // fairing cuffs at both ends
      out.push(
        withUV(
          new THREE.SphereGeometry(0.06, 10, 6)
            .scale(0.7, 0.8, 1.6)
            .translate(a.x, a.y, a.z),
        ),
      );
      out.push(
        withUV(
          new THREE.SphereGeometry(0.06, 10, 6)
            .scale(0.7, 0.8, 1.8)
            .translate(b.x, b.y + 0.03, b.z),
        ),
      );
    }
    return out;
  }

  /** teardrop wheel fairing (speed pant) centred on an axle */
  private fairing(
    BL: number,
    axleWL: number,
    X: number,
    hw: number,
    hh: number,
    len: number,
  ): THREE.BufferGeometry[] {
    const rings: Ring[] = [];
    const xs: number[] = [];
    const x0 = X - len * 0.42,
      x1 = X + len * 0.58;
    for (let i = 0; i <= 14; i++) xs.push(x0 + ((x1 - x0) * i) / 14);
    for (const x of xs) {
      const t = (x - x0) / (x1 - x0);
      // blunt nose, long tapering tail
      const prof =
        t < 0.35
          ? Math.sqrt(Math.max(0.0001, 1 - ((0.35 - t) / 0.35) ** 2))
          : 1 - ((t - 0.35) / 0.65) ** 1.6 * 0.92;
      const grp: RingPt[] = [];
      for (let k = 0; k <= 20; k++) {
        const ang = -Math.PI / 2 + (k / 20) * Math.PI * 2;
        const cx = Math.cos(ang),
          sy = Math.sin(ang);
        // open at the bottom where the tyre shows: lift the lower half
        // flat open-looking bottom a few cm above the ground: the tyre shows below it
        const yy = Math.max(sy * hh * prof, 0.075 - (axleWL + 0.03));
        grp.push({
          p: P(x, BL + cx * hw * Math.max(0.12, prof), axleWL + 0.03 + yy),
          uv: WHITE_UV,
        });
      }
      rings.push([grp]);
    }
    return loft(rings, (i) => P(xs[i], BL, axleWL + 0.03), [true, true], true);
  }

  private gear(): {
    paint: THREE.BufferGeometry[];
    metal: THREE.BufferGeometry[];
  } {
    const paint: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      // flat spring-steel leg from the belly to the axle
      const a = P(2.62, s * 0.36, 0.76),
        b = P(X_MAIN, s * 1.17, 0.25);
      const rings: Ring[] = [];
      for (let i = 0; i <= 4; i++) {
        const c = a.clone().lerp(b, i / 4);
        const wdt = 0.085 - 0.03 * (i / 4),
          th = 0.028 - 0.008 * (i / 4);
        const dir = b.clone().sub(a).normalize();
        const side = new THREE.Vector3(0, 0, 1);
        const nrm = new THREE.Vector3().crossVectors(dir, side).normalize();
        const grp: RingPt[] = [];
        for (let k = 0; k <= 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          grp.push({
            p: c
              .clone()
              .addScaledVector(side, Math.cos(ang) * wdt)
              .addScaledVector(nrm, Math.sin(ang) * th),
            uv: WHITE_UV,
          });
        }
        rings.push([grp]);
      }
      paint.push(
        ...loft(rings, (i) => a.clone().lerp(b, i / 4), [true, true], true),
      );
      paint.push(
        ...this.fairing(s * 1.27, 0.215, X_MAIN, 0.125, 0.26, 0.86),
      );
      metal.push(
        withUV(
          new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8)
            .rotateZ(Math.PI / 2)
            .translate(s * 1.21, 0.215, 0),
        ),
      );
    }
    return { paint, metal };
  }

  private spinner(): THREE.BufferGeometry {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(
        new THREE.Vector2(
          Math.max(0.0005, 0.2 * Math.sin((t * Math.PI) / 2) ** 0.75),
          0.34 * (1 - t),
        ),
      );
    }
    pts.reverse();
    const g = new THREE.LatheGeometry(
      pts.map((p) => new THREE.Vector2(p.x, -p.y)),
      28,
    );
    // lathe axis is y: turn it to point forward (-z) and move to the thrust line
    g.rotateX(Math.PI / 2).translate(0, 1.22, 0.34 - X_MAIN);
    const sp = g.getAttribute("position");
    orient(g, (vi) => new THREE.Vector3(0, 1.22, sp.getZ(vi)));
    g.computeVertexNormals();
    return withUV(g);
  }

  private details(): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    // cowl inlets either side of the spinner
    for (const s of [-1, 1])
      out.push(
        new THREE.CircleGeometry(0.085, 16)
          .scale(1, 0.7, 1)
          .rotateY(Math.PI)
          .translate(s * 0.27, 1.28, 0.335 - X_MAIN),
      );
    // exhaust stack under the right cowl
    out.push(
      new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10)
        .rotateX(Math.PI / 2 - 0.3)
        .translate(0.16, 0.8, 1.1 - X_MAIN),
    );
    // cowl flap / lower air exit
    out.push(
      new THREE.BoxGeometry(0.5, 0.03, 0.08).translate(0, 0.73, 1.28 - X_MAIN),
    );
    // antennas: two VHF blades / whips on the cabin top, transponder and ELT on the belly / tail cone
    out.push(
      new THREE.BoxGeometry(0.012, 0.32, 0.07)
        .rotateX(0.35)
        .translate(0, 2.14, 3.0 - X_MAIN),
    );
    out.push(
      new THREE.BoxGeometry(0.012, 0.26, 0.07)
        .rotateX(0.35)
        .translate(0, 1.67, 4.25 - X_MAIN),
    );
    out.push(
      new THREE.CylinderGeometry(0.004, 0.006, 0.55, 6)
        .rotateX(-0.9)
        .translate(0, 1.66, 4.65 - X_MAIN),
    );
    out.push(
      new THREE.BoxGeometry(0.01, 0.1, 0.05).translate(0, 0.68, 2.2 - X_MAIN),
    );
    // pitot tube under the left wing
    out.push(
      new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6)
        .rotateX(Math.PI / 2)
        .translate(-3.3, wingWL(3.3) - 0.12, wingLE(3.3) - X_MAIN - 0.05),
    );
    out.push(
      new THREE.BoxGeometry(0.01, 0.1, 0.05).translate(
        -3.3,
        wingWL(3.3) - 0.07,
        wingLE(3.3) + 0.08 - X_MAIN,
      ),
    );
    // fuel caps on the wing tops
    for (const s of [-1, 1])
      out.push(
        new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12).translate(
          s * 1.6,
          wingWL(1.6) + 0.12 * 1.63 * 0.62,
          wingLE(1.6) + 0.45 - X_MAIN,
        ),
      );
    // tie-down rings and the tail skid
    out.push(
      new THREE.BoxGeometry(0.05, 0.08, 0.14).translate(0, 1.04, 7.55 - X_MAIN),
    );
    return out.map((g) => withUV(g.index ? g.toNonIndexed() : g));
  }

  private propeller(): THREE.BufferGeometry {
    const blades: THREE.BufferGeometry[] = [];
    const pitch = 1.35;
    const radii = [
      0.17, 0.22, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.84, 0.84, 0.88, 0.88, 0.92,
      0.94, 0.955,
    ];
    const band = (r: number, i: number) => {
      // dark-grey blade, white then red tip bands (duplicated radii make crisp band edges)
      const next = radii[i + 1] ?? 1;
      if (r >= 0.88 && !(r === 0.88 && next === 0.88)) return [0.72, 0.1, 0.1];
      if (r >= 0.84 && !(r === 0.84 && next === 0.84)) return [0.92, 0.92, 0.9];
      return [0.18, 0.19, 0.2];
    };
    for (const k of [0, 1]) {
      const pos: number[] = [],
        col: number[] = [],
        idx: number[] = [];
      const n = 14;
      radii.forEach((r, i) => {
        const beta = Math.atan(pitch / (2 * Math.PI * Math.max(0.12, r)));
        const tipR =
          r > 0.9 ? Math.sqrt(Math.max(0.08, 1 - ((r - 0.9) / 0.058) ** 2)) : 1;
        const chord =
          (r < 0.24 ? 0.09 + (r - 0.17) * 1.0 : 0.16 - (r - 0.24) * 0.1) * tipR;
        const th =
          (r < 0.3 ? 0.035 : 0.022 - (r - 0.3) * 0.015) * Math.max(0.5, tipR);
        const cd = new THREE.Vector3(Math.cos(beta), 0, -Math.sin(beta)); // TE → LE (LE leads to +x, forward)
        const nd = new THREE.Vector3(Math.sin(beta), 0, Math.cos(beta));
        const c = band(r, i);
        for (let j = 0; j <= n; j++) {
          const ang = (j / n) * Math.PI * 2;
          const a = Math.cos(ang) * 0.5,
            b = Math.sin(ang) * 0.5 * (Math.cos(ang) > 0 ? 1 : 0.8);
          const p = new THREE.Vector3(0, r, 0)
            .addScaledVector(cd, (a - 0.1) * chord)
            .addScaledVector(nd, b * th - Math.abs(Math.cos(ang)) * 0.004);
          pos.push(p.x, p.y, p.z);
          col.push(...c);
        }
      });
      for (let i = 0; i < radii.length - 1; i++)
        for (let j = 0; j < n; j++) {
          const a = i * (n + 1) + j,
            b = a + 1,
            c = a + n + 1,
            d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
      // tip cap
      const last = (radii.length - 1) * (n + 1);
      const tc = pos.length / 3;
      pos.push(0, 0.958, 0);
      col.push(0.72, 0.1, 0.1);
      for (let j = 0; j < n; j++) idx.push(last + j, last + j + 1, tc);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      orient(g, (vi) => {
        const r = pos[vi * 3 + 1];
        return new THREE.Vector3(0, Math.max(0.17, Math.min(0.95, r)), 0);
      });
      g.computeVertexNormals();
      if (k === 1) g.rotateZ(Math.PI);
      blades.push(g);
    }
    // hub
    const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12)
      .rotateX(Math.PI / 2)
      .toNonIndexed();
    const hc: number[] = [];
    for (let i = 0; i < hub.getAttribute("position").count; i++)
      hc.push(0.25, 0.25, 0.27);
    hub.setAttribute("color", new THREE.Float32BufferAttribute(hc, 3));
    hub.deleteAttribute("uv");
    return mergeGeometries(
      [...blades.map((b) => b.toNonIndexed()), hub],
      false,
    )!;
  }

  // ---------------------------------------------------------------- environment (reflections)
  /** sky-gradient reflection map for the paint and glass; call again when the time of day changes */
  setEnvironment(
    renderer: THREE.WebGLRenderer,
    top: THREE.Color,
    horizon: THREE.Color,
    ground: THREE.Color,
    intensity: number,
  ) {
    const sc = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: top },
        uHor: { value: horizon },
        uGnd: { value: ground },
      },
      vertexShader:
        "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGnd; varying vec3 vD; void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.5)) : mix(uHor * 0.85, uGnd, pow(min(1.0, -h * 3.0), 0.6)); gl_FragColor = vec4(c, 1.0); }",
    });
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat));
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(sc, 0.02);
    pm.dispose();
    mat.dispose();
    this.envRT?.dispose();
    this.envRT = rt;
    for (const m of this.materials) {
      m.envMap = rt.texture;
      m.envMapIntensity = intensity;
      m.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- animation
  update(a: AircraftAnim) {
    const p = this.parts;
    const ail = clamp1(a.aileron),
      ele = clamp1(a.elevator),
      rud = clamp1(a.rudder);
    // ailerons: + = roll right → right up / left down (differential travel)
    p.aileronR.mesh.rotation.x =
      (ail > 0 ? -TRAVEL.aileronUp * ail : -TRAVEL.aileronDown * ail) * DEG;
    p.aileronL.mesh.rotation.x =
      (ail > 0 ? TRAVEL.aileronDown * ail : TRAVEL.aileronUp * ail) * DEG;
    // elevator: + = nose up → trailing edge up (negative rotation)
    p.elevator.mesh.rotation.x =
      (ele > 0 ? -TRAVEL.elevatorUp * ele : -TRAVEL.elevatorDown * ele) * DEG;
    p.tab.mesh.rotation.x = clamp1(a.trim) * TRAVEL.tab * DEG;
    // rudder: + = yaw right → trailing edge to the right
    p.rudder.mesh.rotation.x = rud * TRAVEL.rudder * DEG;
    // flaps: rotate down and travel aft a little (single-slotted, semi-Fowler)
    const f = Math.max(0, Math.min(1, a.flaps));
    for (const fl of [p.flapL, p.flapR]) {
      fl.mesh.rotation.x = f * TRAVEL.flaps * DEG;
      fl.mesh.position.set(0, -0.035 * f, 0.1 * f);
    }
    // propeller: clockwise seen from the cockpit; blades fade into a disc above ~900 rpm
    const rps = Math.max(0, a.rpm) / 60;
    this.propAngle =
      (this.propAngle - rps * 2 * Math.PI * Math.min(0.1, Math.max(0, a.dt))) %
      (Math.PI * 2);
    const blur = Math.max(0, Math.min(1, (a.rpm - 500) / 700));
    // above the blur threshold the blades are drawn at a slow stroboscopic rate so they still read as turning
    p.prop.rotation.z = blur > 0.98 ? -a.t * 2.1 : this.propAngle;
    const pm = p.prop.material as THREE.MeshStandardMaterial;
    pm.transparent = blur > 0.02;
    pm.opacity = 1 - blur * 0.88;
    pm.depthWrite = blur < 0.5;
    const dm = p.disc.material as THREE.MeshBasicMaterial;
    dm.opacity = blur;
    // the disc is unlit: dim it with the ambient light so it does not glow at night
    dm.color.setScalar(0.25 + 0.75 * Math.max(0, Math.min(1, a.day)));
    p.disc.visible = blur > 0.01;
    p.disc.rotation.z = -a.t * 3;
    // wheels roll on the ground; the nose wheel steers with the rudder
    if (a.onGround)
      this.wheelAngle -= (a.gsMps / 0.2) * Math.min(0.1, Math.max(0, a.dt));
    for (const w of p.wheels) w.rotation.x = this.wheelAngle;
    p.noseGear.rotation.y = a.onGround ? -rud * TRAVEL.noseSteer * DEG : 0;
    // lights: beacon with the engine, strobes on the runway and in flight, landing light below 1000 ft
    const running = a.rpm > 300;
    const auto = {
      nav: true,
      beacon: running,
      strobe: !a.onGround || a.gsMps > 12,
      landing: (a.onGround && a.gsMps > 12) || (!a.onGround && a.aglFt < 1000),
    };
    this.lights = { ...auto, ...(this.lightOverride ?? {}) };
    const u = this.lightsMat.uniforms;
    u.uTime.value = a.t;
    u.uNav.value = this.lights.nav ? 1 : 0;
    u.uStrobe.value = this.lights.strobe ? 1 : 0;
    u.uBeacon.value = this.lights.beacon ? 1 : 0;
    u.uLand.value = this.lights.landing ? 1 : 0;
    u.uDay.value = a.day;
  }

  /** px per metre at unit distance (focal length in pixels) for the light glow size */
  setFocal(px: number) {
    this.lightsMat.uniforms.uFocal.value = px;
  }

  /**
   * Place the blob shadow and the landing-light pool on the ground.
   * `pos` = model origin, `groundY` = ground height there, `sunDir` = unit vector toward the sun.
   */
  placeGround(
    pos: THREE.Vector3,
    hdg: number,
    pitch: number,
    roll: number,
    groundY: number,
    sunDir: THREE.Vector3,
    shadowStrength: number,
    poolStrength: number,
  ) {
    const h = Math.max(0, pos.y - groundY);
    // shadow: projected along the sun direction, fading with height
    const sy = Math.max(0.25, sunDir.y);
    const off = Math.min(60, h / sy);
    const fade = Math.max(0, 1 - h / 90) ** 1.5;
    const sm = this.shadow.material as THREE.MeshBasicMaterial;
    sm.opacity = 0.62 * shadowStrength * fade;
    this.shadow.visible = sm.opacity > 0.01;
    this.shadow.position.set(
      pos.x - sunDir.x * off,
      groundY + 0.06,
      pos.z - sunDir.z * off,
    );
    this.shadow.rotation.set(0, -hdg, 0);
    const spread = 1 + h * 0.004;
    this.shadow.scale.set(
      Math.max(0.2, Math.cos(roll)) * spread,
      1,
      Math.max(0.3, Math.cos(pitch)) * spread,
    );
    // landing-light pool: where the beam (aimed ~6° below the body axis) meets the ground, fading with range
    const pmat = this.pool.material as THREE.MeshBasicMaterial;
    const on = this.lights.landing ? 1 : 0;
    const down = Math.max(2 * DEG, 6 * DEG - pitch);
    const lh = h + 1.9;
    const dist = Math.min(150, lh / Math.tan(down)) + 4;
    const reach = Math.max(0, 1 - h / 70);
    pmat.opacity = 0.55 * on * poolStrength * reach * Math.max(0.3, Math.min(1, 45 / dist));
    this.pool.visible = pmat.opacity > 0.01;
    const fx = Math.sin(hdg),
      fz = -Math.cos(hdg);
    const centreD = Math.min(dist * 0.7, 9 + dist * 0.45);
    this.pool.position.set(
      pos.x + fx * centreD,
      groundY + 0.08,
      pos.z + fz * centreD,
    );
    this.pool.rotation.set(0, -hdg, 0);
    this.pool.scale.set(8 + dist * 0.22, 1, Math.max(12, dist * 1.1));
  }

  /** world-space bounding box of the airframe (no lights / shadow) */
  bounds(): THREE.Box3 {
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o, true);
    });
    return box;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.envRT?.dispose();
  }
}

function clamp1(v: number) {
  return Math.max(-1, Math.min(1, isFinite(v) ? v : 0));
}
const STAB_T = 0.055;
const FIN_T = 0.1;
const finLE = (wl: number) => 6.72 + ((wl - 1.2) / 1.42) * 0.8;
const finTE = (wl: number) => 8.24 - ((wl - 1.15) / 1.47) * 0.14;
const rudderHinge = (wl: number) => 7.7 + ((wl - 1.02) / 1.6) * 0.15;
const finTopK = (wl: number) => (wl > 2.55 ? 0.7 : 1);
function finHalfT(wl: number) {
  const le = finLE(wl),
    c = finTE(wl) - le;
  return naca((rudderHinge(wl) - le) / c, FIN_T * finTopK(wl), 0, 0.4).yt * c;
}
function stabLE(b: number) {
  return 6.85 + (Math.abs(b) / 1.725) * 0.4;
}
/** constant white-region UVs for primitives merged into the paint mesh */
function withUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute("position").count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = WHITE_UV[0];
    uv[i * 2 + 1] = WHITE_UV[1];
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (!geo.getAttribute("normal")) geo.computeVertexNormals();
  // re-index so it can be merged with the indexed lofts
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  geo.setIndex(idx);
  return geo;
}
