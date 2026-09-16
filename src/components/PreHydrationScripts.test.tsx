import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

type InsertCallback = () => ReactNode;

const state: { callback: InsertCallback | null } = { callback: null };

vi.mock("next/navigation", () => ({
  useServerInsertedHTML: (cb: InsertCallback) => {
    state.callback = cb;
  },
}));

describe("PreHydrationScripts", () => {
  beforeEach(() => {
    state.callback = null;
  });

  it("returns null so it does not render anything directly into the tree", async () => {
    const { default: PreHydrationScripts } = await import(
      "./PreHydrationScripts"
    );

    const { container } = render(<PreHydrationScripts />);

    expect(container.innerHTML).toBe("");
  });

  it("既定ではブラウザ判定スクリプトのみを出力する (イントロは OFF)", async () => {
    const { default: PreHydrationScripts, browserDetectScript } = await import(
      "./PreHydrationScripts"
    );

    render(<PreHydrationScripts />);

    const cb = state.callback;
    if (!cb) throw new Error("useServerInsertedHTML callback was not captured");

    const { container } = render(<>{cb()}</>);
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).toBe(browserDetectScript);
  });

  it("shouldPlayIntro を渡したときだけイントロスクリプトも出力する", async () => {
    const { default: PreHydrationScripts, browserDetectScript, introScript } =
      await import("./PreHydrationScripts");

    render(<PreHydrationScripts shouldPlayIntro />);

    const cb = state.callback;
    if (!cb) throw new Error("useServerInsertedHTML callback was not captured");

    const { container } = render(<>{cb()}</>);
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(2);
    expect(scripts[0].textContent).toBe(browserDetectScript);
    expect(scripts[1].textContent).toBe(introScript);
  });

  it("exposes browser detection logic targeting iOS Safari", async () => {
    const { browserDetectScript } = await import("./PreHydrationScripts");
    expect(browserDetectScript).toContain("ios-safari");
    expect(browserDetectScript).toContain("navigator.userAgent");
    expect(browserDetectScript).toContain("maxTouchPoints");
    expect(browserDetectScript).toContain("Instagram");
  });

  it("exposes intro-pending logic gated by reduced-motion and session flag", async () => {
    const { introScript } = await import("./PreHydrationScripts");
    expect(introScript).toContain("intro-pending");
    expect(introScript).toContain("bigban-intro-played");
    expect(introScript).toContain("prefers-reduced-motion");
  });

  it("intro-pending は何があっても 6 秒以内に DOM レベルで必ず剥がれるフェイルセーフを持つ", async () => {
    // HomeIntro の useEffect が hydration race で走らない場合でも、
    // main が永久に visibility:hidden に閉じ込められないよう保証する。
    const { introScript } = await import("./PreHydrationScripts");
    expect(introScript).toContain("setTimeout");
    expect(introScript).toContain("6000");
    expect(introScript).toMatch(/classList\.remove\(['"]intro-pending['"]\)/);
  });
});
