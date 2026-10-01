// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { CRUX_PATHS, fetchCruxResults, formatCruxResults, formatCruxSkipped } from "./crux";

const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const metric = (percentile: number, category: string) => ({ percentile, category });
const fullMetrics = {
  LARGEST_CONTENTFUL_PAINT_MS: metric(2200, "FAST"),
  INTERACTION_TO_NEXT_PAINT: metric(155, "FAST"),
  CUMULATIVE_LAYOUT_SHIFT_SCORE: metric(5, "FAST"),
  FIRST_CONTENTFUL_PAINT_MS: metric(1300, "FAST"),
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: metric(500, "FAST"),
};
const deps = { apiKey: "KEY-SECRET", baseUrl: "https://www.thepicklebang.com" };

describe("fetchCruxResults", () => {
  it("ページ単位の実データがあれば page として返し、CLS は 100 で割る", async () => {
    server.use(http.get(PSI, () => HttpResponse.json({ loadingExperience: { metrics: fullMetrics }, originLoadingExperience: { metrics: {} } })));
    const results = await fetchCruxResults(deps);
    expect(results.map((result) => result.path)).toEqual([...CRUX_PATHS]);
    expect(results[0].scope).toBe("page");
    expect(results[0].metrics).toEqual([
      { name: "LCP", p75: 2200, category: "FAST" },
      { name: "INP", p75: 155, category: "FAST" },
      { name: "CLS", p75: 0.05, category: "FAST" },
      { name: "FCP", p75: 1300, category: "FAST" },
      { name: "TTFB", p75: 500, category: "FAST" },
    ]);
  });

  it("origin_fallback や指標なしのときはオリジンの値で代替し、scope を origin にする", async () => {
    server.use(
      http.get(PSI, () =>
        HttpResponse.json({
          loadingExperience: { metrics: fullMetrics, origin_fallback: true },
          originLoadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: metric(2400, "AVERAGE") } },
        }),
      ),
    );
    const [first] = await fetchCruxResults(deps);
    expect(first.scope).toBe("origin");
    expect(first.metrics[0]).toEqual({ name: "LCP", p75: 2400, category: "AVERAGE" });
  });

  it("どちらの経験値も無ければ、全指標が null(0 とは区別する)", async () => {
    server.use(http.get(PSI, () => HttpResponse.json({})));
    const [first] = await fetchCruxResults(deps);
    expect(first.scope).toBe("origin");
    expect(first.metrics.every((m) => m.p75 === null && m.category === null)).toBe(true);
  });

  it("モバイル・性能カテゴリ・対象URL・キーを付けて呼ぶ", async () => {
    const urls: URL[] = [];
    server.use(http.get(PSI, ({ request }) => (urls.push(new URL(request.url)), HttpResponse.json({}))));
    await fetchCruxResults(deps);
    expect(urls).toHaveLength(CRUX_PATHS.length);
    expect(urls[1].searchParams.get("url")).toBe("https://www.thepicklebang.com/reserve");
    expect(urls[1].searchParams.get("strategy")).toBe("mobile");
    expect(urls[1].searchParams.get("category")).toBe("performance");
    expect(urls[1].searchParams.get("key")).toBe("KEY-SECRET");
  });

  it("429 などの HTTP エラーは、キーを含めずに例外", async () => {
    server.use(http.get(PSI, () => new HttpResponse(null, { status: 429 })));
    const error = await fetchCruxResults(deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("PSI 失敗: 429");
  });

  it("応答の形が想定と違えば例外", async () => {
    server.use(http.get(PSI, () => HttpResponse.json({ loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: "x" } } } })));
    await expect(fetchCruxResults(deps)).rejects.toThrow("PSI の応答の形が想定と違います");
  });
});

describe("整形", () => {
  const page = { path: "/", scope: "page" as const, metrics: [
    { name: "LCP", p75: 2200, category: "FAST" },
    { name: "INP", p75: 155, category: "AVERAGE" },
    { name: "CLS", p75: 0.05, category: "SLOW" },
    { name: "FCP", p75: 1300, category: null },
    { name: "TTFB", p75: 500, category: "FAST" },
  ] };

  it("ページ単位は単位つきで、評価ラベルは持つものだけ付ける", () => {
    expect(formatCruxResults([page])).toBe("/  [ページ単位]  LCP 2.2s(良好) INP 155ms(要改善) CLS 0.05(不良) FCP 1.3s TTFB 500ms(良好)");
  });

  it("オリジン代替と、取得できなかった指標を明示する", () => {
    const text = formatCruxResults([{ path: "/reserve", scope: "origin", metrics: [{ name: "LCP", p75: null, category: null }] }]);
    expect(text).toBe("/reserve  [オリジンで代替(ページ単位は件数不足)]  LCP 取得不可");
  });

  it("キー未設定のスキップ文言", () => {
    expect(formatCruxSkipped()).toContain("PSI_API_KEY が未設定のため CrUX の取得をスキップしました");
    expect(formatCruxSkipped()).toContain("docs/operations/measurement-repair-checklist.md");
  });
});
