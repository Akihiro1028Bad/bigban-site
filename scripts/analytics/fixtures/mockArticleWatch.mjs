// 記事ウォッチ CLI の結線テスト専用。すべての外部通信を MSW で遮断する。
// TEST_WATCH_FAILURE: "" | "ga4" | "sitemap" | "html500" | "html500-once" | "html000" | "soft404" | "unlisted" | "overflow"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const here = dirname(fileURLToPath(import.meta.url));
const failure = process.env.TEST_WATCH_FAILURE ?? "";
const sitemap = readFileSync(join(here, "article-watch/sitemap.xml"), "utf8");
const expiredHtml = readFileSync(join(here, "article-watch/news-expired.html"), "utf8");
// 存在しない slug で本番が返す空のシェル(ソフト404)。<main> も <article> も無い。
const shellHtml = readFileSync(join(here, "article-watch/soft404-shell.html"), "utf8");
const articleHtml = (title) =>
  `<!doctype html><html><head><title>${title}</title><script type="application/ld+json">{"@type":"Article","datePublished":"2026-07-01T00:00:00Z","dateModified":"2026-09-13T00:00:00Z"}</script></head><body><main><article><p>${title}の本文</p></article></main></body></html>`;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const row = (path, iso, sessions) => ({ dimensionValues: [{ value: path }, { value: iso.replaceAll("-", "") }], metricValues: [{ value: String(sessions) }] });

// 上限(THRESHOLDS.maxUnlisted = 10)超えを作るため、ghost-article と合わせて12本にする。
// 流入順で切ることを固定するため、ゼロ詰めして path 昇順と数値順を一致させる。
const GHOSTS = Array.from({ length: 11 }, (_, n) => `/columns/ghost-${String(n + 1).padStart(2, "0")}`);
// sitemap の上限(THRESHOLDS.maxArticles = 50)超えを作る。of-50 / of-51 は overflow に回る。
const OVERFLOW_PATHS = Array.from({ length: 52 }, (_, n) => `/columns/of-${n}`);
const overflowSitemap = `<urlset>${OVERFLOW_PATHS.map((path) => `<url><loc>https://example.test${path}</loc></url>`).join("")}</urlset>`;

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
      if (failure === "overflow") {
        // sitemap の上限超過分(of-50 / of-51)に流入がある。sitemap には載っているので S にしてはいけない。
        rows.push(row("/columns/of-50", iso, 3));
        rows.push(row("/columns/of-51", iso, 3));
        continue;
      }
      rows.push(row("/columns/steady", iso, 10));
      rows.push(row("/columns/spike", iso, iso <= prev7End ? 5 : 20));
      rows.push(row("/news/expired-event", iso, 1));
      rows.push(row("/reserve", iso, 100));
      if (failure === "unlisted") {
        // sitemap に無いが GA4 に流入がある記事。/en/ は sitemap 未掲載が既知なので S の対象外。
        rows.push(row("/columns/ghost-article", iso, 5)); // 流入最多 → 上限で切っても必ず残る
        rows.push(row("/en/columns/ghost-en", iso, 3));
        rows.push(row("/columns/deep/path", iso, 3)); // 記事 URL の形ではない(ルートに存在しない)
        for (const path of GHOSTS) rows.push(row(path, iso, 3));
        // 流入が少ない2本。path は先頭に並ぶが流入順では最後に回る。合計2は閾値未満、合計3はちょうど。
        if (iso <= addDays(startDate, 1)) rows.push(row("/columns/aaa-low2", iso, 1));
        if (iso <= addDays(startDate, 2)) rows.push(row("/columns/aaa-low3", iso, 1));
      }
    }
    return HttpResponse.json({ rows });
  }),
  http.get("https://example.test/sitemap.xml", () => {
    if (failure === "sitemap") return new HttpResponse(null, { status: 500 });
    return HttpResponse.text(failure === "overflow" ? overflowSitemap : sitemap);
  }),
  http.get("https://example.test/columns/steady", () => {
    steadyHits += 1;
    if (failure === "html500") return new HttpResponse(null, { status: 500 });
    if (failure === "html500-once" && steadyHits === 1) return new HttpResponse(null, { status: 500 });
    if (failure === "html000") return HttpResponse.error();
    if (failure === "soft404") return HttpResponse.text(shellHtml);
    return HttpResponse.text(articleHtml("steady"));
  }),
  http.get("https://example.test/columns/spike", () => HttpResponse.text(articleHtml("spike"))),
  http.get("https://example.test/news/expired-event", () => HttpResponse.text(expiredHtml)),
  http.get("https://example.test/en/news/expired-event", () => HttpResponse.text(articleHtml("expired-event-en"))),
  http.get("https://example.test/columns/ghost-article", () => HttpResponse.text(shellHtml)),
  ...GHOSTS.map((path) => http.get(`https://example.test${path}`, () => HttpResponse.text(articleHtml(path)))),
  ...OVERFLOW_PATHS.map((path) => http.get(`https://example.test${path}`, () => HttpResponse.text(articleHtml(path)))),
);
server.listen({ onUnhandledRequest: "error" });
