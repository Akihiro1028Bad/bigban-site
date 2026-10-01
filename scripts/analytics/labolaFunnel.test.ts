// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LABOLA_STEPS, collectLabolaFunnel, formatLabolaFunnel } from "./labolaFunnel.mjs";

const range = { startDate: "2026-09-17", endDate: "2026-09-29" };

function report(value: string | null) {
  return value === null ? {} : { rows: [{ metricValues: [{ value }] }] };
}

describe("LaBOLA 段別集計", () => {
  it("カレンダーは週表示・1日表示・合計に分け、その後ろに5段を並べる", () => {
    expect(LABOLA_STEPS.map((step) => step.label)).toEqual([
      "週表示",
      "1日表示",
      "カレンダー合計",
      "予約情報",
      "顧客情報",
      "支払い",
      "最終確認",
      "完了",
    ]);
  });

  it("合計は週表示と1日表示の両方に当たるパスで、重複なしのユーザー数になる(1つのフィルタで数える)", () => {
    const [week, day, total] = LABOLA_STEPS;
    expect(week).toMatchObject({ matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar_week/" });
    expect(day).toMatchObject({ matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar/" });
    expect(total).toMatchObject({ matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar" });
    for (const path of ["/r/shop/3473/calendar_week/2026/10/5/", "/r/shop/3473/calendar/2026/10/5/"]) {
      expect(path.startsWith(total.value)).toBe(true);
    }
    expect(week.isDetail).toBe(true);
    expect(day.isDetail).toBe(true);
    expect(total.isDetail).toBeUndefined();
  });

  it("各段を『除かない/自動アクセス除外』の2回で引き、LaBOLA ホストに絞る", async () => {
    const bodies: { dimensionFilter: unknown; dateRanges: unknown }[] = [];
    const ga4 = async (body: object) => {
      bodies.push(body as { dimensionFilter: unknown; dateRanges: unknown });
      const isHumanOnly = JSON.stringify(body).includes("notExpression");
      return report(isHumanOnly ? "10" : "30");
    };
    const rows = await collectLabolaFunnel(ga4, range);
    expect(rows[0]).toEqual({ label: "週表示", all: 30, human: 10, isDetail: true });
    expect(rows[3]).toEqual({ label: "予約情報", all: 30, human: 10, isDetail: false });
    expect(bodies).toHaveLength(LABOLA_STEPS.length * 2);
    expect(JSON.stringify(bodies[0].dimensionFilter)).toContain("yoyaku.labola.jp");
    expect(bodies[0].dateRanges).toEqual([range]);
  });

  it("行が無い段は 0 として扱う", async () => {
    const rows = await collectLabolaFunnel(async () => report(null), range);
    expect(rows.every((row) => row.all === 0 && row.human === 0)).toBe(true);
  });

  it("整形は自動アクセスの数を出し、通過率は合計行(内訳ではなく)からの値にする", () => {
    const text = formatLabolaFunnel([
      { label: "週表示", all: 300, human: 80, isDetail: true },
      { label: "1日表示", all: 40, human: 40, isDetail: true },
      { label: "カレンダー合計", all: 330, human: 100, isDetail: false },
      { label: "予約情報", all: 60, human: 25, isDetail: false },
      { label: "顧客情報", all: 0, human: 0, isDetail: false },
    ]);
    expect(text).toContain("  内訳 週表示  全体=300 自動除外後=80 (自動アクセス 220)");
    expect(text).toContain("  内訳 1日表示  全体=40 自動除外後=40 (自動アクセス 0)");
    expect(text).not.toContain("内訳 週表示  全体=300 自動除外後=80 (自動アクセス 220) 前段から");
    expect(text).toContain("カレンダー合計  全体=330 自動除外後=100 (自動アクセス 230)");
    expect(text).toContain("予約情報  全体=60 自動除外後=25 (自動アクセス 35) 前段から25%");
    expect(text).toContain("顧客情報  全体=0 自動除外後=0 (自動アクセス 0) 前段から0%");
  });

  it("前段が 0 のときの通過率は『―』", () => {
    const text = formatLabolaFunnel([
      { label: "カレンダー合計", all: 0, human: 0, isDetail: false },
      { label: "予約情報", all: 5, human: 5, isDetail: false },
    ]);
    expect(text).toContain("予約情報  全体=5 自動除外後=5 (自動アクセス 0) 前段から―");
  });
});
