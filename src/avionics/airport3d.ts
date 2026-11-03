// Airport scenery for the 3D view, built at real dimensions (FAA AC 150/5340-1 markings):
// runway asphalt + shoulders + blast pads, threshold bars, designators, centreline, aiming point, TDZ bars,
// tyre marks, parallel taxiway with connectors and hold-short lines, apron with stands, terminal, hangars,
// tower, fuel farm, car park, windsock, localizer array, parked aircraft and taxiway edge lights.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { destination, FT_PER_NM, type LatLon } from "../nav/geo";
import { groundElevation } from "../nav/data";
import type { Airport, Runway } from "../nav/types";

const FT = 0.3048;
type V3 = THREE.Vector3;
export interface AptLight {
  p: V3;
  color: [number, number, number];
  size: number;
  seq: number;
  papi: number;
}
type WorldFn = (p: LatLon, altFt?: number) => V3;

const WHITE: [number, number, number] = [0.93, 0.93, 0.9];
const YELLOW: [number, number, number] = [0.95, 0.74, 0.12];
const BLACK: [number, number, number] = [0.05, 0.05, 0.05];

// ------------------------------------------------------------------ batched flat quads
class Batch {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  add(c: V3[], color: [number, number, number], uv?: [number, number][]) {
    const b = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(c[i].x, c[i].y, c[i].z);
      this.col.push(...color);
      const t = uv ? uv[i] : [0, 0];
      this.uv.push(t[0], t[1]);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  mesh(mat: THREE.Material, order: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        this.pos.map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order;
    return m;
  }
}

/** Local frame of a runway: along (ft from threshold, toward the far end), lateral (ft, + = right). */
class Frame {
  constructor(
    private r: Runway,
    private w: WorldFn,
  ) {}
  ll(along: number, lat: number): LatLon {
    return destination(
      destination(this.r.threshold, this.r.heading, along / FT_PER_NM),
      this.r.heading + 90,
      lat / FT_PER_NM,
    );
  }
  /** world point on the ground (+h metres) */
  p(along: number, lat: number, h = 0): V3 {
    const ll = this.ll(along, lat);
    const v = this.w(ll, groundElevation(ll));
    v.y += h;
    return v;
  }
  /** axis-aligned rectangle in the frame, subdivided along its length so it follows the ground */
  rect(
    b: Batch,
    a0: number,
    a1: number,
    l0: number,
    l1: number,
    h: number,
    color: [number, number, number],
    tile = 0,
  ) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 600));
    for (let i = 0; i < n; i++) {
      const s0 = a0 + ((a1 - a0) * i) / n;
      const s1 = a0 + ((a1 - a0) * (i + 1)) / n;
      const c = [
        this.p(s0, l0, h),
        this.p(s0, l1, h),
        this.p(s1, l1, h),
        this.p(s1, l0, h),
      ];
      b.add(
        c,
        color,
        tile
          ? [
              [l0 / tile, s0 / tile],
              [l1 / tile, s0 / tile],
              [l1 / tile, s1 / tile],
              [l0 / tile, s1 / tile],
            ]
          : undefined,
      );
    }
  }
  /** quad from four (along, lat) corners */
  quad(
    b: Batch,
    pts: [number, number][],
    h: number,
    color: [number, number, number],
    uv?: [number, number][],
  ) {
    b.add(
      pts.map(([a, l]) => this.p(a, l, h)),
      color,
      uv,
    );
  }
  heading() {
    return this.r.heading;
  }
}

