// The wet compass reads what its tilted card shows (src/avionics/steam.ts compassReading): northerly turning error
// (lags turning from north, leads through south: « UNOS / ANDS ») and acceleration error on east/west headings
// (« ANDS »: accelerate, it shows north). FAA IFH ch. 5; EASA ATPL 022.
import { describe, expect, it } from "vitest";
import { compassReading } from "../src/avionics/steam";

const err = (hdg: number, bank: number, acc = 0) => {
  let e = compassReading(hdg, bank, acc) - hdg;
  if (e > 180) e -= 360;
  if (e < -180) e += 360;
  return e;
};
describe("wet compass errors", () => {
  it("wings level, steady: reads the heading", () => {
    for (const h of [0, 45, 90, 180, 270, 333]) expect(Math.abs(err(h, 0))).toBeLessThan(0.01);
  });
  it("standard-rate turn near north: lags by about 25–35°, the wrong way", () => {
    expect(err(0, -15)).toBeGreaterThan(20); // left turn from north: the card first shows a turn to the right
    expect(err(0, -15)).toBeLessThan(40);
    expect(err(0, 15)).toBeLessThan(-20);
  });
  it("through south: leads in the direction of the turn", () => {
    expect(err(185, -15)).toBeLessThan(-20); // left turn: the card is ahead (a smaller heading)
    expect(err(175, 15)).toBeGreaterThan(20);
  });
  it("through east or west: agrees within a few degrees", () => {
    expect(Math.abs(err(270, -15))).toBeLessThan(3);
    expect(Math.abs(err(90, 15))).toBeLessThan(3);
  });
  it("accelerating on east or west shows a turn to the north; slowing, to the south", () => {
    expect(err(90, 0, 2)).toBeLessThan(-3);
    expect(err(270, 0, 2)).toBeGreaterThan(3);
    expect(err(90, 0, -2)).toBeGreaterThan(3);
    expect(Math.abs(err(0, 0, 2))).toBeLessThan(0.5);
  });
});
