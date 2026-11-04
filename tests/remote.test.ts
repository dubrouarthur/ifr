// Instructor companion: pairing codes, command validation, snapshot shape, the host protocol (mock transport)
// and the PeerJS registration (mocked peerjs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Sim, SCENARIOS } from "../src/sim/sim";
import {
  newPairCode,
  parsePairCode,
  peerIdFor,
  formatPairCode,
  validateCommand,
  describeCommand,
  deviceName,
  CODE_ALPHABET,
  FAILURE_KEYS,
  type HostMsg,
} from "../src/connect/remoteTypes";
import {
  startRemoteHost,
  simHostApi,
  simSnapshot,
  applyCommand,
  remoteUrl,
  isLocalOnly,
  routeFor,
  peerTransport,
  type HostTransport,
  type LinkConn,
} from "../src/connect/remoteLink";

const peers: {
  id: string;
  handlers: Record<string, (...a: unknown[]) => void>;
  destroyed: boolean;
}[] = [];
vi.mock("peerjs", () => {
  class Peer {
    handlers: Record<string, (...a: unknown[]) => void> = {};
    destroyed = false;
    constructor(public id: string) {
      peers.push(this);
    }
    on(ev: string, f: (...a: unknown[]) => void) {
      this.handlers[ev] = f;
      return this;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
    }
  }
  return { Peer, default: Peer };
});

const ils = () => new Sim(SCENARIOS.find((s) => s.id === "ils27-vtf"));

describe("pairing codes and URLs", () => {
  it("draws 6 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const c = newPairCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it("reads what a person types, and rejects look-alikes", () => {
    expect(parsePairCode("k7p 4qx")).toBe("K7P4QX");
    expect(parsePairCode(" K7P-4QX ")).toBe("K7P4QX");
    expect(parsePairCode("#K7P4QX")).toBe("K7P4QX");
    expect(parsePairCode(peerIdFor("K7P4QX"))).toBe("K7P4QX");
    expect(parsePairCode("K7P4Q")).toBeNull();
    expect(parsePairCode("K7P4Q0")).toBeNull(); // zero is not in the alphabet
    expect(parsePairCode("K7P4QXX")).toBeNull();
    expect(formatPairCode("K7P4QX")).toBe("K7P 4QX");
  });
  it("broker id and console URL", () => {
    expect(peerIdFor("K7P4QX")).toBe("ifr-sim-k7p4qx");
    expect(peerIdFor("K7P4QX")).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/); // PeerJS id rules
    expect(
      remoteUrl("K7P4QX", "https://ifr.example.com/?scenario=ils27-vtf#x"),
    ).toBe("https://ifr.example.com/remote.html#K7P4QX");
    expect(remoteUrl("K7P4QX", "https://example.com/sim/index.html")).toBe(
      "https://example.com/sim/remote.html#K7P4QX",
    );
    expect(isLocalOnly("http://localhost:5173/remote.html#A")).toBe(true);
    expect(isLocalOnly("http://127.0.0.1:5173/remote.html#A")).toBe(true);
    expect(isLocalOnly("http://192.168.1.20:5173/remote.html#A")).toBe(false);
  });
  it("names the device", () => {
    expect(deviceName("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(
      "iPad",
    );
    expect(
      deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5),
    ).toBe("iPad");
    expect(
      deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
    ).toBe("iPhone");
    expect(
      deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari"),
    ).toBe("Android phone");
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari")).toBe(
      "Android tablet",
    );
  });
});

