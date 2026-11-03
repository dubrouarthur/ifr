// ATC radio: clear on-screen transmissions (facility · frequency · callsign · message) with history and
// "say again", spoken with radio phraseology (digits, thousands, flight levels, "niner", "decimal")
// and a squelch tail.
import { h, clear, store } from "./dom";
import { svgIcon } from "./icons";
import { AIRPORTS } from "../nav/data";
import { distanceNm } from "../nav/geo";
import type { Sim } from "../sim/sim";

const DIG = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "niner",
];
const digits = (s: string) =>
  s
    .split("")
    .map((c) => (c === "." ? "decimal" : /\d/.test(c) ? DIG[Number(c)] : c))
    .join(" ");

/** Radio phraseology for text-to-speech. */
export function speakify(text: string): string {
  let t = ` ${text} `;
  // frequencies 118.000–136.975 / 108–118 nav
  t = t.replace(
    /\b(1[0-3]\d)\.(\d{1,3})\b/g,
    (_, a, b) => `${digits(a)} decimal ${digits(b.replace(/0+$/, "") || "0")}`,
  );
  // flight levels
  t = t.replace(/\bFL\s?(\d{2,3})\b/gi, (_, a) => `flight level ${digits(a)}`);
  // headings / courses / radials / runway numbers
  t = t.replace(
    /\b(heading|course|radial|track|inbound|outbound|bearing)\s+(\d{3})°?/gi,
    (_, w, a) => `${w} ${digits(a)}`,
  );
  t = t.replace(/\b(\d{3})°/g, (_, a) => digits(a));
  t = t.replace(
    /\b(runway|RWY)\s+(\d{1,2})([LRC]?)\b/gi,
    (_, _w, a, s) =>
      `runway ${digits(a)}${s ? " " + ({ L: "left", R: "right", C: "center" } as Record<string, string>)[s.toUpperCase()] : ""}`,
  );
  // altitudes: thousands / hundreds
  t = t.replace(
    /\b(\d{1,2})(\d)00\b(?!\s*(?:kt|knots|°))/g,
    (_, th, hu) =>
      `${th
        .split("")
        .map((d: string) => DIG[Number(d)])
        .join(" ")} thousand${hu !== "0" ? ` ${DIG[Number(hu)]} hundred` : ""}`,
  );
  // squawk codes / remaining 4-digit numbers
  t = t.replace(/\b(squawk)\s+(\d{4})\b/gi, (_, w, a) => `${w} ${digits(a)}`);
  t = t
    .replace(/\bDME\b/g, "D M E")
    .replace(/\bILS\b/g, "I L S")
    .replace(/\bRNAV\b/g, "R nav")
    .replace(/\bVOR\b/g, "V O R")
    .replace(/\bNDB\b/g, "N D B")
    .replace(/\bLOC\b/g, "localizer");
  return t.replace(/\s+/g, " ").trim();
}

export interface Transmission {
  t: number;
  facility: string;
  freq: string;
  text: string;
}

export class AtcRadio {
  el: HTMLElement;
  callsign = store.get("ifr.callsign", "N172SP");
  voiceOn = store.get("ifr.atc.voice", true);
  private log: Transmission[] = [];
  private head: HTMLElement;
  private body: HTMLElement;
  private hist: HTMLElement;
  private voice: SpeechSynthesisVoice | null = null;

