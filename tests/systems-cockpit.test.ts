// systems-cockpit: what the cockpit displays show for the aircraft systems (G1000 EIS and annunciation window,
// dark screens, reversionary PFD, steam gauges, airliner flags) and the systems panel's control logic (master
// interlock, magneto key, mixture, fuel selector, status strip, gauges strip). Drawing is checked with a
// recording canvas: the texts each display writes.
import { describe, expect, it, vi } from "vitest";
import { SCENARIOS, Sim } from "../src/sim/sim";
import { ANNUNCIATOR_LEVEL } from "../src/sim/systemsTypes";
import { setLang } from "../src/ui/i18n";
import {
  acknowledgePfdAlerts,
  casMessages,
  drawPfd,
  newPfdState,
  updatePfdFilters,
} from "../src/avionics/pfd";
import { drawMfd, eisReadings, newMfdState } from "../src/avionics/mfd";
import {
  drawSixPack,
  drawStack,
  STEAM_ANNUNCIATORS,
} from "../src/avionics/steam";
import { drawAirlinerPfd, drawNd } from "../src/avionics/airliner";
import {
  airDataShown,
  hasPower,
  panelShake,
  smokeHaze,
  vacuumGyro,
} from "../src/avionics/gauges";
import {
  gaugeStrip,
  mixtureStep,
  MIX_STEP,
  panelSummary,
  setFuelSelector,
  setMagnetos,
  stepMagnetos,
  toggleControl,
} from "../src/ui/systemsPanel";

vi.setConfig({ testTimeout: 30_000 });

function calm(s: Sim) {
  Object.assign(s.weather, {
    windKt: 0,
    gustKt: 0,
    turbulence: 0,
    shearKt: 0,
    ceilingFt: 20000,
    visibilitySm: 10,
  });
  s.weather.aloft = [{ altFt: 3000, dir: 270, kt: 0 }];
}
/** 5500 ft cruise, calm */
function cruise(): Sim {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "free")!);
  calm(s);
  return s;
}
/** advance the systems only (the aircraft holds its state): battery discharge, vacuum spin-down, oil… */
function systemsFor(s: Sim, sec: number, dt = 0.5) {
  for (let t = 0; t < sec; t += dt) {
    s.time += dt;
    s.systems.step(dt, s);
  }
  s.updateAvionics(0);
}

