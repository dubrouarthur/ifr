// In-app confirmations: the app never uses the browser's native confirm() / alert() (they suspend the render loop
// on iPad Safari and look foreign). A small sheet built on Modal that stacks over whatever window is open (the
// flight builder, the Learning paths…) without closing it.
//
//   const choice = await confirmSheet({ title, body, actions: [{ id, label, kind }], cancelId, anchor });
//   if (await confirmAction({ title, body, confirmLabel, destructive: true })) …
//
// Esc, the × and a tap on the backdrop resolve the cancel choice. Buttons are at least 44 px on touch. With an
// anchor (the button that asked) the sheet opens next to it on a wide screen, and as a bottom sheet on a phone-width
// one. The sheet does not touch the simulation: a caller that must keep the sim paused while it is open pauses it
// before the call and restores it after (the lesson End button in main.ts does this).
import { h } from "./dom";
import { Modal } from "./modals";

export type SheetActionKind = "primary" | "danger" | "quiet";
export interface SheetAction {
  id: string;
  label: string;
  kind?: SheetActionKind;
}
export interface ConfirmSheetOptions {
  title: string;
  body?: string;
  /** in display order, left to right (the main action last) */
  actions: SheetAction[];
  /** what Esc, the ×, a backdrop tap and a second open resolve (usually one of `actions`) */
  cancelId: string;
  /** the button that asked: the sheet opens next to it (wide screens) and focus returns to it */
  anchor?: HTMLElement;
}
export interface ConfirmActionOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  /** default "Cancel" */
  cancelLabel?: string;
  /** the action cannot be undone: red button, and the keyboard focus starts on Cancel */
  destructive?: boolean;
  anchor?: HTMLElement;
}

// ------------------------------------------------------------------ pure rules (unit-tested)
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** below this viewport width the sheet docks at the bottom (one-handed reach on a phone / narrow window) */
export const SHEET_BOTTOM_BELOW = 600;
const GAP = 8;
const MARGIN = 12;

/** where the sheet goes: next to the anchor when it fits (below it, else above it, right edges aligned, inside the
 *  viewport), at the bottom on a narrow screen, centred otherwise */
export function sheetPlacement(
  anchor: Box | null,
  box: { width: number; height: number },
  vp: { width: number; height: number },
):
  | { mode: "anchored"; left: number; top: number }
  | { mode: "bottom" }
  | { mode: "center" } {
  if (vp.width < SHEET_BOTTOM_BELOW) return { mode: "bottom" };
  if (!anchor || anchor.width <= 0 || box.height + 2 * MARGIN > vp.height)
    return { mode: "center" };
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - box.height;
  let top: number;
  if (below + box.height <= vp.height - MARGIN) top = below;
  else if (above >= MARGIN) top = above;
  else return { mode: "center" };
  const right = anchor.left + anchor.width;
  const left = Math.max(
    MARGIN,
    Math.min(vp.width - MARGIN - box.width, right - box.width),
  );
  return { mode: "anchored", left: Math.round(left), top: Math.round(top) };
}

/** the button that gets the keyboard focus first: the safe choice when an action destroys something, else the
 *  main (last primary) action */
export function initialFocusId(
  actions: SheetAction[],
  cancelId: string,
): string {
  if (actions.some((a) => a.kind === "danger"))
    return actions.some((a) => a.id === cancelId) ? cancelId : actions[0].id;
  const prim = [...actions].reverse().find((a) => a.kind === "primary");
  return (prim ?? actions[actions.length - 1] ?? { id: cancelId }).id;
}

/** the actions of a yes / no confirmation, in display order */
export function confirmActions(o: ConfirmActionOptions): SheetAction[] {
  return [
    { id: "cancel", label: o.cancelLabel ?? "Cancel", kind: "quiet" },
    {
      id: "confirm",
      label: o.confirmLabel,
      kind: o.destructive ? "danger" : "primary",
    },
  ];
}

