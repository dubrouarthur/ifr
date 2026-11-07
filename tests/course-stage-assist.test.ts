// Stage package C: the assist (pitch for altitude, power for speed, bank pad), and the pure maths / geometry the
// stage and its calc diagrams are built on (wind triangle, 60:1, profiles, VDP, hold in wind, TVMDC, C172S CG,
// hold entry sectors = holdEntry(), annotation reveal, knob detents).
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { startAt } from "../src/train/engine";
import { NAVAIDS } from "../src/nav/data";
import { holdEntry } from "../src/nav/holding";
import { StageAssist, standardRateBankDeg } from "../src/course/stage/assist";
import {
  checkCg,
  ftPerNmOfAngle,
  solveHoldWind,
  solveProfile,
  solveWind,
  sixtyToOne,
  standardRateBank,
  trackFromHeading,
  turnRadiusNm,
  tvmdc,
  vdpNm,
  c172sFwdLimit,
} from "../src/course/stage/diagramMath";
import { entrySectors } from "../src/course/stage/planInset";
import {
  annotationVisible,
  spotlightPath,
  sanitizeRect,
  resolveAnchor,
} from "../src/course/stage/geometry";
import { dragDetents, tapZone } from "../src/course/stage/controls";

function airborne(hdg = 120, alt = 4000, ias = 100) {
  const sim = new Sim();
  const ard = NAVAIDS.find((n) => n.ident === "ARD")!;
  startAt(sim, {
    pos: { lat: ard.lat, lon: ard.lon - 0.12 },
    altFt: alt,
    hdg,
    iasKt: ias,
    weather: { windKt: 0, turbulence: 0, gustKt: 0 },
  });
  return sim;
}
function run(sim: Sim, a: StageAssist, s: number, each?: (t: number) => void) {
  const dt = 1 / 30;
  for (let t = 0; t < s; t += dt) {
    a.apply(sim, dt);
    sim.step(dt);
    each?.(t);
  }
}

describe("StageAssist", () => {
  it("holds altitude and speed in still air", () => {
    const sim = airborne();
    const a = new StageAssist();
    a.configure(sim, { holdAlt: true, holdIas: true }, true);
    let maxDa = 0;
    let maxDv = 0;
    run(sim, a, 60, (t) => {
      if (t > 10) {
        maxDa = Math.max(maxDa, Math.abs(sim.ac.s.altFt - a.targetAlt));
        maxDv = Math.max(maxDv, Math.abs(sim.ac.data.iasKt - a.targetIas));
      }
    });
    expect(maxDa).toBeLessThan(15);
    expect(maxDv).toBeLessThan(3);
  });

  it("bank pad: holds a standard-rate turn, altitude kept, then holds the new heading on release", () => {
    const sim = airborne();
    const a = new StageAssist();
    a.configure(sim, { holdAlt: true, holdIas: true }, true);
    run(sim, a, 20);
    a.setBank(1, sim);
    let maxBank = 0;
    run(sim, a, 20, () => (maxBank = Math.max(maxBank, sim.ac.data.rollDeg)));
    expect(maxBank).toBeGreaterThan(10);
    expect(maxBank).toBeLessThan(26);
    expect(Math.abs(sim.ac.data.turnRateDps)).toBeGreaterThan(2.4);
    expect(Math.abs(sim.ac.data.turnRateDps)).toBeLessThan(3.6);
    expect(Math.abs(sim.ac.s.altFt - a.targetAlt)).toBeLessThan(40);
    a.setBank(0, sim);
    run(sim, a, 30);
    expect(Math.abs(sim.ac.data.rollDeg)).toBeLessThan(2);
    const h = sim.ac.data.hdgTrue;
    run(sim, a, 10);
    expect(Math.abs(sim.ac.data.hdgTrue - h)).toBeLessThan(2);
  });

  it("HDG bug: turns onto the bugged heading and rolls out", () => {
    const sim = airborne(170);
    const a = new StageAssist();
    a.configure(sim, { holdAlt: true, holdIas: true }, true);
    a.headingBug(90);
    run(sim, a, 60);
    expect(Math.abs(sim.ac.data.hdgTrue - 90)).toBeLessThan(2);
    expect(Math.abs(sim.ac.data.rollDeg)).toBeLessThan(2);
  });

  it("power steps move the speed target and the aircraft follows", () => {
    const sim = airborne();
    const a = new StageAssist();
    a.configure(sim, { holdAlt: true, holdIas: true }, true);
    run(sim, a, 20);
    const t0 = a.targetIas;
    a.nudgePower(1, sim);
    a.nudgePower(1, sim);
    expect(a.targetIas).toBeGreaterThan(t0);
    run(sim, a, 60);
    expect(Math.abs(sim.ac.data.iasKt - a.targetIas)).toBeLessThan(3);
    expect(Math.abs(sim.ac.s.altFt - a.targetAlt)).toBeLessThan(40);
  });

  it("standard-rate bank follows TAS / 10 + 7 (the rule overestimates by about 2°) up to the cap", () => {
    for (const tas of [90, 110, 140]) {
      expect(Math.abs(standardRateBankDeg(tas) - (tas / 10 + 7))).toBeLessThan(
        3,
      );
    }
    expect(standardRateBankDeg(400)).toBe(25);
  });
});

