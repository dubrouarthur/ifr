// EFB tablet pages (alongside the chart viewer): Airport, NavLog, Weather, Checklists, Clearance.
// Content builders are pure DOM factories fed by the simulator state.
import { h } from "./dom";
import { AIRPORTS, APPROACHES, NAVAIDS } from "../nav/data";
import { distanceNm, bearingDeg } from "../nav/geo";
import { components } from "../sim/wind";
import { atisText, runwayInUse } from "./atis";
import type { Sim } from "../sim/sim";
import { store } from "./dom";

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const fq = (f?: number) =>
  f ? f.toFixed((f * 1000) % 10 ? 3 : 2).replace(/0$/, "") : "—";

/** METAR-style string from the simulator weather */
export function metar(icao: string, sim: Sim): string {
  const w = sim.weather;
  const a = AIRPORTS.find((x) => x.icao === icao);
  const z = new Date();
  const dd = String(z.getUTCDate()).padStart(2, "0"),
    hh = String(z.getUTCHours()).padStart(2, "0");
  const wind =
    w.windKt < 3
      ? "00000KT"
      : `${pad3(Math.round(w.windDir / 10) * 10)}${String(Math.round(w.windKt)).padStart(2, "0")}${w.gustKt > w.windKt + 3 ? "G" + Math.round(w.gustKt) : ""}KT`;
  const vis =
    w.visibilitySm >= 10
      ? "10SM"
      : w.visibilitySm >= 1
        ? `${Math.round(w.visibilitySm)}SM`
        : w.visibilitySm >= 0.5
          ? "1/2SM"
          : "1/4SM";
  const wx =
    w.visibilitySm < 3 && w.ceilingFt < 1000
      ? " BR"
      : w.visibilitySm < 1
        ? " FG"
        : "";
  const sky =
    w.ceilingFt >= 15000
      ? "CLR"
      : `OVC${String(Math.round(w.ceilingFt / 100)).padStart(3, "0")}`;
  const t = Math.round(w.oatSeaLevelC - ((a?.elevFt ?? 0) / 1000) * 2);
  const dp = t - (w.visibilitySm < 3 ? 1 : 6);
  const ms = (x: number) =>
    x < 0 ? `M${String(-x).padStart(2, "0")}` : String(x).padStart(2, "0");
  const alt = `A${Math.round(w.qnh * 100)}`;
  return `${icao} ${dd}${hh}53Z ${wind} ${vis}${wx} ${sky} ${ms(t)}/${ms(dp)} ${alt}`;
}

export function flightCategory(sim: Sim): {
  cat: "VFR" | "MVFR" | "IFR" | "LIFR";
  color: string;
} {
  const c = sim.weather.ceilingFt,
    v = sim.weather.visibilitySm;
  if (c < 500 || v < 1) return { cat: "LIFR", color: "#c026d3" };
  if (c < 1000 || v < 3) return { cat: "IFR", color: "#dc2626" };
  if (c <= 3000 || v <= 5) return { cat: "MVFR", color: "#2563eb" };
  return { cat: "VFR", color: "#16a34a" };
}

