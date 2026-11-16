// « Assistant IA » — the two entry points, kept tiny: the dialog, its styles, Zod and the Anthropic SDK are only
// downloaded when the instructor opens the assistant (dynamic import()).
import type { Lang } from "../types";
import type { CourseStore } from "../store";
import type { DeckStarter } from "../ui/deckStarters";

/** The assistant's mark (a spark), drawn in currentColor. */
export const AI_SPARK =
  "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z";

function spark(size = 18): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", AI_SPARK);
  s.append(p);
  return s;
}

/** « Créer avec l’IA » (academy.html#new): a button in the page's own style. */
export function aiCreateButton(o: {
  lang: Lang;
  store: Promise<CourseStore | null>;
  program: string | null;
  onCreated(id: string): void;
}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nc-btn nc-ai";
  b.dataset.ai = "create";
  b.style.marginTop = "16px";
  const label = document.createElement("span");
  label.textContent = o.lang === "fr" ? "Créer avec l’IA" : "Create with AI";
  b.append(spark(), label);
  b.addEventListener("click", () => {
    void import("./dialog").then((m) =>
      m.openAiCreate({
        lang: o.lang,
        store: o.store,
        program: o.program,
        onCreated: o.onCreated,
      }),
    );
  });
  return b;
}

/** « Générer des diapos avec l’IA » (the editor): the deck goes in like a template, one undo step. */
export function openAiAdd(o: {
  lang: Lang;
  program?: string | null;
  onAdd(deck: DeckStarter): void;
}): void {
  void import("./dialog").then((m) =>
    m.openAiAssistant({
      lang: o.lang,
      mode: "add",
      formation: m.formationOf(o.program),
      onAdd: o.onAdd,
    }),
  );
}
