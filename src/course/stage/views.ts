// Ground school stage — drawing the instrument panes. One dispatch to the cockpit's own renderers (drawPfd,
// drawMfd, drawSixPack, drawStack, drawAirlinerPfd, drawNd) and to single steam gauges, cropped with drawCropped
// (avionics/crop.ts) so a pane shows exactly its PaneFrame rectangle. Each drawn instrument has its OWN memory
// (PfdState / SteamState / AirlinerState); the MFD state is shared per page (its terrain cache is heavy).
// Also the pane's accessible name and the stage bar's scene line, both read from the Sim.
import type { Sim } from "../../sim/sim";
import { drawPfd, newPfdState, type PfdState } from "../../avionics/pfd";
import {
  drawMfd,
  mfdRange,
  newMfdState,
  type MfdState,
} from "../../avionics/mfd";
import {
  drawSixPack,
  drawStack,
  drawSteamGauge,
  newSteamState,
  stepSteamState,
  type SteamState,
} from "../../avionics/steam";
import {
  drawAirlinerPfd,
  drawNd,
  newAirlinerState,
  type AirlinerState,
} from "../../avionics/airliner";
import { drawCropped } from "../../avionics/crop";
import { NAVAIDS } from "../../nav/data";
import { bearingDeg, distanceNm } from "../../nav/geo";
import type { Cockpit, Lang } from "../types";
import { coverRect, type PaneFrame } from "./geometry";
import { dotsPerSide } from "../goals";
import { t } from "./strings";

export interface InstrumentStates {
  pfd: PfdState;
  steam: SteamState;
  airliner: AirlinerState;
  mfd: MfdState;
  /** ND range (NM) */
  ndRangeNm?: number;
}
let pageMfd: MfdState | null = null;
/** The page's one MfdState (terrain cache, range): created on first use. */
export function pageMfdState(): MfdState {
  return (pageMfd ??= newMfdState());
}
export function newInstrumentStates(
  mfd: MfdState = pageMfdState(),
): InstrumentStates {
  return {
    pfd: newPfdState(),
    steam: newSteamState(),
    airliner: newAirlinerState(),
    mfd,
  };
}

/** Backing-store size for a canvas shown at (cssW, cssH): device pixels, capped like fitCanvas. */
export function canvasPixels(
  cssW: number,
  cssH: number,
  dpr: number,
  cap = 1.75,
): { w: number; h: number } {
  const k = Math.min(cap, dpr || 1);
  return {
    w: Math.max(1, Math.round(cssW * k)),
    h: Math.max(1, Math.round(cssH * k)),
  };
}

export interface PaneDrawOptions {
  /** partial-panel covers (StageCue.covers / instrument block covers) */
  covers?: readonly ("ai" | "dg")[];
  lang?: Lang;
}

