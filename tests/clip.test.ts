// Clips, the rewind ring and the recorder's keyframes (SPEC §9.2, R3): 1 Hz keys and the event track, ClipRecorder
// (live and from the ring), ClipPlayer (interpolation, events, cues, take-over), the debrief replay extracted from
// main.ts (exact restore of the live flight), and "Back 10 s".
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { startAt } from "../src/train/engine";
import { distanceNm, wrap180 } from "../src/nav/geo";
import { steadyWind } from "../src/sim/wind";
import { DEG } from "../src/nav/geo";
import { KT } from "../src/sim/environment";
import type { Clip, SimScene } from "../src/course/types";
import { applyScene, captureScene, verifyOf } from "../src/course/scene";
import { RewindRing } from "../src/course/rewind";
import {
  ClipPlayer,
  ClipRecorder,
  saveSim,
  throttleForRpm,
  trimClip,
} from "../src/course/clip";

const metres = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) => distanceNm(a, b) * 1852;
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** a coupled ILS from 10 NM with a crosswind (turbulence off: two runs of it are comparable) */
function ilsSim(turbulence = 0): Sim {
  const s = new Sim();
  startAt(s, {
    pos: { lat: 0, lon: 0 },
    altFt: 3000,
    hdg: 270,
    iasKt: 95,
    weather: { windDir: 220, windKt: 16, turbulence },
  });
  s.loadApproach("PARD-I27", null, "activate");
  s.reposition("final10");
  s.setCdi("NAV1");
  const d = () => s.ac.data;
  s.ap.toggleAp(d());
  s.ap.pressHdg(d());
  s.ap.pressAlt(d());
  s.ap.pressApr(d(), s.navInputs());
  return s;
}
const fly = (s: Sim, secs: number, dt = 1 / 30, each?: (t: number) => void) => {
  for (let t = 0; t < secs - 1e-9; t += dt) {
    s.step(dt);
    each?.(t);
  }
};

function trackOf(s: Sim): number {
  const a = s.ac.s;
  const w = steadyWind(s.weather, a.altFt, s.ac.data.aglFt);
  const vh = a.tas * Math.cos(a.gamma);
  return (
    (Math.atan2(
      vh * Math.sin(a.psi) + w.e * KT,
      vh * Math.cos(a.psi) + w.n * KT,
    ) /
      DEG +
      360) %
    360
  );
}

describe("recorder keyframes and event track (additive)", () => {
  it("keeps 1 Hz exact keys next to the 2 Hz samples, and tracks avionics, autopilot, plan and failure changes", () => {
    const s = ilsSim();
    const t0 = s.time;
    fly(s, 10);
    s.av.obs2 = 123;
    s.ap.hdgBug = 250;
    fly(s, 5);
    s.setFailure("gs", true);
    fly(s, 5);
    s.fp.activateLeg(s.fp.active + 1);
    fly(s, 10);
    const rec = s.rec;
    expect(rec.samples.length).toBeGreaterThanOrEqual(55); // 0.5 s accumulator, frame-quantised
    expect(rec.samples.length).toBeLessThanOrEqual(62);
    expect(rec.keys.length).toBeGreaterThanOrEqual(30);
    expect(rec.keys.length).toBeLessThanOrEqual(32);
    for (let i = 2; i < rec.keys.length; i++)
      expect(rec.keys[i].t - rec.keys[i - 1].t).toBeCloseTo(1, 1);
    const last = rec.keys[rec.keys.length - 1];
    expect(last.ac).not.toBe(s.ac.s); // a copy
    expect(Object.keys(last.ac).sort()).toEqual(Object.keys(s.ac.s).sort());
    const av = rec.track.find(
      (e) => e.k === "av" && (e.patch as { obs2?: number }).obs2 === 123,
    );
    expect(av?.t).toBeCloseTo(t0 + 10, 0);
    const ap = rec.track.filter(
      (e) => e.k === "ap" && (e.patch as { hdg: number }).hdg === 250,
    );
    expect(ap.length).toBeGreaterThan(0);
    const f = rec.track.find(
      (e) => e.k === "failure" && (e.patch as { gs?: boolean }).gs === true,
    );
    expect(f?.t).toBeCloseTo(t0 + 15, 0);
    expect(rec.track.some((e) => e.k === "plan" && e.t > t0 + 19)).toBe(true);
    // the baseline at the start of the flight: full autopilot and plan snapshots
    expect(rec.track[0].k).toBe("ap");
    // the existing API is unchanged
    expect(rec.events.some((e) => /FAILURE/.test(e.text))).toBe(true);
  });
});