describe("calc diagram maths", () => {
  it("wind triangle: crosswind from the right needs a right correction and loses ground speed", () => {
    const w = solveWind(90, 100, 150, 20);
    expect(w.ok).toBe(true);
    expect(w.wca).toBeCloseTo(Math.asin((20 * Math.sin((60 * Math.PI) / 180)) / 100) * (180 / Math.PI), 6);
    expect(w.wca).toBeGreaterThan(0);
    expect(w.head).toBeCloseTo(10, 6);
    expect(w.gs).toBeLessThan(100);
    // the inverse gives the course back
    const back = trackFromHeading(w.th, 100, 150, 20);
    expect(back.trk).toBeCloseTo(90, 4);
    expect(back.gs).toBeCloseTo(w.gs, 4);
  });
  it("wind triangle: a crosswind stronger than the TAS cannot be corrected", () => {
    expect(solveWind(90, 20, 180, 30).ok).toBe(false);
  });
  it("60:1 rule: TE = 60 × off / flown, closing angle on what is left, correction = TE + CA", () => {
    const r = sixtyToOne(30, 4, 40);
    expect(r.te).toBeCloseTo(8, 6);
    expect(r.ca).toBeCloseTo(6, 6);
    expect(r.correction).toBeCloseTo(14, 6);
    expect(r.teExact).toBeCloseTo(7.59, 2);
    expect(sixtyToOne(30, 4).ca).toBeNull();
  });
  it("descent: 3° is about 318 ft/NM, 5.2 %, VS about GS × 5, TOD from the altitude to lose", () => {
    expect(ftPerNmOfAngle(3)).toBeCloseTo(318.4, 0);
    const p = solveProfile({ fromFt: 6000, toFt: 1500, angleDeg: 3, gsKt: 100 });
    expect(p.pct).toBeCloseTo(5.24, 1);
    expect(p.vsFpm!).toBeCloseTo(530.7, 0);
    expect(p.distNm).toBeCloseTo(4500 / 318.4, 1);
    // gradient given directly wins over the angle
    expect(solveProfile({ fromFt: 3000, toFt: 1000, ftPerNm: 200, angleDeg: 3 }).distNm).toBeCloseTo(10, 6);
    // from altitude and distance
    expect(solveProfile({ fromFt: 3000, toFt: 1000, distNm: 8 }).ftPerNm).toBeCloseTo(250, 6);
  });
  it("VDP: (MDA − TDZE) / 300 NM", () => {
    const v = vdpNm(680, 440);
    expect(v.rule).toBeCloseTo(0.8, 6);
    expect(v.exact).toBeCloseTo(240 / 318.4, 2);
  });
  it("standard-rate bank and turn radius", () => {
    const b = standardRateBank(100);
    expect(b.rule).toBe(17);
    expect(b.exact).toBeGreaterThan(15);
    expect(b.exact).toBeLessThan(16);
    // r = V / ω at standard rate: 100 kt → 0.53 NM
    expect(turnRadiusNm(100, b.exact)).toBeCloseTo(100 / (60 * 3 * (Math.PI / 180) * 60 / 60) / 60, 1);
  });
  it("hold in wind: inbound correction tripled outbound (AIM 5-3-8) and the timing that gives 1:00 inbound", () => {
    const h = solveHoldWind(90, 180, 20, 100, 60);
    expect(h.wcaIn).toBeGreaterThan(8); // wind from the right of the inbound course
    expect(h.inboundHdg).toBeCloseTo(90 + h.wcaIn, 6);
    expect(h.outboundHdg).toBeCloseTo(270 - 3 * h.wcaIn, 6);
    // crosswind only: the legs have the same ground speed and the same time
    expect(h.outboundS).toBeGreaterThan(55);
    expect(h.outboundS).toBeLessThan(65);
    // a headwind inbound (wind from 090) means a tailwind outbound: fly the outbound leg shorter
    const hw = solveHoldWind(90, 90, 20, 100, 60);
    expect(hw.gsIn).toBeCloseTo(80, 4);
    expect(hw.gsOut).toBeCloseTo(120, 4);
    expect(hw.outboundS).toBeCloseTo(40, 4);
  });
  it("TVMDC: East is least, West is best", () => {
    expect(tvmdc(90, 0, 6, 0).mh).toBe(84); // 6°E: subtract
    expect(tvmdc(90, 0, -6, 0).mh).toBe(96); // 6°W: add
    const t = tvmdc(350, 5, -8, 2);
    expect(t.th).toBe(355);
    expect(t.mh).toBe(3); // wraps through north
    expect(t.ch).toBe(5);
  });
  it("C172S CG envelope: limits and the reason for a failure", () => {
    expect(c172sFwdLimit(1800)).toBe(35);
    expect(c172sFwdLimit(2550)).toBeCloseTo(41, 6);
    expect(checkCg(2200, 2200 * 40).reason).toBe("ok");
    expect(checkCg(2200, 2200 * 34).reason).toBe("forward");
    expect(checkCg(2200, 2200 * 48).reason).toBe("aft");
    expect(checkCg(2600, 2600 * 40).reason).toBe("overweight");
    // utility category is smaller
    expect(checkCg(2300, 2300 * 40, "utility").reason).toBe("overweight");
  });
});