export function airportPage(icao: string, sim: Sim): HTMLElement {
  const a = AIRPORTS.find((x) => x.icao === icao);
  if (!a) return h("div", { class: "efb-empty" }, "No airport selected");
  const w = sim.weather;
  const inUse = runwayInUse(icao, w);
  const ils = NAVAIDS.filter(
    (n) => (n.type === "ILS" || n.type === "LOC") && n.airport === icao,
  );
  const apps = APPROACHES.filter((x) => x.airport === icao);
  const cat = flightCategory(sim);
  return h(
    "div",
    { class: "efb-page" },
    h(
      "div",
      { class: "efb-hero" },
      h(
        "div",
        {},
        h("div", { class: "efb-icao" }, a.icao),
        h("div", { class: "efb-name" }, a.name),
        h(
          "div",
          { class: "efb-sub" },
          `${a.city} · Elev ${a.elevFt} ft · ${Math.abs(a.magVar).toFixed(0)}° ${a.magVar >= 0 ? "E" : "W"} var`,
        ),
      ),
      h(
        "span",
        { class: "efb-cat", style: `background:${cat.color}` },
        cat.cat,
      ),
    ),
    h("div", { class: "efb-metar" }, metar(icao, sim)),
    h("h4", {}, "Runways"),
    h(
      "table",
      { class: "efb-t" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          ...["RWY", "HDG", "LENGTH", "WIDTH", "HEAD/X-WIND", "ILS / LOC"].map(
            (t) => h("th", {}, t),
          ),
        ),
      ),
      h(
        "tbody",
        {},
        ...a.runways.map((r) => {
          const c = components(w.windDir, w.windKt, r.heading);
          const l = ils.find((n) => n.runway === r.id);
          return h(
            "tr",
            { class: r.id === inUse.id ? "inuse" : "" },
            h(
              "td",
              {},
              h("b", {}, r.id),
              r.id === inUse.id ? h("em", {}, "in use") : null,
            ),
            h("td", {}, `${pad3(r.heading)}°`),
            h("td", {}, `${r.lengthFt.toLocaleString("en-US")} ft`),
            h("td", {}, `${r.widthFt} ft`),
            h(
              "td",
              { class: c.head < -3 ? "bad" : "" },
              `${c.head >= 0 ? "H" : "T"}${Math.abs(Math.round(c.head))} · ${c.cross >= 0 ? "R" : "L"}${Math.abs(Math.round(c.cross))}`,
            ),
            h(
              "td",
              {},
              l
                ? `${l.ident} ${l.freq.toFixed(2)} · ${pad3(l.course ?? r.heading)}°${l.gsAngle ? ` · GS ${l.gsAngle.toFixed(1)}°` : ""}`
                : "—",
            ),
          );
        }),
      ),
    ),
    h("h4", {}, "Frequencies"),
    h(
      "div",
      { class: "efb-freqs" },
      ...(
        [
          ["ATIS", a.freqs.atis],
          ["Approach", a.freqs.approach],
          ["Tower", a.freqs.tower],
          ["Ground", a.freqs.ground],
          ["CTAF / UNICOM", a.freqs.ctaf],
        ] as [string, number | undefined][]
      )
        .filter(([, f]) => f)
        .map(([n, f]) => h("div", {}, h("span", {}, n), h("b", {}, fq(f)))),
    ),
    h("h4", {}, `Instrument approaches (${apps.length})`),
    h(
      "div",
      { class: "efb-chips" },
      ...apps.map((x) =>
        h("span", { class: `efb-ap t-${x.type.toLowerCase()}` }, x.name),
      ),
    ),
    h("h4", {}, "ATIS"),
    h("p", { class: "efb-atis" }, atisText(icao, w)),
  );
}

export function navlogPage(sim: Sim): HTMLElement {
  const fp = sim.fp;
  if (fp.wpts.length < 2)
    return h(
      "div",
      { class: "efb-empty" },
      "No flight plan loaded — build one in the CDU (RTE / DEP ARR) or Plan a flight.",
    );
  const gs = Math.max(60, sim.ac.data.gsKt || sim.ac.data.tasKt || 100);
  const ff = Math.max(6, sim.ac.data.fuelFlowGph || 8.5);
  let cumD = 0,
    cumT = 0;
  const rows = fp.wpts.slice(1).map((w, i) => {
    const prev = fp.wpts[i];
    const d = distanceNm(prev, w);
    cumD += d;
    const t = (d / gs) * 60;
    cumT += t;
    const active = i + 1 === fp.active;
    return h(
      "tr",
      { class: active ? "active" : i + 1 < fp.active ? "past" : "" },
      h("td", {}, h("b", {}, w.ident), w.role ? h("em", {}, w.role) : null),
      h("td", {}, `${pad3(bearingDeg(prev, w))}°`),
      h("td", {}, d.toFixed(1)),
      h("td", {}, cumD.toFixed(0)),
      h(
        "td",
        {},
        `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, "0")}`,
      ),
      h(
        "td",
        {},
        `${Math.floor(cumT / 60)}:${String(Math.round(cumT % 60)).padStart(2, "0")}`,
      ),
      h("td", {}, w.altMin ? String(w.altMin) : "—"),
      h("td", {}, ((cumT / 60) * ff).toFixed(1)),
    );
  });
  return h(
    "div",
    { class: "efb-page" },
    h(
      "div",
      { class: "efb-kpis" },
      h(
        "div",
        {},
        h("span", {}, "Distance"),
        h("b", {}, `${cumD.toFixed(0)} NM`),
      ),
      h(
        "div",
        {},
        h("span", {}, "ETE"),
        h(
          "b",
          {},
          `${Math.floor(cumT / 60)} h ${String(Math.round(cumT % 60)).padStart(2, "0")}`,
        ),
      ),
      h(
        "div",
        {},
        h("span", {}, "Fuel burn"),
        h("b", {}, `${((cumT / 60) * ff).toFixed(1)} gal`),
      ),
      h(
        "div",
        {},
        h("span", {}, "On board"),
        h("b", {}, `${sim.ac.s.fuelGal.toFixed(1)} gal`),
      ),
    ),
    h(
      "table",
      { class: "efb-t navlog" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          ...["FIX", "MC", "DIST", "CUM", "ETE", "TOTAL", "ALT", "FUEL"].map(
            (t) => h("th", {}, t),
          ),
        ),
      ),
      h("tbody", {}, ...rows),
    ),
    h(
      "p",
      { class: "efb-note" },
      `Ground speed ${Math.round(gs)} kt · fuel flow ${ff.toFixed(1)} gph (current values).`,
    ),
  );
}