describe("ClipRecorder and ClipPlayer", () => {
  function recordDemo(): {
    a: Sim;
    clip: Clip;
    scene: SimScene;
    keysAt: Map<number, Sim["ac"]["s"]>;
  } {
    const a = ilsSim();
    fly(a, 5);
    const r = ClipRecorder.begin(a, { capture: { label: "ILS 27 demo" } });
    fly(a, 12);
    a.ap.hdgBug = 240; // an event in the middle of the clip
    a.av.obs2 = 45;
    fly(a, 18);
    const { clip, scene } = r.stop();
    const keysAt = new Map(clip.keys.map((k) => [Math.round(k.t), k.ac]));
    return { a, clip: json(clip), scene: json(scene), keysAt };
  }

  it("cuts a clip with samples, keys from t 0 and opening events", () => {
    const { clip, scene } = recordDemo();
    expect(clip.durS).toBeCloseTo(30, 1);
    expect(clip.startScene).toBe(scene.id);
    expect(scene.label).toBe("ILS 27 demo");
    expect(clip.samples.length).toBeGreaterThanOrEqual(55);
    expect(clip.samples[0].t).toBeGreaterThanOrEqual(0);
    expect(clip.keys[0].t).toBeLessThanOrEqual(0.01);
    expect(clip.keys.at(-1)!.t).toBeCloseTo(30, 1);
    expect(
      clip.events
        .filter((e) => e.t === 0)
        .map((e) => e.k)
        .sort(),
    ).toEqual(["ap", "failure", "plan"]);
    expect(JSON.stringify(clip).length).toBeLessThan(150_000);
  });

  it("plays it back on another Sim: the start scene, interpolated poses, events, consistent TRK", () => {
    const { clip, scene, keysAt } = recordDemo();
    const b = new Sim();
    const p = new ClipPlayer(b, clip, { scene });
    p.begin();
    expect(b.paused).toBe(true);
    expect(
      metres(
        b.ac.s,
        scene.pose.kind === "exact" ? scene.pose.ac : { lat: 0, lon: 0 },
      ),
    ).toBeLessThan(1);
    p.seek(20);
    expect(metres(b.ac.s, keysAt.get(20)!)).toBeLessThan(8);
    expect(
      Math.abs(wrap180(b.ac.s.psi / DEG - keysAt.get(20)!.psi / DEG)),
    ).toBeLessThan(1);
    expect(Math.abs(wrap180(b.ac.data.trackSmooth - trackOf(b)))).toBeLessThan(
      2,
    );
    expect(b.ap.hdgBug).toBe(240);
    expect(b.av.obs2).toBe(45);
    p.seek(5);
    expect(b.ap.hdgBug).not.toBe(240);
    expect(b.av.obs2).not.toBe(45);
    // playing advances with the speed
    p.speed = 4;
    p.play();
    for (let i = 0; i < 10; i++) p.tick(0.1);
    expect(p.t).toBeCloseTo(9, 5);
    p.end();
  });

  it("fires cues, pauses at a pause cue exactly, and captions fall back to English", () => {
    const { clip, scene } = recordDemo();
    clip.cues = [
      {
        t: 3,
        text: {
          en: "Note the wind correction",
          fr: "Notez la correction de dérive",
        },
      },
      { t: 8, text: { en: "Your turn now" }, pause: true, handover: true },
    ];
    const fired: number[] = [];
    let ended = false;
    const p = new ClipPlayer(new Sim(), clip, {
      scene,
      onCue: (_c, i) => fired.push(i),
      onEnd: () => (ended = true),
    });
    p.play();
    for (let i = 0; i < 200 && p.playing; i++) p.tick(0.1);
    expect(fired).toEqual([0, 1]);
    expect(p.t).toBe(8);
    expect(p.playing).toBe(false);
    expect(p.caption("fr")).toBe("Your turn now");
    p.seek(4);
    expect(p.caption("fr")).toBe("Notez la correction de dérive");
    p.play();
    for (let i = 0; i < 400 && !ended; i++) {
      if (!p.playing) p.play(); // passing the pause cue again stops there again
      p.tick(0.1);
    }
    expect(ended).toBe(true);
    expect(p.t).toBe(clip.durS);
  });

  it("takeOver gives the exact keyframe state with no velocity jump, and the aircraft flies on like the original", () => {
    const { a, clip, scene, keysAt } = recordDemo();
    void a;
    const b = new Sim();
    const p = new ClipPlayer(b, clip, { scene });
    p.begin();
    p.seek(15.6);
    const r = p.takeOver();
    const k = [...clip.keys].reverse().find((x) => x.t <= 15.6)!;
    expect(r).toEqual({ t: k.t, exact: true });
    expect(Math.abs(r.t - 15)).toBeLessThan(0.1);
    for (const f of [
      "lat",
      "lon",
      "altFt",
      "tas",
      "gamma",
      "theta",
      "phi",
      "psi",
      "q",
      "p",
      "rpm",
      "flapPos",
    ] as const)
      expect(b.ac.s[f]).toBe(k.ac[f]);
    expect(b.paused).toBe(false);
    expect(b.replaying).toBe(false);
    expect(p.live).toBe(true);
    expect(b.ap.ap).toBe(true);
    expect(b.time).toBeCloseTo(r.t, 9);
    const ias0 = b.ac.data.iasKt;
    const s15 = clip.samples.reduce((m, x) => (Math.abs(x.t - r.t) < Math.abs(m.t - r.t) ? x : m));
    expect(Math.abs(ias0 - s15.ias)).toBeLessThan(1.5);
    const rpm0 = b.ac.s.rpm;
    b.step(1 / 30);
    expect(Math.abs(b.ac.data.iasKt - ias0)).toBeLessThan(0.5);
    expect(Math.abs(b.ac.s.rpm - rpm0)).toBeLessThan(15);
    fly(b, 5);
    expect(metres(b.ac.s, keysAt.get(20)!)).toBeLessThan(60);
    expect(Math.abs(b.ac.s.rpm - keysAt.get(20)!.rpm)).toBeLessThan(40);
    // a live player ignores seeks
    p.seek(2);
    expect(b.paused).toBe(false);
  });

  it("throttleForRpm holds the RPM of steady flight", () => {
    const s = ilsSim();
    fly(s, 20);
    s.ap.disconnect();
    s.controls.throttle = 0.6;
    fly(s, 25);
    expect(Math.abs(throttleForRpm(s) - 0.6)).toBeLessThan(0.04);
  });

  it("trims a clip: the start scene moves to the keyframe", () => {
    const { clip, scene } = recordDemo();
    clip.cues = [{ t: 12, text: { en: "here" } }];
    const t = trimClip(clip, scene, 10.3, 25);
    expect(t.clip.durS).toBeCloseTo(15, 1);
    expect(t.clip.startScene).toBe(t.scene.id);
    expect(t.clip.cues[0].t).toBeCloseTo(2, 1);
    const k10 = clip.keys.find((x) => Math.round(x.t) === 10)!;
    expect(t.scene.pose.kind === "exact" && t.scene.pose.ac).toEqual(k10.ac);
    const b = new Sim();
    const p = new ClipPlayer(b, t.clip, { scene: t.scene });
    p.begin();
    expect(metres(b.ac.s, k10.ac)).toBeLessThan(1);
  });
});

