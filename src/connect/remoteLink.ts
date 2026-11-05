// Instructor companion, simulator side: pairs one phone or tablet (remote.html) and streams the flight to it.
//
// Transport: a WebRTC data channel brokered by the public PeerJS server (no backend of our own). The simulator
// registers as `ifr-sim-<code>` with a fresh 6-character code per pairing; the console connects to that id.
// A BroadcastChannel carries the same protocol between two windows of this browser (a second screen at the
// instructor's desk), and works with no network at all.
//
// One instructor at a time: a second console is refused with a message. Every command is validated
// (validateCommand) before the shell applies it, and acknowledged so the console can log what happened.
import type { Sim } from "../sim/sim";
import { FAILURE_LABELS } from "../sim/sim";
import { AIRPORTS } from "../nav/data";
import { distanceNm } from "../nav/geo";
import { toReal, currentRegion } from "../nav/world";
import {
  PROTOCOL,
  newPairCode,
  peerIdFor,
  parseClientMsg,
  validateCommand,
  describeCommand,
  type HostMsg,
  type RemoteCommand,
  type RemoteProcChoice,
  type RemoteRoute,
  type RemoteSnapshot,
} from "./remoteTypes";

export interface RemoteHostApi {
  sim: Sim;
  snapshot(): RemoteSnapshot;
  command(c: RemoteCommand): void;
  /** procedures mode: the procedures the instructor can name as expected (club first); sent when they change */
  procChoices?(): RemoteProcChoice[];
}

export type RemoteHostState =
  | "starting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "closed";
export interface RemoteHostStatus {
  state: RemoteHostState;
  /** pairing code (6 characters) */
  code: string;
  /** connected console, in a person's words ('iPad') */
  device?: string;
  /** a sentence for the pairing window when something is wrong */
  message?: string;
}

export interface RemoteHost {
  url: string;
  peerId: string;
  code: string;
  status(): RemoteHostStatus;
  onStatus(cb: (s: RemoteHostStatus) => void): () => void;
  /** end the session: the console is told, the code is released */
  close(): void;
  /** drop the connected console (it may pair again with the same code) */
  kick(): void;
}

// ------------------------------------------------------------------ transports
/** one console connection */
export interface LinkConn {
  send(m: HostMsg): void;
  close(): void;
  onData(cb: (m: unknown) => void): void;
  onClose(cb: () => void): void;
}
/** a way for consoles to reach this simulator */
export interface HostTransport {
  start(
    id: string,
    ev: {
      conn(c: LinkConn): void;
      state(s: "up" | "down" | "failed", why?: string): void;
    },
  ): void;
  close(): void;
}

/** PeerJS over the public broker (0.peerjs.com). Loaded on demand: the simulator never pays for it unpaired. */
export function peerTransport(): HostTransport {
  let peer: import("peerjs").Peer | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  return {
    start(id, ev) {
      import("peerjs")
        .then(({ Peer }) => {
          if (closed) return;
          peer = new Peer(id, { debug: 0 });
          peer.on("open", () => ev.state("up"));
          peer.on("disconnected", () => {
            if (closed) return;
            ev.state("down", "Lost the pairing service. Reconnecting…");
            clearTimeout(retry);
            retry = setTimeout(
              () => !closed && peer && !peer.destroyed && peer.reconnect(),
              2000,
            );
          });
          peer.on("error", (e: { type?: string; message?: string }) => {
            if (closed) return;
            if (e.type === "unavailable-id")
              ev.state("failed", "unavailable-id");
            else if (e.type === "browser-incompatible")
              ev.state(
                "failed",
                "This browser cannot open a WebRTC connection.",
              );
            else if (
              e.type === "network" ||
              e.type === "server-error" ||
              e.type === "socket-error" ||
              e.type === "socket-closed"
            ) {
              ev.state(
                "down",
                "Cannot reach the pairing service (internet needed for a phone or tablet). Retrying…",
              );
              clearTimeout(retry);
              retry = setTimeout(() => {
                if (!closed && peer && !peer.destroyed) peer.reconnect();
              }, 4000);
            }
          });
          peer.on("connection", (dc) => {
            const data: ((m: unknown) => void)[] = [];
            const shut: (() => void)[] = [];
            let done = false;
            const end = () => {
              if (done) return;
              done = true;
              shut.forEach((f) => f());
            };
            dc.on("data", (m) => data.forEach((f) => f(m)));
            dc.on("close", end);
            dc.on("error", end);
            const wrap: LinkConn = {
              send: (m) => {
                if (dc.open) void dc.send(m);
              },
              close: () => {
                setTimeout(() => dc.close(), 150);
                end();
              },
              onData: (f) => data.push(f),
              onClose: (f) => shut.push(f),
            };
            if (dc.open) ev.conn(wrap);
            else dc.on("open", () => ev.conn(wrap));
          });
        })
        .catch(() =>
          ev.state("down", "The pairing component could not be loaded."),
        );
    },
    close() {
      closed = true;
      clearTimeout(retry);
      peer?.destroy();
      peer = null;
    },
  };
}

