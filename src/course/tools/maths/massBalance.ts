// Teaching tools — mass and balance of the training aeroplane (Part-FCL 031 "Mass and balance", PPL 031).
// The sample loading table of the calc engine (calc/vfr/performance.ts: WB, solveWb — arms from POH C172S §6
// "Weight and balance": front seats 37 in, rear 73 in, baggage area 1 95 in, fuel 48 in, 6 lb per US gal, 53 US gal
// usable) and the CG envelope of stage/diagramMath.ts (POH §6 "Center of gravity limits": normal category forward
// 35.0 in up to 1,950 lb then a straight line to 41.0 in at 2,550 lb, aft 47.3 in; utility category 2,200 lb max,
// aft 40.5 in). The empty aeroplane is a sample (1,663 lb, arm 39.4 in): always the aeroplane's own weighing report.
import { solveWb, WB, type WbResult } from "../../calc/vfr/performance";
import { checkCg, type CgCategory } from "../../stage/diagramMath";

export interface WbInput {
  front: number;
  rear: number;
  bag: number;
  fuelGal: number;
  /** fuel burnt in flight, US gal (the landing point) */
  burnGal: number;
}
export interface WbPoint {
  weight: number;
  cg: number;
  normal: boolean;
  utility: boolean;
  /** why it is outside the normal envelope */
  reason: "ok" | "overweight" | "forward" | "aft";
}
export interface WbState {
  takeoff: WbPoint;
  landing: WbPoint;
  rows: WbResult["rows"];
  /** a station limit broken (baggage 120 lb, fuel 53 gal) */
  stationOver: WbResult["stationOver"];
  burnGal: number;
}
const point = (r: WbResult): WbPoint => {
  const n = checkCg(r.weight, r.moment, "normal");
  const u = checkCg(r.weight, r.moment, "utility" as CgCategory);
  return {
    weight: r.weight,
    cg: r.cg,
    normal: n.inside,
    utility: u.inside,
    reason: n.reason,
  };
};
export function massBalance(i: WbInput): WbState {
  const burn = Math.max(0, Math.min(i.burnGal, i.fuelGal));
  const to = solveWb({
    front: i.front,
    rear: i.rear,
    bag1: i.bag,
    bag2: 0,
    fuelGal: i.fuelGal,
  });
  const ldg = solveWb({
    front: i.front,
    rear: i.rear,
    bag1: i.bag,
    bag2: 0,
    fuelGal: i.fuelGal - burn,
  });
  return {
    takeoff: point(to),
    landing: point(ldg),
    rows: to.rows,
    stationOver: to.stationOver,
    burnGal: burn,
  };
}
export { WB };
