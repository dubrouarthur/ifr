// Magnetic declination from the World Magnetic Model 2025 (nav/declination.ts): the variation a real field without a
// published one (no CIFP) is drawn in, so its QFU is today's and not an old station declination's.
import { describe, expect, it } from "vitest";
import { decimalYear, declinationDeg } from "../src/nav/declination";

describe("declinationDeg (WMM2025)", () => {
  const at = new Date("2025-01-01T00:00:00Z");
  it("matches the model's published values within a few tenths, east positive", () => {
    // Paris area about 1.8° E at the model's epoch, growing about 0.2° a year
    expect(declinationDeg(48.75, 2.11, at)).toBeGreaterThan(1.5);
    expect(declinationDeg(48.75, 2.11, at)).toBeLessThan(2.1);
    // San Francisco about 13° E, New York about 12.7° W, Tokyo about 7.9° W, Sydney about 12.8° E
    expect(declinationDeg(37.62, -122.38, at)).toBeCloseTo(12.9, 0);
    expect(declinationDeg(40.64, -73.78, at)).toBeCloseTo(-12.7, 0);
    expect(declinationDeg(35.55, 139.78, at)).toBeCloseTo(-7.9, 0);
    expect(declinationDeg(-33.9, 151.2, at)).toBeCloseTo(12.8, 0);
  });
  it("moves with the date (secular change) and holds beyond the model's span", () => {
    const later = declinationDeg(48.75, 2.11, new Date("2026-11-17T00:00:00Z"));
    expect(later - declinationDeg(48.75, 2.11, at)).toBeGreaterThan(0.15);
    expect(later - declinationDeg(48.75, 2.11, at)).toBeLessThan(0.5);
    const far = declinationDeg(48.75, 2.11, new Date("2045-01-01T00:00:00Z"));
    expect(far).toBe(
      declinationDeg(48.75, 2.11, new Date("2032-01-01T00:00:00Z")),
    );
    expect(decimalYear(new Date("2026-07-02T12:00:00Z"))).toBeCloseTo(
      2026.5,
      2,
    );
  });
});