// ------------------------------------------------------------------ textures
function noiseTex(
  size: number,
  base: number[],
  amp: number,
  seed: number,
  streaks = false,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < size * size; i++) {
    const n =
      (rnd() - 0.5) * amp + (rnd() < 0.02 ? (rnd() - 0.5) * amp * 3 : 0);
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // concrete joints / asphalt patches
  if (streaks) {
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 1;
    for (let k = 0; k <= size; k += size / 4) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, size);
      g.stroke();
      g.beginPath();
      g.moveTo(0, k);
      g.lineTo(size, k);
      g.stroke();
    }
  } else {
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + rnd() * 0.05})`;
      g.fillRect(
        rnd() * size,
        rnd() * size,
        10 + rnd() * size * 0.4,
        6 + rnd() * size * 0.3,
      );
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grassTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  // mowing stripes
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? "#5d7a3c" : "#6b8946";
    g.fillRect(0, i * 32, 256, 32);
  }
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 5000; k++) {
    g.fillStyle = `rgba(${30 + rnd() * 60},${60 + rnd() * 60},${20 + rnd() * 30},0.35)`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const GLYPHS = "0123456789LRC";
function glyphAtlas(): THREE.CanvasTexture {
  const cw = 128,
    ch = 384;
  const c = document.createElement("canvas");
  c.width = cw * GLYPHS.length;
  c.height = ch;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold 330px "Roboto Condensed", "Arial Narrow", Arial, sans-serif`;
  for (let i = 0; i < GLYPHS.length; i++) {
    const m = g.measureText(GLYPHS[i]).width;
    g.save();
    g.translate(i * cw + cw / 2, ch / 2 + 14);
    g.scale(Math.min(1, 116 / m), 1.12);
    g.fillText(GLYPHS[i], 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

// ------------------------------------------------------------------ meshes
function gaAircraft(): THREE.BufferGeometry {
  // high-wing four-seater, metres, nose toward -Z
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    l: number,
    x: number,
    y: number,
    z: number,
  ) => parts.push(new THREE.BoxGeometry(w, h, l).translate(x, y, z));
  box(1.2, 1.4, 4.2, 0, 1.3, 0); // cabin / fuselage
  box(0.7, 0.9, 2.8, 0, 1.4, 3.2); // tail cone
  box(11, 0.15, 1.5, 0, 2.15, -0.2); // wing
  box(3.4, 0.1, 0.9, 0, 1.45, 4.3); // stabiliser
  box(0.1, 1.5, 1.1, 0, 2.2, 4.3); // fin
  box(0.08, 0.6, 0.08, 0, 1.3, -2.2); // prop hub
  box(0.1, 1.8, 0.12, 0, 1.3, -2.25); // propeller
  box(2.4, 0.08, 0.1, 0, 0.55, -0.1); // main gear leg
  parts.push(
    new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10)
      .rotateZ(Math.PI / 2)
      .translate(1.2, 0.3, -0.1),
  );
  parts.push(
    new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10)
      .rotateZ(Math.PI / 2)
      .translate(-1.2, 0.3, -0.1),
  );
  parts.push(
    new THREE.CylinderGeometry(0.25, 0.25, 0.15, 10)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.25, -1.8),
  );
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}
function twinAircraft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    l: number,
    x: number,
    y: number,
    z: number,
  ) => parts.push(new THREE.BoxGeometry(w, h, l).translate(x, y, z));
  parts.push(
    new THREE.CylinderGeometry(0.85, 0.7, 11, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 1.7, 0),
  );
  parts.push(
    new THREE.ConeGeometry(0.85, 2, 12)
      .rotateX(-Math.PI / 2)
      .translate(0, 1.7, -6.5),
  );
  box(16, 0.25, 2, 0, 1.2, -0.5); // low wing
  parts.push(
    new THREE.CylinderGeometry(0.45, 0.4, 3, 10)
      .rotateX(Math.PI / 2)
      .translate(3.2, 1.3, -1.3),
  );
  parts.push(
    new THREE.CylinderGeometry(0.45, 0.4, 3, 10)
      .rotateX(Math.PI / 2)
      .translate(-3.2, 1.3, -1.3),
  );
  box(5.5, 0.15, 1.2, 0, 3.6, 5.2); // T-tail
  box(0.2, 2.2, 1.6, 0, 2.6, 5.0);
  box(0.15, 1.4, 0.15, 0, 0.6, -0.5);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}
