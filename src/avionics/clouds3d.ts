// Volumetric-looking cloud layers: thousands of camera-facing puffs (soft fbm sprites) lit by the sun —
// bright tops, grey shaded bases — sorted back-to-front and wrapped around the aircraft so the layer is endless.
// An overcast layer gets a lumpy ceiling seen from below and a carpet of tops seen from above;
// clear weather gets a few fair-weather cumulus for depth.
import * as THREE from "three";

const TILE = 36000; // m — the puff field repeats every TILE metres around the camera

function puffAtlas(): THREE.CanvasTexture {
  // 2×2 atlas of different puff shapes
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S * 2;
  const g = c.getContext("2d")!;
  let seed = 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * S,
      oy = Math.floor(k / 2) * S;
    // many overlapping soft blobs make a cauliflower-ish puff
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.7) * S * 0.2;
      const x = ox + S / 2 + Math.cos(a) * r;
      const y = oy + S / 2 + Math.sin(a) * r * 0.75 - (k === 3 ? 10 : 0);
      const rad = S * (0.1 + rnd() * 0.17);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(255,255,255,0.55)");
      gr.addColorStop(0.6, "rgba(255,255,255,0.22)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(ox, oy, S, S);
    }
  }
  // fine noise in the alpha for texture
  const img = g.getImageData(0, 0, S * 2, S * 2);
  for (let i = 0; i < img.data.length; i += 4)
    img.data[i + 3] = Math.max(
      0,
      Math.min(255, img.data[i + 3] * (0.82 + rnd() * 0.3)),
    );
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const vert = `
attribute vec4 iPos;   // xyz world (already wrapped), w = vertical fraction in the layer (0 base .. 1 top)
attribute vec2 iSize;  // x size (m), y atlas cell 0..3
uniform vec3 uCam; uniform float uFlat; uniform float uSquash;
varying vec2 vUv; varying float vH; varying float vDist; varying float vEdge;
void main() {
  vec4 mv;
  if (uFlat > 0.5) {
    // horizontal sprite (a stratus ceiling seen from below)
    mv = viewMatrix * vec4(iPos.xyz + vec3(position.x, 0.0, position.y) * iSize.x, 1.0);
  } else {
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    mv.xy += position.xy * iSize.x * vec2(1.0, uSquash);
  }
  vDist = length(iPos.xyz - uCam);
  float cell = iSize.y;
  vUv = (uv + vec2(mod(cell, 2.0), floor(cell / 2.0))) * 0.5;
  vH = iPos.w;
  vEdge = position.y + 0.5; // 0 bottom of the sprite .. 1 top
  gl_Position = projectionMatrix * mv;
}`;
const frag = `
uniform sampler2D uMap; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uFog; uniform float uFogFar; uniform float uFadeNear; uniform float uOpacity;
varying vec2 vUv; varying float vH; varying float vDist; varying float vEdge;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float light = clamp(0.25 + vH * 0.55 + vEdge * 0.35, 0.0, 1.0);
  vec3 c = mix(uShade, uLit, light);
  float fog = smoothstep(uFogFar * 0.15, uFogFar, vDist);
  c = mix(c, uFog, fog * 0.85);
  float a = t.a * uOpacity * smoothstep(uFadeNear * 0.4, uFadeNear, vDist) * (1.0 - smoothstep(uFogFar * 0.8, uFogFar, vDist));
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

interface Field {
  mesh: THREE.Mesh;
  base: Float32Array; // unwrapped x, z, vertical fraction, size, cell (5 per puff)
  pos: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
  n: number;
}

export class CloudLayers {
  group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private ovcBase: Field;
  private ovcTop: Field;
  private cu: Field;
  private order: number[] = [];
  private lastSort = new THREE.Vector3(1e9, 0, 0);
  private frame = 0;
  private lastMode = -1;

  constructor(quality: "low" | "high") {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffAtlas() },
        uCam: { value: new THREE.Vector3() },
        uLit: { value: new THREE.Color(0xffffff) },
        uShade: { value: new THREE.Color(0x8a929c) },
        uFog: { value: new THREE.Color(0xb6c6d6) },
        uFogFar: { value: 30000 },
        uFadeNear: { value: 250 },
        uOpacity: { value: 1 },
        uFlat: { value: 0 },
        uSquash: { value: 1 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const nOvc = quality === "high" ? 7000 : 2800;
    const nCu = quality === "high" ? 2400 : 1000;
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // overcast underside: small lumps hanging just below the base (seen from below)
    const nB = Math.round(nOvc * 0.4);
    this.ovcBase = this.field(nB, (b) => {
      for (let i = 0; i < nB; i++) b.set([rnd() * TILE, rnd() * TILE, 0, 260 + rnd() * 420, Math.floor(rnd() * 4)], i * 5);
    });
    // overcast tops: wide puffs barely breaking through the top surface (seen from above)
    const nT = nOvc - nB;
    this.ovcTop = this.field(nT, (b) => {
      for (let i = 0; i < nT; i++) b.set([rnd() * TILE, rnd() * TILE, 0.2 + rnd() * 0.45, 500 + rnd() * 700, Math.floor(rnd() * 4)], i * 5);
    });
    // fair-weather cumulus: clusters with flat-ish bases
    this.cu = this.field(nCu, (b) => {
      let i = 0;
      while (i < nCu) {
        const cx = rnd() * TILE,
          cz = rnd() * TILE;
        const w = 500 + rnd() * 1300;
        const k = 10 + Math.floor(rnd() * 22);
        for (let j = 0; j < k && i < nCu; j++, i++) {
          const a = rnd() * Math.PI * 2,
            d = Math.pow(rnd(), 0.6) * w;
          const hh = Math.pow(rnd(), 1.6) * (1 - d / (w * 1.3));
          b.set(
            [
              cx + Math.cos(a) * d,
              cz + Math.sin(a) * d,
              Math.max(0, hh),
              300 + rnd() * 500 * (1 - hh * 0.5),
              Math.floor(rnd() * 4),
            ],
            i * 5,
          );
        }
      }
    });
    (this.ovcBase.mesh.material as THREE.ShaderMaterial).uniforms.uFlat.value = 1;
    (this.ovcTop.mesh.material as THREE.ShaderMaterial).uniforms.uSquash.value = 0.55;
    this.group.add(this.ovcBase.mesh, this.ovcTop.mesh, this.cu.mesh);
  }

  private field(n: number, fill: (b: Float32Array) => void): Field {
    const geo = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    geo.index = q.index;
    geo.setAttribute("position", q.getAttribute("position"));
    geo.setAttribute("uv", q.getAttribute("uv"));
    const pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const size = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    pos.setUsage(THREE.DynamicDrawUsage);
    size.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iPos", pos);
    geo.setAttribute("iSize", size);
    geo.instanceCount = n;
    const base = new Float32Array(n * 5);
    fill(base);
    const mesh = new THREE.Mesh(geo, this.mat.clone());
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    return { mesh, base, pos, size, n };
  }

  /** Lay out a field between baseM and topM around the camera, sorted far → near. */
  private layout(f: Field, cam: THREE.Vector3, yOf: (h: number, size: number) => number) {
    const b = f.base;
    const half = TILE / 2;
    const order = this.order;
    order.length = f.n;
    const dist = new Float32Array(f.n);
    const P = f.pos.array as Float32Array;
    const S = f.size.array as Float32Array;
    const wx = new Float32Array(f.n),
      wz = new Float32Array(f.n),
      wy = new Float32Array(f.n);
    for (let i = 0; i < f.n; i++) {
      const x =
        cam.x + ((((b[i * 5] - cam.x + half) % TILE) + TILE) % TILE) - half;
      const z =
        cam.z + ((((b[i * 5 + 1] - cam.z + half) % TILE) + TILE) % TILE) - half;
      const y = yOf(b[i * 5 + 2], b[i * 5 + 3]);
      wx[i] = x;
      wy[i] = y;
      wz[i] = z;
      dist[i] = (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2;
      order[i] = i;
    }
    order.sort((a, c) => dist[c] - dist[a]);
    for (let k = 0; k < f.n; k++) {
      const i = order[k];
      P[k * 4] = wx[i];
      P[k * 4 + 1] = wy[i];
      P[k * 4 + 2] = wz[i];
      P[k * 4 + 3] = b[i * 5 + 2];
      S[k * 2] = b[i * 5 + 3];
      S[k * 2 + 1] = b[i * 5 + 4];
    }
    f.pos.needsUpdate = true;
    f.size.needsUpdate = true;
  }

  /**
   * baseFt/topFt MSL of the overcast (null if none); cumulus shown when clear.
   * lit/shade/fog colours follow the time of day.
   */
  update(
    cam: THREE.Vector3,
    ovc: { baseFt: number; topFt: number } | null,
    fog: THREE.Color,
    fogFar: number,
    lit: THREE.Color,
    shade: THREE.Color,
    inside: boolean,
  ) {
    const FT = 0.3048;
    for (const f of [this.ovcBase, this.ovcTop, this.cu]) {
      const u = (f.mesh.material as THREE.ShaderMaterial).uniforms;
      u.uCam.value.copy(cam);
      u.uFog.value.copy(fog);
      u.uFogFar.value = Math.max(4000, fogFar);
      u.uLit.value.copy(f === this.ovcBase ? shade.clone().multiplyScalar(1.22) : lit);
      u.uShade.value.copy(shade);
      u.uFadeNear.value = inside ? 1e9 : f === this.ovcBase ? 60 : 380;
    }
    const below = !!ovc && cam.y < ovc.baseFt * FT;
    const above = !!ovc && cam.y > ovc.topFt * FT;
    this.ovcBase.mesh.visible = below;
    this.ovcTop.mesh.visible = above;
    this.cu.mesh.visible = !ovc;
    this.frame++;
    const moved = cam.distanceToSquared(this.lastSort) > 120 * 120;
    if (!moved && this.frame % 20 !== 0 && this.lastMode === (below ? 1 : above ? 2 : 0)) return;
    this.lastMode = below ? 1 : above ? 2 : 0;
    this.lastSort.copy(cam);
    if (ovc && below) this.layout(this.ovcBase, cam, (_h, sz) => ovc.baseFt * FT + 8 + sz * 0.02);
    else if (ovc && above) this.layout(this.ovcTop, cam, (h, sz) => ovc.topFt * FT - sz * 0.12 + h * sz * 0.1);
    else if (!ovc) {
      const b0 = 5200 * FT, b1 = 7600 * FT;
      this.layout(this.cu, cam, (h) => b0 + h * (b1 - b0));
    }
  }
}
