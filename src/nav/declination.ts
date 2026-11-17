// Magnetic declination (variation) from the World Magnetic Model 2025 (NOAA/NCEI and BGS, public domain), degree 12,
// evaluated at a date. Used for a real field whose data set carries no published variation (no CIFP): a navaid's
// station declination can be decades old (TSU near LFPN: 1.1° W, while today's variation is about 1.7° E), and a QFU
// taught from it would be wrong by 3°. Accuracy at the surface is a fraction of a degree away from the poles.

/** WMM2025 Gauss coefficients: n, m, g, h (nT), ġ, ḣ (nT/yr), epoch 2025.0 */
// prettier-ignore
const WMM2025: readonly number[] = [
  1, 0, -29351.8, 0.0, 12.0, 0.0, 1, 1, -1410.8, 4545.4, 9.7, -21.5,
  2, 0, -2556.6, 0.0, -11.6, 0.0, 2, 1, 2951.1, -3133.6, -5.2, -27.7, 2, 2, 1649.3, -815.1, -8.0, -12.1,
  3, 0, 1361.0, 0.0, -1.3, 0.0, 3, 1, -2404.1, -56.6, -4.2, 4.0, 3, 2, 1243.8, 237.5, 0.4, -0.3,
  3, 3, 453.6, -549.5, -15.6, -4.1,
  4, 0, 895.0, 0.0, -1.6, 0.0, 4, 1, 799.5, 278.6, -2.4, -1.1, 4, 2, 55.7, -133.9, -6.0, 4.1,
  4, 3, -281.1, 212.0, 5.6, 1.6, 4, 4, 12.1, -375.6, -7.0, -4.4,
  5, 0, -233.2, 0.0, 0.6, 0.0, 5, 1, 368.9, 45.4, 1.4, -0.5, 5, 2, 187.2, 220.2, 0.0, 2.2,
  5, 3, -138.7, -122.9, 0.6, 0.4, 5, 4, -142.0, 43.0, 2.2, 1.7, 5, 5, 20.9, 106.1, 0.9, 1.9,
  6, 0, 64.4, 0.0, -0.2, 0.0, 6, 1, 63.8, -18.4, -0.4, 0.3, 6, 2, 76.9, 16.8, 0.9, -1.6,
  6, 3, -115.7, 48.8, 1.2, -0.4, 6, 4, -40.9, -59.8, -0.9, 0.9, 6, 5, 14.9, 10.9, 0.3, 0.7,
  6, 6, -60.7, 72.7, 0.9, 0.9,
  7, 0, 79.5, 0.0, -0.0, 0.0, 7, 1, -77.0, -48.9, -0.1, 0.6, 7, 2, -8.8, -14.4, -0.1, 0.5,
  7, 3, 59.3, -1.0, 0.5, -0.8, 7, 4, 15.8, 23.4, -0.1, 0.0, 7, 5, 2.5, -7.4, -0.8, -1.0,
  7, 6, -11.1, -25.1, -0.8, 0.6, 7, 7, 14.2, -2.3, 0.8, -0.2,
  8, 0, 23.2, 0.0, -0.1, 0.0, 8, 1, 10.8, 7.1, 0.2, -0.2, 8, 2, -17.5, -12.6, 0.0, 0.5,
  8, 3, 2.0, 11.4, 0.5, -0.4, 8, 4, -21.7, -9.7, -0.1, 0.4, 8, 5, 16.9, 12.7, 0.3, -0.5,
  8, 6, 15.0, 0.7, 0.2, -0.6, 8, 7, -16.8, -5.2, -0.0, 0.3, 8, 8, 0.9, 3.9, 0.2, 0.2,
  9, 0, 4.6, 0.0, -0.0, 0.0, 9, 1, 7.8, -24.8, -0.1, -0.3, 9, 2, 3.0, 12.2, 0.1, 0.3,
  9, 3, -0.2, 8.3, 0.3, -0.3, 9, 4, -2.5, -3.3, -0.3, 0.3, 9, 5, -13.1, -5.2, 0.0, 0.2,
  9, 6, 2.4, 7.2, 0.3, -0.1, 9, 7, 8.6, -0.6, -0.1, -0.2, 9, 8, -8.7, 0.8, 0.1, 0.4,
  9, 9, -12.9, 10.0, -0.1, 0.1,
  10, 0, -1.3, 0.0, 0.1, 0.0, 10, 1, -6.4, 3.3, 0.0, 0.0, 10, 2, 0.2, 0.0, 0.1, -0.0,
  10, 3, 2.0, 2.4, 0.1, -0.2, 10, 4, -1.0, 5.3, -0.0, 0.1, 10, 5, -0.6, -9.1, -0.3, -0.1,
  10, 6, -0.9, 0.4, 0.0, 0.1, 10, 7, 1.5, -4.2, -0.1, 0.0, 10, 8, 0.9, -3.8, -0.1, -0.1,
  10, 9, -2.7, 0.9, -0.0, 0.2, 10, 10, -3.9, -9.1, -0.0, -0.0,
  11, 0, 2.9, 0.0, 0.0, 0.0, 11, 1, -1.5, 0.0, -0.0, -0.0, 11, 2, -2.5, 2.9, 0.0, 0.1,
  11, 3, 2.4, -0.6, 0.0, -0.0, 11, 4, -0.6, 0.2, 0.0, 0.1, 11, 5, -0.1, 0.5, -0.1, -0.0,
  11, 6, -0.6, -0.3, 0.0, -0.0, 11, 7, -0.1, -1.2, -0.0, 0.1, 11, 8, 1.1, -1.7, -0.1, -0.0,
  11, 9, -1.0, -2.9, -0.1, 0.0, 11, 10, -0.2, -1.8, -0.1, 0.0, 11, 11, 2.6, -2.3, -0.1, 0.0,
  12, 0, -2.0, 0.0, 0.0, 0.0, 12, 1, -0.2, -1.3, 0.0, -0.0, 12, 2, 0.3, 0.7, -0.0, 0.0,
  12, 3, 1.2, 1.0, -0.0, -0.1, 12, 4, -1.3, -1.4, -0.0, 0.1, 12, 5, 0.6, -0.0, -0.0, -0.0,
  12, 6, 0.6, 0.6, 0.1, -0.0, 12, 7, 0.5, -0.1, -0.0, -0.0, 12, 8, -0.1, 0.8, 0.0, 0.0,
  12, 9, -0.4, 0.1, 0.0, -0.0, 12, 10, -0.2, -1.0, -0.1, -0.0, 12, 11, -1.3, 0.1, -0.0, 0.0,
  12, 12, -0.7, 0.2, -0.1, -0.1,
];
const N = 12;
const EPOCH = 2025.0;
const DEG = Math.PI / 180;