function hangarGeo(wM: number, dM: number, hM: number): THREE.BufferGeometry {
  // box walls + half-cylinder roof along the depth axis
  const walls = new THREE.BoxGeometry(wM, hM, dM)
    .translate(0, hM / 2, 0)
    .toNonIndexed();
  const roof = new THREE.CylinderGeometry(
    wM / 2,
    wM / 2,
    dM,
    18,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  )
    .rotateX(Math.PI / 2)
    .rotateY(0)
    .scale(1, 0.35, 1)
    .translate(0, hM, 0)
    .toNonIndexed();
  return mergeGeometries([walls, roof]);
}

// ------------------------------------------------------------------ builder
export interface AirportBuild {
  group: THREE.Group;
  lights: AptLight[];
}

export function buildAirports(
  airports: Airport[],
  ilsRunways: Set<string>,
  w: WorldFn,
  quality: "low" | "high",
): AirportBuild {
  const group = new THREE.Group();
  const lights: AptLight[] = [];
  const grass = new Batch();
  const asph = new Batch();
  const conc = new Batch();
  const tyre = new Batch();
  const paint = new Batch();
  const glyph = new Batch();
  const parked: { m: THREE.Matrix4; twin: boolean; color: THREE.Color }[] = [];
  const boxes: {
    geo: THREE.BufferGeometry;
    color: number;
    emissive?: number;
  }[] = [];
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const pushBox = (
    f: Frame,
    along: number,
    lat: number,
    wFt: number,
    dFt: number,
    hFt: number,
    color: number,
    yaw = 0,
    y0 = 0,
    emissive?: number,
  ) => {
    const g = new THREE.BoxGeometry(wFt * FT, hFt * FT, dFt * FT).translate(
      0,
      (hFt * FT) / 2 + y0,
      0,
    );
    place(f, g, along, lat, yaw);
    boxes.push({ geo: g.toNonIndexed(), color, emissive });
  };
  const place = (
    f: Frame,
    g: THREE.BufferGeometry,
    along: number,
    lat: number,
    yaw = 0,
  ) => {
    const p = f.p(along, lat);
    g.rotateY((-(f.heading() + yaw) * Math.PI) / 180);
    g.translate(p.x, p.y, p.z);
  };
  const light = (
    f: Frame,
    along: number,
    lat: number,
    color: [number, number, number],
    size: number,
    h = 0.4,
  ) => lights.push({ p: f.p(along, lat, h), color, size, seq: -1, papi: -1 });

  for (const a of airports) {
    for (let i = 0; i < a.runways.length; i += 2) {
      const r = a.runways[i];
      const o = a.runways[i + 1];
      const primary = i === 0;
      const f = new Frame(r, w);
      const L = r.lengthFt;
      const W = r.widthFt;
      const side = primary ? 1 : -1; // taxiway / apron side (right of the first runway direction)
      // mown grass strip
      f.rect(grass, -1100, L + 1100, -650, 650, 0.12, [1, 1, 1], 200);
      // shoulders, blast pads, runway asphalt
      f.rect(
        asph,
        -200,
        L + 200,
        -W / 2 - 25,
        W / 2 + 25,
        0.22,
        [0.78, 0.78, 0.74],
        60,
      );
      f.rect(asph, 0, L, -W / 2, W / 2, 0.26, [0.62, 0.62, 0.63], 60);
      // blast pads: yellow chevrons
      for (const [s0, dir] of [
        [0, -1],
        [L, 1],
      ] as const)
        for (let k = 1; k <= 3; k++) {
          const a0 = s0 + dir * k * 55;
          for (const sgn of [-1, 1])
            f.quad(
              paint,
              [
                [a0, 0],
                [a0 + dir * 4, 0],
                [a0 + dir * 4 + dir * 28, sgn * (W / 2 - 4)],
                [a0 + dir * 28, sgn * (W / 2 - 4)],
              ],
              0.3,
              YELLOW,
            );
        }
      // side stripes
      for (const sgn of [-1, 1])
        f.rect(paint, 0, L, sgn * (W / 2 - 4), sgn * (W / 2 - 1), 0.32, WHITE);
      // centreline 120 ft stripes, 80 ft gaps
      const cw = W >= 150 ? 3 : 1.5;
      for (let s = 400; s < L - 400; s += 200)
        f.rect(paint, s, s + 120, -cw / 2, cw / 2, 0.32, WHITE);
      // both ends
      for (const [rw, end] of [
        [r, 0],
        [o, L],
      ] as const) {
        const dir = end === 0 ? 1 : -1;
        const prec = ilsRunways.has(`${a.icao}-${rw.id}`);
        const A = (d: number) => end + dir * d; // distance from that threshold
        const Lt = (l: number) => dir * l; // lateral, mirrored for the opposite end
        // threshold bars: 150 ft long, 5.75 ft wide
        const nb = W >= 150 ? 6 : W >= 100 ? 4 : 3;
        for (let k = 0; k < nb; k++)
          for (const sgn of [-1, 1]) {
            const l0 = sgn * (5.75 + k * 11.5);
            f.rect(
              paint,
              Math.min(A(20), A(170)),
              Math.max(A(20), A(170)),
              Math.min(l0, l0 + sgn * 5.75),
              Math.max(l0, l0 + sgn * 5.75),
              0.33,
              WHITE,
            );
          }
        // designator: 60 ft tall numerals, readable on approach (bottom toward the threshold)
        const id = rw.id.replace(/^0/, "");
        const gw = 20,
          gap = 8;
        const total = id.length * gw + (id.length - 1) * gap;
        for (let k = 0; k < id.length; k++) {
          const gi = GLYPHS.indexOf(id[k]);
          const u0 = gi / GLYPHS.length,
            u1 = (gi + 1) / GLYPHS.length;
          const lx0 = -total / 2 + k * (gw + gap);
          const lx1 = lx0 + gw;
          const s0 = A(210),
            s1 = A(270);
          f.quad(
            glyph,
            [
              [s0, Lt(lx0)],
              [s0, Lt(lx1)],
              [s1, Lt(lx1)],
              [s1, Lt(lx0)],
            ],
            0.34,
            [1, 1, 1],
            [
              [u0, 0],
              [u1, 0],
              [u1, 1],
              [u0, 1],
            ],
          );
        }
        // aiming point (1020 ft) and touchdown zone bars
        const inner = W >= 150 ? 36 : W * 0.24;
        for (const sgn of [-1, 1]) {
          const l0 = sgn * inner;
          f.rect(
            paint,
            Math.min(A(1020), A(1170)),
            Math.max(A(1020), A(1170)),
            Math.min(l0, l0 + sgn * 30),
            Math.max(l0, l0 + sgn * 30),
            0.33,
            WHITE,
          );
          if (prec)
            for (const [d, n] of [
              [500, 3],
              [1500, 2],
              [2000, 2],
              [2500, 1],
              [3000, 1],
            ] as const)
              for (let k = 0; k < n; k++) {
                const b0 = sgn * (inner + k * 11);
                f.rect(
                  paint,
                  Math.min(A(d), A(d + 75)),
                  Math.max(A(d), A(d + 75)),
                  Math.min(b0, b0 + sgn * 6),
                  Math.max(b0, b0 + sgn * 6),
                  0.33,
                  WHITE,
                );
              }
        }
        // tyre marks in the touchdown zone
        for (let k = 0; k < (quality === "high" ? 70 : 30); k++) {
          const d = 700 + Math.pow(rnd(), 1.4) * 2200;
          const l = (rnd() - 0.5) * 34 + (rnd() < 0.5 ? -9 : 9);
          const len = 40 + rnd() * 160;
          f.rect(
            tyre,
            Math.min(A(d), A(d + len)),
            Math.max(A(d), A(d + len)),
            l - 0.9,
            l + 0.9,
            0.3,
            BLACK,
          );
        }
      }
      // ---- parallel taxiway, connectors, hold-short lines
      const twOff = side * (W >= 150 ? 400 : 300);
      const twW = W >= 150 ? 50 : 35;
      f.rect(
        asph,
        -150,
        L + 150,
        twOff - twW / 2,
        twOff + twW / 2,
        0.24,
        [0.55, 0.55, 0.55],
        60,
      );
      f.rect(paint, -150, L + 150, twOff - 0.75, twOff + 0.75, 0.3, YELLOW);
      for (let s = -150; s <= L + 150; s += 100)
        for (const e of [-1, 1])
          light(f, s, twOff + e * (twW / 2 + 5), [0.25, 0.4, 1], 1.4);
      const hold = side * (W >= 150 ? 250 : 200);
      for (const s of [60, L * 0.36, L * 0.64, L - 60]) {
        const near = side * (W / 2 + 25);
        f.rect(
          asph,
          s - twW / 2,
          s + twW / 2,
          Math.min(near, twOff),
          Math.max(near, twOff),
          0.23,
          [0.55, 0.55, 0.55],
          60,
        );
        // yellow lead-on line to the runway centreline
        f.rect(
          paint,
          s - 0.75,
          s + 0.75,
          Math.min(twOff, 0),
          Math.max(twOff, 0),
          0.31,
          YELLOW,
        );
        // hold-short: two solid (taxiway side) + two dashed (runway side)
        for (let k = 0; k < 4; k++) {
          const l0 = hold + side * (k * 2 - 3);
          if (k < 2) {
            for (let d = -twW / 2; d < twW / 2; d += 6)
              f.rect(
                paint,
                s + d,
                s + d + 3,
                Math.min(l0, l0 + side),
                Math.max(l0, l0 + side),
                0.31,
                YELLOW,
              );
          } else
            f.rect(
              paint,
              s - twW / 2,
              s + twW / 2,
              Math.min(l0, l0 + side),
              Math.max(l0, l0 + side),
              0.31,
              YELLOW,
            );
        }
        // hold-position signs (red with white text panel) both sides
        for (const e of [-1, 1])
          pushBox(
            f,
            s + e * (twW / 2 + 14),
            hold + side * 8,
            8,
            1.2,
            3,
            0xc0262b,
            0,
            1.2 * FT,
          );
        for (const e of [-1, 1])
          light(
            f,
            s + e * (twW / 2 + 5),
            (twOff + near) / 2,
            [0.25, 0.4, 1],
            1.3,
          );
      }
      // ILS localizer array beyond the far end, glide slope mast beside the TDZ
      if (ilsRunways.has(`${a.icao}-${r.id}`)) {
        for (let k = -7; k <= 7; k++)
          pushBox(f, L + 1000, k * 9, 1, 1, 9, 0xd9d9d9);
        pushBox(f, 1100, -side * (W / 2 + 400), 3, 3, 45, 0xd84a2a);
        pushBox(f, 1100, -side * (W / 2 + 400) - 15, 10, 8, 9, 0xe9e9e9);
      }
      if (ilsRunways.has(`${a.icao}-${o.id}`))
        for (let k = -7; k <= 7; k++)
          pushBox(f, -1000, k * 9, 1, 1, 9, 0xd9d9d9);
      // windsock near the primary threshold
      pushBox(f, 900, -side * (W / 2 + 260), 0.5, 0.5, 20, 0xdddddd);
      const sock = new THREE.ConeGeometry(1.5 * FT * 1.6, 12 * FT, 10, 1, true)
        .rotateZ(Math.PI / 2)
        .translate(-6 * FT, 19 * FT, 0);
      place(f, sock, 900, -side * (W / 2 + 260), 0);
      boxes.push({ geo: sock.toNonIndexed(), color: 0xff6a12 });

      if (!primary) continue;
      // ---- apron, stands and parked aircraft
      // east of the field centre, clear of a crossing runway
      const ap0 = L * 0.56,
        ap1 = Math.min(L * 0.56 + 1500, L - 1100);
      const apIn = twOff + side * (twW / 2),
        apOut = twOff + side * 560;
      f.rect(
        conc,
        ap0,
        ap1,
        Math.min(apIn, apOut),
        Math.max(apIn, apOut),
        0.25,
        [0.78, 0.78, 0.76],
        50,
      );
      // taxilane + stand lead-in lines
      const lane = twOff + side * 180;
      f.rect(paint, ap0 + 40, ap1 - 40, lane - 0.75, lane + 0.75, 0.31, YELLOW);
      const nStands = 14;
      for (let k = 0; k < nStands; k++) {
        const s = ap0 + 90 + k * ((ap1 - ap0 - 180) / (nStands - 1));
        const sEnd = twOff + side * 470;
        f.rect(
          paint,
          s - 0.5,
          s + 0.5,
          Math.min(lane, sEnd),
          Math.max(lane, sEnd),
          0.31,
          YELLOW,
        );
        f.rect(paint, s - 6, s + 6, sEnd - 0.5, sEnd + 0.5, 0.31, YELLOW);
        if (rnd() < 0.72) {
          const twin = rnd() < 0.2;
          const g = new THREE.Matrix4();
          const p = f.p(s, twOff + side * (twin ? 420 : 435));
          const yawDeg = r.heading + (side > 0 ? -90 : 90); // nose toward the taxilane
          g.compose(
            p,
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              (-yawDeg * Math.PI) / 180 + Math.PI,
            ),
            new THREE.Vector3(1, 1, 1),
          );
          const hue = [0x1e4fa8, 0xb3261e, 0x1f7a3c, 0x222222, 0xc88b1a][
            Math.floor(rnd() * 5)
          ];
          parked.push({
            m: g,
            twin,
            color: new THREE.Color(rnd() < 0.6 ? 0xf2f2f0 : hue),
          });
        }
        light(f, s, twOff + side * 560, [0.25, 0.4, 1], 1.2);
      }
      // terminal with glazing, hangars, tower, fuel farm, car park
      const tLat = twOff + side * 640;
      pushBox(f, (ap0 + ap1) / 2 - 150, tLat, 120, 700, 30, 0xc9cdd1, 0);
      pushBox(
        f,
        (ap0 + ap1) / 2 - 150,
        tLat - side * 61,
        1,
        680,
        12,
        0x24384f,
        0,
        9 * FT,
        0x0d1a26,
      );
      pushBox(
        f,
        (ap0 + ap1) / 2 - 150,
        tLat,
        126,
        706,
        2,
        0x8e949a,
        0,
        30 * FT,
      );
      for (let k = 0; k < 4; k++) {
        const g = hangarGeo(110 * FT, 100 * FT, 26 * FT);
        place(f, g, ap0 - 160 - k * 140, twOff + side * 330, 0);
        boxes.push({
          geo: g.toNonIndexed(),
          color: k % 2 ? 0x9aa5ae : 0xb4bcc2,
        });
        f.rect(
          conc,
          ap0 - 220 - k * 140,
          ap0 - 100 - k * 140,
          Math.min(apIn, twOff + side * 280),
          Math.max(apIn, twOff + side * 280),
          0.25,
          [0.78, 0.78, 0.76],
          50,
        );
      }
      const tw = { a: ap1 + 160, l: twOff + side * 520 };
      const shaft = new THREE.CylinderGeometry(
        7 * FT,
        9 * FT,
        90 * FT,
        12,
      ).translate(0, 45 * FT, 0);
      place(f, shaft, tw.a, tw.l);
      boxes.push({ geo: shaft.toNonIndexed(), color: 0xd5d8da });
      const cab = new THREE.CylinderGeometry(
        19 * FT,
        15 * FT,
        14 * FT,
        8,
      ).translate(0, 97 * FT, 0);
      place(f, cab, tw.a, tw.l);
      boxes.push({
        geo: cab.toNonIndexed(),
        color: 0x1d3347,
        emissive: 0x0d2233,
      });
      const roof = new THREE.CylinderGeometry(
        21 * FT,
        21 * FT,
        3 * FT,
        8,
      ).translate(0, 105 * FT, 0);
      place(f, roof, tw.a, tw.l);
      boxes.push({ geo: roof.toNonIndexed(), color: 0x6b7279 });
      lights.push({
        p: f.p(tw.a, tw.l, 110 * FT),
        color: [0.4, 1, 0.5],
        size: 5,
        seq: 2,
        papi: -1,
      });
      for (let k = 0; k < 3; k++) {
        const tank = new THREE.CylinderGeometry(
          14 * FT,
          14 * FT,
          18 * FT,
          16,
        ).translate(0, 9 * FT, 0);
        place(f, tank, ap1 + 80 + k * 36, twOff + side * 420);
        boxes.push({ geo: tank.toNonIndexed(), color: 0xeeeeee });
      }
      // car park + cars behind the terminal
      const cp0 = (ap0 + ap1) / 2 - 450,
        cp1 = (ap0 + ap1) / 2 + 150;
      f.rect(
        asph,
        cp0,
        cp1,
        Math.min(tLat + side * 80, tLat + side * 260),
        Math.max(tLat + side * 80, tLat + side * 260),
        0.24,
        [0.45, 0.45, 0.46],
        60,
      );
      for (let k = 0; k < (quality === "high" ? 90 : 40); k++) {
        const s = cp0 + 20 + rnd() * (cp1 - cp0 - 40);
        const l = tLat + side * (100 + Math.floor(rnd() * 6) * 28);
        pushBox(
          f,
          s,
          l,
          6,
          14,
          4.8,
          [0xb3261e, 0x1e4fa8, 0xeeeeee, 0x222222, 0x8a8f94, 0x2a6b3f][
            Math.floor(rnd() * 6)
          ],
          0,
        );
      }
    }
  }

  // ---- assemble meshes
  const grassMat = new THREE.MeshLambertMaterial({
    map: grassTex(),
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const asphTex = noiseTex(256, [92, 93, 95], 26, 11);
  const asphMat = new THREE.MeshLambertMaterial({
    map: asphTex,
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const concMat = new THREE.MeshLambertMaterial({
    map: noiseTex(256, [176, 176, 172], 18, 5, true),
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const tyreMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -12,
  });
  const paintMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -16,
  });
  const glyphMat = new THREE.MeshLambertMaterial({
    map: glyphAtlas(),
    color: 0xedede6,
    transparent: true,
    alphaTest: 0.35,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -16,
  });
  group.add(
    grass.mesh(grassMat, 1),
    asph.mesh(asphMat, 2),
    conc.mesh(concMat, 2),
    tyre.mesh(tyreMat, 3),
    paint.mesh(paintMat, 4),
    glyph.mesh(glyphMat, 4),
  );
  // static boxes merged per colour
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  for (const b of boxes) {
    const k = `${b.color}|${b.emissive ?? 0}`;
    if (!byColor.has(k)) byColor.set(k, []);
    byColor.get(k)!.push(b.geo);
  }
  for (const [k, geos] of byColor) {
    const [c, e] = k.split("|").map(Number);
    const mat = e
      ? new THREE.MeshPhongMaterial({
          color: c,
          emissive: e,
          shininess: 80,
          specular: 0x667788,
        })
      : new THREE.MeshLambertMaterial({ color: c });
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.renderOrder = 5;
    group.add(m);
  }
  // parked aircraft (instanced)
  for (const twin of [false, true]) {
    const list = parked.filter((p) => p.twin === twin);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(
      twin ? twinAircraft() : gaAircraft(),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      list.length,
    );
    list.forEach((p, i) => {
      im.setMatrixAt(i, p.m);
      im.setColorAt(i, p.color);
    });
    im.renderOrder = 5;
    group.add(im);
  }
  return { group, lights };
}
