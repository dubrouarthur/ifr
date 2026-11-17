// The classroom remote (a clicker) sends PageDown / PageUp, some send Space or the arrows. In the presenter, those
// keys turn the page even after a control of the slide was touched and kept the focus (review P1: the deck seemed
// frozen once the presenter had clicked « Réduire la puissance »). Only a knob or a slider keeps its arrow keys.
// Pure: the presenter asks, then does it.

export interface ClickerKey {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * The page turn a key asks for while the focus is in a slide's control strip: "next", "back", or null (the key is
 * the control's own). `onSlider`: the focus is on a knob or a slider (role slider), whose arrows turn it.
 */
export function clickerPage(e: ClickerKey, onSlider: boolean): "next" | "back" | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "PageDown" || e.key === " ") return "next";
  if (e.key === "PageUp") return "back";
  if (onSlider) return null;
  if (e.key === "ArrowRight") return "next";
  if (e.key === "ArrowLeft") return "back";
  return null;
}
