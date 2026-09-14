# 記事の日次ウォッチ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-14-article-daily-watch-design.md`

**Goal:** 公開済みコラム・ニュースの「流入急変（G）」「期限切れ表現（H）」「ページ死活（I）」を決定的に判定する CLI を作り、既存の日次ウォッチ（クラウドルーチン）の通知に合流させる。

**Architecture:** 純関数モジュール `scripts/analytics/articleWatch.mjs`（日付窓・GA4 行の集計・sitemap 解析・HTML 解析・G/H/I 判定・レポート組み立て）と、I/O だけを持つ CLI `scripts/analytics/watchArticles.mjs`（`query.mjs` と同じ作法: env 読み込み→OAuth→取得→JSON 出力→終了コード）に分ける。ルーチン側は `docs/growth/routines/daily-watch.md` に手順 3b と判定 G/H/I を追記するだけで、クラウドの env 追加は不要。

**Tech Stack:** Node 24（ESM `.mjs`）、Vitest 4 + MSW（既存構成）、GA4 Data API v1beta、本番サイトの sitemap と HTML（JSON-LD）。

## Global Constraints

- 既存の `scripts/analytics/*.mjs` と同じく ESM JavaScript。テストは `.test.ts`（`// @vitest-environment node`）。`any` は使わない。
- テストは**実装より先に書く**（CLAUDE.md の TDD）。カバレッジ閾値は statements/branches/functions/lines とも **100%**（`vitest.config.ts`）。CLI ファイルは子プロセスで実行するため計測対象外（`query.mjs` と同じ）。
- 実 API・実サイト・実 `.env.local` をテストで読まない。MSW で遮断する（`scripts/analytics/query.test.ts` と同じ方式: 一時ディレクトリにスクリプトを複製し、`--import` で MSW サーバを注入）。
- スクリプトは**読み取りのみ**。ファイル・Notion・microCMS に書き込まない。
- 取得失敗は `null` と `sources.*.error` で表し、**0 で埋めない**（`docs/growth/analysis-contract.md`）。条件に使う値が `null` の判定はその判定だけ飛ばす。
- 閾値は設計書 §3 の値を定数 `THRESHOLDS` に集約する: G1 前7日 ≥ 30 かつ ±40% 超 / G2 前週同曜日 ≥ 20 かつ ±60% 超 / G3 前7日 ≥ 30 かつ直近7日 = 0 / 公開14日未満は G 対象外 / H2 更新から14日超 / sitemap 上限50本。
- 深刻度の語彙は `"最優先" | "高" | "中" | "低"` の4つだけ（既存の日次ウォッチ通知と揃える）。
- パスの正規化は `articleMetrics.mjs` の `normalizeArticlePath` / `isArticlePath` を再利用し、二重実装しない。
- コミットメッセージは日本語の Conventional Commits（`feat(analytics): …` / `test(analytics): …` / `docs: …`）。末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 作業ブランチ: `feat/article-daily-watch`（`develop` から作る。現在の作業ツリー `feat/analytics-article-metrics` には未コミット変更が多数あるため、**git worktree で分離して作業する**）。
- push・PR 作成は **Task 9 でオーナーの動作確認後に1回だけ**。push は AI アカウント `ttmakhr1028ai-art`（CLAUDE.md）。

---

## ファイル構成

| ファイル | 責務 | 作成/変更 |
|---|---|---|
| `scripts/analytics/articleWatch.mjs` | 純関数。日付ユーティリティ、日付窓、GA4 行→記事別4窓、sitemap 解析、HTML 解析（JSON-LD・本文）、G/H/I 判定、レポート組み立て・整形 | 作成 |
| `scripts/analytics/articleWatch.test.ts` | 上記の単体テスト（全分岐） | 作成 |
| `scripts/analytics/fixtures/article-watch/sitemap.xml` | sitemap の fixture（記事3本 + 一覧ページ + 別オリジン） | 作成 |
| `scripts/analytics/fixtures/article-watch/news-expired.html` | H1/H2 が発火するニュース HTML の fixture | 作成 |
| `scripts/analytics/fixtures/mockArticleWatch.mjs` | CLI 結線テスト用の MSW サーバ（OAuth・GA4・sitemap・記事 HTML。失敗は `TEST_WATCH_FAILURE` で切り替え） | 作成 |
| `scripts/analytics/watchArticles.mjs` | CLI。引数解析・env 読み込み・OAuth・GA4 取得・sitemap 取得・HTML 取得（並列5・再試行1回）・JSON 出力・終了コード | 作成 |
| `scripts/analytics/watchArticles.test.ts` | CLI 結線テスト（正常 / GA4 失敗 / sitemap 失敗 / 500 継続 / 500→200 復帰 / 接続不能 / `--site`） | 作成 |
| `docs/growth/routines/daily-watch.md` | 手順 3b・判定表 G/H/I・通知例・原則2行 | 変更 |
| `docs/growth/README.md` | 日次ウォッチの説明に記事監視を追記 | 変更 |
| `docs/growth/analysis-contract.md` | 「記事の日次監視」段落を追加 | 変更 |
| `docs/superpowers/specs/2026-09-11-article-review-routine-design.md` | §3.5 に日次担当の1行を追記 | 変更 |

---

### Task 0: 作業ブランチの準備

**Files:** なし

- [ ] **Step 1: develop から worktree を作る**

```bash
git fetch origin develop
git worktree add ../bigban-article-daily-watch -b feat/article-daily-watch origin/develop
cd ../bigban-article-daily-watch
npm ci
```

- [ ] **Step 2: 既存テストが通ることを確認する**

Run: `npx vitest run scripts/analytics`
Expected: 既存の `articleMetrics` / `monitoring` / `query` / `ctaEvents` のテストがすべて PASS

---

### Task 1: 日付ユーティリティと日付窓、GA4 行の記事別集計

