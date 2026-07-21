// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  LABOLA_ENTRY_EVENTS,
  LABOLA_FUNNEL_EVENTS,
  LABOLA_MEASUREMENT_START_YMD,
  summarizeLabolaFunnel,
} from "./labolaFunnel";
import type { MergedRow } from "./transform";

function row(eventName: string, current: number): MergedRow {
  return {
    keys: [eventName],
    metrics: { sessions: { current, prior: 0, deltaPct: null } },
  };
}

describe("summarizeLabolaFunnel", () => {
  it("通常予約・プログラム予約とサイトからLaBOLAへの遷移を集計する", () => {
    const result = summarizeLabolaFunnel({
      period: { start: "2026-07-27", end: "2026-08-02" },
      rows: [
        row(LABOLA_ENTRY_EVENTS.rental, 14),
        row(LABOLA_ENTRY_EVENTS.program, 4),
        row(LABOLA_FUNNEL_EVENTS.rental.input, 12),
        row(LABOLA_FUNNEL_EVENTS.rental.complete, 4),
        row(LABOLA_FUNNEL_EVENTS.program.input, 5),
        row(LABOLA_FUNNEL_EVENTS.program.complete, 2),
        row("line_click", 99),
      ],
    });

    expect(result).toEqual({
      measurementStartedOn: LABOLA_MEASUREMENT_START_YMD,
      observedDays: 7,
      isReferenceOnly: false,
      entryMeasurementStatus: "available",
      siteToLabola: 18,
      rental: { siteToLabola: 14, input: 12, complete: 4 },
      program: { siteToLabola: 4, input: 5, complete: 2 },
    });
  });

  it("計測開始前の期間は0日、7日以上なら参考値フラグを外す", () => {
    expect(summarizeLabolaFunnel({
      period: { start: "2026-07-20", end: "2026-07-26" },
      rows: [],
    })).toMatchObject({ observedDays: 0, isReferenceOnly: true });

    expect(summarizeLabolaFunnel({
      period: { start: "2026-07-27", end: "2026-08-02" },
      rows: [],
    })).toMatchObject({ observedDays: 7, isReferenceOnly: false });
  });

  it("計測開始前はサイト遷移を0件と誤認しない", () => {
    const result = summarizeLabolaFunnel({
      period: { start: "2026-07-20", end: "2026-07-26" },
      rows: [
        row(LABOLA_FUNNEL_EVENTS.rental.input, 5),
      ],
    });

    expect(result).toMatchObject({
      observedDays: 0,
      isReferenceOnly: true,
      entryMeasurementStatus: "unavailable",
      siteToLabola: null,
      rental: { siteToLabola: null, input: 5 },
      program: { siteToLabola: null },
    });
  });

  it("eventCountを離脱判定へ混ぜず、セッション数だけを集計する", () => {
    const result = summarizeLabolaFunnel({
      period: { start: "2026-07-27", end: "2026-08-02" },
      rows: [{
        keys: [LABOLA_ENTRY_EVENTS.rental],
        metrics: {
          sessions: { current: 3, prior: 0, deltaPct: null },
          eventCount: { current: 30, prior: 0, deltaPct: null },
        },
      }],
    });

    expect(result.siteToLabola).toBe(3);
  });
});
