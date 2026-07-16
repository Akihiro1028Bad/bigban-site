import { describe, expect, it } from "vitest";
import {
  poissonLowerTailP,
  poissonUpperTailP,
  quantile,
  wilsonInterval,
} from "./reservationStats";

describe("wilsonInterval", () => {
  it("既知値と一致する(3/47, z=1.96)", () => {
    const ci = wilsonInterval(3, 47);
    expect(ci).not.toBeNull();
    expect(ci!.low).toBeCloseTo(0.0219, 3);
    expect(ci!.high).toBeCloseTo(0.1716, 3);
  });

  it("n=0はnull、0/nとn/nも破綻しない", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(0, 10)!.low).toBe(0);
    expect(wilsonInterval(10, 10)!.high).toBeCloseTo(1, 5);
  });
});

describe("poisson tails", () => {
  it("P(X≥k)とP(X≤k)が基本性質を満たす", () => {
    expect(poissonUpperTailP(0, 2)).toBeCloseTo(1, 10);
    expect(poissonUpperTailP(5, 2)).toBeCloseTo(1 - 0.947347, 4);
    expect(poissonLowerTailP(1, 4)).toBeCloseTo(0.091578, 4);
    expect(poissonUpperTailP(3, 0)).toBe(0);
    expect(poissonUpperTailP(0, 0)).toBe(1);
  });
});

describe("quantile", () => {
  it("中央値と四分位を線形補間で返す", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
    expect(quantile([5], 0.25)).toBe(5);
    expect(quantile([], 0.5)).toBeNull();
  });
});
