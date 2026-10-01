// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LABOLA_STEPS, collectLabolaFunnel, formatLabolaFunnel } from "./labolaFunnel.mjs";

const range = { startDate: "2026-09-17", endDate: "2026-09-29" };

function report(value: string | null) {
  return value === null ? {} : { rows: [{ metricValues: [{ value }] }] };
}

describe("LaBOLA 段別集計", () => {
  it("6段を定義している(週カレンダー〜完了)", () => {
    expect(LABOLA_STEPS.map((step) => step.label)).toEqual(["週カレンダー", "予約情報", "顧客情報", "支払い", "最終確認", "完了"]);
  });

  it("各段を『除かない/自動アクセス除外』の2回で引き、LaBOLA ホストに絞る", async () => {
    const bodies: { dimensionFilter: unknown; dateRanges: unknown }[] = [];
    const ga4 = async (body: object) => {
      bodies.push(body as { dimensionFilter: unknown; dateRanges: unknown });
      const isHumanOnly = JSON.stringify(body).includes("notExpression");
      return report(isHumanOnly ? "10" : "30");
    };
    const rows = await collectLabolaFunnel(ga4, range);
    expect(rows[0]).toEqual({ label: "週カレンダー", all: 30, human: 10 });
    expect(bodies).toHaveLength(12);
    expect(JSON.stringify(bodies[0].dimensionFilter)).toContain("yoyaku.labola.jp");
    expect(bodies[0].dateRanges).toEqual([range]);
  });

  it("行が無い段は 0 として扱う", async () => {
    const rows = await collectLabolaFunnel(async () => report(null), range);
    expect(rows.every((row) => row.all === 0 && row.human === 0)).toBe(true);
  });

  it("整形は自動アクセスの数と、除外後の前段からの通過率を出す", () => {
    const text = formatLabolaFunnel([
      { label: "週カレンダー", all: 300, human: 100 },
      { label: "予約情報", all: 60, human: 25 },
      { label: "顧客情報", all: 0, human: 0 },
    ]);
    expect(text).toContain("週カレンダー  全体=300 自動除外後=100 (自動アクセス 200)");
    expect(text).toContain("予約情報  全体=60 自動除外後=25 (自動アクセス 35) 前段から25%");
    expect(text).toContain("顧客情報  全体=0 自動除外後=0 (自動アクセス 0) 前段から0%");
  });

  it("前段が 0 のときの通過率は『―』", () => {
    const text = formatLabolaFunnel([
      { label: "週カレンダー", all: 0, human: 0 },
      { label: "予約情報", all: 5, human: 5 },
    ]);
    expect(text).toContain("予約情報  全体=5 自動除外後=5 (自動アクセス 0) 前段から―");
  });
});
