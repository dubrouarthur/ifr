// Ground school — the studio's « Situation de vol » form: the author says what the aircraft is doing (heading,
// altitude, speed, vertical speed, bank, pitch, power, flaps; where it is; the radios; wind and weather; failures;
// autopilot) with a slider and a number per value. Every move calls `onChange` at once, so the instruments on the
// slide follow while the slider is dragged. « Stabiliser » lets the flight model fly the situation and keeps what
// it really does; what does not go together is explained under the form, each line with a way out.
//
// Also here: the « Situations prêtes » grid (named starting points, each with a still drawn by the instrument
// renderers). The model, the limits and the checks live in ../situations.ts.
import { h } from "../../ui/dom";
import type { InstrumentView, L10n, Lang, SimScene } from "../types";
import {
  FLAP_DEG,
  READY_SITUATIONS,
  SIT_FAILURES,
  SIT_LIMITS,
  StabiliseRun,
  airportList,
  checkSituation,
  editSituation,
  failureName,
  ilsList,
  navStations,
  pitchFor,
  placeAt,
  posLine,
  sceneOfSituation,
  standardBank,
  stations,
  type Limit,
  type ReadySituation,
  type SitPos,
  type Situation,
  type StabDriver,
} from "../situations";
import { SceneSims, SlideInstrument } from "../canvas/instruments";

const tr = (l: L10n, lang: Lang) => (lang === "fr" ? (l.fr ?? l.en) : l.en);
const pad3 = (v: number) => String(Math.round(v) % 360).padStart(3, "0");

export interface SituationEditorOptions {
  lang: Lang;
  sit: Situation;
  /** every change; `final` false while a slider is dragged or the aircraft is being stabilised */
  onChange(sit: Situation, final: boolean): void;
  /** the scene the situation edits (its cockpit and seed are kept by « Stabiliser ») */
  base?: SimScene;
  /** a small live instrument above the form (the Simulateur panel: the slide may show none) */
  preview?: InstrumentView;
  cockpit?: "g1000" | "steam" | "airliner";
}

/** which situation a change is for: the slide's (shared by its instruments), one element's own, or a step's */
export type SitTarget = (
  | { kind: "slide" }
  | { kind: "block"; id: string }
  | { kind: "scene"; id: string | undefined; set(id: string): void }
) & {
  /** where the change was made: the other place that shows the situation is drawn again when it is stored */
  from?: "inspector" | "panel";
};
export interface SituationRead {
  scene: SimScene;
  /** undefined: the sample situation (nothing stored yet) */
  sceneId: string | undefined;
  /** the element has its own situation */
  own: boolean;
  /** other instruments and simulator views of the slide that show the same situation */
  shared: number;
  /** other steps of the course show it too (an edit here gives this step its own copy) */
  elsewhere: boolean;
}
/** What the form needs from the course editor. */
export interface SituationHost {
  /** the cockpit can be opened from the editor and can send a capture back */
  readonly canFly: boolean;
  read(blockId?: string): SituationRead;
  readScene(sceneId: string | undefined): SituationRead;
  /** `final` false while a slider is held: the instruments follow, nothing is stored yet. True when the element
   *  now points at a new scene (the inspector must be drawn again). */
  write(sit: Situation, final: boolean, target: SitTarget): boolean;
  split(blockId: string): void;
  join(blockId: string): void;
  /** open the cockpit with the aircraft in this situation (C captures, then back to the course) */
  fly(scene?: SimScene): void;
}

/** sections the author opened stay open while the form is redrawn (and from one instrument to the next) */
const OPEN = new Set<string>();

interface Row {
  el: HTMLElement;
  set(v: number, sub?: string): void;
  disable(on: boolean): void;
}

let uid = 0;

