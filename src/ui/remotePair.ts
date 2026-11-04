// Pair an instructor's phone or tablet: a QR code (and the same code to type), the connection state and Disconnect.
// The pairing outlives this window: closing it keeps the instructor connected; Disconnect ends it, and the next
// pairing draws a new code.
import qrcode from "qrcode-generator";
import { h, clear } from "./dom";
import { Modal } from "./modals";
import {
  startRemoteHost,
  simHostApi,
  isLocalOnly,
  type RemoteHost,
  type RemoteHostApi,
  type RemoteHostStatus,
} from "../connect/remoteLink";
import { formatPairCode } from "../connect/remoteTypes";
import type { Sim } from "../sim/sim";

let host: RemoteHost | null = null;
let modal: PairModal | null = null;

/** the running pairing, if any (the Instructor station shows its state) */
export function remoteHost(): RemoteHost | null {
  return host;
}

/** SVG QR code drawn as one path (crisp at any size, prints well) */
export function qrSvg(text: string, px = 240): SVGSVGElement {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4; // quiet zone, as the standard asks
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      const s = c;
      while (c < n && qr.isDark(r, c)) c++;
      d += `M${s + q} ${r + q}h${c - s}v1h${s - c}z`;
    }
  }
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const size = n + q * 2;
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(px));
  svg.setAttribute("height", String(px));
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `QR code for ${text}`);
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#fff");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", "#0f1722");
  // inline style: app-wide SVG stroke rules must not thicken the modules
  p.setAttribute("style", "fill:#0f1722;stroke:none");
  bg.setAttribute("style", "fill:#fff;stroke:none");
  svg.append(bg, p);
  return svg;
}

const STATE_TEXT: Record<RemoteHostStatus["state"], string> = {
  starting: "Preparing the code…",
  waiting: "Waiting for the instructor…",
  connected: "Connected",
  reconnecting: "Reconnecting to the pairing service…",
  offline: "Pairing service unavailable",
  closed: "Disconnected",
};

class PairModal extends Modal {
  private unsub: (() => void) | null = null;
  private statusEl = h("div", {
    class: "rp-status",
    role: "status",
    "aria-live": "polite",
  });
  private shownCode = "";
  constructor(private api: RemoteHostApi) {
    super("Pair a phone or tablet", "md");
    this.box.classList.add("rp");
  }
  show() {
    if (!host || host.status().state === 'closed') host = startRemoteHost(this.api);
    this.bind();
    this.open();
  }
  private bind() {
    this.unsub?.();
    this.shownCode = "";
    this.unsub = host!.onStatus((s) => this.render(s));
  }
  close() {
    super.close();
    this.unsub?.();
    this.unsub = null;
  }
  private render(s: RemoteHostStatus) {
    const hst = host;
    if (!hst) return;
    // the QR and the code only change with a new code: a status change must not rebuild them (no flicker)
    if (this.shownCode !== hst.code) {
      this.shownCode = hst.code;
      clear(this.body);
      const local = isLocalOnly(hst.url);
      const copy = h(
        "button",
        {
          class: "btn quiet rp-copy",
          type: "button",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(hst.url);
              copy.textContent = "Link copied";
            } catch {
              copy.textContent = "Copy failed";
            }
            setTimeout(() => (copy.textContent = "Copy link"), 1800);
          },
        },
        "Copy link",
      );
      this.body.append(
        h(
          "div",
          { class: "rp-grid" },
          h("div", { class: "rp-qr" }, qrSvg(hst.url, 232)),
          h(
            "div",
            { class: "rp-side" },
            h(
              "ol",
              { class: "rp-steps" },
              h(
                "li",
                {},
                h("b", {}, "Open the camera"),
                h(
                  "span",
                  {},
                  "on the phone or tablet and point it at the code.",
                ),
              ),
              h(
                "li",
                {},
                h("b", {}, "Tap the link"),
                h(
                  "span",
                  {},
                  "that appears. The instructor console opens in the browser.",
                ),
              ),
              h(
                "li",
                {},
                h("b", {}, "Run the session"),
                h(
                  "span",
                  {},
                  "failures, weather, vectors, reposition and freeze, with the aircraft on a live map.",
                ),
              ),
            ),
            h(
              "div",
              { class: "rp-code" },
              h("small", {}, "Or open the console and type the code"),
              h(
                "b",
                { "aria-label": `Code ${hst.code.split("").join(" ")}` },
                formatPairCode(hst.code),
              ),
              h(
                "div",
                { class: "rp-url" },
                h(
                  "span",
                  {},
                  hst.url.replace(/#.*$/, "").replace(/^https?:\/\//, ""),
                ),
                copy,
              ),
            ),
          ),
        ),
        ...(local ? [h(
              "p",
              { class: "rp-note" },
              h("b", {}, "This address only works on this computer. "),
              "A phone cannot open “localhost”: open the simulator from this computer’s network address (for example http://192.168.1.20:5173) or from the published site, then pair again.",
            )] : []),
        this.statusEl,
      );
    }
    this.renderStatus(s);
  }
  private renderStatus(s: RemoteHostStatus) {
    clear(this.statusEl);
    const kind =
      s.state === "connected"
        ? "on"
        : s.state === "offline"
          ? "bad"
          : s.state === "reconnecting"
            ? "warn"
            : "wait";
    this.statusEl.className = `rp-status ${kind}`;
    // the code is not usable until the pairing service has it: show the QR faded until then
    this.body.querySelector(".rp-qr")?.classList.toggle("pending", s.state !== "waiting" && s.state !== "connected");
    this.statusEl.append(
      h("i", { "aria-hidden": "true" }),
      h(
        "div",
        {},
        h(
          "b",
          {},
          s.state === "connected"
            ? `Connected: ${s.device ?? "instructor"}`
            : STATE_TEXT[s.state],
        ),
        h(
          "span",
          {},
          s.state === "connected"
            ? "The instructor sees this flight live. Closing this window keeps them connected."
            : (s.message ??
                (s.state === "waiting"
                  ? "One instructor at a time. The code changes each time you pair."
                  : "")),
        ),
      ),
    );
    clear(this.foot);
    this.foot.append(
      // while connected, a new code would cut the instructor off: Disconnect says that plainly
      s.state === "connected" ? h("span", {}) : h(
        "button",
        {
          class: "btn quiet",
          type: "button",
          title: "End this pairing and draw a new code",
          onclick: () => {
            host?.close();
            host = startRemoteHost(this.api);
            this.bind();
          },
        },
        "New code",
      ),
      h("span", { class: "grow" }),
      ...(s.state === "connected"
        ? [h(
            "button",
            {
              class: "btn danger",
              type: "button",
              onclick: () => {
                host?.close();
                host = null;
                this.close();
              },
            },
            "Disconnect",
          )] : []),
      h(
        "button",
        { class: "btn primary", type: "button", onclick: () => this.close() },
        s.state === "connected" ? "Done" : "Close",
      ),
    );
  }
}

/** open the pairing window (starts a pairing when none is running). `api` comes from the shell; a bare Sim works
 *  too (no lesson, no ATC voice). */
export function openRemotePair(api: RemoteHostApi | Sim | { sim: Sim }): void {
  const full: RemoteHostApi =
    "snapshot" in api && typeof api.snapshot === "function" && "command" in api
      ? (api as RemoteHostApi)
      : simHostApi("sim" in api ? (api as { sim: Sim }).sim : (api as Sim));
  if (!modal) modal = new PairModal(full);
  modal.show();
}

/** end the pairing (the console is told) */
export function closeRemotePair(): void {
  host?.close();
  host = null;
}
