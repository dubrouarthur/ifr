// WebGL outside view (three.js): islands terrain, sea, runways with markings, full approach lighting,
// PAPI, buildings, sky/sun, cloud layer and visibility fog, day/dusk/night.
import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { AIRPORTS, NAVAIDS, groundElevation, landMask } from '../nav/data';
import { toLocal, destination, bearingDeg, distanceNm, FT_PER_NM, DEG, type LatLon } from '../nav/geo';
import type { Runway } from '../nav/types';
import { buildAirports } from './airport3d';
import { cloudLayer } from './otw';

const NM = 1852;
const FT = 0.3048;
const ORIGIN: LatLon = { lat: AIRPORTS[0].lat, lon: AIRPORTS[0].lon };

export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Quality = 'low' | 'high';

function w(p: LatLon, altFt = 0): THREE.Vector3 {
  const l = toLocal(ORIGIN, p);
  return new THREE.Vector3(l.x * NM, altFt * FT, -l.y * NM);
}
function fromLocal(xNm: number, yNm: number): LatLon {
  return { lat: ORIGIN.lat + yNm / 60, lon: ORIGIN.lon + xNm / (60 * Math.cos(ORIGIN.lat * DEG)) };
}

// ------------------------------------------------------------------ procedural textures
function noiseCanvas(size: number, base: [number, number, number], amp: number, scale: number, seed = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const rnd = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const wrap = (n: number) => ((n % (size / scale)) + size / scale) % (size / scale);
    const a = rnd(wrap(xi), wrap(yi)), b = rnd(wrap(xi + 1), wrap(yi)), cc = rnd(wrap(xi), wrap(yi + 1)), d = rnd(wrap(xi + 1), wrap(yi + 1));
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let n = 0;
      let f = 1 / scale;
      let a = 0.5;
      for (let o = 0; o < 4; o++) {
        n += vnoise(x * f, y * f) * a;
        f *= 2;
        a *= 0.5;
      }
      const k = (x + y * size) * 4;
      const m = (n - 0.47) * amp;
      img.data[k] = Math.max(0, Math.min(255, base[0] + m * 255));
      img.data[k + 1] = Math.max(0, Math.min(255, base[1] + m * 255));
      img.data[k + 2] = Math.max(0, Math.min(255, base[2] + m * 255));
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

function fieldsTexture(): THREE.Texture {
  const c = noiseCanvas(512, [200, 200, 200], 0.55, 16, 3);
  const g = c.getContext('2d')!;
  // field patchwork
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${150 + (i * 37) % 80},${150 + (i * 53) % 70},${120 + (i * 29) % 60},0.18)`;
    const x = (i * 137) % 512, y = (i * 271) % 512;
    g.fillRect(x, y, 30 + (i * 17) % 90, 20 + (i * 23) % 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cloudTexture(): THREE.Texture {
  const c = noiseCanvas(512, [210, 214, 220], 0.9, 64, 7);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ light points shader
interface LightSpec {
  p: THREE.Vector3;
  color: [number, number, number];
  size: number;
  /** -1 steady; 0..1 position in a sequenced-flasher train; 2 = strobe pair */
  seq: number;
  /** PAPI box index (0..3 left→right) or -1 */
  papi: number;
}

const lightVert = `
attribute vec3 color; attribute float size; attribute float seq; attribute float papi;
uniform float uTime; uniform float uVis; uniform float uDay; uniform float uScale; uniform float uPapiAngle;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  float a = 1.0;
  vec3 c = color;
  if (seq >= 0.0 && seq <= 1.0) { float ph = fract(uTime * 2.0); a = smoothstep(0.06, 0.0, abs(ph - seq)) * 1.6; }
  if (seq > 1.5) { a = step(0.92, fract(uTime * 1.0)) * 2.0; }
  if (papi >= 0.0) {
    // each box switches red/white at 2.5/2.83/3.17/3.5 deg (box 0 = farthest from runway)
    float th = 2.5 + papi * 0.333;
    c = uPapiAngle > th ? vec3(1.0, 0.97, 0.92) : vec3(1.0, 0.1, 0.06);
  }
  float fog = exp(-dist / (uVis * 1.7));
  vAlpha = a * clamp(fog * 1.4, 0.0, 1.0) * mix(1.0, 0.55, uDay);
  vColor = c;
  gl_PointSize = clamp(size * uScale * (2600.0 / max(dist, 60.0)), 2.2, 22.0) * mix(1.25, 0.7, uDay);
  gl_Position = projectionMatrix * mv;
}`;
const lightFrag = `
uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor, t.a * vAlpha); if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ the view
export class Outside3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 16 / 9, 3, 220000);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a5a3a, 1.2);
  private skyMat!: THREE.ShaderMaterial;
  private cloudBase!: THREE.Mesh;
  private cloudTop!: THREE.Mesh;
  private lightsMat!: THREE.ShaderMaterial;
  private fog = new THREE.Fog(0xaab4bf, 1000, 30000);
  private stars!: THREE.Points;
  private papiSites: { pos: LatLon; elev: number; heading: number }[] = [];
  private time: TimeOfDay = 'day';
  quality: Quality = 'high';
  lookYaw = 0;
  lookPitch = 0;
  ok = true;

  constructor(canvas: HTMLCanvasElement, quality: Quality, time: TimeOfDay) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(quality === 'high' ? 1.6 : 1, window.devicePixelRatio || 1));
    // no tone mapping: fog, sky dome and clear colour must produce the exact same grey in cloud
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.fog = this.fog;
    this.camera.rotation.order = 'YXZ';
    this.sun.position.set(-30000, 40000, -20000);
    this.scene.add(this.sun, this.hemi);
    this.buildSky();
    this.buildTerrain();
    this.buildSea();
    this.buildAirports();
    this.buildScenery();
    this.buildClouds();
    this.setTime(time);
  }

  // ---------------------------------------------------------------- sky
  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x2a62b8) }, uHorizon: { value: new THREE.Color(0xbcd4ee) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0xfff2d0) }, uOvercast: { value: 0 }, uGrey: { value: new THREE.Color(0x8d949b) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uOvercast; uniform vec3 uGrey; varying vec3 vDir;
        void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0); c += uSunCol * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
          if (vDir.y < 0.0) c = mix(uHorizon, uHorizon * 0.8, min(-vDir.y * 4.0, 1.0));
          c = mix(c, uGrey, uOvercast); gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200000, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
    const sg = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.95);
      sp.push(Math.sin(ph) * Math.cos(th) * 150000, Math.cos(ph) * 150000, Math.sin(ph) * Math.sin(th) * 150000);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  // ---------------------------------------------------------------- terrain
  private buildTerrain() {
    const step = this.quality === 'high' ? 0.22 : 0.45;
    const x0 = -34, x1 = 52, y0 = -34, y1 = 52;
    const nx = Math.ceil((x1 - x0) / step) + 1;
    const ny = Math.ceil((y1 - y0) / step) + 1;
    const pos = new Float32Array(nx * ny * 3);
    const col = new Float32Array(nx * ny * 3);
    const uv = new Float32Array(nx * ny * 2);
    const tmp = new THREE.Color();
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const xn = x0 + i * step;
        const yn = y0 + j * step;
        const ll = fromLocal(xn, yn);
        const e = groundElevation(ll);
        const m = landMask(ll);
        const k = j * nx + i;
        pos[k * 3] = xn * NM;
        pos[k * 3 + 1] = (m < 0.02 ? -60 : e) * FT;
        pos[k * 3 + 2] = -yn * NM;
        // colours: beach → grass → forest → rock
        const n = Math.sin(xn * 3.7 + yn * 2.1) * 0.5 + Math.sin(xn * 11.3 - yn * 7.9) * 0.3;
        if (m < 0.35) tmp.setRGB(0.76, 0.7, 0.52);
        else if (e > 2300) tmp.setRGB(0.42 + n * 0.04, 0.4, 0.36);
        else if (e > 1500) tmp.setRGB(0.2, 0.3 + n * 0.03, 0.17);
        else if (n > 0.35) tmp.setRGB(0.17, 0.27, 0.13);
        else tmp.setRGB(0.32 + n * 0.05, 0.44 + n * 0.05, 0.22);
        col[k * 3] = tmp.r;
        col[k * 3 + 1] = tmp.g;
        col[k * 3 + 2] = tmp.b;
        uv[k * 2] = xn / 1.2;
        uv[k * 2 + 1] = yn / 1.2;
      }
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, b, c, b, d, c); // counter-clockwise seen from above (x east, z south)
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: fieldsTexture() });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
  }

  private buildSea() {
    const geo = new THREE.PlaneGeometry(600000, 600000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const tex = new THREE.CanvasTexture(noiseCanvas(256, [128, 128, 255], 0.6, 8, 5));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2500, 2500);
    const mat = new THREE.MeshPhongMaterial({ color: 0x1c4a66, specular: 0x8aa6bb, shininess: 70, normalMap: tex, normalScale: new THREE.Vector2(0.35, 0.35) });
    const sea = new THREE.Mesh(geo, mat);
    sea.position.y = 0.5;
    this.scene.add(sea);
  }

  // ---------------------------------------------------------------- airports, runways, lights
  private buildAirports() {
    const lights: LightSpec[] = [];
    const ilsRunways = new Set(NAVAIDS.filter((n) => n.type === 'ILS').map((n) => `${n.airport}-${n.runway}`));
    const apt = buildAirports(AIRPORTS, ilsRunways, w, this.quality);
    this.scene.add(apt.group);
    lights.push(...apt.lights);
    for (const a of AIRPORTS)
      for (let i = 0; i < a.runways.length; i += 2)
        for (const rw of [a.runways[i], a.runways[i + 1]]) this.runwayLights(rw, ilsRunways.has(`${a.icao}-${rw.id}`), lights);
    // navaid shelters
    for (const n of NAVAIDS) {
      if (n.type !== 'VORDME') continue;
      const e = groundElevation(n);
      const vor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4, 16), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      vor.position.copy(w(n));
      vor.position.y = e * FT + 2;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      cone.position.copy(vor.position);
      cone.position.y += 5;
      this.scene.add(vor, cone);
      lights.push({ p: new THREE.Vector3(vor.position.x, vor.position.y + 10, vor.position.z), color: [1, 0.2, 0.15], size: 2.5, seq: -1, papi: -1 });
    }
    // light points
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lights.flatMap((l) => [l.p.x, l.p.y, l.p.z]), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(lights.flatMap((l) => l.color), 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(lights.map((l) => l.size), 1));
    geo.setAttribute('seq', new THREE.Float32BufferAttribute(lights.map((l) => l.seq), 1));
    geo.setAttribute('papi', new THREE.Float32BufferAttribute(lights.map((l) => l.papi), 1));
    this.lightsMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uVis: { value: 5000 }, uDay: { value: 1 }, uScale: { value: 1 }, uMap: { value: glowSprite() }, uPapiAngle: { value: 3 } },
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.lightsMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  private runwayLights(r: Runway, precision: boolean, out: LightSpec[]) {
    const e = r.elevFt;
    const halfW = r.widthFt / 2 / FT_PER_NM + 10 / FT_PER_NM;
    const lenNm = r.lengthFt / FT_PER_NM;
    const L = (p: LatLon, color: [number, number, number], size: number, seq = -1, papi = -1, h = 1.5) => out.push({ p: w(p, groundElevation(p) + h / FT), color, size, seq, papi });
    const white: [number, number, number] = [1, 0.96, 0.86];
    // edge lights every 200 ft (last 2000 ft amber for instrument runways)
    for (let ft = 0; ft <= r.lengthFt; ft += 200) {
      const base = destination(r.threshold, r.heading, ft / FT_PER_NM);
      const amber = precision && ft > r.lengthFt - 2000;
      for (const s of [-1, 1]) L(destination(base, r.heading + 90 * s, halfW), amber ? [1, 0.7, 0.2] : white, 2.2);
    }
    // threshold green / end red (seen from this direction we only add the threshold; the opposite end adds its own)
    for (let k = -6; k <= 6; k++) L(destination(r.threshold, r.heading + 90, (k * halfW) / 6), [0.2, 1, 0.35], 2.6);
    for (let k = -6; k <= 6; k += 2) L(destination(destination(r.threshold, r.heading, lenNm), r.heading + 90, (k * halfW) / 6), [1, 0.12, 0.08], 2.2, -1, -1, 1.6);
    // centreline lights on precision runways
    if (precision) for (let ft = 75; ft < r.lengthFt; ft += 100) L(destination(r.threshold, r.heading, ft / FT_PER_NM), ft > r.lengthFt - 1000 ? [1, 0.15, 0.1] : white, 1.3, -1, -1, 0.3);
    // touchdown zone lights
    if (precision) for (let ft = 100; ft <= 3000; ft += 100) for (const s of [-1, 1]) for (const o of [0.25, 0.4]) L(destination(destination(r.threshold, r.heading, ft / FT_PER_NM), r.heading + 90 * s, (r.widthFt * o) / FT_PER_NM), white, 1.1, -1, -1, 0.3);
    // approach lighting: ALSF-II (2400 ft) for precision, MALSR-like (1400 ft) otherwise
    const appLen = precision ? 2400 : 1400;
    const nFlash = Math.floor((appLen - 1000) / 100);
    for (let ft = 100; ft <= appLen; ft += 100) {
      const c = destination(r.threshold, r.heading + 180, ft / FT_PER_NM);
      const h = 1.2 + ft * 0.0004; // light bars on short stands (m), a touch higher further out
      for (let k = -2; k <= 2; k++) L(destination(c, r.heading + 90, (k * 3.5) / FT_PER_NM), white, 2.4, -1, -1, h);
      if (ft === 1000) for (let k = -10; k <= 10; k++) if (Math.abs(k) > 2) L(destination(c, r.heading + 90, (k * 5) / FT_PER_NM), white, 2.4, -1, -1, h);
      if (precision && ft <= 1000 && ft >= 100 && ft % 100 === 0) for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) L(destination(c, r.heading + 90 * s, (30 + k * 5) / FT_PER_NM), [1, 0.15, 0.08], 2, -1, -1, h);
      if (ft > 1000) L(destination(c, r.heading, 0), [1, 1, 1], 4.5, 1 - (ft - 1000) / 100 / nFlash, -1, h + 1.5);
    }
    // REIL strobes on non-precision runways
    if (!precision) for (const s of [-1, 1]) L(destination(r.threshold, r.heading + 90 * s, halfW + 40 / FT_PER_NM), [1, 1, 1], 4, 2);
    // PAPI on the left, 1000 ft in
    const papiBase = destination(destination(r.threshold, r.heading, 1000 / FT_PER_NM), r.heading - 90, halfW + 50 / FT_PER_NM);
    for (let k = 0; k < 4; k++) L(destination(papiBase, r.heading - 90, (k * 30) / FT_PER_NM), [1, 1, 1], 3.6, -1, 3 - k, 1);
    this.papiSites.push({ pos: destination(r.threshold, r.heading, 1000 / FT_PER_NM), elev: e, heading: r.heading });
  }

  // ---------------------------------------------------------------- scenery: houses and trees
  private buildScenery() {
    const nHouses = this.quality === 'high' ? 2600 : 900;
    const nTrees = this.quality === 'high' ? 9000 : 2500;
    const house = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 7, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), nHouses);
    const tree = new THREE.InstancedMesh(new THREE.ConeGeometry(5, 16, 6), new THREE.MeshLambertMaterial({ color: 0x1f3a1c }), nTrees);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const towns = [destination(AIRPORTS[0], 200, 2.5), destination(AIRPORTS[0], 20, 3), destination(AIRPORTS[1], 120, 2.5), destination(AIRPORTS[1], 260, 3)];
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tooClose = (p: LatLon) => AIRPORTS.some((a) => a.runways.some((r) => distanceNm(p, r.threshold) < 0.6 || distanceNm(p, r.end) < 0.6 || distanceNm(p, a) < 0.5));
    let hi = 0;
    for (let i = 0; i < nHouses * 3 && hi < nHouses; i++) {
      const t = towns[i % towns.length];
      const p = destination(t, rnd() * 360, Math.pow(rnd(), 1.6) * 2.2);
      if (landMask(p) < 0.6 || tooClose(p)) continue;
      const e = groundElevation(p);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      sc.set(0.7 + rnd() * 1.2, 0.8 + rnd() * 1.2, 0.7 + rnd());
      const v = w(p, e);
      v.y += 3.5 * sc.y;
      mtx.compose(v, q, sc);
      house.setMatrixAt(hi, mtx);
      const c = new THREE.Color().setHSL(0.08 + rnd() * 0.05, 0.15, 0.55 + rnd() * 0.3);
      house.setColorAt(hi, c);
      hi++;
    }
    house.count = hi;
    let ti = 0;
    for (let i = 0; i < nTrees * 4 && ti < nTrees; i++) {
      const xn = -30 + rnd() * 80;
      const yn = -30 + rnd() * 80;
      const p = fromLocal(xn, yn);
      if (landMask(p) < 0.7 || tooClose(p)) continue;
      // forests cluster where the colour noise says so
      if (Math.sin(xn * 3.7 + yn * 2.1) * 0.5 + Math.sin(xn * 11.3 - yn * 7.9) * 0.3 < 0.2) continue;
      for (let k = 0; k < 6 && ti < nTrees; k++) {
        const pp = destination(p, rnd() * 360, rnd() * 0.15);
        const e = groundElevation(pp);
        const s = 0.7 + rnd() * 0.9;
        sc.set(s, s * (0.8 + rnd() * 0.6), s);
        const v = w(pp, e);
        v.y += 8 * sc.y;
        mtx.compose(v, q.identity(), sc);
        tree.setMatrixAt(ti++, mtx);
      }
    }
    tree.count = ti;
    this.scene.add(house, tree);
  }

  // ---------------------------------------------------------------- clouds
  private buildClouds() {
    const tex = cloudTexture();
    tex.repeat.set(40, 40);
    const geo = new THREE.PlaneGeometry(260000, 260000, 1, 1).rotateX(-Math.PI / 2);
    this.cloudBase = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, color: 0x9aa1a8, side: THREE.DoubleSide, transparent: true, opacity: 0.98 }));
    this.cloudTop = new THREE.Mesh(geo.clone(), new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, emissive: 0x666a70, side: THREE.DoubleSide }));
    this.scene.add(this.cloudBase, this.cloudTop);
  }

  setTime(t: TimeOfDay) {
    this.time = t;
    const sky = this.skyMat.uniforms;
    if (t === 'day') {
      this.sun.position.set(-30000, 40000, -20000);
      this.sun.intensity = 1.6;
      this.sun.color.set(0xfff4e0);
      this.hemi.intensity = 1.0;
      sky.uTop.value.set(0x2a62b8);
      sky.uHorizon.value.set(0xbcd4ee);
      sky.uSunCol.value.set(0xfff2d0);
    } else if (t === 'dusk') {
      this.sun.position.set(-60000, 5000, 8000);
      this.sun.intensity = 1.3;
      this.sun.color.set(0xffa060);
      this.hemi.intensity = 0.55;
      sky.uTop.value.set(0x1b2a55);
      sky.uHorizon.value.set(0xf09a5a);
      sky.uSunCol.value.set(0xff8a3a);
    } else {
      this.sun.position.set(20000, 30000, 10000);
      this.sun.intensity = 0.12;
      this.sun.color.set(0x8899cc);
      this.hemi.intensity = 0.12;
      sky.uTop.value.set(0x02040a);
      sky.uHorizon.value.set(0x0c1424);
      sky.uSunCol.value.set(0x000000);
    }
    sky.uSunDir.value.copy(this.sun.position).normalize();
    this.stars.visible = t === 'night';
  }

  resize(wPx: number, hPx: number) {
    this.renderer.setSize(wPx, hPx, false);
    this.camera.aspect = wPx / Math.max(1, hPx);
    // keep a realistic ~78° horizontal field of view whatever the window shape
    const hfov = 78 * DEG;
    this.camera.fov = Math.min(70, Math.max(24, (2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect)) / DEG));
    this.camera.updateProjectionMatrix();
    this.lightsMat.uniforms.uScale.value = Math.min(1.6, window.devicePixelRatio || 1) * (hPx / 400);
  }

  render(sim: Sim, t: number) {
    const s = sim.ac.s;
    const d = sim.ac.data;
    const eye = w(s, s.altFt + sim.cockpitEyeFt);
    this.camera.position.copy(eye);
    this.camera.rotation.set((d.pitchDeg - 4) * DEG + this.lookPitch, -d.hdgTrue * DEG + this.lookYaw, -d.rollDeg * DEG);
    // weather
    const wx = sim.weather;
    const { base, top } = cloudLayer(sim);
    const overcast = wx.ceilingFt < 15000;
    const inside = overcast && s.altFt > base && s.altFt < top;
    const above = overcast && s.altFt >= top;
    const visM = Math.max(150, wx.visibilitySm * 1609);
    this.cloudBase.visible = overcast;
    this.cloudTop.visible = overcast;
    this.cloudBase.position.set(eye.x, base * FT, eye.z);
    this.cloudTop.position.set(eye.x, top * FT, eye.z);
    const night = this.time === 'night';
    const dusk = this.time === 'dusk';
    const grey = new THREE.Color(night ? 0x0a0c10 : dusk ? 0x6b5a5a : 0x9aa1a8);
    const haze = new THREE.Color(night ? 0x0c1220 : dusk ? 0xc08a6a : overcast ? 0x9ea6ad : 0xb6c6d6);
    if (inside) {
      this.fog.color.copy(grey).multiplyScalar(night ? 1 : 1.12);
      this.fog.near = 5;
      this.fog.far = 70;
    } else if (above) {
      this.fog.color.copy(haze);
      this.fog.near = 2000;
      this.fog.far = 120000;
    } else {
      // below the base: visibility, plus a darker overcast light
      this.fog.color.copy(overcast ? grey : haze);
      this.fog.near = Math.min(visM * 0.15, 800);
      this.fog.far = overcast || wx.visibilitySm < 8 ? visM * 1.25 : 90000;
      // wisps near the base
      const toBase = base - s.altFt;
      if (overcast && toBase < 250) {
        this.fog.far = Math.min(this.fog.far, 60 + toBase * 6);
        this.fog.near = 5;
      }
    }
    this.skyMat.uniforms.uOvercast.value = overcast && !above ? 1 : 0;
    this.skyMat.uniforms.uGrey.value.copy(inside ? this.fog.color : grey);
    this.renderer.setClearColor(this.fog.color);
    this.hemi.intensity = (night ? 0.14 : dusk ? 0.8 : 1.0) * (overcast && !above ? 0.85 : 1);
    this.sun.intensity = (night ? 0.12 : dusk ? 1.1 : 1.6) * (overcast && !above ? 0.25 : 1);
    // lights
    const u = this.lightsMat.uniforms;
    u.uTime.value = t;
    u.uVis.value = inside ? 40 : overcast || wx.visibilitySm < 8 ? visM : 30000;
    u.uDay.value = night ? 0 : dusk ? 0.4 : overcast ? 0.55 : 1;
    // PAPI: glide angle to the nearest site ahead
    let best: { ang: number; dist: number } | null = null;
    for (const p of this.papiSites) {
      const dist = distanceNm(s, p.pos);
      const ahead = Math.abs(((bearingDeg(s, p.pos) - p.heading + 540) % 360) - 180) < 45;
      if (!ahead || dist > 12) continue;
      const ang = Math.atan2((s.altFt + 5 - p.elev) / FT_PER_NM, dist) / DEG;
      if (!best || dist < best.dist) best = { ang, dist };
    }
    u.uPapiAngle.value = best ? best.ang : 3;
    this.renderer.render(this.scene, this.camera);
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

