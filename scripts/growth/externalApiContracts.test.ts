import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { patchDraft, publishContent, readContentStatus } from "./content";
import { fetchGa4 } from "./ga4";
import { fetchGsc } from "./gsc";
import type { FetchFn, HttpResponse } from "./http";
import { pushTextMessage } from "./line";
import { uploadMedia } from "./media";
import { queryDataSourcePage } from "./notion";

const fixtureDirectory = "scripts/growth/__fixtures__/contracts";

function fixture(name: string): string {
  return readFileSync(`${fixtureDirectory}/${name}`, "utf8");
}

function response(name: string, status = 200): HttpResponse {
  const raw = fixture(name);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "request-fixture" },
    json: async () => JSON.parse(raw) as unknown,
    text: async () => raw,
  };
}

const config = {
  ga4PropertyId: "123",
  gscSiteUrl: "https://example.com/",
  googleClientId: "client",
  googleClientSecret: "secret",
  googleRefreshToken: "refresh",
};
const current = { start: "2026-07-01", end: "2026-07-07" };
const prior = { start: "2026-06-24", end: "2026-06-30" };

describe("外部API contract fixtures", () => {
  it("Notion queryのURL・headers・bodyと正規化結果を固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("notion-query.json"));
    const result = await queryDataSourcePage("data-source", { pageSize: 25 }, { token: "notion-secret", fetchFn });
    expect(result).toEqual({ pages: [expect.objectContaining({ id: "page-1" })], hasMore: false, nextCursor: null });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/data_sources/data-source/query");
    expect(init).toMatchObject({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer notion-secret", "Notion-Version": "2025-09-03" }) });
    expect(JSON.parse(String(init.body))).toEqual({ page_size: 25 });
  });

  it("microCMS content patchのcontractを固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("microcms-content.json"));
    await expect(patchDraft("news", "content-1", { title: "fixture" }, { serviceDomain: "svc", apiKey: "micro-secret", fetchFn, retry: { maxAttempts: 1 } })).resolves.toBe("content-1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://svc.microcms.io/api/v1/news/content-1?status=draft");
    expect(init).toMatchObject({ method: "PATCH", headers: expect.objectContaining({ "X-MICROCMS-API-KEY": "micro-secret" }) });
    expect(JSON.parse(String(init.body))).toEqual({ title: "fixture" });
  });

  it("microCMS media uploadのcontractを固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("microcms-media.json"));
    const url = await uploadMedia("fixture.png", { serviceDomain: "svc", apiKey: "media-secret", fetchFn, readFile: async () => Buffer.from("png") });
    expect(url).toBe("https://images.microcms-assets.io/assets/fixture.png");
    expect(fetchFn.mock.calls[0][0]).toBe("https://svc.microcms-management.io/api/v1/media");
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "X-MICROCMS-API-KEY": "media-secret" }, body: expect.any(FormData) });
  });

  it("microCMS status read/publishのcontractを固定する", async () => {
    const fetchFn = vi.fn<FetchFn>()
      .mockResolvedValueOnce(response("microcms-status.json"))
      .mockResolvedValueOnce(response("empty.json"));
    const options = { serviceDomain: "svc", apiKey: "management-secret", fetchFn };
    await expect(readContentStatus("news", "content-1", options)).resolves.toBe("PUBLISH");
    await publishContent("news", "content-1", options);
    expect(fetchFn.mock.calls[1][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ status: ["PUBLISH"] }) });
  });

  it("GA4 batchRunReportsのcontractと正規化結果を固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("ga4-batch-run-reports.json"));
    const result = await fetchGa4({ config, accessToken: "google-secret", current, prior, reports: [{ key: "pages", dimensions: ["pagePath"], metrics: ["screenPageViews"] }], fetchFn });
    expect(result.pages[0]).toMatchObject({ keys: ["/ja/news/a"], metrics: { screenPageViews: { current: 10, prior: 5, deltaPct: 100 } } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("/properties/123:batchRunReports");
    expect(init.headers).toMatchObject({ Authorization: "Bearer google-secret" });
    expect((JSON.parse(String(init.body)) as { requests: unknown[] }).requests).toHaveLength(2);
  });

  it("GSC searchAnalyticsのcontractと正規化結果を固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("gsc-search-analytics.json"));
    const result = await fetchGsc({ config, accessToken: "google-secret", current, prior, reports: [{ key: "queries", dimensions: ["query"], rowLimit: 5 }], fetchFn });
    expect(result.queries[0]).toMatchObject({ keys: ["pickleball"], metrics: { clicks: { current: 3, prior: 3, deltaPct: 0 } } });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toContain(encodeURIComponent(config.gscSiteUrl));
    expect(JSON.parse(String(fetchFn.mock.calls[0][1].body))).toMatchObject({ dimensions: ["query"], rowLimit: 5 });
  });

  it("LINE pushのcontractを固定する", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("line-push.json"));
    await pushTextMessage("group", "hello", { channelAccessToken: "line-secret", fetchFn, kind: "critical" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer line-secret", "Content-Type": "application/json" } });
    expect(JSON.parse(String(init.body))).toEqual({ to: "group", messages: [{ type: "text", text: "hello" }] });
  });

  it("空レスポンスは既定値へ正規化し、壊れたJSONは成功扱いしない", async () => {
    const emptyFetch = vi.fn<FetchFn>(async () => response("empty.json"));
    await expect(queryDataSourcePage("ds", {}, { token: "token", fetchFn: emptyFetch })).resolves.toEqual({ pages: [], hasMore: false, nextCursor: null });
    const malformedFetch = vi.fn<FetchFn>(async () => response("malformed-json.txt"));
    await expect(queryDataSourcePage("ds", {}, { token: "token", fetchFn: malformedFetch })).rejects.toThrow();
  });

  it.each([400, 503])("microCMS %iエラーで本文やsecretを漏らさない", async (status) => {
    const secret = "TOP-SECRET";
    const fetchFn = vi.fn<FetchFn>(async () => ({ ...response("empty.json", status), text: async () => `body ${secret}` }));
    const promise = patchDraft("news", "content-1", {}, { serviceDomain: "svc", apiKey: secret, fetchFn, retry: { maxAttempts: 1 } });
    await expect(promise).rejects.not.toThrow(secret);
    await expect(promise).rejects.not.toThrow("body");
  });
});
