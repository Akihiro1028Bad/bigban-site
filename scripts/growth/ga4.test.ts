// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { fetchGa4, GA4_REPORTS, type Ga4ReportDef } from "./ga4";
import type { FetchFn } from "./http";
import type { GrowthConfig } from "./config";

const config: GrowthConfig = {
  ga4PropertyId: "540956661",
  gscSiteUrl: "https://www.thepicklebang.com/",
  googleClientId: "id",
  googleClientSecret: "secret",
  googleRefreshToken: "token",
};

const current = { start: "2026-06-08", end: "2026-06-14" };
const prior = { start: "2026-06-01", end: "2026-06-07" };

const reports: Ga4ReportDef[] = [
  { key: "summary", dimensions: [], metrics: ["sessions"] },
  { key: "byChannel", dimensions: ["sessionDefaultChannelGroup"], metrics: ["sessions"], limit: 20 },
];

function okResponse(body: unknown): ReturnType<FetchFn> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("fetchGa4", () => {
  it("CTAレポートへeventNameとinListFilterを設定する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ reports: [{ rows: [] }, { rows: [] }] }));
    const ctaReport = GA4_REPORTS.find((report) => report.key === "ctaEvents");
    expect(ctaReport).toBeDefined();
    expect(ctaReport?.includePriorOnly).toBe(true);
    expect(GA4_REPORTS.find((report) => report.key === "topPages")?.includePriorOnly).toBe(true);

    await fetchGa4({
      config,
      accessToken: "t",
      current,
      prior,
      fetchFn,
      reports: [ctaReport!],
    });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string) as {
      requests: Array<Record<string, unknown>>;
    };
    expect(body.requests[0]).toMatchObject({
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "keyEvents" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: expect.arrayContaining(["reservation_click", "line_click"]) },
        },
      },
    });
  });

  it("batchRunReports を正しい URL と Bearer トークンで叩く", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ reports: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }] }));

    await fetchGa4({ config, accessToken: "ya29.token", current, prior, fetchFn, reports });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/540956661:batchRunReports"
    );
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>).Authorization
    ).toBe("Bearer ya29.token");
  });

  it("各レポートを current/prior の2期間ぶんリクエストする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ reports: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }] }));

    await fetchGa4({ config, accessToken: "t", current, prior, fetchFn, reports });

    const body = JSON.parse((fetchFn.mock.calls[0][1].body as string));
    // 2レポート × 2期間 = 4リクエスト
    expect(body.requests).toHaveLength(4);
    expect(body.requests[0].dateRanges).toEqual([
      { startDate: "2026-06-08", endDate: "2026-06-14" },
    ]);
    expect(body.requests[1].dateRanges).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-07" },
    ]);
    expect(body.requests[2].dimensions).toEqual([
      { name: "sessionDefaultChannelGroup" },
    ]);
    expect(body.requests[2].limit).toBe("20");
  });

  it("レスポンスを current/prior 突合済みの整形結果に変換する", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(
      okResponse({
        reports: [
          // summary current
          { metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "423" }] }] },
          // summary prior
          { metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "377" }] }] },
          // byChannel current
          {
            dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
            metricHeaders: [{ name: "sessions" }],
            rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "300" }] }],
          },
          // byChannel prior
          {
            dimensionHeaders: [{ name: "sessionDefaultChannelGroup" }],
            metricHeaders: [{ name: "sessions" }],
            rows: [{ dimensionValues: [{ value: "Organic Search" }], metricValues: [{ value: "250" }] }],
          },
        ],
      })
    );

    const result = await fetchGa4({ config, accessToken: "t", current, prior, fetchFn, reports });

    expect(result.summary).toEqual([
      { keys: [], metrics: { sessions: { current: 423, prior: 377, deltaPct: 12.2 } } },
    ]);
    expect(result.byChannel).toEqual([
      {
        keys: ["Organic Search"],
        metrics: { sessions: { current: 300, prior: 250, deltaPct: 20 } },
      },
    ]);
  });

  it("定義で有効化したtopPagesとCTAレポートのprior-only行を残す", async () => {
    const reportDefs: Ga4ReportDef[] = [
      {
        key: "topPages",
        dimensions: ["pagePath"],
        metrics: ["screenPageViews"],
        includePriorOnly: true,
      },
      {
        key: "cta",
        dimensions: ["pagePath", "eventName"],
        metrics: ["keyEvents"],
        includePriorOnly: true,
      },
    ];
    const ga4Report = (
      dimensions: string[],
      metrics: string[],
      rows: Array<{ keys: string[]; values: string[] }>
    ) => ({
      dimensionHeaders: dimensions.map((name) => ({ name })),
      metricHeaders: metrics.map((name) => ({ name })),
      rows: rows.map((row) => ({
        dimensionValues: row.keys.map((value) => ({ value })),
        metricValues: row.values.map((value) => ({ value })),
      })),
    });
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({
      reports: [
        ga4Report(["pagePath"], ["screenPageViews"], [{ keys: ["/news/current"], values: ["3"] }]),
        ga4Report(["pagePath"], ["screenPageViews"], [{ keys: ["/news/prior-only"], values: ["8"] }]),
        ga4Report(["pagePath", "eventName"], ["keyEvents"], []),
        ga4Report(["pagePath", "eventName"], ["keyEvents"], [
          { keys: ["/news/a", "reservation_click"], values: ["2"] },
        ]),
      ],
    }));

    const result = await fetchGa4({
      config,
      accessToken: "t",
      current,
      prior,
      fetchFn,
      reports: reportDefs,
    });

    expect(result.topPages).toEqual([
      {
        keys: ["/news/current"],
        metrics: { screenPageViews: { current: 3, prior: 0, deltaPct: null } },
      },
      {
        keys: ["/news/prior-only"],
        metrics: { screenPageViews: { current: 0, prior: 8, deltaPct: -100 } },
      },
    ]);
    expect(result.cta).toEqual([{
      keys: ["/news/a", "reservation_click"],
      metrics: { keyEvents: { current: 0, prior: 2, deltaPct: -100 } },
    }]);
  });

  it("reports/fetchFn 未指定時は既定値(GA4_REPORTS・グローバル fetch)を用いる", async () => {
    const globalFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reports: Array.from({ length: 5 }, () => ({ rows: [] })) }), text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reports: Array.from({ length: 5 }, () => ({ rows: [] })) }), text: async () => "" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reports: Array.from({ length: 2 }, () => ({ rows: [] })) }), text: async () => "" });
    vi.stubGlobal("fetch", globalFetch);

    const result = await fetchGa4({ config, accessToken: "t", current, prior });

    // 既定6レポート × 2期間 = 12リクエスト → 5件ずつ3バッチ
    expect(globalFetch).toHaveBeenCalledTimes(3);
    // 既定レポートの各 key が結果に存在する
    for (const def of GA4_REPORTS) {
      expect(result[def.key]).toBeDefined();
    }
    vi.unstubAllGlobals();
  });

  it("リクエストが5件を超える場合は5件ずつのバッチに分割して呼ぶ", async () => {
    // 3レポート × 2期間 = 6リクエスト → 5 + 1 の2バッチ
    const threeReports: Ga4ReportDef[] = [
      { key: "a", dimensions: [], metrics: ["sessions"] },
      { key: "b", dimensions: ["deviceCategory"], metrics: ["sessions"] },
      { key: "c", dimensions: ["pagePath"], metrics: ["sessions"] },
    ];
    const fetchFn = vi
      .fn<FetchFn>()
      .mockReturnValueOnce(
        okResponse({
          reports: [
            { metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "10" }] }] }, // a cur
            { metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "8" }] }] }, // a prior
            { metricHeaders: [{ name: "sessions" }] }, // b cur
            { metricHeaders: [{ name: "sessions" }] }, // b prior
            { metricHeaders: [{ name: "sessions" }] }, // c cur
          ],
        })
      )
      .mockReturnValueOnce(
        okResponse({
          reports: [
            { metricHeaders: [{ name: "sessions" }] }, // c prior
          ],
        })
      );

    const result = await fetchGa4({
      config,
      accessToken: "t",
      current,
      prior,
      fetchFn,
      reports: threeReports,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).requests).toHaveLength(5);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body as string).requests).toHaveLength(1);
    // バッチをまたいでも順序どおり突合される
    expect(result.a[0].metrics.sessions).toEqual({ current: 10, prior: 8, deltaPct: 25 });
    expect(result.c).toEqual([]);
  });

  it("レスポンスのレポート数が要求数より少ない場合はエラーにする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({}));

    await expect(
      fetchGa4({ config, accessToken: "t", current, prior, reports, fetchFn })
    ).rejects.toThrow("GA4レスポンスのレポート数が要求と一致しません(要求4件・応答0件)");
  });

  it("rowsが空のレポートは正常な0件として返す", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ reports: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }] }));

    const result = await fetchGa4({ config, accessToken: "t", current, prior, reports, fetchFn });

    expect(result.summary).toEqual([]);
    expect(result.byChannel).toEqual([]);
  });

  it("API がエラーを返した場合は status を含むエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "permission denied",
    });

    await expect(
      fetchGa4({ config, accessToken: "t", current, prior, fetchFn, reports })
    ).rejects.toThrow(/403/);
  });
});
