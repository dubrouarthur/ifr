// « Capturer un moment pour la diapo »: what a capture from the cockpit is, in pilot words, and when a moment cannot be
// one. Pure functions over a Sim (the cockpit's live one, or a Sim posed at a stored scene) so the cockpit, the studio
// and the tests all say the same thing:
//
//   momentFacts(sim)        the numbers a slide's instruments will show (heading, altitude, speed, turn, position)
//   momentLine(facts, lang) « 270° · 3 000 ft · 100 kt · virage 15° D · ARD radial 090 6 NM »
//   captureRefusal(sim)     null, or why this moment cannot go on a slide (a crash, beyond VNE, beyond the load
//                           limits, under the ground, numbers that are not numbers)
//   sceneRefusal(scene)     the same for a stored capture (an older capture of a crash is never used on a slide)
import type { Sim } from "../sim/sim";
import { AIRFRAME } from "../sim/aircraft";
import { NAVAIDS, runway } from "../nav/data";
import { bearingDeg, distanceNm, norm360 } from "../nav/geo";
import type { Lang, SimScene } from "./types";

/** what a captured moment shows, rounded the way a pilot reads it */
export interface MomentFacts {
  /** heading, ° (the training region has no magnetic variation) */
  hdg: number;
  /** indicated altitude, ft */
  altFt: number;
  iasKt: number;
  /** vertical speed, ft/min (rounded to 50) */
  vsFpm: number;
  /** bank, ° (right positive) */
  bank: number;
  onGround: boolean;
  /** the wing is stalled (the moment is still a valid one: a stall is taught too) */
  stalled: boolean;
  /** where: on an ILS final, else from the nearest VOR or NDB */
  pos:
    | { kind: "ils"; rwy: string; airport: string; distNm: number }
    | {
        kind: "radial";
        station: string;
        radial: number;
        distNm: number;
        ndb: boolean;
      }
    | { kind: "none" };
}

const pad3 = (x: number) =>
  String(Math.round(norm360(x)) % 360 || 360).padStart(3, "0");
const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** The facts of the live moment. */
export function momentFacts(sim: Sim): MomentFacts {
  const d = sim.ac.data;
  const s = sim.ac.s;
  const alt = sim.indicatedAlt();
  let pos: MomentFacts["pos"] = { kind: "none" };
  const ap = sim.fp.approach;
  const nav = sim.av.cdi === "NAV2" ? sim.nav2 : sim.nav1;
  if (ap && nav.valid && nav.isLoc && Math.abs(nav.dev) < 1) {
    let thr = NaN;
    try {
      thr = distanceNm(s, runway(ap.airport, ap.runway).threshold);
    } catch {
      thr = NaN;
    }
    const dist = Number.isFinite(thr) ? thr : (nav.dmeNm ?? NaN);
    if (Number.isFinite(dist))
      pos = {
        kind: "ils",
        rwy: ap.runway,
        airport: ap.airport,
        distNm: round1(dist),
      };
  }
  if (pos.kind === "none" && finite(s.lat, s.lon)) {
    // a VOR first (what a slide says: « ARD radial 090 »), an NDB only when no VOR is near
    const nearest = (kinds: string[]) => {
      let n: (typeof NAVAIDS)[number] | null = null;
      let d = Infinity;
      for (const x of NAVAIDS) {
        if (!kinds.includes(x.type)) continue;
        const dd = distanceNm(s, x);
        if (dd < d) {
          d = dd;
          n = x;
        }
      }
      return { n, d };
    };
    let { n: best, d: bd } = nearest(["VOR", "VORDME"]);
    if (!best || bd > 40) ({ n: best, d: bd } = nearest(["VOR", "VORDME", "NDB"]));
    if (best && bd < 200)
      pos = {
        kind: "radial",
        station: best.ident,
        radial: Math.round(norm360(bearingDeg(best, s))) % 360,
        distNm: round1(bd),
        ndb: best.type === "NDB",
      };
  }
  const vs = Math.round((d?.vsFpm ?? 0) / 50) * 50;
  return {
    hdg: Math.round(norm360(d?.hdgTrue ?? (s.psi * 180) / Math.PI)) % 360,
    altFt: Math.round(alt / 10) * 10,
    iasKt: Math.round(d?.iasKt ?? 0),
    vsFpm: vs === 0 ? 0 : vs,
    bank: Math.round(d?.rollDeg ?? (s.phi * 180) / Math.PI),
    onGround: !!s.onGround,
    stalled: !!sim.ac.stalled,
    pos,
  };
}
const round1 = (x: number) => Math.round(x * 10) / 10;

function thousands(n: number, lang: Lang): string {
  const s = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return n < 0 ? `−${s}` : s;
}
const nm = (x: number, lang: Lang) =>
  `${x.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: x < 10 ? 1 : 0 })} NM`;

