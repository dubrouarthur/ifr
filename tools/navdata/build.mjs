#!/usr/bin/env node
// Builds the real-world navigation database used by the simulator (no dependencies).
//
// Sources (both public domain):
//   * OurAirports  — airports, runways, frequencies, navaids worldwide  (https://ourairports.com/data/)
//   * FAA CIFP     — ARINC 424 navigation data for the United States: runways, ILS, waypoints and
//                    instrument approach procedures                      (https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/)
//
// Output (public/navdata/):
//   index.json            searchable airport list
//   tiles/<la>_<lo>.json  5°×5° tiles: airport details, navaids, waypoints
//   proc/<ICAO>.json      instrument approaches (US, from CIFP)
//   term/<ICAO>.json      SIDs and STARs (US, from CIFP): runway / common / enroute transitions
//   tiles: .aw = airway segments [route, from, lat, lon, to, lat, lon, MEA, level L/H/B] (US, from CIFP)
//
// Usage: node tools/navdata/build.mjs <dir with airports.csv runways.csv navaids.csv airport-frequencies.csv> [FAACIFP18]
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, cifpPath] = process.argv.slice(2);
if (!srcDir) {
  console.error('usage: build.mjs <ourairports-dir> [FAACIFP18]');
  process.exit(1);
}
const OUT = path.resolve('public/navdata');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'proc'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'term'), { recursive: true });

// ------------------------------------------------------------------ CSV
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const csv = (f) => parseCsv(fs.readFileSync(path.join(srcDir, f), 'utf8'));
const num = (s) => (s === '' || s == null ? null : Number(s));
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const tileKey = (lat, lon) => `${Math.floor(lat / 5) * 5}_${Math.floor(lon / 5) * 5}`;
const tiles = new Map();
const tile = (lat, lon) => {
  const k = tileKey(lat, lon);
  if (!tiles.has(k)) tiles.set(k, { airports: {}, navaids: [], fixes: [] });
  return tiles.get(k);
};

// ------------------------------------------------------------------ OurAirports
const HARD = /ASP|CON|PEM|BIT|PAV|ASPH|CONC|TAR|MAC|BITUM/i;
const airportsCsv = csv('airports.csv');
const runwaysCsv = csv('runways.csv');
const freqCsv = csv('airport-frequencies.csv');
const navaidsCsv = csv('navaids.csv');

const rwByApt = new Map();
for (const r of runwaysCsv) {
  if (r.closed === '1') continue;
  const len = num(r.length_ft);
  if (!len || len < 2000) continue;
  if (!r.le_latitude_deg || !r.he_latitude_deg) continue;
  if (!rwByApt.has(r.airport_ident)) rwByApt.set(r.airport_ident, []);
  rwByApt.get(r.airport_ident).push(r);
}
const freqByApt = new Map();
for (const f of freqCsv) {
  if (!freqByApt.has(f.airport_ident)) freqByApt.set(f.airport_ident, []);
  freqByApt.get(f.airport_ident).push(f);
}

const index = [];
const apts = new Map(); // icao -> detail (tile)
for (const a of airportsCsv) {
  if (!['large_airport', 'medium_airport', 'small_airport'].includes(a.type)) continue;
  const icao = (a.icao_code || a.gps_code || a.ident || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(icao)) continue;
  const rws = (rwByApt.get(a.ident) ?? []).filter((r) => HARD.test(r.surface) || a.type !== 'small_airport');
  if (!rws.length) continue;
  if (a.type === 'small_airport' && !rws.some((r) => num(r.length_ft) >= 3000 && HARD.test(r.surface))) continue;
  const lat = Number(a.latitude_deg), lon = Number(a.longitude_deg);
  const runways = rws.map((r) => ({
    ids: [r.le_ident, r.he_ident],
    len: num(r.length_ft),
    wid: num(r.width_ft) ?? 100,
    lit: r.lighted === '1',
    surf: r.surface,
    le: [r5(Number(r.le_latitude_deg)), r5(Number(r.le_longitude_deg)), num(r.le_elevation_ft) ?? num(a.elevation_ft) ?? 0, num(r.le_displaced_threshold_ft) ?? 0],
    he: [r5(Number(r.he_latitude_deg)), r5(Number(r.he_longitude_deg)), num(r.he_elevation_ft) ?? num(a.elevation_ft) ?? 0, num(r.he_displaced_threshold_ft) ?? 0],
  }));
  const fr = {};
  for (const f of freqByApt.get(a.ident) ?? []) {
    const t = f.type.toUpperCase();
    const mhz = Number(f.frequency_mhz);
    if (!mhz) continue;
    const key = /ATIS/.test(t) ? 'atis' : /APP|DEP|RDR/.test(t) ? 'approach' : /TWR/.test(t) ? 'tower' : /GND/.test(t) ? 'ground' : /CTAF|UNIC|AFIS|A\/G|INFO/.test(t) ? 'ctaf' : null;
    if (key && !fr[key]) fr[key] = mhz;
  }
  const d = { icao, name: a.name, city: a.municipality, country: a.iso_country, lat: r5(lat), lon: r5(lon), elev: num(a.elevation_ft) ?? 0, type: a.type, runways, freqs: fr, magVar: null };
  apts.set(icao, d);
}

