// Terrain material for the outside view: procedural ground textures (farmland patchwork with hedges,
// forest canopy, rock, sand) blended per pixel from biome weights, sampled at two scales to hide tiling,
// with sun + sky lighting and scene fog.
import * as THREE from "three";

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvasTex(
  size: number,
  draw: (g: CanvasRenderingContext2D, rnd: () => number) => void,
  seed: number,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** speckle noise overlay */
function grain(
  g: CanvasRenderingContext2D,
  size: number,
  rnd: () => number,
  amt: number,
  n = size * size * 0.35,
) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${amt * rnd()})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

/** farmland patchwork: irregular fields with crop rows, hedgerows and tracks (tile ≈ 1.6 km) */
function fieldsTex(): THREE.CanvasTexture {
  const S = 1024;
  return canvasTex(
    S,
    (g, rnd) => {
      const palette = [
        "#6f8a3f",
        "#7f9447",
        "#8fa152",
        "#a39a58",
        "#b8a865",
        "#5f7b37",
        "#7a7a42",
        "#94864c",
        "#6a8640",
        "#c2b274",
        "#84964a",
      ];
      g.fillStyle = "#6d8540";
      g.fillRect(0, 0, S, S);
      // recursive subdivision into fields
      const fields: [number, number, number, number][] = [];
      const split = (x: number, y: number, w: number, h: number, d: number) => {
        if (d > 5 || (w < 150 && h < 150) || (d > 2 && rnd() < 0.18))
          return void fields.push([x, y, w, h]);
        if (w > h) {
          const k = w * (0.3 + rnd() * 0.4);
          split(x, y, k, h, d + 1);
          split(x + k, y, w - k, h, d + 1);
        } else {
          const k = h * (0.3 + rnd() * 0.4);
          split(x, y, w, k, d + 1);
          split(x, y + k, w, h - k, d + 1);
        }
      };
      split(0, 0, S, S, 0);
      for (const [x, y, w, h] of fields) {
        g.save();
        g.beginPath();
        // slightly skewed quads read as real parcels
        const j = () => (rnd() - 0.5) * 10;
        g.moveTo(x + j(), y + j());
        g.lineTo(x + w + j(), y + j());
        g.lineTo(x + w + j(), y + h + j());
        g.lineTo(x + j(), y + h + j());
        g.closePath();
        g.fillStyle = palette[Math.floor(rnd() * palette.length)];
        g.fill();
        g.clip();
        // crop rows
        if (rnd() < 0.7) {
          const ang = rnd() < 0.5 ? 0 : Math.PI / 2;
          g.translate(x + w / 2, y + h / 2);
          g.rotate(ang + (rnd() - 0.5) * 0.15);
          g.strokeStyle = `rgba(${rnd() < 0.5 ? "40,50,20" : "230,220,170"},0.12)`;
          g.lineWidth = 1.2;
          for (let k = -S; k < S; k += 4 + Math.floor(rnd() * 3)) {
            g.beginPath();
            g.moveTo(-S, k);
            g.lineTo(S, k);
            g.stroke();
          }
        }
        g.restore();
      }
      // hedgerows & tree lines along field edges
      g.lineCap = "round";
      for (const [x, y, w, h] of fields) {
        if (rnd() < 0.55) {
          g.strokeStyle = "rgba(38,58,26,0.85)";
          g.lineWidth = 3 + rnd() * 3;
          g.beginPath();
          g.moveTo(x, y + h);
          g.lineTo(x + w, y + h);
          g.stroke();
        }
        if (rnd() < 0.35) {
          g.strokeStyle = "rgba(38,58,26,0.8)";
          g.lineWidth = 3 + rnd() * 3;
          g.beginPath();
          g.moveTo(x + w, y);
          g.lineTo(x + w, y + h);
          g.stroke();
        }
      }
      // a few farm tracks
      g.strokeStyle = "rgba(190,175,135,0.7)";
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        let px = rnd() * S,
          py = 0;
        g.moveTo(px, py);
        while (py < S) {
          px += (rnd() - 0.5) * 60;
          py += 40 + rnd() * 60;
          g.lineTo(px, py);
        }
        g.stroke();
      }
      grain(g, S, rnd, 0.08);
    },
    21,
  );
}

function forestTex(): THREE.CanvasTexture {
  const S = 512;
  return canvasTex(
    S,
    (g, rnd) => {
      g.fillStyle = "#21361b";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 5000; i++) {
        const x = rnd() * S,
          y = rnd() * S,
          r = 2 + rnd() * 6;
        const l = 24 + rnd() * 34;
        g.fillStyle = `hsl(${95 + rnd() * 30}, ${30 + rnd() * 20}%, ${l * 0.5}%)`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        // sunlit crown edge
        g.fillStyle = `hsla(${90 + rnd() * 20}, 40%, ${l * 0.7}%, 0.5)`;
        g.beginPath();
        g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      grain(g, S, rnd, 0.1);
    },
    33,
  );
}