**Files:**
- Create: `scripts/analytics/articleWatch.mjs`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Consumes: `normalizeArticlePath(value)`, `isArticlePath(path)`（`articleMetrics.mjs`）
- Produces:
  - `addDays(iso: string, n: number): string`
  - `daysBetween(fromIso: string, toIso: string): number`
  - `computeWindows(today: string): { yesterday, sameWeekdayLastWeek, last7, prev7, fetch }`（各 `{ startDate, endDate }`）
  - `buildArticleWindows(rows: { landingPage: string, date: string, sessions: number }[], windows): Map<string, { yesterday, sameWeekdayLastWeek, last7, prev7 }>`（`date` は GA4 形式 `YYYYMMDD`）
  - `THRESHOLDS`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addDays, buildArticleWindows, computeWindows, daysBetween, THRESHOLDS } from "./articleWatch.mjs";

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
    expect(THRESHOLDS).toEqual({ g1MinPrev7: 30, g1Percent: 40, g2MinPrev: 20, g2Percent: 60, g3MinPrev7: 30, newArticleDays: 14, h2StaleDays: 14, maxArticles: 50 });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL（`articleWatch.mjs` が存在しない）

- [ ] **Step 3: 最小実装を書く**

```js
// 記事の日次ウォッチ(設計: docs/superpowers/specs/2026-09-14-article-daily-watch-design.md)の純ロジック。
// fetch を含む I/O は watchArticles.mjs に置き、ここは入力→出力の変換だけを持つ(テスト対象)。
import { isArticlePath, normalizeArticlePath } from "./articleMetrics.mjs";

/** 設計書 §3 の閾値。変えるときは設計書を先に直す。 */
export const THRESHOLDS = {
  g1MinPrev7: 30,
  g1Percent: 40,
  g2MinPrev: 20,
  g2Percent: 60,
  g3MinPrev7: 30,
  newArticleDays: 14,
  h2StaleDays: 14,
  maxArticles: 50,
};

const DAY_MS = 86_400_000;

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** JST の今日を起点に、判定に使う4窓と GA4 の取得窓(前7日の初日〜昨日)を作る。 */
export function computeWindows(today) {
  const yesterday = addDays(today, -1);
  const sameWeekday = addDays(today, -8);
  return {
    yesterday: { startDate: yesterday, endDate: yesterday },
    sameWeekdayLastWeek: { startDate: sameWeekday, endDate: sameWeekday },
    last7: { startDate: addDays(today, -7), endDate: yesterday },
    prev7: { startDate: addDays(today, -14), endDate: sameWeekday },
    fetch: { startDate: addDays(today, -14), endDate: yesterday },
  };
}

const inRange = (iso, range) => iso >= range.startDate && iso <= range.endDate;
const WINDOW_KEYS = ["yesterday", "sameWeekdayLastWeek", "last7", "prev7"];

/** GA4 の landingPage × date 行を、記事パスごとの4窓セッション数に畳む。 */
export function buildArticleWindows(rows, windows) {
  const result = new Map();
  for (const { landingPage, date, sessions } of rows) {
    const path = normalizeArticlePath(landingPage);
    if (!isArticlePath(path)) continue;
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const entry = result.get(path) ?? { yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 };
    for (const key of WINDOW_KEYS) if (inRange(iso, windows[key])) entry[key] += sessions;
    result.set(path, entry);
  }
  return result;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts
git commit -m "feat(analytics): 記事ウォッチの日付窓と GA4 記事別集計を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: G 判定（流入急変）

**Files:**
- Modify: `scripts/analytics/articleWatch.mjs`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Consumes: `THRESHOLDS`, `daysBetween`
- Produces: `detectEntryFlags(entry | null, publishedAt: string | null, today: string): Flag[]`。`Flag = { code: "G1"|"G2"|"G3", severity: "高"|"中", detail: object }`

- [ ] **Step 1: 失敗するテストを書く**（`articleWatch.test.ts` に追記）

```ts
import { detectEntryFlags } from "./articleWatch.mjs";

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
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL（`detectEntryFlags` が export されていない）

- [ ] **Step 3: 実装を追加する**（`articleWatch.mjs` 末尾）

```js
const pct = (cur, prev) => ((cur - prev) / prev) * 100;

/** 設計書 §3.1。公開14日未満は対象外。null の値を使う判定はその判定だけ飛ばす。 */
export function detectEntryFlags(entry, publishedAt, today) {
  if (!entry) return [];
  if (publishedAt && daysBetween(publishedAt, today) < THRESHOLDS.newArticleDays) return [];
  const flags = [];
  const { yesterday, sameWeekdayLastWeek, last7, prev7 } = entry;
  if (last7 !== null && prev7 !== null && prev7 >= THRESHOLDS.g3MinPrev7 && last7 === 0) {
    flags.push({ code: "G3", severity: "高", detail: { last7, prev7 } });
  } else if (last7 !== null && prev7 !== null && prev7 >= THRESHOLDS.g1MinPrev7 && Math.abs(pct(last7, prev7)) > THRESHOLDS.g1Percent) {
    flags.push({ code: "G1", severity: "中", detail: { last7, prev7, deltaPercent: Math.round(pct(last7, prev7)) } });
  }
  if (
    yesterday !== null && sameWeekdayLastWeek !== null &&
    sameWeekdayLastWeek >= THRESHOLDS.g2MinPrev && Math.abs(pct(yesterday, sameWeekdayLastWeek)) > THRESHOLDS.g2Percent
  ) {
    flags.push({ code: "G2", severity: "中", detail: { yesterday, sameWeekdayLastWeek, deltaPercent: Math.round(pct(yesterday, sameWeekdayLastWeek)) } });
  }
  return flags;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts
git commit -m "feat(analytics): 記事ウォッチの流入急変判定(G1〜G3)を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: sitemap 解析

**Files:**
- Modify: `scripts/analytics/articleWatch.mjs`
- Create: `scripts/analytics/fixtures/article-watch/sitemap.xml`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Produces: `extractArticleUrls(xml: string, origin: string): { paths: string[], overflow: string[] }`

- [ ] **Step 1: fixture を作る**

`scripts/analytics/fixtures/article-watch/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.test/</loc></url>
  <url><loc>https://example.test/columns</loc></url>
  <url><loc>https://example.test/news/</loc></url>
  <url><loc>https://example.test/columns/steady</loc></url>
  <url><loc>https://example.test/columns/spike/</loc></url>
  <url><loc>https://example.test/news/expired-event</loc></url>
  <url><loc>https://example.test/en/news/expired-event</loc></url>
  <url><loc>https://example.test/columns/steady</loc></url>
  <url><loc>https://other.test/columns/elsewhere</loc></url>
</urlset>
```

- [ ] **Step 2: 失敗するテストを書く**（`articleWatch.test.ts` に追記）

```ts
import { readFileSync } from "node:fs";
import { extractArticleUrls } from "./articleWatch.mjs";

