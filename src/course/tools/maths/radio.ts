// Teaching tools — VOR and ADF (Part-FCL 062 radio navigation, PPL 062 / 022).
//   • radial = the magnetic bearing FROM the station (QDR); QDM = radial + 180 (the bearing TO the station);
//   • the VOR indicator: FROM flag when the selected course (OBS) is within 90° of the radial the aircraft is on,
//     TO flag otherwise; the needle shows the course deviation, full scale ±10°, 2° per dot on a 5-dot scale (FAA
//     Instrument Flying Handbook ch. 9 "VOR", "Course deviation indicator"). The indication does not depend on the
//     heading (FAA IFH ch. 9: "the VOR is not heading-sensitive");
//   • the ADF: relative bearing RB = QDM − magnetic heading; MB = MH + RB (FAA IFH ch. 9 "ADF").
export const wrap360 = (a: number): number => ((a % 360) + 360) % 360;
/** the signed difference a − b in −180..180 */
export const diff180 = (a: number, b: number): number => {
  const d = wrap360(a - b);
  return d > 180 ? d - 360 : d;
};
export const VOR_FULL_SCALE = 10;
export const VOR_DEG_PER_DOT = 2;

export interface RadioState {
  radial: number;
  qdm: number;
  flag: "TO" | "FROM";
  /** course deviation, deg (+: the course is to the right — fly right), clamped to full scale */
  deviation: number;
  /** the same before the clamp: past ±10° the needle is against its stop (« en butée ») */
  raw: number;
  /** the same, in dots (±5) */
  dots: number;
  /** ADF relative bearing, deg clockwise from the nose */
  rb: number;
  /** on course (within half a dot) */
  centred: boolean;
}
export function radioState(
  radial: number,
  obs: number,
  heading: number,
): RadioState {
  const r = wrap360(radial);
  const from = Math.abs(diff180(obs, r)) <= 90;
  const raw = from ? diff180(obs, r) : diff180(r + 180, obs);
  const deviation = Math.max(-VOR_FULL_SCALE, Math.min(VOR_FULL_SCALE, raw));
  const qdm = wrap360(r + 180);
  return {
    radial: r,
    qdm,
    flag: from ? "FROM" : "TO",
    deviation,
    raw,
    dots: deviation / VOR_DEG_PER_DOT,
    rb: wrap360(qdm - heading),
    centred: Math.abs(raw) <= VOR_DEG_PER_DOT / 2,
  };
}