// ------------------------------------------------------------------ styles (scoped to the sheet, injected once)
const CSS = `
.modal-bg.confirm-bg { z-index: 120; }
.modal-bg.confirm-bg.anchored { display: block; background: rgba(3, 6, 9, 0.38); backdrop-filter: none; }
.modal-bg.confirm-bg.bottom { align-items: flex-end; padding: 0; }
.modal.confirm-sheet { width: min(420px, 100%); border-radius: 14px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55); overflow: hidden; }
.modal-bg.anchored .modal.confirm-sheet { position: fixed; margin: 0; }
.modal-bg.bottom .modal.confirm-sheet { width: 100%; max-width: none; border-radius: 16px 16px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
.modal.confirm-sheet header { position: static; padding: 16px 18px 4px; border-bottom: 0; background: transparent; }
.modal.confirm-sheet header h2 { font-size: 16px; line-height: 1.3; font-weight: 650; }
.modal.confirm-sheet header .x { width: 32px; height: 32px; flex: none; color: var(--muted); }
.modal.confirm-sheet .body { padding: 2px 18px 6px; }
.modal.confirm-sheet .body:empty { display: none; }
.modal.confirm-sheet .body p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
.modal.confirm-sheet footer { position: static; border-top: 0; padding: 14px 18px 16px; gap: 8px; flex-wrap: wrap; background: transparent; }
.modal.confirm-sheet footer .btn { height: auto; min-height: 38px; min-width: 64px; padding: 0 14px; justify-content: center; font-size: 13.5px; }
.modal.confirm-sheet footer .btn.quiet { background: transparent; border-color: var(--line); }
.modal.confirm-sheet footer .btn.quiet:hover { background: var(--bg3); }
.modal.confirm-sheet footer .btn.danger { background: #b42318; border-color: #b42318; color: #fff; }
.modal.confirm-sheet footer .btn.danger:hover { background: #9a1d14; border-color: #9a1d14; }
.modal.confirm-sheet footer .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.modal-bg.bottom .modal.confirm-sheet footer { flex-direction: column-reverse; }
.modal-bg.bottom .modal.confirm-sheet footer .btn { width: 100%; }
body.touch .modal.confirm-sheet footer .btn { min-height: 44px; min-width: 88px; font-size: 15px; }
body.touch .modal.confirm-sheet header .x { width: 44px; height: 44px; margin: -6px -8px -6px 0; }
@media (prefers-reduced-motion: no-preference) {
  .modal-bg.confirm-bg.open .modal.confirm-sheet { animation: confirm-in 0.14s ease-out; }
  @keyframes confirm-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
}
`;
let cssDone = false;
function injectCss() {
  if (cssDone || typeof document === "undefined") return;
  cssDone = true;
  document.head.append(h("style", { id: "confirm-sheet-css" }, CSS));
}

