import { describe, it, expect } from "vitest";
import { EASE, revealInitial } from "./motion";

describe("EASE", () => {
  it("cubic-bezier の 4 制御値を持つ", () => {
    expect(EASE).toHaveLength(4);
  });
});

describe("revealInitial", () => {
  it("通常は与えられた初期状態をそのまま返す（リビールする）", () => {
    expect(revealInitial(false, { scaleX: 0 })).toEqual({ scaleX: 0 });
  });

  it("reduced-motion では false を返し、初期状態を持たず静的表示にする", () => {
    expect(revealInitial(true, { scaleX: 0 })).toBe(false);
  });
});
