// Hardware-style CDU panel: LCD with 6+6 line-select keys, page keys, EXEC with annunciator,
// alphanumeric keypad. Keyboard typing goes to the scratchpad while the CDU is open and hovered/focused.
import { h, clear } from "./dom";
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
            title: `LSK ${r}${side}`,
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
      h("span", {}, "FMC CDU"),
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
  }

  get isOpen() {
    return this.el.classList.contains("open");
  }
  toggle(on = !this.isOpen) {
    this.el.classList.toggle("open", on);
    if (on) {
      this.cdu.syncFromSim();
      this.render();
      this.el.focus();
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
    if (this.isOpen && /LEGS|PROG|HOLD|POS/.test(this.cdu.page)) this.render();
  }

  render() {
    clear(this.lcd);
    const lines = this.cdu.screen();
    lines.forEach((ln: Line, i) => {
      const row = h("div", {
        class: `cdu-ln${i % 2 === 1 && i < 13 ? " sm" : ""}${i === 13 ? " sp" : ""}`,
      });
      // compose into a fixed 24-column grid
      const cells: { ch: string; c: string; small: boolean }[] = Array.from(
        { length: COLS },
        () => ({ ch: " ", c: "w", small: i % 2 === 1 && i < 13 }),
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
      let cur = "",
        curC = "",
        curS = false;
      const flush = () => {
        if (cur)
          row.append(h("span", { class: `c-${curC}${curS ? " s" : ""}` }, cur));
        cur = "";
      };
      for (const cell of cells) {
        if (cell.c !== curC || cell.small !== curS) {
          flush();
          curC = cell.c;
          curS = cell.small;
        }
        cur += cell.ch;
      }
      flush();
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
      this.el.style.left = `${Math.max(0, start.l + e.clientX - start.x)}px`;
      this.el.style.top = `${Math.max(0, start.t + e.clientY - start.y)}px`;
      this.el.style.right = "auto";
      this.el.style.bottom = "auto";
    });
    handle.addEventListener("pointerup", () => (start = null));
  }
}
