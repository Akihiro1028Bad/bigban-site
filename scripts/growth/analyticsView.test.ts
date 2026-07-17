import { describe, expect, it } from "vitest";

import { analyticsSnapshot } from "./__fixtures__/analyticsSnapshot";
import { collectingSections, demographicsView, formatSyncedAtJst, freshnessOf, heatmapCells, insightEvidenceText, kpiCards, moneyExtra, moneyPanel, programList, sortedInsights } from "./analyticsView";

describe("analyticsView", () => {
  it("sourceSyncedAtを基準に鮮度を判定する", () => {
    const snapshot = analyticsSnapshot();
    expect(freshnessOf(snapshot, "2026-07-24")).toEqual({ level: "fresh", daysOld: 7, sourceSyncedYmd: "2026-07-17" });
    expect(freshnessOf(snapshot, "2026-07-25").level).toBe("stale");
  });

  it("UTC末尾時刻の同期日をJST日付で鮮度判定する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.meta.sourceSyncedAt = "2026-07-16T20:00:00Z";
    expect(freshnessOf(snapshot, "2026-07-17")).toMatchObject({ sourceSyncedYmd: "2026-07-17", daysOld: 0 });
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
    snapshot.kpi.self = { selfCount4w: 0, total4w: 0, smartphone4w: 0, unknown4w: 0 };
    snapshot.kpi.sales = { currentWeek: null, priorWeek: null, forecast28: null };
    expect(kpiCards(snapshot)[1].value).toBe("収集中");
    expect(kpiCards(snapshot)[2]).toMatchObject({ value: "収集中", sub: "売上CSVを待っています" });
  });

  it("未知の予約方法が含まれるセルフ予約比率を要確認にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.kpi.self.unknown4w = 2;
    expect(kpiCards(snapshot)[1]).toEqual({ label: "セルフ予約比率", value: "要確認", sub: "未知の予約方法が含まれます(2件)" });
  });

  it("予約方法の警告があるセルフ予約比率を要確認にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.meta.warnings = ["2行目: 予約方法が未対応です"];
    expect(kpiCards(snapshot)[1]).toEqual({ label: "セルフ予約比率", value: "要確認", sub: "未知の予約方法が含まれます(0件)" });
  });

  it("問題ないセルフ予約比率には比率と件数を併記する", () => {
    expect(kpiCards(analyticsSnapshot())[1]).toEqual({ label: "セルフ予約比率", value: "75%", sub: "9/12件・4週集計" });
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

  it("P1拡張の表示整形は旧スナップショットで空またはnullにする", () => { const snapshot = analyticsSnapshot(); expect(programList(snapshot)).toEqual([]); expect(demographicsView(snapshot)).toEqual([]); expect(moneyExtra(snapshot)).toEqual({ unpaid: null, paymentShare: [], revPach: null }); });
  it("P1拡張の表示整形は埋まり率・金額・構成比を整形する", () => { const snapshot = analyticsSnapshot(); snapshot.catalog.programFills = [{ name: "初級", heldOn: "2026-07-17", start: "10:00", capacity: 6, reserved: 6, fillRate: 1 }]; snapshot.catalog.unpaidAging = { count: 2, amount: 3000, buckets: [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 1, amount: 2000 }] }; snapshot.catalog.paymentMethods = [{ method: "カード", count: 3 }, { method: "現金", count: 1 }]; snapshot.catalog.demographics = [{ ageBand: "30代", gender: "女性", customerType: "一般", count: 4 }]; snapshot.catalog.revPach = { revenue: 1000, availableCourtHours: 10, revPerCourtHour: 100, spaces: 1 }; expect(programList(snapshot)[0]).toMatchObject({ fill: "6/6", state: "full" }); expect(moneyExtra(snapshot)).toMatchObject({ unpaid: { headline: "2件 ¥3,000", overdue: "15日以上 ¥2,000" }, paymentShare: [{ method: "カード", pct: 75 }, { method: "現金", pct: 25 }], revPach: "¥100" }); expect(demographicsView(snapshot)).toEqual([{ label: "30代 女性", count: 4 }]); });
  it("プログラムの定員未設定・低充足・通常充足を区別し、未収金なしも整形する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.programFills = [
      { name: "定員未設定", heldOn: "2026-07-17", start: "09:00", capacity: null, reserved: 3, fillRate: null },
      { name: "低充足", heldOn: "2026-07-17", start: "10:00", capacity: 10, reserved: 3, fillRate: 0.3 },
      { name: "通常", heldOn: "2026-07-17", start: "11:00", capacity: 10, reserved: 4, fillRate: 0.4 },
    ];
    snapshot.catalog.unpaidAging = { count: 0, amount: 0, buckets: [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 0, amount: 0 }] };
    snapshot.catalog.paymentMethods = [{ method: "カード", count: 0 }];
    snapshot.catalog.revPach = null;
    expect(programList(snapshot)).toEqual([
      { title: "定員未設定", schedule: "2026-07-17 09:00", fill: "—", state: "unknown" },
      { title: "低充足", schedule: "2026-07-17 10:00", fill: "3/10", state: "warn" },
      { title: "通常", schedule: "2026-07-17 11:00", fill: "4/10", state: "open" },
    ]);
    expect(moneyExtra(snapshot)).toEqual({ unpaid: { headline: "0件 ¥0", overdue: null }, paymentShare: [], revPach: null });
  });

  it("ヒートマップを0から4の強度にする", () => {
    expect(heatmapCells(analyticsSnapshot()).map((cell) => cell.intensity)).toEqual([0, 2, 3, 4]);
    const snapshot = analyticsSnapshot();
    snapshot.catalog.heatmap = [{ dow: 1, slot: "10:00", count: 0 }];
    expect(heatmapCells(snapshot)[0].intensity).toBe(0);
  });


  it("年代性別ビューは件数降順に並べる", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.demographics = [
      { ageBand: "20代", gender: "男性", customerType: "一般", count: 1 },
      { ageBand: "30代", gender: "女性", customerType: "一般", count: 4 },
    ];
    expect(demographicsView(snapshot)).toEqual([
      { label: "30代 女性", count: 4 },
      { label: "20代 男性", count: 1 },
    ]);
  });

  it("欠落データと将来解禁領域を収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.meta.missingSections = ["customer", "unknown"];
    expect(collectingSections(snapshot)).toEqual(["商圏・顧客データ", "unknown", "ファネルはP3で解禁", "ペースカーブはP4で解禁"]);
  });
});
