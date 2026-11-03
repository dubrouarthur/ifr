import { it } from 'vitest';
import { AIRPORTS, groundElevation, terrainProviderActive } from '../src/nav/data';
it('elev', () => {
  const a = AIRPORTS.find((x) => x.icao === 'PARD')!;
  const out: string[] = [];
  for (let k = 0; k < 40; k++) out.push(groundElevation({ lat: a.lat + 0.12, lon: a.lon + k * 0.002 }).toFixed(1));
  console.log(terrainProviderActive(), a.lat, a.lon, out.join(' '));
});
