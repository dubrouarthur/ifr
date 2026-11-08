// ATC radio: clear on-screen transmissions (facility · frequency · callsign · message) with history and
// "say again", spoken with radio phraseology (digits, thousands, flight levels, "niner", "decimal")
// and a squelch tail.
import { h, clear, store } from "./dom";
import { svgIcon } from "./icons";
import { lang, onLangChange } from "./i18n";

/** the card's own words in the UI language (the transmissions stay in English phraseology) */
const L = (en: string, fr: string) => (lang() === "fr" ? fr : en);
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
    this.hist = h("div", { class: "atc-hist" });
    const vbtn = h("button", {
      class: "atc-b atc-voice",
      type: "button",
      "aria-pressed": String(this.voiceOn),
      onclick: () => {
        this.voiceOn = !this.voiceOn;
        store.set("ifr.atc.voice", this.voiceOn);
        syncVoice();
        if (!this.voiceOn && "speechSynthesis" in window) speechSynthesis.cancel();
      },
    });
    const syncVoice = () => {
      vbtn.setAttribute("aria-pressed", String(this.voiceOn));
      vbtn.setAttribute("aria-label", L("ATC voice", "Voix ATC"));
      vbtn.title = this.voiceOn
        ? L("ATC voice on — click to mute", "Voix ATC activée : cliquez pour la couper")
        : L("ATC voice off — click to hear ATC", "Voix ATC coupée : cliquez pour entendre l’ATC");
      vbtn.replaceChildren(svgIcon(this.voiceOn ? "sound" : "mute", 14));
    };
    syncVoice();
    const logBtn = h(
      "button",
      {
        class: "atc-b",
        type: "button",
        "aria-pressed": "false",
        onclick: () => {
          const on = this.el.classList.toggle("show-hist");
          logBtn.setAttribute("aria-pressed", String(on));
        },
      },
    );
    this.el = h(
      "div",
      { class: "atc-radio empty", role: "log", "aria-live": "polite" },
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
              class: "atc-b atc-again",
              type: "button",
              onclick: () => this.sayAgain(),
            },
          ),
          logBtn,
          vbtn,
        ),
      ),
      this.body,
      this.hist,
    );
    const again = this.el.querySelector<HTMLElement>(".atc-again")!;
    const words = () => {
      this.hist.setAttribute("aria-label", L("Earlier transmissions", "Messages précédents"));
      logBtn.title = L("Earlier transmissions", "Messages précédents");
      logBtn.textContent = L("Log", "Historique");
      this.el.setAttribute("aria-label", L("ATC radio", "Radio ATC"));
      again.title = L("Say again (repeat the last transmission)", "Répéter le dernier message");
      again.textContent = L("Say again", "Répéter");
      syncVoice();
    };
    words();
    onLangChange(words);
    // iPad portrait under the lesson strip the card is one line: a tap on the message opens it in full (and folds it)
    this.body.addEventListener("click", () => {
      if (!this.el.classList.contains("atc-one")) return;
      const open = this.el.classList.toggle("atc-open");
      this.body.setAttribute("aria-expanded", String(open));
    });
    this.body.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && this.el.classList.contains("atc-one")) {
        e.preventDefault();
        e.stopPropagation();
        this.body.click();
      }
    });
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

  /** iPad portrait with the lesson strip: the card is one line under it, a tap opens the full message */
  setOneLine(on: boolean) {
    if (this.el.classList.contains("atc-one") === on) return;
    this.el.classList.toggle("atc-one", on);
    if (!on) this.el.classList.remove("atc-open");
    if (on) {
      this.body.setAttribute("tabindex", "0");
      this.body.setAttribute("role", "button");
      this.body.setAttribute("aria-expanded", "false");
      this.body.setAttribute("aria-label", L("ATC message: tap to read it in full", "Message ATC : touchez pour le lire en entier"));
    } else ["tabindex", "role", "aria-expanded", "aria-label"].forEach((a) => this.body.removeAttribute(a));
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

  /** the radio can receive (COM working and powered). A radio failure (or a dead bus) silences ATC until it is
   *  cleared: the student flies the lost-communication procedure. */
  get comOk(): boolean {
    return this.sim.sys?.comOk !== false;
  }
  /** transmissions ATC made while the radio was dead (the debrief / instructor see them, the student does not) */
  missed = 0;
  private wasOk = true;
  /** every frame or so: a radio that just failed goes silent at once (a transmission being spoken stops) */
  update() {
    const ok = this.comOk;
    if (ok !== this.wasOk) {
      this.wasOk = ok;
      this.el.classList.toggle("nocom", !ok);
      this.el.querySelectorAll<HTMLButtonElement>(".atc-again").forEach((b) => (b.disabled = !ok));
      if (!ok && "speechSynthesis" in window) speechSynthesis.cancel();
    }
    // transponder failure: radar loses the reply — ATC calls the aircraft a little later (if it can hear ATC)
    const sim = this.sim;
    const xok = sim.sys?.xpdrOk !== false;
    if (!xok && this.xpdrWas && !sim.ac.s.onGround) this.xpdrCallAt = sim.time + 20;
    this.xpdrWas = xok;
    if (xok) this.xpdrCallAt = null;
    else if (this.xpdrCallAt !== null && sim.time >= this.xpdrCallAt) {
      this.xpdrCallAt = null;
      if (!sim.ac.s.onGround && sim.av.xpdrMode !== "STBY")
        this.say(`transponder not received, recycle, squawk ${sim.av.xpdr}`);
    }
  }
  private xpdrWas = true;
  private xpdrCallAt: number | null = null;

  /** transmit an ATC message (shown and spoken). `addressed`: prefix the callsign. Returns false when the radio
   *  could not receive it (radio failure): nothing is shown or heard, the flight record notes it. */
  say(text: string, addressed = true): boolean {
    if (!text) return false;
    if (!this.comOk) {
      this.missed++;
      this.sim.rec.log(this.sim.time, "info", `ATC transmission not received (radio failure): ${text}`, `Message ATC non reçu (panne radio) : ${text}`);
      return false;
    }
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
    return true;
  }

  sayAgain() {
    const tr = this.log[0];
    // "say again" is a transmission too: nothing comes back on a dead radio
    if (tr && this.comOk) this.speak(tr);
  }

  clear() {
    this.log = [];
    this.missed = 0;
    this.xpdrCallAt = null;
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
      this.body.append(h("div", { class: "atc-msg", title: tr.text }, tr.text));
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