for (const n of navaidsCsv) {
  const type = n.type.toUpperCase();
  const t = /VORTAC|VOR-DME|VOR\/DME/.test(type) ? 'VORDME' : /^VOR$/.test(type) ? 'VOR' : /NDB/.test(type) ? 'NDB' : /^TACAN$|^DME$/.test(type) ? null : null;
  if (!t) continue;
  const lat = Number(n.latitude_deg), lon = Number(n.longitude_deg);
  const freq = t === 'NDB' ? Number(n.frequency_khz) : Number(n.frequency_khz) / 1000;
  if (!freq) continue;
  tile(lat, lon).navaids.push({ id: n.ident, name: n.name, t, f: Math.round(freq * 100) / 100, lat: r5(lat), lon: r5(lon), elev: num(n.elevation_ft) ?? 0, dme: t === 'VORDME' || /DME/.test(type), mv: num(n.magnetic_variation_deg) });
}

// ------------------------------------------------------------------ CIFP (ARINC 424)
const procs = new Map(); // icao -> [approach]
const term = new Map(); // icao -> { sids, stars }
let nCifpWpt = 0, nCifpApp = 0, nSid = 0, nStar = 0, nAwSeg = 0;
if (cifpPath) {
  const lines = fs.readFileSync(cifpPath, 'latin1').split(/\r?\n/);
  const col = (l, a, b) => l.substring(a - 1, b); // 1-based inclusive
  const coord = (s) => {
    // N39515263 / W104404478
    if (!s || s.trim().length < 9) return null;
    const h = s[0];
    const isLat = h === 'N' || h === 'S';
    const deg = Number(s.substr(1, isLat ? 2 : 3));
    const min = Number(s.substr(isLat ? 3 : 4, 2));
    const sec = Number(s.substr(isLat ? 5 : 6, 4)) / 100;
    let v = deg + min / 60 + sec / 3600;
    if (h === 'S' || h === 'W') v = -v;
    return v;
  };
  const magVar = (s) => {
    // E0140 = 14.0° E (east positive)
    if (!s || !/[EWT]/.test(s[0])) return null;
    const v = Number(s.substr(1, 4)) / 10;
    return s[0] === 'W' ? -v : v;
  };
  const termWpt = new Map(); // `${icao}|${id}` -> [lat, lon]
  const enrWpt = new Map(); // `${id}|${region}` -> [lat, lon]
  const vhf = new Map(); // `${id}|${region}` -> navaid
  const ndb = new Map();
  const rwy = new Map(); // `${icao}|RW28R` -> {lat, lon, elev, brg, len, wid, tch, disp, loc}
  const locs = new Map(); // `${icao}|IGWQ` -> loc
  const cifpApt = new Map();
  const appRows = new Map(); // `${icao}|${proc}` -> rows
  const termRows = new Map(); // `D|${icao}|${proc}` (SID) / `E|…` (STAR) -> rows
  const awRows = new Map(); // airway id -> rows

  for (const l of lines) {
    if (l[0] !== 'S' || l.length < 120) continue;
    const sec = l[4];
    if (sec === 'P') {
      const icao = col(l, 7, 10).trim();
      const sub = l[12];
      if (sub === 'A') cifpApt.set(icao, { lat: coord(col(l, 33, 41)), lon: coord(col(l, 42, 51)), mv: magVar(col(l, 52, 56)), elev: Number(col(l, 57, 61)), name: col(l, 94, 123).trim() });
      else if (sub === 'G') {
        const id = col(l, 14, 18).trim();
        rwy.set(`${icao}|${id}`, { lat: coord(col(l, 33, 41)), lon: coord(col(l, 42, 51)), len: Number(col(l, 23, 27)), brg: Number(col(l, 28, 31)) / 10, elev: Number(col(l, 67, 71)), disp: Number(col(l, 72, 75)) || 0, tch: Number(col(l, 76, 77)) || 50, wid: Number(col(l, 78, 80)) || 150, loc: col(l, 82, 85).trim() });
      } else if (sub === 'I') {
        const id = col(l, 14, 17).trim();
        locs.set(`${icao}|${id}`, { id, freq: Number(col(l, 23, 27)) / 100, rwy: col(l, 28, 32).trim(), lat: coord(col(l, 33, 41)), lon: coord(col(l, 42, 51)), crs: Number(col(l, 52, 55)) / 10, gsLat: coord(col(l, 56, 64)), gsLon: coord(col(l, 65, 74)), gsAngle: Number(col(l, 88, 90)) / 100 || null, tch: Number(col(l, 96, 97)) || 50, gsElev: Number(col(l, 98, 102)) || 0 });
      } else if (sub === 'C') {
        const id = col(l, 14, 18).trim();
        const la = coord(col(l, 33, 41)), lo = coord(col(l, 42, 51));
        if (la !== null) termWpt.set(`${icao}|${id}`, [la, lo]);
      } else if (sub === 'N') {
        const id = col(l, 14, 17).trim();
        const la = coord(col(l, 33, 41)), lo = coord(col(l, 42, 51));
        if (la !== null) ndb.set(`${id}|${col(l, 20, 21)}`, { id, f: Number(col(l, 23, 27)) / 10, lat: la, lon: lo, name: col(l, 94, 123).trim() });
      } else if (sub === 'F') {
        const proc = col(l, 14, 19).trim();
        const k = `${icao}|${proc}`;
        if (!appRows.has(k)) appRows.set(k, []);
        appRows.get(k).push(l);
      } else if ((sub === 'D' || sub === 'E') && (l[38] === '0' || l[38] === '1')) {
        // SID (D) / STAR (E) primary records
        const proc = col(l, 14, 19).trim();
        const k = `${sub}|${icao}|${proc}`;
        if (!termRows.has(k)) termRows.set(k, []);
        termRows.get(k).push(l);
      }
    } else if (sec === 'E' && l[5] === 'R' && (l[38] === '0' || l[38] === '1')) {
      // enroute airway (V/T low, J/Q high): ordered fixes with MEA
      const route = col(l, 14, 18).trim();
      if (!awRows.has(route)) awRows.set(route, []);
      awRows.get(route).push({ seq: Number(col(l, 26, 29)), id: col(l, 30, 34).trim(), region: col(l, 35, 36), sect: col(l, 37, 38), level: l[45], mea: Number(col(l, 84, 88)) || null, desc: col(l, 40, 43) });
    } else if (sec === 'E' && l[5] === 'A') {
      const id = col(l, 14, 18).trim();
      const la = coord(col(l, 33, 41)), lo = coord(col(l, 42, 51));
      if (la !== null) enrWpt.set(`${id}|${col(l, 20, 21)}`, [la, lo]);
    } else if (sec === 'D') {
      const id = col(l, 14, 17).trim();
      const reg = col(l, 20, 21);
      if (l[5] === 'B') {
        const la = coord(col(l, 33, 41)), lo = coord(col(l, 42, 51));
        if (la !== null) ndb.set(`${id}|${reg}`, { id, f: Number(col(l, 23, 27)) / 10, lat: la, lon: lo, name: col(l, 94, 123).trim() });
      } else if (l[5] === ' ') {
        let la = coord(col(l, 33, 41)), lo = coord(col(l, 42, 51));
        const dla = coord(col(l, 56, 64)), dlo = coord(col(l, 65, 74));
        const isVor = la !== null;
        if (!isVor) { la = dla; lo = dlo; }
        if (la === null) continue;
        vhf.set(`${id}|${reg}`, { id, f: Number(col(l, 23, 27)) / 100, cls: col(l, 28, 32), lat: la, lon: lo, dme: dla !== null, vor: isVor, mv: magVar(col(l, 75, 79)), elev: Number(col(l, 80, 84)) || 0, name: col(l, 94, 123).trim() });
      }
    }
  }

  // enroute + terminal waypoints into tiles (terminal ones also per airport, below)
  for (const [k, [la, lo]] of enrWpt) {
    tile(la, lo).fixes.push([k.split('|')[0], r5(la), r5(lo)]);
    nCifpWpt++;
  }
  // CIFP navaids replace OurAirports' in the US (precise, with declination)
  for (const n of vhf.values()) if (n.vor && n.f >= 108 && n.f <= 118) tile(n.lat, n.lon).navaids.push({ id: n.id, name: n.name, t: n.dme ? 'VORDME' : 'VOR', f: n.f, lat: r5(n.lat), lon: r5(n.lon), elev: n.elev, dme: n.dme, mv: n.mv, src: 'cifp' });
  for (const n of ndb.values()) tile(n.lat, n.lon).navaids.push({ id: n.id, name: n.name, t: 'NDB', f: n.f, lat: r5(n.lat), lon: r5(n.lon), elev: 0, dme: false, src: 'cifp' });

  // airport details from CIFP (precise thresholds, LOC, mag var)
  for (const [icao, a] of cifpApt) {
    const d = apts.get(icao);
    if (!d) continue;
    d.magVar = a.mv;
    d.cifp = true;
    // terminal waypoints of the airport
    d.wpts = [];
    for (const [k, [la, lo]] of termWpt) if (k.startsWith(icao + '|')) d.wpts.push([k.split('|')[1], r5(la), r5(lo)]);
    // ILS / LOC
    d.ils = [];
    for (const [k, L] of locs) if (k.startsWith(icao + '|')) d.ils.push({ id: L.id, f: L.freq, rwy: L.rwy.replace(/^RW/, ''), lat: r5(L.lat), lon: r5(L.lon), crs: L.crs, gs: L.gsAngle, gsLat: L.gsLat === null ? null : r5(L.gsLat), gsLon: L.gsLon === null ? null : r5(L.gsLon), tch: L.tch });
    // precise thresholds
    d.rwCifp = {};
    for (const [k, R] of rwy) if (k.startsWith(icao + '|')) d.rwCifp[k.split('|')[1].replace(/^RW/, '')] = { lat: r5(R.lat), lon: r5(R.lon), elev: R.elev, brg: R.brg, len: R.len, wid: R.wid, tch: R.tch, disp: R.disp };
  }

  // ---------------------------------------------------------------- approaches
  const fixPos = (icao, id, sect, region) => {
    if (sect === 'PC') return termWpt.get(`${icao}|${id}`);
    if (sect === 'EA') return enrWpt.get(`${id}|${region}`);
    if (sect === 'D ') { const n = vhf.get(`${id}|${region}`); return n ? [n.lat, n.lon] : undefined; }
    if (sect === 'DB' || sect === 'PN') { const n = ndb.get(`${id}|${region}`); return n ? [n.lat, n.lon] : undefined; }
    if (sect === 'PG') { const r = rwy.get(`${icao}|${id}`); return r ? [r.lat, r.lon] : undefined; }
    if (sect === 'PI') { const L = locs.get(`${icao}|${id}`); return L ? [L.lat, L.lon] : undefined; }
    return termWpt.get(`${icao}|${id}`) ?? enrWpt.get(`${id}|${region}`);
  };
  const kindOf = (sect) => (sect === 'D ' ? 'vor' : sect === 'DB' || sect === 'PN' ? 'ndb' : sect === 'PG' ? 'runway' : 'fix');
  const TYPE = { I: 'ILS', L: 'LOC', B: 'LOCBC', R: 'RNAV', H: 'RNAV', P: 'RNAV', V: 'VOR', D: 'VOR', S: 'VOR', N: 'NDB', Q: 'NDB', X: 'LDA', U: 'LOC' };
  const NAME = { I: 'ILS', L: 'LOC', B: 'LOC BC', R: 'RNAV (GPS)', H: 'RNAV (RNP)', P: 'GPS', V: 'VOR', D: 'VOR/DME', S: 'VOR', N: 'NDB', Q: 'NDB/DME', X: 'LDA', U: 'SDF' };

  for (const [k, rows] of appRows) {
    const [icao, proc] = k.split('|');
    if (!apts.has(icao)) continue;
    const t = proc[0];
    if (!TYPE[t]) continue;
    const m = /^[A-Z]([0-9]{2}[LRC]?)(?:-?([A-Z]))?$/.exec(proc);
    if (!m) continue; // circling-only procedures (e.g. VOR-A) skipped for now
    const rw = m[1];
    const suffix = m[2] && !/^[LRC]$/.test(m[2]) ? m[2] : proc.length > 3 && /[Y-Z]$/.test(proc) ? proc.slice(-1) : '';
    const legs = rows.map((l) => {
      const id = col(l, 30, 34).trim();
      const sect = col(l, 37, 38);
      const region = col(l, 35, 36);
      const pos = id ? fixPos(icao, id, sect, region) : undefined;
      const altD = l[82];
      const a1 = Number(col(l, 85, 89)) || null;
      const a2 = Number(col(l, 90, 94)) || null;
      const course = col(l, 71, 74).trim() ? Number(col(l, 71, 74)) / 10 : null;
      const distRaw = col(l, 75, 78);
      return {
        route: l[19],
        trans: col(l, 21, 25).trim(),
        seq: Number(col(l, 27, 29)),
        id, pos, kind: kindOf(sect),
        desc: col(l, 40, 43),
        turn: l[43] === 'L' || l[43] === 'R' ? l[43] : null,
        pt: col(l, 48, 49),
        nav: col(l, 51, 54).trim(),
        rho: col(l, 67, 70).trim() ? Number(col(l, 67, 70)) / 10 : null,
        course,
        dist: distRaw[0] === 'T' ? { min: Number(distRaw.slice(1)) / 10 } : distRaw.trim() ? { nm: Number(distRaw) / 10 } : null,
        altD, a1, a2,
        vpa: col(l, 103, 106).trim() ? Number(col(l, 103, 106)) / -100 : null,
        center: col(l, 107, 111).trim(),
      };
    });
    const alt = (L) => {
      if (!L.a1) return {};
      if (L.altD === '+' || L.altD === 'H' || L.altD === 'J' || L.altD === 'G' || L.altD === 'V') return { altMin: L.a1 };
      if (L.altD === '-') return { altMax: L.a1 };
      if (L.altD === 'B') return { altMin: Math.min(L.a1, L.a2 ?? L.a1), altMax: Math.max(L.a1, L.a2 ?? L.a1) };
      return { altMin: L.a1, altMax: L.a1 };
    };
    const toLeg = (L, role) => {
      if (!L.pos) return null;
      const o = { fix: { ident: L.id, lat: r5(L.pos[0]), lon: r5(L.pos[1]), kind: L.kind }, ...alt(L) };
      if (role) o.role = role;
      if (L.course !== null) o.course = L.course;
      if (L.dist?.nm) o.dist = L.dist.nm;
      if (L.pt === 'HF' || L.pt === 'HM' || L.pt === 'HA') o.hold = { inbound: L.course ?? 0, turn: L.turn ?? 'R', legMin: L.dist?.min ?? 1, legNm: L.dist?.nm };
      if (L.pt === 'HF') o.hilpt = true;
      if (L.pt === 'AF' && L.nav && L.rho) o.arc = { center: L.nav, radius: L.rho, dir: L.turn ?? 'R' };
      if (L.pt === 'PI') o.pt = { outbound: L.course ?? 0, side: L.turn === 'L' ? 'L' : 'R', withinNm: L.dist?.nm ?? 10 };
      return o;
    };
    const finalRows = rows === undefined ? [] : legs.filter((L) => L.route !== 'A' && L.route !== 'Z');
    const iMap = finalRows.findIndex((L) => L.desc[3] === 'M');
    if (iMap < 0) continue;
    const fin = [], mis = [];
    finalRows.forEach((L, i) => {
      if (i <= iMap) {
        const role = L.desc[3] === 'F' ? 'FAF' : L.desc[3] === 'M' ? 'MAP' : L.desc[3] === 'I' || L.desc[3] === 'B' ? 'IF' : L.desc[3] === 'A' ? 'IAF' : undefined;
        const leg = toLeg(L, role);
        if (leg) fin.push(leg);
      } else {
        const leg = toLeg(L, i === finalRows.length - 1 && /^H/.test(L.pt) ? 'MAHP' : undefined);
        if (leg) mis.push(leg);
      }
    });
    if (fin.length < 2 || !fin.some((l) => l.role === 'FAF') || fin[fin.length - 1].role !== 'MAP') continue;
    const trans = new Map();
    for (const L of legs.filter((x) => x.route === 'A')) {
      if (!trans.has(L.trans)) trans.set(L.trans, []);
      const leg = toLeg(L, L.desc[3] === 'A' || L.desc[3] === 'C' || L.desc[3] === 'D' ? 'IAF' : undefined);
      if (leg) trans.get(L.trans).push(leg);
    }
    const d = apts.get(icao);
    const ils = (d.ils ?? []).find((x) => x.rwy === rw);
    const navId = finalRows.find((L) => L.nav)?.nav;
    const mapRow = finalRows[iMap];
    const name = `${NAME[t]}${suffix ? ' ' + suffix : ''} RWY ${rw}`;
    const final = fin[fin.length - 1];
    const finalCourse = finalRows[iMap].course ?? fin[fin.length - 2]?.course ?? (d.rwCifp?.[rw]?.brg ?? 0);
    const ap = {
      id: `${icao}-${proc}`,
      airport: icao,
      name,
      type: TYPE[t],
      category: t === 'I' ? 'Precision' : t === 'R' || t === 'H' ? 'APV' : 'Non-precision',
      runway: rw,
      finalCourse,
      navaid: t === 'I' || t === 'L' || t === 'B' || t === 'X' || t === 'U' ? (ils?.id ?? navId) : t === 'R' || t === 'H' || t === 'P' ? undefined : navId,
      transitions: [...trans].filter(([, l]) => l.length).map(([n, l]) => ({ name: n, legs: l })),
      final: fin,
      missed: [final, ...mis],
      gsAngle: t === 'I' ? (ils?.gs ?? 3) : mapRow.vpa ?? undefined,
      tch: d.rwCifp?.[rw]?.tch ?? 50,
      source: 'FAA CIFP',
    };
    if (!procs.has(icao)) procs.set(icao, []);
    procs.get(icao).push(ap);
    nCifpApp++;
  }

  // ---------------------------------------------------------------- airways
  // each airway is split into segments between consecutive fixes (a new sequence block, or an end-of-route
  // description code 'E' in col 40, starts a new chain); segments go to the tile of each end
  for (const [route, rows] of awRows) {
    rows.sort((a, b) => a.seq - b.seq);
    let prev = null;
    for (const r of rows) {
      const pos = fixPos('', r.id, r.sect === 'D ' ? 'D ' : r.sect === 'DB' ? 'DB' : 'EA', r.region) ?? enrWpt.get(`${r.id}|${r.region}`);
      if (!pos) { prev = null; continue; }
      const cur = { id: r.id, lat: r5(pos[0]), lon: r5(pos[1]), mea: r.mea, level: r.level, kind: r.sect === 'D ' ? 'vor' : r.sect === 'DB' ? 'ndb' : 'fix' };
      if (prev) {
        const seg = [route, prev.id, prev.lat, prev.lon, cur.id, cur.lat, cur.lon, prev.mea ?? cur.mea ?? 0, prev.level || ' '];
        const t1 = tile(prev.lat, prev.lon), t2 = tile(cur.lat, cur.lon);
        (t1.aw ??= []).push(seg);
        if (t2 !== t1) (t2.aw ??= []).push(seg);
        nAwSeg++;
      }
      prev = r.desc[1] === 'E' ? null : cur; // end of a continuous route section
    }
  }

  // ---------------------------------------------------------------- SIDs / STARs
  // ARINC 424 route types — SID: 1/4/F runway transition, 2/5/M common route, 3/6/S/V enroute transition;
  // STAR: 1/4/F enroute transition, 2/5/M common route, 3/6/S runway transition (7/8/9 profile descents).
  const SID_ROLE = { 0: null, 1: 'rwy', 4: 'rwy', F: 'rwy', T: 'rwy', 2: 'common', 5: 'common', M: 'common', 3: 'enr', 6: 'enr', S: 'enr', V: 'enr' };
  const STAR_ROLE = { 1: 'enr', 4: 'enr', F: 'enr', 7: 'enr', 2: 'common', 5: 'common', M: 'common', 8: 'common', 3: 'rwy', 6: 'rwy', S: 'rwy', 9: 'rwy' };
  for (const [k, rows] of termRows) {
    const [sub, icao, proc] = k.split('|');
    if (!apts.has(icao)) continue;
    const roles = sub === 'D' ? SID_ROLE : STAR_ROLE;
    const groups = new Map(); // `${role}|${trans}` -> legs
    rows.sort((a, b) => a[19].localeCompare(b[19]) || col(a, 21, 25).localeCompare(col(b, 21, 25)) || Number(col(a, 27, 29)) - Number(col(b, 27, 29)));
    for (const l of rows) {
      const role = roles[l[19]];
      if (!role) continue;
      const trans = col(l, 21, 25).trim() || 'ALL';
      const id = col(l, 30, 34).trim();
      const sect = col(l, 37, 38);
      const pos = id ? fixPos(icao, id, sect, col(l, 35, 36)) : undefined;
      const pt = col(l, 48, 49);
      const altD = l[82];
      const a1 = Number(col(l, 85, 89)) || null;
      const a2 = Number(col(l, 90, 94)) || null;
      const course = col(l, 71, 74).trim() ? Number(col(l, 71, 74)) / 10 : null;
      const spd = Number(col(l, 100, 102)) || null;
      const leg = {};
      if (pos) leg.fix = { ident: id, lat: r5(pos[0]), lon: r5(pos[1]), kind: kindOf(sect) };
      else if (/^(V[AIMDR]|C[AIDFR]|FM)$/.test(pt)) leg.vec = { pt, course }; // heading / course legs (no fix)
      else continue;
      if (a1) {
        if (altD === '+' ) leg.altMin = a1;
        else if (altD === '-') leg.altMax = a1;
        else if (altD === 'B') { leg.altMin = Math.min(a1, a2 ?? a1); leg.altMax = Math.max(a1, a2 ?? a1); }
        else if (altD === ' ' || altD === '@') { leg.altMin = a1; leg.altMax = a1; }
        else leg.altMin = a1;
      }
      if (spd) leg.speed = spd;
      if (pt === 'HM' || pt === 'HF' || pt === 'HA') leg.hold = { inbound: course ?? 0, turn: l[43] === 'L' ? 'L' : 'R', legMin: 1 };
      const gk = `${role}|${trans}`;
      if (!groups.has(gk)) groups.set(gk, []);
      const g = groups.get(gk);
      if (leg.fix && g.length && g[g.length - 1].fix?.ident === leg.fix.ident) Object.assign(g[g.length - 1], leg);
      else g.push(leg);
    }
    const pick = (role) => [...groups].filter(([gk]) => gk.startsWith(role + '|')).map(([gk, legs]) => ({ name: gk.split('|')[1], legs }));
    const common = pick('common')[0]?.legs ?? [];
    const entry = { id: proc, rwy: pick('rwy'), common, enr: pick('enr') };
    if (!entry.rwy.length && !common.length && !entry.enr.length) continue;
    if (!term.has(icao)) term.set(icao, { sids: [], stars: [] });
    term.get(icao)[sub === 'D' ? 'sids' : 'stars'].push(entry);
    if (sub === 'D') nSid++; else nStar++;
  }
}

