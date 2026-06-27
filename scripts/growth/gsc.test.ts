// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { fetchGsc, GSC_REPORTS, type GscReportDef } from "./gsc";
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

const reports: GscReportDef[] = [
  { key: "summary", dimensions: [] },
  { key: "topQueries", dimensions: ["query"], rowLimit: 25 },
];

function okResponse(body: unknown): ReturnType<FetchFn> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("fetchGsc", () => {
  it("searchAnalytics.query を URL エンコードした siteUrl 付きで叩く", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ rows: [] }));

    await fetchGsc({ config, accessToken: "ya29.token", current, prior, fetchFn, reports });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.thepicklebang.com%2F/searchAnalytics/query"
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ya29.token"
    );
  });

  it("filters を dimensionFilterGroups(operator 既定=equals)としてボディに載せる(#S2 page絞り込み)", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ rows: [] }));
    const pageReports: GscReportDef[] = [
      {
        key: "articleSummary",
        dimensions: [],
        filters: [{ dimension: "page", expression: "https://www.thepicklebang.com/news/a" }],
      },
    ];

    await fetchGsc({ config, accessToken: "t", current, prior, fetchFn, reports: pageReports });

    const body = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(body.dimensionFilterGroups).toEqual([
      {
        filters: [
          { dimension: "page", operator: "equals", expression: "https://www.thepicklebang.com/news/a" },
        ],
      },
    ]);
  });

  it("各レポートを current/prior の2期間ぶん、計 N×2 回リクエストする", async () => {
    const fetchFn = vi.fn<FetchFn>().mockReturnValue(okResponse({ rows: [] }));

    await fetchGsc({ config, accessToken: "t", current, prior, fetchFn, reports });

    // 2レポート × 2期間 = 4リクエスト
    expect(fetchFn).toHaveBeenCalledTimes(4);
    const firstBody = JSON.parse(fetchFn.mock.calls[0][1].body as string);
    expect(firstBody).toEqual({ startDate: "2026-06-08", endDate: "2026-06-14" });
    const secondBody = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(secondBody).toEqual({ startDate: "2026-06-01", endDate: "2026-06-07" });
    const thirdBody = JSON.parse(fetchFn.mock.calls[2][1].body as string);
    expect(thirdBody).toEqual({
      startDate: "2026-06-08",
      endDate: "2026-06-14",
      dimensions: ["query"],
      rowLimit: 25,
    });
  });

  it("current/prior を突合した整形結果を返す", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockReturnValueOnce(
        okResponse({ rows: [{ clicks: 89, impressions: 5230, ctr: 0.017, position: 12.4 }] })
      )
      .mockReturnValueOnce(
        okResponse({ rows: [{ clicks: 80, impressions: 5000, ctr: 0.016, position: 13.0 }] })
      )
      .mockReturnValueOnce(
        okResponse({ rows: [{ keys: ["pickleball 福岡"], clicks: 12, impressions: 340, ctr: 0.035, position: 8.2 }] })
      )
      .mockReturnValueOnce(
        okResponse({ rows: [{ keys: ["pickleball 福岡"], clicks: 10, impressions: 300, ctr: 0.033, position: 9.0 }] })
      );

    const result = await fetchGsc({ config, accessToken: "t", current, prior, fetchFn, reports });

    expect(result.summary[0].metrics.clicks).toEqual({
      current: 89,
      prior: 80,
      deltaPct: 11.3,
    });
    expect(result.topQueries[0].keys).toEqual(["pickleball 福岡"]);
    expect(result.topQueries[0].metrics.clicks.current).toBe(12);
  });

  it("reports/fetchFn 未指定時は既定値(GSC_REPORTS・グローバル fetch)を用いる", async () => {
    const globalFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rows: [] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", globalFetch);

    const result = await fetchGsc({ config, accessToken: "t", current, prior });

    for (const def of GSC_REPORTS) {
      expect(result[def.key]).toBeDefined();
    }
    vi.unstubAllGlobals();
  });

  it("API がエラーを返した場合は status を含むエラーを投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "forbidden",
    });

    await expect(
      fetchGsc({ config, accessToken: "t", current, prior, fetchFn, reports })
    ).rejects.toThrow(/403/);
  });
});