export class SituationEditor {
  readonly el: HTMLElement;
  private sit: Situation;
  private lead: StabDriver = "power";
  private rows = new Map<string, Row>();
  private flapsEl: HTMLElement | null = null;
  private issuesEl: HTMLElement;
  private statusEl: HTMLElement;
  private leadEl: HTMLElement;
  private stabBtn: HTMLButtonElement;
  private mainEl: HTMLFieldSetElement;
  private secsEl: HTMLElement;
  private summaries = new Map<string, HTMLElement>();
  private pitchAuto: HTMLButtonElement | null = null;
  private posSet: L10n | null = null;
  private status: { ok: boolean; text: L10n } | null = null;
  private running = false;
  private raf = 0;
  private sims: SceneSims | null = null;
  private inst: SlideInstrument | null = null;
  private readonly pid = `sit-prev-${++uid}`;
  constructor(private o: SituationEditorOptions) {
    this.sit = editSituation(o.sit, {});
    this.mainEl = h("fieldset", { class: "sit-main" });
    this.issuesEl = h("ul", { class: "sit-issues" });
    this.statusEl = h("p", { class: "sit-status", role: "status" });
    this.leadEl = h("p", { class: "sit-lead" });
    this.stabBtn = h(
      "button",
      { type: "button", class: "ce-btn sm sit-stab" },
      h("span", {}, this.t("Stabilise", "Stabiliser")),
    );
    this.stabBtn.addEventListener("click", () => this.stabilise());
    this.secsEl = h("div", { class: "sit-secs" });
    this.el = h(
      "div",
      { class: "sit", "data-lang": o.lang },
      o.preview ? this.buildPreview(o.preview) : null,
      this.mainEl,
      h("div", { class: "sit-stabrow" }, this.stabBtn, this.leadEl),
      this.statusEl,
      this.issuesEl,
      this.secsEl,
    );
    this.buildMain();
    this.buildSections();
    this.sync();
  }
  get value(): Situation {
    return this.sit;
  }
  /** Show another situation (a ready one was picked, an undo). */
  set(sit: Situation) {
    this.cancelRun();
    this.sit = editSituation(sit, {});
    this.status = null;
    this.posSet = null;
    this.lead = "power";
    this.buildSections();
    this.sync();
    this.pushPreview();
  }
  destroy() {
    this.cancelRun();
    this.inst?.destroy();
    this.sims?.destroy();
    this.el.remove();
  }
  private t(en: string, fr: string) {
    return this.o.lang === "fr" ? fr : en;
  }

  // ---------------------------------------------------------------- the preview
  private buildPreview(view: InstrumentView): HTMLElement {
    const w = 264;
    const hh = view.kind === "six" || view.kind === "pfd" ? 198 : 198;
    this.sims = new SceneSims({
      scenes: {
        [this.pid]: sceneOfSituation(this.sit, {
          id: this.pid,
          base: this.o.base,
        }),
      },
      cockpit: this.o.cockpit ?? "g1000",
    });
    this.inst = new SlideInstrument(this.sims, {
      view,
      scene: this.pid,
      mode: "frozen",
      lang: this.o.lang,
      w,
      h: hh,
      scale: () => 1,
      alt: this.t(
        "What the instruments show",
        "Ce que montrent les instruments",
      ),
    });
    this.inst.el.style.cssText = `position:relative;width:${w}px;height:${hh}px;`;
    return h("div", { class: "sit-preview" }, this.inst.el);
  }
  private pushPreview() {
    if (!this.sims) return;
    this.sims.replace(
      sceneOfSituation(this.sit, { id: this.pid, base: this.o.base }),
    );
  }

  // ---------------------------------------------------------------- change
  private patch(p: Partial<Situation>, final: boolean) {
    if (this.running) return;
    if ("power" in p) this.lead = "power";
    if ("iasKt" in p) this.lead = "speed";
    if ("pitch" in p) this.lead = p.pitch === null ? "power" : "pitch";
    this.sit = editSituation(this.sit, p);
    this.status = null;
    this.emit(final);
  }
  private emit(final: boolean) {
    this.pushPreview();
    this.o.onChange(this.sit, final);
    this.sync();
  }
  private place(pos: SitPos) {
    if (this.running) return;
    const r = placeAt(this.sit, pos);
    const kindChanged = pos.kind !== this.sit.pos.kind;
    this.sit = r.sit;
    this.posSet = r.set;
    this.status = null;
    if (kindChanged || r.set) this.buildSections();
    this.emit(true);
  }

