import { describe, expect, it } from "vitest";

import { ringGeometry, ringTone, scoreBarTone, sparkColor, sparklineGeometry } from "./scales";

describe("scales", () => {
  it("scoreBarTone: 85+ green / 70+ accent / 未満 text-3", () => {
    expect(scoreBarTone(85)).toBe("var(--p-green)");
    expect(scoreBarTone(70)).toBe("var(--p-accent)");
    expect(scoreBarTone(69)).toBe("var(--p-text-3)");
  });

  it("ringTone: 85+ green / 70+ accent / 未満 amber", () => {
    expect(ringTone(90)).toBe("var(--p-green)");
    expect(ringTone(70)).toBe("var(--p-accent)");
    expect(ringTone(50)).toBe("var(--p-amber)");
  });

  it("ringGeometry: 半径=(size-8)/2・周長=2πr・dashOffset=周長*(1-value/100)", () => {
    const g = ringGeometry(100, 56);
    expect(g.r).toBe(24);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 24);
    expect(g.dashOffset).toBeCloseTo(0);
    expect(ringGeometry(0, 56).dashOffset).toBeCloseTo(2 * Math.PI * 24);
  });

  it("sparkColor: up=green / down=red", () => {
    expect(sparkColor(true)).toBe("var(--p-green)");
    expect(sparkColor(false)).toBe("var(--p-red)");
  });

  it("sparklineGeometry: 2点未満は null", () => {
    expect(sparklineGeometry([1], 124, 34)).toBeNull();
  });

  it("sparklineGeometry: 2点以上で line/area/last を返す", () => {
    const g = sparklineGeometry([0, 10], 124, 34);
    expect(g).not.toBeNull();
    expect(g?.line.startsWith("M")).toBe(true);
    expect(g?.area.endsWith("Z")).toBe(true);
    expect(typeof g?.last.x).toBe("number");
  });

  it("sparklineGeometry: 全点同値でも span>=1 で破綻しない", () => {
    const g = sparklineGeometry([5, 5, 5], 124, 34);
    expect(g).not.toBeNull();
    expect(Number.isFinite(g?.last.y)).toBe(true);
  });
});
