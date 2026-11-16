// « Assistant IA » — the dialog (loaded on demand: the two entry points import() it). Four calm screens in one modal
// <dialog>: the customer's own Claude API key, the request (three examples, formation, number of slides, the
// course's language), the generation (titles as they arrive, « Annuler » aborts the request) and an editable
// outline (titles, kinds, instruments, reorder / remove) before « Créer le cours » or « Ajouter au cours ».
// FR / EN for every string, 44 px targets, light studio theme (styles/course-ai.css). No native confirm / alert.
import type { Lang, SimScene } from "../types";
import type { CourseStore } from "../store";
import type { DeckStarter } from "../ui/deckStarters";
import { h } from "../../ui/dom";
import { renderThumb, type SlideView } from "../canvas/render";
import { aiKey, keyLooksValid } from "./key";
import {
  generatePlan,
  verifyKey,
  type ClientFactory,
  type GenResult,
} from "./client";
import {
  AI_FORMATIONS,
  FORMATION_NAMES,
  MAX_SLIDES,
  MIN_SLIDES,
  type AiFormation,
} from "./prompt";
import type { DeckPlan, PlanSlide, PlanText } from "./schema";
import {
  editPlan,
  isActionKind,
  kindName,
  mapPlan,
  outlineOf,
  runId,
} from "./mapper";
import { courseFromPlan } from "./build";
import { GAUGE_IDS } from "./catalog";
import { MOTION_PRESETS } from "../canvas/motion";
import { AI_SPARK as SPARK } from "./entry";
import "../../styles/course-ai.css";

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const loc = (t: { en: string; fr?: string }, lang: Lang) =>
  (lang === "fr" ? t.fr : t.en) || t.en || t.fr || "";

export const EXAMPLE_PROMPTS: { en: string; fr: string }[] = [
  {
    fr: "Un cours PPL de 8 diapos sur le décrochage, avec un vol dans le simulateur",
    en: "An 8-slide PPL lesson on the stall, with a flight in the simulator",
  },
  {
    fr: "Les entrées en attente, très interactif",
    en: "Holding entries, very interactive",
  },
  {
    fr: "Briefing ILS pour élèves IR",
    en: "ILS briefing for IR students",
  },
];
const FORMATION_SHORT: Record<AiFormation, { en: string; fr: string }> = {
  "lapl-ppl": { en: "LAPL / PPL", fr: "LAPL / PPL" },
  night: { en: "Night", fr: "Nuit" },
  ir: { en: "IR", fr: "IR" },
  atpl: { en: "ATPL", fr: "ATPL" },
};

export interface AiAssistantOptions {
  lang: Lang;
  /** « Créer le cours » (a new course) or « Ajouter au cours » (into the open course) */
  mode: "create" | "add";
  formation?: AiFormation;
  /** create: the store the course is saved in, and what to do once it is */
  store?: Promise<CourseStore | null>;
  onCreated?(id: string): void;
  /** add: the generated deck, inserted like a template (one undo step) */
  onAdd?(deck: DeckStarter): void;
  /** tests and the browser check: another client (never the network) */
  clientFactory?: ClientFactory;
}
export interface AiAssistant {
  el: HTMLDialogElement;
  close(): void;
}

/** The formation of the dialog from a library programme id (academy.html#new?program=…). */
export function formationOf(program: string | null | undefined): AiFormation {
  return program === "night" || program === "ir" || program === "atpl"
    ? program
    : "lapl-ppl";
}

const icon = (d: string, size = 18): SVGSVGElement => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
};

const UP = "M6 15l6-6 6 6";
const DOWN = "M6 9l6 6 6-6";
const CLOSE = "M6 6l12 12M18 6L6 18";

