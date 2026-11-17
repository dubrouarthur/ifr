// The outside view of a slide's « Vue simulateur » block (simViewport « outside » / « cockpit »), drawn from the
// slide's own aircraft (the Sim of its situation): the horizon at the aircraft's pitch and bank, and the runways of
// the airports within reach projected through a pinhole camera at the aircraft's position, heading and height. By
// night the sky and the ground go dark and the runway shows its lights (edge lights white, threshold green,
// approach lights). It follows the aircraft while the slide shows: an animation or a student at the controls moves
// the view with the instruments. A thumbnail draws it once.
import type { Sim } from "../../sim/sim";
import { AIRPORTS, slideAirports } from "../../nav/data";
import { DEG, FT_PER_NM, toLocal, type LatLon } from "../../nav/geo";

export interface OutsideOpts {
  /** the cockpit view: the cowling and the glare shield in the lower part */
  cockpit: boolean;
  night: boolean;
  /** the cloud layer of the situation (an IMC situation): base and tops, ft */
  cloud?: { baseFt: number; topFt: number };
}

/** vertical field of view of the picture, ° (a calm, slightly long lens: the runway reads on a slide) */
const FOV_V = 20;
/** runways farther than this are not drawn, NM */
const REACH_NM = 14;

type V3 = [number, number, number];
/** A point in the aircraft's camera: x right, y up, z forward (feet). */
function camPoint(
  dE: number,
  dN: number,
  dU: number,
  psi: number,
  theta: number,
  phi: number,
): V3 {
  const f = dN * Math.cos(psi) + dE * Math.sin(psi);
  const r = dE * Math.cos(psi) - dN * Math.sin(psi);
  const f2 = f * Math.cos(theta) + dU * Math.sin(theta);
  const u2 = dU * Math.cos(theta) - f * Math.sin(theta);
  return [
    r * Math.cos(phi) - u2 * Math.sin(phi),
    r * Math.sin(phi) + u2 * Math.cos(phi),
    f2,
  ];
}

interface Pose {
  lat: number;
  lon: number;
  altFt: number;
  psi: number;
  theta: number;
  phi: number;
}
const poseOf = (sim: Sim | null): Pose => {
  const s = sim?.ac.s;
  return s
    ? {
        lat: s.lat,
        lon: s.lon,
        altFt: s.altFt,
        psi: s.psi,
        theta: s.theta,
        phi: s.phi,
      }
    : { lat: 0, lon: 0, altFt: 3000, psi: 0, theta: 0, phi: 0 };
};

/** Draw the outside view once. Pure drawing: no state kept between calls. */
export function drawOutsideView(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim | null,
  o: OutsideOpts,
) {
  const p = poseOf(sim);
  const focal = h / 2 / Math.tan((FOV_V / 2) * DEG);
  const cy = h * (o.cockpit ? 0.42 : 0.5);
  const cx = w / 2;
  const night = o.night;
  // ---- sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (night) {
    sky.addColorStop(0, "#050a16");
    sky.addColorStop(0.55, "#0c1830");
    sky.addColorStop(1, "#16243d");
  } else {
    sky.addColorStop(0, "#5b8fc7");
    sky.addColorStop(0.6, "#9cbfdf");
    sky.addColorStop(1, "#cfe0ee");
  }
  ctx.save();
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // ---- ground: below the horizon at the aircraft's pitch and bank
  ctx.translate(cx, cy + Math.tan(p.theta) * focal);
  ctx.rotate(-p.phi);
  const haze = ctx.createLinearGradient(0, -h * 0.03, 0, h * 1.2);
  if (night) {
    haze.addColorStop(0, "#1c2a40");
    haze.addColorStop(0.04, "#0b1220");
    haze.addColorStop(1, "#04070d");
  } else {
    haze.addColorStop(0, "#d6e2ea");
    haze.addColorStop(0.03, "#93a77f");
    haze.addColorStop(0.35, "#6f8a55");
    haze.addColorStop(1, "#4f6a3b");
  }
  ctx.fillStyle = haze;
  ctx.fillRect(-w * 2, -h * 0.03, w * 4, h * 4);
  // fields: a few bands that close up towards the horizon (perspective cue)
  if (!night) {
    ctx.fillStyle = "rgba(60, 80, 45, 0.18)";
    for (let i = 1; i < 9; i++)
      ctx.fillRect(-w * 2, (i * i * h) / 70, w * 4, Math.max(1, (i * h) / 260));
  }
  ctx.restore();
  // ---- the runways within reach
  const here: LatLon = { lat: p.lat, lon: p.lon };
  for (const ap of [...AIRPORTS, ...slideAirports()]) {
    const d = toLocal(here, ap);
    if (Math.hypot(d.x, d.y) > REACH_NM) continue;
    for (const rw of ap.runways)
      drawRunway(ctx, rw, here, p, focal, cx, cy, ap.elevFt, night);
    if (night) cityLights(ctx, ap, here, p, focal, cx, cy);
  }
  // ---- the cloud layer: inside it, grey all round; under it, a grey sky; above it, a white floor
  const c = o.cloud;
  if (c && p.altFt >= c.baseFt && p.altFt <= c.topFt) {
    const fog = ctx.createLinearGradient(0, 0, 0, h);
    fog.addColorStop(0, night ? "#1b2230" : "#d5dadf");
    fog.addColorStop(1, night ? "#121821" : "#b3bac2");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);
  } else if (c) {
    ctx.save();
    ctx.translate(cx, cy + Math.tan(p.theta) * focal);
    ctx.rotate(-p.phi);
    ctx.fillStyle = night ? "rgba(40, 48, 60, 0.85)" : "rgba(214, 219, 224, 0.92)";
    if (p.altFt < c.baseFt) ctx.fillRect(-w * 2, -h * 4, w * 4, h * 4 - h * 0.012);
    else ctx.fillRect(-w * 2, -h * 0.004, w * 4, h * 4);
    ctx.restore();
  }
  // ---- the cockpit: cowling and glare shield
  if (o.cockpit) {
    ctx.fillStyle = night ? "#07090c" : "#15191d";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.74);
    ctx.quadraticCurveTo(w / 2, h * 0.64, w, h * 0.74);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = night ? "#0d1014" : "#23292f";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
  }
}

