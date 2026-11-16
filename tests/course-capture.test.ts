// « Capturer un moment pour la diapo »: the capture's words, the moments refused (a crash, beyond VNE, beyond the load
// limits, numbers that are not numbers), the captures kept across the studio → cockpit → studio round trip (and a clear
// message when the device keeps nothing), crash → back 10 s → capture, and the return URL to the slide.
import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { MemoryDb } from "../src/lib/idb";
import { CourseStore, DB_NAME, STORES } from "../src/course/store";
import {
  CourseBridge,
  courseLinkParams,
  installCourseBridge,
  type CockpitHost,
} from "../src/course/cockpitBridge";
import { captureScene, encodeScene } from "../src/course/scene";
import {
  ENVELOPE,
  captureRefusal,
  momentFacts,
  momentLine,
  sceneRefusal,
  type MomentFacts,
} from "../src/course/captureMoment";
import {
  captureLink,
  markFlying,
  setCaptureChoice,
  studioReturnHref,
  takeCaptureChoice,
  takeFlying,
} from "../src/course/captureHandoff";
import type { Refusal } from "../src/course/captureMoment";

const kvMap = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
async function store() {
  return CourseStore.open({
    db: new MemoryDb(DB_NAME, STORES),
    kv: kvMap(),
    channel: false,
    persist: async () => "granted",
  });
}
function host(sim = new Sim(), lang: "en" | "fr" = "en") {
  const toasts: string[] = [];
  const refused: Refusal[] = [];
  const h: CockpitHost = {
    sim,
    lang: () => lang,
    cockpit: () => "g1000",
    toast: (t) => void toasts.push(t),
    refused: (r) => void refused.push(r),
    runExercise: () => undefined,
    startLesson: () => undefined,
    startScenario: () => undefined,
  };
  return { h, sim, toasts, refused };
}
/** fly `s` seconds, ticking the rewind ring as the cockpit's frame loop does */
function fly(
  sim: Sim,
  b: CourseBridge,
  s: number,
  ctl: Partial<Sim["controls"]> = {},
) {
  for (let t = 0; t < s; t += 0.1) {
    Object.assign(sim.controls, ctl);
    sim.step(0.1);
    b.tick();
  }
}
const turn: MomentFacts = {
  hdg: 270,
  altFt: 3000,
  iasKt: 100,
  vsFpm: 0,
  bank: 15,
  onGround: false,
  stalled: false,
  pos: { kind: "radial", station: "ARD", radial: 90, distNm: 6, ndb: false },
};

describe("the capture's summary in pilot words", () => {
  it("says heading, altitude, speed, the turn and where, in French and in English", () => {
    expect(momentLine(turn, "fr")).toBe(
      "270° · 3 000 ft · 100 kt · virage 15° D · ARD radial 090 6 NM",
    );
    expect(momentLine(turn, "en")).toBe(
      "270° · 3,000 ft · 100 kt · 15° right turn · ARD radial 090 6 NM",
    );
  });
  it("says wings level, a climb or a descent, a left turn, the ILS, the ground and a stall", () => {
    expect(momentLine({ ...turn, bank: 0 }, "fr")).toContain("ailes à plat");
    expect(momentLine({ ...turn, bank: -20, vsFpm: -500 }, "fr")).toContain(
      "descente 500 ft/min · virage 20° G",
    );
    expect(momentLine({ ...turn, vsFpm: 700 }, "en")).toContain(
      "climbing 700 ft/min",
    );
    expect(
      momentLine(
        {
          ...turn,
          pos: { kind: "ils", rwy: "27", airport: "PARD", distNm: 4.5 },
        },
        "fr",
      ),
    ).toContain("ILS 27 PARD 4,5 NM");
    expect(momentLine({ ...turn, onGround: true, iasKt: 0 }, "en")).toContain(
      "on the ground",
    );
    expect(momentLine({ ...turn, stalled: true }, "fr")).toContain(
      "décrochage",
    );
  });
  it("reads the live simulator: the line matches what the instruments show", () => {
    const sim = new Sim();
    sim.step(0.1);
    const f = momentFacts(sim);
    expect(f.hdg).toBe(Math.round(sim.ac.data.hdgTrue) % 360);
    expect(f.iasKt).toBe(Math.round(sim.ac.data.iasKt));
    const line = momentLine(f, "fr");
    expect(line).toMatch(/^\d{3}° · [\d ]+ ft · \d+ kt/);
    expect(f.pos.kind).not.toBe("none");
  });
});

