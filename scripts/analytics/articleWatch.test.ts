// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { addDays, ARTICLE_URL, buildArticle, buildArticleWindows, buildReport, computeWindows, daysBetween, detectEntryFlags, detectHttpFlag, detectSitemapFlag, detectTextFlags, extractArticleUrls, formatReport, parseArticleHtml, THRESHOLDS } from "./articleWatch.mjs";

describe("日付ユーティリティ", () => {
  it("日数を加減し、月またぎも扱う", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-09-14", 7)).toBe("2026-09-21");
    expect(daysBetween("2026-08-31", "2026-09-14")).toBe(14);
  });
});

describe("日付窓", () => {
  it("昨日・前週同曜日・直近7日・前7日・取得窓を JST の今日から作る", () => {
    const w = computeWindows("2026-09-14");
    expect(w.yesterday).toEqual({ startDate: "2026-09-13", endDate: "2026-09-13" });
    expect(w.sameWeekdayLastWeek).toEqual({ startDate: "2026-09-06", endDate: "2026-09-06" });
    expect(w.last7).toEqual({ startDate: "2026-09-07", endDate: "2026-09-13" });
    expect(w.prev7).toEqual({ startDate: "2026-08-31", endDate: "2026-09-06" });
    expect(w.fetch).toEqual({ startDate: "2026-08-31", endDate: "2026-09-13" });
  });
});

describe("GA4 行の記事別集計", () => {
  const windows = computeWindows("2026-09-14");
  it("記事パスだけを4窓に振り分け、クエリ文字列と /ja/ を正規化して合算する", () => {
    const rows = [
      { landingPage: "/columns/a?draftKey=x", date: "20260913", sessions: 3 },
      { landingPage: "/ja/columns/a", date: "20260913", sessions: 2 },
      { landingPage: "/columns/a", date: "20260906", sessions: 4 },
      { landingPage: "/columns/a", date: "20260901", sessions: 1 },
      { landingPage: "/en/news/b/", date: "20260910", sessions: 7 },
      { landingPage: "/reserve", date: "20260913", sessions: 100 },
      { landingPage: "/columns", date: "20260913", sessions: 50 },
    ];
    const map = buildArticleWindows(rows, windows);
    expect(map.get("/columns/a")).toEqual({ yesterday: 5, sameWeekdayLastWeek: 4, last7: 5, prev7: 5 });
    expect(map.get("/en/news/b")).toEqual({ yesterday: 0, sameWeekdayLastWeek: 0, last7: 7, prev7: 0 });
    expect(map.has("/reserve")).toBe(false);
    expect(map.has("/columns")).toBe(false);
  });
  it("窓の外の日付は無視する", () => {
    const map = buildArticleWindows([{ landingPage: "/columns/a", date: "20260830", sessions: 9 }], windows);
    expect(map.get("/columns/a")).toEqual({ yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 });
  });
  it("閾値は設計書の値を持つ", () => {
    expect(THRESHOLDS).toEqual({ g1MinPrev7: 30, g1Percent: 40, g2MinPrev: 20, g2Percent: 60, g3MinPrev7: 30, newArticleDays: 14, h2StaleDays: 14, maxArticles: 50, maxUnlisted: 10, sMinSessions: 3 });
  });
});

describe("G 判定(流入急変)", () => {
  const today = "2026-09-14";
  const base = { yesterday: 10, sameWeekdayLastWeek: 10, last7: 70, prev7: 70 };
  it("変動が閾値内なら何も付けない", () => {
    expect(detectEntryFlags(base, "2026-08-01", today)).toEqual([]);
  });
  it("G1: 直近7日が前7日比 ±40% 超、前7日が30以上", () => {
    expect(detectEntryFlags({ ...base, last7: 100 }, "2026-08-01", today)).toEqual([
      { code: "G1", severity: "中", detail: { last7: 100, prev7: 70, deltaPercent: 43 } },
    ]);
    expect(detectEntryFlags({ ...base, last7: 40 }, "2026-08-01", today)).toEqual([
      { code: "G1", severity: "中", detail: { last7: 40, prev7: 70, deltaPercent: -43 } },
    ]);
  });
  it("G1 は前7日が30未満なら付けない(小さい記事の揺れ)", () => {
    expect(detectEntryFlags({ ...base, last7: 20, prev7: 29 }, "2026-08-01", today)).toEqual([]);
  });
  it("G2: 昨日が前週同曜日比 ±60% 超、前週同曜日が20以上", () => {
    expect(detectEntryFlags({ ...base, yesterday: 33, sameWeekdayLastWeek: 20 }, "2026-08-01", today)).toEqual([
      { code: "G2", severity: "中", detail: { yesterday: 33, sameWeekdayLastWeek: 20, deltaPercent: 65 } },
    ]);
    expect(detectEntryFlags({ ...base, yesterday: 30, sameWeekdayLastWeek: 19 }, "2026-08-01", today)).toEqual([]);
  });
  it("G3: 前7日が30以上あった記事の直近7日が0。G1 は重ねない", () => {
    expect(detectEntryFlags({ ...base, last7: 0 }, "2026-08-01", today)).toEqual([
      { code: "G3", severity: "高", detail: { last7: 0, prev7: 70 } },
    ]);
  });
  it("公開14日未満の記事は対象外。公開日が取れなければ対象に残す", () => {
    expect(detectEntryFlags({ ...base, last7: 300 }, "2026-09-01", today)).toEqual([]);
    expect(detectEntryFlags({ ...base, last7: 300 }, "2026-08-31", today)).toHaveLength(1);
    expect(detectEntryFlags({ ...base, last7: 300 }, null, today)).toHaveLength(1);
  });
  it("値が null の判定は飛ばし、entry が null なら何も付けない", () => {
    expect(detectEntryFlags({ yesterday: 40, sameWeekdayLastWeek: 20, last7: null, prev7: 70 }, null, today)).toEqual([
      { code: "G2", severity: "中", detail: { yesterday: 40, sameWeekdayLastWeek: 20, deltaPercent: 100 } },
    ]);
    expect(detectEntryFlags({ yesterday: null, sameWeekdayLastWeek: null, last7: 300, prev7: 70 }, null, today)).toHaveLength(1);
    expect(detectEntryFlags(null, null, today)).toEqual([]);
  });
});