describe("stage geometry", () => {
  it("hold entry sectors are exactly holdEntry(): all three, contiguous, every degree", () => {
    for (const turn of ["R", "L"] as const) {
      for (const inbound of [0, 90, 225, 315]) {
        const secs = entrySectors(inbound, turn);
        expect(new Set(secs.map((s) => s.entry)).size).toBe(3);
        let total = 0;
        for (const s of secs) total += (((s.to - s.from) % 360) + 360) % 360 || 360;
        expect(total).toBe(360);
        for (let b = 0; b < 360; b += 7) {
          const hit = secs.find((s) => {
            const span = (((s.to - s.from) % 360) + 360) % 360 || 360;
            return (((b - s.from) % 360) + 360) % 360 < span;
          })!;
          expect(hit.entry).toBe(holdEntry(inbound, turn, (b + 180) % 360));
        }
      }
    }
  });
  it("annotations reveal by step, check and answer", () => {
    const base = { id: "a", pane: 0 as const, type: "ring" as const, rect: [0, 0, 1, 1] as [number, number, number, number] };
    expect(annotationVisible(base, { reveal: 0 })).toBe(true);
    expect(annotationVisible({ ...base, when: { step: 2 } }, { reveal: 1 })).toBe(false);
    expect(annotationVisible({ ...base, when: { step: 2 } }, { reveal: 2 })).toBe(true);
    expect(annotationVisible({ ...base, when: "afterCheck:1" }, { reveal: 9, checks: [true, false] })).toBe(false);
    expect(annotationVisible({ ...base, when: "afterCheck:1" }, { reveal: 9, checks: [false, true] })).toBe(true);
    expect(annotationVisible({ ...base, when: "onReveal" }, { reveal: 9 })).toBe(false);
    expect(annotationVisible({ ...base, when: "onReveal" }, { reveal: 0, revealed: true })).toBe(true);
  });
  it("spotlight path is the rect minus its holes; rects are kept inside the display", () => {
    const d = spotlightPath([0, 0, 1024, 768], [{ rect: [100, 100, 200, 200] }, { circle: [500, 400, 50] }]);
    expect((d.match(/Z/g) ?? []).length).toBe(3);
    const r = sanitizeRect([-50, -10, 5000, 5000]);
    expect(r[0]).toBeGreaterThanOrEqual(0);
    expect(r[0] + r[2]).toBeLessThanOrEqual(1024);
    expect(r[1] + r[3]).toBeLessThanOrEqual(768);
  });
  it("an anchored ring resolves to its explain region", () => {
    const a = resolveAnchor({ id: "x", pane: 0, type: "ring", rect: [0, 0, 1, 1], anchor: "STEAM_LEFT:4" });
    if (a.type !== "ring") throw new Error("type");
    // the HSI region is 292 square at (366, 432)
    expect(a.rect[0]).toBeGreaterThan(366);
    expect(a.rect[2]).toBeLessThan(292);
  });
  it("knob drag is one detent per 6 px, right / up increase; tap zones", () => {
    expect(dragDetents(12, 0)).toBe(2);
    expect(dragDetents(-12, 0)).toBe(-2);
    expect(dragDetents(0, -6)).toBe(1);
    expect(dragDetents(3, 0)).toBe(0);
    expect(tapZone(0.1)).toBe(-1);
    expect(tapZone(0.5)).toBe(0);
    expect(tapZone(0.9)).toBe(1);
  });
});
