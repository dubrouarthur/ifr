// Review P1: once the presenter touched a control of the slide, the clicker must still turn the page.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clickerPage } from "../src/course/ui/clickerKeys";

describe("the clicker turns the page with the focus in a slide's control strip", () => {
  it("PageDown, Space and PageUp page from any control, a knob or a slider included", () => {
    for (const onSlider of [false, true]) {
      expect(clickerPage({ key: "PageDown" }, onSlider)).toBe("next");
      expect(clickerPage({ key: " " }, onSlider)).toBe("next");
      expect(clickerPage({ key: "PageUp" }, onSlider)).toBe("back");
    }
  });
  it("the arrows page from a button, but turn a knob or a slider", () => {
    expect(clickerPage({ key: "ArrowRight" }, false)).toBe("next");
    expect(clickerPage({ key: "ArrowLeft" }, false)).toBe("back");
    expect(clickerPage({ key: "ArrowRight" }, true)).toBeNull();
    expect(clickerPage({ key: "ArrowUp" }, true)).toBeNull();
  });
  it("leaves other keys and shortcuts alone", () => {
    expect(clickerPage({ key: "Enter" }, false)).toBeNull();
    expect(clickerPage({ key: "PageDown", ctrlKey: true }, false)).toBeNull();
  });
  it("is asked by the presenter before the strip's own keys (window, capture phase)", () => {
    const src = readFileSync("src/course/ui/presenter.ts", "utf8");
    expect(src).toMatch(/window\.addEventListener\("keydown", this\.onDemoKey, true\)/);
    const body = src.slice(src.indexOf("private onDemoKey"));
    expect(body.indexOf("clickerPage(")).toBeGreaterThan(-1);
    expect(body.indexOf("clickerPage(")).toBeLessThan(body.indexOf("this.demo.key(e)"));
  });
});
