// Out-the-window view: sky, cloud layer, fog and runway lighting. Sells the "breaking out" moment.
import type { Sim } from '../sim/sim';
import { runwaysInView } from './world3d';
import { DEG, distanceNm } from '../nav/geo';
import { AIRPORTS } from '../nav/data';

const SM_PER_NM = 1.15078;

export function cloudLayer(sim: Sim): { base: number; top: number } {
  // ceiling is AGL above the nearest airport elevation
  let near = AIRPORTS[0];
  for (const a of AIRPORTS) if (distanceNm(sim.ac.s, a) < distanceNm(sim.ac.s, near)) near = a;
  const base = near.elevFt + sim.weather.ceilingFt;
  return { base, top: Math.max(base + 200, sim.weather.cloudTopFt) };
}

export function inCloud(sim: Sim): boolean {
  const { base, top } = cloudLayer(sim);
  return sim.ac.s.altFt > base && sim.ac.s.altFt < top && sim.weather.ceilingFt < 15000;
}

export function drawOtw(ctx: CanvasRenderingContext2D, sim: Sim, W: number, H: number, t: number) {
  const d = sim.ac.data;
  const s = sim.ac.s;
  const fov = 72;
  const ppd = W / fov;
  const { base, top } = cloudLayer(sim);
  const overcast = sim.weather.ceilingFt < 15000;
  const below = s.altFt <= base || !overcast;
  const above = overcast && s.altFt >= top;
  const inside = overcast && !below && !above;
  const visNm = Math.max(0.1, sim.weather.visibilitySm / SM_PER_NM);

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H * 0.42);
  ctx.rotate(-d.rollDeg * DEG);
  ctx.translate(0, d.pitchDeg * ppd);
  const R = W * 2;
  // sky
  const sky = ctx.createLinearGradient(0, -H, 0, 0);
  if (below && overcast) {
    sky.addColorStop(0, '#6f757b');
    sky.addColorStop(1, '#a9adb1');
  } else {
    sky.addColorStop(0, '#2c64b8');
    sky.addColorStop(1, '#a8c8ea');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(-R, -R, 2 * R, R);
  // ground or cloud deck
  if (above) {
    const deck = ctx.createLinearGradient(0, 0, 0, H);
    deck.addColorStop(0, '#e9eef3');
    deck.addColorStop(1, '#c9d2db');
    ctx.fillStyle = deck;
    ctx.fillRect(-R, 0, 2 * R, R);
    // cloud texture bumps
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 137.5 + d.hdgTrue * ppd * 0.8) % (2 * W)) - W;
      const y = 6 + ((i * 53) % 60) * (1 + (i % 3));
      ctx.beginPath();
      ctx.ellipse(x, y, 60 + (i % 5) * 20, 6 + (i % 4) * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, below && overcast ? '#5d6b55' : '#6c8a4c');
    g.addColorStop(1, '#2c3f1f');
    ctx.fillStyle = g;
    ctx.fillRect(-R, 0, 2 * R, R);
    // field texture lines for motion cues
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    const agl = Math.max(30, d.aglFt);
    for (let k = 1; k < 40; k++) {
      const dist = (k * 400 + ((s.lat * 364000 + s.lon * 246000) % 400)) / 6076;
      const el = -Math.atan2(agl / 6076, dist) / DEG;
      ctx.beginPath();
      ctx.moveTo(-R, -el * ppd);
      ctx.lineTo(R, -el * ppd);
      ctx.stroke();
    }
    // runways
    const cam = { lat: s.lat, lon: s.lon, altFt: s.altFt + 5, hdgTrue: d.hdgTrue };
    for (const rw of runwaysInView(cam, 15)) {
      const fog = overcast || visNm < 8 ? Math.exp(-rw.dist / (visNm * 0.9)) : 1;
      if (fog < 0.02) continue;
      ctx.globalAlpha = Math.min(1, fog * 1.2);
      ctx.beginPath();
      rw.corners.forEach((p, i) => (i ? ctx.lineTo(p.az * ppd, -p.el * ppd) : ctx.moveTo(p.az * ppd, -p.el * ppd)));
      ctx.closePath();
      ctx.fillStyle = '#3b3f44';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [a, b] of rw.stripes) {
        ctx.moveTo(a.az * ppd, -a.el * ppd);
        ctx.lineTo(b.az * ppd, -b.el * ppd);
      }
      ctx.stroke();
      // lights (brighter in low visibility)
      for (const l of rw.lights) {
        const r = Math.max(1.2, Math.min(5, 3 / Math.max(0.15, l.dist)));
        ctx.fillStyle = l.kind === 'thr' ? '#38ff6a' : l.kind === 'app' ? '#fff4c2' : '#ffffff';
        ctx.globalAlpha = Math.min(1, fog * 2.2) * (l.kind === 'app' ? 0.7 + 0.3 * Math.sin(t * 12 - l.dist * 30) : 1);
        ctx.beginPath();
        ctx.arc(l.az * ppd, -l.el * ppd, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  // fog / cloud overlays (screen space)
  if (inside) {
    ctx.fillStyle = 'rgba(178,183,189,0.97)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 6; i++) {
      const x = ((t * 140 + i * 211) % (W + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(x, H * (0.2 + i * 0.12), 220, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (below && overcast) {
    // near the base, wisps
    const distToBase = base - s.altFt;
    if (distToBase < 250) {
      ctx.fillStyle = `rgba(170,175,180,${Math.max(0, 0.75 - distToBase / 330)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const haze = Math.max(0, Math.min(0.55, 0.6 - visNm / 8));
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(160,165,170,${haze})`);
    g.addColorStop(0.5, `rgba(160,165,170,${haze * 1.2})`);
    g.addColorStop(1, `rgba(160,165,170,${haze * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // glareshield
  const gs = ctx.createLinearGradient(0, H - 26, 0, H);
  gs.addColorStop(0, '#1a1b1d');
  gs.addColorStop(1, '#0b0b0c');
  ctx.fillStyle = gs;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - 14);
  ctx.quadraticCurveTo(W / 2, H - 34, W, H - 14);
  ctx.lineTo(W, H);
  ctx.fill();
}