describe("sitemap 解析", () => {
  const xml = readFileSync("scripts/analytics/fixtures/article-watch/sitemap.xml", "utf8");
  it("記事の詳細 URL だけを、末尾スラッシュを落とし重複を除いて拾う", () => {
    expect(extractArticleUrls(xml, "https://example.test")).toEqual({
      paths: ["/columns/steady", "/columns/spike", "/news/expired-event", "/en/news/expired-event"],
      overflow: [],
    });
  });
  it("上限50本を超えた分は overflow に分ける", () => {
    const many = Array.from({ length: 52 }, (_, i) => `<url><loc>https://example.test/columns/a${i}</loc></url>`).join("");
    const { paths, overflow } = extractArticleUrls(`<urlset>${many}</urlset>`, "https://example.test");
    expect(paths).toHaveLength(50);
    expect(overflow).toEqual(["/columns/a50", "/columns/a51"]);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL（`extractArticleUrls` が export されていない）

- [ ] **Step 4: 実装を追加する**

```js
const ARTICLE_URL = /^\/(?:en\/)?(?:columns|news)\/[^/]+$/;

/** sitemap から記事詳細のパスを拾う(一覧ページ・別オリジンは除外。上限は設計書 §4.2)。 */
export function extractArticleUrls(xml, origin) {
  const paths = [];
  for (const [, url] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    if (!url.startsWith(origin)) continue;
    const path = url.slice(origin.length).replace(/\/$/, "");
    if (ARTICLE_URL.test(path) && !paths.includes(path)) paths.push(path);
  }
  return { paths: paths.slice(0, THRESHOLDS.maxArticles), overflow: paths.slice(THRESHOLDS.maxArticles) };
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts scripts/analytics/fixtures/article-watch/sitemap.xml
git commit -m "feat(analytics): 記事ウォッチの sitemap 解析を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: HTML 解析（JSON-LD の日付と本文テキスト）

**Files:**
- Modify: `scripts/analytics/articleWatch.mjs`
- Create: `scripts/analytics/fixtures/article-watch/news-expired.html`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Produces: `parseArticleHtml(html: string): { datePublished: string | null, dateModified: string | null, mainText: string, scope: "main" | "article" | "body" }`（日付は JST の `YYYY-MM-DD`）

- [ ] **Step 1: fixture を作る**

`scripts/analytics/fixtures/article-watch/news-expired.html`（本番の構造に合わせ、サイト共通の JSON-LD の後に NewsArticle を置く。バナー文言は `<main>` の外）:

```html
<!doctype html><html lang="ja"><head><title>開催済みイベント</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"THE PICKLE BANG THEORY"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"開催済みイベント","datePublished":"2026-06-30T23:30:00.000Z","dateModified":"2026-06-30T23:30:00.000Z"}</script>
</head><body>
<div class="promo-banner">まもなく新キャンペーンを開始します</div>
<main><article>
<p class="lead">2026年8月23日(日)に開催します。参加受付中です。</p>
<p>プログラムの詳細は近日公開します。</p>
<script>window.__x = 1;</script>
</article></main>
<footer>© THE PICKLE BANG THEORY</footer>
</body></html>
```

- [ ] **Step 2: 失敗するテストを書く**（`articleWatch.test.ts` に追記）

```ts
import { parseArticleHtml } from "./articleWatch.mjs";

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
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL（`parseArticleHtml` が export されていない）

- [ ] **Step 4: 実装を追加する**

```js
const JST_OFFSET_MS = 9 * 3_600_000;

function toJstDate(value) {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function stripTags(fragment) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 設計書 §3.2・§7④。Article / NewsArticle の JSON-LD から日付を、<main>(無ければ <article>、無ければ body 全体)から本文を取る。 */
export function parseArticleHtml(html) {
  let datePublished = null;
  let dateModified = null;
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    if (data["@type"] === "Article" || data["@type"] === "NewsArticle") {
      datePublished = toJstDate(data.datePublished);
      dateModified = toJstDate(data.dateModified);
      break;
    }
  }
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/);
  const article = main ? null : html.match(/<article[\s>][\s\S]*?<\/article>/);
  const scope = main ? "main" : article ? "article" : "body";
  const mainText = stripTags((main ?? article)?.[0] ?? html);
  return { datePublished, dateModified, mainText, scope };
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts scripts/analytics/fixtures/article-watch/news-expired.html
git commit -m "feat(analytics): 記事ウォッチの HTML 解析(JSON-LD 日付・本文)を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: H 判定（期限切れ表現）と I 判定（死活）

**Files:**
- Modify: `scripts/analytics/articleWatch.mjs`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Consumes: `parseArticleHtml` の戻り値、`daysBetween`
- Produces:
  - `detectTextFlags(path: string, parsed | null, today: string): Flag[]`（`code: "H1"|"H2"`, `severity: "中"|"低"`）
  - `detectHttpFlag(http: { status, observed }): Flag | null`（`code: "I"`, `severity: "最優先"`。`observed === "error"` のときだけ）

- [ ] **Step 1: 失敗するテストを書く**（`articleWatch.test.ts` に追記）

```ts
import { detectHttpFlag, detectTextFlags } from "./articleWatch.mjs";

describe("H 判定(期限切れ表現)", () => {
  const today = "2026-09-14";
  const parsed = (mainText: string, dateModified: string | null = "2026-09-13") => ({ datePublished: "2026-08-01", dateModified, mainText, scope: "main" as const });
  it("H1: ニュースに受付中系の語があり、最も遅い開催日が昨日以前", () => {
    expect(detectTextFlags("/news/x", parsed("2026年8月22日(土)と2026年8月23日(日)に開催します。受付中"), today)).toEqual([
      { code: "H1", severity: "中", detail: { phrase: "受付中", eventDate: "2026-08-23" } },
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
  it("再試行後も 200 以外なら最優先、観測不能と 200 は付けない", () => {
    expect(detectHttpFlag({ status: 500, observed: "error" })).toEqual({ code: "I", severity: "最優先", detail: { status: 500 } });
    expect(detectHttpFlag({ status: null, observed: "unreachable" })).toBeNull();
    expect(detectHttpFlag({ status: 200, observed: "ok" })).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装を追加する**

```js
const H1_PHRASES = ["募集中", "受付中", "開催します", "開催予定"];
const H2_PHRASES = ["まもなく", "近日公開", "近日中", "追って"];
const NEWS_PATH = /^\/(?:en\/)?news\//;
const FULL_DATE = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;

/** 設計書 §3.2。H1 はニュースのみ。年のない日付は使わない。dateModified が無い H2 は判定しない。 */
export function detectTextFlags(path, parsed, today) {
  if (!parsed) return [];
  const flags = [];
  const text = parsed.mainText;
  if (NEWS_PATH.test(path)) {
    const phrase = H1_PHRASES.find((p) => text.includes(p));
    const dates = [...text.matchAll(FULL_DATE)].map(([, y, m, d]) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`).sort();
    const eventDate = dates.at(-1);
    if (phrase && eventDate && eventDate < today) flags.push({ code: "H1", severity: "中", detail: { phrase, eventDate } });
  }
  const pending = H2_PHRASES.find((p) => text.includes(p));
  if (pending && parsed.dateModified) {
    const daysSinceModified = daysBetween(parsed.dateModified, today);
    if (daysSinceModified > THRESHOLDS.h2StaleDays) {
      flags.push({ code: "H2", severity: "低", detail: { phrase: pending, dateModified: parsed.dateModified, daysSinceModified } });
    }
  }
  return flags;
}

/** 設計書 §3.3。再試行後も 200 以外が続いた場合だけ。接続不能(unreachable)は観測不能として付けない。 */
export function detectHttpFlag(http) {
  return http.observed === "error" ? { code: "I", severity: "最優先", detail: { status: http.status } } : null;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts
git commit -m "feat(analytics): 記事ウォッチの期限切れ表現(H)と死活(I)判定を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: レポート組み立てと整形

**Files:**
- Modify: `scripts/analytics/articleWatch.mjs`
- Test: `scripts/analytics/articleWatch.test.ts`

**Interfaces:**
- Produces:
  - `buildArticle({ path, entry, http, html, today })` → `{ path, locale, publishedAt, dateModified, entry, http, flags }`（`html` は取得した HTML 文字列または `null`）
  - `buildReport({ today, windows, sources, articles })` → `{ today, windows, sources, articles, alerts }`（`alerts` は深刻度順→パス順）
  - `formatReport(report): string`

- [ ] **Step 1: 失敗するテストを書く**（`articleWatch.test.ts` に追記）

```ts
import { buildArticle, buildReport, computeWindows, formatReport } from "./articleWatch.mjs";

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
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装を追加する**

```js
const SEVERITY_RANK = { 最優先: 0, 高: 1, 中: 2, 低: 3 };

/** 1記事ぶんの取得結果を判定込みの行にする。html が無い(取得失敗)記事は H を判定しない。 */
export function buildArticle({ path, entry, http, html, today }) {
  const parsed = html === null ? null : parseArticleHtml(html);
  const publishedAt = parsed?.datePublished ?? null;
  const flags = [
    ...detectEntryFlags(entry, publishedAt, today),
    ...detectTextFlags(path, parsed, today),
    ...[detectHttpFlag(http)].filter(Boolean),
  ];
  return { path, locale: path.startsWith("/en/") ? "en" : "ja", publishedAt, dateModified: parsed?.dateModified ?? null, entry, http, flags };
}

/** 設計書 §4.3 の出力。alerts は深刻度順(最優先→高→中→低)、同順位はパス順。 */
export function buildReport({ today, windows, sources, articles }) {
  const alerts = articles
    .flatMap((a) => a.flags.map((f) => ({ code: f.code, path: a.path, severity: f.severity, detail: f.detail })))
    .sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.path.localeCompare(y.path));
  return { today, windows, sources, articles, alerts };
}

/** 人が読む1行/項目の要約(--json なしのとき)。 */
export function formatReport(report) {
  const lines = [`# 記事ウォッチ ${report.today}`];
  for (const [name, source] of Object.entries(report.sources)) lines.push(`${name}: ${source.ok ? "ok" : `取得不可 (${source.error})`}`);
  if (report.alerts.length === 0) lines.push("alerts: なし");
  for (const a of report.alerts) lines.push(`${a.code}) ${a.path.replace(/^\//, "")} [${a.severity}] ${JSON.stringify(a.detail)}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/analytics/articleWatch.test.ts --coverage --coverage.include=scripts/analytics/articleWatch.mjs`
Expected: PASS、`articleWatch.mjs` の statements/branches/functions/lines が 100%。100% でなければ、未到達の分岐に対するテストをこの Task 内で足す（分岐を削らない）。

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleWatch.mjs scripts/analytics/articleWatch.test.ts
git commit -m "feat(analytics): 記事ウォッチのレポート組み立てと整形を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: CLI `watchArticles.mjs` と結線テスト

**Files:**
- Create: `scripts/analytics/watchArticles.mjs`
- Create: `scripts/analytics/fixtures/mockArticleWatch.mjs`
- Test: `scripts/analytics/watchArticles.test.ts`

**Interfaces:**
- Consumes: `computeWindows`, `buildArticleWindows`, `extractArticleUrls`, `buildArticle`, `buildReport`, `formatReport`（Task 1〜6）
- Produces: CLI `node scripts/analytics/watchArticles.mjs [--json] [--site <origin>] [--retry-wait-ms <n>]`。stdout に JSON（設計書 §4.3）またはテキスト。`sources` のいずれかが `ok:false` なら終了コード1。

- [ ] **Step 1: MSW サーバの fixture を作る**

`scripts/analytics/fixtures/mockArticleWatch.mjs`:

```js
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
```

- [ ] **Step 2: 失敗するテストを書く**

`scripts/analytics/watchArticles.test.ts`:

```ts
// @vitest-environment node
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "pbt-article-watch-cli-")));
  const destination = join(root, "scripts/analytics");
  await mkdir(destination, { recursive: true });
  for (const file of ["watchArticles.mjs", "articleWatch.mjs", "articleMetrics.mjs"]) {
    await copyFile(resolve("scripts/analytics", file), join(destination, file));
  }
});
afterAll(() => rm(root, { recursive: true, force: true }));

interface Alert { code: string; path: string; severity: string; detail: Record<string, unknown> }
interface Report {
  today: string;
  sources: { ga4: { ok: boolean; error: string | null }; sitemap: { ok: boolean; count: number; error: string | null }; html: { ok: boolean; fetched: number; error: string | null } };
  articles: { path: string; entry: Record<string, number | null> | null; http: { status: number | null; retried: boolean; observed: string } }[];
  alerts: Alert[];
}

function run(args: string[], failure = "") {
  return execute(
    process.execPath,
    ["--import", resolve("scripts/analytics/fixtures/mockArticleWatch.mjs"), join(root, "scripts/analytics/watchArticles.mjs"), "--site", "https://example.test", "--retry-wait-ms", "10", ...args],
    {
      timeout: 15000,
      env: { NODE_ENV: "test", PATH: process.env.PATH, GROWTH_GOOGLE_CLIENT_ID: "test", GROWTH_GOOGLE_CLIENT_SECRET: "test", GROWTH_GOOGLE_REFRESH_TOKEN: "test", GROWTH_GA4_PROPERTY_ID: "123", GROWTH_GSC_SITE_URL: "https://example.test", TEST_WATCH_FAILURE: failure },
    },
  );
}
const codes = (report: Report) => report.alerts.map((a) => `${a.code}:${a.path}`);

describe("記事ウォッチ CLI(実 API を叩かず MSW で再現)", () => {
  it("正常: G1・H1・H2 を検知し、全ソース ok で終了コード0", async () => {
    const { stdout } = await run(["--json"]);
    const report = JSON.parse(stdout) as Report;
    expect(report.sources).toEqual({ ga4: { ok: true, error: null }, sitemap: { ok: true, count: 4, error: null }, html: { ok: true, fetched: 4, error: null } });
    expect(codes(report)).toEqual(["G1:/columns/spike", "H1:/news/expired-event", "H2:/news/expired-event"]);
    expect(report.articles.find((a) => a.path === "/columns/spike")?.entry).toMatchObject({ last7: 140, prev7: 35 });
    expect(report.articles.every((a) => a.http.observed === "ok" && a.http.retried === false)).toBe(true);
  });
  it("テキスト出力は alerts を1行ずつ並べる", async () => {
    const { stdout } = await run([]);
    expect(stdout).toContain("# 記事ウォッチ ");
    expect(stdout).toContain("G1) columns/spike [中]");
  });
  it("GA4 失敗: entry は null、G は付かず、H は判定し、終了コード1", async () => {
    await expect(run(["--json"], "ga4")).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('"ga4":{"ok":false') });
    const { stdout } = await run(["--json"], "ga4").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.every((a) => a.entry === null)).toBe(true);
    expect(codes(report)).toEqual(["H1:/news/expired-event", "H2:/news/expired-event"]);
  });
  it("sitemap 失敗: 記事0件で終了コード1", async () => {
    const { stdout } = await run(["--json"], "sitemap").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.sources.sitemap).toMatchObject({ ok: false, count: 0 });
    expect(report.articles).toEqual([]);
  });
  it("記事 500 が再試行でも続く: I を最優先で先頭に置く", async () => {
    const { stdout } = await run(["--json"], "html500").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: 500, retried: true, observed: "error" });
    expect(codes(report)[0]).toBe("I:/columns/steady");
    expect(report.sources.html.ok).toBe(false);
  });
  it("500 → 200 で復帰: retried は true だが alert は付かない", async () => {
    const { stdout } = await run(["--json"], "html500-once");
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: 200, retried: true, observed: "ok" });
    expect(codes(report)).not.toContain("I:/columns/steady");
  });
  it("接続不能: 観測不能として I を付けず、html を取得不可にして終了コード1", async () => {
    const { stdout } = await run(["--json"], "html000").catch((e: { stdout: string }) => e);
    const report = JSON.parse(stdout) as Report;
    expect(report.articles.find((a) => a.path === "/columns/steady")?.http).toEqual({ status: null, retried: true, observed: "unreachable" });
    expect(codes(report)).not.toContain("I:/columns/steady");
    expect(report.sources.html).toMatchObject({ ok: false, error: expect.stringContaining("unreachable: /columns/steady") });
  });
  it("不正な引数は API を呼ぶ前に拒否する(同じオプションは後勝ち)", async () => {
    await expect(run(["--retry-wait-ms", "abc"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("--retry-wait-ms") });
    await expect(run(["--site", "https://example.test/path"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("--site") });
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/watchArticles.test.ts`
Expected: FAIL（`watchArticles.mjs` が存在しない）

- [ ] **Step 4: CLI を実装する**

`scripts/analytics/watchArticles.mjs`:

```js
// 記事の日次ウォッチ CLI(読み取り専用)。設計: docs/superpowers/specs/2026-09-14-article-daily-watch-design.md
// 使い方:
//   node scripts/analytics/watchArticles.mjs --json                 # 日次ウォッチ用(alerts を読む)
//   node scripts/analytics/watchArticles.mjs                        # 人が読む要約
//   オプション: --site <origin>(既定 https://www.thepicklebang.com) / --retry-wait-ms <n>(既定 30000)
// 取得は GA4(記事の入口セッション)・本番 sitemap・記事 HTML のみ。何にも書き込まない。
// sources のいずれかが取得不可なら JSON を出したうえで終了コード1(共通契約: 失敗を 0 にしない)。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildArticle, buildArticleWindows, buildReport, computeWindows, extractArticleUrls, formatReport } from "./articleWatch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SITE = "https://www.thepicklebang.com";
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;

function loadEnv() {
  // ローカルは .env.local を正、クラウド(ルーチン実行)は process.env(env secrets)へフォールバック。query.mjs と同じ。
  let fileEnv = {};
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    fileEnv = Object.fromEntries(
      text.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    // .env.local なし(クラウド実行)。
  }
  return { ...process.env, ...fileEnv };
}

function parseArgs(argv) {
  // 同じオプションが複数あれば後勝ち(テストが既定値の後ろに上書きを足せるようにする)。
  const json = argv.includes("--json");
  const siteIndex = argv.lastIndexOf("--site");
  const site = siteIndex >= 0 ? argv[siteIndex + 1] : DEFAULT_SITE;
  if (!/^https?:\/\/[^/]+$/.test(site ?? "")) throw new Error("--site はパスを含まないオリジン(例: https://www.thepicklebang.com)を指定してください");
  const waitIndex = argv.lastIndexOf("--retry-wait-ms");
  const retryWaitMs = waitIndex >= 0 ? Number(argv[waitIndex + 1]) : 30_000;
  if (!Number.isInteger(retryWaitMs) || retryWaitMs < 0) throw new Error("--retry-wait-ms は 0 以上の整数で指定してください");
  return { json, site, retryWaitMs };
}

/** JST の今日(YYYY-MM-DD)。query.mjs の nowInJst と同じ基準。 */
function todayInJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function accessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: env.GROWTH_GOOGLE_CLIENT_ID,
      client_secret: env.GROWTH_GOOGLE_CLIENT_SECRET,
      refresh_token: env.GROWTH_GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth 失敗: ${res.status}`);
  return (await res.json()).access_token;
}

/** GA4: 記事の入口セッションを日次で取る。失敗は null と理由で返す。 */
async function fetchEntryRows(env, windows) {
  try {
    const token = await accessToken(env);
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GROWTH_GA4_PROPERTY_ID}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        dateRanges: [windows.fetch],
        dimensions: [{ name: "landingPagePlusQueryString" }, { name: "date" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          orGroup: {
            expressions: [
              { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "CONTAINS", value: "/columns/" } } },
              { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "CONTAINS", value: "/news/" } } },
            ],
          },
        },
        limit: 10000,
      }),
    });
    if (!res.ok) return { rows: null, error: `GA4 HTTP ${res.status}` };
    const report = await res.json();
    const rows = (report.rows ?? []).map((r) => ({ landingPage: r.dimensionValues[0].value, date: r.dimensionValues[1].value, sessions: Number(r.metricValues[0].value) }));
    return { rows, error: null };
  } catch (e) {
    return { rows: null, error: `GA4 取得失敗: ${e.message}` };
  }
}