describe("sitemap 解析", () => {
  const xml = readFileSync("scripts/analytics/fixtures/article-watch/sitemap.xml", "utf8");
  it("記事の詳細 URL だけを、末尾スラッシュを落とし重複を除いて拾う", () => {
    expect(extractArticleUrls(xml, "https://example.test")).toEqual({
      paths: ["/columns/steady", "/columns/spike", "/news/expired-event", "/en/news/expired-event"],
      overflow: [],
    });
  });
  it("記事 URL の形(ARTICLE_URL)は locale 付き1階層の slug だけを認める", () => {
    expect(ARTICLE_URL.test("/columns/a")).toBe(true);
    expect(ARTICLE_URL.test("/news/a")).toBe(true);
    expect(ARTICLE_URL.test("/en/columns/a")).toBe(true);
    expect(ARTICLE_URL.test("/columns/a/b")).toBe(false);
    expect(ARTICLE_URL.test("/columns")).toBe(false);
    expect(ARTICLE_URL.test("/ja/columns/a")).toBe(false);
  });
  it("上限50本を超えた分は overflow に分ける", () => {
    const many = Array.from({ length: 52 }, (_, i) => `<url><loc>https://example.test/columns/a${i}</loc></url>`).join("");
    const { paths, overflow } = extractArticleUrls(`<urlset>${many}</urlset>`, "https://example.test");
    expect(paths).toHaveLength(50);
    expect(overflow).toEqual(["/columns/a50", "/columns/a51"]);
  });
});

describe("HTML 解析", () => {
  const html = readFileSync("scripts/analytics/fixtures/article-watch/news-expired.html", "utf8");
  it("NewsArticle の JSON-LD から JST の公開日・更新日を取り、main の中だけを本文にする", () => {
    const parsed = parseArticleHtml(html);
    expect(parsed.datePublished).toBe("2026-07-01");
    expect(parsed.dateModified).toBe("2026-07-01");
    expect(parsed.scope).toBe("main");
    expect(parsed.mainText).toContain("2026年8月23日(日)に開催します。参加受付中です。");
    expect(parsed.mainText).not.toContain("まもなく新キャンペーン");
    expect(parsed.mainText).not.toContain("window.__x");
  });
  it("Article でも取れ、壊れた JSON-LD と無関係な型は読み飛ばす", () => {
    const parsed = parseArticleHtml(
      '<script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"WebSite"}</script>' +
      '<script type="application/ld+json">{"@type":"Article","datePublished":"2026-08-10T02:24:37.078Z","dateModified":"not a date"}</script><main>x</main>',
    );
    expect(parsed).toMatchObject({ datePublished: "2026-08-10", dateModified: null });
    expect(parseArticleHtml('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-10T02:24:37.078Z"}</script><main>x</main>'))
      .toMatchObject({ datePublished: "2026-08-10", dateModified: null });
  });
  it("main が無ければ article、それも無ければ body 全体を本文にする", () => {
    expect(parseArticleHtml("<body><article>本文だけ</article><footer>脚</footer></body>")).toMatchObject({ scope: "article", mainText: "本文だけ" });
    expect(parseArticleHtml("<body><p>全部</p></body>")).toMatchObject({ scope: "body", mainText: "全部", datePublished: null, dateModified: null });
  });
});

