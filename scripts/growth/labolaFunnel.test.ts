// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  LABOLA_FUNNEL_EVENTS,
  LABOLA_MEASUREMENT_START_YMD,
  summarizeLabolaFunnel,
} from "./labolaFunnel";
import type { MergedRow } from "./transform";

function row(eventName: string, current: number): MergedRow {
  return {
    keys: [eventName],
    metrics: { eventCount: { current, prior: 0, deltaPct: null } },
  };
}

describe("summarizeLabolaFunnel", () => {
  it("通常予約・プログラム予約とサイトからLaBOLAへの遷移を集計する", () => {
    const result = summarizeLabolaFunnel({
      period: { start: "2026-07-13", end: "2026-07-19" },
      rows: [
        row("reservation_click", 18),
        row(LABOLA_FUNNEL_EVENTS.rental.input, 12),
        row(LABOLA_FUNNEL_EVENTS.rental.complete, 4),
        row(LABOLA_FUNNEL_EVENTS.program.input, 5),
        row(LABOLA_FUNNEL_EVENTS.program.complete, 2),
        row("line_click", 99),
      ],
    });

    expect(result).toEqual({
      measurementStartedOn: LABOLA_MEASUREMENT_START_YMD,
      observedDays: 2,
      isReferenceOnly: true,
      siteToLabola: 18,
      rental: { input: 12, complete: 4 },
      program: { input: 5, complete: 2 },
    });
  });

  it("計測開始前の期間は0日、7日以上なら参考値フラグを外す", () => {
    expect(summarizeLabolaFunnel({
      period: { start: "2026-07-06", end: "2026-07-12" },
      rows: [],
    })).toMatchObject({ observedDays: 0, isReferenceOnly: true });

    expect(summarizeLabolaFunnel({
      period: { start: "2026-07-18", end: "2026-07-24" },
      rows: [],
    })).toMatchObject({ observedDays: 7, isReferenceOnly: false });
  });
});