describe("moments that cannot go on a slide", () => {
  it("refuses a crash, beyond VNE, beyond the load limits and broken numbers, each with its reason", () => {
    const sim = new Sim();
    sim.step(0.1);
    expect(captureRefusal(sim, "fr")).toBeNull();
    sim.ac.data.iasKt = ENVELOPE.vneKt + 20;
    expect(captureRefusal(sim, "fr")?.code).toBe("overspeed");
    expect(captureRefusal(sim, "fr")?.text).toMatch(/VNE/);
    sim.ac.data.iasKt = 100;
    sim.ac.data.gLoad = 4.6;
    expect(captureRefusal(sim, "en")?.code).toBe("overload");
    sim.ac.data.gLoad = 1;
    sim.ac.s.lat = NaN;
    expect(captureRefusal(sim, "en")?.code).toBe("invalid");
    sim.ac.s.lat = 0;
    sim.ac.s.crashed = "Hard impact (-2100 fpm)";
    const r = captureRefusal(sim, "fr");
    expect(r?.code).toBe("crashed");
    expect(r?.text).toMatch(/écrasé/);
  });
  it("a stored capture of a crash is never used on a slide", () => {
    const sim = new Sim();
    sim.step(0.1);
    expect(sceneRefusal(captureScene(sim), "en")).toBeNull();
    sim.ac.s.crashed = "Touched down off-airport";
    expect(sceneRefusal(captureScene(sim), "en")?.code).toBe("crashed");
  });
  it("the bridge refuses C and Shift+C after a crash: nothing lands in the tray, the cockpit is told why", async () => {
    const s = await store();
    const { h, sim, refused } = host(undefined, "fr");
    const b = new CourseBridge(h, s, "?capture=c1&step=s1");
    fly(sim, b, 6);
    sim.ac.s.crashed = "Hard impact (-2100 fpm)";
    expect(await b.capture()).toBeNull();
    expect(await b.captureClip()).toBeNull();
    expect(refused.map((r) => r.code)).toEqual(["crashed", "crashed"]);
    expect(b.lastRefusal?.text).toMatch(/Rien|écrasé/);
    expect(await s.listTray("c1")).toHaveLength(0);
  });
  it("beyond VNE is refused too, and the next good moment is taken", async () => {
    const s = await store();
    const { h, sim, refused } = host();
    const b = new CourseBridge(h, s, "?capture=c1");
    sim.step(0.1);
    sim.ac.data.iasKt = 190;
    expect(await b.capture()).toBeNull();
    expect(refused[0].code).toBe("overspeed");
    sim.step(0.1);
    const it2 = await b.capture();
    expect(it2).not.toBeNull();
    expect(b.lastRefusal).toBeNull();
  });
});

describe("captures across the round trip", () => {
  it("stores the moment for the course and the slide, with its words; the studio side reads them back", async () => {
    const s = await store();
    const { h, sim, toasts } = host(undefined, "fr");
    const b = new CourseBridge(h, s, "?capture=c1&step=s3");
    expect(b.params.step).toBe("s3");
    fly(sim, b, 3);
    const item = await b.capture();
    expect(item?.courseId).toBe("c1");
    expect(item?.stepId).toBe("s3");
    expect(item?.moment).toBeTruthy();
    expect(item?.label).toBe(momentLine(item!.moment!, "fr"));
    expect(toasts.at(-1)).toMatch(/^Moment capturé : \d{3}°/);
    // another page (the studio) on the same device store
    const back = await s.listTray("c1");
    expect(back.map((x) => x.id)).toEqual([item!.id]);
    // the cockpit's strip lists them newest first; a removed one can be put back
    const b2 = new CourseBridge(host().h, s, "?capture=c1");
    expect((await b2.captures()).length).toBe(1);
    await b2.removeCapture(item!.id);
    expect(await b2.captures()).toHaveLength(0);
    await b2.restoreCapture(item!);
    expect((await b2.captures())[0].id).toBe(item!.id);
  });
  it("Shift+C keeps the last seconds flown as a recording", async () => {
    const s = await store();
    const { h, sim } = host();
    const b = new CourseBridge(h, s, "?capture=c1");
    fly(sim, b, 12);
    const clip = await b.captureClip(60);
    expect(clip?.clip?.durS).toBeGreaterThan(5);
    expect(clip?.moment).toBeTruthy();
  });
  it("says clearly when the device keeps nothing (no store, or a store on memory)", async () => {
    const none = host(undefined, "fr");
    const b = await installCourseBridge(none.h, {
      search: "?capture=c1",
      store: null,
    });
    expect(b.storageBlocked).toBe(true);
    expect(await b.capture()).toBeNull();
    expect(none.refused[0].text).toMatch(/stockage/);
    const mem = host();
    const b2 = await installCourseBridge(mem.h, {
      search: "?capture=c1",
      store: await store(),
    });
    expect(b2.storageBlocked).toBe(true);
    expect(await b2.capture()).toBeNull();
    expect(mem.refused[0].text).toMatch(/storage/);
  });
});

