// Ground school editor (package F): the tray of cockpit captures (SPEC §5, mockup final/editor.png, left column).
// C in the cockpit stores a moment (scene + panel thumbnail + 3D still), Shift+C the last 60 s as a clip; each lands
// here with its time and scene line and becomes a step in one tap: "Add as a step: Explain · Try it · Fly it · More".
// The store's BroadcastChannel brings captures made in another window at once.
import type { Lang } from "../types";
import type { CourseStore, TrayItem } from "../store";
import { h } from "../../ui/dom";
import { cockpitBridgeReady } from "../cockpitLink";
import { TEMPLATES, tr, type TemplateId } from "./templates";
import { btn, ico, popover, t2 } from "./inspector";

const COCKPIT_NAME = {
  g1000: "G1000",
  steam: "Steam gauges",
  airliner: "Airliner",
} as const;
const COCKPIT_NAME_FR = {
  g1000: "G1000",
  steam: "Instruments classiques",
  airliner: "Liner",
} as const;

/** "14:32 · ILS 27 · 5 NM" (the capture's own label after the time). */
export function trayTitle(item: TrayItem, lang: Lang = "en"): string {
  const t = new Date(item.at);
  const time = Number.isNaN(t.getTime())
    ? ""
    : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const label = item.clip
    ? lang === "fr"
      ? `${Math.round(item.clip.durS)} dernières s`
      : `last ${Math.round(item.clip.durS)} s`
    : (item.label ??
      item.scene.label ??
      (lang === "fr" ? "capture" : "capture"));
  return time ? `${time} · ${label}` : label;
}
/** "G1000 · captured state" / "Clip · ILS 27 · 5 NM". */
export function traySub(item: TrayItem, lang: Lang = "en"): string {
  const fr = lang === "fr";
  if (item.clip)
    return `${fr ? "Séquence" : "Clip"}${(item.label ?? item.scene.label) ? ` · ${item.label ?? item.scene.label}` : ""}`;
  const ck =
    (fr ? COCKPIT_NAME_FR : COCKPIT_NAME)[item.scene.cockpit] ??
    item.scene.cockpit;
  return `${ck} · ${fr ? "état capturé" : "captured state"}`;
}
/** The quick templates for a capture (a clip suggests Watch first). */
export function quickTemplates(item: TrayItem): TemplateId[] {
  return item.clip ? ["watch", "try", "fly"] : ["explain", "try", "fly"];
}