async function fetchSitemap(site) {
  try {
    const res = await fetch(`${site}/sitemap.xml`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { xml: null, error: `sitemap HTTP ${res.status}` };
    return { xml: await res.text(), error: null };
  } catch (e) {
    return { xml: null, error: `sitemap 取得失敗: ${e.message}` };
  }
}

/** 記事ページを取る。200 以外・接続不能は retryWaitMs 待って1回だけ再試行する(設計書 §4.2)。 */
async function fetchPage(url, retryWaitMs) {
  const attempt = async () => {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      return res.status === 200 ? { status: 200, observed: "ok", html: await res.text() } : { status: res.status, observed: "error", html: null };
    } catch {
      return { status: null, observed: "unreachable", html: null };
    }
  };
  let result = await attempt();
  let retried = false;
  if (result.observed !== "ok") {
    await new Promise((resolve) => setTimeout(resolve, retryWaitMs));
    result = await attempt();
    retried = true;
  }
  return { ...result, retried };
}

/** 並列数を抑えて順に取る(本番サイトへの同時接続を CONCURRENCY 本まで)。 */
async function fetchPages(site, paths, retryWaitMs) {
  const results = new Array(paths.length);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const index = next++;
      results[index] = await fetchPage(`${site}${paths[index]}`, retryWaitMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return results;
}

async function main() {
  const { json, site, retryWaitMs } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const today = todayInJst();
  const windows = computeWindows(today);

  const [ga4, sitemap] = await Promise.all([fetchEntryRows(env, windows), fetchSitemap(site)]);
  const entryMap = ga4.rows === null ? null : buildArticleWindows(ga4.rows, windows);
  const { paths, overflow } = sitemap.xml === null ? { paths: [], overflow: [] } : extractArticleUrls(sitemap.xml, site);

  const sitemapErrors = [sitemap.error, overflow.length ? `上限超過で未取得: ${overflow.join(", ")}` : null];
  if (entryMap) {
    const unlisted = [...entryMap.entries()].filter(([path, e]) => !paths.includes(path) && e.last7 + e.prev7 > 0).map(([path]) => path);
    if (unlisted.length) sitemapErrors.push(`GA4 にあり sitemap に無い記事: ${unlisted.join(", ")}`);
  }

  const pages = await fetchPages(site, paths, retryWaitMs);
  const htmlErrors = pages.flatMap((p, i) => (p.observed === "ok" ? [] : [`${p.observed}: ${paths[i]}`]));

  const articles = paths.map((path, i) =>
    buildArticle({
      path,
      entry: entryMap === null ? null : entryMap.get(path) ?? { yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 },
      http: { status: pages[i].status, retried: pages[i].retried, observed: pages[i].observed },
      html: pages[i].html,
      today,
    }),
  );

  const errorText = (list) => (list.filter(Boolean).length ? list.filter(Boolean).join(" / ") : null);
  const sources = {
    ga4: { ok: ga4.error === null, error: ga4.error },
    sitemap: { ok: sitemap.error === null && overflow.length === 0, count: paths.length, error: errorText(sitemapErrors) },
    html: { ok: htmlErrors.length === 0 && sitemap.error === null, fetched: pages.filter((p) => p.observed === "ok").length, error: errorText(htmlErrors) },
  };
  const report = buildReport({ today, windows, sources, articles });
  console.log(json ? JSON.stringify(report) : formatReport(report));
  if (!sources.ga4.ok || !sources.sitemap.ok || !sources.html.ok) process.exitCode = 1;
}

// import されても副作用が出ないよう、直接実行時のみ main() を走らせる(query.mjs と同じ)。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`記事ウォッチ失敗: ${e.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/watchArticles.test.ts`
Expected: PASS（8件）

補足: `sources.sitemap.error` に「GA4 にあり sitemap に無い記事」が入っても `sitemap.ok` は下げない（監視対象外の記事の存在は取得失敗ではないため）。正常ケースのテストで `sitemap.error` が `null` になるのは、mock の GA4 が `/reserve` 以外に sitemap 外の記事を返さないため。

- [ ] **Step 6: 全テストとカバレッジを確認する**

Run: `npm run test:coverage`
Expected: 全件 PASS、閾値 100% を満たす（`watchArticles.mjs` は子プロセス実行のため計測対象に現れない。現れて閾値を割る場合は、`vitest.config.ts` の coverage exclude と `docs/testing/growth-coverage-alternatives.json` に `query.mjs` と同じ扱いで追加し、`vitest.config.test.ts` が通ることを確認する）。

- [ ] **Step 7: コミット**

```bash
git add scripts/analytics/watchArticles.mjs scripts/analytics/watchArticles.test.ts scripts/analytics/fixtures/mockArticleWatch.mjs
git commit -m "feat(analytics): 記事ウォッチ CLI watchArticles.mjs を追加する

GA4 の記事別入口セッション・sitemap・記事 HTML を読み取り、G/H/I の
alerts を JSON で出す。取得失敗は null と sources.*.error で表し終了コード1。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: ドキュメント（日次ウォッチのプロンプト正本と関連文書）

**Files:**
- Modify: `docs/growth/routines/daily-watch.md`（「使えるもの」表、手順 3b、判定表、通知例、原則）
- Modify: `docs/growth/README.md:10`
- Modify: `docs/growth/analysis-contract.md`（「日次用の直接比較」の直後）
- Modify: `docs/superpowers/specs/2026-09-11-article-review-routine-design.md:130`

- [ ] **Step 1: `daily-watch.md` の「使えるもの」表に1行足す**

`| node scripts/analytics/query.mjs（GA4 / Search Console 読み取り専用） | 画像生成 CLI…` の行の直後に追加:

```markdown
| `node scripts/analytics/watchArticles.mjs --json`（GA4 の記事別入口・本番 sitemap・記事 HTML の読み取り専用） | 記事の改稿案・新規案の作成（週次の記事レビューの担当） |
```

- [ ] **Step 2: `daily-watch.md` に手順 3b を追加する**

「### 3. 本番トップの死活」の判定 F の説明の直後、「### 4. 判定案の48時間確定」の直前に挿入:

````markdown
### 3b. 記事ウォッチ（設計: `docs/superpowers/specs/2026-09-14-article-daily-watch-design.md`）

```bash
node scripts/analytics/watchArticles.mjs --json
```

`alerts` だけを読む。**`alerts` が空なら記事については何も書かない**（沈黙のまま）。終了コードが1でも JSON は出ているので捨てず、`sources` を読む。

- `sources.ga4.ok` が false → G は判定できない。「記事の入口セッションは取得不可（理由）」と明記し、H/I は通常どおり扱う。
- `sources.sitemap.ok` が false → 記事一覧が取れていない。「記事ウォッチは sitemap 取得不可のため未実施（理由）」と1行。
- `sources.html.ok` が false で `error` に `unreachable:` がある → その記事は**観測不能**。死活とは断定せず「接続できなかった」と書く。
- スクリプト自体が起動できない → 他の異常があればその通知の末尾に「記事ウォッチが実行できなかった（理由）」を1行。なければ3営業日続いた場合だけ1通。

判定（`alerts[].code` がそのまま記号。1つでもあれば通知）:

| # | 条件 | 深刻度 |
|---|---|---|
| G1 | 記事の直近7日の入口セッションが前7日比 ±40% 超（前7日が30以上の記事のみ） | 中 |
| G2 | 記事の昨日の入口セッションが前週同曜日比 ±60% 超（前週同曜日が20以上の記事のみ）。祝日と重なる週は「祝日ずれの可能性」を1行添える | 中 |
| G3 | 前7日が30以上あった記事の直近7日が 0 | 高。I の結果と突き合わせて書く |
| H1 | ニュースに「募集中／受付中／開催します／開催予定」があり、本文中で最も遅い開催日が昨日以前 | 中。開催済みイベントが受付中のまま |
| H2 | 本文に「まもなく／近日公開／近日中／追って」があり、最終更新から14日超 | 低 |
| I | 記事ページが 30秒後の再試行でも HTTP 200 以外 | 最優先。F が発火した日は「トップと同じ原因の可能性」として1行に畳む |

公開14日未満の記事は G の対象外（スクリプト側で除外済み）。H の同じ記事が連日載る場合も、文面を変えたり深刻度を上げたりしない（直るまで同じ1行）。
````

- [ ] **Step 3: `daily-watch.md` の通知例に記事の行を足す**

「### 異常検知時」の見出し構成の説明の直後に、次の例を追加:

````markdown
記事の項目は「■ 検知」に記号付きで並べる。記事1本につき1行、パスは `columns/hyrox-beginners-guide` の形。

```
⚠ 日次ウォッチ (9/14) — 記事2件の期限切れ表現

■ 検知
H1) news/picklerox-2026: 開催日 8/23 が過ぎているが「受付中」が残っている
H2) news/hyrox-osaka-early-access-simulation: 「近日公開」が残ったまま最終更新から16日

