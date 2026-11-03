// Hardware-style CDU panel: LCD with 6+6 line-select keys, page keys, EXEC with annunciator,
// alphanumeric keypad. Keyboard typing goes to the scratchpad while the CDU is open and hovered/focused.
import { h, clear, store } from "./dom";
import { Cdu, COLS, type CduKey, type Line } from "../avionics/cdu";
import type { Sim } from "../sim/sim";

const PAGE_ROWS: CduKey[][] = [
  ["INIT REF", "RTE", "CLB", "CRZ", "DES"],
  ["MENU", "LEGS", "DEP ARR", "HOLD", "PROG"],
  ["N1 LIMIT", "FIX", "PREV PAGE", "NEXT PAGE"],
];
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export class CduPanel {
  el: HTMLElement;
  cdu: Cdu;
  private lcd: HTMLElement;
  private execLight: HTMLElement;
  private hot = false;
  /** where the pilot dragged the CDU (top-left, px), remembered across sessions */
  private pos: { l: number; t: number } | null = store.get<{
    l: number;
    t: number;
  } | null>("ifr.cdu.pos", null);
  private focusSink = h("span", { class: "cdu-sr", tabindex: "-1" });

  constructor(sim: Sim) {
    this.cdu = new Cdu(sim);
    this.lcd = h("div", { class: "cdu-lcd", "aria-live": "polite" });
    this.execLight = h("i", { class: "cdu-exec-light" });
    const lsk = (side: "L" | "R") =>
      h(
        "div",
        { class: `cdu-lsks ${side}` },
        ...[1, 2, 3, 4, 5, 6].map((r) =>
          h("button", {
            class: "cdu-lsk",
            style: `grid-row:${2 * r + 1}`,
            title: `LSK ${r}${side}`,
            "aria-label": `Line select key ${r} ${side === "L" ? "left" : "right"}`,
            onclick: () => this.act(() => this.cdu.lsk(side, r)),
          }),
        ),
      );
    const key = (k: CduKey | string, cls = "") =>
      h(
        "button",
        {
          class: `cdu-k ${cls}`,
          onclick: () =>
            this.act(() =>
              k.length === 1 && /[A-Z0-9]/.test(k)
                ? this.cdu.type(k)
                : this.cdu.press(k as CduKey),
            ),
        },
        k === "PREV PAGE"
          ? "PREV\nPAGE"
          : k === "NEXT PAGE"
            ? "NEXT\nPAGE"
            : k === "DEP ARR"
              ? "DEP\nARR"
              : k === "INIT REF"
                ? "INIT\nREF"
                : k === "N1 LIMIT"
                  ? "N1\nLIMIT"
                  : k,
      );
    const pages = h(
      "div",
      { class: "cdu-pages" },
      ...PAGE_ROWS.flatMap((row, i) => [
        ...row.map((k) => key(k, "pg")),
        ...(i === 1
          ? [
              h(
                "div",
                { class: "cdu-exec" },
                this.execLight,
                key("EXEC", "pg exec"),
              ),
            ]
          : i === 0
            ? [h("span", { class: "cdu-brt" }, "BRT")]
            : []),
      ]),
    );
    const num = h(
      "div",
      { class: "cdu-num" },
      ..."123456789.0".split("").map((d) => key(d, "n")),
      key("+/-", "n"),
    );
    const alpha = h(
      "div",
      { class: "cdu-alpha" },
      ...ALPHA.map((a) => key(a, "a")),
      key("SP", "a"),
      key("DEL", "a"),
      key("/", "a"),
      key("CLR", "a"),
    );
    const head = h(
      "div",
      { class: "cdu-head" },
      h("span", { title: "Drag to move · double-click to dock" }, "FMC CDU"),
      h(
        "button",
        {
          class: "cdu-close",
          onclick: () => this.toggle(false),
          title: "Close (F3)",
        },
        "×",
      ),
    );
    this.el = h(
      "aside",
      {
        class: "cdu",
        tabindex: "-1",
        "aria-label": "FMC control display unit",
      },
      this.focusSink,
      head,
      h(
        "div",
        { class: "cdu-top" },
        lsk("L"),
        h("div", { class: "cdu-glass" }, this.lcd),
        lsk("R"),
      ),
      pages,
      h("div", { class: "cdu-keys" }, num, alpha),
    );
    this.el.addEventListener("pointerenter", () => (this.hot = true));
    this.el.addEventListener("pointerleave", () => (this.hot = false));
    this.dragify(head);
    this.render();
    if (typeof window !== "undefined")
      window.addEventListener("resize", () => this.isOpen && this.layout());
  }

  get isOpen() {
    return this.el.classList.contains("open");
  }
  toggle(on = !this.isOpen) {
    this.el.classList.toggle("open", on);
    if (on) {
      this.cdu.syncFromSim();
      this.render();
      this.layout();
      // focus a hidden element: typing reaches the scratchpad without a focus ring around the whole unit
      this.focusSink.focus({ preventScroll: true });
    }
  }

  /** keyboard → scratchpad while the CDU is open and the pointer is over it (returns true if consumed) */
  keydown(e: KeyboardEvent): boolean {
    if (!this.isOpen || !(this.hot || this.el.contains(document.activeElement)))
      return false;
    const k = e.key;
    if (/^[a-zA-Z0-9]$/.test(k)) this.cdu.type(k);
    else if (k === "/" || k === "." || k === " ")
      this.cdu.type(k === " " ? " " : k);
    else if (k === "Backspace") this.cdu.press("CLR");
    else if (k === "Delete") this.cdu.press("DEL");
    else if (k === "Enter") this.cdu.press("EXEC");
    else if (k === "PageDown") this.cdu.press("NEXT PAGE");
    else if (k === "PageUp") this.cdu.press("PREV PAGE");
    else return false;
    e.preventDefault();
    this.render();
    return true;
  }

  private act(fn: () => void) {
    fn();
    this.render();
  }

  /** live data pages (LEGS, PROG) refresh a few times a second */
  tick() {
    if (!this.isOpen) return;
    if (/LEGS|PROG|HOLD|POS/.test(this.cdu.page)) this.render();
    this.layout();
  }

  /** fit the CDU on screen: scaled down on short viewports, clear of the top bar, the ATC strip, the pedestal and
   *  the EFB drawer (it sits to the left of the drawer so it never covers the plate) */
  private layout() {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    const natW = this.el.offsetWidth || 372,
      natH = this.el.offsetHeight || 650;
    const rectOf = (sel: string) => {
      const e = document.querySelector<HTMLElement>(sel);
      if (!e || !e.offsetParent) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? r : null;
    };
    const tb = rectOf(".topbar");
    const top = Math.max(60, tb && tb.bottom > 0 ? tb.bottom + 8 : 0);
    const foot = rectOf("footer.footer");
    const bottom = foot && foot.top < vh ? Math.max(12, vh - foot.top + 10) : 18;
    const drawer = document.querySelector<HTMLElement>(
      ".drawer[aria-label='Charts'].open",
    );
    const dw = drawer ? drawer.getBoundingClientRect().width : 0;
    let right = 18 + (dw && vw - dw >= 300 ? dw : 0);
    let topMin = top;
    // the ATC strip: stay below it when it is above the CDU
    const atc = rectOf(".atc-radio:not(.empty)");
    const xL = vw - right - natW,
      xR = vw - right;
    if (atc && atc.left < xR && atc.right > xL) topMin = Math.max(topMin, atc.bottom + 8);
    let avail = vh - bottom - topMin;
    // too little room below the ATC strip: ignore it rather than shrinking the unit to unreadable
    if (avail < natH * 0.7 && topMin > top) {
      topMin = top;
      avail = vh - bottom - topMin;
    }
    const scale = Math.max(0.55, Math.min(1, avail / natH, (vw - right - 8) / natW));
    if (right + natW * scale > vw - 8) right = Math.max(8, vw - natW * scale - 8);
    const st = this.el.style;
    st.setProperty("--cdu-scale", scale.toFixed(3));
    if (this.pos) {
      // dragged: keep the pilot's spot, clamped on screen
      const l = Math.max(0, Math.min(vw - natW * scale, this.pos.l));
      const t = Math.max(top, Math.min(vh - natH * scale - 4, this.pos.t));
      st.transformOrigin = "top left";
      st.left = `${l}px`;
      st.top = `${t}px`;
      st.right = "auto";
      st.bottom = "auto";
    } else {
      st.transformOrigin = "bottom right";
      st.left = "auto";
      st.top = "auto";
      st.right = `${right}px`;
      st.bottom = `${bottom}px`;
    }
  }

  render() {
    clear(this.lcd);
    const lines = this.cdu.screen();
    lines.forEach((ln: Line, i) => {
      const labelRow = i % 2 === 1 && i < 13;
      const row = h("div", {
        class: `cdu-ln${labelRow ? " sm" : ""}${i === 13 ? " sp" : ""}`,
      });
      // a fixed 24-column grid: one cell per character, small font only shrinks the glyph
      const cells: { ch: string; c: string; small: boolean }[] = Array.from(
        { length: COLS },
        () => ({ ch: " ", c: "w", small: labelRow }),
      );
      for (const seg of ln) {
        const t = seg.t.slice(0, COLS);
        const start = seg.right
          ? COLS - t.length
          : seg.center
            ? Math.floor((COLS - t.length) / 2)
            : (seg.at ?? 0);
        for (let k = 0; k < t.length; k++)
          if (start + k >= 0 && start + k < COLS)
            cells[start + k] = {
              ch: t[k],
              c: seg.c ?? "w",
              small: !!seg.small,
            };
      }
      for (const cell of cells)
        row.append(
          h(
            "span",
            { class: `c-${cell.c}${cell.small ? " s" : ""}` },
            cell.ch === " " ? "\u00a0" : cell.ch,
          ),
        );
      this.lcd.append(row);
    });
    this.execLight.classList.toggle("on", this.cdu.mod);
  }

  private dragify(handle: HTMLElement) {
    let start: { x: number; y: number; l: number; t: number } | null = null;
    handle.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const r = this.el.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!start) return;
      this.pos = {
        l: Math.max(0, start.l + e.clientX - start.x),
        t: Math.max(60, start.t + e.clientY - start.y),
      };
      this.layout();
    });
    const end = () => {
      if (start && this.pos) store.set("ifr.cdu.pos", this.pos);
      start = null;
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    // double-click the title bar: back to the docked position
    handle.addEventListener("dblclick", () => {
      this.pos = null;
      store.set("ifr.cdu.pos", null);
      this.layout();
    });
  }
}