describe("debrief replay (ClipPlayer.fromRecorder, the main.ts replay extracted)", () => {
  it("replays the flight and restores the live state exactly: the flight then goes on as if never replayed", () => {
    const a = ilsSim(0.4);
    const twin = ilsSim(0.4);
    fly(a, 40);
    fly(twin, 40);
    expect(a.ac.s).toEqual(twin.ac.s);
    const p = ClipPlayer.fromRecorder(a)!;
    expect(p).not.toBeNull();
    p.begin();
    expect(a.replaying).toBe(true);
    p.seek(10);
    p.pos = 30.5;
    const S = a.rec.samples;
    expect(p.t).toBeCloseTo((S[30].t + S[31].t) / 2 - S[0].t, 5);
    expect(p.pos).toBeCloseTo(30.5, 5);
    p.play();
    for (let i = 0; i < 30; i++) {
      p.tick(0.1);
      a.step(0.1); // the cockpit keeps calling step: a paused Sim only refreshes its avionics
    }
    p.end();
    expect(a.replaying).toBe(false);
    expect(a.paused).toBe(false);
    expect(a.ac.s).toEqual(twin.ac.s);
    expect(a.time).toBe(twin.time);
    fly(a, 20);
    fly(twin, 20);
    expect(a.ac.s).toEqual(twin.ac.s);
    expect(verifyOf(a)).toEqual(verifyOf(twin));
  });

  it("gives the slider, labels and marks main.ts shows", () => {
    const a = ilsSim();
    fly(a, 30);
    a.setFailure("gs", true);
    fly(a, 10);
    const p = ClipPlayer.fromRecorder(a)!;
    p.begin();
    expect(p.durS).toBeCloseTo(a.rec.samples.at(-1)!.t - a.rec.samples[0].t, 6);
    const marks = p.marks();
    expect(marks.some((m) => /FAILURE/.test(m.text) && m.kind === "warn")).toBe(
      true,
    );
    for (const m of marks) expect(m.frac).toBeGreaterThanOrEqual(0);
    p.seek(p.durS);
    expect(p.eventAt()?.text).toBeTruthy();
    p.end();
    expect(ClipPlayer.fromRecorder(new Sim())).toBeNull();
  });

  it("takes over from the replay: the record is cut there and the flight goes on", () => {
    const a = ilsSim();
    fly(a, 50);
    const t0 = a.rec.samples[0].t;
    const p = ClipPlayer.fromRecorder(a)!;
    p.begin();
    const r = p.takeOver(20.5);
    expect(r.exact).toBe(true);
    expect(r.t).toBeLessThanOrEqual(20.5 + 1e-6);
    expect(r.t).toBeGreaterThan(19.4);
    expect(a.time).toBeCloseTo(t0 + r.t, 6);
    expect(a.rec.samples.at(-1)!.t).toBeLessThanOrEqual(a.time + 1e-6);
    expect(a.rec.events.at(-1)!.text).toMatch(/Taken over/);
    expect(a.paused).toBe(false);
    const n = a.rec.samples.length;
    fly(a, 5);
    expect(a.rec.samples.length).toBeGreaterThan(n + 8);
    p.end(); // no restore after a take-over
    expect(a.paused).toBe(false);
  });

  it("saveSim restores autopilot, plan, avionics, failures and the random stream", () => {
    const a = ilsSim(0.3);
    fly(a, 10);
    const restore = saveSim(a);
    const before = JSON.stringify({
      s: a.ac.s,
      av: a.av,
      f: a.failures,
      act: a.fp.active,
      lat: a.ap.lat,
      raw: a.rng.raw,
      t: a.time,
    });
    a.ap.lat = "ROL";
    a.av.obs1 = 1;
    a.setFailure("gs", true);
    a.fp.activateLeg(a.fp.active + 1);
    fly(a, 3);
    restore();
    expect(
      JSON.stringify({
        s: a.ac.s,
        av: a.av,
        f: a.failures,
        act: a.fp.active,
        lat: a.ap.lat,
        raw: a.rng.raw,
        t: a.time,
      }),
    ).toBe(before);
    expect(a.sys).toBe(a.systems.r); // aliases kept
  });
});