■ 数字
（G のときだけ: 直近7日 / 前7日 / 変化率 を記事ごとに1行）

■ 考えられる原因
（H は省略してよい。G は「記事公開・SNS投稿・大会の販売開始・計測変更」から最大3つ。断定しない）

■ 今すぐ確認してほしいこと
H) 該当記事の文言を更新するか、対話で「〇〇の期限切れ表現を直して」と依頼
G) 急減なら記事 URL を開いて表示を確認。急増なら要因を一次情報で確かめる
I) 記事 URL を開いて表示を確認
```
````

- [ ] **Step 4: `daily-watch.md` の「やってはいけないこと」に2行足す**

```markdown
- 記事ウォッチの結果から改稿案・新規記事案を書く（週次の記事レビューの担当。日次は「何が起きたか」と「確認先」まで）
- H の同じ記事が連日載るときに文面を変える・深刻度を上げる（直るまで同じ1行）
```

- [ ] **Step 5: `docs/growth/README.md` の日次ウォッチ行を更新する**

```markdown
| `routines/daily-watch.md` | 日次ウォッチ(毎朝 09:00・台帳取り込み後)のルーチンプロンプト正本。予約カウンタ・台帳・トップ死活に加え、**記事の流入急変・期限切れ表現・記事ページ死活**(`watchArticles.mjs`)を見る。**異常時のみ通知(沈黙が正常)** |
```

- [ ] **Step 6: `docs/growth/analysis-contract.md` に段落を足す**

「## 日次用の直接比較」の節の末尾（「## 台帳の取得範囲」の直前）に追加:

```markdown
## 記事の日次監視