describe("H 判定(期限切れ表現)", () => {
  const today = "2026-09-14";
  const parsed = (mainText: string, dateModified: string | null = "2026-09-13") => ({ datePublished: "2026-08-01", dateModified, mainText, scope: "main" as const });
  it("H1: ニュースに受付中系の語があり、最も遅い開催日が昨日以前", () => {
    expect(detectTextFlags("/news/x", parsed("2026年8月22日(土)と2026年8月23日(日)に開催します。受付中"), today)).toEqual([
      { code: "H1", severity: "中", detail: { phrase: "受付中", eventDate: "2026-08-23" } },
    ]);
  });
  it("H1 の対象語は「募集中」「受付中」「開催します」の3語で、「開催予定」は含めない", () => {
    expect(detectTextFlags("/news/x", parsed("2026年8月23日(日)に開催予定です。"), today)).toEqual([]);
    expect(detectTextFlags("/news/x", parsed("2026年8月23日(日)の参加者を募集中です。"), today)).toEqual([
      { code: "H1", severity: "中", detail: { phrase: "募集中", eventDate: "2026-08-23" } },
    ]);
  });
  it("本文に終了の断り書きがあれば H1 を判定しない(H2 は抑止しない)", () => {
    expect(detectTextFlags("/news/x", parsed("このイベントは終了しました。2026年8月23日(日)に開催します。受付中"), today)).toEqual([]);
    expect(detectTextFlags("/news/x", parsed("このイベントは終了いたしました。2026年8月23日に開催します。受付中。詳細は追って", "2026-08-01"), today)).toEqual([
      { code: "H2", severity: "低", detail: { phrase: "追って", dateModified: "2026-08-01", daysSinceModified: 44 } },
    ]);
  });
  it("H1 は開催日が今日以降なら付けず、年のない日付は使わず、コラムには適用しない", () => {
    expect(detectTextFlags("/news/x", parsed("2026年9月26日(土)に開催します。受付中"), today)).toEqual([]);
    expect(detectTextFlags("/news/x", parsed("8月23日に開催します。受付中"), today)).toEqual([]);
    expect(detectTextFlags("/news/x", parsed("開催しました。"), today)).toEqual([]);
    expect(detectTextFlags("/columns/x", parsed("2026年8月23日に開催します。受付中"), today)).toEqual([]);
  });
  it("H2: 「まもなく」「近日公開」等があり、更新から14日超", () => {
    expect(detectTextFlags("/columns/x", parsed("販売はまもなく開始", "2026-08-30"), today)).toEqual([
      { code: "H2", severity: "低", detail: { phrase: "まもなく", dateModified: "2026-08-30", daysSinceModified: 15 } },
    ]);
    expect(detectTextFlags("/columns/x", parsed("詳細は近日公開", "2026-08-31"), today)).toEqual([]);
    expect(detectTextFlags("/columns/x", parsed("詳細は近日公開", null), today)).toEqual([]);
  });
  it("H1 と H2 は独立に付き、parsed が null なら何も付けない", () => {
    expect(detectTextFlags("/news/x", parsed("2026年8月23日に開催します。受付中。詳細は追って", "2026-08-01"), today).map((f) => f.code)).toEqual(["H1", "H2"]);
    expect(detectTextFlags("/news/x", null, today)).toEqual([]);
  });
});

describe("I 判定(死活)", () => {
  const parsed = (scope: "main" | "article" | "body") => ({ datePublished: null, dateModified: null, mainText: "", scope });
  it("再試行後も 200 以外なら最優先、観測不能と本文のある 200 は付けない", () => {
    expect(detectHttpFlag({ status: 500, observed: "error" }, null)).toEqual({ code: "I", severity: "最優先", detail: { status: 500 } });
    expect(detectHttpFlag({ status: null, observed: "unreachable" }, null)).toBeNull();
    expect(detectHttpFlag({ status: 200, observed: "ok" }, parsed("main"))).toBeNull();
  });
  it("200 でも本文(main/article)が無ければソフト404 として最優先で付ける", () => {
    expect(detectHttpFlag({ status: 200, observed: "ok" }, parsed("body"))).toEqual({
      code: "I", severity: "最優先", detail: { status: 200, reason: "記事本文なし（ソフト404）" },
    });
  });
});

