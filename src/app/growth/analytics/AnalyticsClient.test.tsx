import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsSnapshot } from "../../../../scripts/growth/__fixtures__/analyticsSnapshot";
import { AnalyticsClient } from "./AnalyticsClient";

function mockSnapshot(snapshot: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, snapshot }), { status: 200 })));
}

describe("AnalyticsClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("初回は空状態を表示する", async () => {
    mockSnapshot(null);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByText("まだ取り込みがありません。npm run growth:ingest を実行してください。")).toBeVisible());
  });

  it("旧スナップショットでは新セクションを非表示にする", async () => {
    mockSnapshot(analyticsSnapshot());
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "経営サマリー" })).toBeVisible());
    expect(screen.queryByRole("heading", { name: "プログラム" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "顧客の年代・性別" })).toBeNull();
    expect(screen.queryByText("ファネルはP3で解禁")).toBeNull();
    expect(screen.getByRole("heading", { name: "ペースカーブ" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "コホート" })).toBeVisible();
  });

  it("拡張データがあればプログラムと年代・性別を表示する", async () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.programFills = [];
    snapshot.catalog.demographics = [];
    mockSnapshot(snapshot);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "プログラム" })).toBeVisible());
    expect(screen.getByRole("heading", { name: "顧客の年代・性別" })).toBeVisible();
  });

  it("ファネルデータがあれば気づきの後に予約ファネルを表示する", async () => {
    const snapshot = analyticsSnapshot();
    snapshot.funnel = {
      week: { start: "2026-07-13", end: "2026-07-19" },
      current: { intent: 1, rental: { input: 1, confirm: 1, pending: 0, complete: 1 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
      prior: { intent: 0, rental: { input: 0, confirm: 0, pending: 0, complete: 0 }, program: { input: 0, confirm: 0, pending: 0, complete: 0 } },
      capture: { ga4Complete: 1, selfBooked: 1, rate: 1 },
    };
    mockSnapshot(snapshot);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "予約ファネル(07/13〜07/19)" })).toBeVisible());
    expect(screen.getByRole("heading", { name: "気づき" }).compareDocumentPosition(screen.getByRole("heading", { name: "予約ファネル(07/13〜07/19)" }) ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("お金パネルの後にペースカーブ、コホートの順で表示する", async () => {
    const snapshot = analyticsSnapshot();
    snapshot.series.onTheBooks = [{ daysOut: 7, reservations: 4, forecastSales: null, baselineMedian: null }];
    snapshot.catalog.cohorts = [{ month: "2026-07", customers: 3, repeated: 1, cumulativeRevenue: 12000 }];
    mockSnapshot(snapshot);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "ペースカーブ" })).toBeVisible());
    const moneyHeading = screen.getByRole("heading", { name: "経営サマリー" });
    const paceHeading = screen.getByRole("heading", { name: "ペースカーブ" });
    const cohortHeading = screen.getByRole("heading", { name: "コホート" });
    expect(moneyHeading.compareDocumentPosition(paceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(paceHeading.compareDocumentPosition(cohortHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("予約不可CSVが欠落したスナップショットではRevPACHを表示しない", async () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.revPach = undefined;
    mockSnapshot(snapshot);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "経営サマリー" })).toBeVisible());
    expect(screen.queryByText("RevPACH")).toBeNull();
  });

  it("同じ年代・性別の顧客種別は一行に統合して表示する", async () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.demographics = [
      { ageBand: "30代", gender: "女性", customerType: "一般", count: 2 },
      { ageBand: "30代", gender: "女性", customerType: "会員", count: 3 },
    ];
    mockSnapshot(snapshot);
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByText("30代 女性")).toBeVisible());
    expect(screen.getAllByText("30代 女性")).toHaveLength(1);
    expect(screen.getByText("5人")).toBeVisible();
  });

  it("通信失敗時は取得エラーを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ネットワークに接続できません"); }));
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ネットワークに接続できません"));
  });

  it("Error以外の通信失敗時は既定メッセージを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw "通信失敗"; }));
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("経営ボードの取得に失敗しました。"));
  });

  it("HTTP非OK時はレスポンスのエラーを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, error: "認証が必要です" }), { status: 401 })));
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("認証が必要です"));
  });

  it("successがfalseでエラーがない場合は既定メッセージを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
    render(<AnalyticsClient />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("経営ボードの取得に失敗しました。"));
  });
});