`node scripts/analytics/watchArticles.mjs --json` の `alerts` を読む。判定の閾値と条件（G1〜G3 の下限値、H1/H2 の語と日数、I の再試行）は `docs/superpowers/specs/2026-09-14-article-daily-watch-design.md` §3 を正典とし、プロンプト側で緩めたり厳しくしたりしない。`sources.*.ok` が false の項目は取得不可であり、当該判定は保留する（0 と読まない）。`unreachable` は観測不能で、死活と断定しない。記事の改稿判定・新規ネタは週次の記事レビュー（`2026-09-11-article-review-routine-design.md`）の担当で、日次では扱わない。
```

- [ ] **Step 7: 9/11 設計書 §3.5 に1行足す**

`| stale_date_text | 本文に「◯月◯日時点」形の表記があり、その日付が28日超前 |` の行の直後に追加:

```markdown

期限切れ表現（開催済みイベントの「受付中」、更新から14日超の「まもなく／近日公開」）は**日次ウォッチが担当**する（`2026-09-14-article-daily-watch-design.md` §3.2 の H1/H2）。本ルーチンでは重ねて検知しない。
```

- [ ] **Step 8: 文書の整合を確認する**

Run: `grep -n "watchArticles" docs/growth/routines/daily-watch.md docs/growth/README.md docs/growth/analysis-contract.md && grep -n "H1/H2" docs/superpowers/specs/2026-09-11-article-review-routine-design.md`
Expected: 4ファイルすべてにヒットする

- [ ] **Step 9: コミット**

```bash
git add docs/growth/routines/daily-watch.md docs/growth/README.md docs/growth/analysis-contract.md docs/superpowers/specs/2026-09-11-article-review-routine-design.md
git commit -m "docs: 日次ウォッチに記事の急変・期限切れ・死活の手順 3b を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 初回の手動実行、初期発火の処置、オーナー確認後の push