// ------------------------------------------------------------------ the sheet
class ConfirmSheet extends Modal {
  private done = false;
  private returnFocus: HTMLElement | null = null;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private resizeHandler = () => this.place();
  constructor(
    private o: ConfirmSheetOptions,
    private resolve: (id: string) => void,
  ) {
    super(o.title, "sm");
    this.bg.classList.add("confirm-bg");
    this.box.classList.add("confirm-sheet");
    this.box.setAttribute("role", "alertdialog");
    const titleId = `confirm-t-${Math.random().toString(36).slice(2, 8)}`;
    const h2 = this.box.querySelector("header h2");
    if (h2) {
      h2.id = titleId;
      this.box.removeAttribute("aria-label");
      this.box.setAttribute("aria-labelledby", titleId);
    }
    if (o.body) {
      const bodyId = `${titleId}-b`;
      this.body.append(h("p", { id: bodyId }, o.body));
      this.box.setAttribute("aria-describedby", bodyId);
    }
    const focusId = initialFocusId(o.actions, o.cancelId);
    for (const a of o.actions) {
      const b = h(
        "button",
        {
          class: `btn${a.kind && a.kind !== "quiet" ? " " + a.kind : " quiet"}`,
          type: "button",
          "data-id": a.id,
          onclick: () => this.pick(a.id),
        },
        a.label,
      );
      if (a.id === focusId) b.setAttribute("data-autofocus", "");
      this.foot.append(b);
    }
  }
  /** opens over the windows already open (they stay open underneath) */
  open() {
    if (this.isOpen) return;
    injectCss();
    this.returnFocus =
      (this.o.anchor ?? (document.activeElement as HTMLElement | null)) || null;
    document.body.append(this.bg);
    this.bg.classList.add("open");
    Modal.stack.push(this);
    window.addEventListener("keydown", this.keyHandler, true);
    window.addEventListener("resize", this.resizeHandler);
    this.place();
    (
      this.foot.querySelector<HTMLElement>("[data-autofocus]") ??
      this.foot.querySelector<HTMLElement>("button")
    )?.focus({ preventScroll: true });
  }
  private place() {
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const a =
      this.o.anchor && this.o.anchor.isConnected
        ? this.o.anchor.getBoundingClientRect()
        : null;
    // measure the sheet at its natural size first
    this.bg.classList.remove("anchored", "bottom");
    this.box.style.left = this.box.style.top = "";
    const r = this.box.getBoundingClientRect();
    const p = sheetPlacement(
      a && { left: a.left, top: a.top, width: a.width, height: a.height },
      { width: r.width, height: r.height },
      vp,
    );
    if (p.mode === "anchored") {
      this.bg.classList.add("anchored");
      this.box.style.left = `${p.left}px`;
      this.box.style.top = `${p.top}px`;
    } else if (p.mode === "bottom") this.bg.classList.add("bottom");
  }
  private onKey(e: KeyboardEvent) {
    if (!this.isOpen || Modal.stack[Modal.stack.length - 1] !== this) return;
    if (e.key === "Escape") {
      // only this sheet closes (the shell's Esc would close every window and the builder's would close itself)
      e.preventDefault();
      e.stopImmediatePropagation();
      this.pick(this.o.cancelId);
      return;
    }
    if (e.key === "Tab") {
      // keep the focus inside the sheet
      const f = [
        ...this.box.querySelectorAll<HTMLElement>("button:not([disabled])"),
      ];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      const n = e.shiftKey
        ? i <= 0
          ? f.length - 1
          : i - 1
        : i < 0 || i >= f.length - 1
          ? 0
          : i + 1;
      e.preventDefault();
      e.stopImmediatePropagation();
      f[n].focus();
      return;
    }
    // the sim's keys (rudder, throttle, layouts…) do nothing while the question is asked; Enter / Space press
    // the focused button as usual
    if (e.key !== "Enter" && e.key !== " ") e.stopImmediatePropagation();
  }
  /** the ×, the backdrop and Modal.closeAll() mean cancel */
  close() {
    this.pick(this.o.cancelId);
  }
  private pick(id: string) {
    if (this.done) return;
    this.done = true;
    window.removeEventListener("keydown", this.keyHandler, true);
    window.removeEventListener("resize", this.resizeHandler);
    super.close();
    this.bg.remove();
    const back = this.returnFocus;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    this.resolve(id);
  }
}

/** asks a question with several answers; resolves the id of the chosen action (`cancelId` on Esc / backdrop / ×) */
export function confirmSheet(o: ConfirmSheetOptions): Promise<string> {
  return new Promise<string>((resolve) => {
    new ConfirmSheet(o, resolve).open();
  });
}

/** asks a yes / no question; resolves true only when the confirm button is pressed */
export async function confirmAction(o: ConfirmActionOptions): Promise<boolean> {
  const id = await confirmSheet({
    title: o.title,
    body: o.body,
    anchor: o.anchor,
    actions: confirmActions(o),
    cancelId: "cancel",
  });
  return id === "confirm";
}
