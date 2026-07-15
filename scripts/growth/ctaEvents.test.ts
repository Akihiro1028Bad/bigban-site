import { describe, expect, it } from "vitest";

import {
  CTA_EVENTS,
  aggregateCtaEvents,
  ctaBucketOf,
  combineMetricDeltas,
} from "./ctaEvents";

describe("CTA event contract", () => {
  it("全CTAイベントをちょうど1つの保存bucketへ分類する", () => {
    const classified = Object.values(CTA_EVENTS).map((eventName) => ctaBucketOf(eventName));
    expect(classified).toEqual([
      "instagramClick",
      "lineClick",
      "reservationClick",
      "reserveEntryClick",
      "other",
      "other",
      "other",
      "other",
      "other",
      "other",
      "other",
    ]);
    expect(classified.every((bucket) => bucket !== null)).toBe(true);
  });

  it("未知イベントは集計対象外にする", () => {
    expect(ctaBucketOf("purchase")).toBeNull();
    expect(aggregateCtaEvents([{ eventName: "purchase", current: 9, prior: 3 }])).toEqual({
      reservationClick: { current: 0, prior: 0, deltaPct: null },
      reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
      lineClick: { current: 0, prior: 0, deltaPct: null },
      instagramClick: { current: 0, prior: 0, deltaPct: null },
      other: { current: 0, prior: 0, deltaPct: null },
    });
  });

  it("合算後のcurrent/priorからdeltaを再計算する", () => {
    expect(
      combineMetricDeltas([
        { current: 2, prior: 1, deltaPct: 100 },
        { current: 1, prior: 2, deltaPct: -50 },
      ])
    ).toEqual({ current: 3, prior: 3, deltaPct: 0 });
  });
});