export function weatherPage(sim: Sim): HTMLElement {
  const icaos = [
    ...new Set(
      [
        AIRPORTS[0]?.icao,
        ...APPROACHES.slice(0, 1).map((a) => a.airport),
        sim.fp.approach?.airport,
      ].filter(Boolean) as string[],
    ),
  ];
  const w = sim.weather;
  const layers = (w.aloft ?? []).slice(0, 6);
  const cat = flightCategory(sim);
  return h(
    "div",
    { class: "efb-page" },
    ...icaos.map((i) =>
      h(
        "div",
        { class: "efb-wx" },
        h(
          "div",
          { class: "efb-wx-h" },
          h("b", {}, i),
          h(
            "span",
            { class: "efb-cat", style: `background:${cat.color}` },
            cat.cat,
          ),
        ),
        h("code", {}, `METAR ${metar(i, sim)}`),
        h(
          "code",
          {},
          `TAF ${i} ${new Date().toISOString().slice(8, 10)}${new Date().toISOString().slice(11, 13)}00Z ${metar(i, sim).split(" ").slice(2, -2).join(" ")} BECMG ${w.ceilingFt < 1500 ? "OVC" + String(Math.round((w.ceilingFt + 600) / 100)).padStart(3, "0") : "SCT050"}`,
        ),
      ),
    ),
    h("h4", {}, "Winds aloft"),
    layers.length
      ? h(
          "table",
          { class: "efb-t" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, "ALT"),
              h("th", {}, "WIND"),
              h("th", {}, "TEMP"),
            ),
          ),
          h(
            "tbody",
            {},
            ...layers.map((l) =>
              h(
                "tr",
                {},
                h("td", {}, `${l.altFt}`),
                h("td", {}, `${pad3(l.dir)}° / ${Math.round(l.kt)} kt`),
                h(
                  "td",
                  {},
                  `${Math.round(w.oatSeaLevelC - (l.altFt / 1000) * 2)}°C`,
                ),
              ),
            ),
          ),
        )
      : h(
          "p",
          { class: "efb-note" },
          `Surface wind ${pad3(w.windDir)}°/${Math.round(w.windKt)} kt, veering and strengthening with height (standard profile).`,
        ),
    h("h4", {}, "Freezing level & turbulence"),
    h(
      "p",
      { class: "efb-note" },
      `Freezing level ≈ ${Math.max(0, Math.round(((w.oatSeaLevelC / 2) * 1000) / 100) * 100)} ft · turbulence ${w.turbulence < 0.08 ? "nil" : w.turbulence < 0.3 ? "light" : w.turbulence < 0.6 ? "moderate" : "severe"}`,
    ),
  );
}