const CALC_NAMES: Record<string, { en: string; fr: string }> = {
  sixtyToOne: { en: "1 in 60", fr: "1 sur 60" },
  windTriangle: { en: "Wind triangle", fr: "Triangle des vitesses" },
  profile: { en: "Descent profile", fr: "Profil de descente" },
  vdp: { en: "VDP", fr: "VDP" },
  holdWind: { en: "Hold in wind", fr: "Attente avec vent" },
  compass: { en: "Compass headings", fr: "Caps compas" },
  turn: { en: "Turn", fr: "Virage" },
};
/** The name of what a slide shows: the six instruments, a gauge, the simulator or a calc diagram. */
function viewName(v: string, lang: Lang): string {
  if (v === "six") return T(lang, "Six instruments", "Six instruments");
  if (v === "sim") return T(lang, "Simulator", "Simulateur");
  if (CALC_NAMES[v]) return loc(CALC_NAMES[v], lang);
  return v.toUpperCase();
}
const animationName = (id: string, lang: Lang): string => {
  const p = MOTION_PRESETS.find((x) => x.id === id);
  return p ? loc(p.name, lang) : id;
};

type Screen =
  | { k: "key"; status?: { ok: boolean; text: string } }
  | { k: "prompt" }
  | { k: "busy"; titles: string[] }
  | { k: "outline" }
  | { k: "error"; res: Extract<GenResult, { ok: false }> };

/** The plan text of a slide's title-like field (editable in the outline), or null. */
function titleField(s: PlanSlide): PlanText | null {
  if (s.kind === "quiz") return s.question;
  if (s.kind === "goals") return null;
  return s.title;
}
function instrumentOf(s: PlanSlide) {
  return s.kind === "cover" ||
    s.kind === "goals" ||
    s.kind === "quiz" ||
    s.kind === "idea"
    ? s.instrument
    : null;
}

