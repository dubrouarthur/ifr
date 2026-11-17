// AIP corrections over the generated navdata (aip-corrections.json): an airport's reference point, elevation,
// variation, frequencies, runway ends (with displaced thresholds) and ILS, as read in the official AIP. Shared by
// build.mjs (applied before the files are written) and apply-corrections.mjs (patches the files already built).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CORRECTIONS = JSON.parse(fs.readFileSync(path.join(HERE, 'aip-corrections.json'), 'utf8'));

/** Apply one airport's correction to its tile entry (in place); returns the entry. */
export function correctAirport(d, c) {
  for (const k of ['name', 'lat', 'lon', 'elev', 'magVar']) if (c[k] !== undefined) d[k] = c[k];
  if (c.freqs) d.freqs = { ...d.freqs, ...c.freqs };
  for (const r of c.runways ?? []) {
    const cur = d.runways.find((x) => x.ids[0] === r.ids[0] && x.ids[1] === r.ids[1]);
    if (cur) Object.assign(cur, r);
    else d.runways.push({ lit: true, surf: 'ASP', ...r });
  }
  if (c.ils) d.ils = c.ils.map((x) => ({ ...x }));
  return d;
}
/** The index row of a corrected airport: [icao, name, city, country, lat, lon, elev, flags] (ILS flag 8). */
export function correctIndexRow(row, c) {
  if (c.name !== undefined) row[1] = c.name;
  if (c.lat !== undefined) row[4] = c.lat;
  if (c.lon !== undefined) row[5] = c.lon;
  if (c.elev !== undefined) row[6] = c.elev;
  if (c.ils?.length) row[7] |= 8;
  return row;
}