/** a date as a decimal year (2026-11-17 → 2026.88) */
export function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const t0 = Date.UTC(y, 0, 1),
    t1 = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - t0) / (t1 - t0);
}

/**
 * Magnetic declination in degrees, + east (the sign of Airport.magVar), at a point on the surface (WGS-84 geodetic
 * latitude and longitude, altitude in ft) and a date. The model is valid 2025–2030; outside that the secular change is
 * extrapolated a little and then held.
 */
export function declinationDeg(
  lat: number,
  lon: number,
  when: Date = new Date(),
  altFt = 0,
): number {
  const dt = Math.max(-1, Math.min(7, decimalYear(when) - EPOCH));
  // geodetic → geocentric (WGS-84), as the WMM report does it
  const a = 6378.137,
    b = 6356.7523142,
    re = 6371.2;
  const a2 = a * a,
    b2 = b * b,
    c2 = a2 - b2,
    a4 = a2 * a2,
    b4 = b2 * b2,
    c4 = a4 - b4;
  const alt = (altFt * 0.3048) / 1000;
  const slat = Math.sin(lat * DEG),
    clat = Math.cos(lat * DEG);
  const slat2 = slat * slat,
    clat2 = clat * clat;
  const q = Math.sqrt(a2 - c2 * slat2);
  const q1 = alt * q;
  const q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = slat / Math.sqrt(q2 * clat2 + slat2); // cos of geocentric colatitude
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const r = Math.sqrt(alt * alt + 2 * q1 + (a4 - c4 * slat2) / (q * q));
  const d = Math.sqrt(a2 * clat2 + b2 * slat2);
  const ca = (alt + d) / r,
    sa = (c2 * clat * slat) / (r * d);
  // Gauss-normalised associated Legendre functions P[n][m](cos θ) and dP/dθ, then Schmidt factors
  const P: number[][] = [],
    dP: number[][] = [],
    S: number[][] = [];
  for (let n = 0; n <= N; n++) {
    P.push(new Array(N + 1).fill(0));
    dP.push(new Array(N + 1).fill(0));
    S.push(new Array(N + 1).fill(0));
  }
  P[0][0] = 1;
  S[0][0] = 1;
  for (let n = 1; n <= N; n++) {
    S[n][0] = (S[n - 1][0] * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++)
      S[n][m] =
        S[n][m - 1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        P[n][m] = st * P[n - 1][m - 1];
        dP[n][m] = st * dP[n - 1][m - 1] + ct * P[n - 1][m - 1];
      } else {
        const K =
          n > 1 ? ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3)) : 0;
        const p2 = n >= 2 ? P[n - 2][m] : 0,
          d2 = n >= 2 ? dP[n - 2][m] : 0;
        P[n][m] = ct * P[n - 1][m] - K * p2;
        dP[n][m] = ct * dP[n - 1][m] - st * P[n - 1][m] - K * d2;
      }
    }
  }
  const lam = lon * DEG;
  let X = 0,
    Y = 0,
    Z = 0;
  for (let i = 0; i < WMM2025.length; i += 6) {
    const n = WMM2025[i],
      m = WMM2025[i + 1];
    const g = (WMM2025[i + 2] + dt * WMM2025[i + 4]) * S[n][m];
    const h = (WMM2025[i + 3] + dt * WMM2025[i + 5]) * S[n][m];
    const ar = (re / r) ** (n + 2);
    const cm = Math.cos(m * lam),
      sm = Math.sin(m * lam);
    X += ar * (g * cm + h * sm) * dP[n][m];
    Y += st > 1e-9 ? (ar * m * (g * sm - h * cm) * P[n][m]) / st : 0;
    Z -= ar * (n + 1) * (g * cm + h * sm) * P[n][m];
  }
  // geocentric → geodetic north component (the vertical tilts by the geocentric/geodetic latitude difference)
  const Xg = X * ca + Z * sa;
  return Math.atan2(Y, Xg) / DEG;
}