describe("S 判定(sitemap 外の流入記事)", () => {
  const entry = { yesterday: 1, sameWeekdayLastWeek: 0, last7: 4, prev7: 2 };
  const parsed = (scope: "main" | "article" | "body") => ({ datePublished: null, dateModified: null, mainText: "", scope });
  it("記事として描画されていれば低、ソフト404 と非200 は中、接続不能は低", () => {
    expect(detectSitemapFlag(entry, { status: 200, observed: "ok" }, parsed("main"))).toEqual({
      code: "S", severity: "低", detail: { last7: 4, prev7: 2, page: "ok" },
    });
    expect(detectSitemapFlag(entry, { status: 200, observed: "ok" }, parsed("body"))).toEqual({
      code: "S", severity: "中", detail: { last7: 4, prev7: 2, page: "missing", status: 200 },
    });
    expect(detectSitemapFlag(entry, { status: 404, observed: "error" }, null)).toEqual({
      code: "S", severity: "中", detail: { last7: 4, prev7: 2, page: "missing", status: 404 },
    });
    expect(detectSitemapFlag(entry, { status: null, observed: "unreachable" }, null)).toEqual({
      code: "S", severity: "低", detail: { last7: 4, prev7: 2, page: "unreachable" },
    });
  });
});

describe("レポート", () => {
  const today = "2026-09-14";
  const windows = computeWindows(today);
  const html = readFileSync("scripts/analytics/fixtures/article-watch/news-expired.html", "utf8");
  const ok = { status: 200, retried: false, observed: "ok" as const };
  it("記事1本を組み立て、locale と日付を付け、G/H/I を集める", () => {
    const article = buildArticle({ path: "/en/news/expired-event", entry: { yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 }, http: ok, html, today });
    expect(article).toMatchObject({ locale: "en", publishedAt: "2026-07-01", dateModified: "2026-07-01" });
    expect(article.flags.map((f) => f.code)).toEqual(["H1", "H2"]);
    const dead = buildArticle({ path: "/columns/steady", entry: null, http: { status: 500, retried: true, observed: "error" }, html: null, today });
    expect(dead).toMatchObject({ locale: "ja", publishedAt: null, dateModified: null, entry: null });
    expect(dead.flags).toEqual([{ code: "I", severity: "最優先", detail: { status: 500 } }]);
  });
  it("sitemap 外の記事(inSitemap:false)は G/H/I を判定せず S だけを付ける", () => {
    const entry = { yesterday: 0, sameWeekdayLastWeek: 0, last7: 3, prev7: 1 };
    const ghost = buildArticle({ path: "/columns/ghost", entry, http: ok, html: "<body><header>THE PICKLE BANG THEORY</header></body>", today, inSitemap: false });
    expect(ghost).toMatchObject({ inSitemap: false, locale: "ja" });
    expect(ghost.flags).toEqual([{ code: "S", severity: "中", detail: { last7: 3, prev7: 1, page: "missing", status: 200 } }]);
    const alive = buildArticle({ path: "/columns/ghost", entry, http: ok, html, today, inSitemap: false });
    expect(alive.flags).toEqual([{ code: "S", severity: "低", detail: { last7: 3, prev7: 1, page: "ok" } }]);
    const gone = buildArticle({ path: "/columns/ghost", entry, http: { status: null, retried: true, observed: "unreachable" as const }, html: null, today, inSitemap: false });
    expect(gone.flags).toEqual([{ code: "S", severity: "低", detail: { last7: 3, prev7: 1, page: "unreachable" } }]);
  });
  it("sitemap の記事は inSitemap:true を既定にする", () => {
    expect(buildArticle({ path: "/columns/steady", entry: null, http: ok, html: "<main>本文</main>", today })).toMatchObject({ inSitemap: true });
  });
  it("alerts を深刻度順→パス順に平坦化し、テキストに整形する", () => {
    const sources = { ga4: { ok: true, error: null }, sitemap: { ok: true, count: 2, error: null }, html: { ok: false, fetched: 1, error: "unreachable: /columns/z" } };
    const articles = [
      buildArticle({ path: "/news/expired-event", entry: { yesterday: 1, sameWeekdayLastWeek: 1, last7: 7, prev7: 7 }, http: ok, html, today }),
      buildArticle({ path: "/columns/steady", entry: { yesterday: 30, sameWeekdayLastWeek: 30, last7: 70, prev7: 70 }, http: { status: 503, retried: true, observed: "error" }, html: null, today }),
    ];
    const report = buildReport({ today, windows, sources, articles });
    expect(report.alerts.map((a) => `${a.code}:${a.path}`)).toEqual(["I:/columns/steady", "H1:/news/expired-event", "H2:/news/expired-event"]);
    const text = formatReport(report);
    expect(text).toContain("html: 取得不可 (unreachable: /columns/z)");
    expect(text).toContain("I) columns/steady [最優先]");
    expect(formatReport(buildReport({ today, windows, sources, articles: [] }))).toContain("alerts: なし");
  });
  it("同じ深刻度の alerts はパス順に並ぶ", () => {
    const dead = (path: string) => buildArticle({ path, entry: null, http: { status: 500, retried: true, observed: "error" }, html: null, today });
    const report = buildReport({ today, windows, sources: {}, articles: [dead("/columns/z"), dead("/columns/a")] });
    expect(report.alerts.map((a) => a.path)).toEqual(["/columns/a", "/columns/z"]);
  });
});
