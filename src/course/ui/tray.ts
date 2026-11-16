// Ground school studio: « Vos captures », the moments captured in the simulator for this course (« Capturer un moment
// pour la diapo »). Each card says what it is (a moment or the last 60 s, when, the numbers in pilot words, with the
// instruments' picture) and offers the two things a slide does with it: « Utiliser comme situation de la diapo » (the
// slide's instruments show that moment) and « Ajouter une vue du simulateur (moment de vol) »; « Plus » keeps the older
// ways (a new step from the capture) and « Supprimer ». The store's BroadcastChannel brings captures made in another
// window at once. The section stays out of the way until there is a capture.
import type { Lang } from "../types";
import type { CourseStore, TrayItem } from "../store";
import { h } from "../../ui/dom";
import { cockpitBridgeReady } from "../cockpitLink";
import { momentLine, noStorageText, sceneRefusal } from "../captureMoment";
import { TEMPLATES, tr, type TemplateId } from "./templates";
import { btn, ico, popover, t2 } from "./inspector";

const hhmm = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? ""
    : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
};

/** « Moment · 14:32 » / « 60 dernières secondes · 14:32 » */
export function trayTitle(item: TrayItem, lang: Lang = "en"): string {
  const fr = lang === "fr";
  const time = hhmm(item.at);
  const kind = item.clip
    ? fr
      ? `${Math.round(item.clip.durS)} dernières secondes`
      : `Last ${Math.round(item.clip.durS)} seconds`
    : "Moment";
  return time ? `${kind} · ${time}` : kind;
}
/** the numbers of the capture in pilot words (older captures: their label) */
export function traySub(item: TrayItem, lang: Lang = "en"): string {
  if (item.moment) return momentLine(item.moment, lang);
  return (
    item.label ??
    item.scene.label ??
    (lang === "fr" ? "État capturé" : "Captured state")
  );
}
/** The quick templates for a capture (a clip suggests Watch first). */
export function quickTemplates(item: TrayItem): TemplateId[] {
  return item.clip ? ["watch", "try", "fly"] : ["explain", "try", "fly"];
}

/** what the panel says after a capture was used (« La diapo montre maintenant… », with « Annuler ») */
export interface TrayResult {
  item: string;
  text: string;
  undo?: () => void;
}

