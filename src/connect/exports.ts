// Open-format exports so flights and plans can be used in EFBs and other simulators.
import type { FlightPlan, Waypoint } from '../nav/flightplan';
import type { Sample } from '../sim/recorder';
import { findFix } from '../nav/data';
import { toReal } from '../nav/world';
/** simulator → real coordinates (real-world regions are rotated to magnetic north) */
const R = (p: { lat: number; lon: number }) => toReal(p);

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const ident = (w: Waypoint) => w.ident.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'WPT';
const kind = (w: Waypoint): { garmin: string; xp: number } => {
  const f = findFix(w.ident);
  if (f?.kind === 'airport') return { garmin: 'AIRPORT', xp: 1 };
  if (f?.kind === 'vor') return { garmin: 'VOR', xp: 3 };
  if (f?.kind === 'ndb') return { garmin: 'NDB', xp: 2 };
  return { garmin: 'USER WAYPOINT', xp: 28 };
};
const plan = (fp: FlightPlan) => fp.wpts.filter((w, i, a) => i === 0 || w.ident !== a[i - 1].ident);

/** Garmin FPL v1 (Garmin Pilot, ForeFlight, Garmin GTN/G1000 import). */
export function garminFpl(fp: FlightPlan, name = 'IFR TRAINER'): string {
  const wps = plan(fp);
  const table = [...new Map(wps.map((w) => [ident(w), w])).values()]
    .map((w) => `  <waypoint><identifier>${esc(ident(w))}</identifier><type>${kind(w).garmin}</type><country-code></country-code><lat>${R(w).lat.toFixed(6)}</lat><lon>${R(w).lon.toFixed(6)}</lon><comment>${esc(w.ident)}</comment></waypoint>`)
    .join('\n');
  const route = wps.map((w) => `    <route-point><waypoint-identifier>${esc(ident(w))}</waypoint-identifier><waypoint-type>${kind(w).garmin}</waypoint-type><waypoint-country-code></waypoint-country-code></route-point>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">
 <created>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</created>
 <waypoint-table>
${table}
 </waypoint-table>
 <route>
  <route-name>${esc(name)}</route-name>
  <flight-plan-index>1</flight-plan-index>
${route}
 </route>
</flight-plan>
`;
}

/** X-Plane 11/12 .fms flight plan. */
export function xplaneFms(fp: FlightPlan, cruiseFt = 5000): string {
  const wps = plan(fp);
  const lines = wps.map((w) => `${kind(w).xp} ${ident(w)} DRCT ${(w.altMin ?? cruiseFt).toFixed(6)} ${R(w).lat.toFixed(6)} ${R(w).lon.toFixed(6)}`);
  return `I\n1100 Version\nCYCLE 2611\nADEP ${ident(wps[0])}\nADES ${ident(wps[wps.length - 1])}\nNUMENR ${wps.length}\n${lines.join('\n')}\n`;
}

const dms = (v: number, pos: string, neg: string) => {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = ((a - d) * 60 - m) * 60;
  return `${v >= 0 ? pos : neg}${d}° ${m}' ${s.toFixed(2)}"`;
};

/** Microsoft Flight Simulator .pln */
export function msfsPln(fp: FlightPlan, cruiseFt = 5000): string {
  const wps = plan(fp);
  const pt = (w: Waypoint) => `${dms(R(w).lat, 'N', 'S')},${dms(R(w).lon, 'E', 'W')},+${String(Math.round(w.altMin ?? cruiseFt)).padStart(6, '0')}.00`;
  const items = wps
    .map((w) => `        <ATCWaypoint id="${esc(ident(w))}">\n            <ATCWaypointType>${kind(w).garmin === 'AIRPORT' ? 'Airport' : kind(w).garmin === 'VOR' ? 'VOR' : kind(w).garmin === 'NDB' ? 'NDB' : 'User'}</ATCWaypointType>\n            <WorldPosition>${pt(w)}</WorldPosition>\n        </ATCWaypoint>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<SimBase.Document Type="AceXML" version="1,0">
    <Descr>AceXML Document</Descr>
    <FlightPlan.FlightPlan>
        <Title>${esc(ident(wps[0]))} to ${esc(ident(wps[wps.length - 1]))}</Title>
        <FPType>IFR</FPType>
        <CruisingAlt>${cruiseFt}</CruisingAlt>
        <DepartureID>${esc(ident(wps[0]))}</DepartureID>
        <DestinationID>${esc(ident(wps[wps.length - 1]))}</DestinationID>
${items}
    </FlightPlan.FlightPlan>
</SimBase.Document>
`;
}

export function routeGpx(fp: FlightPlan): string {
  const wps = plan(fp);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="IFR Trainer" xmlns="http://www.topografix.com/GPX/1/1">
 <rte><name>IFR Trainer route</name>
${wps.map((w) => `  <rtept lat="${R(w).lat.toFixed(6)}" lon="${R(w).lon.toFixed(6)}"><name>${esc(w.ident)}</name>${w.altMin ? `<ele>${(w.altMin * 0.3048).toFixed(0)}</ele>` : ''}</rtept>`).join('\n')}
 </rte>
</gpx>
`;
}

/** GPX track of the recorded flight (CloudAhoy, ForeFlight, Google Earth…). */
export function trackGpx(samples: Sample[], startIso: string, name = 'IFR Trainer flight'): string {
  const t0 = Date.parse(startIso);
  const s0 = samples[0]?.t ?? 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="IFR Trainer" xmlns="http://www.topografix.com/GPX/1/1">
 <trk><name>${esc(name)}</name><trkseg>
${samples.map((s) => `  <trkpt lat="${R(s).lat.toFixed(6)}" lon="${R(s).lon.toFixed(6)}"><ele>${(s.alt * 0.3048).toFixed(1)}</ele><time>${new Date(t0 + (s.t - s0) * 1000).toISOString()}</time><course>${s.hdg.toFixed(0)}</course></trkpt>`).join('\n')}
 </trkseg></trk>
</gpx>
`;
}

export function trackKml(samples: Sample[], name = 'IFR Trainer flight'): string {
  const coords = samples.map((s) => `${R(s).lon.toFixed(6)},${R(s).lat.toFixed(6)},${(s.alt * 0.3048).toFixed(1)}`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>
<Style id="trk"><LineStyle><color>ffff40ff</color><width>3</width></LineStyle><PolyStyle><color>40ff40ff</color></PolyStyle></Style>
<Placemark><name>${esc(name)}</name><styleUrl>#trk</styleUrl><LineString><extrude>1</extrude><tessellate>1</tessellate><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>
</Document></kml>
`;
}

export function trackCsv(samples: Sample[]): string {
  const head = 't_s,lat,lon,alt_ft,agl_ft,ias_kt,vs_fpm,hdg,bank,pitch,lat_dots,vert_dots,ap,phase';
  return [head, ...samples.map((s) => [s.t.toFixed(1), R(s).lat.toFixed(6), R(s).lon.toFixed(6), Math.round(s.alt), Math.round(s.agl), s.ias.toFixed(1), Math.round(s.vs), Math.round(s.hdg), s.bank.toFixed(1), s.pitch.toFixed(1), s.latDots?.toFixed(2) ?? '', s.vertDots?.toFixed(2) ?? '', s.ap ? 1 : 0, s.phase].join(','))].join('\n');
}

export function download(text: string, name: string, type = 'application/octet-stream') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
