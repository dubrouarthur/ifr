// IFR calculation generators: hand-checked numbers, an independent re-computation from the givens of many seeds,
// the wrong-answer diagnosis, and property tests of the maths (rules of thumb against exact trigonometry).
import { describe, expect, it } from "vitest";
import { checkAnswer, generate } from "../src/course/calc";
import type { CalcGeneratorId, CalcProblem, CalcResponse } from "../src/course/types";
import * as M from "../src/course/calc/maths";
import { solveSixtyToOne, solveArcLead, solveAdf, solveVor, solveInterceptLead } from "../src/course/calc/ifr/nav";
import { descentVs, solveTod, solveVdp } from "../src/course/calc/ifr/vertical";
import { holdOutboundSeconds, maxHoldingSpeed, solveHoldWind } from "../src/course/calc/ifr/turnsHolds";
import { solveIfrFuel, solveRunwayWind } from "../src/course/calc/ifr/perf";
import { solveDensityAltitude, solvePressureAltitude } from "../src/course/calc/ifr/altimetry";

const D = Math.PI / 180;
const FT_NM = 1852 / 0.3048; // 6076.115
const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

function g(p: CalcProblem): Record<string, number | string> {
  return Object.fromEntries(p.givens.map((x) => [x.key, x.value]));
}
function partsOf(p: CalcProblem): Record<string, number | string> {
  return Object.fromEntries((p.parts ?? []).map((x) => [x.key, x.answer]));
}
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** answer of the problem is within its tolerance of an independent value (angles wrap) */
function agrees(p: CalcProblem, expected: number, extra = 0.001): boolean {
  const d = p.unit === "deg" ? wrap(p.answer - expected) : p.answer - expected;
  return Math.abs(d) <= p.tolerance + extra;
}
/** run `fn` on 120 seeds of one variant */
function each(id: CalcGeneratorId, variant: string | undefined, fn: (p: CalcProblem, v: Record<string, number | string>) => void, params: Record<string, string> = {}) {
  for (const s of SEEDS) {
    const p = generate(id, s, { ...(variant ? { variant } : {}), ...params });
    fn(p, g(p));
  }
}
const ok = (p: CalcProblem, r: CalcResponse) => checkAnswer(p, r);