/** two windows of this browser (same origin): the console probes `ifr-remote:<id>` before trying the network */
export function localTransport(): HostTransport {
  let ch: BroadcastChannel | null = null;
  return {
    start(id, ev) {
      if (typeof BroadcastChannel === "undefined") return;
      ch = new BroadcastChannel(`ifr-remote:${id}`);
      const conns = new Map<
        string,
        { data: ((m: unknown) => void)[]; shut: (() => void)[] }
      >();
      ch.onmessage = (e: MessageEvent) => {
        const m = e.data as {
          to?: string;
          from?: string;
          probe?: boolean;
          open?: boolean;
          closed?: boolean;
          m?: unknown;
        };
        if (!m || m.to !== "host" || typeof m.from !== "string") return;
        const from = m.from;
        if (m.probe) {
          ch?.postMessage({ to: from, here: true });
          return;
        }
        if (m.open) {
          const c = {
            data: [] as ((m: unknown) => void)[],
            shut: [] as (() => void)[],
          };
          conns.set(from, c);
          ev.conn({
            send: (x) => ch?.postMessage({ to: from, m: x }),
            close: () => {
              ch?.postMessage({ to: from, closed: true });
              conns.delete(from);
              c.shut.forEach((f) => f());
            },
            onData: (f) => c.data.push(f),
            onClose: (f) => c.shut.push(f),
          });
          return;
        }
        const c = conns.get(from);
        if (!c) return;
        if (m.closed) {
          conns.delete(from);
          c.shut.forEach((f) => f());
          return;
        }
        c.data.forEach((f) => f(m.m));
      };
    },
    close() {
      ch?.close();
      ch = null;
    },
  };
}