**Files:** なし（本番の読み取りのみ。記事の修正はこの Task では行わない）

- [ ] **Step 1: 本番に対して手動実行する**（`.env.local` を読む。ローカルのみ）

Run: `node scripts/analytics/watchArticles.mjs`
Expected: `ga4: ok` / `sitemap: ok` / `html: ok`。`alerts` に初期発火が並ぶ。想定は H1 の開催済み告知（`news/picklerox-2026`、`news/ppt-vol4-kuroburudon-2026`、`news/ppt-vol3-natsumatsuri-2026`、`news/early-morning-pickleball-dupr35`、`news/medalist-morning-free-campaign` のうち本文に「YYYY年M月D日」形の開催日と受付中系の語を持つもの）と、H2 の「近日公開」（`news/hyrox-osaka-early-access-simulation`、最終更新 9/13 なので**9/28 以降**に発火）。

- [ ] **Step 2: 初期発火の一覧をオーナーに提示し、処置を決めてもらう**

各 H1 について「本文を『開催しました／受付を終了しました』に更新する」か「対象外にする（受付中系の語を消す）」かを、オーナーが1件ずつ決める。**この Task では記事を編集しない**（編集は対話の記事運用フローで、下書き→確認→公開）。決まるまで日次ウォッチには載せない（Step 4 を待つ）。

