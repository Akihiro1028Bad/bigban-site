import { describe, expect, it } from "vitest";

import { analyticsSnapshot } from "./__fixtures__/analyticsSnapshot";
import { cohortView, collectingSections, demographicsView, formatSyncedAtJst, freshnessOf, funnelView, heatmapCells, insightEvidenceText, kpiCards, moneyExtra, moneyPanel, paceCurveView, programList, sortedInsights } from "./analyticsView";

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
    expect(cards[0]).toEqual({ label: "実予約（07/13〜07/19）", value: "8件", sub: "累積 42件・n<10のため参考値" });
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
    expect(insightEvidenceText({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBe("a=1 / b=2 / c=3 / d=4 / 他1件");
    expect(insightEvidenceText({ nested: {} })).toBeNull();
  });

  it("お金パネル用の金額を表示文字列にする", () => {
    expect(moneyPanel(analyticsSnapshot())).toEqual({ currentWeek: "¥32,000", forecast28: "¥128,000" });
  });

  it("P1拡張の表示整形は旧スナップショットで空またはnullにする", () => { const snapshot = analyticsSnapshot(); expect(programList(snapshot)).toEqual([]); expect(demographicsView(snapshot)).toEqual([]); expect(moneyExtra(snapshot)).toEqual({ unpaid: null, paymentShare: [], revPach: null }); });
  it("P1拡張の表示整形は埋まり率・金額・構成比を整形する", () => { const snapshot = analyticsSnapshot(); snapshot.catalog.programFills = [{ name: "初級", heldOn: "2026-07-17", start: "10:00", capacity: 6, reserved: 6, fillRate: 1 }]; snapshot.catalog.unpaidAging = { count: 2, amount: 3000, buckets: [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 1, amount: 2000 }] }; snapshot.catalog.paymentMethods = [{ method: "カード", count: 3 }, { method: "現金", count: 1 }]; snapshot.catalog.demographics = [{ ageBand: "30代", gender: "女性", customerType: "一般", count: 4 }]; snapshot.catalog.revPach = { revenue: 1000, availableCourtHours: 10, revPerCourtHour: 100, spaces: 1 }; expect(programList(snapshot)[0]).toMatchObject({ fill: "6/6", state: "full" }); expect(moneyExtra(snapshot)).toMatchObject({ unpaid: { headline: "2件 ¥3,000", overdue: "15日以上 ¥2,000(1件)" }, paymentShare: [{ method: "カード", pct: 75 }, { method: "現金", pct: 25 }], revPach: "¥100" }); expect(demographicsView(snapshot)).toEqual([{ label: "30代 女性", count: 4 }]); });
  it("15日以上の未収は金額が0でも件数を表示する", () => { const snapshot = analyticsSnapshot(); snapshot.catalog.unpaidAging = { count: 1, amount: 0, buckets: [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 2, amount: 0 }] }; expect(moneyExtra(snapshot).unpaid?.overdue).toBe("15日以上 ¥0(2件)"); });
  it("プログラムの定員未設定・低充足・通常充足を区別し、未収金なしも整形する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.programFills = [
      { name: "定員未設定", heldOn: "2026-07-17", start: "09:00", capacity: null, reserved: 3, fillRate: null },
      { name: "募集停止", heldOn: "2026-07-17", start: "09:30", capacity: 0, reserved: 2, fillRate: null },
      { name: "低充足", heldOn: "2026-07-17", start: "10:00", capacity: 10, reserved: 3, fillRate: 0.3 },
      { name: "通常", heldOn: "2026-07-17", start: "11:00", capacity: 10, reserved: 4, fillRate: 0.4 },
    ];
    snapshot.catalog.unpaidAging = { count: 0, amount: 0, buckets: [{ label: "0-7日", count: 0, amount: 0 }, { label: "8-14日", count: 0, amount: 0 }, { label: "15日以上", count: 0, amount: 0 }] };
    snapshot.catalog.paymentMethods = [{ method: "カード", count: 0 }];
    snapshot.catalog.revPach = null;
    expect(programList(snapshot)).toEqual([
      { title: "定員未設定", schedule: "2026-07-17 09:00", fill: "—", state: "unknown" },
      { title: "募集停止", schedule: "2026-07-17 09:30", fill: "2/0", state: "unknown" },
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

  it("年代・性別が同じ顧客種別は統合して表示する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.demographics = [
      { ageBand: "30代", gender: "女性", customerType: "一般", count: 2 },
      { ageBand: "30代", gender: "女性", customerType: "会員", count: 3 },
    ];
    expect(demographicsView(snapshot)).toEqual([{ label: "30代 女性", count: 5 }]);
  });

  it("欠落データを収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.meta.missingSections = ["customer", "unknown"];
    expect(collectingSections(snapshot)).toEqual(["商圏・顧客データ", "unknown"]);
  });

  it("ペースカーブがない旧スナップショットはnullにする", () => {
    expect(paceCurveView(analyticsSnapshot())).toBeNull();
  });

  it("ペースカーブを日数順、丸めた基準比とバー幅つきで整形する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [
      { daysOut: 14, reservations: 3, forecastSales: 0, baselineMedian: 2 },
      { daysOut: 7, reservations: 12, forecastSales: 0, baselineMedian: 10 },
      { daysOut: 21, reservations: 4, forecastSales: 0, baselineMedian: 3 },
    ];
    expect(paceCurveView(snapshot)).toEqual({
      state: "ready",
      points: [
        { daysOut: 7, current: 12, baseline: 10, pct: 120, currentWidthPct: 100, baselineWidthPct: 83 },
        { daysOut: 14, current: 3, baseline: 2, pct: 150, currentWidthPct: 25, baselineWidthPct: 17 },
        { daysOut: 21, current: 4, baseline: 3, pct: 133, currentWidthPct: 33, baselineWidthPct: 25 },
      ],
    });
  });

  it("ペースカーブは履歴未満なら収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [
      { daysOut: 7, reservations: 0, forecastSales: null, baselineMedian: null },
      { daysOut: 14, reservations: 4, forecastSales: null, baselineMedian: null },
    ];
    expect(paceCurveView(snapshot)).toEqual({
      state: "collecting",
      points: [
        { daysOut: 7, current: 0, baseline: null, pct: null, currentWidthPct: 0, baselineWidthPct: 0 },
        { daysOut: 14, current: 4, baseline: null, pct: null, currentWidthPct: 100, baselineWidthPct: 0 },
      ],
    });
  });

  it("ペースカーブは基準が一部でも欠ける間は収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [
      { daysOut: 7, reservations: 4, forecastSales: null, baselineMedian: 3 },
      { daysOut: 14, reservations: 2, forecastSales: null, baselineMedian: null },
    ];

    expect(paceCurveView(snapshot)?.state).toBe("collecting");
  });

  it("ペースカーブは基準0を比率なしにして0除算を避ける", () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [{ daysOut: 7, reservations: 4, forecastSales: null, baselineMedian: 0 }];
    expect(paceCurveView(snapshot)).toEqual({ state: "ready", points: [{ daysOut: 7, current: 4, baseline: 0, pct: null, currentWidthPct: 100, baselineWidthPct: 0 }] });
  });

  it("ペースカーブの空配列は収集中にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [];

    expect(paceCurveView(snapshot)).toEqual({ state: "collecting", points: [] });
  });

  it("コホートがない旧スナップショットはnull、空配列はそのままにする", () => {
    expect(cohortView(analyticsSnapshot())).toBeNull();
    const snapshot = analyticsSnapshot();
    snapshot.catalog.cohorts = [];
    expect(cohortView(snapshot)).toEqual([]);
  });

  it("コホートの人数・リピート・累積売上を表示用に整形する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.cohorts = [{ month: "2026-07", customers: 3, repeated: 2, cumulativeRevenue: 123456 }];
    expect(cohortView(snapshot)).toEqual([{ month: "2026-07", customers: 3, repeatText: "2/3人", revenueText: "¥123,456" }]);
  });

  it("ファネルがない旧スナップショットはnullにする", () => {
    expect(funnelView(analyticsSnapshot())).toBeNull();
    const snapshot = analyticsSnapshot();
    snapshot.funnel = null;
    expect(funnelView(snapshot)).toBeNull();
  });

  it("ファネルを週表記・段別内訳・捕捉率つきで整形する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.funnel = {
      week: { start: "2026-07-13", end: "2026-07-19" },
      current: {
        intent: 20,
        rental: { input: 8, confirm: 6, pending: 0, complete: 4 },
        program: { input: 5, confirm: 4, pending: 0, complete: 3 },
      },
      prior: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
      capture: { ga4Complete: 7, selfBooked: 13, rate: 7 / 13 },
    };
    expect(funnelView(snapshot)).toEqual({
      week: "07/13〜07/19",
      stages: [
        { label: "予約クリック", rental: 0, program: 0, total: 20, widthPct: 100, retentionPct: null },
        { label: "情報入力", rental: 8, program: 5, total: 13, widthPct: 65, retentionPct: 65 },
        { label: "内容確認", rental: 6, program: 4, total: 10, widthPct: 50, retentionPct: 77 },
        { label: "予約完了", rental: 4, program: 3, total: 7, widthPct: 35, retentionPct: 70 },
      ],
      capture: { text: "捕捉率 54%(GA4完了7件 ÷ セルフ予約13件)", isAlert: false },
      note: "実予約の真値はKPIヘッダー(CSV由来)。GA4は参考値(捕捉率つき)",
    });
  });

  it("仮予約がある週は段に含め、捕捉率の境界と算出不可を区別する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.funnel = {
      week: { start: "2026-07-13", end: "2026-07-19" },
      current: {
        intent: 10,
        rental: { input: 5, confirm: 4, pending: 1, complete: 3 },
        program: { input: 3, confirm: 2, pending: 2, complete: 1 },
      },
      prior: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
      capture: { ga4Complete: 5, selfBooked: 10, rate: 0.5 },
    };
    // retentionPct は直前段(内容確認=6件)比: 3/6=50%。widthPct は先頭段(10件)比: 30%。
    expect(funnelView(snapshot)?.stages[3]).toEqual({ label: "仮予約", rental: 1, program: 2, total: 3, widthPct: 30, retentionPct: 50 });
    expect(funnelView(snapshot)?.capture).toEqual({ text: "捕捉率 50%(GA4完了5件 ÷ セルフ予約10件)", isAlert: false });
    snapshot.funnel.capture.rate = 0.499;
    expect(funnelView(snapshot)?.capture.isAlert).toBe(true);
    snapshot.funnel.capture.rate = null;
    expect(funnelView(snapshot)?.capture).toEqual({ text: "セルフ予約0件のため捕捉率は算出不可", isAlert: false });
  });

  it("ファネルの幅と残存率は先頭段比・直前段比で整形し、0除算と非単調を区別する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.funnel = {
      week: { start: "2026-07-13", end: "2026-07-19" },
      current: {
        intent: 0,
        rental: { input: 2, confirm: 3, pending: 0, complete: 4 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
      prior: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
      capture: { ga4Complete: 4, selfBooked: 4, rate: 1 },
    };
    expect(funnelView(snapshot)?.stages).toEqual([
      { label: "予約クリック", rental: 0, program: 0, total: 0, widthPct: 0, retentionPct: null },
      { label: "情報入力", rental: 2, program: 0, total: 2, widthPct: 0, retentionPct: null },
      { label: "内容確認", rental: 3, program: 0, total: 3, widthPct: 0, retentionPct: 150 },
      { label: "予約完了", rental: 4, program: 0, total: 4, widthPct: 0, retentionPct: 133 },
    ]);
  });
});