  // ---------------------------------------------------------------- the eight flight values
  private slider(
    key: string,
    label: string,
    lim: Limit,
    value: number,
    onInput: (v: number, final: boolean) => void,
    o: { unit?: string; wide?: boolean } = {},
  ): Row {
    const id = `${this.pid}-${key}`;
    const range = h("input", {
      type: "range",
      class: "sit-range",
      min: lim.min,
      max: lim.max,
      step: lim.step,
      value: String(value),
      "aria-label": label,
      id,
    });
    const num = h("input", {
      type: "number",
      inputmode: "decimal",
      class: "ce-in num sit-num",
      min: lim.min,
      max: lim.max,
      step: lim.step,
      value: String(value),
      "aria-label": `${label} (${o.unit ?? lim.unit})`,
    });
    const sub = h("small", { class: "sit-sub" });
    range.addEventListener("input", () => onInput(Number(range.value), false));
    range.addEventListener("change", () => onInput(Number(range.value), true));
    num.addEventListener("input", () => {
      if (num.value.trim() !== "" && Number.isFinite(Number(num.value)))
        onInput(Number(num.value), false);
    });
    num.addEventListener("change", () => {
      if (num.value.trim() !== "" && Number.isFinite(Number(num.value)))
        onInput(Number(num.value), true);
      else this.sync();
    });
    const el = h(
      "div",
      { class: `sit-row${o.wide ? " wide" : ""}`, "data-k": key },
      h("label", { class: "sit-l", for: id }, h("span", {}, label), sub),
      range,
      h(
        "span",
        { class: "ce-inwrap sit-val" },
        num,
        h("span", { class: "ce-unit" }, o.unit ?? lim.unit),
      ),
    );
    const row: Row = {
      el,
      set: (v, s) => {
        const a =
          typeof document !== "undefined" ? document.activeElement : null;
        if (a !== range) range.value = String(v);
        if (a !== num) num.value = String(v);
        range.setAttribute(
          "aria-valuetext",
          `${v} ${o.unit ?? lim.unit}${s ? `, ${s}` : ""}`,
        );
        if (s !== undefined) sub.textContent = s;
      },
      disable: (on) => {
        range.disabled = on;
        num.disabled = on;
      },
    };
    this.rows.set(key, row);
    return row;
  }
  private buildMain() {
    const s = this.sit;
    const L = SIT_LIMITS;
    const T = this.t.bind(this);
    const flaps = h("div", {
      class: "ce-seg full sit-flaps",
      role: "radiogroup",
      "aria-label": T("Flaps", "Volets"),
    });
    for (let f = 0; f <= 3; f++) {
      const b = h(
        "button",
        { type: "button", role: "radio", "data-f": f },
        `${FLAP_DEG[f]}°`,
      );
      b.addEventListener("click", () => this.patch({ flaps: f }, true));
      flaps.append(b);
    }
    this.flapsEl = flaps;
    this.pitchAuto = h(
      "button",
      { type: "button", class: "ce-link sit-auto" },
      T("Natural", "Naturelle"),
    );
    this.pitchAuto.addEventListener("click", () =>
      this.patch(
        {
          pitch: this.sit.pitch === null ? Math.round(this.shownPitch()) : null,
        },
        true,
      ),
    );
    const pitchRow = this.slider(
      "pitch",
      T("Pitch", "Assiette"),
      L.pitch,
      Math.round(this.shownPitch()),
      (v, f) => this.patch({ pitch: v }, f),
    );
    pitchRow.el.querySelector(".sit-l")?.append(this.pitchAuto);
    this.mainEl.replaceChildren(
      h("legend", { class: "sit-legend" }, T("The aircraft", "L’avion")),
      this.slider("hdg", T("Heading", "Cap"), L.hdg, s.hdg, (v, f) =>
        this.patch({ hdg: v }, f),
      ).el,
      this.slider(
        "altFt",
        T("Altitude", "Altitude"),
        L.altFt,
        s.altFt,
        (v, f) => this.patch({ altFt: v }, f),
      ).el,
      this.slider("iasKt", T("Speed", "Vitesse"), L.iasKt, s.iasKt, (v, f) =>
        this.patch({ iasKt: v }, f),
      ).el,
      this.slider(
        "vsFpm",
        T("Vertical speed", "Vario"),
        L.vsFpm,
        s.vsFpm,
        (v, f) => this.patch({ vsFpm: v }, f),
      ).el,
      this.slider("bank", T("Bank", "Inclinaison"), L.bank, s.bank, (v, f) =>
        this.patch({ bank: v }, f),
      ).el,
      pitchRow.el,
      this.slider("power", T("Power", "Puissance"), L.power, s.power, (v, f) =>
        this.patch({ power: v }, f),
      ).el,
      h(
        "div",
        { class: "sit-row", "data-k": "flaps" },
        h("span", { class: "sit-l" }, T("Flaps", "Volets")),
        flaps,
      ),
    );
  }
  private shownPitch(): number {
    return this.sit.pitch ?? this.sit.trimmed?.pitch ?? pitchFor(this.sit);
  }

