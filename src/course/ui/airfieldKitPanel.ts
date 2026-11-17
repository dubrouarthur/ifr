// « Adapter à mon terrain » (course/airfieldKit.ts) as one small panel: one field (the ICAO code), one button
// (« Préparer les diapos »), then the slides it will add, drawn by the slide renderer. Used by « Nouveau cours » (the
// slides become the starting point) and by the studio's « Modèles » (« Ajouter ces 6 diapos »). An unknown code is
// one sentence under the field, never a dialog.
import type { Lang, ThemeId } from "../types";
import type { AirfieldKit } from "../airfieldKit";
import { h } from "../../ui/dom";
import { loc } from "../i18n";
import { renderThumb, type SlideView } from "../canvas/render";
import "../../styles/airfieldkit.css";

export interface AirfieldKitPanelOptions {
  lang: Lang;
  theme?: ThemeId;
  /** the slides are ready (« Nouveau cours »: they become the starting point) */
  onReady?(kit: AirfieldKit): void;
  /** a button under the preview (the studio: « Ajouter ces 6 diapos ») */
  action?: { label(n: number): string; run(kit: AirfieldKit): void };
  /** a line under the preview (« Nouveau cours »: where the slides go) */
  readyLine?(kit: AirfieldKit): string;
  /** the id prefix of the field (two panels on one page never share ids) */
  idPrefix?: string;
  /** the code typed last time (the panel is drawn again after a language switch) */
  value?: string;
  /** the kit prepared last time, shown again as it was */
  kit?: AirfieldKit | null;
}
export interface AirfieldKitPanel {
  el: HTMLElement;
  /** the kit on show (null: none yet) */
  kit(): AirfieldKit | null;
  value(): string;
  /** another starting point was picked: the panel stays, its « chosen » mark goes */
  setChosen(on: boolean): void;
  /** bring the field into view and focus it; with a code already typed, prepare its slides */
  focus(prepare?: boolean): void;
  destroy(): void;
}

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

export function airfieldKitPanel(o: AirfieldKitPanelOptions): AirfieldKitPanel {
  const lang = o.lang;
  const id = o.idPrefix ?? "afk";
  let views: SlideView[] = [];
  let kit: AirfieldKit | null = o.kit ?? null;
  let busy = false;
  let seq = 0;
  const input = h("input", {
    id: `${id}-icao`,
    class: "afk-input",
    type: "text",
    inputmode: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    maxlength: "4",
    placeholder: "LFPN",
    "aria-describedby": `${id}-msg`,
  }) as HTMLInputElement;
  input.value = o.value ?? "";
  const go = h(
    "button",
    { type: "button", class: "afk-btn" },
    T(lang, "Prepare the slides", "Préparer les diapos"),
  ) as HTMLButtonElement;
  const msg = h("p", {
    id: `${id}-msg`,
    class: "afk-msg",
    role: "status",
    "aria-live": "polite",
  });
  const preview = h("div", { class: "afk-preview" });
  const el = h(
    "section",
    { class: "afk", "aria-labelledby": `${id}-h` },
    h(
      "div",
      { class: "afk-head" },
      h(
        "h3",
        { id: `${id}-h`, class: "afk-h" },
        T(lang, "Use my airfield", "Adapter à mon terrain"),
      ),
      h(
        "p",
        { class: "afk-p" },
        T(
          lang,
          "Type your field’s ICAO code: ready slides from the navigation data (runways, frequencies, a live HSI exercise, the view on final, a takeoff in the simulator, the local briefing to complete).",
          "Tapez le code OACI de votre terrain : des diapos prêtes, tirées des données de navigation (pistes, fréquences, un exercice au HSI, la vue en finale, un décollage au simulateur, le briefing local à compléter).",
        ),
      ),
    ),
    h(
      "div",
      { class: "afk-row" },
      h(
        "label",
        { for: `${id}-icao`, class: "afk-label" },
        T(lang, "ICAO code", "Code OACI"),
      ),
      input,
      go,
    ),
    msg,
    preview,
  );

  const clearViews = () => {
    for (const v of views.splice(0)) v.destroy();
  };
  const show = (k: AirfieldKit) => {
    clearViews();
    const grid = h("ol", {
      class: "afk-thumbs",
      "aria-label": T(lang, "The slides it adds", "Les diapos ajoutées"),
    });
    k.slides.forEach((s, i) => {
      const th = h("div", { class: "afk-th", "aria-hidden": "true" });
      grid.append(
        h(
          "li",
          { class: "afk-item" },
          th,
          h(
            "span",
            { class: "afk-cap" },
            h("b", {}, String(i + 1)),
            " ",
            loc(s.title, lang),
          ),
        ),
      );
      requestAnimationFrame(() => {
        if (!th.isConnected) return;
        try {
          views.push(
            renderThumb(s.slide, th, {
              lang,
              theme: o.theme ?? "classroom",
              scenes: k.scenes,
              cockpit: "steam",
            }),
          );
        } catch {
          /* a thumbnail is decoration: its title says what it is */
        }
      });
    });
    const foot = h("div", { class: "afk-foot" });
    if (o.readyLine)
      foot.append(h("p", { class: "afk-ready" }, o.readyLine(k)));
    if (o.action) {
      const b = h(
        "button",
        { type: "button", class: "afk-btn afk-add" },
        o.action.label(k.slides.length),
      );
      b.addEventListener("click", () => o.action?.run(k));
      foot.append(b);
    }
    // the action first, right under the status line: in a narrow panel it is never below the thumbnails
    preview.replaceChildren(foot.childNodes.length ? foot : "", grid);
  };

  async function prepare() {
    if (busy) return;
    const code = input.value;
    busy = true;
    const my = ++seq;
    go.disabled = true;
    el.classList.add("is-busy");
    msg.classList.remove("is-bad");
    msg.textContent = T(
      lang,
      "Reading the navigation data…",
      "Lecture des données de navigation…",
    );
    try {
      const { airfieldKit } = await import("../airfieldKit");
      const r = await airfieldKit(code, lang);
      if (my !== seq) return;
      if (!r.ok) {
        msg.textContent = r.message;
        msg.classList.add("is-bad");
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      input.value = r.icao;
      kit = r;
      msg.textContent = T(
        lang,
        `${r.name} (${r.icao}): ${r.slides.length} slides ready.`,
        `${r.name} (${r.icao}) : ${r.slides.length} diapos prêtes.`,
      );
      show(r);
      o.onReady?.(r);
    } catch {
      msg.textContent = T(
        lang,
        "The slides could not be prepared. Try again.",
        "Les diapos n’ont pas pu être préparées. Réessayez.",
      );
      msg.classList.add("is-bad");
    } finally {
      busy = false;
      go.disabled = false;
      el.classList.remove("is-busy");
    }
  }
  go.addEventListener("click", () => void prepare());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void prepare();
    }
  });
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    if (msg.classList.contains("is-bad")) {
      msg.textContent = "";
      msg.classList.remove("is-bad");
    }
  });
  if (kit) {
    msg.textContent = T(
      lang,
      `${kit.name} (${kit.icao}): ${kit.slides.length} slides ready.`,
      `${kit.name} (${kit.icao}) : ${kit.slides.length} diapos prêtes.`,
    );
    show(kit);
  }
  return {
    el,
    kit: () => kit,
    value: () => input.value,
    setChosen(on) {
      el.classList.toggle("is-chosen", on);
    },
    focus(run = false) {
      const reduce =
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      input.focus({ preventScroll: true });
      if (run && input.value.trim().length === 4 && !kit) void prepare();
    },
    destroy() {
      seq++;
      clearViews();
      el.remove();
    },
  };
}
