// Teaser — the flights the instruments show. Each shot owns a real Sim (the app's flight model, autopilot and
// avionics), advanced in fixed 1/120 s steps to the film time it is asked for: the six-pack, the HSI and the PFD
// are drawn from the aircraft's state at that time, never from the wall clock, so the needles agree with each other
// (bank, turn rate and heading come out of the same flight model) and a frame is the same on every render.
import { Sim, SCENARIOS } from "../../src/sim/sim";
import { applyScene } from "../../src/course/scene";
import { demoScene } from "../../src/course/canvas/factory";
import {
  newInstrumentStates,
  type InstrumentStates,
} from "../../src/course/stage/views";

export const STEP = 1 / 120;

export interface Flight {
  sim: Sim;
  st: InstrumentStates;
  /** sim steps done */
  n: number;
  /** film time (s, local to the flight) the instruments were last drawn at (PFD trend memory) */
  drawnAt: number;
}

export interface FlightSpec {
  build(): Sim;
  /** called before each step with the flight's time (s) */
  script?(sim: Sim, t: number): void;
  /** sim seconds per film second (a gentle time-lapse where the motion is slow) */
  rate?: number;
}

const calm = (sim: Sim) => {
  // no wind at any height: the winds aloft default to a veered, stronger copy of the surface wind (sim/wind.ts)
  Object.assign(sim.weather, {
    windKt: 0,
    gustKt: 0,
    turbulence: 0,
    aloft: [
      { altFt: 3000, dir: 360, kt: 0 },
      { altFt: 9000, dir: 360, kt: 0 },
    ],
  });
};

export class Track {
  f!: Flight;
  constructor(private spec: FlightSpec) {
    this.reset();
  }
  reset() {
    const sim = this.spec.build();
    this.f = { sim, st: newInstrumentStates(), n: 0, drawnAt: 0 };
  }
  /** Bring the aircraft to film time t (s); going back rebuilds the flight from its start. */
  at(t: number): Flight {
    const rate = this.spec.rate ?? 1;
    const target = Math.max(0, Math.round((t * rate) / STEP));
    if (target < this.f.n) this.reset();
    const { sim } = this.f;
    while (this.f.n < target) {
      this.spec.script?.(sim, this.f.n * STEP);
      sim.step(STEP);
      this.f.n++;
    }
    return this.f;
  }
}

/** The six-pack turn (shot 2): ARD R-276, 4,000 ft, 100 kt, autopilot in HDG and ALT, the bug set 90° right at `turnAt`. */
export function sixPackTurn(turnAt: number): FlightSpec {
  return {
    build() {
      const sim = new Sim();
      applyScene(sim, demoScene("steam"));
      calm(sim);
      sim.ap.hdgBug = 120;
      sim.ap.toggleAp(sim.ac.data);
      sim.ap.pressHdg(sim.ac.data);
      sim.ap.pressAlt(sim.ac.data);
      // settle the trim and the autopilot before the film starts
      for (let i = 0; i < 120 * 20; i++) sim.step(STEP);
      return sim;
    },
    script(sim, t) {
      if (t >= turnAt && sim.ap.hdgBug === 120) sim.ap.hdgBug = 210;
    },
  };
}

/** The heading knob (shot 3): wings level on 090, the student turns the bug; `bug(t)` is where the knob has it. */
export function knobTurn(bug: (t: number) => number, rate = 1): FlightSpec {
  return {
    rate,
    build() {
      const sim = new Sim();
      applyScene(sim, demoScene("steam"));
      calm(sim);
      sim.ac.s.psi = (90 * Math.PI) / 180;
      sim.ap.hdgBug = 90;
      sim.ap.toggleAp(sim.ac.data);
      sim.ap.pressHdg(sim.ac.data);
      sim.ap.pressAlt(sim.ac.data);
      for (let i = 0; i < 120 * 20; i++) sim.step(STEP);
      return sim;
    },
    script(sim, t) {
      sim.ap.hdgBug = Math.round(bug(t / rate));
    },
  };
}

/** The ILS (shot 4): ILS RWY 27 at PARD, vectors to final, APR armed; flown until established on the localizer
 *  and the glideslope, then filmed coming down it. */
export function ilsFinal(rate = 1): FlightSpec {
  return {
    rate,
    build() {
      const sc = SCENARIOS.find((s) => s.id === "ils27-vtf")!;
      const sim = new Sim(sc);
      calm(sim);
      sim.reposition("final10");
      sim.controls.throttle = 0.42;
      sim.setCdi("NAV1");
      sim.ap.toggleAp(sim.ac.data);
      sim.ap.pressHdg(sim.ac.data);
      sim.ap.pressAlt(sim.ac.data);
      sim.ap.pressApr(sim.ac.data, sim.navInputs());
      for (let i = 0; i < 120 * 70; i++) sim.step(STEP);
      return sim;
    },
  };
}

/** The slide's situation flown in the cockpit (shot C): ARD R-276, 4,000 ft, 100 kt, heading `hdg`, `bankDeg` to the
 *  right held by the autopilot in ROL, ALT hold: the turn the author set on the slide, now flying. */
export function slideSituation(hdg: number, bankDeg: number): FlightSpec {
  return {
    build() {
      const sim = new Sim();
      applyScene(sim, demoScene("g1000"));
      // the slide's own weather (its wind), without gusts or turbulence
      Object.assign(sim.weather, { gustKt: 0, turbulence: 0 });
      sim.ap.hdgBug = hdg;
      sim.ac.s.psi = (hdg * Math.PI) / 180;
      sim.ac.s.phi = (bankDeg * Math.PI) / 180;
      sim.step(STEP);
      sim.ac.s.phi = (bankDeg * Math.PI) / 180;
      sim.step(STEP);
      sim.ap.toggleAp(sim.ac.data);
      sim.ap.pressAlt(sim.ac.data);
      sim.ap.rollRef = bankDeg;
      sim.ap.bankCmd = bankDeg;
      sim.ac.s.psi = (hdg * Math.PI) / 180;
      return sim;
    },
  };
}