/** canvas stand-in recording the texts drawn (and how many) */
function textCtx() {
  const texts: string[] = [];
  const state: Record<string, unknown> = { fillStyle: "#000", canvas: null };
  const grad = { addColorStop: () => undefined };
  const api: Record<string, unknown> = {
    fillText: (t: string) => texts.push(String(t)),
    measureText: (t: string) => ({
      width: String(t).length * 8,
      actualBoundingBoxAscent: 6,
      actualBoundingBoxDescent: 6,
    }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    getTransform: () => ({}),
  };
  const ctx = new Proxy(state, {
    get: (t, k: string) =>
      k in api ? api[k] : k in t ? t[k] : () => undefined,
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}
const mfdState = () => {
  const st = newMfdState();
  st.terrain = false;
  return st;
};

describe("G1000 EIS readings (pure)", () => {
  it("a healthy aircraft reads green/white: 28 V, charging, 5 inHg, oil in the green", () => {
    const s = cruise();
    systemsFor(s, 5);
    const e = eisReadings(s);
    expect(e.mBus.value).toBeCloseTo(28, 0);
    expect(e.mBus.level).toBe("normal");
    expect(e.mBatt.value).toBeGreaterThanOrEqual(-0.5);
    expect(e.vac.value).toBeGreaterThan(4.5);
    expect(e.vac.level).toBe("normal");
    expect(e.oilP.level).toBe("normal");
    expect(e.oilT.level).toBe("normal");
    expect(e.fuelL.value + e.fuelR.value).toBeCloseTo(s.ac.s.fuelGal, 1);
    for (const r of Object.values(e)) {
      expect(r.frac).toBeGreaterThanOrEqual(0);
      expect(r.frac).toBeLessThanOrEqual(1);
      expect(r.text).not.toMatch(/NaN|undefined/);
    }
  });
  it("alternator failure: bus volts red below 24.5 V, battery amps amber (discharging)", () => {
    const s = cruise();
    s.setFailure("alternator", true);
    systemsFor(s, 300);
    const e = eisReadings(s);
    expect(e.mBus.value).toBeLessThan(24.5);
    expect(e.mBus.level).toBe("warning");
    expect(e.mBatt.value).toBeLessThan(-0.5);
    expect(e.mBatt.level).toBe("caution");
    expect(e.mBatt.text.startsWith("−")).toBe(true);
  });
  it("vacuum failure: suction amber below the LOW VACUUM threshold; oil pressure loss: red below 20 psi", () => {
    const s = cruise();
    s.setFailure("vacuum", true);
    s.setFailure("oilPressure", true);
    systemsFor(s, 120);
    const e = eisReadings(s);
    expect(e.vac.value).toBeLessThan(3);
    expect(e.vac.level).toBe("caution");
    // the EIS colour and the annunciator agree (both below 3.5 inHg)
    expect(s.sys.annunciators).toContain("LOW VACUUM");
    expect(e.oilP.value).toBeLessThan(20);
    expect(e.oilP.level).toBe("warning");
  });
  it("a low fuel tank reads amber, an empty one red", () => {
    const s = cruise();
    s.systems.setTanks(s, 5, 1);
    systemsFor(s, 1);
    const e = eisReadings(s);
    expect(e.fuelL.level).toBe("caution");
    expect(e.fuelR.level).toBe("warning");
  });
});

describe("G1000 annunciation window (pure)", () => {
  it("lists warnings first; a warning flashes until acknowledged, a caution is steady", () => {
    const s = cruise();
    s.setFailure("vacuum", true);
    s.setFailure("alternator", true);
    s.setFailure("gps", true);
    systemsFor(s, 30);
    const st = newPfdState();
    const cas = casMessages(s, st.ackAnn);
    const texts = cas.map((m) => m.text);
    expect(texts).toContain("LOW VOLTS");
    expect(texts).toContain("LOW VACUUM");
    expect(texts).toContain("GPS LOI");
    expect(texts.indexOf("LOW VOLTS")).toBeLessThan(
      texts.indexOf("LOW VACUUM"),
    );
    const volts = cas.find((m) => m.text === "LOW VOLTS")!;
    expect(volts.level).toBe("warning");
    expect(volts.flash).toBe(true);
    const vac = cas.find((m) => m.text === "LOW VACUUM")!;
    expect(vac.level).toBe("caution");
    expect(vac.flash).toBe(false);
    acknowledgePfdAlerts(s, st);
    expect(st.ackAnn).toContain("LOW VOLTS");
    expect(
      casMessages(s, st.ackAnn).find((m) => m.text === "LOW VOLTS")!.flash,
    ).toBe(false);
  });
  it("colours follow ANNUNCIATOR_LEVEL for every annunciator", () => {
    const s = cruise();
    // no FIRE, DOOR or FUEL PRESS annunciation exists on a C172S: these failures light nothing
    s.setFailure("engineFire", true);
    s.setFailure("door", true);
    s.setFailure("fuelPump", true);
    s.setSwitch("auxPump", false);
    systemsFor(s, 8);
    expect(casMessages(s).filter((m) => m.level !== "advisory")).toEqual([]);
    s.setFailure("engineFire", false);
    s.setFailure("door", false);
    s.setFailure("fuelPump", false);
    s.setFailure("alternator", true);
    s.setFailure("vacuum", true);
    s.systems.setTanks(s, 3, 3);
    systemsFor(s, 8);
    expect(casMessages(s).filter((m) => m.level !== "advisory").length).toBeGreaterThanOrEqual(3);
    for (const m of casMessages(s))
      if (m.level !== "advisory")
        expect(m.level).toBe(
          ANNUNCIATOR_LEVEL[m.text as keyof typeof ANNUNCIATOR_LEVEL],
        );
  });
  it("the PFD draws the window, the WARNING softkey, and acknowledges with the softkey press", () => {
    const s = cruise();
    s.setFailure("alternator", true);
    systemsFor(s, 60);
    const st = newPfdState();
    const { ctx, texts } = textCtx();
    drawPfd(ctx, s, st, 0.1);
    expect(texts).toContain("LOW VOLTS");
    expect(texts).toContain("WARNING");
    st.softkeyFlash = 11; // the shell flashes the pressed softkey (bezel button)
    drawPfd(textCtx().ctx, s, st, 0.1);
    expect(st.ackAnn).toContain("LOW VOLTS");
    st.softkeyFlash = null;
    const after = textCtx();
    drawPfd(after.ctx, s, st, 0.1);
    expect(after.texts).not.toContain("WARNING");
    expect(after.texts).toContain("ALERTS");
  });
});

describe("dark screens and reversionary mode", () => {
  it("G1000 master OFF with STBY BATT ARM: the PFD stays on the standby battery (STBY BATT), the MFD is dark", () => {
    const s = cruise();
    s.setSwitch("altMaster", false);
    s.setSwitch("batMaster", false);
    systemsFor(s, 2);
    expect(hasPower(s, "pfd")).toBe(true);
    expect(hasPower(s, "mfd")).toBe(false);
    const { ctx, texts } = textCtx();
    drawPfd(ctx, s, newPfdState(), 0.1);
    expect(texts).toContain("STBY BATT");
    expect(texts).toContain("LOW VOLTS");
  });
  it("AHRS and ADC failures: the standby attitude, airspeed and altimeter are drawn apart from the red X", () => {
    const s = cruise();
    s.setFailure("ahrs", true);
    s.setFailure("airData", true);
    systemsFor(s, 1);
    const { ctx, texts } = textCtx();
    drawPfd(ctx, s, newPfdState(), 0.1);
    expect(texts).toContain("AHRS FAIL");
    expect(texts).toContain("ADC FAIL");
    expect(texts).toContain("AIRSPEED"); // the standby airspeed indicator face
    expect(texts.filter((t) => t === "N" || t === "E" || t === "S" || t === "W").length).toBeGreaterThan(0); // compass card
  });
  it("bus dead: PFD, MFD, airliner PFD and ND draw no data at all; the G1000 PFD area shows the standby instruments", () => {
    const s = cruise();
    s.setSwitch("stbyBatt", false); // the standby battery would keep the PFD alive
    s.setSwitch("batMaster", false); // takes the alternator off with it (no field)
    systemsFor(s, 2);
    expect(s.sys.powered).toBe(false);
    expect(hasPower(s, "pfd")).toBe(false);
    // no G1000 data, only the standby airspeed / attitude / altimeter and the compass (POH: use the standby
    // instruments)
    const pfd = textCtx();
    drawPfd(pfd.ctx, s, newPfdState(), 0.1);
    expect(pfd.texts).toContain("STBY");
    expect(pfd.texts).toContain("AIRSPEED");
    expect(pfd.texts.some((t) => /ALERTS|NAV1|COM1|GS |TAS/.test(t))).toBe(false);
    for (const draw of [
      (c: CanvasRenderingContext2D) => drawMfd(c, s, mfdState()),
      (c: CanvasRenderingContext2D) => drawAirlinerPfd(c, s),
      (c: CanvasRenderingContext2D) => drawNd(c, s, 10),
    ]) {
      const { ctx, texts } = textCtx();
      draw(ctx);
      expect(texts).toEqual([]);
    }
  });
  it("avionics OFF: the MFD is dark and the PFD shows the engine strip (reversionary)", () => {
    const s = cruise();
    s.setSwitch("avionics", false);
    systemsFor(s, 2);
    const mfd = textCtx();
    drawMfd(mfd.ctx, s, mfdState());
    expect(mfd.texts).toEqual([]);
    const pfd = textCtx();
    drawPfd(pfd.ctx, s, newPfdState(), 0.1);
    for (const t of ["RPM", "OIL P", "OIL T", "VAC", "VOLTS", "M BATT"])
      expect(pfd.texts).toContain(t);
    // with the avionics back on, the PFD drops the strip and the MFD carries it
    s.setSwitch("avionics", true);
    systemsFor(s, 1);
    const pfd2 = textCtx();
    drawPfd(pfd2.ctx, s, newPfdState(), 0.1);
    expect(pfd2.texts).not.toContain("M BATT");
    const mfd2 = textCtx();
    drawMfd(mfd2.ctx, s, mfdState());
    for (const t of [
      "OIL PRES",
      "OIL TEMP",
      "VAC",
      "VOLTS",
      "AMPS",
      "FUEL QTY GAL",
    ])
      expect(mfd2.texts).toContain(t);
  });
});

describe("steam cockpit", () => {
  it("the annunciator panel maps to real systems annunciators", () => {
    const labels = STEAM_ANNUNCIATORS.map((a) => a.label);
    expect(labels).toEqual([
      "OIL PRESS",
      "LOW VAC",
      "LOW VOLTS",
      "L LOW FUEL",
      "R LOW FUEL",
    ]);
    for (const a of STEAM_ANNUNCIATORS) {
      expect(ANNUNCIATOR_LEVEL[a.ann]).toBeDefined();
      expect(a.color).toBe(
        ANNUNCIATOR_LEVEL[a.ann] === "warning" ? "red" : "amber",
      );
    }
  });
  it("vacuum failure: the attitude and heading the gyros show drift away from the truth after 3 min", () => {
    const s = cruise();
    s.setFailure("vacuum", true);
    systemsFor(s, 360);
    const g = vacuumGyro(s);
    const d = s.ac.data;
    const err =
      Math.abs(g.rollDeg - d.rollDeg) +
      Math.abs(g.pitchDeg - d.pitchDeg) +
      Math.abs(((g.hdgDeg - d.hdgTrue + 540) % 360) - 180);
    expect(err).toBeGreaterThan(3);
  });
  it("pitot icing: the airspeed the instruments show falls well below the true airspeed", () => {
    const s = cruise();
    s.setFailure("pitotIcing", true);
    systemsFor(s, 90);
    expect(airDataShown(s).iasKt).toBeLessThan(s.ac.data.iasKt * 0.5);
    // the G1000 tapes read the same value
    const st = newPfdState();
    updatePfdFilters(st, s);
    expect(st.iasF).toBeLessThan(s.ac.data.iasKt * 0.5);
    // pitot heat cures it
    s.setSwitch("pitotHeat", true);
    systemsFor(s, 60);
    expect(airDataShown(s).iasKt).toBeGreaterThan(s.ac.data.iasKt * 0.9);
  });
  it("a healthy pitot-static system shows the live air data (no lag)", () => {
    const s = cruise();
    const a = airDataShown(s);
    expect(a.iasKt).toBe(s.ac.data.iasKt);
    expect(a.vsFpm).toBe(s.ac.data.vsFpm);
    expect(a.altFt).toBe(s.indicatedAlt());
  });
  it("cabin smoke veils the instruments (electrical fire), nothing without smoke", () => {
    /** canvas stand-in counting the fills and recording their colours */
    const fills = () => {
      const styles: string[] = [];
      const st: Record<string, unknown> = { fillStyle: "#000" };
      const grad = { addColorStop: () => undefined };
      const ctx = new Proxy(st, {
        get: (t, k: string) =>
          k === "fillRect" ? () => styles.push(String(t.fillStyle)) : k === "createRadialGradient" ? () => grad : k in t ? t[k] : () => undefined,
        set: (t, k: string, v) => ((t[k] = v), true),
      }) as unknown as CanvasRenderingContext2D;
      return { ctx, styles };
    };
    const s = cruise();
    const a = fills();
    smokeHaze(a.ctx, s, 1024, 768, 1);
    expect(a.styles).toEqual([]);
    s.setFailure("electricalFire", true);
    systemsFor(s, 60);
    expect(s.sys.smokeLevel).toBeGreaterThan(0.2);
    const b = fills();
    smokeHaze(b.ctx, s, 1024, 768, 1);
    expect(b.styles.length).toBeGreaterThan(0);
    const alpha = Number(/rgba\([^)]*,([0-9.]+)\)/.exec(b.styles[0])![1]);
    // clearly visible (no SMOKE light on a C172S: the haze is the cue), yet a veil, never an opaque screen
    expect(alpha).toBeGreaterThan(0.15);
    expect(alpha).toBeLessThan(0.45);
    // drawn over the steam panel and the G1000 (the wrappers call it last)
    for (const draw of [
      (c: CanvasRenderingContext2D) => drawSixPack(c, s, 0.1),
      (c: CanvasRenderingContext2D) => drawPfd(c, s, newPfdState(), 0.1),
    ]) {
      const { ctx } = textCtx();
      expect(() => draw(ctx)).not.toThrow();
    }
  });
  it("a rough engine shakes the panel a little, a smooth one not at all", () => {
    const s = cruise();
    expect(panelShake(s, 1.234)).toEqual({ dx: 0, dy: 0 });
    s.setFailure("engineRough", true);
    systemsFor(s, 2);
    let m = 0;
    for (let t = 0; t < 2; t += 0.05) {
      const p = panelShake(s, t);
      m = Math.max(m, Math.hypot(p.dx, p.dy));
    }
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThanOrEqual(3.1);
  });
  it("the six-pack shows OFF on the turn coordinator and the stack blanks the radios without power", () => {
    const s = cruise();
    s.cockpit = "steam"; // no standby battery on the classic panel
    const live = textCtx();
    drawStack(live.ctx, s);
    expect(live.texts.some((t) => /^\d{3}\.\d{3}$/.test(t))).toBe(true); // COM frequencies shown
    s.setSwitch("batMaster", false);
    systemsFor(s, 2);
    const six = textCtx();
    drawSixPack(six.ctx, s, 0.1);
    expect(six.texts).toContain("OFF");
    const dead = textCtx();
    drawStack(dead.ctx, s);
    expect(dead.texts.some((t) => /^\d{3}\.\d{3}$/.test(t))).toBe(false);
    expect(dead.texts).not.toContain("NO ACTV WPT");
  });
});

describe("steam cockpit: wet compass", () => {
  it("paused it shows the settled heading, read from behind its card (higher headings to the LEFT)", () => {
    const s = cruise();
    const hdg = s.ac.data.hdgTrue;
    const drawn: { t: string; x: number; y: number }[] = [];
    const base = textCtx();
    const ctx = new Proxy(base.ctx as unknown as Record<string, unknown>, {
      get: (t, k: string) =>
        k === "fillText"
          ? (txt: string, x: number, y: number) => drawn.push({ t: String(txt), x, y })
          : t[k],
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawSixPack(ctx, s, 0);
    const named: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 };
    const cards = drawn.filter((d) => d.y === 34 && (d.t in named || /^\d{1,2}$/.test(d.t)));
    expect(cards.length).toBeGreaterThan(2);
    for (const c of cards) {
      const v = c.t in named ? named[c.t] : Number(c.t) * 10;
      const rel = ((v - hdg + 540) % 360) - 180;
      expect(Math.abs(c.x - (460 - rel * 3.2))).toBeLessThan(1);
    }
  });
});

describe("airliner: what an air-data or AHRS failure removes", () => {
  it("air data: the Mach read-out and the speed bugs are covered with the speed tape; AHRS: the ground speed", () => {
    const s = cruise();
    s.setFailure("airData", true);
    const boxes: number[][] = [];
    const base = textCtx();
    const ctx = new Proxy(base.ctx as unknown as Record<string, unknown>, {
      get: (t, k: string) =>
        k === "fillRect" ? (x: number, y: number, w: number, h: number) => boxes.push([x, y, w, h]) : t[k],
      set: (t, k: string, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    drawAirlinerPfd(ctx, s);
    const covers = (x: number, y: number) =>
      boxes.some(([bx, by, bw, bh]) => x >= bx && x <= bx + bw && y >= by && y <= by + bh);
    // tape column (58..176), bug column to its right (≤ 222), Mach line under the tape (y ≈ 586)
    expect(covers(117, 586)).toBe(true);
    expect(covers(215, 352)).toBe(true);
    s.setFailure("airData", false);
    s.setFailure("ahrs", true);
    boxes.length = 0;
    drawAirlinerPfd(ctx, s);
    expect(covers(117, 612)).toBe(true); // GS (from the IRS)
  });
});

describe("airliner flags", () => {
  it("AHRS failure: ATT and HDG flags, the ND shows MAP and HDG", () => {
    const s = cruise();
    s.setFailure("ahrs", true);
    const p = textCtx();
    drawAirlinerPfd(p.ctx, s);
    expect(p.texts).toEqual(expect.arrayContaining(["ATT", "HDG"]));
    const n = textCtx();
    drawNd(n.ctx, s, 10);
    expect(n.texts).toEqual(expect.arrayContaining(["MAP", "HDG"]));
  });
  it("air-data failure: SPD, ALT and V/S flags", () => {
    const s = cruise();
    s.setFailure("airData", true);
    const p = textCtx();
    drawAirlinerPfd(p.ctx, s);
    expect(p.texts).toEqual(expect.arrayContaining(["SPD", "ALT", "V/S"]));
  });
});

describe("systems panel controls (pure)", () => {
  it("split master: BAT OFF takes ALT with it, ALT ON brings BAT with it, ALT alone goes OFF", () => {
    const s = cruise();
    toggleControl(s, "bat");
    expect(s.sw.batMaster).toBe(false);
    expect(s.sw.altMaster).toBe(false);
    toggleControl(s, "alt");
    expect(s.sw.batMaster).toBe(true);
    expect(s.sw.altMaster).toBe(true);
    toggleControl(s, "alt");
    expect(s.sw.altMaster).toBe(false);
    expect(s.sw.batMaster).toBe(true);
    toggleControl(s, "bat");
    toggleControl(s, "bat");
    expect(s.sw.batMaster).toBe(true);
    expect(s.sw.altMaster).toBe(false);
  });
  it("every toggle maps to its switch and is logged for grading", () => {
    const s = cruise();
    const before = s.rec.actions.length;
    for (const c of [
      "avionics",
      "auxPump",
      "beacon",
      "landingLight",
      "pitotHeat",
      "altStatic",
      "cabinHeat",
      "fuelShutoff",
      "trimCb",
    ] as const) {
      const k = {
        avionics: "avionics",
        auxPump: "auxPump",
        beacon: "beacon",
        landingLight: "landingLight",
        pitotHeat: "pitotHeat",
        altStatic: "altStatic",
        cabinHeat: "cabinHeat",
        fuelShutoff: "fuelShutoff",
        trimCb: "trimCb",
      }[c] as keyof typeof s.sw;
      const v = s.sw[k];
      toggleControl(s, c);
      expect(s.sw[k]).toBe(!v);
    }
    expect(s.rec.actions.length - before).toBe(9);
  });
  it("magneto key: one notch at a time, never into START; START is set explicitly", () => {
    const s = cruise();
    expect(s.sw.magnetos).toBe("BOTH");
    stepMagnetos(s, 1);
    expect(s.sw.magnetos).toBe("BOTH");
    stepMagnetos(s, -1);
    expect(s.sw.magnetos).toBe("L");
    stepMagnetos(s, -1);
    stepMagnetos(s, -1);
    stepMagnetos(s, -1);
    expect(s.sw.magnetos).toBe("OFF");
    setMagnetos(s, "START");
    expect(s.sw.magnetos).toBe("START");
    stepMagnetos(s, -1);
    expect(s.sw.magnetos).toBe("L");
  });
  it("mixture: ± in vernier steps, clamped to idle cut-off and full rich", () => {
    const s = cruise();
    expect(s.sw.mixture).toBe(1);
    mixtureStep(s, 1);
    expect(s.sw.mixture).toBe(1);
    mixtureStep(s, -1);
    expect(s.sw.mixture).toBeCloseTo(1 - MIX_STEP, 6);
    for (let i = 0; i < 40; i++) mixtureStep(s, -1);
    expect(s.sw.mixture).toBe(0);
  });
  it("status strip: abnormal settings and lit annunciators; gauges strip carries the EIS colours", () => {
    const s = cruise();
    expect(panelSummary(s).every((c) => c.tone === "normal")).toBe(true);
    s.setFailure("alternator", true);
    setFuelSelector(s, "OFF");
    systemsFor(s, 60);
    const chips = panelSummary(s);
    expect(chips.find((c) => c.id === "fuel")!.tone).toBe("caution");
    expect(chips.find((c) => c.text === "LOW VOLTS")!.tone).toBe("warning");
    const g = gaugeStrip(s);
    expect(g.map((c) => c.id)).toEqual([
      "volts",
      "amps",
      "vac",
      "oilP",
      "oilT",
      "fuelL",
      "fuelR",
    ]);
    expect(g.find((c) => c.id === "volts")!.level).toBe("warning");
  });

  it("gauges strip without power: only the (mechanical) suction gauge and the voltmeter still read", () => {
    const s = cruise();
    toggleControl(s, "bat"); // BAT OFF takes ALT with it: bus dead
    systemsFor(s, 5);
    expect(s.sys.powered).toBe(false);
    const g = Object.fromEntries(gaugeStrip(s).map((c) => [c.id, c]));
    expect(g.vac.value).not.toBe("—");
    expect(Number(g.volts.value)).toBeLessThan(1);
    for (const id of ["amps", "oilP", "oilT", "fuelL", "fuelR"]) {
      expect(g[id].value).toBe("—");
      expect(g[id].frac).toBe(0);
    }
  });

  it("gauge colour and LOW VACUUM annunciator switch at the same suction", () => {
    const s = cruise();
    s.setFailure("vacuum", true);
    let seen = 0;
    for (let t = 0; t < 30; t += 0.25) {
      systemsFor(s, 0.25, 0.25);
      const lit = s.sys.annunciators.includes("LOW VACUUM");
      expect(eisReadings(s).vac.level === "caution").toBe(lit);
      if (lit) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("status strip: alarms first (a narrow strip never hides them) and in French with the French words", () => {
    const s = cruise();
    toggleControl(s, "bat"); // bus dead
    setMagnetos(s, "L");
    systemsFor(s, 5);
    const en = panelSummary(s);
    const rank = { warning: 0, caution: 1, normal: 2 } as const;
    for (let i = 1; i < en.length; i++)
      expect(rank[en[i].tone]).toBeGreaterThanOrEqual(rank[en[i - 1].tone]);
    expect(en[0].id).toBe("noPower");
    expect(en.find((c) => c.id === "mags")!.text).toBe("MAGS L");
    setLang("fr");
    try {
      const fr = Object.fromEntries(panelSummary(s).map((c) => [c.id, c.text]));
      expect(fr.master).toBe("GÉNÉRAL ARRÊT");
      expect(fr.mags).toBe("MAGNÉTOS G");
      expect(fr.fuel).toBe("CARBURANT LES DEUX");
      expect(fr.mix).toBe("MÉLANGE PLEIN RICHE");
      expect(fr.noPower).toMatch(/alimentation/);
    } finally {
      setLang("en");
    }
  });
});