function project(
  pt: LatLon,
  zFt: number,
  here: LatLon,
  p: Pose,
  focal: number,
  cx: number,
  cy: number,
): [number, number] | null {
  const d = toLocal(here, pt);
  const c = camPoint(
    d.x * FT_PER_NM,
    d.y * FT_PER_NM,
    zFt - p.altFt,
    p.psi,
    p.theta,
    p.phi,
  );
  if (c[2] < 30) return null;
  return [cx + (c[0] / c[2]) * focal, cy - (c[1] / c[2]) * focal];
}

/** a point `along` (0 threshold … 1 end) and `across` (−1 left edge … 1 right edge) of a runway */
function rwPoint(
  rw: (typeof AIRPORTS)[number]["runways"][number],
  along: number,
  across: number,
): LatLon {
  const lat = rw.threshold.lat + (rw.end.lat - rw.threshold.lat) * along;
  const lon = rw.threshold.lon + (rw.end.lon - rw.threshold.lon) * along;
  const hdg = rw.heading * DEG;
  const off = ((rw.widthFt / 2) * across) / FT_PER_NM / 60; // degrees of latitude
  return {
    lat: lat - Math.sin(hdg) * off,
    lon: lon + (Math.cos(hdg) * off) / Math.cos(lat * DEG),
  };
}