describe("after a crash", () => {
  it("back 10 s clears the crash, waits paused, and the capture works again; earlier captures are kept", async () => {
    const s = await store();
    const { h, sim } = host();
    const b = new CourseBridge(h, s, "?capture=c1");
    fly(sim, b, 4);
    const before = await b.capture();
    expect(before).not.toBeNull();
    fly(sim, b, 16);
    sim.ac.s.crashed = "Hard impact (-2100 fpm)";
    sim.step(0.1);
    b.tick();
    expect(await b.capture()).toBeNull();
    const f = b.rewindBefore(10);
    expect(f).not.toBeNull();
    expect(sim.ac.s.crashed).toBeNull();
    expect(sim.paused).toBe(true);
    sim.paused = false;
    fly(sim, b, 1);
    const after = await b.capture();
    expect(after).not.toBeNull();
    expect((await s.listTray("c1")).map((x) => x.id).sort()).toEqual(
      [before!.id, after!.id].sort(),
    );
  });
  it("starts again from the slide's situation (the ?scene= the cockpit opened on)", async () => {
    const s = await store();
    const src = new Sim();
    src.step(0.1);
    const code = await encodeScene(captureScene(src));
    const { h, sim } = host();
    const b = new CourseBridge(h, s, `?capture=c1&scene=${code}`);
    expect(await b.openScene()).toEqual([]);
    expect(b.startScene).not.toBeNull();
    fly(sim, b, 3);
    sim.ac.s.crashed = "Wing strike on touchdown";
    expect(b.restartFromSlide()).toBe(true);
    expect(sim.ac.s.crashed).toBeNull();
    expect(Math.abs(sim.ac.s.altFt - src.ac.s.altFt)).toBeLessThan(5);
    expect(await b.capture()).not.toBeNull();
  });
  it("with nothing in the ring, back 10 s says there is nothing to go back to", () => {
    const { h } = host();
    const b = new CourseBridge(h, null, "?capture=c1");
    expect(b.rewindBefore(10)).toBeNull();
  });
});

describe("the return to the slide", () => {
  it("the cockpit link names the course, the slide and comes back to that slide", () => {
    const link = captureLink({
      courseId: "c1",
      stepId: "s4",
      sceneCode: "S1.abc",
      returnHref: "https://wingdeck.example/academy.html#edit=c1",
    });
    expect(link).toMatch(
      /^index\.html\?capture=c1&step=s4&scene=S1\.abc&return=/,
    );
    const p = courseLinkParams(
      link
        .slice(link.indexOf("?"))
        .replace(encodeURIComponent("https://wingdeck.example"), ""),
    );
    expect(p.capture).toBe("c1");
    expect(p.step).toBe("s4");
    expect(p.ret).toBe("/academy.html#edit=c1&s=s4");
  });
  it("puts the slide in the studio URL, replaces an older one, leaves other pages alone", () => {
    expect(studioReturnHref("/academy.html#edit=c1", "c1", "s2")).toBe(
      "/academy.html#edit=c1&s=s2",
    );
    expect(studioReturnHref("/academy.html#edit=c1&s=s1", "c1", "s2")).toBe(
      "/academy.html#edit=c1&s=s2",
    );
    expect(studioReturnHref("/academy.html", "c1")).toBe(
      "/academy.html#edit=c1",
    );
    expect(studioReturnHref("/academy.html#library", "c1", "s2")).toBe(
      "/academy.html#library",
    );
  });
  it("rejects a return to another site, and a step without capture mode", () => {
    expect(
      courseLinkParams("?capture=c1&return=https://evil.example/x").ret,
    ).toBeUndefined();
    expect(courseLinkParams("?step=s1").step).toBeUndefined();
    expect(courseLinkParams("?capture=c1&step=../x").step).toBeUndefined();
  });
  it("the tab remembers the departure and the capture chosen, once, for that course only", async () => {
    const kv = kvMap();
    expect(markFlying({ course: "c1", step: "s2", at: 1000 }, kv)).toBe(true);
    expect(takeFlying("other", kv)).toBeNull();
    expect(takeFlying("c1", kv)).toEqual({
      course: "c1",
      step: "s2",
      at: 1000,
    });
    expect(takeFlying("c1", kv)).toBeNull();
    // an older tab kept the plain course id
    kv.setItem("ifr.course.flying", "c1");
    expect(takeFlying("c1", kv)?.course).toBe("c1");
    // « Utiliser pour la diapo » in the cockpit
    const s = await store();
    const { h, sim } = host();
    const b = new CourseBridge(
      h,
      s,
      "?capture=c1&step=s2&return=%2Facademy.html%23edit%3Dc1%26s%3Ds2",
    );
    sim.step(0.1);
    const it = await b.capture();
    expect(b.chooseForSlide(it!, kv)).toBe("/academy.html#edit=c1&s=s2");
    const now = Date.now();
    expect(takeCaptureChoice("other", now, kv)).toBeNull();
    expect(takeCaptureChoice("c1", now, kv)).toMatchObject({
      course: "c1",
      step: "s2",
      item: it!.id,
    });
    expect(takeCaptureChoice("c1", now, kv)).toBeNull();
    // a choice from hours ago is not applied any more
    setCaptureChoice({ course: "c1", item: "x", at: now - 7 * 3600e3 }, kv);
    expect(takeCaptureChoice("c1", now, kv)).toBeNull();
    // storage blocked: nothing kept, nothing thrown
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(setCaptureChoice({ course: "c1", item: "x", at: now }, broken)).toBe(
      false,
    );
    expect(takeCaptureChoice("c1", now, broken)).toBeNull();
    expect(markFlying({ course: "c1", at: now }, broken)).toBe(false);
  });
});