describe("command validation", () => {
  it("accepts well-formed commands and drops unknown keys", () => {
    expect(validateCommand({ type: "freeze", extra: 1 })).toEqual({
      type: "freeze",
    });
    expect(validateCommand({ type: "failure", key: "gs", on: true })).toEqual({
      type: "failure",
      key: "gs",
      on: true,
    });
    expect(validateCommand({ type: "reposition", where: "final5" })).toEqual({
      type: "reposition",
      where: "final5",
    });
    expect(
      validateCommand({
        type: "weather",
        ceilingFt: 800,
        visibilitySm: 2,
        windKt: 10,
        gustKt: 0,
      }),
    ).toEqual({
      type: "weather",
      ceilingFt: 800,
      visibilitySm: 2,
      windKt: 10,
      gustKt: 0,
    });
    expect(validateCommand({ type: "vector", hdg: 0, alt: 3049 })).toEqual({
      type: "vector",
      hdg: 360,
      alt: 3000,
    });
    expect(validateCommand({ type: "directTo", ident: " marlo " })).toEqual({
      type: "directTo",
      ident: "MARLO",
    });
    expect(
      validateCommand({ type: "message", text: "  Report\n established  " }),
    ).toEqual({ type: "message", text: "Report established" });
  });
  it("rejects anything malformed or out of range", () => {
    const bad: unknown[] = [
      null,
      42,
      "pause",
      [],
      {},
      { type: "selfDestruct" },
      { type: "failure", key: "wings", on: true },
      { type: "failure", key: "gs", on: "yes" },
      { type: "failure", key: "__proto__", on: true },
      { type: "reposition", where: "moon" },
      { type: "weather" },
      { type: "weather", ceilingFt: -5 },
      { type: "weather", windKt: 999 },
      { type: "weather", turbulence: 2 },
      { type: "weather", visibilitySm: NaN },
      { type: "weather", windKt: 20, gustKt: 10 },
      { type: "vector" },
      { type: "vector", hdg: 400 },
      { type: "vector", alt: "3000" },
      { type: "vector", hdg: Infinity },
      { type: "directTo", ident: "MAR LO" },
      { type: "directTo", ident: "<script>" },
      { type: "directTo", ident: 7 },
      { type: "message", text: "   " },
      { type: "message", text: 5 },
    ];
    for (const b of bad)
      expect(validateCommand(b), JSON.stringify(b)).toBeNull();
    expect(validateCommand({ type: "message", text: "x".repeat(500) })).toEqual(
      { type: "message", text: "x".repeat(200) },
    );
  });
  it("describes every command in words", () => {
    expect(describeCommand({ type: "failure", key: "ahrs", on: true })).toBe(
      "Attitude / heading failed",
    );
    expect(describeCommand({ type: "vector", hdg: 90, alt: 4000 })).toBe(
      "ATC: heading 090, maintain 4,000 ft",
    );
    expect(
      describeCommand({
        type: "weather",
        windDir: 250,
        windKt: 18,
        gustKt: 28,
      }),
    ).toContain("250/18G28");
  });
});

describe("snapshot and apply on a headless Sim", () => {
  it("snapshot has the documented shape", () => {
    const s = ils();
    for (let i = 0; i < 30; i++) s.step(1 / 30);
    const snap = simSnapshot(s);
    for (const k of [
      "t",
      "lat",
      "lon",
      "altFt",
      "iasKt",
      "gsKt",
      "hdg",
      "trk",
      "vsFpm",
      "pitch",
      "roll",
    ] as const)
      expect(Number.isFinite(snap[k]), k).toBe(true);
    expect(typeof snap.phase).toBe("string");
    expect(snap.approach?.id).toBeTruthy();
    expect(Object.keys(snap.failures).sort()).toEqual([...FAILURE_KEYS].sort());
    expect(snap.weather).toMatchObject({
      windDir: expect.any(Number),
      windKt: expect.any(Number),
      ceilingFt: expect.any(Number),
      visibilitySm: expect.any(Number),
    });
    expect(snap.paused).toBe(false);
    expect(snap.frozen).toBe(false);
    // JSON round trip: nothing a data channel cannot carry
    expect(JSON.stringify(JSON.parse(JSON.stringify(snap)))).toBe(
      JSON.stringify(snap),
    );
    expect(Object.values(snap).some((v) => v === undefined)).toBe(false);
    const r = routeFor(s);
    expect(r.wpts.length).toBeGreaterThan(0);
    expect(
      r.airports.some((a) => a.ident === "PARD" && a.rwys.length > 0),
    ).toBe(true);
  });
  it("applies failures, weather, freeze, reposition and direct-to", () => {
    const s = ils();
    const st = { frozen: false };
    expect(applyCommand(s, { type: "failure", key: "gs", on: true }, st)).toBe(
      true,
    );
    expect(s.failures.gs).toBe(true);
    expect(s.rec.events.some((e) => e.text.includes("FAILURE"))).toBe(true);
    applyCommand(
      s,
      {
        type: "weather",
        ceilingFt: 300,
        visibilitySm: 0.5,
        windDir: 180,
        windKt: 20,
        gustKt: 30,
        turbulence: 0.4,
      },
      st,
    );
    expect(s.weather).toMatchObject({
      ceilingFt: 300,
      visibilitySm: 0.5,
      windDir: 180,
      windKt: 20,
      gustKt: 30,
      turbulence: 0.4,
    });
    applyCommand(s, { type: "freeze" }, st);
    expect(s.paused).toBe(true);
    expect(applyCommand(s, { type: "resume" }, st)).toBe(false); // the student cannot resume a freeze
    expect(s.paused).toBe(true);
    applyCommand(s, { type: "unfreeze" }, st);
    expect(s.paused).toBe(false);
    const lat0 = s.ac.s.lat;
    expect(applyCommand(s, { type: "reposition", where: "final5" }, st)).toBe(
      true,
    );
    expect(s.ac.s.lat).not.toBe(lat0);
    expect(applyCommand(s, { type: "directTo", ident: "NOSUCHFX" }, st)).toBe(
      false,
    );
    const fix = s.fp.wpts[0]?.ident;
    if (fix)
      expect(applyCommand(s, { type: "directTo", ident: fix }, st)).toBe(true);
  });
});

