// Instructor console (remote.html): runs on the instructor's phone or tablet and drives the simulator over a
// WebRTC data channel (PeerJS broker), or over a BroadcastChannel when both pages are in the same browser.
// It bundles none of the simulator: everything it shows comes from the host's snapshots.
import "../styles/remote.css";
import { Console } from "./ui";
import {
  PROTOCOL,
  deviceName,
  parsePairCode,
  peerIdFor,
  type ClientMsg,
  type HostMsg,
  type RemoteCommand,
} from "../connect/remoteTypes";

export type LinkState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "refused"
  | "notfound"
  | "ended"
  | "error";

interface ClientConn {
  send(m: ClientMsg): void;
  close(): void;
}

const ss = {
  get(k: string): string | null {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
/** this console's identity for the session: a reload reconnects as the same instructor (not a second one) */
const cid =
  ss.get("ifr.remote.cid") ??
  (() => {
    const v = Math.random().toString(36).slice(2, 12);
    ss.set("ifr.remote.cid", v);
    return v;
  })();
const device = deviceName(navigator.userAgent, navigator.maxTouchPoints || 0);

/** same-browser host? (a second window at the instructor's desk) */
function probeLocal(
  code: string,
  timeoutMs = 1200, // a busy simulator window (a slow laptop, a heavy scene) may take a moment to answer
): Promise<BroadcastChannel | null> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(null);
  return new Promise((res) => {
    const ch = new BroadcastChannel(`ifr-remote:${peerIdFor(code)}`);
    const t = setTimeout(() => {
      ch.close();
      res(null);
    }, timeoutMs);
    ch.onmessage = (e: MessageEvent) => {
      if (
        (e.data as { to?: string; here?: boolean })?.to === cid &&
        (e.data as { here?: boolean }).here
      ) {
        clearTimeout(t);
        ch.onmessage = null;
        res(ch);
      }
    };
    ch.postMessage({ to: "host", from: cid, probe: true });
  });
}

class Link {
  state: LinkState = "idle";
  message = "";
  code = "";
  local = false;
  private conn: ClientConn | null = null;
  private peer: import("peerjs").Peer | null = null;
  private lastRx = 0;
  private retryT: ReturnType<typeof setTimeout> | undefined;
  private pingT: ReturnType<typeof setInterval> | undefined;
  private attempt = 0;
  private everConnected = false;
  private nextId = 1;
  onState: (s: LinkState, msg: string) => void = () => {};
  onMsg: (m: HostMsg) => void = () => {};

  private set(s: LinkState, msg = "") {
    this.state = s;
    this.message = msg;
    this.onState(s, msg);
  }

  connect(code: string) {
    this.stop();
    this.code = code;
    this.attempt = 0;
    this.everConnected = false;
    ss.set("ifr.remote.code", code);
    if (location.hash.slice(1) !== code)
      history.replaceState(null, "", `#${code}`);
    this.set("connecting");
    void this.open();
  }

  private async open() {
    clearTimeout(this.retryT);
    const code = this.code;
    const ch = await probeLocal(code);
    if (code !== this.code) {
      ch?.close();
      return;
    }
    if (ch) {
      this.openLocal(ch);
      return;
    }
    try {
      const { Peer } = await import("peerjs");
      if (code !== this.code) return;
      if (!this.peer || this.peer.destroyed) {
        this.peer = new Peer({ debug: 0 });
        this.peer.on("error", (e: { type?: string }) =>
          this.peerError(e.type ?? ""),
        );
        this.peer.on("disconnected", () => {
          if (this.peer && !this.peer.destroyed)
            setTimeout(
              () =>
                this.peer &&
                !this.peer.destroyed &&
                this.peer.disconnected &&
                this.peer.reconnect(),
              1500,
            );
        });
      }
      const go = () => {
        if (!this.peer || code !== this.code) return;
        const dc = this.peer.connect(peerIdFor(code), {
          reliable: true,
          serialization: "json",
        });
        let opened = false;
        dc.on("open", () => {
          opened = true;
          this.local = false;
          this.attach({
            send: (m) => {
              if (dc.open) void dc.send(m);
            },
            close: () => dc.close(),
          });
        });
        dc.on("data", (m) => this.rx(m));
        dc.on("close", () => this.lost(opened));
        dc.on("error", () => this.lost(opened));
        // the broker never answers for a peer that is gone: give up this attempt after a while
        setTimeout(() => {
          if (
            !opened &&
            code === this.code &&
            this.state !== "refused" &&
            this.state !== "notfound"
          ) {
            dc.close();
            this.lost(false);
          }
        }, 12000);
      };
      if (this.peer.open) go();
      else this.peer.once("open", go);
    } catch {
      this.set(
        "error",
        "The connection component could not be loaded. Reload the page.",
      );
    }
  }

  private openLocal(ch: BroadcastChannel) {
    this.local = true;
    let closed = false;
    ch.onmessage = (e: MessageEvent) => {
      const d = e.data as { to?: string; m?: unknown; closed?: boolean };
      if (d?.to !== cid) return;
      if (d.closed) {
        closed = true;
        ch.close();
        this.lost(true);
        return;
      }
      this.rx(d.m);
    };
    ch.postMessage({ to: "host", from: cid, open: true });
    this.attach({
      send: (m) => {
        if (!closed) ch.postMessage({ to: "host", from: cid, m });
      },
      close: () => {
        if (!closed) {
          closed = true;
          ch.postMessage({ to: "host", from: cid, closed: true });
          ch.close();
        }
      },
    });
  }

  private attach(c: ClientConn) {
    this.conn = c;
    this.lastRx = Date.now();
    c.send({ k: "hello", v: PROTOCOL, cid, device });
    clearInterval(this.pingT);
    this.pingT = setInterval(() => {
      if (!this.conn) return;
      this.conn.send({ k: "ping", t: Date.now() });
      if (Date.now() - this.lastRx > 6000) {
        this.conn.close();
        this.lost(true);
      }
    }, 2000);
  }

  private rx(raw: unknown) {
    const m = raw as HostMsg;
    if (
      !m ||
      typeof m !== "object" ||
      typeof (m as { k?: unknown }).k !== "string"
    )
      return;
    this.lastRx = Date.now();
    if (m.k === "welcome") {
      this.attempt = 0;
      this.everConnected = true;
      this.set("connected");
    } else if (m.k === "refused") {
      this.halt();
      this.set("refused", m.reason);
      return;
    } else if (m.k === "bye") {
      this.halt();
      this.set("ended", m.reason);
      return;
    }
    this.onMsg(m);
  }

  private peerError(type: string) {
    if (type === "peer-unavailable") {
      if (!this.everConnected) {
        this.halt();
        this.set(
          "notfound",
          "No simulator is waiting with this code. Check the code on the simulator: it changes each time pairing is opened.",
        );
      } else this.lost(false);
    } else if (
      type === "network" ||
      type === "server-error" ||
      type === "socket-error" ||
      type === "socket-closed"
    ) {
      if (this.state === "connected" && this.conn) return; // the data channel survives a broker hiccup
      this.lost(
        false,
        "Cannot reach the pairing service. Check this device’s internet connection.",
      );
    } else if (type === "browser-incompatible") {
      this.halt();
      this.set(
        "error",
        "This browser cannot open a WebRTC connection. Use Safari, Chrome or Firefox.",
      );
    }
  }

  /** the channel dropped: retry with a growing delay */
  private lost(wasOpen: boolean, msg?: string) {
    if (
      !this.code ||
      this.state === "refused" ||
      this.state === "ended" ||
      this.state === "notfound" ||
      this.state === "idle"
    )
      return;
    if (this.retryT && !wasOpen && this.state === "reconnecting") return;
    this.conn = null;
    clearInterval(this.pingT);
    this.attempt++;
    this.set(
      this.everConnected ? "reconnecting" : "connecting",
      msg ??
        (this.everConnected
          ? "Connection to the simulator lost. Reconnecting…"
          : "Still trying to reach the simulator…"),
    );
    clearTimeout(this.retryT);
    this.retryT = setTimeout(
      () => {
        this.retryT = undefined;
        void this.open();
      },
      Math.min(10000, 1000 * this.attempt),
    );
  }

  private halt() {
    clearTimeout(this.retryT);
    this.retryT = undefined;
    clearInterval(this.pingT);
    this.conn?.close();
    this.conn = null;
  }

  stop() {
    if (this.conn) this.conn.send({ k: "bye" });
    this.halt();
    this.code = "";
    this.set("idle");
  }

  send(c: RemoteCommand): number | null {
    if (!this.conn || this.state !== "connected") return null;
    const id = this.nextId++;
    this.conn.send({ k: "cmd", id, c });
    return id;
  }
}

// ------------------------------------------------------------------ boot
const root = document.getElementById("remote")!;
const link = new Link();
const ui = new Console(root, {
  connect: (raw) => {
    const code = parsePairCode(raw);
    if (code) link.connect(code);
    return !!code;
  },
  send: (c) => link.send(c),
  disconnect: () => {
    link.stop();
    history.replaceState(null, "", location.pathname);
  },
});
link.onState = (s, msg) => ui.setLink(s, msg, link.code, link.local);
link.onMsg = (m) => ui.onHost(m);
const initial = parsePairCode(decodeURIComponent(location.hash.slice(1)));
if (initial) link.connect(initial);
else ui.setLink("idle", "", "", false);
window.addEventListener("hashchange", () => {
  const c = parsePairCode(decodeURIComponent(location.hash.slice(1)));
  if (c && c !== link.code) link.connect(c);
});
window.addEventListener("pagehide", () => link.stop());
// back from the browser's page cache (app switch, back button): pick the session up again
window.addEventListener("pageshow", (e: PageTransitionEvent) => {
  if (!e.persisted || link.state !== "idle") return;
  const c = parsePairCode(decodeURIComponent(location.hash.slice(1))) ?? parsePairCode(ss.get("ifr.remote.code") ?? "");
  if (c) link.connect(c);
});
(window as unknown as { __remote: unknown }).__remote = { link, ui };