export function openAiAssistant(o: AiAssistantOptions): AiAssistant {
  const lang = o.lang;
  let screen: Screen = aiKey.get() ? { k: "prompt" } : { k: "key" };
  // the request, kept between screens
  let prompt = "";
  let formation: AiFormation = o.formation ?? "lapl-ppl";
  let slides = 8;
  let courseLang: Lang = lang;
  let plan: DeckPlan | null = null;
  let order: number[] = [];
  let ctl: AbortController | null = null;
  let views: SlideView[] = [];
  let busy = false;

  const dlg = h("dialog", {
    class: "ai-dlg",
    "aria-labelledby": "ai-dlg-t",
    lang,
  }) as HTMLDialogElement;
  document.body.append(dlg);

  const destroyViews = () => {
    for (const v of views.splice(0)) v.destroy();
  };
  const close = () => {
    ctl?.abort();
    destroyViews();
    if (dlg.open) dlg.close();
    dlg.remove();
  };
  dlg.addEventListener("cancel", (e) => {
    // Esc while generating cancels the request first, then the dialog
    if (screen.k === "busy") {
      e.preventDefault();
      ctl?.abort();
      return;
    }
    e.preventDefault();
    close();
  });

  const btn = (
    label: string | (Node | string)[],
    cls = "",
    on?: () => void,
    attrs: Record<string, string> = {},
  ): HTMLButtonElement => {
    const b = h(
      "button",
      { type: "button", class: `ai-btn ${cls}`.trim(), ...attrs },
      ...(Array.isArray(label) ? label : [label]),
    ) as HTMLButtonElement;
    if (on) b.addEventListener("click", on);
    return b;
  };
  const head = (sub?: string) => {
    const x = btn([icon(CLOSE)], "ai-x", close, {
      "aria-label": T(lang, "Close", "Fermer"),
    });
    return h(
      "header",
      { class: "ai-head" },
      h("span", { class: "ai-badge", "aria-hidden": "true" }, icon(SPARK, 20)),
      h(
        "div",
        { class: "ai-head-t" },
        h("h2", { id: "ai-dlg-t" }, T(lang, "AI assistant", "Assistant IA")),
        sub ? h("p", {}, sub) : null,
      ),
      x,
    );
  };
  const foot = (...kids: (Node | null)[]) =>
    h("footer", { class: "ai-foot" }, h("span", { class: "ai-sp" }), ...kids);

  // ---------------------------------------------------------------- 1. the key
  const keyScreen = (status?: { ok: boolean; text: string }) => {
    const input = h("input", {
      id: "ai-key",
      class: "ai-input",
      type: "password",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "sk-ant-…",
      "aria-describedby": "ai-key-help ai-key-st",
    }) as HTMLInputElement;
    input.value = aiKey.get() ?? "";
    const remember = h("input", {
      id: "ai-remember",
      type: "checkbox",
    }) as HTMLInputElement;
    remember.checked = aiKey.remembered;
    const st = h(
      "p",
      {
        id: "ai-key-st",
        class: `ai-status${status ? (status.ok ? " ok" : " bad") : ""}`,
        "aria-live": "polite",
      },
      status?.text ?? "",
    );
    const setStatus = (ok: boolean, text: string) => {
      st.className = `ai-status ${ok ? "ok" : "bad"}`;
      st.textContent = text;
    };
    const check = btn(T(lang, "Verify", "Vérifier"), "", async () => {
      const k = input.value.trim();
      if (!keyLooksValid(k))
        return setStatus(
          false,
          T(
            lang,
            "This does not look like a Claude API key (sk-ant-…).",
            "Ce n’est pas une clé API Claude (sk-ant-…).",
          ),
        );
      check.disabled = true;
      setStatus(
        true,
        T(lang, "Checking with Anthropic…", "Vérification auprès d’Anthropic…"),
      );
      const r = await verifyKey(k, o.clientFactory);
      check.disabled = false;
      if (r.ok)
        setStatus(true, T(lang, "The key works.", "La clé fonctionne."));
      else setStatus(false, loc(r.message, lang));
    });
    const go = btn(T(lang, "Continue", "Continuer"), "ai-primary", () => {
      const k = input.value.trim();
      if (!keyLooksValid(k)) {
        setStatus(
          false,
          T(
            lang,
            "Paste a key that starts with sk-ant-.",
            "Collez une clé qui commence par sk-ant-.",
          ),
        );
        input.focus();
        return;
      }
      aiKey.set(k, remember.checked);
      show({ k: "prompt" });
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go.click();
    });
    const forget = aiKey.get()
      ? btn(T(lang, "Forget the key", "Oublier la clé"), "ai-quiet", () => {
          aiKey.forget();
          show({
            k: "key",
            status: {
              ok: true,
              text: T(
                lang,
                "The key was forgotten on this device.",
                "La clé a été oubliée sur cet appareil.",
              ),
            },
          });
        })
      : null;
    return [
      head(
        T(
          lang,
          "Creates slides with Claude, using your own API key",
          "Crée des diapos avec Claude, avec votre propre clé API",
        ),
      ),
      h(
        "div",
        { class: "ai-body" },
        h(
          "label",
          { for: "ai-key", class: "ai-label" },
          T(lang, "Your Claude API key", "Votre clé API Claude"),
        ),
        h("div", { class: "ai-row" }, input, check),
        st,
        h(
          "ul",
          { id: "ai-key-help", class: "ai-help" },
          h(
            "li",
            {},
            T(
              lang,
              "Create one in the Claude Console: ",
              "Créez-la dans la Claude Console : ",
            ),
            h(
              "a",
              {
                href: "https://platform.claude.com/",
                target: "_blank",
                rel: "noopener noreferrer",
              },
              "platform.claude.com",
            ),
            T(
              lang,
              ", « API keys ». Usage is billed to your Anthropic account.",
              ", « API keys ». L’utilisation est facturée sur votre compte Anthropic.",
            ),
          ),
          h(
            "li",
            {},
            T(
              lang,
              "The key is sent only to Anthropic’s API, from your browser. It is kept for this session only, unless you tick the box below.",
              "La clé est envoyée uniquement à l’API d’Anthropic, depuis votre navigateur. Elle n’est gardée que pour cette session, sauf si vous cochez la case ci-dessous.",
            ),
          ),
        ),
        h(
          "label",
          { class: "ai-check", for: "ai-remember" },
          remember,
          h(
            "span",
            {},
            T(
              lang,
              "Remember the key on this device",
              "Se souvenir de la clé sur cet appareil",
            ),
          ),
        ),
      ),
      foot(forget, btn(T(lang, "Cancel", "Annuler"), "", close), go),
    ];
  };

  // ---------------------------------------------------------------- 2. the request
  const promptScreen = () => {
    const ta = h("textarea", {
      id: "ai-prompt",
      class: "ai-input ai-ta",
      rows: "4",
      maxlength: "2000",
      placeholder: T(
        lang,
        "What should the course teach?",
        "Que doit enseigner le cours ?",
      ),
    }) as HTMLTextAreaElement;
    ta.value = prompt;
    ta.addEventListener("input", () => {
      prompt = ta.value;
      go.disabled = !prompt.trim();
    });
    const ex = h("div", {
      class: "ai-ex",
      role: "list",
      "aria-label": T(lang, "Examples", "Exemples"),
    });
    for (const e of EXAMPLE_PROMPTS) {
      const b = btn(
        loc(e, lang),
        "ai-chip",
        () => {
          prompt = loc(e, lang);
          ta.value = prompt;
          const m = /(\d+)\s*(diapos|slides|-slide)/.exec(prompt);
          if (m) {
            slides = Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Number(m[1])));
            num.value = String(slides);
            numOut.textContent = String(slides);
          }
          if (/\bIR\b|ILS/.test(prompt)) setFormation("ir");
          go.disabled = false;
          ta.focus();
        },
        { role: "listitem" },
      );
      ex.append(b);
    }
    // formation: a group of toggle buttons
    const fGroup = h("div", {
      class: "ai-seg",
      role: "radiogroup",
      "aria-labelledby": "ai-f-l",
    });
    const fBtns = AI_FORMATIONS.map((f) => {
      const b = btn(loc(FORMATION_SHORT[f], lang), "", () => setFormation(f), {
        role: "radio",
        title: loc(FORMATION_NAMES[f], lang),
        "data-f": f,
      });
      fGroup.append(b);
      return b;
    });
    function setFormation(f: AiFormation) {
      formation = f;
      for (const b of fBtns) {
        const on = b.dataset.f === f;
        b.setAttribute("aria-checked", String(on));
        b.classList.toggle("on", on);
        b.tabIndex = on ? 0 : -1;
      }
    }
    fGroup.addEventListener("keydown", (e) => {
      const i = AI_FORMATIONS.indexOf(formation);
      const d =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (!d) return;
      e.preventDefault();
      const f =
        AI_FORMATIONS[(i + d + AI_FORMATIONS.length) % AI_FORMATIONS.length];
      setFormation(f);
      fBtns[AI_FORMATIONS.indexOf(f)].focus();
    });
    setFormation(formation);
    const num = h("input", {
      id: "ai-n",
      class: "ai-range",
      type: "range",
      min: String(MIN_SLIDES),
      max: String(MAX_SLIDES),
      step: "1",
    }) as HTMLInputElement;
    num.value = String(slides);
    const numOut = h("output", { for: "ai-n", class: "ai-n" }, String(slides));
    num.addEventListener("input", () => {
      slides = Number(num.value);
      numOut.textContent = String(slides);
    });
    const lGroup = h("div", {
      class: "ai-seg",
      role: "radiogroup",
      "aria-labelledby": "ai-l-l",
    });
    for (const l of ["fr", "en"] as Lang[]) {
      const b = btn(
        l === "fr" ? "Français" : "English",
        courseLang === l ? "on" : "",
        () => {
          courseLang = l;
          for (const x of lGroup.querySelectorAll("button")) {
            const on = x.dataset.l === l;
            x.classList.toggle("on", on);
            x.setAttribute("aria-checked", String(on));
          }
        },
        {
          role: "radio",
          "aria-checked": String(courseLang === l),
          "data-l": l,
          lang: l,
        },
      );
      lGroup.append(b);
    }
    const go = btn(
      [icon(SPARK), h("span", {}, T(lang, "Generate", "Générer"))],
      "ai-primary",
      () => void run(),
    );
    go.disabled = !prompt.trim();
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim())
        void run();
    });
    const keyLine = h(
      "p",
      { class: "ai-keyline" },
      aiKey.remembered
        ? T(
            lang,
            "Your key is remembered on this device.",
            "Votre clé est mémorisée sur cet appareil.",
          )
        : T(
            lang,
            "Your key is kept for this session.",
            "Votre clé est gardée pour cette session.",
          ),
      " ",
      btn(T(lang, "Change", "Changer"), "ai-link", () => show({ k: "key" })),
      btn(T(lang, "Forget the key", "Oublier la clé"), "ai-link", () => {
        aiKey.forget();
        show({
          k: "key",
          status: {
            ok: true,
            text: T(
              lang,
              "The key was forgotten on this device.",
              "La clé a été oubliée sur cet appareil.",
            ),
          },
        });
      }),
    );
    return [
      head(
        o.mode === "add"
          ? T(
              lang,
              "Generate slides for this course",
              "Générer des diapos pour ce cours",
            )
          : T(
              lang,
              "Create a course with Claude",
              "Créer un cours avec Claude",
            ),
      ),
      h(
        "div",
        { class: "ai-body" },
        h(
          "label",
          { for: "ai-prompt", class: "ai-label" },
          T(lang, "Describe the lesson", "Décrivez la leçon"),
        ),
        ta,
        ex,
        h(
          "div",
          { class: "ai-grid" },
          h(
            "div",
            { class: "ai-field" },
            h(
              "span",
              { id: "ai-f-l", class: "ai-label" },
              T(lang, "Programme", "Formation"),
            ),
            fGroup,
          ),
          h(
            "div",
            { class: "ai-field" },
            h(
              "label",
              { for: "ai-n", class: "ai-label" },
              T(lang, "Number of slides", "Nombre de diapos"),
            ),
            h("div", { class: "ai-row" }, num, numOut),
          ),
          h(
            "div",
            { class: "ai-field" },
            h(
              "span",
              { id: "ai-l-l", class: "ai-label" },
              T(lang, "Language of the course", "Langue du cours"),
            ),
            lGroup,
          ),
        ),
        h(
          "p",
          { class: "ai-note" },
          T(
            lang,
            "Every slide is written in French and English, built with the app’s own instruments and animations. You review the outline before anything is created.",
            "Chaque diapo est écrite en français et en anglais, construite avec les instruments et les animations de l’application. Vous relisez le plan avant toute création.",
          ),
        ),
        keyLine,
      ),
      foot(btn(T(lang, "Cancel", "Annuler"), "", close), go),
    ];
  };

  // ---------------------------------------------------------------- 3. generating
  const busyScreen = (titles: string[]) => {
    const list = h("ol", { class: "ai-arrive", "aria-live": "polite" });
    for (const t of titles) list.append(h("li", {}, t));
    return [
      head(
        T(lang, "Claude is preparing your slides", "Claude prépare vos diapos"),
      ),
      h(
        "div",
        { class: "ai-body ai-busy", "aria-busy": "true" },
        h(
          "div",
          { class: "ai-pulse", "aria-hidden": "true" },
          h("span", {}),
          h("span", {}),
          h("span", {}),
        ),
        h(
          "p",
          { class: "ai-busy-l", role: "status" },
          titles.length
            ? T(
                lang,
                `${titles.length} of ${slides} slides written…`,
                `${titles.length} diapos écrites sur ${slides}…`,
              )
            : T(
                lang,
                "Planning the lesson. This takes a minute or two.",
                "Préparation de la leçon. Cela prend une à deux minutes.",
              ),
        ),
        list,
      ),
      foot(btn(T(lang, "Cancel", "Annuler"), "", () => ctl?.abort())),
    ];
  };

  async function run() {
    const key = aiKey.get();
    if (!key) return show({ k: "key" });
    ctl = new AbortController();
    show({ k: "busy", titles: [] });
    const r = await generatePlan(
      { prompt, formation, slides, lang: courseLang },
      {
        apiKey: key,
        signal: ctl.signal,
        ...(o.clientFactory ? { clientFactory: o.clientFactory } : {}),
        onTitles: (t) => {
          if (screen.k === "busy") show({ k: "busy", titles: t });
        },
      },
    );
    ctl = null;
    if (!dlg.isConnected) return;
    if (r.ok) {
      plan = r.plan;
      order = r.plan.slides.map((_, i) => i);
      show({ k: "outline" });
    } else if (r.reason === "aborted") show({ k: "prompt" });
    else show({ k: "error", res: r });
  }

  // ---------------------------------------------------------------- 4. the outline
  const outlineScreen = () => {
    destroyViews();
    const p = plan!;
    const cur = editPlan(p, order);
    const items = outlineOf(cur);
    let mapped: ReturnType<typeof mapPlan> | null = null;
    try {
      mapped = mapPlan(cur, { run: "preview", formation });
    } catch {
      mapped = null;
    }
    const scenes: Record<string, SimScene> = mapped?.scenes ?? {};
    const list = h("ol", {
      class: "ai-outline",
      "aria-label": T(lang, "Outline", "Plan du cours"),
    });
    items.forEach((it, j) => {
      const src = cur.slides[j];
      const idx = order[j];
      const th = h("div", { class: "ai-th", "aria-hidden": "true" });
      const slide = mapped?.slides[j]?.slide;
      if (slide)
        requestAnimationFrame(() => {
          if (!th.isConnected) return;
          try {
            views.push(
              renderThumb(slide, th, {
                lang: courseLang,
                theme: "classroom",
                scenes,
              }),
            );
          } catch {
            /* a thumbnail is decoration */
          }
        });
      const tf = titleField(src);
      const title = tf
        ? (() => {
            const i = h("input", {
              class: "ai-input ai-title",
              type: "text",
              "aria-label": T(
                lang,
                `Title of slide ${j + 1}`,
                `Titre de la diapo ${j + 1}`,
              ),
            }) as HTMLInputElement;
            i.value = loc(tf, courseLang);
            i.addEventListener("change", () => {
              const v = i.value.trim();
              if (!v) return;
              tf[courseLang] = v;
              show({ k: "outline" }, `[data-row="${idx}"] .ai-title`);
            });
            return i;
          })()
        : h("b", { class: "ai-title-ro" }, loc(it.title, courseLang));
      const inst = instrumentOf(src);
      const viewSel = inst
        ? (() => {
            const s = h("select", {
              class: "ai-input ai-view",
              "aria-label": T(
                lang,
                `Instrument of slide ${j + 1}`,
                `Instrument de la diapo ${j + 1}`,
              ),
            }) as HTMLSelectElement;
            for (const v of ["six", ...GAUGE_IDS])
              s.append(
                h(
                  "option",
                  { value: v },
                  viewName(v, lang),
                ),
              );
            s.value = inst.view;
            s.addEventListener("change", () => {
              inst.view = s.value as typeof inst.view;
              show({ k: "outline" }, `[data-row="${idx}"] .ai-view`);
            });
            return s;
          })()
        : it.view
          ? h(
              "span",
              { class: "ai-tag" },
              viewName(it.view, lang),
            )
          : null;
      const move = (d: -1 | 1) => {
        const k = j + d;
        if (k < 0 || k >= order.length) return;
        [order[j], order[k]] = [order[k], order[j]];
        show({ k: "outline" }, `[data-row="${idx}"] [data-move="${d}"]`);
      };
      const up = btn([icon(UP)], "ai-ico", () => move(-1), {
        "aria-label": T(
          lang,
          `Move slide ${j + 1} up`,
          `Monter la diapo ${j + 1}`,
        ),
        "data-move": "-1",
      });
      const down = btn([icon(DOWN)], "ai-ico", () => move(1), {
        "aria-label": T(
          lang,
          `Move slide ${j + 1} down`,
          `Descendre la diapo ${j + 1}`,
        ),
        "data-move": "1",
      });
      up.disabled = j === 0;
      down.disabled = j === items.length - 1;
      const del = btn(
        [icon(CLOSE)],
        "ai-ico",
        () => {
          order.splice(j, 1);
          show(
            { k: "outline" },
            ".ai-outline li:nth-child(" +
              Math.min(j + 1, order.length) +
              ") .ai-ico[data-del]",
          );
        },
        {
          "aria-label": T(
            lang,
            `Remove slide ${j + 1}`,
            `Retirer la diapo ${j + 1}`,
          ),
          "data-del": "",
        },
      );
      del.disabled = items.length <= 1;
      list.append(
        h(
          "li",
          {
            class: `ai-o${isActionKind(it.kind) ? " act" : ""}`,
            "data-row": String(idx),
          },
          h("span", { class: "ai-o-n" }, String(j + 1)),
          th,
          h(
            "div",
            { class: "ai-o-b" },
            h(
              "div",
              { class: "ai-o-meta" },
              h(
                "span",
                { class: `ai-kind k-${it.kind}` },
                kindName(it.kind, lang),
              ),
              viewSel,
              it.animation
                ? h("span", { class: "ai-tag" }, animationName(it.animation, lang))
                : null,
            ),
            title,
          ),
          h("div", { class: "ai-o-act" }, up, down, del),
        ),
      );
    });
    // pacing: never three slides in a row without the student acting
    let run3 = 0;
    let gap = false;
    for (const it of items) {
      run3 = isActionKind(it.kind) ? 0 : run3 + 1;
      if (run3 >= 4) gap = true;
    }
    const notes = [
      ...(gap
        ? [
            T(
              lang,
              "Four slides in a row without the student acting: consider moving a question earlier.",
              "Quatre diapos de suite sans que l’élève agisse : pensez à avancer une question.",
            ),
          ]
        : []),
      ...(mapped?.warnings ?? []).slice(0, 3).map((w) => loc(w, lang)),
    ];
    const n = items.length;
    const make = btn(
      o.mode === "add"
        ? T(lang, `Add to the course (${n})`, `Ajouter au cours (${n})`)
        : T(lang, "Create the course", "Créer le cours"),
      "ai-primary",
      () => void finish(),
    );
    return [
      head(loc(cur.title, courseLang) || T(lang, "Your outline", "Votre plan")),
      h(
        "div",
        { class: "ai-body" },
        h(
          "p",
          { class: "ai-note" },
          T(
            lang,
            `${n} slides. Rename, reorder or remove them, then create. Everything stays editable in the editor.`,
            `${n} diapos. Renommez, réordonnez ou retirez-les, puis créez. Tout reste modifiable dans l’éditeur.`,
          ),
        ),
        notes.length
          ? h(
              "ul",
              { class: "ai-warn", role: "note" },
              ...notes.map((t) => h("li", {}, t)),
            )
          : null,
        list,
      ),
      foot(
        btn(T(lang, "Start again", "Recommencer"), "", () =>
          show({ k: "prompt" }),
        ),
        make,
      ),
    ];
  };

  async function finish() {
    if (!plan || busy) return;
    const cur = editPlan(plan, order);
    if (!cur.slides.length) return;
    busy = true;
    dlg.classList.add("is-busy");
    try {
      if (o.mode === "add") {
        o.onAdd?.(mapPlan(cur, { run: runId(), formation }).starter);
        close();
        return;
      }
      const s = await o.store;
      if (!s)
        throw new Error(
          T(lang, "no course store", "pas de stockage des cours"),
        );
      const id = await s.newId(courseLang === "fr" ? "cours-ia" : "ai-course");
      const { course } = courseFromPlan(cur, {
        id,
        lang: courseLang,
        formation,
      });
      const r = await s.save(course);
      if (!r.ok) throw new Error(loc(r.message, lang));
      close();
      o.onCreated?.(r.course.id);
    } catch (e) {
      busy = false;
      dlg.classList.remove("is-busy");
      show({
        k: "error",
        res: {
          ok: false,
          reason: "api",
          message: {
            en: `The course could not be saved on this device (${(e as Error).message}).`,
            fr: `Le cours n’a pas pu être enregistré sur cet appareil (${(e as Error).message}).`,
          },
        },
      });
    }
  }

  // ---------------------------------------------------------------- 5. an error
  const errorScreen = (res: Extract<GenResult, { ok: false }>) => {
    const keyIssue =
      res.reason === "api" &&
      /Clé refusée|Key refused/.test(res.message.en + (res.message.fr ?? ""));
    return [
      head(T(lang, "Nothing was created", "Rien n’a été créé")),
      h(
        "div",
        { class: "ai-body" },
        h("p", { class: "ai-err", role: "alert" }, loc(res.message, lang)),
        res.reason === "refusal"
          ? h(
              "p",
              { class: "ai-note" },
              T(
                lang,
                "Keep the request about flying and teaching, and try other words.",
                "Restez sur le pilotage et l’enseignement, et essayez d’autres mots.",
              ),
            )
          : null,
      ),
      foot(
        keyIssue
          ? btn(T(lang, "Change the key", "Changer de clé"), "", () =>
              show({ k: "key" }),
            )
          : null,
        btn(T(lang, "Edit the request", "Modifier la demande"), "", () =>
          show({ k: "prompt" }),
        ),
        res.reason === "tooLong"
          ? btn(
              T(lang, "Fewer slides", "Moins de diapos"),
              "ai-primary",
              () => {
                slides = Math.max(MIN_SLIDES, slides - 3);
                void run();
              },
            )
          : btn(
              T(lang, "Try again", "Réessayer"),
              "ai-primary",
              () => void run(),
            ),
      ),
    ];
  };

  // ---------------------------------------------------------------- screens
  function show(s: Screen, focusSel?: string) {
    // titles arriving: update the list and the line in place (the focus stays on « Annuler »)
    if (s.k === "busy" && screen.k === "busy" && dlg.dataset.screen === "busy") {
      screen = s;
      const list = dlg.querySelector(".ai-arrive");
      const line = dlg.querySelector(".ai-busy-l");
      if (list && line) {
        for (const t of s.titles.slice(list.children.length)) list.append(h("li", {}, t));
        if (s.titles.length)
          line.textContent = T(lang, `${s.titles.length} of ${slides} slides written…`, `${s.titles.length} diapos écrites sur ${slides}…`);
        return;
      }
    }
    screen = s;
    destroyViews();
    const kids =
      s.k === "key"
        ? keyScreen(s.status)
        : s.k === "prompt"
          ? promptScreen()
          : s.k === "busy"
            ? busyScreen(s.titles)
            : s.k === "outline"
              ? outlineScreen()
              : errorScreen(s.res);
    dlg.dataset.screen = s.k;
    dlg.replaceChildren(h("div", { class: "ai-card" }, ...kids));
    if (!dlg.open) dlg.showModal();
    // where the focus goes: what the instructor does next
    const f =
      (focusSel && dlg.querySelector<HTMLElement>(focusSel)) ||
      (s.k === "key"
        ? dlg.querySelector<HTMLElement>("#ai-key")
        : s.k === "prompt"
          ? dlg.querySelector<HTMLElement>("#ai-prompt")
          : s.k === "busy"
            ? dlg.querySelector<HTMLElement>(".ai-foot .ai-btn")
            : dlg.querySelector<HTMLElement>(".ai-foot .ai-primary"));
    f?.focus();
  }
  show(screen);
  return { el: dlg, close };
}

/** « Créer avec l’IA » on the Nouveau cours page. */
export function openAiCreate(o: {
  lang: Lang;
  store: Promise<CourseStore | null>;
  program?: string | null;
  onCreated(id: string): void;
  clientFactory?: ClientFactory;
}): AiAssistant {
  return openAiAssistant({
    lang: o.lang,
    mode: "create",
    formation: formationOf(o.program),
    store: o.store,
    onCreated: o.onCreated,
    ...(o.clientFactory ? { clientFactory: o.clientFactory } : {}),
  });
}
