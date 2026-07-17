import { describe, expect, it } from "vitest";

import { analyticsSnapshot } from "./__fixtures__/analyticsSnapshot";
import { collectingSections, formatSyncedAtJst, freshnessOf, heatmapCells, insightEvidenceText, kpiCards, moneyPanel, sortedInsights } from "./analyticsView";

describe("analyticsView", () => {
  it("sourceSyncedAtを基準に鮮度を判定する", () => {
    const snapshot = analyticsSnapshot();
    expect(freshnessOf(snapshot, "2026-07-24")).toEqual({ level: "fresh", daysOld: 7, sourceSyncedYmd: "2026-07-17" });
    expect(freshnessOf(snapshot, "2026-07-25").level).toBe("stale");
  });

  it("同期日時をJSTのフッター表示用に整形する", () => {
    expect(formatSyncedAtJst("2026-07-17T04:26:51.103Z")).toBe("2026-07-17 13:26 時点");
  });

  it("KPIを表示用文字列にし、小標本と未収集を注記する", () => {
    const cards = kpiCards(analyticsSnapshot());
    expect(cards[0]).toEqual({ label: "実予約（対象週）", value: "8件", sub: "累積 42件・n<10のため参考値" });
    expect(kpiCards(analyticsSnapshot()).map((card) => card.value)).toContain("¥32,000");
    expect(kpiCards(analyticsSnapshot()).map((card) => card.label)).toContain("セルフ予約比率");
    const snapshot = analyticsSnapshot();
    snapshot.kpi.self = { selfCount4w: 0, total4w: 0, smartphone4w: 0 };
    snapshot.kpi.sales = { currentWeek: null, priorWeek: null, forecast28: null };
    expect(kpiCards(snapshot)[1].value).toBe("収集中");
    expect(kpiCards(snapshot)[2]).toMatchObject({ value: "収集中", sub: "売上CSVを待っています" });
  });

  it("気づきをseverity優先、同severityは新しい順にする", () => {
    expect(sortedInsights(analyticsSnapshot()).map((insight) => insight.id)).toEqual(["alert", "notice", "info"]);
    const snapshot = analyticsSnapshot();
    const infoInsight = snapshot.insights.find((insight) => insight.severity === "info");
    if (!infoInsight) throw new Error("フィクスチャにinfoの気づきがありません");
    snapshot.insights.push({ ...infoInsight, id: "newer-info", firstSeen: "2026-07-17" });
    expect(sortedInsights(snapshot).filter((insight) => insight.severity === "info").map((insight) => insight.id)).toEqual(["newer-info", "info"]);
    expect(insightEvidenceText({ n: 3, ci: "95%", ignored: null })).toBe("n=3 / ci=95%");
    expect(insightEvidenceText({ nested: {} })).toBeNull();
  });

  it("お金パネル用の金額を表示文字列にする", () => {
    expect(moneyPanel(analyticsSnapshot())).toEqual({ currentWeek: "¥32,000", forecast28: "¥128,000" });
  });

  it("ヒートマップを0から4の強度にする", () => {
    expect(heatmapCells(analyticsSnapshot()).map((cell) => cell.intensity)).toEqual([0, 2, 3, 4]);
    const snapshot = analyticsSnapshot();
    snapshot.catalog.heatmap = [{ dow: 1, slot: "10:00", count: 0 }];
    expect(heatmapCells(snapshot)[0].intensity).toBe(0);
  });

  it("欠落データと将来解禁領域を収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.meta.missingSections = ["customer", "unknown"];
    expect(collectingSections(snapshot)).toEqual(["商圏・顧客データ", "unknown", "ファネルはP3で解禁", "ペースカーブはP4で解禁"]);
  });
});