describe("hand-checked maths (IFR)", () => {
  it("60 to 1: 1 NM off after 60 NM is 1 degree", () => {
    expect(M.trackErrorRule(2, 40)).toBe(3);
    expect(M.trackErrorRule(1, 20)).toBe(3);
    expect(M.trackErrorRule(5, 60)).toBe(5);
    expect(M.trackErrorExact(1, 20)).toBeCloseTo(2.8624, 3); // atan(0.05)
    const s = solveSixtyToOne(360, 20, 1, 1, 25);
    expect(s.teRule).toBe(3);
    expect(s.closeRule).toBeCloseTo(2.4, 6); // 60 × 1 / 25
    expect(s.regainHdgRule).toBe(354); // 2 × 3° left of course
    expect(s.directHdgRule).toBeCloseTo(354.6, 6); // 360 − (3 + 2.4)
  });
  it("gradients: 3 degrees is 318 ft/NM = 5.24 %", () => {
    expect(M.ftPerNmFromAngle(3)).toBeCloseTo(318.4, 0);
    expect(M.ftPerNmFromAngle(2.5)).toBeCloseTo(265.3, 0);
    expect(M.pctFromFtPerNm(318.4)).toBeCloseTo(5.24, 2);
    expect(M.pctFromFtPerNm(200)).toBeCloseTo(3.29, 2);
    expect(M.angleFromFtPerNm(300)).toBeCloseTo(2.827, 2);
    expect(M.ftPerNmFromPct(4)).toBeCloseTo(243.0, 0);
  });
  it("descent rate: VS = GS x 5 at 3 degrees (exact GS x 318.4 / 60)", () => {
    expect(descentVs(120, 3).rule).toBe(600);
    expect(descentVs(120, 3).exact).toBeCloseTo(636.9, 0);
    expect(descentVs(90, 3).rule).toBe(450);
    expect(descentVs(90, 3).exact).toBeCloseTo(477.6, 0);
    expect(M.vsForGradient(100, 300)).toBe(500);
  });
  it("top of descent: 3 x thousands of feet to lose (exact 318 ft/NM)", () => {
    const t = solveTod(12000, 3000, 130);
    expect(t.lose).toBe(9000);
    expect(t.ruleNm).toBe(27);
    expect(t.exactNm).toBeCloseTo(28.26, 2);
    expect(t.vs3).toBeCloseTo(689.9, 0);
    const u = solveTod(10000, 4000, 120, 600); // 6,000 ft at 600 ft/min = 10 min at 2 NM/min
    expect(u.timeMin).toBe(10);
    expect(u.exactNm).toBeCloseTo(20, 6);
    expect(solveTod(5000, 1000, 90).ruleNm).toBe(12);
  });
  it("VDP: (MDA - TDZE) / 300", () => {
    const v = solveVdp(1260, 700);
    expect(v.hat).toBe(560);
    expect(v.rule).toBeCloseTo(1.867, 3);
    expect(v.exact).toBeCloseTo(1.759, 3);
    expect(solveVdp(710, 130).rule).toBeCloseTo(1.933, 3);
    expect(solveVdp(1000, 200).rule).toBeCloseTo(2.667, 3);
  });
  it("climb gradient: ft/min = ft/NM x GS / 60", () => {
    expect(M.vsForGradient(90, 320)).toBe(480);
    expect(M.vsForGradient(75, 420)).toBe(525);
    expect(M.vsForGradient(115, 450)).toBe(862.5);
  });
  it("standard rate bank: TAS/10 + 7 against atan(w V / g)", () => {
    expect(M.bankRule(120)).toBe(19);
    expect(M.bankRule(180)).toBe(25);
    expect(M.bankRule(90)).toBe(16);
    expect(M.bankForRate(120)).toBeCloseTo(18.2, 1);
    expect(M.bankForRate(180)).toBeCloseTo(26.3, 1);
    expect(M.bankForRate(90)).toBeCloseTo(13.9, 1);
  });
  it("turn radius: TAS / 188.5 NM at standard rate; V^2 / (g tan phi) at a bank", () => {
    expect(M.turnRadiusAtRateNm(120)).toBeCloseTo(0.6366, 4);
    expect(M.turnRadiusAtRateNm(180)).toBeCloseTo(0.9549, 4);
    expect(M.turnRadiusAtRateNm(90)).toBeCloseTo(0.4775, 4);
    expect(M.turnRadiusNm(160, 30)).toBeCloseTo(0.646, 3);
    expect(M.rateAtBank(160, 30)).toBeCloseTo(3.9, 1); // °/s
  });
  it("DME arc: lead radial = 60 x radius / arc; start DME = sqrt(D^2 -/+ 2Dr)", () => {
    expect(M.arcToRadialLeadRule(10, 0.5)).toBe(3);
    expect(M.arcToRadialLeadRule(8, 0.8)).toBe(6);
    expect(M.arcToRadialLeadRule(12, 1)).toBe(5);
    expect(M.radialToArcStartExact(10, 0.6)).toBeCloseTo(Math.sqrt(88), 6);
    // geometric construction: a 90° turn of radius r begun at d on the radial ends tangent to the arc of radius D
    for (const [D, r, inbound] of [[16, 0.55, false], [16, 0.55, true], [10, 0.9, false], [12, 0.7, true]] as const) {
      const d = M.radialToArcStartExact(D, r, inbound);
      // radial along +y; turn centre r abeam; the rollout point is one radius from the centre, on the station line
      const cx = r;
      const cy = d;
      const dc = Math.hypot(cx, cy);
      const roll = inbound ? dc - r : dc + r; // inbound the centre is outside the arc; outbound inside
      expect(roll).toBeCloseTo(D, 9);
    }
    const a = solveArcLead(10, 120);
    expect(a.rRule).toBe(0.6);
    expect(a.leadDegRule).toBe(3.6);
    expect(a.startOutRule).toBe(9.4);
  });
  it("intercept lead: r x tan(theta / 2), r = GS / 200", () => {
    const a = solveInterceptLead(120, 90);
    expect(a.rRule).toBe(0.6);
    expect(a.leadRule).toBe(0.6);
    expect(a.leadExact).toBeCloseTo(0.6366, 4);
    const b = solveInterceptLead(150, 60);
    expect(b.leadRule).toBeCloseTo(0.5, 6);
    expect(b.leadExact).toBeCloseTo(0.4594, 3);
    expect(solveInterceptLead(180, 30).leadExact).toBeCloseTo(0.2559, 3);
  });
  it("hold: inbound correction, tripled outbound (AIM 5-3-8)", () => {
    const a = solveHoldWind(360, 100, 90, 20); // wind from the right, 20 kt across
    expect(a.wcaExact).toBeCloseTo(11.54, 2);
    expect(a.wcaRule).toBe(12);
    expect(a.inboundHdg).toBe(12);
    expect(a.outboundHdg).toBe(144); // 180 − 3 × 12
    const b = solveHoldWind(90, 120, 180, 15);
    expect(b.inboundHdg).toBeCloseTo(97.5, 6);
    expect(b.outboundHdg).toBeCloseTo(247.5, 6);
    expect(solveHoldWind(180, 120, 180, 20).wcaExact).toBeCloseTo(0, 6); // a pure headwind needs no correction
  });
  it("hold: outbound time for a 1:00 inbound", () => {
    expect(holdOutboundSeconds(130, 18).exact).toBeCloseTo(45.4, 1);
    expect(holdOutboundSeconds(130, 18).rule).toBeCloseTo(43.4, 1);
    expect(holdOutboundSeconds(100, 10).exact).toBeCloseTo(49.09, 2);
    expect(holdOutboundSeconds(90, 0).exact).toBe(60);
  });
  it("max holding speeds: FAA AIM 5-3-8 and ICAO PANS-OPS bands", () => {
    expect(maxHoldingSpeed(6000, "faa")).toBe(200);
    expect(maxHoldingSpeed(6001, "faa")).toBe(230);
    expect(maxHoldingSpeed(14000, "faa")).toBe(230);
    expect(maxHoldingSpeed(14001, "faa")).toBe(265);
    expect(maxHoldingSpeed(14000, "icao")).toBe(230);
    expect(maxHoldingSpeed(14001, "icao")).toBe(240);
    expect(maxHoldingSpeed(20000, "icao")).toBe(240);
    expect(maxHoldingSpeed(20001, "icao")).toBe(265);
  });
  it("ADF and VOR", () => {
    expect(solveAdf(315, 275)).toEqual({ qdm: 230, qdr: 50 });
    expect(solveAdf(75, 50)).toEqual({ qdm: 125, qdr: 305 });
    expect(solveAdf(330, 90)).toEqual({ qdm: 60, qdr: 240 });
    expect(solveVor(240, 350)).toMatchObject({ flag: "TO", needle: "R", offDeg: 70 });
    expect(solveVor(90, 90)).toMatchObject({ flag: "FROM", offDeg: 0 });
    expect(solveVor(90, 270)).toMatchObject({ flag: "TO", offDeg: 0 });
  });
  it("wind components: 30 degrees off, 20 kt = 10 across, 17.3 along", () => {
    const w = solveRunwayWind(360, 30, 20);
    expect(w.cross).toBeCloseTo(10, 6);
    expect(w.head).toBeCloseTo(17.32, 2);
    expect(w.side).toBe("R");
    const x = solveRunwayWind(90, 90 - 45, 20); // from the left, 45°
    expect(x.cross).toBeCloseTo(14.14, 2);
    expect(x.side).toBe("L");
    expect(solveRunwayWind(270, 90, 12).head).toBeCloseTo(-12, 6); // tailwind
  });
  it("fuel: trip + alternate + 45 min reserve + taxi", () => {
    const f = solveIfrFuel(200, 60, 120, 10, 1.5);
    expect(f.tripT).toBe(100);
    expect(f.altT).toBe(30);
    expect(f.reserve).toBe(7.5);
    expect(f.total).toBeCloseTo(30.67, 2); // 16.67 + 5 + 7.5 + 1.5
  });
  it("pressure and density altitude, hand-checked", () => {
    expect(M.pressureAltitudeRuleInHg(1000, 29.42)).toBeCloseTo(1500, 6);
    expect(M.pressureAltitudeRuleInHg(500, 30.42)).toBeCloseTo(0, 6);
    expect(solvePressureAltitude(2000, 1003, "hPa").rule).toBeCloseTo(2000 + 10.25 * 27, 0);
    expect(solveDensityAltitude(5000, 25).rule).toBeCloseTo(5000 + 120 * 20, 6); // ISA 5 °C
    expect(solveDensityAltitude(0, 15).rule).toBeCloseTo(0, 6);
    expect(solveDensityAltitude(0, 30).exact).toBeGreaterThan(1700); // ISA +15: about 1,800 ft
    expect(solveDensityAltitude(0, 30).exact).toBeLessThan(1900);
  });
  it("true airspeed: 2 % per 1,000 ft, exact near it", () => {
    expect(M.tasRule(100, 5000)).toBeCloseTo(110, 6);
    expect(M.tasRule(120, 10000)).toBeCloseTo(144, 6);
    // ISA: 10,000 ft PA, -5 °C: TAS ≈ CAS × 1.17
    expect(M.tasFromCas(120, 10000, -5)).toBeGreaterThan(138);
    expect(M.tasFromCas(120, 10000, -5)).toBeLessThan(144);
  });
  it("cold temperature: ICAO 8168 formula", () => {
    // 1,500 ft above a sea-level station at −20 °C: 1,500 × 35 / (273 − 20 − 0.5 × 0.00198 × 1,500) ≈ 209 ft ... checked by hand
    expect(M.coldTempCorrectionFt(1500, 0, -20)).toBeCloseTo((1500 * 35) / (253 - 0.5 * 0.00198 * 1500), 3);
    expect(M.coldTempCorrectionFt(1500, 0, 15)).toBeCloseTo(0, 6);
    expect(M.coldTempCorrectionFt(1000, 0, -10)).toBeGreaterThan(80);
    expect(M.coldTempCorrectionFt(1000, 0, -10)).toBeLessThan(100);
    expect(M.coldTempRule(2000, 0, -25)).toBeGreaterThan(0);
  });
});