function rockTex(): THREE.CanvasTexture {
  const S = 512;
  return canvasTex(
    S,
    (g, rnd) => {
      g.fillStyle = "#7d756a";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const x = rnd() * S,
          y = rnd() * S,
          w = 6 + rnd() * 50,
          h = 3 + rnd() * 14;
        const v = 90 + rnd() * 70;
        g.fillStyle = `rgba(${v + 8},${v},${v - 10},0.35)`;
        g.save();
        g.translate(x, y);
        g.rotate(-0.4 + rnd() * 0.3);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.restore();
      }
      // sparse scrub
      for (let i = 0; i < 1200; i++) {
        g.fillStyle = `rgba(${60 + rnd() * 30},${80 + rnd() * 30},${40 + rnd() * 20},0.45)`;
        g.beginPath();
        g.arc(rnd() * S, rnd() * S, 1 + rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
      grain(g, S, rnd, 0.12);
    },
    44,
  );
}

function sandTex(): THREE.CanvasTexture {
  const S = 256;
  return canvasTex(
    S,
    (g, rnd) => {
      g.fillStyle = "#cdbb8d";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(150,130,90,${0.06 + rnd() * 0.08})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        const y = rnd() * S;
        g.moveTo(0, y);
        g.bezierCurveTo(
          S * 0.3,
          y + (rnd() - 0.5) * 20,
          S * 0.7,
          y + (rnd() - 0.5) * 20,
          S,
          y,
        );
        g.stroke();
      }
      grain(g, S, rnd, 0.1);
    },
    55,
  );
}

/** large-scale brightness/colour variation (breaks repetition over kilometres) */
function macroTex(): THREE.CanvasTexture {
  const S = 256;
  return canvasTex(
    S,
    (g, rnd) => {
      g.fillStyle = "#808080";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 140; i++) {
        const x = rnd() * S,
          y = rnd() * S,
          r = 10 + rnd() * 60;
        const v = 100 + rnd() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(
          0,
          `rgba(${v},${v + (rnd() - 0.5) * 20},${v - 10},0.35)`,
        );
        gr.addColorStop(1, "rgba(128,128,128,0)");
        g.fillStyle = gr;
        for (const dx of [-S, 0, S])
          for (const dy of [-S, 0, S]) {
            g.save();
            g.translate(dx, dy);
            g.fillRect(0, 0, S, S);
            g.restore();
          }
      }
    },
    66,
  );
}

const vert = /* glsl */ `
attribute vec4 biome; // sand, fields, forest, rock
varying vec4 vBiome; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vBiome = biome;
  vN = normalize(normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vUv = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = /* glsl */ `
uniform sampler2D tFields; uniform sampler2D tForest; uniform sampler2D tRock; uniform sampler2D tSand; uniform sampler2D tMacro;
uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uGround; uniform float uExposure;
varying vec4 vBiome; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
vec3 tri(sampler2D t, vec2 uv, float s1, float s2) {
  // two scales blended to hide tiling
  return mix(texture2D(t, uv * s1).rgb, texture2D(t, uv * s2 + 0.37).rgb, 0.35);
}
void main() {
  vec2 uv = vUv;
  float macro = texture2D(tMacro, uv / 9000.0).r * 2.0;
  vec4 w = vBiome;
  // break the biome borders with the macro noise
  float n = texture2D(tMacro, uv / 1300.0).r - 0.5;
  w.z = clamp(w.z + n * 0.6, 0.0, 1.0);
  w.w = clamp(w.w + (1.0 - vN.y) * 3.0 - 0.15, 0.0, 1.0); // steep slopes show rock
  w /= max(1e-3, w.x + w.y + w.z + w.w);
  vec3 c = tri(tSand, uv, 1.0 / 90.0, 1.0 / 23.0) * w.x
         + tri(tFields, uv, 1.0 / 1600.0, 1.0 / 610.0) * w.y
         + tri(tForest, uv, 1.0 / 260.0, 1.0 / 71.0) * w.z
         + tri(tRock, uv, 1.0 / 340.0, 1.0 / 97.0) * w.w;
  c *= mix(0.85, 1.15, macro * 0.5);
  vec3 N = normalize(vN);
  float diff = max(dot(N, normalize(uSunDir)), 0.0);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 col = c * (hemi + uSun * diff) * uExposure;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function terrainMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        tFields: { value: fieldsTex() },
        tForest: { value: forestTex() },
        tRock: { value: rockTex() },
        tSand: { value: sandTex() },
        tMacro: { value: macroTex() },
        uSunDir: { value: new THREE.Vector3(-0.5, 0.7, -0.4) },
        uSun: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uSky: { value: new THREE.Color(0.55, 0.62, 0.72) },
        uGround: { value: new THREE.Color(0.25, 0.24, 0.2) },
        uExposure: { value: 0.86 },
      },
    ]),
    vertexShader: vert,
    fragmentShader: frag,
    fog: true,
  });
}