describe("rewind ring", () => {
  it("keeps 120 s at 1 Hz within the memory budget", () => {
    const s = ilsSim();
    const ring = new RewindRing();
    let cost = 0;
    let n = 0;
    fly(s, 150, 1 / 30, () => {
      const t = performance.now();
      if (ring.tick(s)) {
        cost += performance.now() - t;
        n++;
      }
    });
    expect(ring.length).toBe(120);
    expect(ring.spanS).toBeCloseTo(119, 0);
    expect(ring.bytes()).toBeLessThan(400_000);
    // ≤ 0.2 ms per tick on an iPad (SPEC §10); a loaded test box gets 10×
    expect(cost / n).toBeLessThan(2);
    expect(ring.ago(10)!.t).toBeCloseTo(ring.newest!.t - 10, 0);
  });

  it("Back 10 s: preview, return to live exactly, or fly on from there", () => {
    const s = ilsSim();
    const ring = new RewindRing();
    fly(s, 40, 1 / 30, () => ring.tick(s));
    const live = { ...s.ac.s };
    const f = ring.ago(10)!;
    ring.preview(s, f.t);
    expect(s.paused).toBe(true);
    expect(ring.previewing).toBe(true);
    expect(
      metres(s.ac.s, f.scene.pose.kind === "exact" ? f.scene.pose.ac : live),
    ).toBeLessThan(0.01);
    expect(verifyOf(s).cdiDots).toBeCloseTo(f.scene.verify!.cdiDots!, 2);
    expect(ring.tick(s)).toBe(false); // nothing captured while scrubbing
    ring.endPreview(s);
    expect(s.paused).toBe(false);
    expect(metres(s.ac.s, live)).toBeLessThan(0.01);
    const n = ring.length;
    ring.resumeFrom(s, ring.ago(10)!.t);
    expect(ring.length).toBe(n - 10);
    expect(s.rec.events.at(-1)!.text).toBe("Rewind: back 10 s");
    expect(s.rec.events.at(-1)!.fr).toBe("Retour arrière : 10 s");
    const t = s.time;
    fly(s, 5, 1 / 30, () => ring.tick(s));
    expect(ring.newest!.t).toBeGreaterThan(t + 3.9);
    expect(ring.newest!.t - ring.frames[ring.length - 6].t).toBeCloseTo(5, 0);
  });

  it("clears on a new flight", () => {
    const s = ilsSim();
    const ring = new RewindRing();
    fly(s, 10, 1 / 30, () => ring.tick(s));
    expect(ring.length).toBeGreaterThan(5);
    startAt(s, { pos: { lat: 0, lon: 0 }, altFt: 3000, hdg: 90, iasKt: 90 });
    ring.tick(s);
    expect(ring.length).toBe(1);
  });

  it("Shift+C: the last 60 s as a clip, from the ring and the recorder", () => {
    const s = ilsSim();
    const ring = new RewindRing({ capture: () => ({ cockpit: "steam" }) });
    fly(s, 90, 1 / 30, () => ring.tick(s));
    const out = ClipRecorder.lastSeconds(ring, s.rec, 60)!;
    expect(out.clip.durS).toBeGreaterThan(59);
    expect(out.clip.durS).toBeLessThan(61.1);
    expect(out.scene.cockpit).toBe("steam");
    expect(out.scene.captured?.from).toBe("rewind");
    const b = new Sim();
    const p = new ClipPlayer(b, json(out.clip), { scene: json(out.scene) });
    p.begin();
    const start = out.scene.pose.kind === "exact" ? out.scene.pose.ac : null;
    expect(metres(b.ac.s, start!)).toBeLessThan(1);
    p.seek(30);
    const k = out.clip.keys.find((x) => Math.abs(x.t - 30) < 0.6)!;
    expect(metres(b.ac.s, k.ac)).toBeLessThan(25);
  });

  it("falls back to the ring's keys and diffed events when the recorder has none (an older recorder)", () => {
    const s = ilsSim();
    const ring = new RewindRing();
    fly(s, 20, 1 / 30, () => ring.tick(s));
    s.ap.pressHdg(s.ac.data); // HDG off → ROL: an autopilot change
    s.av.nav2.active = 112.7;
    fly(s, 20, 1 / 30, () => ring.tick(s));
    const rec = s.rec;
    rec.keys = [];
    rec.track = [];
    const out = ClipRecorder.fromRing(
      ring,
      rec,
      ring.oldest!.t,
      ring.newest!.t,
    )!;
    expect(out.clip.keys.length).toBe(ring.length);
    const ap = out.clip.events.filter((e) => e.k === "ap");
    expect(ap.length).toBeGreaterThanOrEqual(2); // the opening state and the change
    expect(
      out.clip.events.some(
        (e) =>
          e.k === "av" &&
          (e.patch as { nav2?: { active: number } }).nav2?.active === 112.7,
      ),
    ).toBe(true);
    const b = new Sim();
    const p = new ClipPlayer(b, out.clip, { scene: out.scene });
    p.begin();
    p.seek(5);
    const before = b.ap.lat;
    p.seek(out.clip.durS);
    expect(b.ap.lat).not.toBe(before);
    expect(b.av.nav2.active).toBe(112.7);
    const r = p.takeOver(out.clip.durS);
    expect(r.exact).toBe(true);
  });

  it("applyScene of a ring frame reproduces the cockpit at that second", () => {
    const s = ilsSim();
    const ring = new RewindRing();
    fly(s, 30, 1 / 30, () => ring.tick(s));
    const f = ring.ago(5)!;
    const b = new Sim();
    expect(applyScene(b, json(f.scene))).toEqual([]);
    expect(captureScene(b).verify).toEqual(f.scene.verify);
  });
});
