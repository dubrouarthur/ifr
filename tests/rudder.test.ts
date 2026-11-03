// Rudder in flight: the nose yaws at once (sideslip), the ball moves out, dihedral rolls the aircraft
// into the yaw, and the nose realigns with the flight path when the rudder is released.
import { it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';

it('full rudder in cruise yaws the nose, slips, rolls; release realigns', () => {
  const sim = new Sim();
  sim.load(SCENARIOS.find((s) => s.id === 'ils27-vtf')!);
  Object.assign(sim.weather, { turbulence: 0, windKt: 0, gustKt: 0 });
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  const h0 = sim.ac.data.hdgTrue;
  const dh = () => ((sim.ac.data.hdgTrue - h0 + 540) % 360) - 180;
  for (let i = 0; i < 60; i++) { sim.controls.rudder = 1; sim.step(1 / 60); }
  expect(dh()).toBeGreaterThan(6); // nose yawed right within 1 s
  expect(sim.ac.data.slip).toBeLessThan(-0.5); // ball out (skid)
  for (let i = 0; i < 120; i++) { sim.controls.rudder = 1; sim.step(1 / 60); }
  expect(sim.ac.data.rollDeg).toBeGreaterThan(2); // dihedral: rolls into the yaw
  const hdgMinusTrk = () => ((sim.ac.data.hdgTrue - sim.ac.data.trackTrue + 540) % 360) - 180;
  expect(hdgMinusTrk()).toBeGreaterThan(5);
  for (let i = 0; i < 120; i++) { sim.controls.rudder = 0; sim.step(1 / 60); }
  expect(Math.abs(hdgMinusTrk())).toBeLessThan(2.5); // nose back on the flight path
});