function drawRunway(
  ctx: CanvasRenderingContext2D,
  rw: (typeof AIRPORTS)[number]["runways"][number],
  here: LatLon,
  p: Pose,
  focal: number,
  cx: number,
  cy: number,
  elev: number,
  night: boolean,
) {
  const z = rw.elevFt ?? elev;
  const P = (a: number, c: number) =>
    project(rwPoint(rw, a, c), z, here, p, focal, cx, cy);
  const quad = [P(0, -1), P(0, 1), P(1, 1), P(1, -1)];
  if (quad.some((q) => !q)) return;
  const q = quad as [number, number][];
  if (!night) {
    ctx.fillStyle = "#5d636b";
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    for (const k of q.slice(1)) ctx.lineTo(k[0], k[1]);
    ctx.closePath();
    ctx.fill();
    // edge lines, threshold bars and the centre line
    ctx.fillStyle = "#f2f4f5";
    for (const c of [-1, 0.94]) {
      const edge = [P(0, c), P(0, c + 0.06), P(1, c + 0.06), P(1, c)];
      if (!edge.some((b) => !b)) fillPoly(ctx, edge as [number, number][]);
    }
    for (let i = 0; i < 8; i++) {
      const c0 = -0.85 + i * 0.22;
      const bar = [
        P(0.005, c0),
        P(0.005, c0 + 0.12),
        P(0.03, c0 + 0.12),
        P(0.03, c0),
      ];
      if (bar.some((b) => !b)) continue;
      fillPoly(ctx, bar as [number, number][]);
    }
    for (let a = 0.06; a < 0.96; a += 0.06) {
      const dash = [
        P(a, -0.025),
        P(a, 0.025),
        P(a + 0.025, 0.025),
        P(a + 0.025, -0.025),
      ];
      if (dash.some((b) => !b)) continue;
      fillPoly(ctx, dash as [number, number][]);
    }
    return;
  }
  // night: the lights only (FAA AIM 2-1-4: white edge lights, green threshold, the approach lights before it)
  const dot = (pt: [number, number] | null, color: string, r: number) => {
    if (!pt) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fill();
  };
  const near = (ctx.canvas.width / 640) * Math.max(1.4, Math.min(4, 2200 / Math.max(800, distFt(rw.threshold, here, p))));
  ctx.save();
  ctx.shadowBlur = 6;
  ctx.shadowColor = "rgba(255, 240, 200, 0.9)";
  for (let a = 0; a <= 1.0001; a += 0.05) {
    dot(P(a, -1.15), "#fff6dc", near);
    dot(P(a, 1.15), "#fff6dc", near);
  }
  ctx.shadowColor = "rgba(120, 255, 150, 0.9)";
  for (let c = -1; c <= 1.0001; c += 0.25) dot(P(0, c), "#7dff9b", near);
  ctx.shadowColor = "rgba(255, 240, 200, 0.9)";
  // approach lights: a line of bars before the threshold, 2,400 ft long
  const len = 2400 / rw.lengthFt;
  for (let k = 1; k <= 12; k++)
    for (const c of [-0.3, 0, 0.3])
      dot(P(-(k / 12) * len, c), "#fff1c4", near * 0.9);
  ctx.restore();
}
const distFt = (pt: LatLon, here: LatLon, p: Pose) => {
  const d = toLocal(here, pt);
  return Math.hypot(d.x * FT_PER_NM, d.y * FT_PER_NM, p.altFt);
};
function fillPoly(ctx: CanvasRenderingContext2D, q: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(q[0][0], q[0][1]);
  for (const k of q.slice(1)) ctx.lineTo(k[0], k[1]);
  ctx.closePath();
  ctx.fill();
}
/** the town around an airport at night: warm points on the ground, always the same (a fixed pattern) */
function cityLights(
  ctx: CanvasRenderingContext2D,
  ap: LatLon & { elevFt: number },
  here: LatLon,
  p: Pose,
  focal: number,
  cx: number,
  cy: number,
) {
  ctx.save();
  // a light is a few pixels whatever the size of the picture (it still reads on a card)
  const px = Math.max(1, ctx.canvas.width / 400);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.6 + rnd() * 2.6; // NM from the field
    const pt = {
      lat: ap.lat + (Math.cos(a) * r) / 60,
      lon: ap.lon + (Math.sin(a) * r) / 60 / Math.cos(ap.lat * DEG),
    };
    const q = project(pt, ap.elevFt, here, p, focal, cx, cy);
    if (!q) continue;
    ctx.fillStyle =
      rnd() > 0.7 ? "rgba(255, 214, 150, 0.85)" : "rgba(255, 190, 110, 0.6)";
    ctx.fillRect(q[0] - px, q[1] - px, 2 * px, 2 * px);
  }
  ctx.restore();
}

/**
 * The outside view in a canvas: drawn now, then again whenever the aircraft moves while the canvas is on screen
 * (an animation, a demonstration, a student at the controls). `live: false` draws it once (a thumbnail).
 * Returns `stop()`.
 */
export function mountOutsideView(
  cv: HTMLCanvasElement,
  sim: () => Sim | null,
  o: OutsideOpts & { live: boolean },
): () => void {
  const ctx = cv.getContext("2d");
  if (!ctx) return () => {};
  const draw = () => drawOutsideView(ctx, cv.width, cv.height, sim(), o);
  draw();
  if (!o.live || typeof requestAnimationFrame === "undefined") return () => {};
  let on = true;
  let seen = true;
  let last = "";
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((es) => {
          seen = es.some((e) => e.isIntersecting);
        })
      : null;
  io?.observe(cv);
  let raf = 0;
  let wasOn = false;
  let frames = 0;
  const tick = () => {
    if (!on) return;
    // gone from the page (the slide changed): stop; never shown after a few seconds: stop too
    if (cv.isConnected) wasOn = true;
    else if (wasOn || ++frames > 300) {
      stop();
      return;
    }
    if (seen) {
      const s = sim()?.ac.s;
      const sig = s
        ? `${s.lat.toFixed(6)},${s.lon.toFixed(6)},${s.altFt.toFixed(1)},${s.psi.toFixed(4)},${s.theta.toFixed(4)},${s.phi.toFixed(4)}`
        : "-";
      if (sig !== last) {
        last = sig;
        draw();
      }
    }
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    on = false;
    cancelAnimationFrame(raf);
    io?.disconnect();
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