/**
 * Draw `frame` into ctx. The context's current transform must map the frame's SOURCE rectangle to the target
 * (renderPane does that); `dt` advances the instrument memory (0 for a frozen pane).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  frame: PaneFrame,
  st: InstrumentStates,
  dt: number,
  o: PaneDrawOptions = {},
): void {
  if (
    frame.kind === "diagram" ||
    frame.kind === "still" ||
    frame.kind === "image"
  )
    return;
  const draw = (c: CanvasRenderingContext2D) => {
    if (frame.kind === "gauge") {
      stepSteamState(st.steam, sim, dt);
      // the panel behind the gauge (the same grey as the six-pack)
      c.fillStyle = "#26292c";
      c.fillRect(frame.rect[0], frame.rect[1], frame.rect[2], frame.rect[3]);
      drawSteamGauge(
        c,
        sim,
        frame.gauge,
        frame.cx,
        frame.cy,
        frame.r,
        st.steam,
      );
      return;
    }
    switch (frame.display) {
      case "pfd":
        st.pfd.textScale = frame.cropped ? 1 : undefined;
        drawPfd(c, sim, st.pfd, dt);
        break;
      case "mfd":
        drawMfd(c, sim, st.mfd);
        break;
      case "six":
        drawSixPack(c, sim, dt, st.steam);
        break;
      case "stack":
        drawStack(c, sim, st.steam);
        break;
      case "airlinerPfd":
        drawAirlinerPfd(c, sim, st.airliner);
        break;
      case "nd":
        drawNd(c, sim, st.ndRangeNm ?? mfdRange(st.mfd));
        break;
    }
  };
  const [x, y, w, h] = frame.rect;
  drawCropped(ctx, draw, frame.rect, { dest: [x, y, w, h], fit: "fill" });
  for (const which of o.covers ?? []) {
    const r = coverRect(frame, which);
    if (r) drawCover(ctx, r, o.lang ?? "en");
  }
}

/** A suction-cup instrument cover (partial-panel practice), drawn over the instrument. */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  r: readonly [number, number, number, number],
  lang: Lang,
): void {
  const [x, y, w, h] = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rad = Math.min(w, h) / 2;
  ctx.save();
  ctx.fillStyle = "#101214";
  ctx.strokeStyle = "#2c3136";
  ctx.lineWidth = Math.max(2, rad * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.98, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.2, 0, Math.PI * 2);
  ctx.strokeStyle = "#23272b";
  ctx.stroke();
  ctx.fillStyle = "#6b737b";
  ctx.font = `700 ${Math.round(rad * 0.15)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t("covered", lang), cx, cy + rad * 0.48);
  ctx.restore();
}

/** Size the canvas to its CSS box, map the frame's source rectangle onto it and draw. Returns false when hidden. */
export function renderPane(
  canvas: HTMLCanvasElement,
  sim: Sim,
  frame: PaneFrame,
  st: InstrumentStates,
  dt: number,
  o: PaneDrawOptions = {},
): boolean {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!(cssW > 0 && cssH > 0)) return false;
  const px = canvasPixels(
    cssW,
    cssH,
    typeof window !== "undefined" ? window.devicePixelRatio : 1,
  );
  if (canvas.width !== px.w || canvas.height !== px.h) {
    canvas.width = px.w;
    canvas.height = px.h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const [x, y, w, h] = frame.rect;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px.w, px.h);
  // source rect → whole canvas
  const sx = px.w / w;
  const sy = px.h / h;
  ctx.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
  drawFrame(ctx, sim, frame, st, dt, o);
  return true;
}

// ------------------------------------------------------------------ words read from the Sim
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
function thousands(n: number, lang: Lang): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
}

/** CDI deviation in words: "1 dot right" (VOR 1 dot = 2°, G1000 / HSI 5 dots each side of full scale 10°). */
export function cdiWords(sim: Sim, lang: Lang, cockpit: Cockpit = "g1000"): string {
  const n = sim.navInputs();
  const fr = lang === "fr";
  const valid = n.cdi === "GPS" ? n.gps.valid : n.nav.valid;
  if (!valid) return fr ? "pas de signal" : "no signal";
  const dev = n.cdi === "GPS" ? n.gps.dev : n.nav.dev;
  const dots = Math.abs(dev) * dotsPerSide(cockpit);
  if (dots < 0.25) return fr ? "CDI centré" : "CDI centred";
  const side = dev > 0 ? (fr ? "à droite" : "right") : fr ? "à gauche" : "left";
  const d = Math.round(dots * 2) / 2;
  return fr
    ? `CDI ${String(d).replace(".", ",")} point${d > 1 ? "s" : ""} ${side}`
    : `CDI ${d} dot${d === 1 ? "" : "s"} ${side}`;
}

/** The pane's aria-label: "HSI: heading 120, course 090, CDI 1 dot right, TO flag". */
export function paneAriaLabel(
  frame: PaneFrame,
  sim: Sim,
  lang: Lang = "en",
): string {
  const fr = lang === "fr";
  const d = sim.ac.data;
  const n = sim.navInputs();
  const flag =
    n.cdi !== "GPS" && n.nav.valid
      ? n.nav.toFrom === "OFF"
        ? fr
          ? "drapeau OFF"
          : "OFF flag"
        : fr
          ? `drapeau ${n.nav.toFrom === "TO" ? "TO" : "FROM"}`
          : `${n.nav.toFrom} flag`
      : "";
  const hdg = `${fr ? "cap" : "heading"} ${pad3(d.hdgTrue)}`;
  const crs = `${fr ? "route" : "course"} ${pad3(sim.course())}`;
  const alt = `${thousands(sim.indicatedAlt(), lang)} ft`;
  const ias = `${Math.round(d.iasKt)} kt`;
  const name = (en: string, frn: string) => (fr ? frn : en);
  const steamy = frame.kind === "gauge" || (frame.kind === "display" && (frame.display === "six" || frame.display === "stack"));
  const cdi = cdiWords(sim, lang, steamy ? "steam" : "g1000");
  const join = (title: string, parts: string[]) =>
    `${title}: ${parts.filter(Boolean).join(", ")}`;
  if (frame.kind === "gauge") {
    switch (frame.gauge) {
      case "hsi":
        return join("HSI", [hdg, crs, cdi, flag]);
      case "cdi":
        return join(name("NAV 2 indicator", "Indicateur NAV 2"), [
          `OBS ${pad3(sim.av.obs2)}`,
          sim.nav2.valid ? sim.nav2.toFrom : name("no signal", "pas de signal"),
        ]);
      case "rmi":
        return join("RMI", [
          hdg,
          sim.adf.valid ? `ADF ${pad3(sim.adf.bearingTo)}` : "",
          sim.nav2.valid ? `VOR ${pad3(sim.nav2.bearingTo)}` : "",
        ]);
      case "ai":
        return join(name("Attitude indicator", "Horizon artificiel"), [
          `${name("pitch", "assiette")} ${Math.round(d.pitchDeg)}°`,
          `${name("bank", "inclinaison")} ${Math.round(Math.abs(d.rollDeg))}° ${d.rollDeg > 1 ? name("right", "droite") : d.rollDeg < -1 ? name("left", "gauche") : ""}`.trim(),
        ]);
      case "asi":
        return join(name("Airspeed", "Anémomètre"), [ias]);
      case "alt":
        return join(name("Altimeter", "Altimètre"), [
          alt,
          `${sim.av.baro.toFixed(2)} inHg`,
        ]);
      case "vsi":
        return join(name("Vertical speed", "Variomètre"), [
          `${Math.round(d.vsFpm / 10) * 10} ft/min`,
        ]);
      case "tc":
        return join(name("Turn coordinator", "Indicateur de virage"), [
          `${(Math.round(d.turnRateDps * 10) / 10).toString()} °/s`,
        ]);
    }
  }
  if (frame.kind === "display") {
    const title: Record<string, string> = {
      pfd: "PFD",
      mfd: "MFD",
      six: name("Six-pack", "Six instruments de base"),
      stack: name("Radio stack", "Pile radio"),
      airlinerPfd: "PFD",
      nd: "ND",
    };
    return join(title[frame.display], [
      ias,
      alt,
      hdg,
      crs,
      cdi,
      flag,
    ]);
  }
  return "";
}

/** The stage bar's scene line: main part ("ARD R-276 · 6.0 NM") and the rest ("4,000 ft · wind 250/10"). */
export function sceneLine(
  sim: Sim,
  lang: Lang = "en",
): { main: string; extra: string } {
  const s = sim.ac.s;
  const n = sim.nav1.valid ? sim.nav1 : sim.nav2.valid ? sim.nav2 : null;
  let main = "";
  if (n) {
    const nav = NAVAIDS.find((x) => x.ident === n.ident);
    const dist = nav ? distanceNm(s, nav) : null;
    main = `${n.ident} R-${pad3(n.radial)}${dist !== null ? ` · ${dist.toFixed(1)} NM` : ""}`;
  } else {
    let best: { ident: string; lat: number; lon: number } | null = null;
    let bd = Infinity;
    for (const x of NAVAIDS) {
      const d = distanceNm(s, x);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    if (best && bd < 60)
      main = `${best.ident} ${pad3(bearingDeg(best, s))}° · ${bd.toFixed(1)} NM`;
  }
  const w = sim.weather;
  const wind =
    w.windKt >= 1
      ? `${t("wind", lang)} ${pad3(w.windDir)}/${Math.round(w.windKt)}`
      : t("calm", lang);
  const extra = `${thousands(sim.indicatedAlt(), lang)} ft · ${wind}`;
  if (!main) return { main: extra, extra: "" };
  return { main, extra };
}
