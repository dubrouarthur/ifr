// ATIS text and runway-in-use (pure: no UI dependencies, safe to import anywhere).
import type { Weather } from '../sim/environment';
import { components } from '../sim/wind';
import { AIRPORTS, APPROACHES } from '../nav/data';

const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');
const PHON = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike'];

/** Runway best aligned with the wind at an airport. */
export function runwayInUse(icao: string, w: Weather) {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  return [...a.runways].sort((x, y) => components(w.windDir, w.windKt, y.heading).head - components(w.windDir, w.windKt, x.heading).head)[0];
}

export function atisText(icao: string, w: Weather, letterIdx = 0): string {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  const rw = runwayInUse(icao, w);
  const ap = APPROACHES.find((x) => x.airport === icao && x.runway === rw.id && (x.type === 'ILS' || x.type === 'RNAV')) ?? APPROACHES.find((x) => x.airport === icao && x.runway === rw.id);
  const wind = w.windKt < 3 ? 'wind calm' : `wind ${pad3(w.windDir)} at ${Math.round(w.windKt)}${w.gustKt > w.windKt + 3 ? `, gusts ${Math.round(w.gustKt)}` : ''}`;
  const vis = w.visibilitySm >= 10 ? 'visibility 10' : `visibility ${w.visibilitySm < 1 ? (w.visibilitySm === 0.5 ? 'one half' : w.visibilitySm === 0.25 ? 'one quarter' : w.visibilitySm === 0.75 ? 'three quarters' : w.visibilitySm) : w.visibilitySm}`;
  const sky = w.ceilingFt >= 15000 ? 'sky clear' : `ceiling ${Math.round(w.ceilingFt / 100) * 100} overcast`;
  const t = Math.round(w.oatSeaLevelC - (a.elevFt / 1000) * 2);
  const shear = w.shearKt && w.shearKt > 5 ? ' Low level wind shear advisories in effect.' : '';
  return `${a.name} information ${PHON[letterIdx % PHON.length]}. ${wind}. ${vis}. ${sky}. Temperature ${t}, altimeter ${w.qnh.toFixed(2)}. ${ap ? `${ap.name} approach in use` : `Runway ${rw.id} in use`}.${shear} Advise on initial contact you have information ${PHON[letterIdx % PHON.length]}.`;
}
