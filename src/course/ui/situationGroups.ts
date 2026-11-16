// Ground school — the inspector's groups about the simulator, in the author's own order and words:
// « Ce qu’il montre » (the flight situation, set here, picked ready, or flown and captured) and
// « Ce qu’on lui demande » (the goal of « À vous », picked from sentences written with the situation's numbers).
// The form itself is ui/situationEditor.ts; the model is ../situations.ts.
import { h } from "../../ui/dom";
import type { Lang, StageControl, YourTurn } from "../types";
import type { Sim } from "../../sim/sim";
import {
  goalSentence,
  posLine,
  sceneOfSituation,
  sentenceOf,
  sentencesFor,
  sitLabel,
  situationOfScene,
  yourTurnFor,
  type Situation,
} from "../situations";
import {
  SituationEditor,
  readyGrid,
  type SitTarget,
  type SituationHost,
} from "./situationEditor";
import { btn, group, linkBtn, note } from "./inspector";

export interface SitGroupCtx {
  lang: Lang;
  situations: SituationHost;
  cockpit: "g1000" | "steam" | "airliner";
  /** a Sim already posed at a scene of the course (saves building one to read a captured scene) */
  simOf(sceneId: string | undefined): Sim | null;
  /** draw the inspector again, keeping the field that has the focus */
  redraw(): void;
  /** the inspector destroys these when it is drawn again */
  keep(part: { destroy(): void }): void;
}
/** The situation an inspector shows, shared by its groups: « Ce qu’on lui demande » follows « Ce qu’il montre ». */
export interface LiveSituation {
  sit: Situation;
  onFinal: ((sit: Situation) => void)[];
}

const t = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

export interface ShowsOptions {
  /** the instrument or simulator view (its own situation or the slide's); omit for a step's scene */
  blockId?: string;
  /** a step's scene (stage, fly): where it is stored */
  scene?: { id: string | undefined; set(id: string): void };
  /** what follows the form inside the group (a recorded moment to play, the view…) */
  extra?: (Node | null)[];
  title?: string;
  /** the form is open (an instrument) or folded under « Régler ici » (a step, where the summary comes first) */
  folded?: boolean;
  /** takes the details of the situation (position, radios, wind, failures, autopilot) and « Ouvrir dans le
   *  simulateur » out of the group, for the inspector's « Plus de réglages » */
  more?: (nodes: Node[]) => void;
}