export interface TrayViewOptions {
  lang: Lang;
  store: CourseStore | null;
  courseId: string;
  onAdd(item: TrayItem, template: TemplateId): void;
  onFlyToCapture(): void;
  assetUrl(id: string): string | null | Promise<string | null>;
}
export class TrayView {
  readonly el: HTMLElement;
  private items: TrayItem[] = [];
  private head: HTMLElement;
  private box: HTMLElement;
  private open: string | null = null;
  private unsub: (() => void) | null = null;
  constructor(private o: TrayViewOptions) {
    this.head = h("div", { class: "ce-sect" });
    this.box = h("div", { class: "ce-tray" });
    this.el = h(
      "section",
      {
        class: "ce-traywrap",
        "aria-label": t2(
          o.lang,
          "Captures from the cockpit",
          "Captures du cockpit",
        ),
      },
      this.head,
      this.box,
    );
    this.unsub =
      o.store?.onChange((c) => {
        if (c.store === "tray") void this.refresh();
      }) ?? null;
    void this.refresh();
  }
  setLang(l: Lang) {
    this.o.lang = l;
    this.render();
  }
  async refresh() {
    try {
      this.items = (await this.o.store?.listTray(this.o.courseId)) ?? [];
    } catch {
      this.items = [];
    }
    if (this.open && !this.items.some((i) => i.id === this.open))
      this.open = null;
    this.render();
  }
  get count() {
    return this.items.length;
  }
  private render() {
    const lang = this.o.lang;
    const fr = lang === "fr";
    this.head.replaceChildren(
      h(
        "span",
        { class: "ce-label" },
        `${fr ? "Depuis le cockpit" : "From the cockpit"} · ${this.items.length}`,
      ),
    );
    if (!this.items.length) {
      this.box.className = "ce-tray empty";
      // until the cockpit can send captures back (its course bridge), say so instead of a dead "press C"
      if (!cockpitBridgeReady()) {
        this.box.replaceChildren(
          h(
            "p",
            { class: "ce-tray-empty" },
            fr
              ? "Les captures du cockpit arriveront ici avec la prochaine mise à jour du cockpit. En attendant, réglez la scène dans l’inspecteur."
              : "Captures from the cockpit will land here with the next cockpit update. Meanwhile, set the scene in the inspector.",
          ),
        );
        return;
      }
      const fly = btn(
        fr ? "Voler pour capturer" : "Fly to capture",
        () => this.o.onFlyToCapture(),
        { cls: "sm", icon: "pulse" },
      );
      this.box.replaceChildren(
        h(
          "p",
          { class: "ce-tray-empty" },
          fr
            ? "Volez jusqu’au bon moment et appuyez sur C : la scène arrive ici, prête à devenir une étape."
            : "Fly to the moment and press C: the scene lands here, ready to become a step.",
        ),
        fly,
      );
      return;
    }
    this.box.className = "ce-tray";
    const first = this.open ?? this.items[0].id;
    this.box.replaceChildren(
      ...this.items.slice(0, 6).map((it) => {
        const thumb = h("div", { class: "ce-thumb" });
        const tid = it.thumb ?? it.scene.captured?.thumb;
        if (tid)
          void Promise.resolve(this.o.assetUrl(tid)).then((u) => {
            if (u) thumb.append(h("img", { src: u, alt: "" }));
          });
        else thumb.append(ico(it.clip ? "play" : "gauge", "ce-i ce-thumb-ic"));
        const head = h(
          "button",
          {
            type: "button",
            class: "ce-cap",
            "aria-expanded": it.id === first ? "true" : "false",
          },
          thumb,
          h(
            "div",
            {},
            h("b", {}, trayTitle(it, lang)),
            h("span", {}, traySub(it, lang)),
          ),
        );
        head.addEventListener("click", () => {
          this.open = it.id;
          this.render();
        });
        const parts: Node[] = [head];
        if (it.id === first) {
          const quick = h(
            "div",
            { class: "ce-quick" },
            h(
              "span",
              { class: "ce-muted sm full" },
              fr ? "Ajouter comme étape" : "Add as a step",
            ),
          );
          quickTemplates(it).forEach((tid2, i) => {
            const def = TEMPLATES.find((t) => t.id === tid2)!;
            const b = h(
              "button",
              { type: "button", class: i === 0 ? "def" : "" },
              tr(def.title, lang),
            );
            b.addEventListener("click", () => this.o.onAdd(it, tid2));
            quick.append(b);
          });
          const more = h(
            "button",
            { type: "button", "aria-haspopup": "menu" },
            fr ? "Plus" : "More",
          );
          more.addEventListener("click", () =>
            popover(
              more,
              [
                ...TEMPLATES.filter(
                  (t) => t.id !== "calc" && t.id !== "drill" && t.id !== "quiz",
                ).map((t) => ({
                  label: tr(t.title, lang),
                  sub: tr(t.intent, lang),
                  onClick: () => this.o.onAdd(it, t.id),
                  disabled: t.id === "watch" && !it.clip,
                })),
                {
                  label: fr ? "Retirer du bac" : "Remove from the tray",
                  icon: "trash",
                  danger: true,
                  onClick: () =>
                    void this.o.store
                      ?.removeTray(it.id)
                      .then(() => this.refresh()),
                },
              ],
              { width: 300, title: fr ? "Ajouter comme étape" : "Add as a step" },
            ),
          );
          quick.append(more);
          parts.push(quick);
        }
        return h(
          "div",
          { class: `ce-capwrap${it.id === first ? " open" : ""}` },
          ...parts,
        );
      }),
    );
  }
  destroy() {
    this.unsub?.();
    this.el.remove();
  }
}
