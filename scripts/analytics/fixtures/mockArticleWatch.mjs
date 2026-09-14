// 記事ウォッチ CLI の結線テスト専用。すべての外部通信を MSW で遮断する。
// TEST_WATCH_FAILURE: "" | "ga4" | "sitemap" | "html500" | "html500-once" | "html000"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const here = dirname(fileURLToPath(import.meta.url));
const failure = process.env.TEST_WATCH_FAILURE ?? "";
const sitemap = readFileSync(join(here, "article-watch/sitemap.xml"), "utf8");
const expiredHtml = readFileSync(join(here, "article-watch/news-expired.html"), "utf8");
const articleHtml = (title) =>
  `<!doctype html><html><head><title>${title}</title><script type="application/ld+json">{"@type":"Article","datePublished":"2026-07-01T00:00:00Z","dateModified":"2026-09-13T00:00:00Z"}</script></head><body><main><article><p>${title}の本文</p></article></main></body></html>`;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const row = (path, iso, sessions) => ({ dimensionValues: [{ value: path }, { value: iso.replaceAll("-", "") }], metricValues: [{ value: String(sessions) }] });

let steadyHits = 0;
const server = setupServer(
  http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({ access_token: "test-token" })),
  http.post("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport", async ({ request }) => {
    if (failure === "ga4") return new HttpResponse(null, { status: 503 });
    const { dateRanges } = await request.json();
    const { startDate, endDate } = dateRanges[0];
    const prev7End = addDays(endDate, -7);
    const rows = [];
    for (let iso = startDate; iso <= endDate; iso = addDays(iso, 1)) {
      rows.push(row("/columns/steady", iso, 10));
      rows.push(row("/columns/spike", iso, iso <= prev7End ? 5 : 20));
      rows.push(row("/news/expired-event", iso, 1));
      rows.push(row("/reserve", iso, 100));
    }
    return HttpResponse.json({ rows });
  }),
  http.get("https://example.test/sitemap.xml", () => (failure === "sitemap" ? new HttpResponse(null, { status: 500 }) : HttpResponse.text(sitemap))),
  http.get("https://example.test/columns/steady", () => {
    steadyHits += 1;
    if (failure === "html500") return new HttpResponse(null, { status: 500 });
    if (failure === "html500-once" && steadyHits === 1) return new HttpResponse(null, { status: 500 });
    if (failure === "html000") return HttpResponse.error();
    return HttpResponse.text(articleHtml("steady"));
  }),
  http.get("https://example.test/columns/spike", () => HttpResponse.text(articleHtml("spike"))),
  http.get("https://example.test/news/expired-event", () => HttpResponse.text(expiredHtml)),
  http.get("https://example.test/en/news/expired-event", () => HttpResponse.text(articleHtml("expired-event-en"))),
);
server.listen({ onUnhandledRequest: "error" });