export interface TrayViewOptions {
  lang: Lang;
  store: CourseStore | null;
  courseId: string;
  onAdd(item: TrayItem, template: TemplateId): void;
  /** the captured moment becomes the slide's situation (its instruments show it) */
  onUse?(item: TrayItem): void;
  /** a simulator view of the captured moment (a recording plays) goes on the slide */
  onView?(item: TrayItem): void;
  onFlyToCapture(): void;
  assetUrl(id: string): string | null | Promise<string | null>;
  /** the list changed (the rail's badge) */
  onCount?(n: number): void;
}
export class TrayView {
  readonly el: HTMLElement;
  private items: TrayItem[] = [];
  private unsub: (() => void) | null = null;
  /** captures newer than this (ms) are « Nouvelle » (the ones made since the author left for the cockpit) */
  private newSince = Infinity;
  private result: TrayResult | null = null;
  private loaded: Promise<void>;
  constructor(private o: TrayViewOptions) {
    this.el = h("section", { class: "ce-traywrap", hidden: "" });
    this.unsub =
      o.store?.onChange((c) => {
        if (c.store === "tray") void this.refresh();
      }) ?? null;
    this.loaded = this.refresh();
  }
  setLang(l: Lang) {
    this.o.lang = l;
    this.render();
  }
  /** back from the cockpit: the captures made since `ms` are marked new */
  setNewSince(ms: number) {
    this.newSince = ms;
    this.render();
  }
  setResult(r: TrayResult | null) {
    this.result = r;
    this.render();
  }
  /** the list once read from the store */
  async whenLoaded(): Promise<TrayItem[]> {
    await this.loaded;
    return this.items;
  }
  async refresh() {
    try {
      this.items = ((await this.o.store?.listTray(this.o.courseId)) ?? []).sort(
        (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
      );
    } catch {
      this.items = [];
    }
    this.render();
    this.o.onCount?.(this.items.length);
  }
  get count() {
    return this.items.length;
  }
  private render() {
    const lang = this.o.lang;
    const T = (en: string, fr: string) => t2(lang, en, fr);
    this.el.setAttribute("aria-label", T("Your captures", "Vos captures"));
    // nothing captured yet: the « Voler et capturer » way explains how; this section waits for the first one
    this.el.hidden = !this.items.length && !this.result;
    if (this.el.hidden) {
      this.el.replaceChildren();
      return;
    }
    const memory = this.o.store?.backend === "memory";
    const head = h(
      "div",
      { class: "ce-capt-hd" },
      h(
        "h3",
        { class: "sim-h" },
        T("Your captures", "Vos captures"),
        h("i", { class: "ce-capt-n" }, String(this.items.length)),
      ),
      h(
        "p",
        { class: "ce-panel-note" },
        T(
          "Moments captured in the simulator for this course. Pick the one this slide shows.",
          "Les moments capturés dans le simulateur pour ce cours. Choisissez celui que montre cette diapo.",
        ),
      ),
      memory
        ? h("p", { class: "ce-capt-warn", role: "alert" }, noStorageText(lang))
        : null,
    );
    const res = this.result;
    const result = res
      ? h(
          "div",
          { class: "ce-capt-result", role: "status" },
          ico("check", "ce-i"),
          h("p", {}, res.text),
          res.undo
            ? btn(
                T("Undo", "Annuler"),
                () => {
                  res.undo?.();
                  this.setResult(null);
                },
                { cls: "sm" },
              )
            : null,
        )
      : null;
    const cards = h(
      "ol",
      { class: "ce-capt-list" },
      ...this.items.slice(0, 12).map((it) => this.card(it)),
    );
    this.el.replaceChildren(head, ...(result ? [result] : []), cards);
    if (!cockpitBridgeReady() && !this.items.length) this.el.hidden = true;
  }
  private card(it: TrayItem): HTMLElement {
    const lang = this.o.lang;
    const T = (en: string, fr: string) => t2(lang, en, fr);
    const pic = h("div", { class: "ce-capt-pic" });
    const tid = it.thumb ?? it.scene.captured?.thumb;
    if (tid)
      void Promise.resolve(this.o.assetUrl(tid)).then((u) => {
        if (u)
          pic.replaceChildren(
            h("img", {
              src: u,
              alt: T(
                "The instruments at that moment",
                "Les instruments à ce moment",
              ),
            }),
          );
      });
    pic.append(ico(it.clip ? "play" : "gauge", "ce-i ce-thumb-ic"));
    const fresh = Date.parse(it.at) >= this.newSince;
    const refusal = sceneRefusal(it.scene, lang);
    const used = this.result?.item === it.id;
    const acts = h("div", { class: "ce-capt-acts" });
    if (refusal) acts.append(h("p", { class: "ce-capt-warn" }, refusal.text));
    else {
      if (this.o.onUse) {
        const onUse = this.o.onUse;
        acts.append(
          btn(
            it.clip
              ? T(
                  "Use its start as the slide’s situation",
                  "Utiliser son début comme situation de la diapo",
                )
              : T(
                  "Use as the slide’s situation",
                  "Utiliser comme situation de la diapo",
                ),
            () => onUse(it),
            { cls: "sm primary ce-cap-use", icon: "gauge" },
          ),
        );
      }
      if (this.o.onView) {
        const onView = this.o.onView;
        acts.append(
          btn(
            T(
              "Add a simulator view (flight moment)",
              "Ajouter une vue du simulateur (moment de vol)",
            ),
            () => onView(it),
            { cls: "sm ce-cap-view", icon: "play" },
          ),
        );
      }
    }
    const more = h(
      "button",
      { type: "button", class: "ce-btn sm ghost", "aria-haspopup": "menu" },
      T("More", "Plus"),
    );
    more.addEventListener("click", () =>
      popover(
        more,
        [
          ...(refusal
            ? []
            : TEMPLATES.filter(
                (t) => t.id !== "calc" && t.id !== "drill" && t.id !== "quiz",
              ).map((t) => ({
                label: `${T("New step:", "Nouvelle étape :")} ${tr(t.title, lang)}`,
                sub: tr(t.intent, lang),
                onClick: () => this.o.onAdd(it, t.id),
                disabled: t.id === "watch" && !it.clip,
              }))),
          {
            label: T("Delete this capture", "Supprimer cette capture"),
            icon: "trash",
            danger: true,
            onClick: () =>
              void this.o.store?.removeTray(it.id).then(() => this.refresh()),
          },
        ],
        { width: 320, title: trayTitle(it, lang) },
      ),
    );
    acts.append(more);
    return h(
      "li",
      {
        class: `ce-capt${fresh ? " fresh" : ""}${used ? " used" : ""}`,
        "data-tray": it.id,
      },
      pic,
      h(
        "div",
        { class: "ce-capt-t" },
        h(
          "small",
          {},
          trayTitle(it, lang),
          fresh ? h("i", { class: "ce-capt-new" }, T("New", "Nouvelle")) : null,
          used
            ? h(
                "i",
                { class: "ce-capt-used" },
                T("On this slide", "Sur cette diapo"),
              )
            : null,
        ),
        h("b", {}, traySub(it, lang)),
      ),
      acts,
    );
  }
  /** the empty way in (the « Voler et capturer » pane): how to get a capture */
  emptyHelp(): HTMLElement {
    const lang = this.o.lang;
    const T = (en: string, fr: string) => t2(lang, en, fr);
    return h(
      "p",
      { class: "ce-panel-note" },
      this.items.length
        ? T(
            `${this.items.length} capture(s) wait under « Your captures », at the top of this panel.`,
            `${this.items.length} capture(s) vous attendent sous « Vos captures », en haut de ce panneau.`,
          )
        : T(
            "Your captures will appear at the top of this panel, under « Your captures ».",
            "Vos captures apparaîtront en haut de ce panneau, sous « Vos captures ».",
          ),
    );
  }
  destroy() {
    this.unsub?.();
    this.el.remove();
  }
}