/** an in-memory transport: tests play the console */
function mockTransport() {
  const ev: {
    conn?: (c: LinkConn) => void;
    state?: (s: "up" | "down" | "failed", why?: string) => void;
  } = {};
  let id = "";
  const t: HostTransport & {
    id(): string;
    up(): void;
    open(): {
      sent: HostMsg[];
      say(m: unknown): void;
      drop(): void;
      closed: boolean;
    };
  } = {
    start(i, e) {
      id = i;
      ev.conn = e.conn;
      ev.state = e.state;
    },
    close() {},
    id: () => id,
    up: () => ev.state!("up"),
    open() {
      const data: ((m: unknown) => void)[] = [];
      const shut: (() => void)[] = [];
      const c = {
        sent: [] as HostMsg[],
        say: (m: unknown) =>
          data.forEach((f) => f(JSON.parse(JSON.stringify(m)))),
        drop: () => shut.forEach((f) => f()),
        closed: false,
      };
      ev.conn!({
        send: (m) => c.sent.push(JSON.parse(JSON.stringify(m))),
        close: () => {
          c.closed = true;
        },
        onData: (f) => data.push(f),
        onClose: (f) => shut.push(f),
      });
      return c;
    },
  };
  return t;
}

describe("remote host (mock transport)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pairs one console, streams at 4 Hz, validates commands before applying them", () => {
    const sim = ils();
    const api = simHostApi(sim);
    const applied: unknown[] = [];
    const cmd = api.command;
    api.command = (c) => {
      applied.push(c);
      cmd(c);
    };
    const t = mockTransport();
    const host = startRemoteHost(api, { transports: [t], code: "K7P4QX" });
    expect(host.code).toBe("K7P4QX");
    expect(host.peerId).toBe("ifr-sim-k7p4qx");
    expect(t.id()).toBe("ifr-sim-k7p4qx");
    expect(host.url).toMatch(/remote\.html#K7P4QX$/);
    const states: string[] = [];
    host.onStatus((s) => states.push(s.state));
    t.up();
    expect(host.status().state).toBe("waiting");

    const a = t.open();
    a.say({ k: "hello", v: 1, cid: "ipad-1", device: "iPad" });
    expect(a.sent[0]).toMatchObject({ k: "welcome", code: "K7P4QX" });
    expect(host.status()).toMatchObject({ state: "connected", device: "iPad" });

    vi.advanceTimersByTime(1000);
    const snaps = a.sent.filter((m) => m.k === "snap");
    expect(snaps.length).toBe(4);
    expect(a.sent.some((m) => m.k === "route")).toBe(true);
    const s0 = (snaps[0] as Extract<HostMsg, { k: "snap" }>).s;
    expect(s0).toMatchObject({
      failures: expect.any(Object),
      weather: expect.any(Object),
      magVar: expect.any(Number),
    });

    a.say({ k: "cmd", id: 1, c: { type: "failure", key: "ap", on: true } });
    expect(sim.failures.ap).toBe(true);
    expect(a.sent.find((m) => m.k === "ack" && m.id === 1)).toMatchObject({
      ok: true,
      text: "Autopilot failed",
    });
    a.say({ k: "cmd", id: 2, c: { type: "failure", key: "wings", on: true } });
    a.say({ k: "cmd", id: 3, c: { type: "weather", windKt: 500 } });
    expect(a.sent.find((m) => m.k === "ack" && m.id === 2)).toMatchObject({
      ok: false,
    });
    expect(a.sent.find((m) => m.k === "ack" && m.id === 3)).toMatchObject({
      ok: false,
    });
    expect(applied).toHaveLength(1);
    a.say({ k: "cmd", id: 4, c: { type: "vector", hdg: 90, alt: 4000 } });
    expect(a.sent.find((m) => m.k === "ack" && m.id === 4)).toMatchObject({
      ok: true,
      text: "ATC: heading 090, maintain 4,000 ft",
    });
    // commands sent before hello are ignored
    const stranger = t.open();
    stranger.say({ k: "cmd", id: 9, c: { type: "end" } });
    expect(stranger.sent).toHaveLength(0);
    expect(applied).toHaveLength(2);
    host.close();
    expect(a.sent[a.sent.length - 1]).toMatchObject({ k: "bye" });
    expect(host.status().state).toBe("closed");
    expect(states).toContain("connected");
  });

  it("refuses a second instructor, accepts the same console back, frees the seat on disconnect", () => {
    const sim = ils();
    const t = mockTransport();
    const host = startRemoteHost(simHostApi(sim), { transports: [t] });
    t.up();
    const a = t.open();
    a.say({ k: "hello", v: 1, cid: "ipad-1", device: "iPad" });
    const b = t.open();
    b.say({ k: "hello", v: 1, cid: "phone-2", device: "iPhone" });
    expect(b.sent[0]).toMatchObject({ k: "refused" });
    expect((b.sent[0] as { reason: string }).reason).toContain("iPad");
    expect(host.status().device).toBe("iPad");
    // the iPad reloads: same console id, new channel → it takes its seat back
    const a2 = t.open();
    a2.say({ k: "hello", v: 1, cid: "ipad-1", device: "iPad" });
    expect(a2.sent[0]).toMatchObject({ k: "welcome" });
    expect(a.closed).toBe(true);
    // the channel drops: waiting again, and the phone may now pair
    a2.drop();
    expect(host.status().state).toBe("waiting");
    const c = t.open();
    c.say({ k: "hello", v: 1, cid: "phone-2", device: "iPhone" });
    expect(host.status()).toMatchObject({
      state: "connected",
      device: "iPhone",
    });
    // a console that stops answering is let go
    vi.advanceTimersByTime(10000);
    expect(host.status().state).toBe("waiting");
    host.close();
  });

  it("a slow pairing service keeps the code 'starting' and says why, then clears the note when it is up", () => {
    const t = mockTransport();
    const host = startRemoteHost(simHostApi(ils()), { transports: [t] });
    expect(host.status().state).toBe("starting");
    vi.advanceTimersByTime(4500);
    expect(host.status().state).toBe("starting");
    expect(host.status().message).toMatch(/pairing service/);
    t.up();
    expect(host.status()).toMatchObject({
      state: "waiting",
      message: undefined,
    });
    host.close();
  });
});

describe("PeerJS registration (mocked peerjs)", () => {
  it("registers the pairing id on the broker and reports when it is up", async () => {
    peers.length = 0;
    const t = peerTransport();
    const states: string[] = [];
    t.start("ifr-sim-k7p4qx", { conn: () => {}, state: (s) => states.push(s) });
    await vi.waitFor(() => expect(peers.length).toBe(1));
    expect(peers[0].id).toBe("ifr-sim-k7p4qx");
    peers[0].handlers.open();
    expect(states).toEqual(["up"]);
    peers[0].handlers.error({ type: "unavailable-id" });
    expect(states).toEqual(["up", "failed"]);
    t.close();
    expect(peers[0].destroyed).toBe(true);
  });
});