/** « 270° · 3 000 ft · 100 kt · virage 15° D · ARD radial 090 6 NM » (EN: « … · 15° right turn · … »). */
export function momentLine(f: MomentFacts, lang: Lang = "en"): string {
  const fr = lang === "fr";
  const parts: string[] = [
    `${pad3(f.hdg)}°`,
    `${thousands(f.altFt, lang)} ft`,
    `${f.iasKt} kt`,
  ];
  if (f.onGround) parts.push(fr ? "au sol" : "on the ground");
  else {
    if (Math.abs(f.vsFpm) >= 100)
      parts.push(
        f.vsFpm > 0
          ? fr
            ? `montée ${thousands(f.vsFpm, lang)} ft/min`
            : `climbing ${thousands(f.vsFpm, lang)} ft/min`
          : fr
            ? `descente ${thousands(-f.vsFpm, lang)} ft/min`
            : `descending ${thousands(-f.vsFpm, lang)} ft/min`,
      );
    const b = Math.abs(f.bank);
    if (b >= 3) {
      const side = f.bank < 0 ? (fr ? "G" : "left") : fr ? "D" : "right";
      parts.push(fr ? `virage ${b}° ${side}` : `${b}° ${side} turn`);
    } else parts.push(fr ? "ailes à plat" : "wings level");
  }
  if (f.stalled) parts.push(fr ? "décrochage" : "stalled");
  const p = f.pos;
  if (p.kind === "ils")
    parts.push(`ILS ${p.rwy} ${p.airport} ${nm(p.distNm, lang)}`);
  else if (p.kind === "radial")
    parts.push(
      p.ndb
        ? `${p.station} ${fr ? "relèvement" : "bearing"} ${pad3(p.radial)} ${nm(p.distNm, lang)}`
        : `${p.station} radial ${pad3(p.radial)} ${nm(p.distNm, lang)}`,
    );
  return parts.join(" · ");
}

export type RefusalCode =
  | "crashed"
  | "invalid"
  | "overspeed"
  | "overload"
  | "underground";
export interface Refusal {
  code: RefusalCode;
  /** one sentence: what is wrong and what to do */
  text: string;
}

/** the structural limits a slide's moment must stay inside (C172S normal category: +3.8 g / −1.52 g, VNE) */
export const ENVELOPE = {
  vneKt: AIRFRAME.vne,
  gMax: 3.8,
  gMin: -1.52,
} as const;

function refusalText(
  code: RefusalCode,
  lang: Lang,
  extra: Record<string, string | number> = {},
): string {
  const fr = lang === "fr";
  switch (code) {
    case "crashed":
      return fr
        ? "L’avion s’est écrasé : ce moment ne peut pas aller sur une diapo. Revenez 10 s en arrière ou repartez de la situation de la diapo."
        : "The aircraft has crashed: this moment cannot go on a slide. Go back 10 s or start again from the slide’s situation.";
    case "overspeed":
      return fr
        ? `L’avion vole au-delà de la VNE (${extra.ias} kt pour ${ENVELOPE.vneKt} kt au maximum) : réduisez la vitesse, puis capturez.`
        : `The aircraft is beyond VNE (${extra.ias} kt, ${ENVELOPE.vneKt} kt at most): slow down, then capture.`;
    case "overload":
      return fr
        ? `Facteur de charge hors limites (${extra.g} g, de ${ENVELOPE.gMin} à +${ENVELOPE.gMax} g permis) : relâchez les commandes, puis capturez.`
        : `Load factor out of limits (${extra.g} g, ${ENVELOPE.gMin} to +${ENVELOPE.gMax} g allowed): ease off the controls, then capture.`;
    case "underground":
      return fr
        ? "L’avion est sous le sol : ce moment n’existe pas. Revenez 10 s en arrière."
        : "The aircraft is below the ground: this moment does not exist. Go back 10 s.";
    case "invalid":
      return fr
        ? "Le simulateur n’a pas de position valable à cet instant : rien n’a été capturé. Repartez de la situation de la diapo."
        : "The simulator has no valid position right now: nothing was captured. Start again from the slide’s situation.";
  }
}

/** Why the live moment cannot be captured for a slide (null: it can). */
export function captureRefusal(sim: Sim, lang: Lang = "en"): Refusal | null {
  const s = sim.ac.s;
  const d = sim.ac.data;
  if (s.crashed) return { code: "crashed", text: refusalText("crashed", lang) };
  if (
    !finite(s.lat, s.lon, s.altFt, s.tas, s.phi, s.theta, s.psi) ||
    (d && !finite(d.iasKt, d.altFt, d.vsFpm))
  )
    return { code: "invalid", text: refusalText("invalid", lang) };
  if (d && Number.isFinite(d.aglFt) && d.aglFt < -5 && !s.onGround)
    return { code: "underground", text: refusalText("underground", lang) };
  if (d && d.iasKt > ENVELOPE.vneKt)
    return {
      code: "overspeed",
      text: refusalText("overspeed", lang, { ias: Math.round(d.iasKt) }),
    };
  if (d && !s.onGround && (d.gLoad > ENVELOPE.gMax || d.gLoad < ENVELOPE.gMin))
    return {
      code: "overload",
      text: refusalText("overload", lang, { g: d.gLoad.toFixed(1) }),
    };
  return null;
}

/** Why a stored capture cannot be shown on a slide (null: it can). Only the exact poses the cockpit stores are read. */
export function sceneRefusal(
  scene: SimScene,
  lang: Lang = "en",
): Refusal | null {
  if (scene.pose.kind !== "exact") return null;
  const ac = scene.pose.ac;
  if (ac.crashed)
    return { code: "crashed", text: refusalText("crashed", lang) };
  if (!finite(ac.lat, ac.lon, ac.altFt, ac.tas, ac.phi, ac.theta, ac.psi))
    return { code: "invalid", text: refusalText("invalid", lang) };
  return null;
}

/** what the studio says when the device keeps nothing (blocked storage): the captures cannot come back */
export function noStorageText(lang: Lang): string {
  return lang === "fr"
    ? "Ce navigateur ne garde rien sur cet appareil (stockage bloqué, navigation privée) : les captures ne pourront pas revenir sur la diapo. Autorisez le stockage du site, ou réglez la situation dans le studio."
    : "This browser keeps nothing on this device (storage blocked, private browsing): captures cannot come back to the slide. Allow site storage, or set the situation in the studio.";
}