// ------------------------------------------------------------------ write
for (const d of apts.values()) {
  const t = tile(d.lat, d.lon);
  const { icao, ...rest } = d;
  t.airports[icao] = rest;
  index.push([icao, d.name, d.city, d.country, d.lat, d.lon, d.elev, (d.type === 'large_airport' ? 2 : d.type === 'medium_airport' ? 1 : 0) | (procs.has(icao) ? 4 : 0) | (d.ils?.length ? 8 : 0) | (term.has(icao) ? 16 : 0)]);
}
index.sort((a, b) => (b[7] & 3) - (a[7] & 3) || a[0].localeCompare(b[0]));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
for (const [k, t] of tiles) fs.writeFileSync(path.join(OUT, 'tiles', `${k}.json`), JSON.stringify(t));
for (const [icao, list] of procs) fs.writeFileSync(path.join(OUT, 'proc', `${icao}.json`), JSON.stringify(list));
for (const [icao, t] of term) fs.writeFileSync(path.join(OUT, 'term', `${icao}.json`), JSON.stringify(t));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ built: new Date().toISOString(), airports: index.length, tiles: tiles.size, cifpWaypoints: nCifpWpt, cifpApproaches: nCifpApp, sids: nSid, stars: nStar, airwaySegments: nAwSeg, sources: ['OurAirports (public domain)', cifpPath ? 'FAA CIFP (public domain)' : null].filter(Boolean) }));
console.log(`airports ${index.length} · tiles ${tiles.size} · waypoints ${nCifpWpt} · approaches ${nCifpApp} (${procs.size} airports) · SIDs ${nSid} · STARs ${nStar} (${term.size} airports) · airway segments ${nAwSeg}`);