- [ ] **Step 3: 実行時間と G の初期値を記録する**

Run: `time node scripts/analytics/watchArticles.mjs --json > /tmp/article-watch.json && node -e 'const r=require("/tmp/article-watch.json");console.log(r.alerts.filter(a=>a.code.startsWith("G")))'`
Expected: 1分以内。G の発火があれば、直近の公開・SNS・販売開始で説明できるかを対話で確認し、説明できない誤検知があれば閾値ではなく除外条件（公開14日未満）の見直し候補として設計書に追記する。

- [ ] **Step 4: オーナーの動作確認後に push と draft PR**

オーナーが Step 1〜3 の結果を確認し「載せてよい」と言ってから:

```bash
gh auth status   # active account が ttmakhr1028ai-art であること。違えば gh auth switch --user ttmakhr1028ai-art
git push -u origin feat/article-daily-watch
gh pr create --draft --base develop --title "feat(analytics): 日次ウォッチに記事の急変・期限切れ・死活の検知を追加する" --body "$(cat <<'EOF'
## 変更
- `scripts/analytics/articleWatch.mjs` / `watchArticles.mjs`: 記事の流入急変(G1〜G3)・期限切れ表現(H1/H2)・記事ページ死活(I)を JSON で出す読み取り専用 CLI
- `docs/growth/routines/daily-watch.md`: 手順 3b と判定 G/H/I、通知例、原則2行
- 関連文書(README / analysis-contract / 9/11 設計書)の追記

設計: docs/superpowers/specs/2026-09-14-article-daily-watch-design.md

## テスト
- 純関数: fixtures で全分岐、カバレッジ100%
- CLI: MSW で 正常 / GA4失敗 / sitemap失敗 / 500継続 / 500→200 / 接続不能 / 引数エラー
- 本番に対する手動実行(読み取りのみ)で alerts を確認済み

## 公開後
- 初回2週間は対話での確認と突き合わせ(設計書 §6.2)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: 並走の開始を記録する**

マージ後の翌営業日から2週間、日次ウォッチの通知と対話での確認を突き合わせる。差分は `docs/growth/playbook.md` ではなく、設計書 §6.2 の終了条件に照らして対話で扱う（判定確定時のみ playbook に1行）。

---

## 自己レビュー（計画作成時に実施済み）

- **仕様カバレッジ**: §3.1 G1〜G3・公開14日未満の除外 → Task 2。§3.2 H1/H2・`<main>` 限定・年なし日付の無視・`dateModified` なしの扱い → Task 4・5。§3.3 I・再試行・観測不能の区別 → Task 5・7。§4.1〜4.4 ファイル・取得・出力 JSON・純関数の契約 → Task 1〜7。§5 手順 3b・通知文・原則・文書更新 → Task 8。§6 テスト・並走 → Task 1〜7 のテストと Task 9。§7 前提（JSON-LD の日付・sitemap・`<main>`）→ 計画作成時に本番で確認済み（Article/NewsArticle とも `datePublished`/`dateModified` あり、sitemap 22本、`<main>` あり）。
- **既知の制限（設計どおり）**: H1 は本文中の最も遅い「YYYY年M月D日」を開催日とみなすため、告知に将来の別日付（例: 大阪2027 の日程）が含まれると開催済みでも発火しない。週次の記事レビューで補う。sitemap に `/en/columns/` が無いため（2026-09-14 時点）、EN コラムは監視対象外で `sources.sitemap.error` に「GA4 にあり sitemap に無い記事」として列挙される。
- **プレースホルダ**: なし。
- **型の一貫性**: `Flag = { code, severity, detail }`、`entry = { yesterday, sameWeekdayLastWeek, last7, prev7 }`、`http = { status, retried, observed }`、`sources = { ga4, sitemap, html }` を全 Task で同じ名前で使用。