  constructor(
    private sim: Sim,
    private squelch: () => void,
  ) {
    this.head = h("div", { class: "atc-head" });
    this.body = h("div", { class: "atc-body" });
    this.hist = h("div", { class: "atc-hist", "aria-label": "Earlier transmissions" });
    const vbtn = h("button", {
      class: "atc-b atc-voice",
      type: "button",
      "aria-pressed": String(this.voiceOn),
      "aria-label": "ATC voice",
      onclick: () => {
        this.voiceOn = !this.voiceOn;
        store.set("ifr.atc.voice", this.voiceOn);
        syncVoice();
        if (!this.voiceOn && "speechSynthesis" in window) speechSynthesis.cancel();
      },
    });
    const syncVoice = () => {
      vbtn.setAttribute("aria-pressed", String(this.voiceOn));
      vbtn.title = this.voiceOn ? "ATC voice on — click to mute" : "ATC voice off — click to hear ATC";
      vbtn.replaceChildren(svgIcon(this.voiceOn ? "sound" : "mute", 14));
    };
    syncVoice();
    const logBtn = h(
      "button",
      {
        class: "atc-b",
        type: "button",
        "aria-pressed": "false",
        title: "Earlier transmissions",
        onclick: () => {
          const on = this.el.classList.toggle("show-hist");
          logBtn.setAttribute("aria-pressed", String(on));
        },
      },
      "Log",
    );
    this.el = h(
      "div",
      { class: "atc-radio empty", role: "log", "aria-live": "polite", "aria-label": "ATC radio" },
      h(
        "div",
        { class: "atc-top" },
        this.head,
        h(
          "div",
          { class: "atc-tools" },
          h(
            "button",
            {
              class: "atc-b",
              type: "button",
              title: "Say again (repeat the last transmission)",
              onclick: () => this.sayAgain(),
            },
            "Say again",
          ),
          logBtn,
          vbtn,
        ),
      ),
      this.body,
      this.hist,
    );
    if ("speechSynthesis" in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice =
          vs.find(
            (v) =>
              /en-US/i.test(v.lang) &&
              /(Guy|David|Daniel|Alex|Aaron|Google US English|Male)/i.test(
                v.name,
              ),
          ) ??
          vs.find((v) => /^en/i.test(v.lang)) ??
          null;
      };
      pick();
      speechSynthesis.addEventListener?.("voiceschanged", pick);
    }
  }

  /** controlling facility + frequency for the aircraft position */
  facility(): { name: string; freq: string } {
    const s = this.sim.ac.s;
    const near = [...AIRPORTS].sort(
      (a, b) => distanceNm(a, s) - distanceNm(b, s),
    )[0];
    if (!near) return { name: "Center", freq: "125.30" };
    const d = distanceNm(near, s);
    const agl = this.sim.ac.data.aglFt;
    const f = near.freqs;
    if (this.sim.ac.s.onGround && f.ground)
      return {
        name: `${near.name.replace(/ (International|Intl|Regional|Municipal|Airport).*$/i, "")} Ground`,
        freq: f.ground.toFixed(2),
      };
    if (d < 6 && agl < 2500 && f.tower)
      return { name: `${near.icao} Tower`, freq: f.tower.toFixed(2) };
    if (f.approach)
      return {
        name: `${near.city || near.icao} Approach`,
        freq: f.approach.toFixed(2),
      };
    return {
      name: `${near.icao} Approach`,
      freq: (f.tower ?? 119.1).toFixed(2),
    };
  }

  /** transmit an ATC message (shown and spoken). `addressed`: prefix the callsign */
  say(text: string, addressed = true) {
    if (!text) return;
    const fac = this.facility();
    const msg = addressed
      ? `${this.callsign}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`
      : text;
    const tr: Transmission = {
      t: this.sim.time,
      facility: fac.name,
      freq: fac.freq,
      text: msg,
    };
    this.log.unshift(tr);
    this.log = this.log.slice(0, 12);
    this.render();
    this.speak(tr);
  }

  sayAgain() {
    const tr = this.log[0];
    if (tr) this.speak(tr);
  }

  clear() {
    this.log = [];
    this.render();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  private speak(tr: Transmission) {
    if (!this.voiceOn || !("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      this.squelch();
      const u = new SpeechSynthesisUtterance(
        speakify(tr.text.replace(this.callsign, this.phonetic(this.callsign))),
      );
      if (this.voice) u.voice = this.voice;
      u.rate = 1.08;
      u.pitch = 0.92;
      u.volume = 0.95;
      u.onend = () => this.squelch();
      speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }

  private phonetic(cs: string): string {
    const A: Record<string, string> = {
      A: "Alpha",
      B: "Bravo",
      C: "Charlie",
      D: "Delta",
      E: "Echo",
      F: "Foxtrot",
      G: "Golf",
      H: "Hotel",
      I: "India",
      J: "Juliett",
      K: "Kilo",
      L: "Lima",
      M: "Mike",
      N: "November",
      O: "Oscar",
      P: "Papa",
      Q: "Quebec",
      R: "Romeo",
      S: "Sierra",
      T: "Tango",
      U: "Uniform",
      V: "Victor",
      W: "Whiskey",
      X: "X-ray",
      Y: "Yankee",
      Z: "Zulu",
    };
    return cs
      .toUpperCase()
      .split("")
      .map((c) => A[c] ?? (/\d/.test(c) ? DIG[Number(c)] : c))
      .join(" ");
  }

  private render() {
    const tr = this.log[0];
    this.el.classList.toggle("empty", !tr);
    this.el.classList.toggle("has-hist", this.log.length > 1);
    clear(this.head);
    clear(this.body);
    if (tr) {
      this.head.append(
        h("span", { class: "atc-led" }),
        h("b", {}, tr.facility),
        h("span", { class: "atc-freq" }, tr.freq),
      );
      this.body.append(h("div", { class: "atc-msg" }, tr.text));
    }
    clear(this.hist);
    for (const x of this.log.slice(1))
      this.hist.append(
        h(
          "div",
          {},
          h("b", {}, `${x.facility} ${x.freq}`),
          h("span", {}, x.text),
        ),
      );
  }
}