  // ---------------------------------------------------------------- the folded sections
  private section(
    key: string,
    title: string,
    body: (Node | null)[],
  ): HTMLElement {
    const sum = h("span", { class: "sit-sum" });
    this.summaries.set(key, sum);
    const d = h(
      "details",
      { class: "sit-sec", "data-k": key },
      h("summary", {}, h("span", { class: "sit-sec-t" }, title), sum),
      h("div", { class: "sit-sec-b" }, ...body),
    );
    if (OPEN.has(key)) d.open = true;
    d.addEventListener("toggle", () =>
      d.open ? OPEN.add(key) : OPEN.delete(key),
    );
    return d;
  }
  private select<V extends string>(
    label: string,
    opts: { value: V; label: string }[],
    value: V | "",
    onPick: (v: V | "") => void,
    none?: string,
  ): HTMLElement {
    const sel = h("select", { class: "ce-in", "aria-label": label });
    if (none !== undefined) sel.append(h("option", { value: "" }, none));
    for (const o of opts) {
      const e = h("option", { value: o.value }, o.label);
      if (o.value === value) e.selected = true;
      sel.append(e);
    }
    if (value === "" && none !== undefined) sel.value = "";
    sel.addEventListener("change", () => onPick(sel.value as V | ""));
    return h(
      "div",
      { class: "ce-field sit-field" },
      h("div", { class: "ce-field-l" }, h("span", {}, label)),
      sel,
    );
  }
  private segOf<V extends string>(
    label: string,
    opts: { value: V; label: string }[],
    value: V | null,
    onPick: (v: V) => void,
  ): HTMLElement {
    const el = h("div", {
      class: "ce-seg full",
      role: "radiogroup",
      "aria-label": label,
    });
    for (const o of opts) {
      const on = o.value === value;
      const b = h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": on ? "true" : "false",
          class: on ? "on" : "",
        },
        o.label,
      );
      b.addEventListener("click", () => {
        if (!on) onPick(o.value);
      });
      el.append(b);
    }
    return el;
  }
  private buildSections() {
    const T = this.t.bind(this);
    const s = this.sit;
    const lang = this.o.lang;
    const L = SIT_LIMITS;
    for (const k of [
      "radial",
      "distNm",
      "inbound",
      "ilsNm",
      "obs1",
      "obs2",
      "windDir",
      "windKt",
      "ceilingFt",
    ])
      this.rows.delete(k);
    this.summaries.clear();
    const stName = (id: string) => {
      const st = [...stations(), ...navStations()].find((x) => x.ident === id);
      return st ? `${st.ident} · ${st.name} (${st.kind})` : id;
    };
    // ---- position
    const p = s.pos;
    const sts = stations();
    const ils = ilsList();
    const aps = airportList();
    const kinds: { value: SitPos["kind"]; label: string }[] = [
      { value: "radial", label: T("From a beacon", "Depuis une balise") },
      ...(ils.length
        ? [{ value: "ils" as const, label: T("On the ILS", "Sur l’ILS") }]
        : []),
      { value: "hold", label: T("In the hold", "Dans l’attente") },
      { value: "over", label: T("Over an airport", "Verticale terrain") },
    ];
    const first = sts[0]?.ident ?? "ARD";
    const posBody: (Node | null)[] = [
      this.segOf(
        T("Where the aircraft is", "Où est l’avion"),
        kinds,
        p.kind === "free" ? null : p.kind,
        (k) =>
          this.place(
            k === "radial"
              ? { kind: "radial", station: first, radial: 90, distNm: 8 }
              : k === "ils"
                ? {
                    kind: "ils",
                    airport: ils[0].airport,
                    rwy: ils[0].rwy,
                    distNm: 5,
                  }
                : k === "hold"
                  ? { kind: "hold", fix: first, inbound: 270, turn: "R" }
                  : { kind: "over", airport: aps[0]?.icao ?? "PARD" },
          ),
      ),
    ];
    if (p.kind === "free")
      posBody.push(
        h(
          "p",
          { class: "ce-note muted" },
          T(
            "Where the aircraft was captured. Choose a way above to move it.",
            "Là où l’avion a été capturé. Choisissez une façon ci-dessus pour le déplacer.",
          ),
        ),
      );
    if (p.kind === "radial")
      posBody.push(
        this.select(
          T("Beacon", "Balise"),
          sts.map((x) => ({
            value: x.ident,
            label: `${x.ident} · ${x.name} (${x.kind})`,
          })),
          p.station,
          (v) => v && this.place({ ...p, station: v }),
        ),
        this.slider(
          "radial",
          sts.find((x) => x.ident === p.station)?.kind === "NDB"
            ? T("Bearing from", "Relèvement")
            : T("Radial", "Radial"),
          L.radial,
          p.radial,
          (v, f) => this.patchPos({ ...p, radial: v }, f),
          { wide: true },
        ).el,
        this.slider(
          "distNm",
          T("Distance", "Distance"),
          L.distNm,
          p.distNm,
          (v, f) => this.patchPos({ ...p, distNm: v }, f),
          {
            wide: true,
          },
        ).el,
      );
    if (p.kind === "ils")
      posBody.push(
        this.select(
          T("Approach", "Approche"),
          ils.map((x) => ({
            value: `${x.airport}/${x.rwy}`,
            label: `${x.glide ? "ILS" : "LOC"} ${x.rwy} · ${x.airport}`,
          })),
          `${p.airport}/${p.rwy}`,
          (v) => {
            const [airport, rwy] = v.split("/");
            if (airport && rwy) this.place({ ...p, airport, rwy });
          },
        ),
        this.slider(
          "ilsNm",
          T("From the threshold", "Du seuil"),
          { min: 1, max: 15, step: 0.5, unit: "NM" },
          p.distNm,
          (v, f) => {
            if (f) this.place({ ...p, distNm: v });
            else this.patchPos({ ...p, distNm: v }, false);
          },
          { wide: true },
        ).el,
      );
    if (p.kind === "hold")
      posBody.push(
        this.select(
          T("Holding fix", "Point d’attente"),
          sts.map((x) => ({
            value: x.ident,
            label: `${x.ident} · ${x.name} (${x.kind})`,
          })),
          p.fix,
          (v) => v && this.place({ ...p, fix: v }),
        ),
        this.slider(
          "inbound",
          T("Inbound course", "Rapprochement"),
          L.radial,
          p.inbound,
          (v, f) => {
            if (f) this.place({ ...p, inbound: v });
            else this.patchPos({ ...p, inbound: v }, false);
          },
          { wide: true },
        ).el,
        this.segOf(
          T("Turns", "Virages"),
          [
            { value: "R", label: T("Right turns", "À droite") },
            { value: "L", label: T("Left turns", "À gauche") },
          ],
          p.turn,
          (v) => this.place({ ...p, turn: v }),
        ),
      );
    if (p.kind === "over")
      posBody.push(
        this.select(
          T("Airport", "Terrain"),
          aps.map((a) => ({ value: a.icao, label: `${a.icao} · ${a.name}` })),
          p.airport,
          (v) => v && this.place({ kind: "over", airport: v }),
        ),
      );
    if (this.posSet)
      posBody.push(h("p", { class: "ce-note sit-set" }, tr(this.posSet, lang)));
    // ---- radios
    const navs = navStations().map((x) => ({
      value: x.ident,
      label: `${x.ident} · ${x.name} (${x.kind} ${x.freq.toFixed(2)})`,
    }));
    const ndbs = sts
      .filter((x) => x.kind === "NDB")
      .map((x) => ({
        value: x.ident,
        label: `${x.ident} · ${x.name} (${x.freq})`,
      }));
    const asIs = T("Left as it is", "Laissé tel quel");
    const radioBody: (Node | null)[] = [
      this.select(
        "NAV 1",
        navs,
        s.nav1 ?? "",
        (v) => this.patchRedraw({ nav1: v || null }),
        asIs,
      ),
      this.slider(
        "obs1",
        T("Course (OBS 1)", "Route (OBS 1)"),
        L.obs,
        s.obs1,
        (v, f) => this.patch({ obs1: v }, f),
        { wide: true },
      ).el,
      this.select(
        "NAV 2",
        navs,
        s.nav2 ?? "",
        (v) => this.patchRedraw({ nav2: v || null }),
        asIs,
      ),
      this.slider(
        "obs2",
        T("Course (OBS 2)", "Route (OBS 2)"),
        L.obs,
        s.obs2,
        (v, f) => this.patch({ obs2: v }, f),
        { wide: true },
      ).el,
      ndbs.length
        ? this.select(
            "ADF",
            ndbs,
            s.adf ?? "",
            (v) => this.patchRedraw({ adf: v || null }),
            T("None", "Aucun"),
          )
        : null,
      h(
        "div",
        { class: "ce-field-l sit-cap" },
        h("span", {}, T("The needle follows", "L’aiguille suit")),
      ),
      this.segOf(
        T("Navigation source", "Source de navigation"),
        [
          { value: "NAV1", label: "NAV 1" },
          { value: "NAV2", label: "NAV 2" },
          { value: "GPS", label: "GPS" },
        ],
        s.source,
        (v) => this.patchRedraw({ source: v }),
      ),
    ];
    // ---- wind and weather
    const wxBody: (Node | null)[] = [
      this.slider(
        "windDir",
        T("Wind from", "Vent du"),
        L.windDir,
        s.wind.dir,
        (v, f) => this.patch({ wind: { ...this.sit.wind, dir: v } }, f),
        {
          wide: true,
        },
      ).el,
      this.slider(
        "windKt",
        T("Wind speed", "Force du vent"),
        L.windKt,
        s.wind.kt,
        (v, f) => this.patch({ wind: { ...this.sit.wind, kt: v } }, f),
        {
          wide: true,
        },
      ).el,
      this.segOf(
        T("Weather", "Météo"),
        [
          { value: "vmc", label: T("Clear (VMC)", "Dégagé (VMC)") },
          { value: "imc", label: T("In cloud (IMC)", "Dans les nuages (IMC)") },
        ],
        s.wx,
        (v) => this.patchRedraw({ wx: v }),
      ),
      s.wx === "imc"
        ? this.slider(
            "ceilingFt",
            T("Cloud base", "Plafond"),
            L.ceilingFt,
            s.ceilingFt,
            (v, f) => this.patch({ ceilingFt: v }, f),
            {
              wide: true,
            },
          ).el
        : null,
      this.toggle(T("At night", "De nuit"), s.night, (on) =>
        this.patchRedraw({ night: on }),
      ),
    ];
    // ---- failures
    const fails = h("div", {
      class: "ce-chips",
      role: "group",
      "aria-label": T("Failures", "Pannes"),
    });
    for (const k of SIT_FAILURES) {
      const on = s.failures.includes(k);
      const b = h(
        "button",
        {
          type: "button",
          class: on ? "on" : "",
          "aria-pressed": on ? "true" : "false",
        },
        failureName(k, lang),
      );
      b.addEventListener("click", () =>
        this.patchRedraw({
          failures: on
            ? this.sit.failures.filter((x) => x !== k)
            : [...this.sit.failures, k],
        }),
      );
      fails.append(b);
    }
    // ---- autopilot
    const apBody: (Node | null)[] = [
      this.toggle(
        T("Autopilot engaged", "Pilote automatique engagé"),
        s.ap,
        (on) => this.patchRedraw({ ap: on }),
        T(
          "It holds this heading and this altitude (or this vertical speed).",
          "Il tient ce cap et cette altitude (ou ce vario).",
        ),
      ),
    ];
    this.secsEl.replaceChildren(
      this.section("pos", T("Position", "Position"), posBody),
      this.section(
        "radio",
        T("Radios and course", "Radios et route"),
        radioBody,
      ),
      this.section("wx", T("Wind and weather", "Vent et météo"), wxBody),
      this.section("fail", T("Failures", "Pannes"), [fails]),
      this.section("ap", T("Autopilot", "Pilote automatique"), apBody),
    );
    void stName;
  }
  private toggle(
    label: string,
    on: boolean,
    onChange: (on: boolean) => void,
    sub?: string,
  ): HTMLElement {
    const b = h("button", {
      type: "button",
      role: "switch",
      class: `ce-sw${on ? " on" : ""}`,
      "aria-checked": on ? "true" : "false",
      "aria-label": label,
    });
    b.addEventListener("click", () => onChange(!on));
    return h(
      "label",
      { class: "ce-swrow" },
      h("span", { class: "ce-swl" }, label, sub ? h("small", {}, sub) : null),
      b,
    );
  }
  /** a choice that changes what a section shows: applied, then the sections are drawn again */
  private patchRedraw(p: Partial<Situation>) {
    if (this.running) return;
    this.sit = editSituation(this.sit, p);
    this.status = null;
    this.buildSections();
    this.emit(true);
  }
  private patchPos(pos: SitPos, final: boolean) {
    if (this.running) return;
    this.sit = editSituation(this.sit, { pos });
    this.posSet = null;
    this.emit(final);
  }

  // ---------------------------------------------------------------- keep the form in step with the situation
  private sync() {
    const s = this.sit;
    const T = this.t.bind(this);
    const lang = this.o.lang;
    const R = (k: string) => this.rows.get(k);
    R("hdg")?.set(s.hdg);
    R("altFt")?.set(s.altFt);
    R("iasKt")?.set(s.iasKt);
    R("vsFpm")?.set(
      s.vsFpm,
      s.vsFpm >= 50
        ? T("climbing", "en montée")
        : s.vsFpm <= -50
          ? T("descending", "en descente")
          : T("level", "en palier"),
    );
    const std = standardBank(s.iasKt);
    R("bank")?.set(
      s.bank,
      Math.abs(s.bank) < 3
        ? T("wings level", "ailes à plat")
        : `${s.bank < 0 ? T("left", "à gauche") : T("right", "à droite")}${Math.abs(Math.abs(s.bank) - std) <= 1 ? T(", standard rate", ", taux standard") : ""}`,
    );
    const pitch = this.shownPitch();
    R("pitch")?.set(
      Math.round(pitch),
      s.pitch === null
        ? T("follows the speed", "suit la vitesse")
        : T("set by you", "choisie"),
    );
    R("pitch")?.disable(false);
    if (this.pitchAuto) {
      this.pitchAuto.hidden = s.pitch === null;
      this.pitchAuto.textContent = T(
        "Back to natural",
        "Revenir à la naturelle",
      );
    }
    R("power")?.set(s.power);
    for (const b of this.flapsEl?.querySelectorAll("button") ?? []) {
      const on = Number(b.dataset.f) === s.flaps;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
    if (s.pos.kind === "radial") {
      R("radial")?.set(s.pos.radial);
      R("distNm")?.set(s.pos.distNm);
    }
    if (s.pos.kind === "ils") R("ilsNm")?.set(s.pos.distNm);
    if (s.pos.kind === "hold") R("inbound")?.set(s.pos.inbound);
    R("obs1")?.set(s.obs1);
    R("obs2")?.set(s.obs2);
    R("windDir")?.set(s.wind.dir);
    R("windKt")?.set(s.wind.kt);
    R("ceilingFt")?.set(s.ceilingFt);
    // the folded sections say what they hold
    const sum = (k: string, text: string) => {
      const e = this.summaries.get(k);
      if (e) e.textContent = text;
    };
    sum("pos", posLine(s.pos, lang));
    sum(
      "radio",
      [
        s.nav1 ? `NAV 1 ${s.nav1} · ${pad3(s.obs1)}` : null,
        s.nav2 ? `NAV 2 ${s.nav2}` : null,
        s.adf ? `ADF ${s.adf}` : null,
        s.source !== "NAV1" ? s.source : null,
      ]
        .filter(Boolean)
        .join(" · ") || T("As they are", "Telles quelles"),
    );
    sum(
      "wx",
      `${s.wind.kt ? `${pad3(s.wind.dir)}° / ${s.wind.kt} kt` : T("Calm", "Vent calme")} · ${
        s.wx === "imc"
          ? T(`IMC, base ${s.ceilingFt} ft`, `IMC, plafond ${s.ceilingFt} ft`)
          : "VMC"
      }${s.night ? T(" · night", " · de nuit") : ""}`,
    );
    sum(
      "fail",
      s.failures.length
        ? s.failures.map((k) => failureName(k, lang)).join(", ")
        : T("None", "Aucune"),
    );
    sum("ap", s.ap ? T("Engaged", "Engagé") : T("Off", "Coupé"));
    // what does not go together
    const issues = checkSituation(s);
    this.issuesEl.replaceChildren(
      ...issues.map((i) => {
        const li = h(
          "li",
          { class: `sit-issue ${i.level}` },
          h(
            "span",
            { class: "sit-issue-k" },
            i.level === "error"
              ? T("Impossible", "Impossible")
              : i.level === "warn"
                ? T("Unusual", "Inhabituel")
                : T("Not steady yet", "Pas encore stable"),
          ),
          h("span", { class: "sit-issue-t" }, tr(i.text, lang)),
        );
        if (i.fix) {
          const fix = i.fix;
          const b = h(
            "button",
            { type: "button", class: "ce-link" },
            tr(fix.label, lang),
          );
          b.addEventListener("click", () => {
            this.sit = editSituation(this.sit, fix.patch);
            this.status = null;
            this.buildSections();
            this.emit(true);
          });
          li.append(b);
        }
        return li;
      }),
    );
    this.issuesEl.hidden = !issues.length;
    // « Stabiliser »
    const lead =
      this.lead === "pitch" && s.pitch === null ? "power" : this.lead;
    this.leadEl.textContent = this.running
      ? T("The aircraft is flying…", "L’avion vole…")
      : lead === "speed"
        ? T(
            `The speed stays at ${s.iasKt} kt: the power adjusts.`,
            `La vitesse reste à ${s.iasKt} kt : la puissance s’ajuste.`,
          )
        : lead === "pitch"
          ? T(
              `The pitch stays at ${s.pitch}°: speed and vertical speed adjust.`,
              `L’assiette reste à ${s.pitch}° : la vitesse et le vario s’ajustent.`,
            )
          : T(
              `The power stays at ${s.power} %: the speed adjusts.`,
              `La puissance reste à ${s.power} % : la vitesse s’ajuste.`,
            );
    this.stabBtn.disabled =
      this.running ||
      issues.some((i) => i.level === "error" && i.field !== "power");
    this.stabBtn.title = T(
      "The simulator flies this situation a few seconds and keeps what the aircraft really does",
      "Le simulateur vole cette situation quelques secondes et garde ce que l’avion fait vraiment",
    );
    this.mainEl.disabled = this.running;
    this.statusEl.textContent = this.status
      ? tr(this.status.text, lang)
      : s.trimmed && !this.running
        ? ""
        : "";
    this.statusEl.className = `sit-status${this.status ? (this.status.ok ? " ok" : " bad") : ""}`;
    this.statusEl.hidden = !this.status;
  }

  // ---------------------------------------------------------------- « Stabiliser »
  private cancelRun() {
    if (this.raf && typeof cancelAnimationFrame !== "undefined")
      cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.running = false;
  }
  private stabilise() {
    if (this.running) return;
    const start = this.sit;
    const driver: StabDriver =
      this.lead === "pitch" && start.pitch === null ? "power" : this.lead;
    let run: StabiliseRun;
    try {
      run = new StabiliseRun(start, driver, 150, this.o.base);
    } catch {
      this.status = {
        ok: false,
        text: {
          en: "The simulator cannot place the aircraft there: check the position.",
          fr: "Le simulateur ne peut pas placer l’avion là : vérifiez la position.",
        },
      };
      this.sync();
      return;
    }
    this.running = true;
    this.status = null;
    const finish = () => {
      const r = run.finish();
      this.raf = 0;
      this.running = false;
      this.sit = r.ok ? r.sit : start;
      this.status = { ok: r.ok, text: r.text };
      this.lead = r.ok && driver !== "pitch" ? "power" : this.lead;
      this.emit(true);
    };
    if (typeof requestAnimationFrame === "undefined") {
      while (!run.done) run.step(2);
      finish();
      return;
    }
    const tick = () => {
      run.step(0.5);
      if (run.done) return finish();
      // the instruments follow the flight while it settles
      this.sit = run.now();
      this.pushPreview();
      this.o.onChange(this.sit, false);
      this.sync();
      this.raf = requestAnimationFrame(tick);
    };
    this.sync();
    this.raf = requestAnimationFrame(tick);
  }
}

