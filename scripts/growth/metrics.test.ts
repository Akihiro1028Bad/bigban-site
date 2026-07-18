import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { MergedRow } from "./transform";
import {
  articlePagePath,
  articleSearchUrl,
  buildMetricsMirrorProps,
  buildSearchMetrics,
  buildMetricsNotificationSummary,
  ctaEventsMeasurementStatusForPeriod,
  ctaEventsMeasurementStatusOf,
  measurementBucketOf,
  measurementStatusOf,
  loadCanonicalReservations,
  type ArticleMetrics,
  metricsForPagePath,
  metricsForKnownPagePath,
  METRICS_PROPS,
  normalizePagePath,
  parseMetrics,
  reserveCompleteForPagePath,
  reserveCompleteMeasuredForPeriod,
  type SearchMetrics,
  type MetricsFs,
  serializeMetrics,
  summarizeMetrics,
} from "./metrics";

const PERIOD = { start: "2026-06-15", end: "2026-06-21" };

describe("loadCanonicalReservations", () => {
  const jsonl = '{"reservationId":"r1","bookedAt":"2026-07-15T10:00:00+09:00","status":"confirmed"}\n';
  const digest = createHash("sha256").update(jsonl).digest("hex");
  const meta = JSON.stringify({ generatedAt: "2026-07-16T00:00:00Z", sourceSyncedAt: "2026-07-16T00:00:00Z", reservationsDigest: digest, coverage: { start: "2026-07-01", end: "2026-07-16" } });
  const fsOf = (readFile: MetricsFs["readFile"]): MetricsFs => ({ readFile });

  it("未設定時は読み取りをせずnot_configuredを返す", async () => {
    const readFile = vi.fn<MetricsFs["readFile"]>();
    await expect(loadCanonicalReservations(undefined, "2026-07-17T00:00:00Z", fsOf(readFile))).resolves.toEqual({ state: "missing", reason: "not_configured", checkedAt: "2026-07-17T00:00:00Z" });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("注入したI/Oから正準データを検証して読む", async () => {
    const readFile = vi.fn<MetricsFs["readFile"]>(async (path) => path.endsWith("reservations.jsonl") ? jsonl : meta);
    const result = await loadCanonicalReservations("/data", "2026-07-17T00:00:00Z", fsOf(readFile));
    expect(result).toMatchObject({ syncedAt: "2026-07-16T00:00:00Z", coverage: { start: "2026-07-01", end: "2026-07-16" }, parsed: { records: [{ reservationId: "r1" }] } });
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("ダイジェスト不一致はinvalid、非Errorのthrowは不明なエラーとして扱う", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const badDigestMeta = JSON.stringify({ generatedAt: "2026-07-16T00:00:00Z", sourceSyncedAt: "2026-07-16T00:00:00Z", reservationsDigest: "f".repeat(64), coverage: { start: "2026-07-01", end: "2026-07-16" } });
    await expect(loadCanonicalReservations("/data", "checked", fsOf(async (path) => path.endsWith("reservations.jsonl") ? jsonl : badDigestMeta))).resolves.toEqual({ state: "missing", reason: "invalid", checkedAt: "checked" });
    await expect(loadCanonicalReservations("/data", "checked", fsOf(async () => { throw "文字列エラー"; }))).resolves.toEqual({ state: "missing", reason: "read_error", checkedAt: "checked" });
    expect(warn).toHaveBeenCalledWith("[metrics] 正準データセットを読み込めません:", "不明なエラー");
    warn.mockRestore();
  });

  it("検証失敗はinvalid、読み取り失敗はread_errorにする", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(loadCanonicalReservations("/data", "checked", fsOf(async () => "{}"))).resolves.toEqual({ state: "missing", reason: "invalid", checkedAt: "checked" });
    await expect(loadCanonicalReservations("/data", "checked", fsOf(async () => { throw new Error("denied"); }))).resolves.toEqual({ state: "missing", reason: "read_error", checkedAt: "checked" });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

function row(
  pagePath: string,
  views: [number, number],
  users: [number, number],
  keyEvents: [number, number] = [0, 0]
): MergedRow {
  return {
    keys: [pagePath],
    metrics: {
      screenPageViews: { current: views[0], prior: views[1], deltaPct: null },
      activeUsers: { current: users[0], prior: users[1], deltaPct: null },
      keyEvents: { current: keyEvents[0], prior: keyEvents[1], deltaPct: null },
    },
  };
}

function eventRow(
  pagePath: string,
  eventName: string,
  values: [number, number]
): MergedRow {
  return {
    keys: [pagePath, eventName],
    metrics: {
      keyEvents: { current: values[0], prior: values[1], deltaPct: null },
    },
  };
}

function reserveCompleteRow(
  landingPage: string,
  eventName: string,
  values: [number, number]
): MergedRow {
  return {
    keys: [landingPage, eventName],
    metrics: {
      eventCount: { current: values[0], prior: values[1], deltaPct: null },
    },
  };
}

describe("articlePagePath", () => {
  it("ja は /news/{slug}(column・env 未設定=現行互換)", () => {
    expect(articlePagePath("spring-open", "ja", "column", {})).toBe("/news/spring-open");
  });
  it("ja 以外(en)は /en/news/{slug}", () => {
    expect(articlePagePath("spring-open", "en", "column", {})).toBe("/en/news/spring-open");
  });
  it("column 媒体で endpoint=columns なら /columns/{slug}", () => {
    expect(
      articlePagePath("spring-open", "ja", "column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/columns/spring-open");
    expect(
      articlePagePath("spring-open", "en", "column", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/en/columns/spring-open");
  });
  it("news 媒体は env=columns でも常に /news/{slug}(#media)", () => {
    expect(
      articlePagePath("summer-fair", "ja", "news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/news/summer-fair");
    expect(
      articlePagePath("summer-fair", "en", "news", { GROWTH_MICROCMS_ENDPOINT: "columns" }),
    ).toBe("/en/news/summer-fair");
  });
  it("media 省略時は column 扱い(挙動不変)", () => {
    expect(articlePagePath("spring-open", "ja", undefined, {})).toBe("/news/spring-open");
  });
  it("env 引数省略時は process.env を参照する(column)", () => {
    const prev = process.env.GROWTH_MICROCMS_ENDPOINT;
    try {
      delete process.env.GROWTH_MICROCMS_ENDPOINT;
      expect(articlePagePath("spring-open", "ja", "column")).toBe("/news/spring-open");
      process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
      expect(articlePagePath("spring-open", "ja", "column")).toBe("/columns/spring-open");
      // news 媒体は env を無視。
      expect(articlePagePath("spring-open", "ja", "news")).toBe("/news/spring-open");
    } finally {
      if (prev === undefined) delete process.env.GROWTH_MICROCMS_ENDPOINT;
      else process.env.GROWTH_MICROCMS_ENDPOINT = prev;
    }
  });
});

describe("normalizePagePath", () => {
  it("クエリ・ハッシュを落とす", () => {
    expect(normalizePagePath("/news/a?utm_source=x")).toBe("/news/a");
    expect(normalizePagePath("/news/a#sec")).toBe("/news/a");
  });
  it("末尾スラッシュを落とす(ルートは保持)", () => {
    expect(normalizePagePath("/news/a/")).toBe("/news/a");
    expect(normalizePagePath("/")).toBe("/");
  });
  it("スラッシュのみ・空はルートに倒す", () => {
    expect(normalizePagePath("///")).toBe("/");
    expect(normalizePagePath("")).toBe("/");
  });
  it("素のパスはそのまま", () => {
    expect(normalizePagePath("/news/a")).toBe("/news/a");
  });
});

describe("metricsForPagePath", () => {
  it("一致する行から views/users を取り出す", () => {
    const rows = [row("/news/a", [120, 100], [80, 70]), row("/news/b", [10, 5], [9, 4])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m).not.toBeNull();
    expect(m?.views.current).toBe(120);
    expect(m?.views.prior).toBe(100);
    expect(m?.views.deltaPct).toBe(20);
    expect(m?.users.current).toBe(80);
    expect(m?.pagePath).toBe("/news/a");
    expect(m?.period).toEqual(PERIOD);
  });

  it("クエリ違いで分割された行を合算する", () => {
    const rows = [row("/news/a", [100, 50], [60, 30]), row("/news/a?ref=line", [20, 10], [10, 5])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.current).toBe(120);
    expect(m?.views.prior).toBe(60);
    expect(m?.users.current).toBe(70);
    expect(m?.views.deltaPct).toBe(100);
  });

  it("pagePath×eventNameを5分類へ集約しクエリ違いも合算する", () => {
    const events = [
      eventRow("/news/a", "reservation_click", [2, 1]),
      eventRow("/news/a?ref=line", "reserve_entry_click", [1, 2]),
      eventRow("/news/a", "line_click", [4, 1]),
      eventRow("/news/a", "instagram_click", [3, 1]),
      eventRow("/news/a", "contact_submit", [7, 0]),
      eventRow("/news/a", "purchase", [99, 99]),
    ];
    const m = metricsForPagePath("/news/a", [row("/news/a", [100, 50], [60, 30])], PERIOD, events);
    expect(m?.ctaEvents).toEqual({
      reservationClick: { current: 2, prior: 1, deltaPct: 100 },
      reserveEntryClick: { current: 1, prior: 2, deltaPct: -50 },
      lineClick: { current: 4, prior: 1, deltaPct: 300 },
      instagramClick: { current: 3, prior: 1, deltaPct: 200 },
      other: { current: 7, prior: 0, deltaPct: null },
    });
    expect(m?.keyEvents).toBeUndefined();
  });

  it("予約0・非予約7でも予約意図は0のままにする", () => {
    const m = metricsForPagePath(
      "/news/a",
      [row("/news/a", [10, 5], [8, 4])],
      PERIOD,
      [eventRow("/news/a", "line_click", [7, 2])]
    );
    expect(m?.ctaEvents?.reservationClick.current).toBe(0);
    expect(m?.ctaEvents?.reserveEntryClick.current).toBe(0);
    expect(m?.ctaEvents?.lineClick.current).toBe(7);
  });

  it("イベント行のkeys・keyEvents欠落を空イベント名・0件として安全に扱う", () => {
    const malformedEvents: MergedRow[] = [
      { keys: [], metrics: {} },
      { keys: ["/news/a"], metrics: {} },
      eventRow("/news/a", "reservation_click", [2, 1]),
    ];
    const m = metricsForPagePath(
      "/news/a",
      [row("/news/a", [10, 5], [8, 4])],
      PERIOD,
      malformedEvents
    );
    expect(m?.ctaEvents?.reservationClick).toEqual({ current: 2, prior: 1, deltaPct: 100 });
    expect(m?.ctaEvents?.other).toEqual({ current: 0, prior: 0, deltaPct: null });
  });

  it("prior が 0 なら deltaPct は null", () => {
    const rows = [row("/news/a", [10, 0], [5, 0])];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.deltaPct).toBeNull();
  });

  it("一致が無ければ null(keys 欠落の行も安全に無視)", () => {
    const rows: MergedRow[] = [
      { keys: [], metrics: {} },
      row("/news/b", [1, 1], [1, 1]),
    ];
    expect(metricsForPagePath("/news/a", rows, PERIOD)).toBeNull();
  });

  it("指標が欠けていても 0 で埋める", () => {
    const rows: MergedRow[] = [{ keys: ["/news/a"], metrics: {} }];
    const m = metricsForPagePath("/news/a", rows, PERIOD);
    expect(m?.views.current).toBe(0);
    expect(m?.users.prior).toBe(0);
    expect(m?.views.deltaPct).toBeNull();
  });
});

describe("metricsForKnownPagePath", () => {
  it("GA4取得成功・topPages一致なしをpath-unmatchedの明示的ゼロとして返す", () => {
    const metrics = metricsForKnownPagePath("/news/a", [], PERIOD, [
    ], { isGa4SourceAvailable: true });
    expect(metrics).toMatchObject({
      pagePath: "/news/a",
      ga4Measured: false,
      measurementStatus: "path-unmatched",
      views: { current: 0, prior: 0, deltaPct: null },
      users: { current: 0, prior: 0, deltaPct: null },
      ctaEvents: {
        reservationClick: { current: 0, prior: 0, deltaPct: null },
        reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
        lineClick: { current: 0, prior: 0, deltaPct: null },
        instagramClick: { current: 0, prior: 0, deltaPct: null },
        other: { current: 0, prior: 0, deltaPct: null },
      },
    });
  });

  it("GA4ソース失敗をsource-errorとして実測0と区別する", () => {
    const metrics = metricsForKnownPagePath("/news/a", [], PERIOD, undefined, {
      isGa4SourceAvailable: false,
    });
    expect(metrics.measurementStatus).toBe("source-error");
    expect(metrics.ga4Measured).toBe(false);
    expect(metrics.ctaEvents).toBeUndefined();
  });

  it("GA4 topPages一致時は実測状態を保持する", () => {
    const metrics = metricsForKnownPagePath(
      "/news/a",
      [row("/news/a", [10, 5], [8, 4])],
      PERIOD
    );
    expect(metrics.ga4Measured).toBe(true);
    expect(metrics.measurementStatus).toBe("measured");
    expect(metrics.views.current).toBe(10);
  });

  it("予約完了レポートがあればtopPagesの一致有無に関わらず別バケットで載せる", () => {
    const reserveCompleteRows = [
      reserveCompleteRow("/news/a", "labola_reserve_complete", [2, 1]),
    ];
    expect(metricsForKnownPagePath(
      "/news/a",
      [row("/news/a", [10, 5], [8, 4])],
      PERIOD,
      undefined,
      { reserveCompleteRows }
    ).reserveComplete).toEqual({ current: 2, prior: 1, deltaPct: 100 });
    expect(metricsForKnownPagePath(
      "/news/a",
      [],
      PERIOD,
      undefined,
      { reserveCompleteRows }
    ).reserveComplete).toEqual({ current: 2, prior: 1, deltaPct: 100 });
  });

  it("topPagesの前週のみ記事を0/80・-100%の実測急落として保持する", () => {
    const metrics = metricsForKnownPagePath(
      "/news/a",
      [row("/news/a", [0, 80], [0, 40])],
      PERIOD
    );
    expect(metrics.ga4Measured).toBe(true);
    expect(metrics.measurementStatus).toBe("measured");
    expect(metrics.views).toEqual({ current: 0, prior: 80, deltaPct: -100 });
    expect(metrics.users).toEqual({ current: 0, prior: 40, deltaPct: -100 });
  });
});

describe("reserveCompleteForPagePath", () => {
  it("完全一致・クエリ・末尾スラッシュを正規化し、2完了イベントを合算する", () => {
    const result = reserveCompleteForPagePath("/news/a", [
      reserveCompleteRow("/news/a", "labola_reserve_complete", [2, 1]),
      reserveCompleteRow("/news/a?utm_source=line", "labola_reserve_complete_program", [3, 2]),
      reserveCompleteRow("/news/a/", "labola_reserve_complete", [4, 3]),
      reserveCompleteRow("/news/b", "labola_reserve_complete", [99, 99]),
    ]);
    expect(result).toEqual({ current: 9, prior: 6, deltaPct: 50 });
  });

  it("eventName列が欠けた行は無視する", () => {
    const row = reserveCompleteRow("/news/a", "labola_reserve_complete", [2, 1]);
    expect(
      reserveCompleteForPagePath("/news/a", [{ ...row, keys: [row.keys[0] as string] }])
    ).toEqual({ current: 0, prior: 0, deltaPct: null });
  });

  it("該当行が無ければ0件として返す", () => {
    expect(reserveCompleteForPagePath("/news/a", [
      reserveCompleteRow("/news/b", "labola_reserve_complete", [2, 1]),
    ])).toEqual({ current: 0, prior: 0, deltaPct: null });
  });

  it("別イベント・欠損値は除外または0件として安全に扱う", () => {
    expect(reserveCompleteForPagePath("/news/a", [
      { keys: ["/news/a", "labola_reserve_complete"], metrics: {} },
      { keys: ["/news/a", "reservation_click"], metrics: { eventCount: { current: 9, prior: 9, deltaPct: 0 } } },
      { keys: [], metrics: {} },
    ])).toEqual({ current: 0, prior: 0, deltaPct: null });
  });
});

describe("serializeMetrics / parseMetrics", () => {
  const metrics: ArticleMetrics = {
    pagePath: "/news/a",
    views: { current: 120, prior: 100, deltaPct: 20 },
    users: { current: 80, prior: 70, deltaPct: 14.3 },
    period: PERIOD,
  };

  it("往復できる", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
  });

  it("空文字・不正 JSON は null(安全側)", () => {
    expect(parseMetrics("")).toBeNull();
    expect(parseMetrics("not json")).toBeNull();
  });

  it("形が違えば null", () => {
    expect(parseMetrics(JSON.stringify({ pagePath: "/news/a" }))).toBeNull();
    expect(parseMetrics(JSON.stringify({ ...metrics, views: { current: "x" } }))).toBeNull();
  });

  it("search ブロック付き(S2)も往復できる", () => {
    const withSearch: ArticleMetrics = {
      ...metrics,
      publishedAt: "2026-06-01T00:00:00.000Z",
      search: {
        clicks: { current: 10, prior: 8, deltaPct: 25 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.05, prior: 0.053, deltaPct: -5.7 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
        topQueries: [{ query: "本八幡 ピックルボール", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 }],
      },
    };
    expect(parseMetrics(serializeMetrics(withSearch))).toEqual(withSearch);
  });

  it("search 無しの旧データも valid(後方互換)", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
    expect(parseMetrics(serializeMetrics(metrics))?.search).toBeUndefined();
  });

  it("keyEventsMeasured 無しの旧データも valid(後方互換)", () => {
    expect(parseMetrics(serializeMetrics(metrics))).toEqual(metrics);
    expect(parseMetrics(serializeMetrics(metrics))?.keyEventsMeasured).toBeUndefined();
  });

  it("keyEventsMeasured 付きも往復できる", () => {
    const withMeasured: ArticleMetrics = {
      ...metrics,
      keyEventsMeasured: true,
    };
    expect(parseMetrics(serializeMetrics(withMeasured))).toEqual(withMeasured);
  });

  it("reserveComplete無しの旧JSONもvalidで、計測済み値も往復できる", () => {
    expect(parseMetrics(serializeMetrics(metrics))?.reserveComplete).toBeUndefined();
    const withReserveComplete: ArticleMetrics = {
      ...metrics,
      reserveComplete: { current: 2, prior: 1, deltaPct: 100 },
      reserveCompleteMeasured: true,
    };
    expect(parseMetrics(serializeMetrics(withReserveComplete))).toEqual(withReserveComplete);
  });

  it("ctaEventsとactualReservations付きも往復できる", () => {
    const extended: ArticleMetrics = {
      ...metrics,
      ctaEventsMeasured: true,
      ctaEvents: {
        reservationClick: { current: 1, prior: 0, deltaPct: null },
        reserveEntryClick: { current: 2, prior: 1, deltaPct: 100 },
        lineClick: { current: 3, prior: 2, deltaPct: 50 },
        instagramClick: { current: 4, prior: 4, deltaPct: 0 },
        other: { current: 5, prior: 10, deltaPct: -50 },
      },
      actualReservations: {
        state: "available",
        source: "csv",
        syncedAt: "2026-07-14T00:00:00.000Z",
        facility: { current: 8, prior: 4, deltaPct: 100 },
        article: { current: 2, prior: 1, deltaPct: 100 },
      },
    };
    expect(parseMetrics(serializeMetrics(extended))).toEqual(extended);
  });

  it("GA4未取得状態と実測0を区別して往復できる", () => {
    const value: ArticleMetrics = {
      ...metrics,
      ga4Measured: false,
      measurementStatus: "source-error",
      ctaEventsMeasurementStatus: "partial",
    };
    expect(parseMetrics(serializeMetrics(value))).toEqual(value);
    expect(parseMetrics(JSON.stringify({ ...metrics, measurementStatus: "invalid" }))).toBeNull();
    expect(parseMetrics(JSON.stringify({ ...metrics, ctaEventsMeasurementStatus: "invalid" }))).toBeNull();
  });

  it("実予約missingを往復し不正stateは拒否する", () => {
    const missing: ArticleMetrics = {
      ...metrics,
      actualReservations: {
        state: "missing",
        reason: "not_configured",
        checkedAt: "2026-07-15T00:00:00.000Z",
      },
    };
    expect(parseMetrics(serializeMetrics(missing))).toEqual(missing);
    expect(parseMetrics(JSON.stringify({ ...metrics, actualReservations: { state: "stale" } }))).toBeNull();
  });

  it("実予約のcurrent/prior収録状態を往復する", () => {
    const incomplete: ArticleMetrics = {
      ...metrics,
      actualReservations: {
        state: "missing",
        reason: "coverage_incomplete",
        checkedAt: "2026-07-15T00:00:00.000Z",
        coverage: {
          start: "2026-07-07",
          end: "2026-07-13",
          current: true,
          prior: false,
        },
      },
    };
    expect(parseMetrics(serializeMetrics(incomplete))).toEqual(incomplete);
  });
});

describe("measurement status", () => {
  it("新状態を優先し旧ga4Measuredを安全側に正規化する", () => {
    expect(measurementStatusOf({ measurementStatus: "path-unmatched", ga4Measured: true })).toBe("path-unmatched");
    expect(measurementStatusOf({ ga4Measured: true })).toBe("measured");
    expect(measurementStatusOf({ ga4Measured: false })).toBe("source-error");
    expect(measurementStatusOf({})).toBe("measured");
  });

  it("CTA計測状態は新状態を優先し、旧booleanは安全側に正規化する", () => {
    expect(ctaEventsMeasurementStatusOf({ ctaEventsMeasurementStatus: "partial", ctaEventsMeasured: true })).toBe("partial");
    expect(ctaEventsMeasurementStatusOf({ ctaEventsMeasured: true })).toBe("measured");
    expect(ctaEventsMeasurementStatusOf({})).toBe("unmeasured");
  });

  it.each([
    ["2026-07-01", { start: "2026-07-01", end: "2026-07-07" }, "measured"],
    ["2026-07-07", { start: "2026-07-01", end: "2026-07-07" }, "partial"],
    ["2026-07-04", { start: "2026-07-01", end: "2026-07-07" }, "partial"],
    ["2026-07-08", { start: "2026-07-01", end: "2026-07-07" }, "unmeasured"],
    ["2026-06-30", { start: "2026-07-01", end: "2026-07-07" }, "measured"],
    [undefined, { start: "2026-07-01", end: "2026-07-07" }, "unmeasured"],
    ["invalid", { start: "2026-07-01", end: "2026-07-07" }, "unmeasured"],
  ] as const)("since=%s を期間から分類する", (since, period, expected) => {
    expect(ctaEventsMeasurementStatusForPeriod(period, since, true)).toBe(expected);
  });

  it("GA4失敗・不正期間はunmeasuredで、記事公開日に依存しない", () => {
    expect(ctaEventsMeasurementStatusForPeriod(PERIOD, "2026-06-01", false)).toBe("unmeasured");
    expect(ctaEventsMeasurementStatusForPeriod({ start: "bad", end: "2026-07-01" }, "2026-06-01", true)).toBe("unmeasured");
    expect(ctaEventsMeasurementStatusForPeriod({ start: "2026-07-01", end: "bad" }, "2026-06-01", true)).toBe("unmeasured");
    expect(ctaEventsMeasurementStatusForPeriod({ start: "2026-07-01", end: "2026-07-07" }, "2026-99-99", true)).toBe("unmeasured");
  });

  it("存在しない月末日を繰り上げ解釈せずunmeasuredにする", () => {
    const period = { start: "2026-03-01", end: "2026-03-07" };
    expect(ctaEventsMeasurementStatusForPeriod(period, "2026-02-30", true)).toBe("unmeasured");
    expect(ctaEventsMeasurementStatusForPeriod(period, "2025-02-29", true)).toBe("unmeasured");
  });

  it("実在する閏日は有効な設定日として扱う", () => {
    expect(ctaEventsMeasurementStatusForPeriod(
      { start: "2024-03-01", end: "2024-03-07" },
      "2024-02-29",
      true
    )).toBe("measured");
  });

  it("予約完了はタグ設置日の前日は未計測、当日から計測済みとする", () => {
    expect(reserveCompleteMeasuredForPeriod(
      { start: "2026-07-17", end: "2026-07-17" },
      true
    )).toBe(false);
    expect(reserveCompleteMeasuredForPeriod(
      { start: "2026-07-18", end: "2026-07-18" },
      true
    )).toBe(true);
  });

  it("パス不一致・一致済み0流入・ソース失敗を分離する", () => {
    expect(measurementBucketOf({ measurementStatus: "path-unmatched", views: { current: 0 } })).toBe("path-unmatched");
    expect(measurementBucketOf({ measurementStatus: "measured", views: { current: 0 } })).toBe("zero-inflow");
    expect(measurementBucketOf({ measurementStatus: "measured", views: { current: 1 } })).toBe("measured");
    expect(measurementBucketOf({ measurementStatus: "source-error", views: { current: 0 } })).toBe("source-error");
  });

  it("通知要約で各失敗と0流入を別件数にする", () => {
    expect(buildMetricsNotificationSummary({ updated: 4, slugFailed: 1, sourceError: 2, pathUnmatched: 3, zeroInflow: 4, gscFailed: 5 }, PERIOD)).toBe(
      "📊 成績更新: 4件 / slug失敗 1件 / GA4失敗 2件 / パス不一致 3件 / 0流入 4件 / GSC失敗 5件 (期間 2026-06-15〜2026-06-21)"
    );
  });
});

describe("articleSearchUrl", () => {
  it("origin + pagePath を連結(origin 末尾スラッシュは正規化)", () => {
    expect(articleSearchUrl("https://thepicklebang.com", "/news/a")).toBe(
      "https://thepicklebang.com/news/a"
    );
    expect(articleSearchUrl("https://thepicklebang.com/", "/news/a")).toBe(
      "https://thepicklebang.com/news/a"
    );
  });
});

describe("buildSearchMetrics", () => {
  const summary: MergedRow[] = [
    {
      keys: [],
      metrics: {
        clicks: { current: 10, prior: 8, deltaPct: 25 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.05, prior: 0.053, deltaPct: -5.7 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
      },
    },
  ];
  const queries: MergedRow[] = [
    { keys: ["q-low"], metrics: { clicks: { current: 2, prior: 0, deltaPct: null }, impressions: { current: 30, prior: 0, deltaPct: null }, ctr: { current: 0.066, prior: 0, deltaPct: null }, position: { current: 5, prior: 0, deltaPct: null } } },
    { keys: ["q-high"], metrics: { clicks: { current: 6, prior: 4, deltaPct: 50 }, impressions: { current: 60, prior: 40, deltaPct: 50 }, ctr: { current: 0.1, prior: 0.1, deltaPct: 0 }, position: { current: 2.5, prior: 3, deltaPct: -16.7 } } },
  ];

  it("summary から clicks/impressions/ctr/position(前週比つき)を作る", () => {
    const s = buildSearchMetrics(summary, queries);
    expect(s.clicks).toEqual({ current: 10, prior: 8, deltaPct: 25 });
    expect(s.position).toEqual({ current: 3.2, prior: 4.1, deltaPct: -22 });
  });

  it("topQueries は clicks 降順・limit で切る", () => {
    const s = buildSearchMetrics(summary, queries, 1);
    expect(s.topQueries).toEqual([
      { query: "q-high", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 },
    ]);
  });

  it("summary 行が無ければ 0/0/null・topQueries は空", () => {
    const s: SearchMetrics = buildSearchMetrics([], []);
    expect(s.clicks).toEqual({ current: 0, prior: 0, deltaPct: null });
    expect(s.topQueries).toEqual([]);
  });

  it("欠損行(keys/metrics 無し・clicks 無しで sort も実行)は query='' ・各値 0 にフォールバック", () => {
    const s = buildSearchMetrics([], [
      { keys: [], metrics: {} },
      { keys: ["x"], metrics: {} },
    ]);
    expect(s.topQueries).toEqual([
      { query: "", clicks: 0, impressions: 0, ctr: 0, position: 0 },
      { query: "x", clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ]);
  });
});

describe("buildMetricsMirrorProps", () => {
  it("成績データ(JSON)と成績更新時刻(date)を作る", () => {
    const metrics: ArticleMetrics = {
      pagePath: "/news/a",
      views: { current: 1, prior: 0, deltaPct: null },
      users: { current: 1, prior: 0, deltaPct: null },
      period: PERIOD,
    };
    const props = buildMetricsMirrorProps(metrics, "2026-06-22T00:00:00.000Z");
    const p = props as Record<string, { rich_text?: Array<{ text: { content: string } }>; date?: { start: string } }>;
    expect(parseMetrics(p[METRICS_PROPS.data].rich_text![0].text.content)).toEqual(metrics);
    expect(p[METRICS_PROPS.updatedAt].date).toEqual({ start: "2026-06-22T00:00:00.000Z" });
  });
});

describe("summarizeMetrics", () => {
  it("合計と最高表示数の記事を返す(users 欠落は0・top は表示数最大を維持)", () => {
    const items = [
      { title: "A", metrics: { views: { current: 100 }, users: { current: 50 } } },
      { title: "B", metrics: { views: { current: 300 }, users: { current: 80 } } },
      // C: top 確定後に表示数の少ない計測済みが来ても top は B のまま(views > top.views が false)。
      { title: "C", metrics: { views: { current: 30 } } },
      { title: "D" },
    ];
    const s = summarizeMetrics(items);
    expect(s.totalViews).toBe(430);
    expect(s.totalUsers).toBe(130); // C は users 欠落で 0 加算
    expect(s.count).toBe(3);
    expect(s.top).toEqual({ title: "B", views: 300 });
  });

  it("計測済みが無ければ top は null", () => {
    expect(summarizeMetrics([{ title: "A" }])).toEqual({
      totalViews: 0,
      totalUsers: 0,
      count: 0,
      top: null,
    });
  });

  it("metricsはあってもviewsが無ければ集計しない", () => {
    expect(summarizeMetrics([{ title: "A", metrics: {} }])).toEqual({
      totalViews: 0, totalUsers: 0, count: 0, top: null,
    });
  });

  it("source-errorを集計から除外しpath-unmatchedは計測記事として数える", () => {
    expect(summarizeMetrics([
      { title: "失敗", metrics: { views: { current: 99 }, users: { current: 50 }, measurementStatus: "source-error" } },
      { title: "不一致", metrics: { views: { current: 0 }, users: { current: 0 }, measurementStatus: "path-unmatched" } },
    ])).toEqual({ totalViews: 0, totalUsers: 0, count: 1, top: { title: "不一致", views: 0 } });
  });
});
