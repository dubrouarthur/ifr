// The engines' 3D kit: a few shared materials, a builder that merges the static parts of one moving group into one
// mesh per material (a handful of draw calls per engine, software WebGL stays smooth), and the coloured gas flow
// (one Points object, a few hundred particles moved on the CPU). Everything is procedural: no file, no texture.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { L10n } from "../types";

export type MatKey =
  | "steel"
  | "dark"
  | "alu"
  | "copper"
  | "ghost"
  | "ghostDark"
  | "blade"
  | "fan"
  | "hot"
  | "burn"
  | "oil"
  | "brass"
  | "spark"
  | "black"
  | "paint";

export type Mats = Record<MatKey, THREE.Material>;
export function makeMats(): Mats {
  const std = (
    color: number,
    metalness = 0.6,
    roughness = 0.45,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      flatShading: true,
      ...extra,
    });
  return {
    steel: std(0xa9b2bd, 0.75, 0.38),
    dark: std(0x4a525c, 0.6, 0.55),
    alu: std(0xc9cfd6, 0.55, 0.42),
    copper: std(0xb87333, 0.7, 0.4),
    ghost: new THREE.MeshStandardMaterial({
      color: 0x9fb4c8,
      metalness: 0.2,
      roughness: 0.6,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ghostDark: new THREE.MeshStandardMaterial({
      color: 0x5d6b7a,
      metalness: 0.3,
      roughness: 0.6,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    blade: std(0x8f9aa6, 0.7, 0.35, { side: THREE.DoubleSide }),
    fan: std(0x6f7c8a, 0.65, 0.4, { side: THREE.DoubleSide }),
    hot: std(0xb0603a, 0.5, 0.5, {
      emissive: 0x5a1c00,
      emissiveIntensity: 0.6,
    }),
    burn: new THREE.MeshBasicMaterial({
      color: 0xff8a2a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    oil: std(0xd9a21b, 0.2, 0.5),
    brass: std(0xc8a24a, 0.7, 0.35),
    spark: new THREE.MeshBasicMaterial({ color: 0xfff1a8 }),
    black: std(0x22272e, 0.3, 0.7),
    paint: std(0x2f5d8a, 0.3, 0.55),
  };
}

export interface Place {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
export function placed(
  geo: THREE.BufferGeometry,
  p: Place = {},
): THREE.BufferGeometry {
  tmpE.set(...(p.rot ?? [0, 0, 0]));
  tmpQ.setFromEuler(tmpE);
  tmpM.compose(
    new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
    tmpQ,
    new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
  );
  geo.applyMatrix4(tmpM);
  return geo;
}
/** A cylinder along X (three's cylinders stand on Y). */
export function cylX(
  r1: number,
  r2: number,
  len: number,
  seg = 16,
  open = false,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, open);
  g.rotateZ(Math.PI / 2);
  return g;
}
/** A cylinder along Z. */
export function cylZ(
  r: number,
  len: number,
  seg = 16,
  open = false,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Collects static parts per (group, material) and merges them: one mesh each. */
export class Builder {
  private buckets = new Map<
    string,
    { group: THREE.Object3D; mat: MatKey; geos: THREE.BufferGeometry[] }
  >();
  private ids = new WeakMap<THREE.Object3D, number>();
  private n = 0;
  add(
    group: THREE.Object3D,
    mat: MatKey,
    geo: THREE.BufferGeometry,
    p?: Place,
  ): void {
    if (!this.ids.has(group)) this.ids.set(group, this.n++);
    const key = `${this.ids.get(group)}:${mat}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { group, mat, geos: [] }));
    // merging needs the same attributes everywhere: indexed, position + normal + uv
    const g = placed(geo, p);
    b.geos.push(g.index ? g : g);
  }
  finish(mats: Mats): void {
    for (const b of this.buckets.values()) {
      const norm = b.geos.map((g) => (g.index ? g.toNonIndexed() : g));
      for (const g of b.geos) if (!norm.includes(g)) g.dispose();
      for (const g of norm) {
        if (!g.getAttribute("uv"))
          g.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute(
              new Float32Array(g.getAttribute("position").count * 2),
              2,
            ),
          );
        if (!g.getAttribute("normal")) g.computeVertexNormals();
      }
      const merged = norm.length === 1 ? norm[0] : mergeGeometries(norm, false);
      if (norm.length > 1) for (const g of norm) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[b.mat]);
      if (b.mat === "ghost" || b.mat === "ghostDark") mesh.renderOrder = 2;
      b.group.add(mesh);
    }
    this.buckets.clear();
  }
}

/** A ring of blades around X (a compressor or turbine stage, the fan): merged into the builder's bucket. */
export function bladeRing(
  b: Builder,
  group: THREE.Object3D,
  mat: MatKey,
  o: {
    x: number;
    rIn: number;
    rOut: number;
    n: number;
    chord: number;
    twist: number;
    thick?: number;
  },
): void {
  const len = o.rOut - o.rIn;
  for (let k = 0; k < o.n; k++) {
    const a = (k / o.n) * Math.PI * 2;
    const g = new THREE.BoxGeometry(o.chord, len, o.thick ?? 0.02);
    // the blade stands on Y at the hub, set at its twist, then turned round the shaft
    g.translate(0, o.rIn + len / 2, 0);
    g.rotateY(o.twist);
    g.rotateX(a);
    g.translate(o.x, 0, 0);
    b.add(group, mat, g);
  }
}

// ------------------------------------------------------------------ the gas flow
export interface AxialPath {
  k: "axial";
  x0: number;
  x1: number;
  /** inner and outer radius of the stream at x */
  rIn(x: number): number;
  rOut(x: number): number;
  /** colour stops along the path (s 0..1) */
  colors: [number, number][];
  /** particles on this path */
  n: number;
  /** particles flow backwards (the reversed by-pass stream turned forward and out) */
  reverse?: boolean;
}
export interface PolyPath {
  k: "poly";
  pts: THREE.Vector3[];
  radius: number;
  colors: [number, number][];
  n: number;
}
export type FlowPath = AxialPath | PolyPath;

/** Coloured particles moving along paths; each path's speed is set every frame (0 stops it, hidden). */
export class Flow {
  readonly points: THREE.Points;
  private s: Float32Array;
  private a: Float32Array;
  private r: Float32Array;
  private pathOf: Uint16Array;
  private pos: Float32Array;
  private col: Float32Array;
  private speeds: number[];
  private curves: (THREE.CatmullRomCurve3 | null)[];
  private tmp = new THREE.Vector3();
  private c0 = new THREE.Color();
  private c1 = new THREE.Color();
  constructor(
    private paths: FlowPath[],
    size = 0.06,
  ) {
    const N = paths.reduce((n, p) => n + p.n, 0);
    this.s = new Float32Array(N);
    this.a = new Float32Array(N);
    this.r = new Float32Array(N);
    this.pathOf = new Uint16Array(N);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.speeds = paths.map(() => 0);
    this.curves = paths.map((p) =>
      p.k === "poly" ? new THREE.CatmullRomCurve3(p.pts) : null,
    );
    let i = 0;
    // a fixed pseudo-random spread: the same picture every time
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    paths.forEach((p, k) => {
      for (let j = 0; j < p.n; j++, i++) {
        this.pathOf[i] = k;
        this.s[i] = j / p.n + rnd() / p.n;
        this.a[i] = rnd() * Math.PI * 2;
        this.r[i] = 0.15 + 0.7 * rnd();
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.step(0);
  }
  setSpeed(path: number, v: number) {
    this.speeds[path] = v;
  }
  /** move every particle by dt (s) at its path's speed (path lengths per second) */
  step(dt: number) {
    const N = this.s.length;
    for (let i = 0; i < N; i++) {
      const k = this.pathOf[i];
      const p = this.paths[k];
      const v = this.speeds[k];
      let s = this.s[i] + v * dt;
      s -= Math.floor(s);
      this.s[i] = s;
      const hidden = v <= 0;
      const j = i * 3;
      const sp = p.k === "axial" && p.reverse ? 1 - s : s;
      if (p.k === "axial") {
        const x = p.x0 + (p.x1 - p.x0) * sp;
        const R = p.rIn(x) + (p.rOut(x) - p.rIn(x)) * this.r[i];
        this.a[i] += dt * v * 0.8;
        this.pos[j] = x;
        this.pos[j + 1] = R * Math.cos(this.a[i]);
        this.pos[j + 2] = R * Math.sin(this.a[i]);
      } else {
        this.curves[k]!.getPointAt(sp, this.tmp);
        const off = p.radius * (this.r[i] - 0.5) * 2;
        this.pos[j] = this.tmp.x + off * Math.cos(this.a[i]);
        this.pos[j + 1] = this.tmp.y + off * Math.sin(this.a[i]);
        this.pos[j + 2] = this.tmp.z + off * Math.cos(this.a[i] * 1.7);
      }
      if (hidden) this.pos[j + 1] = -9999;
      this.colorAt(p.colors, sp, j);
    }
    const g = this.points.geometry;
    g.getAttribute("position").needsUpdate = true;
    g.getAttribute("color").needsUpdate = true;
  }
  private colorAt(stops: [number, number][], s: number, j: number) {
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++)
      if (s >= stops[k][0] && s <= stops[k + 1][0]) {
        a = stops[k];
        b = stops[k + 1];
        break;
      }
    const t = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
    this.c0.setHex(a[1]);
    this.c1.setHex(b[1]);
    this.c0.lerp(this.c1, Math.min(1, Math.max(0, t)));
    this.col[j] = this.c0.r;
    this.col[j + 1] = this.c0.g;
    this.col[j + 2] = this.c0.b;
  }
}

// ------------------------------------------------------------------ the model contract
/** What the view tells the model every frame. */
export interface EngineFrame {
  /** simulated seconds since the last frame (0 when paused or still) */
  dt: number;
  /** the gauges' values now (smoothed): rpm, n1, n2, ng, np… */
  v: Record<string, number>;
  /** lever positions */
  set: {
    throttle: number;
    mixture: number;
    carbHeat: boolean;
    prop: number;
    reverse: boolean;
    mags: "both" | "left" | "right" | "off";
  };
  /** the step chosen (a stroke, a station) */
  stage: number;
  /** reduced motion or a still picture: pose the step, no flow */
  still: boolean;
}
export interface PartLabel {
  id: string;
  name: L10n;
  obj: THREE.Object3D;
  at: THREE.Vector3;
}
export interface EngineStage {
  id: string;
  name: L10n;
  text: L10n;
  /** the parts the step is about (their names are lit) */
  focus: string[];
}
export interface EngineModel {
  root: THREE.Object3D;
  parts: PartLabel[];
  stages: EngineStage[];
  /** where the camera looks from: radius, yaw, pitch (rad) and the point it looks at */
  view: {
    radius: number;
    yaw: number;
    pitch: number;
    target: [number, number, number];
  };
  /** the step the moving engine is on now (the piston's stroke follows cylinder 1); undefined: the chosen one */
  liveStage?(): number | undefined;
  update(f: EngineFrame): void;
}

/** Free every geometry and material under a root (and the root's children). */
export function disposeTree(
  root: THREE.Object3D,
  mats?: Mats,
): { geometries: number; materials: number } {
  const geos = new Set<THREE.BufferGeometry>();
  const ms = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) ms.add(x);
  });
  if (mats) for (const x of Object.values(mats)) ms.add(x);
  for (const g of geos) g.dispose();
  for (const x of ms) x.dispose();
  root.clear();
  return { geometries: geos.size, materials: ms.size };
}
