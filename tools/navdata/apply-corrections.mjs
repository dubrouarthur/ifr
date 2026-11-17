#!/usr/bin/env node
// Apply tools/navdata/aip-corrections.json to the navdata already generated in public/navdata (the full build
// needs the OurAirports and CIFP downloads; build.mjs applies the same corrections itself).
// Usage: node tools/navdata/apply-corrections.mjs
import fs from 'node:fs';
import path from 'node:path';
import { CORRECTIONS, correctAirport, correctIndexRow } from './corrections.mjs';

const OUT = path.resolve('public/navdata');
const tileKey = (lat, lon) => `${Math.floor(lat / 5) * 5}_${Math.floor(lon / 5) * 5}`;
const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
for (const [icao, c] of Object.entries(CORRECTIONS.airports)) {
  const row = index.find((r) => r[0] === icao);
  if (!row) throw new Error(`${icao}: not in the index`);
  const oldKey = tileKey(row[4], row[5]);
  const file = path.join(OUT, 'tiles', `${oldKey}.json`);
  const tile = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = tile.airports[icao];
  if (!d) throw new Error(`${icao}: not in tile ${oldKey}`);
  const { source: _s, ...fix } = c;
  correctAirport(d, fix);
  if (tileKey(d.lat, d.lon) !== oldKey) throw new Error(`${icao}: the corrected point moves to another tile`);
  correctIndexRow(row, fix);
  fs.writeFileSync(file, JSON.stringify(tile));
  console.log(`${icao}: corrected (${oldKey})`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