// ------------------------------------------------------------------ helpers
/** the console URL the QR code encodes: next to this page, so a sub-path deployment keeps working */
export function remoteUrl(
  code: string,
  base: string = typeof document !== "undefined"
    ? document.baseURI
    : "http://localhost/",
): string {
  const u = new URL("remote.html", base);
  u.search = "";
  u.hash = code;
  return u.href;
}
/** true when a phone could not open this address (the simulator was opened as localhost) */
export function isLocalOnly(url: string): boolean {
  try {
    return /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** the route and the nearby airports for the console map (real-world coordinates) */
export function routeFor(sim: Sim): RemoteRoute {
  const R = (p: { lat: number; lon: number }) => {
    const r = toReal(p);
    return { lat: +r.lat.toFixed(5), lon: +r.lon.toFixed(5) };
  };
  const wpts = sim.fp.wpts
    .slice(0, 60)
    .map((w) => ({ ident: w.ident, ...R(w), role: w.role }));
  const s = sim.ac.s;
  const near = AIRPORTS.map((a) => ({ a, d: distanceNm(s, a) }))
    .filter((x) => x.d < 45)
    .sort((x, y) => x.d - y.d)
    .slice(0, 16);
  const ap = sim.fp.approach;
  if (ap && !near.some((x) => x.a.icao === ap.airport)) {
    const a = AIRPORTS.find((x) => x.icao === ap.airport);
    if (a) near.push({ a, d: 0 });
  }
  const airports = near.map(({ a }) => {
    const seen = new Set<string>();
    const rwys: [number, number, number, number][] = [];
    for (const r of a.runways) {
      const k = [r.threshold.lat.toFixed(4), r.end.lat.toFixed(4)]
        .sort()
        .join();
      if (seen.has(k)) continue;
      seen.add(k);
      const t = R(r.threshold),
        e = R(r.end);
      rwys.push([t.lat, t.lon, e.lat, e.lon]);
    }
    return { ident: a.icao, ...R(a), rwys };
  });
  const key = `${wpts.map((w) => w.ident).join(",")}|${sim.fp.active}|${airports.map((a) => a.ident).join(",")}`;
  return { key, wpts, active: sim.fp.active, airports };
}

/** A complete snapshot from the simulator alone (no lesson): the fallback when the shell does not provide one,
 *  and what tests use. */
export function simSnapshot(sim: Sim, frozen = false): RemoteSnapshot {
  const d = sim.ac.data;
  const s = sim.ac.s;
  const p = toReal(s);
  const g = sim.fp.out;
  const to = g.valid ? sim.fp.wpts[sim.fp.active] : null;
  const w = sim.weather;
  return {
    t: sim.time,
    lat: p.lat,
    lon: p.lon,
    altFt: Math.round(sim.indicatedAlt()),
    iasKt: Math.round(d.iasKt),
    gsKt: Math.round(d.gsKt),
    hdg: Math.round(d.hdgTrue),
    trk: Math.round(d.trackTrue),
    vsFpm: Math.round(d.vsFpm),
    pitch: Math.round(d.pitchDeg * 10) / 10,
    roll: Math.round(d.rollDeg * 10) / 10,
    onGround: s.onGround,
    crashed: s.crashed || null,
    phase: sim.rec.phase(sim),
    lesson: null,
    flight: sim.scenario?.name ?? "Free flight",
    wpt: to
      ? { ident: to.ident, distNm: Math.round(g.distNm * 10) / 10 }
      : null,
    approach: sim.fp.approach
      ? {
          id: sim.fp.approach.id,
          name: sim.fp.approach.name,
          airport: sim.fp.approach.airport,
          active: sim.fp.approachActive,
        }
      : null,
    failures: { ...sim.failures },
    weather: {
      windDir: Math.round(w.windDir),
      windKt: Math.round(w.windKt),
      gustKt: Math.round(w.gustKt),
      ceilingFt: Math.round(w.ceilingFt),
      visibilitySm: w.visibilitySm,
      turbulence: w.turbulence,
      qnh: w.qnh,
    },
    ap: {
      on: sim.ap.ap,
      lat: sim.ap.lat,
      vert: sim.ap.vert,
      hdgBug: sim.ap.hdgBug,
      altSel: sim.ap.altSel,
    },
    paused: sim.paused,
    frozen,
  };
}

/** Apply a validated command to the simulator alone (fallback / tests). The shell's own handler adds the lesson,
 *  the ATC voice and the student's toasts. */
export function applyCommand(
  sim: Sim,
  c: RemoteCommand,
  st: { frozen: boolean } = { frozen: false },
): boolean {
  const log = (t: string) => sim.rec.log(sim.time, "info", `Instructor: ${t}`);
  switch (c.type) {
    case "pause":
      sim.paused = true;
      return true;
    case "resume":
      if (!st.frozen) sim.paused = false;
      return !st.frozen;
    case "freeze":
      st.frozen = true;
      sim.paused = true;
      log("simulation frozen");
      return true;
    case "unfreeze":
      st.frozen = false;
      sim.paused = false;
      log("simulation running");
      return true;
    case "restart":
      if (sim.scenario) sim.load(sim.scenario);
      return true;
    case "end":
      sim.paused = true;
      log("flight ended");
      return true;
    case "reposition":
      return sim.reposition(c.where);
    case "failure":
      sim.setFailure(c.key, c.on);
      return true;
    case "weather": {
      const w = sim.weather;
      for (const k of [
        "ceilingFt",
        "visibilitySm",
        "windDir",
        "windKt",
        "gustKt",
        "turbulence",
      ] as const)
        if (c[k] !== undefined) w[k] = c[k]!;
      if (w.gustKt && w.gustKt < w.windKt) w.gustKt = 0;
      log(describeCommand(c));
      return true;
    }
    case "vector":
      log(describeCommand(c));
      return true;
    case "directTo": {
      const ok = sim.directTo(c.ident);
      if (ok) log(describeCommand(c));
      return ok;
    }
    case "message":
      log(c.text);
      return true;
    // procedures mode needs the shell (lesson, procedure runner): the simulator alone cannot do them
    case "procConfirm":
    case "drillFire":
    case "gradeProcedures":
      return false;
  }
}

/** the API from the simulator alone (used when the shell does not hand one over) */
export function simHostApi(sim: Sim): RemoteHostApi {
  const st = { frozen: false };
  return {
    sim,
    snapshot: () => simSnapshot(sim, st.frozen),
    command: (c) => void applyCommand(sim, c, st),
  };
}

/** after a command, did the simulator do it? (the shell's handler returns nothing) */
function verify(
  sim: Sim,
  c: RemoteCommand,
  before: { t: number; lat: number; paused: boolean },
  after?: RemoteSnapshot | null,
): { ok: boolean; text: string } {
  const text = describeCommand(c);
  switch (c.type) {
    case "failure":
      return sim.failures[c.key] === c.on
        ? { ok: true, text }
        : { ok: false, text: `${FAILURE_LABELS[c.key]}: not changed` };
    case "reposition":
      return sim.ac.s.lat !== before.lat
        ? { ok: true, text }
        : {
            ok: false,
            text: "Reposition needs an approach loaded on the simulator",
          };
    case "directTo":
      return sim.fp.wpts[sim.fp.active]?.ident === c.ident
        ? { ok: true, text }
        : { ok: false, text: `Unknown fix ${c.ident}` };
    case "resume":
      return !sim.paused
        ? { ok: true, text }
        : { ok: false, text: "Still frozen: unfreeze first" };
    case "procConfirm": {
      const it = after?.procedures
        ?.find((p) => p.procedureId === c.procedureId)
        ?.items.find((i) => i.id === c.itemId);
      return it?.done
        ? { ok: true, text: `Confirmed: ${it.text}` }
        : { ok: false, text: "Not confirmed: the procedure is over or the item is already done" };
    }
    case "drillFire":
      return after && !after.drill?.pending.some((p) => p.index === c.index)
        ? { ok: true, text }
        : { ok: false, text: "That drill failure is not waiting any more" };
    case "gradeProcedures":
      return !after?.grade || after.grade.on === c.on
        ? { ok: true, text }
        : { ok: false, text: "Not changed" };
    default:
      return { ok: true, text };
  }
}

// ------------------------------------------------------------------ the host
const SNAP_MS = 250; // 4 Hz
const STALE_MS = 9000; // a console that has said nothing for this long is gone

/** Start pairing: registers a new code and waits for one instructor console. */
export function startRemoteHost(
  api: RemoteHostApi,
  opts: { transports?: HostTransport[]; code?: string } = {},
): RemoteHost {
  let code = opts.code ?? newPairCode();
  const transports = opts.transports ?? [peerTransport(), localTransport()];
  let st: RemoteHostStatus = { state: "starting", code };
  const subs = new Set<(s: RemoteHostStatus) => void>();
  const set = (p: Partial<RemoteHostStatus>) => {
    st = { ...st, ...p, code };
    subs.forEach((f) => f(st));
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("ifr-remote-status", { detail: st }),
      );
  };
  let active: {
    conn: LinkConn;
    cid: string;
    device: string;
    last: number;
  } | null = null;
  let routeKey = "";
  let procKey = "";
  let procTick = 0;
  let closed = false;
  let netUp = false;
  let attempts = 0;

  const tick = setInterval(() => {
    if (!active) return;
    if (Date.now() - active.last > STALE_MS) {
      const a = active;
      active = null;
      a.conn.close();
      set({
        state: netUp ? "waiting" : "offline",
        device: undefined,
        message: `${a.device} stopped answering. Waiting for it to reconnect…`,
      });
      return;
    }
    let snap: RemoteSnapshot;
    try {
      snap = { ...api.snapshot(), magVar: currentRegion()?.magVar ?? 0 };
    } catch {
      return;
    }
    const r = routeFor(api.sim);
    if (r.key !== routeKey) {
      routeKey = r.key;
      active.conn.send({ k: "route", r });
    }
    // the procedures the instructor can expect: checked every 2 s, sent when the club library changed
    if (api.procChoices && procTick++ % 8 === 0) {
      try {
        const list = api.procChoices();
        const key = list.map((p) => `${p.id}:${p.title}:${p.failures.join("+")}`).join("|");
        if (key !== procKey) {
          procKey = key;
          active.conn.send({ k: "procs", list });
        }
      } catch {
        /* the library is being edited: next time */
      }
    }
    active.conn.send({ k: "snap", s: snap });
  }, SNAP_MS);

  const accept = (conn: LinkConn) => {
    let me: { cid: string; device: string } | null = null;
    conn.onData((raw) => {
      if (closed) return;
      const m = parseClientMsg(raw);
      if (!m) return;
      if (m.k === "hello") {
        // the same console coming back (network flap, page reload) replaces its old connection
        if (
          active &&
          active.cid !== m.cid &&
          Date.now() - active.last < STALE_MS
        ) {
          conn.send({
            k: "refused",
            reason: `${active.device} is running this session. To take over, disconnect it on the simulator (Instructor station, Show pairing, Disconnect), then connect again.`,
          });
          setTimeout(() => conn.close(), 300);
          return;
        }
        if (active && active.conn !== conn) active.conn.close();
        me = { cid: m.cid, device: m.device || "Browser" };
        active = { conn, cid: m.cid, device: me.device, last: Date.now() };
        routeKey = "";
        procKey = "";
        procTick = 0;
        conn.send({ k: "welcome", v: PROTOCOL, code });
        set({ state: "connected", device: me.device, message: undefined });
        api.sim.rec.log(
          api.sim.time,
          "info",
          `Instructor connected (${me.device})`,
        );
        return;
      }
      if (!me || !active || active.conn !== conn) return;
      active.last = Date.now();
      if (m.k === "ping") conn.send({ k: "pong", t: m.t });
      else if (m.k === "bye") {
        active = null;
        conn.close();
        set({
          state: netUp ? "waiting" : "offline",
          device: undefined,
          message: `${me.device} disconnected.`,
        });
      } else if (m.k === "cmd") {
        const c = validateCommand(m.c);
        if (!c) {
          conn.send({
            k: "ack",
            id: m.id,
            ok: false,
            text: "Command not understood",
          });
          return;
        }
        const sim = api.sim;
        const before = { t: sim.time, lat: sim.ac.s.lat, paused: sim.paused };
        try {
          api.command(c);
        } catch (e) {
          conn.send({
            k: "ack",
            id: m.id,
            ok: false,
            text: `Failed: ${String((e as Error)?.message ?? e).slice(0, 80)}`,
          });
          return;
        }
        let after: RemoteSnapshot | null = null;
        if (c.type === "procConfirm" || c.type === "drillFire" || c.type === "gradeProcedures")
          try {
            after = api.snapshot();
          } catch {
            after = null;
          }
        conn.send({ k: "ack", id: m.id, ...verify(sim, c, before, after) });
      }
    });
    conn.onClose(() => {
      if (active?.conn !== conn) return;
      const dev = active.device;
      active = null;
      if (!closed)
        set({
          state: netUp ? "waiting" : "offline",
          device: undefined,
          message: `${dev} disconnected. It can reconnect with the same code.`,
        });
    });
  };

  const startAll = () => {
    for (const t of transports) {
      t.start(peerIdFor(code), {
        conn: accept,
        state: (s, why) => {
          if (closed) return;
          if (s === "up") {
            netUp = true;
            if (!active) set({ state: "waiting", message: undefined });
          } else if (s === "down") {
            netUp = false;
            if (!active) set({ state: "reconnecting", message: why });
          } else if (why === "unavailable-id" && attempts++ < 4) {
            // somebody holds this code on the broker: draw another one
            transports.forEach((x) => x.close());
            code = newPairCode();
            host.url = remoteUrl(code);
            host.peerId = peerIdFor(code);
            host.code = code;
            set({ state: "starting" });
            startAll();
          } else
            set({
              state: "offline",
              message:
                why === "unavailable-id"
                  ? "Could not register a pairing code. Try again."
                  : why,
            });
        },
      });
    }
  };

  const onHide = () => host.close();
  const host: RemoteHost = {
    url: remoteUrl(code),
    peerId: peerIdFor(code),
    code,
    status: () => st,
    onStatus(cb) {
      subs.add(cb);
      cb(st);
      return () => subs.delete(cb);
    },
    kick() {
      if (!active) return;
      const a = active;
      active = null;
      a.conn.send({
        k: "bye",
        reason: "The simulator disconnected this console.",
      });
      a.conn.close();
      set({
        state: netUp ? "waiting" : "offline",
        device: undefined,
        message: undefined,
      });
    },
    close() {
      if (closed) return;
      if (active)
        active.conn.send({
          k: "bye",
          reason: "The simulator ended the pairing.",
        });
      active?.conn.close();
      active = null;
      closed = true;
      clearInterval(tick);
      if (typeof window !== "undefined")
        window.removeEventListener("pagehide", onHide);
      // let the goodbye leave before the channel goes
      setTimeout(() => transports.forEach((t) => t.close()), 200);
      set({ state: "closed", device: undefined, message: undefined });
      subs.clear();
    },
  };
  if (typeof window !== "undefined")
    window.addEventListener("pagehide", onHide);
  startAll();
  // with no network transport answering within a few seconds, say so (same-computer pairing still works)
  setTimeout(() => {
    if (!closed && st.state === "starting")
      set({
        message:
          "Still reaching the pairing service (a phone or tablet needs internet). A second window on this computer can pair now.",
      });
  }, 4000);
  return host;
}