/** « Ce qu’il montre »: the situation in one line, who shares it, the ready situations, the form, the cockpit. */
export function showsGroup(
  ctx: SitGroupCtx,
  o: ShowsOptions = {},
): { el: HTMLElement; live: LiveSituation } {
  const lang = ctx.lang;
  const S = ctx.situations;
  const T = (en: string, fr: string) => t(lang, en, fr);
  let sceneId = o.scene?.id;
  const read = o.scene ? S.readScene(sceneId) : S.read(o.blockId);
  const sit0 = situationOfScene(
    read.scene,
    ctx.simOf(read.sceneId) ?? undefined,
  );
  const live: LiveSituation = { sit: sit0, onFinal: [] };
  const target = (): SitTarget =>
    o.scene
      ? {
          kind: "scene",
          from: "inspector",
          id: sceneId,
          set: (id) => {
            sceneId = id;
            o.scene!.set(id);
          },
        }
      : read.own && o.blockId
        ? { kind: "block", id: o.blockId, from: "inspector" }
        : { kind: "slide", from: "inspector" };

  const headName = h("b", {});
  const headPos = h("span", {});
  const head = h("div", { class: "sit-head" }, headName, headPos);
  const paint = (s: Situation) => {
    headName.textContent = sitLabel(s);
    headPos.textContent = posLine(s.pos, lang);
  };
  paint(sit0);

  // who else shows it, in plain words
  let share: HTMLElement | null = null;
  if (!o.scene && o.blockId) {
    if (read.own)
      share = h(
        "p",
        { class: "ce-note sit-share" },
        T(
          "This instrument shows another aircraft than the slide. ",
          "Cet instrument montre un autre avion que la diapo. ",
        ),
        linkBtn(
          T("Show the same aircraft", "Montrer le même avion"),
          () => S.join(o.blockId!),
        ),
      );
    else if (read.shared > 0)
      share = h(
        "p",
        { class: "ce-note sit-share" },
        T(
          `The ${read.shared + 1} instruments of this slide show the same situation: they move together. `,
          `Les ${read.shared + 1} instruments de cette diapo montrent la même situation : ils bougent ensemble. `,
        ),
        linkBtn(T("Give it its own situation", "Lui donner sa propre situation"), () =>
          S.split(o.blockId!),
        ),
      );
    else
      share = h(
        "p",
        { class: "ce-note muted sit-share" },
        T(
          "This is the slide’s situation: another instrument added here will show the same.",
          "C’est la situation de la diapo : un autre instrument ajouté ici montrera la même.",
        ),
      );
  }

  const editor = new SituationEditor({
    lang,
    sit: sit0,
    base: read.scene,
    cockpit: ctx.cockpit,
    onChange: (s, final) => {
      live.sit = s;
      paint(s);
      const moved = S.write(s, final, target());
      if (final) for (const f of live.onFinal) f(s);
      // the element now has a scene of its own: what the inspector read from the slide is out of date
      if (moved) ctx.redraw();
    },
  });
  ctx.keep(editor);

  // « Partir d’une situation prête »: drawn when it is opened
  const readyBody = h("div", { class: "sit-fold-b" });
  const ready = h(
    "details",
    { class: "sit-fold" },
    h(
      "summary",
      {},
      T("Start from a ready situation", "Partir d’une situation prête"),
    ),
    readyBody,
  );
  let grid: ReturnType<typeof readyGrid> | null = null;
  ready.addEventListener("toggle", () => {
    if (!ready.open || grid) return;
    grid = readyGrid(
      lang,
      (r) => {
        editor.set(r.sit);
        live.sit = r.sit;
        paint(r.sit);
        const moved = S.write(r.sit, true, target());
        for (const f of live.onFinal) f(r.sit);
        ready.open = false;
        if (moved) ctx.redraw();
      },
      { cockpit: ctx.cockpit, compact: true },
    );
    ctx.keep(grid);
    readyBody.append(grid.el);
  });

  const form = o.folded
    ? h(
        "details",
        { class: "sit-fold" },
        h("summary", {}, T("Set it here", "Régler ici")),
        h("div", { class: "sit-fold-b" }, editor.el),
      )
    : editor.el;

  const fly = S.canFly
    ? h(
        "div",
        { class: "sit-fly" },
        btn(
          T(
            "Open in the simulator",
            "Ouvrir dans le simulateur",
          ),
          () => S.fly(sceneOfSituation(editor.value, { base: read.scene })),
          { cls: "sm", icon: "play" },
        ),
        note(
          T(
            "The course is saved first. In the simulator, C captures a moment; “Back to the editor” brings you back here.",
            "Le cours est enregistré avant. Dans le simulateur, C capture un moment ; « Retour à l’éditeur » vous ramène ici.",
          ),
          "muted",
        ),
      )
    : null;

  if (o.more) {
    const secs = editor.el.querySelector(".sit-secs");
    o.more([secs, fly].filter((x): x is HTMLElement => !!x));
  }
  const el = group(o.title ?? T("What it shows", "Ce qu’il montre"), [
    head,
    share,
    ready,
    form,
    ...(o.extra ?? []),
    o.more ? null : fly,
  ]);
  el.classList.add("sit-grp");
  return { el, live };
}

export interface AskOptions {
  where: "slide" | "sim";
  yt: YourTurn | undefined;
  /** a navigation instrument (HSI, VOR, RMI): the bar and the OBS come first */
  nav?: boolean;
  /** store the goal; `controls`: what the student needs for it (ticked on the instrument) */
  apply(
    yt: YourTurn | undefined,
    controls?: StageControl[],
    render?: boolean,
  ): void;
  /** the detailed editor (task text, checks, hold time, hint), folded */
  detail?: () => HTMLElement;
  scene?: string;
  /** the author just chose « À vous »: the first suggested goal is set (and saved) at once, the list stays to change it */
  autoPick?: boolean;
}