// ---------------------------------------------------------------- « Situations prêtes »
const PREVIEW_VIEW: Record<ReadySituation["preview"], InstrumentView> = {
  six: { kind: "six" },
  ai: { kind: "gauge", gauge: "ai" },
  hsi: { kind: "gauge", gauge: "hsi" },
  cdi: { kind: "gauge", gauge: "cdi" },
  rmi: { kind: "gauge", gauge: "rmi" },
  pfd: { kind: "pfd" },
};
export const readyPreviewView = (r: ReadySituation): InstrumentView =>
  PREVIEW_VIEW[r.preview];

export interface ReadyGrid {
  el: HTMLElement;
  destroy(): void;
}
/**
 * The named starting points as tiles: a still of the instrument that shows the situation best (drawn by the
 * simulator's renderers when the tile scrolls into view), its name and one line. A tap picks it.
 */
export function readyGrid(
  lang: Lang,
  onPick: (r: ReadySituation) => void,
  o: {
    cockpit?: "g1000" | "steam" | "airliner";
    compact?: boolean;
    current?: string;
  } = {},
): ReadyGrid {
  const scenes: Record<string, SimScene> = {};
  for (const r of READY_SITUATIONS)
    scenes[`ready:${r.id}`] = sceneOfSituation(r.sit, { id: `ready:${r.id}` });
  const sims = new SceneSims({ scenes, cockpit: o.cockpit ?? "g1000" });
  const insts: SlideInstrument[] = [];
  let io: IntersectionObserver | null = null;
  const el = h("div", {
    class: `sit-ready${o.compact ? " compact" : ""}`,
    role: "list",
    "aria-label": lang === "fr" ? "Situations prêtes" : "Ready situations",
  });
  const draw = (art: HTMLElement, r: ReadySituation) => {
    const view = readyPreviewView(r);
    const w = o.compact ? 88 : 120;
    const hh =
      view.kind === "six" || view.kind === "pfd"
        ? Math.round(w * 0.75)
        : Math.round(w * 0.75);
    try {
      const inst = new SlideInstrument(sims, {
        view,
        scene: `ready:${r.id}`,
        mode: "frozen",
        lang,
        w,
        h: hh,
        scale: () => 1,
        still: true,
      });
      inst.el.style.cssText = `position:relative;width:${w}px;height:${hh}px;`;
      insts.push(inst);
      art.replaceChildren(inst.el);
    } catch {
      /* the tile keeps its name */
    }
  };
  for (const r of READY_SITUATIONS) {
    const art = h("span", { class: "sit-ready-art", "aria-hidden": "true" });
    const b = h(
      "button",
      {
        type: "button",
        class: `sit-ready-tile${o.current === r.id ? " on" : ""}`,
        role: "listitem",
        "data-id": r.id,
      },
      art,
      h("span", { class: "sit-ready-n" }, tr(r.name, lang)),
      o.compact ? null : h("span", { class: "sit-ready-d" }, tr(r.note, lang)),
    );
    b.title = tr(r.note, lang);
    b.addEventListener("click", () => onPick(r));
    el.append(b);
    if (typeof IntersectionObserver === "undefined") draw(art, r);
    else {
      io ??= new IntersectionObserver(
        (ents) => {
          for (const e of ents)
            if (e.isIntersecting) {
              io?.unobserve(e.target);
              (e.target as HTMLElement & { _job?: () => void })._job?.();
            }
        },
        { rootMargin: "200px" },
      );
      (art as HTMLElement & { _job?: () => void })._job = () => draw(art, r);
      io.observe(art);
    }
  }
  return {
    el,
    destroy() {
      io?.disconnect();
      for (const i of insts) i.destroy();
      sims.destroy();
      el.remove();
    },
  };
}
