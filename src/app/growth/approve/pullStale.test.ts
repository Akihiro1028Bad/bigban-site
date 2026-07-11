import { describe, expect, it } from "vitest";

import { PULL_STALE_THRESHOLD_MS, pullStaleView } from "./pullStale";

const T = PULL_STALE_THRESHOLD_MS;
const NOW = 1_700_000_000_000;

describe("pullStaleView", () => {
  it("busy かつ依頼時刻あり・しきい値超は stuck(経過分つき)", () => {
    expect(pullStaleView(NOW - T - 60_000, NOW, T, true)).toEqual({ minutes: 16, stuck: true });
  });

  it("busy かつしきい値未満は stuck=false", () => {
    expect(pullStaleView(NOW - 5 * 60_000, NOW, T, true)).toEqual({ minutes: 5, stuck: false });
  });

  it("ちょうどしきい値は stuck=false(厳密超過のみ)", () => {
    expect(pullStaleView(NOW - T, NOW, T, true)).toEqual({ minutes: 15, stuck: false });
  });

  it("非 busy は null(非表示)", () => {
    expect(pullStaleView(NOW - T - 1, NOW, T, false)).toBeNull();
  });

  it("依頼時刻が無いと null", () => {
    expect(pullStaleView(null, NOW, T, true)).toBeNull();
  });

  it("時計ズレ(負の経過)は 0 分・stuck=false に丸める", () => {
    expect(pullStaleView(NOW + 10_000, NOW, T, true)).toEqual({ minutes: 0, stuck: false });
  });
});