/** « Ce qu’on lui demande »: nothing, or a goal picked from sentences written with the situation's numbers. */
export function askGroup(
  ctx: SitGroupCtx,
  live: LiveSituation,
  o: AskOptions,
): HTMLElement {
  const lang = ctx.lang;
  const T = (en: string, fr: string) => t(lang, en, fr);
  const tr = (l: { en: string; fr?: string }) =>
    lang === "fr" ? (l.fr ?? l.en) : l.en;
  const body = h("div", { class: "sit-ask" });
  let yt = o.yt;
  const draw = () => {
    const sit = live.sit;
    const list = sentencesFor(o.where, sit, !!o.nav);
    if (!yt && o.autoPick && list.length) {
      const g = list[0];
      // after the panel is drawn: the goal is stored like a click on the first sentence
      queueMicrotask(() => o.apply(yourTurnFor(g, sit, o.where, o.scene), g.controls, true));
    }
    if (!yt) {
      body.replaceChildren(
        note(
          o.where === "slide"
            ? T(
                "Nothing yet: the student watches, and handles the controls you ticked. Pick what to ask:",
                "Rien pour l’instant : l’élève regarde, et manie les commandes cochées. Choisissez quoi lui demander :",
              )
            : T(
                "Nothing yet: the view only shows the flight. Pick what the student must fly in the simulator:",
                "Rien pour l’instant : la vue montre seulement le vol. Choisissez ce que l’élève doit voler dans le simulateur :",
              ),
          "muted",
        ),
        h(
          "div",
          {
            class: "sit-ask-list",
            role: "group",
            "aria-label": T("What to ask", "Ce qu’on lui demande"),
          },
          ...list.slice(0, 5).map((g) => {
            const b = h(
              "button",
              { type: "button", class: "sit-ask-b" },
              tr(g.text(sit)),
            );
            b.addEventListener("click", () =>
              o.apply(yourTurnFor(g, sit, o.where, o.scene), g.controls, true),
            );
            return b;
          }),
        ),
      );
      return;
    }
    const cur = sentenceOf(yt, sit);
    const sel = h("select", {
      class: "ce-in",
      "aria-label": T("What to ask", "Ce qu’on lui demande"),
    });
    if (!cur)
      sel.append(
        h(
          "option",
          { value: "" },
          T(
            "A goal of your own (see the detail)",
            "Un objectif sur mesure (voir le détail)",
          ),
        ),
      );
    for (const g of list) {
      const e = h("option", { value: g.id }, tr(g.text(sit)));
      if (cur?.id === g.id) e.selected = true;
      sel.append(e);
    }
    sel.addEventListener("change", () => {
      const g = goalSentence(sel.value);
      if (!g || !yt) return;
      const next = yourTurnFor(g, live.sit, o.where, yt.scene ?? o.scene);
      o.apply(
        {
          ...next,
          ...(yt.hint ? { hint: yt.hint } : {}),
          ...(yt.showMe ? { showMe: yt.showMe } : {}),
        },
        g.controls,
        true,
      );
    });
    const detail = o.detail
      ? h(
          "details",
          { class: "sit-fold" },
          h("summary", {}, T("Adjust the detail", "Régler le détail")),
          h("div", { class: "sit-fold-b" }, o.detail()),
        )
      : null;
    const parts: (Node | null)[] = [
      h("p", { class: "sit-ask-task" }, tr(yt.prompt)),
      sel,
      note(
        o.where === "slide"
          ? T(
              "The student presses “Take the controls” on the slide; the simulator checks the goal live.",
              "L’élève appuie sur « Prendre les commandes » sur la diapo ; le simulateur vérifie l’objectif en direct.",
            )
          : T(
              "The student presses “Fly in the simulator”, flies it, then comes back to the course with the result.",
              "L’élève appuie sur « Voler dans le simulateur », vole, puis revient au cours avec le résultat.",
            ),
        "muted",
      ),
      detail,
      h(
        "div",
        { class: "ce-row" },
        btn(
          T("Ask nothing", "Ne rien demander"),
          () => o.apply(undefined, undefined, true),
          { cls: "sm ghost", icon: "x" },
        ),
      ),
    ];
    body.replaceChildren(...parts.filter((x): x is Node => !!x));
  };
  draw();
  // the situation changed: a goal that came from a sentence keeps the sentence, with the new numbers
  let before = live.sit;
  live.onFinal.push((sit) => {
    const prev = before;
    before = sit;
    const g = yt ? sentenceOf(yt, prev) : null;
    if (yt && g) {
      const fresh = yourTurnFor(g, sit, o.where, yt.scene ?? o.scene);
      // the task follows too, unless the author rewrote it
      const generated =
        JSON.stringify(yt.prompt) ===
        JSON.stringify(yourTurnFor(g, prev, o.where).prompt);
      yt = {
        ...yt,
        ...(generated ? { prompt: fresh.prompt } : {}),
        goal: { ...yt.goal, all: fresh.goal.all },
      };
      o.apply(yt, undefined, false);
    }
    draw();
  });
  return group(T("What is asked", "Ce qu’on lui demande"), [body]);
}