describe("IFR generators recomputed independently from their givens", () => {
  it("ifr.sixtyToOne", () => {
    each("ifr.sixtyToOne", "trackError", (p, v) => expect(agrees(p, Math.atan2(+v.offNm, +v.flownNm) / D)).toBe(true));
    each("ifr.sixtyToOne", "regain", (p, v) => {
      const te = Math.atan2(+v.offNm, +v.flownNm) / D;
      const sign = v.side === "R" ? -1 : 1; // off to the right: turn left
      expect(agrees(p, +v.course + sign * 2 * te)).toBe(true);
    });
    each("ifr.sixtyToOne", "direct", (p, v) => {
      const te = Math.atan2(+v.offNm, +v.flownNm) / D;
      const close = Math.atan2(+v.offNm, +v.toGoNm) / D;
      const sign = v.side === "R" ? -1 : 1;
      expect(agrees(p, +v.course + sign * (te + close))).toBe(true);
    });
  });
  it("ifr.descentGradient", () => {
    each("ifr.descentGradient", "angleToFtNm", (p, v) => expect(agrees(p, FT_NM * Math.tan(+v.angle * D))).toBe(true));
    each("ifr.descentGradient", "ftNmToPct", (p, v) => expect(agrees(p, (+v.ftPerNm / FT_NM) * 100)).toBe(true));
    each("ifr.descentGradient", "pctToFtNm", (p, v) => expect(agrees(p, (+v.pct / 100) * FT_NM)).toBe(true));
    each("ifr.descentGradient", "ftNmToAngle", (p, v) => expect(agrees(p, Math.atan(+v.ftPerNm / FT_NM) / D)).toBe(true));
  });
  it("ifr.descentRate", () => {
    each("ifr.descentRate", "angle", (p, v) => expect(agrees(p, (+v.gsKt * FT_NM * Math.tan(+v.angle * D)) / 60)).toBe(true));
    each("ifr.descentRate", "gradient", (p, v) => expect(agrees(p, (+v.gsKt * +v.ftPerNm) / 60)).toBe(true));
  });
  it("ifr.topOfDescent", () => {
    each("ifr.topOfDescent", "gradient", (p, v) => {
      const lose = +v.fromFt - +v.toFt;
      expect(agrees(p, lose / (FT_NM * Math.tan(3 * D)))).toBe(true);
      expect(near(+partsOf(p).vs, (+v.gsKt * FT_NM * Math.tan(3 * D)) / 60, 15)).toBe(true);
    });
    each("ifr.topOfDescent", "vs", (p, v) => {
      const minutes = (+v.fromFt - +v.toFt) / +v.vsFpm;
      expect(agrees(p, (minutes * +v.gsKt) / 60)).toBe(true);
      expect(near(+partsOf(p).time, minutes, 1)).toBe(true);
    });
  });
  it("ifr.vdp", () => {
    each("ifr.vdp", undefined, (p, v) => {
      const hat = +v.mdaFt - +v.tdzeFt;
      expect(agrees(p, hat / (FT_NM * Math.tan(3 * D)))).toBe(true);
    });
  });
  it("ifr.climbGradient", () => {
    each("ifr.climbGradient", "required", (p, v) => {
      expect(agrees(p, (+v.reqFtNm * +v.gsKt) / 60)).toBe(true);
      expect(partsOf(p).can).toBe(+v.rocFpm >= (+v.reqFtNm * +v.gsKt) / 60 ? "yes" : "no");
    });
    each("ifr.climbGradient", "achievable", (p, v) => {
      expect(agrees(p, (+v.rocFpm * 60) / +v.gsKt)).toBe(true);
      expect(partsOf(p).can).toBe((+v.rocFpm * 60) / +v.gsKt >= +v.reqFtNm ? "yes" : "no");
    });
  });
  it("ifr.standardRateBank", () => {
    each("ifr.standardRateBank", undefined, (p, v) => {
      const exact = Math.atan((3 * D * +v.tasKt * 0.514444) / 9.80665) / D;
      expect(agrees(p, exact)).toBe(true);
      expect(agrees(p, +v.tasKt / 10 + 7)).toBe(true); // both the rule and the exact value pass
    });
  });
  it("ifr.turnRadius", () => {
    each("ifr.turnRadius", "stdRate", (p, v) => {
      expect(agrees(p, +v.tasKt / 3600 / (3 * D))).toBe(true);
      expect(near(+partsOf(p).diameter, (2 * +v.tasKt) / 3600 / (3 * D), 0.2)).toBe(true);
    });
    each("ifr.turnRadius", "bank", (p, v) => {
      const V = +v.tasKt * 0.514444;
      expect(agrees(p, V ** 2 / (9.80665 * Math.tan(+v.bank * D)) / 1852)).toBe(true);
      expect(near(+partsOf(p).rate, (9.80665 * Math.tan(+v.bank * D)) / V / D, 0.15)).toBe(true);
    });
  });
  it("ifr.dmeArcLead", () => {
    each("ifr.dmeArcLead", "radialToArc", (p, v) => {
      const r = +v.gsKt / 188.496;
      const exp = v.outbound === "out" ? Math.sqrt(Number(v.arcNm) ** 2 - r * r) - r : +v.arcNm + r;
      expect(agrees(p, exp, 0.05)).toBe(true);
    });
    each("ifr.dmeArcLead", "arcToRadial", (p, v) => {
      const r = +v.gsKt / 188.496;
      const lead = Math.asin(r / (+v.arcNm - r)) / D;
      const sign = v.dir === "cw" ? -1 : 1; // clockwise: radials increase, so start before the final radial
      expect(agrees(p, +v.finalRadial + sign * lead, 0.6)).toBe(true);
    });
  });
  it("ifr.interceptLead", () => {
    each("ifr.interceptLead", undefined, (p, v) => {
      const r = +v.gsKt / 188.496;
      expect(agrees(p, r * Math.tan((+v.theta * D) / 2), 0.02)).toBe(true);
    });
  });
  it("ifr.holdWind", () => {
    each("ifr.holdWind", undefined, (p, v) => {
      const cross = +v.windKt * Math.sin((+v.windDir - +v.inbound) * D);
      const wca = Math.asin(cross / +v.tasKt) / D;
      expect(agrees(p, +v.inbound + 180 - 3 * wca)).toBe(true);
      expect(near(wrap(+partsOf(p).inboundHdg - (+v.inbound + wca)), 0, 1.01)).toBe(true);
    });
  });
  it("ifr.holdTiming", () => {
    each("ifr.holdTiming", "observed", (p, v) => expect(agrees(p, 120 - +v.inboundS)).toBe(true));
    each("ifr.holdTiming", "wind", (p, v) => expect(agrees(p, (60 * (+v.tasKt - +v.headKt)) / (+v.tasKt + +v.headKt))).toBe(true));
  });
  it("ifr.holdSpeed", () => {
    each("ifr.holdSpeed", undefined, (p, v) => expect(p.answer).toBe(maxHoldingSpeed(+v.altFt, v.rules as "faa" | "icao")));
    each("ifr.holdSpeed", undefined, (p, v) => expect(p.answer).toBe(maxHoldingSpeed(+v.altFt, "icao")), { rules: "icao" });
  });
  it("ifr.timeSpeedDistance", () => {
    each("ifr.timeSpeedDistance", "time", (p, v) => expect(agrees(p, (+v.distNm / +v.gsKt) * 60)).toBe(true));
    each("ifr.timeSpeedDistance", "distance", (p, v) => expect(agrees(p, (+v.gsKt * +v.timeMin) / 60)).toBe(true));
    each("ifr.timeSpeedDistance", "speed", (p, v) => expect(agrees(p, (+v.distNm / +v.timeMin) * 60)).toBe(true));
  });
  it("ifr.fuelReserve", () => {
    each("ifr.fuelReserve", undefined, (p, v) => {
      const hours = (+v.tripNm + +v.altNm) / +v.gsKt;
      const total = +v.taxi + +v.burn * (hours + 0.75);
      expect(agrees(p, total, 0.001)).toBe(true);
      expect(near(+partsOf(p).reserve, +v.burn * 0.75, 0.6)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(total - 1e-9); // fuel rounds up, never down
    });
    each("ifr.fuelReserve", undefined, (p, v) => {
      const total = +v.taxi + +v.burn * ((+v.tripNm + +v.altNm) / +v.gsKt + 0.75);
      expect(p.answer).toBeGreaterThanOrEqual(total - 1e-9);
    }, { rules: "icao" });
  });
  it("ifr.tasFromIas", () => {
    each("ifr.tasFromIas", undefined, (p, v) => {
      const rule = +v.iasKt * (1 + (0.02 * +v.paFt) / 1000);
      const sigma = Math.pow(1 - 6.8756e-6 * +v.paFt, 5.2559) * (288.15 / (273.15 + +v.oatC));
      const incompressible = +v.iasKt / Math.sqrt(sigma);
      expect(near(p.answer, v.method === "rule" ? rule : incompressible, p.tolerance + 2.5)).toBe(true);
    });
    each("ifr.tasFromIas", undefined, (p, v) => {
      const sigma = Math.pow(1 - 6.8756e-6 * +v.paFt, 5.2559) * (288.15 / (273.15 + +v.oatC));
      expect(near(p.answer, +v.iasKt / Math.sqrt(sigma), 3 + 2.5)).toBe(true);
    }, { method: "exact" });
  });
  it("ifr.windComponents", () => {
    each("ifr.windComponents", undefined, (p, v) => {
      const a = (+v.windDir - +v.rwyHdg) * D;
      expect(agrees(p, Math.abs(+v.windKt * Math.sin(a)))).toBe(true);
      expect(near(+partsOf(p).head, +v.windKt * Math.cos(a), 2)).toBe(true);
      expect(partsOf(p).side).toBe(Math.sin(a) > 0 ? "R" : "L");
    });
  });
  it("ifr.visibility", () => {
    each("ifr.visibility", "ftToM", (p, v) => expect(agrees(p, +v.ft * 0.3048)).toBe(true));
    each("ifr.visibility", "smToM", (p, v) => expect(agrees(p, +v.sm * 1609.344)).toBe(true));
    each("ifr.visibility", "rvrToSm", (p, v) => {
      const table: Record<number, number> = { 1600: 0.25, 2400: 0.5, 3200: 0.625, 4000: 0.75, 4500: 0.875, 5000: 1, 6000: 1.25 };
      expect(p.answer).toBe(table[+v.rvrFt]);
    });
  });
  it("ifr.pressureAltitude", () => {
    each("ifr.pressureAltitude", "inHg", (p, v) => expect(agrees(p, +v.elevFt + (29.92 - +v.setting) * 1000)).toBe(true));
    each("ifr.pressureAltitude", "hPa", (p, v) => expect(agrees(p, +v.elevFt + (1013.25 - +v.setting) * 27)).toBe(true));
  });
  it("ifr.densityAltitude", () => {
    each("ifr.densityAltitude", undefined, (p, v) => expect(agrees(p, +v.paFt + 120 * (+v.oatC - (15 - (2 * +v.paFt) / 1000)))).toBe(true));
  });
  it("ifr.coldTemperature", () => {
    each("ifr.coldTemperature", undefined, (p, v) => {
      const H = +v.publishedFt - +v.elevFt;
      const t0 = +v.tempC + 0.00198 * +v.elevFt;
      const dh = (H * (15 - t0)) / (273 + t0 - 0.5 * 0.00198 * (H + +v.elevFt));
      expect(agrees(p, dh, 10)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(dh - 1e-9); // rounds up to 10 ft
      expect(partsOf(p).fly).toBe(+v.publishedFt + p.answer);
    });
  });
});

describe("IFR wrong answers are diagnosed", () => {
  const mk = (id: CalcGeneratorId, variant?: string, seed = 11, params: Record<string, string> = {}) => generate(id, seed, { ...(variant ? { variant } : {}), ...params });
  const parts = (p: CalcProblem, over: Record<string, number | string> = {}) => ({ ...partsOf(p), ...over });

  it("every generated problem accepts its own answer and parts", () => {
    for (const id of ["ifr.sixtyToOne", "ifr.holdWind", "ifr.fuelReserve", "ifr.coldTemperature"] as CalcGeneratorId[])
      for (const s of SEEDS) {
        const p = generate(id, s);
        expect(ok(p, { answer: p.answer, parts: parts(p) }).ok).toBe(true);
      }
  });
  it("answers inside the tolerance pass, outside fail", () => {
    const p = mk("ifr.timeSpeedDistance", "time");
    expect(ok(p, { answer: p.answer + p.tolerance * 0.9 }).ok).toBe(true);
    expect(ok(p, { answer: p.answer + p.tolerance * 1.5 + 1 }).ok).toBe(false);
  });
  it("hold: not tripling the outbound correction is named", () => {
    const p = mk("ifr.holdWind");
    const v = g(p);
    const wca = Math.asin((+v.windKt * Math.sin((+v.windDir - +v.inbound) * D)) / +v.tasKt) / D;
    const single = (((+v.inbound + 180 - wca) % 360) + 360) % 360;
    const r = ok(p, { answer: single, parts: parts(p) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("notTripled");
  });
  it("ADF: the reciprocal is named", () => {
    const p = mk("ifr.adfBearing", "qdm");
    const r = ok(p, { answer: (p.answer + 180) % 360 });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("reciprocal");
  });
  it("answer in the wrong unit: kt typed as km/h is converted, km/h answer typed as kt is named", () => {
    const p = mk("ifr.timeSpeedDistance", "speed");
    expect(ok(p, { answer: p.answer * 1.852, unit: "kmh" }).ok).toBe(true);
    const r = ok(p, { answer: Math.round(p.answer * 1.852) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("unit");
  });
  it("a factor slip (minutes for hours, x10) is named", () => {
    const p = mk("ifr.timeSpeedDistance", "distance");
    const r = ok(p, { answer: p.answer * 10 });
    expect(r.ok).toBe(false);
    expect(["factor", "unit"]).toContain(r.mistake?.id);
  });
  it("fuel without the reserve is named", () => {
    const p = mk("ifr.fuelReserve");
    const v = g(p);
    const noReserve = +v.taxi + +v.burn * ((+v.tripNm + +v.altNm) / +v.gsKt);
    const r = ok(p, { answer: Math.round(noReserve * 2) / 2, parts: parts(p) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("reserve");
  });
  it("cold temperature: subtracting instead of adding is named", () => {
    const p = mk("ifr.coldTemperature");
    const v = g(p);
    const r = ok(p, { answer: p.answer, parts: parts(p, { fly: +v.publishedFt - p.answer }) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("wrongSide");
  });
  it("density altitude: using 15 degrees instead of ISA at altitude is named", () => {
    let named = false;
    for (const s of SEEDS) {
      const p = generate("ifr.densityAltitude", s);
      const v = g(p);
      const wrong = +v.paFt + 120 * (+v.oatC - 15);
      if (Math.abs(wrong - p.answer) <= p.tolerance + 1) continue;
      const r = ok(p, { answer: wrong });
      expect(r.mistake?.id).toBe("isaReference");
      named = true;
    }
    expect(named).toBe(true);
  });
  it("wind components: sin and cos swapped, tail and head swapped", () => {
    let swaps = 0;
    for (const s of SEEDS) {
      const p = generate("ifr.windComponents", s);
      const v = g(p);
      const a = (+v.windDir - +v.rwyHdg) * D;
      const head = +v.windKt * Math.cos(a);
      if (Math.abs(Math.abs(head) - p.answer) > p.tolerance + 1) {
        const r = ok(p, { answer: Math.abs(head), parts: partsOf(p) });
        expect(r.mistake?.id).toBe("crossHeadSwap");
        swaps++;
      }
      if (Math.abs(head) > 4) {
        const r = ok(p, { answer: p.answer, parts: parts(p, { head: Math.round(-head) }) });
        expect(r.ok).toBe(false);
        expect(r.mistake?.id).toBe("headTailSwap");
      }
    }
    expect(swaps).toBeGreaterThan(10);
  });
  it("VOR: a wrong flag is reported on the flag part", () => {
    const p = mk("ifr.vorRadial", "centerTo");
    const flag = partsOf(p).flag === "TO" ? "FROM" : "TO";
    const r = ok(p, { answer: p.answer, parts: parts(p, { flag }) });
    expect(r.ok).toBe(false);
    expect(r.parts?.flag).toBe(false);
  });
});

describe("IFR properties", () => {
  it("60:1 rule against exact trigonometry: +4.7 % (60 against 57.3) at small angles, under 10 % up to 20 degrees", () => {
    for (let flown = 10; flown <= 120; flown += 5)
      for (let off = 0.5; off <= flown * Math.tan(20 * D); off += 0.5) {
        const exact = M.trackErrorExact(off, flown);
        const rule = M.trackErrorRule(off, flown);
        const rel = rule / exact - 1;
        expect(rel).toBeGreaterThan(0.04);
        expect(rel).toBeLessThan(0.1);
      }
    // the generator accepts BOTH the rule and the exact angle: the tolerance brackets them (never a trap for either method)
    for (const s of SEEDS) {
      const p = generate("ifr.sixtyToOne", s, { variant: "trackError" });
      const v = g(p);
      const rule = (60 * +v.offNm) / +v.flownNm;
      const exact = Math.atan2(+v.offNm, +v.flownNm) / D;
      expect(ok(p, { answer: rule }).ok).toBe(true);
      expect(ok(p, { answer: Math.round(exact * 10) / 10 }).ok).toBe(true);
    }
  });
  it("small-angle truth behind the rule: the sine of an angle up to 20 degrees is within 2 % of the angle in radians", () => {
    for (let a = 1; a <= 20; a++) expect(Math.abs(Math.sin(a * D) / (a * D) - 1)).toBeLessThan(0.021);
  });
  it("standard rate bank rule is within 2.7 degrees of the exact bank for 80-250 kt (2.2 for 90-180)", () => {
    for (let tas = 80; tas <= 250; tas += 5) expect(Math.abs(M.bankRule(tas) - M.bankForRate(tas))).toBeLessThan(2.7);
    for (let tas = 90; tas <= 180; tas += 5) expect(Math.abs(M.bankRule(tas) - M.bankForRate(tas))).toBeLessThan(2.2);
  });
  it("turn radius at a bank equals the radius at the rate that bank gives", () => {
    for (const tas of [90, 120, 160, 200])
      for (const bank of [15, 20, 25, 30]) {
        const rate = M.rateAtBank(tas, bank);
        expect(M.turnRadiusAtRateNm(tas, rate)).toBeCloseTo(M.turnRadiusNm(tas, bank), 6);
      }
  });
  it("head and cross components are consistent with vector maths", () => {
    for (let dir = 0; dir < 360; dir += 7)
      for (const kt of [5, 12, 25]) {
        const w = solveRunwayWind(90, dir, kt);
        expect(Math.hypot(w.head, w.cross)).toBeCloseTo(kt, 6);
        const c = M.windComponents(90, dir, kt);
        expect(c.head).toBeCloseTo(w.head, 6);
        expect(Math.abs(c.cross)).toBeCloseTo(w.cross, 6);
      }
  });
  it("clock-face rule is within a quarter of the wind of the exact crosswind", () => {
    for (let a = 0; a <= 90; a += 5) expect(Math.abs(M.clockFraction(a) - Math.sin(a * D))).toBeLessThan(0.14);
  });
  it("TOD rule (3 x thousands) is within 8 % of the exact 3 degree path; VS rule within 8 %", () => {
    for (let lose = 2000; lose <= 14000; lose += 1000) {
      const t = solveTod(lose + 1000, 1000, 120);
      expect(Math.abs(t.ruleNm - t.exactNm) / t.exactNm).toBeLessThan(0.08);
    }
    for (let gs = 70; gs <= 200; gs += 10) {
      const d = descentVs(gs, 3);
      expect(Math.abs(d.rule - d.exact) / d.exact).toBeLessThan(0.08);
    }
  });
  it("gradient conversions round-trip", () => {
    for (const a of [1.5, 2.5, 3, 4.5, 6]) expect(M.angleFromFtPerNm(M.ftPerNmFromAngle(a))).toBeCloseTo(a, 9);
    for (const p of [2, 3.3, 5, 8]) expect(M.pctFromFtPerNm(M.ftPerNmFromPct(p))).toBeCloseTo(p, 9);
  });
  it("DME arc lead rule is within 1.1 degree of the exact lead for 8-20 NM arcs at 90-180 kt", () => {
    for (const arc of [8, 10, 12, 15, 20])
      for (const gs of [90, 120, 150, 180]) {
        const a = solveArcLead(arc, gs);
        expect(Math.abs(a.leadDegRule - a.leadDegExact)).toBeLessThan(1.1);
      }
  });
  it("ISA and density altitude: no deviation, no correction", () => {
    for (const pa of [0, 2000, 6000, 10000]) expect(M.densityAltitudeRule(pa, M.isaTempRule(pa))).toBeCloseTo(pa, 6);
    for (const pa of [0, 3000, 8000]) expect(Math.abs(M.densityAltitudeExact(pa, M.isaTempC(pa)) - pa)).toBeLessThan(2);
  });
  it("TAS rule is within 4 % of the exact value for 100-180 kt below 10,000 ft near ISA", () => {
    for (const ias of [100, 140, 180])
      for (const pa of [2000, 5000, 8000, 10000]) {
        const exact = M.tasFromCas(ias, pa, M.isaTempC(pa));
        expect(Math.abs(M.tasRule(ias, pa) - exact) / exact).toBeLessThan(0.04);
      }
  });
  it("hold timing rule is within 7.5 s of exact for headwinds up to 25 kt at 90-160 kt", () => {
    for (const tas of [90, 120, 160]) for (const h of [0, 5, 10, 15, 20, 25]) {
      const t = holdOutboundSeconds(tas, h);
      expect(Math.abs(t.exact - t.rule)).toBeLessThan(7.5);
    }
  });
  it("same seed, same problem; another seed, other numbers; plain JSON", () => {
    for (const id of ["ifr.sixtyToOne", "ifr.holdWind", "ifr.descentRate", "ifr.coldTemperature"] as CalcGeneratorId[]) {
      const a = generate(id, 77);
      expect(generate(id, 77)).toEqual(a);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      const prompts = new Set(SEEDS.map((s) => generate(id, s).prompt.en));
      expect(prompts.size).toBeGreaterThan(40);
    }
  });
});

describe("hand-made literal problems (numbers worked out on paper)", () => {
  function literal(id: CalcGeneratorId, base: Record<string, string>, givens: Record<string, number | string>, answer: number, parts?: Record<string, number | string>): CalcProblem {
    const p = generate(id, 1, base);
    return {
      ...p,
      givens: Object.entries(givens).map(([key, value]) => ({ key, label: { en: key, fr: key }, value })),
      answer,
      parts: p.parts?.map((x) => ({ ...x, answer: parts?.[x.key] ?? x.answer })),
    };
  }
  it("time, speed, distance: 126 NM at 180 kt = 42 min; 32 min at 180 kt = 96 NM; 66 NM in 22 min = 180 kt", () => {
    expect(ok(literal("ifr.timeSpeedDistance", { variant: "time" }, { distNm: 126, gsKt: 180, variant: "time" }, 42), { answer: 42 }).ok).toBe(true);
    expect(ok(literal("ifr.timeSpeedDistance", { variant: "distance" }, { gsKt: 180, timeMin: 32, variant: "distance" }, 96), { answer: 96 }).ok).toBe(true);
    const sp = literal("ifr.timeSpeedDistance", { variant: "speed" }, { distNm: 66, timeMin: 22, variant: "speed" }, 180);
    expect(ok(sp, { answer: 180 }).ok).toBe(true);
    expect(ok(sp, { answer: 333, unit: "kmh" }).ok).toBe(true); // 180 kt = 333 km/h
    expect(ok(sp, { answer: 18 }).ok).toBe(false);
  });
  it("descent gradient: 300 ft/NM = 4.9 %, 3.8 % = 231 ft/NM, 2.8 degrees = 297 ft/NM", () => {
    expect(ok(literal("ifr.descentGradient", { variant: "ftNmToPct" }, { ftPerNm: 300, variant: "ftNmToPct" }, 4.9), { answer: 4.9 }).ok).toBe(true);
    expect(ok(literal("ifr.descentGradient", { variant: "pctToFtNm" }, { pct: 3.8, variant: "pctToFtNm" }, 231), { answer: 231 }).ok).toBe(true);
    const a = literal("ifr.descentGradient", { variant: "angleToFtNm" }, { angle: 2.8, variant: "angleToFtNm" }, 297);
    expect(ok(a, { answer: 297 }).ok).toBe(true);
    expect(ok(a, { answer: 2.8 * 318.4 / 3 + 200 }).ok).toBe(false);
  });
  it("climb gradient: 320 ft/NM at 90 kt needs 480 ft/min; 800 ft/min at 125 kt is 384 ft/NM", () => {
    const req = literal("ifr.climbGradient", { variant: "required" }, { gsKt: 90, reqFtNm: 320, rocFpm: 900, variant: "required" }, 480, { can: "yes" });
    expect(ok(req, { answer: 480, parts: { can: "yes" } }).ok).toBe(true);
    expect(ok(req, { answer: 480, parts: { can: "no" } }).ok).toBe(false);
    const ach = literal("ifr.climbGradient", { variant: "achievable" }, { gsKt: 125, reqFtNm: 290, rocFpm: 800, variant: "achievable" }, 384, { can: "yes" });
    expect(ok(ach, { answer: 384, parts: { can: "yes" } }).ok).toBe(true);
  });
  it("standard rate bank: 120 kt needs 19 degrees by the rule (18.2 exact); radius 0.64 NM", () => {
    const b = literal("ifr.standardRateBank", {}, { tasKt: 120 }, 19);
    expect(ok(b, { answer: 19 }).ok).toBe(true);
    expect(ok(b, { answer: 18 }).ok).toBe(true);
    expect(ok(b, { answer: 30 }).ok).toBe(false);
    const r = literal("ifr.turnRadius", { variant: "stdRate" }, { tasKt: 120, variant: "stdRate" }, 0.64, { diameter: 1.27 });
    expect(ok(r, { answer: 0.6, parts: { diameter: 1.3 } }).ok).toBe(true);
  });
  it("fuel with the 45 minute reserve: 200 NM + 60 NM alternate at 120 kt, 10 gph, 1.5 taxi = 30.7 -> 31 gal", () => {
    const f = literal("ifr.fuelReserve", {}, { tripNm: 200, altNm: 60, gsKt: 120, burn: 10, taxi: 1.5, rules: "faa" }, 31, { reserve: 7.5 });
    expect(ok(f, { answer: 31, parts: { reserve: 7.5 } }).ok).toBe(true);
    expect(ok(f, { answer: 23.5, parts: { reserve: 7.5 } }).mistake?.id).toBe("reserve");
  });
  it("visibility: RVR 2,400 = 1/2 SM; 1,200 ft = 366 m; 1 SM = 1,609 m", () => {
    expect(ok(literal("ifr.visibility", { variant: "rvrToSm" }, { rvrFt: 2400, variant: "rvrToSm" }, 0.5), { answer: 0.5 }).ok).toBe(true);
    expect(ok(literal("ifr.visibility", { variant: "ftToM" }, { ft: 1200, variant: "ftToM" }, 366), { answer: 366 }).ok).toBe(true);
    expect(ok(literal("ifr.visibility", { variant: "smToM" }, { sm: 1, variant: "smToM" }, 1609), { answer: 1609 }).ok).toBe(true);
  });
  it("holding speeds: FL210 FAA 265 kt; 6,000 ft FAA 200 kt; 16,000 ft ICAO 240 kt", () => {
    for (const [alt, rules, kt] of [[21000, "faa", 265], [6000, "faa", 200], [16000, "icao", 240]] as const) {
      const p = literal("ifr.holdSpeed", { rules }, { altFt: alt, rules }, kt);
      expect(ok(p, { answer: kt }).ok).toBe(true);
      expect(ok(p, { answer: kt - 5 }).ok).toBe(false);
    }
  });
  it("hold timing: 130 kt with an 18 kt inbound headwind = 45 s outbound; 1:00 out and 0:40 in = 1:20 out", () => {
    expect(ok(literal("ifr.holdTiming", { variant: "wind" }, { tasKt: 130, headKt: 18, variant: "wind" }, 45), { answer: 45 }).ok).toBe(true);
    expect(ok(literal("ifr.holdTiming", { variant: "observed" }, { inboundS: 40, variant: "observed" }, 80), { answer: 80 }).ok).toBe(true);
  });
  it("pressure and density altitude, TAS and cold correction on paper", () => {
    expect(ok(literal("ifr.pressureAltitude", { variant: "inHg" }, { elevFt: 3350, setting: 29.56, variant: "inHg" }, 3710), { answer: 3710 }).ok).toBe(true);
    expect(ok(literal("ifr.densityAltitude", {}, { paFt: 8000, oatC: 14 }, 9800), { answer: 9800 }).ok).toBe(true); // ISA −1 °C: +120 × 15 = +1,800
    expect(ok(literal("ifr.tasFromIas", { method: "rule" }, { iasKt: 100, paFt: 5000, oatC: 5, method: "rule" }, 110), { answer: 110 }).ok).toBe(true);
    const c = literal("ifr.coldTemperature", {}, { elevFt: 0, tempC: -20, publishedFt: 1500 }, 210, { fly: 1710 });
    expect(ok(c, { answer: 210, parts: { fly: 1710 } }).ok).toBe(true);
  });
});