const CHECKLISTS: Record<string, string[]> = {
  "Before take-off": [
    "Parking brake — SET",
    "Flight controls — FREE & CORRECT",
    "Flight instruments — CHECK, set",
    "Fuel selector — BOTH",
    "Mixture — RICH",
    "Trim — TAKE-OFF",
    "Flaps — UP / 10°",
    "Avionics — NAV/COM set, FPL loaded, CDI source",
    "Altimeter — SET (QNH)",
    "Transponder — ALT",
    "Clearance — RECEIVED & READ BACK",
  ],
  "Climb & cruise": [
    "Power — FULL / cruise",
    "Mixture — LEAN as required",
    "Altimeter — check / transition",
    "Engine instruments — GREEN",
    "Fuel — monitor",
  ],
  "Descent & approach": [
    "ATIS — RECEIVED",
    "Approach — LOADED & BRIEFED (plate)",
    "Minimums — SET",
    "NAV frequency — TUNED & IDENTIFIED",
    "CRS / CDI source — SET",
    "Altimeter — SET",
    "Fuel selector — BOTH",
    "Landing light — ON",
  ],
  "Final / landing": [
    "Stabilised by 1000 ft (IMC)",
    "Flaps — AS REQUIRED",
    "Speed — VREF + additives",
    "Minimums — decision: LAND or GO AROUND",
    "Missed approach — briefed (climb, turn, altitude, hold)",
  ],
  "Go-around": [
    "Power — FULL",
    "Pitch — 7° nose-up",
    "Flaps — 20° then retract in steps",
    "Positive rate — climb at Vy",
    "Missed approach — FLY THE PUBLISHED PROCEDURE",
    "ATC — notify",
  ],
};

export function checklistPage(): HTMLElement {
  const state = store.get<Record<string, boolean>>("ifr.efb.cl", {});
  const save = () => store.set("ifr.efb.cl", state);
  return h(
    "div",
    { class: "efb-page efb-cl" },
    ...Object.entries(CHECKLISTS).map(([name, items]) => {
      const done = items.filter((it) => state[`${name}|${it}`]).length;
      const sec = h(
        "section",
        { class: done === items.length ? "done" : "" },
        h(
          "div",
          { class: "efb-cl-h" },
          h("b", {}, name),
          h("span", {}, `${done}/${items.length}`),
          h(
            "button",
            {
              class: "btn ghost",
              onclick: () => {
                items.forEach((it) => delete state[`${name}|${it}`]);
                save();
                sec.replaceWith(
                  checklistPage().querySelector(
                    `section:nth-of-type(${Object.keys(CHECKLISTS).indexOf(name) + 1})`,
                  )!,
                );
              },
            },
            "Reset",
          ),
        ),
        ...items.map((it) => {
          const [a, b] = it.split(" — ");
          const k = `${name}|${it}`;
          const row = h(
            "label",
            { class: `efb-ci${state[k] ? " on" : ""}` },
            h("input", {
              type: "checkbox",
              checked: !!state[k],
              onchange: (e: Event) => {
                state[k] = (e.target as HTMLInputElement).checked;
                row.classList.toggle("on", state[k]);
                save();
              },
            }),
            h("span", {}, a),
            b ? h("i", {}) : null,
            b ? h("b", {}, b) : null,
          );
          return row;
        }),
      );
      return sec;
    }),
  );
}

export function clearancePage(): HTMLElement {
  const f = store.get<Record<string, string>>("ifr.efb.craft", {});
  const field = (k: string, label: string, ph: string) => {
    const i = h("input", {
      type: "text",
      value: f[k] ?? "",
      placeholder: ph,
      spellcheck: "false",
    }) as HTMLInputElement;
    i.addEventListener("input", () => {
      f[k] = i.value;
      store.set("ifr.efb.craft", f);
    });
    i.addEventListener("keydown", (e) => e.stopPropagation());
    return h(
      "label",
      { class: "efb-craft" },
      h("b", {}, k),
      h("span", {}, label),
      i,
    );
  };
  return h(
    "div",
    { class: "efb-page" },
    h(
      "p",
      { class: "efb-note" },
      "Copy the clearance as you receive it — C R A F T.",
    ),
    field("C", "Clearance limit", "e.g. KSJC"),
    field("R", "Route", "e.g. as filed, radar vectors SJC"),
    field("A", "Altitude", "e.g. maintain 5000, expect 7000 10 min after"),
    field("F", "Frequency", "e.g. departure 120.9"),
    field("T", "Transponder", "e.g. squawk 4512"),
  );
}
