# 記事レビュールーチン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-11-article-review-routine-design.md`

**Goal:** 公開済みコラム・ニュースの成績を決定的に集計するスクリプト（JSON/Markdown 出力）と、それを読んで改稿候補・新規ネタを Notion に置く週次ローカルルーチンを作る。

**Architecture:** 純関数モジュール `scripts/analytics/articleReview.mjs`（GA4/GSC/HTML の生行 → 記事プロファイル・判定ヒント・需要ギャップ）と、I/O だけを持つ CLI `scripts/analytics/reviewArticles.mjs`（`query.mjs` と同じ作法）に分ける。ルーチンはプロンプト正本 `docs/growth/routines/article-review.md` とローカルタスクのポインタで構成し、AI は JSON を読んで SERP 確認・Notion 書き込みだけを行う。スクリプトは何にも書き込まない。

**Tech Stack:** Node 24（ESM `.mjs`）、Vitest 4 + MSW（既存構成）、GA4 Data API v1beta、Search Console API v3、Notion MCP（ルーチン側）、ローカル scheduled-tasks（cron 式）。

## Global Constraints

- `strict` な TypeScript は対象外（既存の `scripts/analytics/*.mjs` と同じく ESM JavaScript。テストは `.test.ts`）。`any` は使わない。
- テストは **実装より先に書く**（CLAUDE.md の TDD）。カバレッジ閾値は statements/branches/functions/lines とも **100%**（`vitest.config.ts`）。CLI ファイルは子プロセスで実行するため計測対象外（`query.mjs` と同じ）。
- 実 API・実サイト・実 `.env.local` をテストで読まない。MSW で遮断する（`scripts/analytics/query.test.ts` と同じ方式）。
- スクリプトは **読み取りのみ**。書き込み先はローカルの `out/article-review/`（`.gitignore` 済み）だけ。
- 指名判定は `articleMetrics.mjs` の `isBrandQuery` を再利用し、二重実装しない。
- 取得失敗は `null` と `meta.errors` で表し、**0 で埋めない**（`docs/growth/analysis-contract.md`）。
- コミットメッセージは日本語の Conventional Commits（`feat(analytics): …` / `test(analytics): …` / `docs: …`）。末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- push は AI アカウント `ttmakhr1028ai-art` で行う（CLAUDE.md）。本計画では push・PR 作成は Task 10 で1回だけ。
- 作業ブランチ: `feat/article-review-routine`（`develop` から作る）。

---

## ファイル構成

| ファイル | 責務 | 作成/変更 |
|---|---|---|
| `scripts/analytics/articleReview.mjs` | 純関数。日付・週次集計、チャネル/地域/CTA の要約、GSC クエリの畳み込み、HTML メタ抽出、判定ヒント・フラグ、需要ギャップ、プロファイル組み立て、Markdown 整形 | 作成 |
| `scripts/analytics/articleReview.test.ts` | 上記の単体テスト（全分岐） | 作成 |
| `scripts/analytics/fixtures/article-review/sample.json` | プロファイル組み立てテスト用の入力（記事3本分の生行） | 作成 |
| `scripts/analytics/fixtures/mockArticleReview.mjs` | CLI 結線テスト用の MSW サーバ（OAuth・GA4・GSC・サイト HTML・microCMS） | 作成 |
| `scripts/analytics/reviewArticles.mjs` | CLI。env 読み込み・OAuth・各取得（失敗は `null`）・純関数呼び出し・`out/` へ書き出し・終了コード | 作成 |
| `scripts/analytics/reviewArticles.test.ts` | CLI 結線テスト（正常 / GSC 失敗 / microCMS キー無し / 記事0件） | 作成 |
| `docs/growth/routines/article-review.md` | ルーチンのプロンプト正本 | 作成 |
| `~/.claude/scheduled-tasks/article-review/SKILL.md` | 正本へのポインタ（`create_scheduled_task` で登録。リポジトリ外） | 作成 |
| `docs/growth/routines/weekly-driver.md` | Step R に「R1b. 記事レビューの収穫」を追加 | 変更 |
| `docs/operations/interactive-analysis-runbook.md` | ⑥⑦ にルーチンへの参照を1行追加 | 変更 |
| `docs/growth/README.md` | 表に `routines/article-review.md` の行を追加 | 変更 |
| `.env.example` | `GROWTH_MICROCMS_PROD_DOMAIN` / `GROWTH_MICROCMS_PROD_READ_KEY` を追記（値は書かない） | 変更 |

純関数モジュールは1ファイル（約400行見込み）。800行を超えそうなら `articleReviewHtml.mjs`（HTML 抽出）を分割する判断を Task 4 で行う。

---

### Task 0: ブランチ作成

**Files:** なし

- [ ] **Step 1: develop から作業ブランチを切る**

```bash
git fetch origin develop
git switch -c feat/article-review-routine origin/develop
```

Expected: `Switched to a new branch 'feat/article-review-routine'`

- [ ] **Step 2: 既存テストが通ることを確認する**

Run: `npx vitest run scripts/analytics`
Expected: 全件 PASS（`query.test.ts` 4件を含む）

---

### Task 1: 日付・窓・週次入口セッション（純関数）

**Files:**
- Create: `scripts/analytics/articleReview.mjs`
- Test: `scripts/analytics/articleReview.test.ts`

**Interfaces:**
- Consumes: `articleMetrics.mjs` の `normalizeArticlePath(value)`, `isArticlePath(path)`
- Produces:
  - `jstToday(now = Date.now()): string` — `"YYYY-MM-DD"`（JST）
  - `shiftDate(date: string, days: number): string`
  - `weekStart(date: string): string` — 月曜始まり
  - `ga4DateToIso(d: string): string` — `"20260910"` → `"2026-09-10"`
  - `buildWindows(today: string): { ga4: { daily, cur, prev }, gsc: { cur, daily } }`（各要素は `{ startDate, endDate }`）
  - `articleLocale(path): "ja" | "en"`, `articleSlug(path): string`
  - `buildWeeklyEntry(dailyRows: {date, path, sessions}[], endDate: string, weeks = 8): Map<path, {weekStart, sessions}[]>`
  - `sumSessionsBetween(dailyRows, path, startDate, endDate): number`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  articleLocale,
  articleSlug,
  buildWeeklyEntry,
  buildWindows,
  ga4DateToIso,
  jstToday,
  shiftDate,
  sumSessionsBetween,
  weekStart,
} from "./articleReview.mjs";

describe("日付ユーティリティ", () => {
  it("jstToday は UTC の日付ではなく JST の日付を返す", () => {
    // 2026-09-10T20:00Z = 2026-09-11T05:00 JST
    expect(jstToday(Date.UTC(2026, 8, 10, 20, 0, 0))).toBe("2026-09-11");
  });
  it("shiftDate は月をまたいで日付をずらす", () => {
    expect(shiftDate("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDate("2026-09-01", 2)).toBe("2026-09-03");
  });
  it("weekStart は月曜始まりの週頭を返す(日曜も同じ週)", () => {
    expect(weekStart("2026-09-10")).toBe("2026-09-07"); // 木
    expect(weekStart("2026-09-13")).toBe("2026-09-07"); // 日
    expect(weekStart("2026-09-07")).toBe("2026-09-07"); // 月
  });
  it("ga4DateToIso は YYYYMMDD を ISO 日付にする", () => {
    expect(ga4DateToIso("20260910")).toBe("2026-09-10");
  });
  it("buildWindows は GA4 を前日まで、GSC を2日前までにする", () => {
    const w = buildWindows("2026-09-11");
    expect(w.ga4.cur).toEqual({ startDate: "2026-08-14", endDate: "2026-09-10" });
    expect(w.ga4.prev).toEqual({ startDate: "2026-07-17", endDate: "2026-08-13" });
    expect(w.ga4.daily).toEqual({ startDate: "2026-07-17", endDate: "2026-09-10" });
    expect(w.gsc.cur).toEqual({ startDate: "2026-08-13", endDate: "2026-09-09" });
    expect(w.gsc.daily).toEqual({ startDate: "2026-07-16", endDate: "2026-09-09" });
  });
});

describe("記事パスの属性", () => {
  it("locale と slug を取り出す", () => {
    expect(articleLocale("/en/columns/hyrox-cost-guide")).toBe("en");
    expect(articleLocale("/columns/hyrox-cost-guide")).toBe("ja");
    expect(articleSlug("/en/news/pbt-club-membership")).toBe("pbt-club-membership");
  });
});

describe("buildWeeklyEntry", () => {
  const rows = [
    { date: "2026-09-10", path: "/columns/a", sessions: 3 },
    { date: "2026-09-08", path: "/columns/a", sessions: 2 },
    { date: "2026-09-01", path: "/columns/a", sessions: 5 },
    { date: "2026-09-01", path: "/columns/a?draftKey=x", sessions: 1 }, // 正規化で合算
    { date: "2026-09-01", path: "/reserve", sessions: 100 }, // 記事以外は捨てる
  ];
  it("終端週から遡って固定本数の週を返し、無い週は 0 にする", () => {
    const weekly = buildWeeklyEntry(rows, "2026-09-10", 3);
    expect(weekly.get("/columns/a")).toEqual([
      { weekStart: "2026-08-24", sessions: 0 },
      { weekStart: "2026-08-31", sessions: 6 },
      { weekStart: "2026-09-07", sessions: 5 },
    ]);
    expect(weekly.has("/reserve")).toBe(false);
  });
  it("sumSessionsBetween は両端を含む日付範囲で合算する", () => {
    expect(sumSessionsBetween(rows, "/columns/a", "2026-09-04", "2026-09-10")).toBe(5);
    expect(sumSessionsBetween(rows, "/columns/a", "2026-08-28", "2026-09-03")).toBe(6);
    expect(sumSessionsBetween(rows, "/columns/zzz", "2026-08-28", "2026-09-03")).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`Cannot find module './articleReview.mjs'`）

- [ ] **Step 3: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs
// 記事レビュー(週次ルーチン)の純ロジック。I/O は reviewArticles.mjs に置く。
// 設計: docs/superpowers/specs/2026-09-11-article-review-routine-design.md §3
import { isArticlePath, isBrandQuery, normalizeArticlePath } from "./articleMetrics.mjs";

const JST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400 * 1000;

export function jstToday(now = Date.now()) {
  return new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 月曜始まりの週頭。 */
export function weekStart(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return shiftDate(date, -offset);
}

export function ga4DateToIso(d) {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** GA4 は前日まで、GSC は確定分(2日前)まで。共通契約の「窓を別々に記す」を満たす。 */
export function buildWindows(today) {
  const range = (from, to) => ({ startDate: shiftDate(today, from), endDate: shiftDate(today, to) });
  return {
    ga4: { daily: range(-56, -1), cur: range(-28, -1), prev: range(-56, -29) },
    gsc: { cur: range(-29, -2), daily: range(-57, -2) },
  };
}

export function articleLocale(path) {
  return path.startsWith("/en/") ? "en" : "ja";
}

export function articleSlug(path) {
  return path.split("/").pop();
}

/** 日次行を記事パスごとに正規化して集める。記事以外は捨てる。 */
function dailyByArticle(dailyRows) {
  const result = new Map();
  for (const row of dailyRows) {
    const path = normalizeArticlePath(row.path);
    if (!isArticlePath(path)) continue;
    const list = result.get(path) ?? [];
    list.push({ date: row.date, sessions: row.sessions });
    result.set(path, list);
  }
  return result;
}

export function buildWeeklyEntry(dailyRows, endDate, weeks = 8) {
  const lastWeek = weekStart(endDate);
  const starts = Array.from({ length: weeks }, (_, i) => shiftDate(lastWeek, -7 * (weeks - 1 - i)));
  const result = new Map();
  for (const [path, list] of dailyByArticle(dailyRows)) {
    const byWeek = new Map(starts.map((s) => [s, 0]));
    for (const { date, sessions } of list) {
      const w = weekStart(date);
      if (byWeek.has(w)) byWeek.set(w, byWeek.get(w) + sessions);
    }
    result.set(path, starts.map((s) => ({ weekStart: s, sessions: byWeek.get(s) })));
  }
  return result;
}

export function sumSessionsBetween(dailyRows, path, startDate, endDate) {
  let total = 0;
  for (const row of dailyRows) {
    if (normalizeArticlePath(row.path) !== path) continue;
    if (row.date >= startDate && row.date <= endDate) total += row.sessions;
  }
  return total;
}

export { DAY_MS, isBrandQuery };
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts
git commit -m "feat(analytics): 記事レビューの日付窓と週次入口集計を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: チャネル・検索エンジン・地域・PV・CTA の要約（純関数）

**Files:**
- Modify: `scripts/analytics/articleReview.mjs`（末尾に追記）
- Test: `scripts/analytics/articleReview.test.ts`（追記）

**Interfaces:**
- Produces:
  - `summarizeChannels(rows: {path, channel, sessions, engagedSessions, durationTotal}[]): Map<path, { entry, engagedRate, avgDurationSec, channels: {organicSearch, direct, social, referral, other} }>`（`durationTotal` = 平均セッション時間×セッション数を CLI 側で掛けて渡す）
  - `summarizeSources(rows: {path, source, sessions}[]): Map<path, { yahooShare: number|null, total }>`
  - `summarizeRegions(rows: {path, region, sessions}[]): Map<path, { chibaShare, tokyoShare, top3: {region, sessions}[] }>`
  - `summarizePageViews(rows: {path, pv, users, engagementSeconds}[]): Map<path, { pv, users, engSecPerUser }>`
  - `summarizeCta(rows: {path, event, location, count}[], pvByPath: Map): Map<path, { count, per100pv: number|null, byLocation: Record<string, number> }>`
  - `ARTICLE_EVENTS: string[]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts に追記
import {
  ARTICLE_EVENTS,
  summarizeChannels,
  summarizeCta,
  summarizePageViews,
  summarizeRegions,
  summarizeSources,
} from "./articleReview.mjs";

describe("要約(28日)", () => {
  it("summarizeChannels は入口合計・エンゲージ率・平均滞在・チャネル内訳を返す", () => {
    const m = summarizeChannels([
      { path: "/columns/a", channel: "Organic Search", sessions: 80, engagedSessions: 60, durationTotal: 8000 },
      { path: "/columns/a?x=1", channel: "Direct", sessions: 10, engagedSessions: 2, durationTotal: 100 },
      { path: "/columns/a", channel: "Organic Social", sessions: 5, engagedSessions: 5, durationTotal: 500 },
      { path: "/columns/a", channel: "Referral", sessions: 4, engagedSessions: 1, durationTotal: 40 },
      { path: "/columns/a", channel: "AI Assistant", sessions: 1, engagedSessions: 1, durationTotal: 10 },
      { path: "/", channel: "Direct", sessions: 999, engagedSessions: 1, durationTotal: 1 },
    ]);
    expect(m.get("/columns/a")).toEqual({
      entry: 100,
      engagedRate: 0.69,
      avgDurationSec: 86.5,
      channels: { organicSearch: 80, direct: 10, social: 5, referral: 4, other: 1 },
    });
    expect(m.has("/")).toBe(false);
  });
  it("summarizeSources は Organic のうち yahoo の割合を返し、0件なら null", () => {
    const m = summarizeSources([
      { path: "/columns/a", source: "google", sessions: 75 },
      { path: "/columns/a", source: "yahoo", sessions: 25 },
      { path: "/columns/b", source: "google", sessions: 0 },
    ]);
    expect(m.get("/columns/a")).toEqual({ yahooShare: 0.25, total: 100 });
    expect(m.get("/columns/b")).toEqual({ yahooShare: null, total: 0 });
  });
  it("summarizeRegions は千葉・東京の比率と上位3地域を返す", () => {
    const m = summarizeRegions([
      { path: "/columns/a", region: "Tokyo", sessions: 50 },
      { path: "/columns/a", region: "Chiba", sessions: 30 },
      { path: "/columns/a", region: "Osaka", sessions: 15 },
      { path: "/columns/a", region: "Hokkaido", sessions: 5 },
    ]);
    expect(m.get("/columns/a")).toEqual({
      chibaShare: 0.3,
      tokyoShare: 0.5,
      top3: [
        { region: "Tokyo", sessions: 50 },
        { region: "Chiba", sessions: 30 },
        { region: "Osaka", sessions: 15 },
      ],
    });
  });
  it("summarizePageViews はユーザーあたりのエンゲージ秒を返す(0ユーザーは0)", () => {
    const m = summarizePageViews([
      { path: "/columns/a", pv: 200, users: 100, engagementSeconds: 5000 },
      { path: "/columns/b", pv: 0, users: 0, engagementSeconds: 0 },
    ]);
    expect(m.get("/columns/a")).toEqual({ pv: 200, users: 100, engSecPerUser: 50 });
    expect(m.get("/columns/b")).toEqual({ pv: 0, users: 0, engSecPerUser: 0 });
  });
  it("summarizeCta は 100PV あたりの回数と設置箇所別を返し、PV 0 なら null", () => {
    const pv = new Map([["/columns/a", { pv: 200 }]]);
    const m = summarizeCta(
      [
        { path: "/columns/a", event: "external_link_click", location: "article_body_cta", count: 30 },
        { path: "/columns/a", event: "reserve_entry_click", location: "article_body_cta", count: 10 },
        { path: "/columns/a", event: "reserve_entry_click", location: "home_nav_mobile", count: 4 },
        { path: "/columns/b", event: "content_click", location: "promo_banner", count: 1 },
      ],
      pv,
    );
    expect(m.get("/columns/a")).toEqual({
      count: 44,
      per100pv: 22,
      byLocation: {
        "external_link_click[article_body_cta]": 30,
        "reserve_entry_click[article_body_cta]": 10,
        "reserve_entry_click[home_nav_mobile]": 4,
      },
    });
    expect(m.get("/columns/b")).toEqual({ count: 1, per100pv: null, byLocation: { "content_click[promo_banner]": 1 } });
  });
  it("ARTICLE_EVENTS は記事内で数える5イベントを固定する", () => {
    expect(ARTICLE_EVENTS).toEqual([
      "reservation_click",
      "reserve_entry_click",
      "external_link_click",
      "instagram_click",
      "content_click",
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`summarizeChannels is not a function` 等）

- [ ] **Step 3: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs に追記

export const ARTICLE_EVENTS = [
  "reservation_click",
  "reserve_entry_click",
  "external_link_click",
  "instagram_click",
  "content_click",
];

const CHANNEL_KEYS = {
  "Organic Search": "organicSearch",
  Direct: "direct",
  "Organic Social": "social",
  Referral: "referral",
};

/** 記事以外のパスを捨て、正規化済みパスで Map にまとめる共通処理。 */
function groupByArticle(rows, init, add) {
  const result = new Map();
  for (const row of rows) {
    const path = normalizeArticlePath(row.path);
    if (!isArticlePath(path)) continue;
    const acc = result.get(path) ?? init();
    add(acc, row);
    result.set(path, acc);
  }
  return result;
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

export function summarizeChannels(rows) {
  const grouped = groupByArticle(
    rows,
    () => ({ entry: 0, engaged: 0, duration: 0, channels: { organicSearch: 0, direct: 0, social: 0, referral: 0, other: 0 } }),
    (acc, row) => {
      acc.entry += row.sessions;
      acc.engaged += row.engagedSessions;
      acc.duration += row.durationTotal;
      acc.channels[CHANNEL_KEYS[row.channel] ?? "other"] += row.sessions;
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    result.set(path, {
      entry: acc.entry,
      engagedRate: acc.entry > 0 ? round(acc.engaged / acc.entry, 2) : null,
      avgDurationSec: acc.entry > 0 ? round(acc.duration / acc.entry, 1) : null,
      channels: acc.channels,
    });
  }
  return result;
}

export function summarizeSources(rows) {
  const grouped = groupByArticle(
    rows,
    () => ({ total: 0, yahoo: 0 }),
    (acc, row) => {
      acc.total += row.sessions;
      if (row.source === "yahoo") acc.yahoo += row.sessions;
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    result.set(path, { yahooShare: acc.total > 0 ? round(acc.yahoo / acc.total, 2) : null, total: acc.total });
  }
  return result;
}

export function summarizeRegions(rows) {
  const grouped = groupByArticle(
    rows,
    () => ({ total: 0, byRegion: new Map() }),
    (acc, row) => {
      acc.total += row.sessions;
      acc.byRegion.set(row.region, (acc.byRegion.get(row.region) ?? 0) + row.sessions);
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    const share = (region) => (acc.total > 0 ? round((acc.byRegion.get(region) ?? 0) / acc.total, 2) : null);
    const top3 = [...acc.byRegion]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([region, sessions]) => ({ region, sessions }));
    result.set(path, { chibaShare: share("Chiba"), tokyoShare: share("Tokyo"), top3 });
  }
  return result;
}

export function summarizePageViews(rows) {
  const grouped = groupByArticle(
    rows,
    () => ({ pv: 0, users: 0, seconds: 0 }),
    (acc, row) => {
      acc.pv += row.pv;
      acc.users += row.users;
      acc.seconds += row.engagementSeconds;
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    result.set(path, { pv: acc.pv, users: acc.users, engSecPerUser: acc.users > 0 ? round(acc.seconds / acc.users, 0) : 0 });
  }
  return result;
}

export function summarizeCta(rows, pvByPath) {
  const grouped = groupByArticle(
    rows,
    () => ({ count: 0, byLocation: {} }),
    (acc, row) => {
      const key = `${row.event}[${row.location}]`;
      acc.count += row.count;
      acc.byLocation[key] = (acc.byLocation[key] ?? 0) + row.count;
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    const pv = pvByPath.get(path)?.pv ?? 0;
    result.set(path, { count: acc.count, per100pv: pv > 0 ? round((acc.count / pv) * 100, 1) : null, byLocation: acc.byLocation });
  }
  return result;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（16件）

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts
git commit -m "feat(analytics): 記事のチャネル・地域・CTA を28日窓で要約する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: GSC クエリの畳み込み・週次推移・需要ギャップ（純関数）

**Files:**
- Modify: `scripts/analytics/articleReview.mjs`（末尾に追記）
- Test: `scripts/analytics/articleReview.test.ts`（追記）

**Interfaces:**
- Consumes: `isBrandQuery`（`articleMetrics.mjs`）
- Produces:
  - `collectPageQueries(rows: {page, query, impressions, clicks, position}[], topN = 15): Map<path, { impressions, clicks, ctr: number|null, position: number|null, brandImpressions, queries: {query, impressions, clicks, ctr, position}[] }>`
  - `buildWeeklyGsc(rows: {page, date: "YYYY-MM-DD", impressions, clicks, position}[], endDate, weeks = 8): Map<path, {weekStart, impressions, clicks, position: number|null}[]>`
  - `findDemandGaps(queryRows: {query, impressions, clicks, position}[], pageQueryRows, { minImpressions = 30, maxPosition = 8 } = {}): { query, impressions, clicks, position, bestPage: string|null, bestPagePosition: number|null }[]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts に追記
import { buildWeeklyGsc, collectPageQueries, findDemandGaps } from "./articleReview.mjs";

describe("GSC の畳み込み", () => {
  const site = "https://www.thepicklebang.com";
  it("collectPageQueries は指名を除いて表示・クリック・加重順位と上位クエリを返す", () => {
    const m = collectPageQueries(
      [
        { page: `${site}/columns/a`, query: "ハイロックス 参加費", impressions: 400, clicks: 12, position: 5 },
        { page: `${site}/columns/a`, query: "hyrox 参加費", impressions: 100, clicks: 8, position: 4 },
        { page: `${site}/columns/a`, query: "ピックルバン", impressions: 50, clicks: 40, position: 1 },
        { page: `${site}/reserve`, query: "予約", impressions: 10, clicks: 1, position: 2 },
      ],
      1,
    );
    expect(m.get("/columns/a")).toEqual({
      impressions: 500,
      clicks: 20,
      ctr: 0.04,
      position: 4.8,
      brandImpressions: 50,
      queries: [{ query: "ハイロックス 参加費", impressions: 400, clicks: 12, ctr: 0.03, position: 5 }],
    });
    expect(m.has("/reserve")).toBe(false);
  });
  it("collectPageQueries は指名だけの記事でも行を作り、順位と CTR は null", () => {
    const m = collectPageQueries([{ page: `${site}/news/x`, query: "pickle bang", impressions: 9, clicks: 9, position: 1 }]);
    expect(m.get("/news/x")).toEqual({ impressions: 0, clicks: 0, ctr: null, position: null, brandImpressions: 9, queries: [] });
  });
  it("buildWeeklyGsc は週ごとの表示・クリック・加重順位を返し、無い週は null 順位", () => {
    const m = buildWeeklyGsc(
      [
        { page: `${site}/columns/a`, date: "2026-09-08", impressions: 100, clicks: 5, position: 6 },
        { page: `${site}/columns/a`, date: "2026-09-09", impressions: 300, clicks: 15, position: 4 },
      ],
      "2026-09-09",
      2,
    );
    expect(m.get("/columns/a")).toEqual([
      { weekStart: "2026-08-31", impressions: 0, clicks: 0, position: null },
      { weekStart: "2026-09-07", impressions: 400, clicks: 20, position: 4.5 },
    ]);
  });
  it("findDemandGaps は表示が閾値以上で受けページがホームか順位>8か無いクエリを返す", () => {
    const pageQueries = [
      { page: `${site}/`, query: "千葉 ピックルボール", impressions: 199, clicks: 5, position: 5.5 },
      { page: `${site}/columns/chiba`, query: "千葉 ピックルボール", impressions: 3, clicks: 0, position: 12 },
      { page: `${site}/columns/b`, query: "hyrox とは", impressions: 700, clicks: 5, position: 10.7 },
      { page: `${site}/columns/f`, query: "ピックルボール 船橋", impressions: 437, clicks: 112, position: 2.3 },
    ];
    const gaps = findDemandGaps(
      [
        { query: "千葉 ピックルボール", impressions: 199, clicks: 5, position: 5.5 },
        { query: "hyrox とは", impressions: 755, clicks: 5, position: 10.7 },
        { query: "ピックルボール 船橋", impressions: 461, clicks: 114, position: 2.5 },
        { query: "ハイロックス 練習", impressions: 40, clicks: 0, position: 15 },
        { query: "ピックルバンセオリー", impressions: 221, clicks: 173, position: 1 },
        { query: "小さい", impressions: 29, clicks: 0, position: 3 },
      ],
      pageQueries,
    );
    expect(gaps).toEqual([
      { query: "hyrox とは", impressions: 755, clicks: 5, position: 10.7, bestPage: "/columns/b", bestPagePosition: 10.7 },
      { query: "千葉 ピックルボール", impressions: 199, clicks: 5, position: 5.5, bestPage: "/", bestPagePosition: 5.5 },
      { query: "ハイロックス 練習", impressions: 40, clicks: 0, position: 15, bestPage: null, bestPagePosition: null },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`collectPageQueries is not a function`）

- [ ] **Step 3: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs に追記

const HOME_PATHS = new Set(["/", "/en"]);

export function collectPageQueries(rows, topN = 15) {
  const grouped = groupByArticle(
    rows.map((r) => ({ ...r, path: r.page })),
    () => ({ impressions: 0, clicks: 0, weighted: 0, brandImpressions: 0, queries: [] }),
    (acc, row) => {
      if (isBrandQuery(row.query)) {
        acc.brandImpressions += row.impressions;
        return;
      }
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.weighted += row.position * row.impressions;
      acc.queries.push({
        query: row.query,
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.impressions > 0 ? round(row.clicks / row.impressions, 3) : null,
        position: row.position,
      });
    },
  );
  const result = new Map();
  for (const [path, acc] of grouped) {
    result.set(path, {
      impressions: acc.impressions,
      clicks: acc.clicks,
      ctr: acc.impressions > 0 ? round(acc.clicks / acc.impressions, 3) : null,
      position: acc.impressions > 0 ? round(acc.weighted / acc.impressions, 1) : null,
      brandImpressions: acc.brandImpressions,
      queries: acc.queries.sort((a, b) => b.impressions - a.impressions).slice(0, topN),
    });
  }
  return result;
}

export function buildWeeklyGsc(rows, endDate, weeks = 8) {
  const lastWeek = weekStart(endDate);
  const starts = Array.from({ length: weeks }, (_, i) => shiftDate(lastWeek, -7 * (weeks - 1 - i)));
  const grouped = groupByArticle(
    rows.map((r) => ({ ...r, path: r.page })),
    () => new Map(starts.map((s) => [s, { impressions: 0, clicks: 0, weighted: 0 }])),
    (acc, row) => {
      const w = weekStart(row.date);
      const cell = acc.get(w);
      if (!cell) return;
      cell.impressions += row.impressions;
      cell.clicks += row.clicks;
      cell.weighted += row.position * row.impressions;
    },
  );
  const result = new Map();
  for (const [path, byWeek] of grouped) {
    result.set(
      path,
      starts.map((s) => {
        const c = byWeek.get(s);
        return { weekStart: s, impressions: c.impressions, clicks: c.clicks, position: c.impressions > 0 ? round(c.weighted / c.impressions, 1) : null };
      }),
    );
  }
  return result;
}

/** クエリごとに「最も表示を受けたページ」を当てる(ホームも含める)。 */
function bestPageByQuery(pageQueryRows) {
  const best = new Map();
  for (const row of pageQueryRows) {
    const path = normalizeArticlePath(row.page);
    const current = best.get(row.query);
    if (!current || row.impressions > current.impressions) {
      best.set(row.query, { path, impressions: row.impressions, position: row.position });
    }
  }
  return best;
}

export function findDemandGaps(queryRows, pageQueryRows, { minImpressions = 30, maxPosition = 8 } = {}) {
  const best = bestPageByQuery(pageQueryRows);
  return queryRows
    .filter((r) => !isBrandQuery(r.query) && r.impressions >= minImpressions)
    .map((r) => {
      const b = best.get(r.query);
      return {
        query: r.query,
        impressions: r.impressions,
        clicks: r.clicks,
        position: r.position,
        bestPage: b?.path ?? null,
        bestPagePosition: b?.position ?? null,
      };
    })
    .filter((g) => g.bestPage === null || HOME_PATHS.has(g.bestPage) || g.bestPagePosition > maxPosition)
    .sort((a, b) => b.impressions - a.impressions);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（20件）

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts
git commit -m "feat(analytics): GSC のクエリ畳み込みと需要ギャップ抽出を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: HTML メタ抽出・内部リンク数・表記フラグの材料（純関数）

**Files:**
- Modify: `scripts/analytics/articleReview.mjs`（末尾に追記。ここで 500 行を超えていたら `scripts/analytics/articleReviewHtml.mjs` に本タスクの関数を分割し、`articleReview.mjs` から re-export する）
- Test: `scripts/analytics/articleReview.test.ts`（追記）

**Interfaces:**
- Produces:
  - `extractMeta(html: string, origin: string): { title: string|null, description: string|null, links: string[], bodyText: string }`（`links` は記事パスの内部リンクのみ・正規化済み・重複除去）
  - `countInboundLinks(pages: Map<path, {links: string[]}>): Map<path, number>`
  - `findStaleDateText(bodyText: string, today: string, maxDays = 28): string|null`（古い「◯月◯日時点」表記を返す。無ければ null）
  - `katakanaGap(queries: {query}[], title: string|null, topN = 5): string[]`（title に無いカタカナ語。空配列ならギャップなし）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts に追記
import { countInboundLinks, extractMeta, findStaleDateText, katakanaGap } from "./articleReview.mjs";

describe("HTML メタと表記", () => {
  const origin = "https://www.thepicklebang.com";
  it("extractMeta は title・description・記事への内部リンク・本文テキストを返す", () => {
    const html = `<html><head><title>HYROXの参加費はいくら？ | THE PICKLE BANG THEORY</title>
      <meta name="description" content="参加費の目安。"></head><body>
      <p>2026年9月4日時点の状況。<a href="/columns/hyrox-beginners-guide">入門</a>
      <a href="${origin}/ja/news/hyrox-osaka-early-access-simulation">告知</a>
      <a href="/columns/hyrox-beginners-guide">入門(重複)</a>
      <a href="https://hyroxjapan.com/">外部</a><a href="/reserve">予約</a></p></body></html>`;
    expect(extractMeta(html, origin)).toEqual({
      title: "HYROXの参加費はいくら？",
      description: "参加費の目安。",
      links: ["/columns/hyrox-beginners-guide", "/news/hyrox-osaka-early-access-simulation"],
      bodyText: expect.stringContaining("2026年9月4日時点の状況。"),
    });
  });
  it("extractMeta は title・description が無ければ null", () => {
    expect(extractMeta("<html><body>x</body></html>", origin)).toMatchObject({ title: null, description: null, links: [] });
  });
  it("countInboundLinks は自分以外からのリンク本数を数える", () => {
    const pages = new Map([
      ["/columns/a", { links: ["/columns/b", "/columns/b", "/columns/a"] }],
      ["/columns/b", { links: [] }],
      ["/columns/c", { links: ["/columns/b"] }],
    ]);
    const m = countInboundLinks(pages);
    expect(m.get("/columns/a")).toBe(0);
    expect(m.get("/columns/b")).toBe(2);
    expect(m.get("/columns/c")).toBe(0);
  });
  it("findStaleDateText は28日超前の「◯月◯日時点」を返す", () => {
    expect(findStaleDateText("2026年8月1日時点の情報です", "2026-09-11")).toBe("2026年8月1日時点");
    expect(findStaleDateText("9月4日時点の状況", "2026-09-11")).toBeNull();
    expect(findStaleDateText("12月20日時点の情報", "2026-01-25")).toBe("12月20日時点"); // 年の指定が無く未来なら前年(2025-12-20)とみなす。36日前
    expect(findStaleDateText("日付の記載なし", "2026-09-11")).toBeNull();
  });
  it("katakanaGap は上位クエリのカタカナ語のうち title に無いものを返す", () => {
    const queries = [
      { query: "ハイロックス 参加費" },
      { query: "hyrox 参加費" },
      { query: "ハイ ロックス 値段" },
      { query: "ハイロックス 料金" },
    ];
    // 「ハイ ロックス」の分かち書きは「ハイ」「ロックス」の2語として拾う(2文字以上のカタカナ連続)
    expect(katakanaGap(queries, "HYROXの参加費はいくら？")).toEqual(["ハイロックス", "ハイ", "ロックス"]);
    expect(katakanaGap(queries, "HYROX（ハイロックス）の参加費")).toEqual([]); // 「ハイ」「ロックス」は「ハイロックス」の部分文字列として含まれる
    expect(katakanaGap(queries, null)).toEqual([]);
    expect(katakanaGap([{ query: "hyrox" }], "x")).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`extractMeta is not a function`）

- [ ] **Step 3: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs に追記

const SITE_NAME_SUFFIX = / \| THE PICKLE BANG THEORY$/;

function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export function extractMeta(html, origin) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  const links = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (!href.startsWith("/") && !href.startsWith(origin)) continue;
    const path = normalizeArticlePath(href.replace(origin, "").replace(/^\/(ja|en)\//, "/"));
    if (isArticlePath(path)) links.add(path);
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/);
  const bodyText = decodeEntities((bodyMatch ? bodyMatch[1] : html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).replace(SITE_NAME_SUFFIX, "").trim() : null,
    description: descMatch ? decodeEntities(descMatch[1]) : null,
    links: [...links],
    bodyText,
  };
}

export function countInboundLinks(pages) {
  const result = new Map([...pages.keys()].map((p) => [p, 0]));
  for (const [from, { links }] of pages) {
    for (const to of new Set(links)) {
      if (to !== from && result.has(to)) result.set(to, result.get(to) + 1);
    }
  }
  return result;
}

export function findStaleDateText(bodyText, today, maxDays = 28) {
  const m = bodyText.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日時点/);
  if (!m) return null;
  const year = Number(today.slice(0, 4));
  let date = `${m[1] ?? year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if (!m[1] && date > today) date = `${year - 1}${date.slice(4)}`;
  const ageDays = (new Date(`${today}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / DAY_MS;
  return ageDays > maxDays ? m[0] : null;
}

export function katakanaGap(queries, title, topN = 5) {
  if (!title) return [];
  const gaps = new Set();
  for (const { query } of queries.slice(0, topN)) {
    for (const word of query.match(/[ァ-ヶー]{2,}/g) ?? []) {
      if (!title.includes(word)) gaps.add(word);
    }
  }
  return [...gaps];
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（25件）

- [ ] **Step 5: 行数を確認し、必要なら分割する**

Run: `wc -l scripts/analytics/articleReview.mjs`
Expected: 400 行前後。500 行を超えていれば本タスクの4関数と `decodeEntities` を `scripts/analytics/articleReviewHtml.mjs` に移し、`articleReview.mjs` に `export { extractMeta, countInboundLinks, findStaleDateText, katakanaGap } from "./articleReviewHtml.mjs";` を置く（テストは変更不要）。

- [ ] **Step 6: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts
git commit -m "feat(analytics): 記事 HTML のメタ抽出と内部リンク・表記チェックを追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 判定ヒントとフラグ（純関数）

**Files:**
- Modify: `scripts/analytics/articleReview.mjs`（末尾に追記）
- Test: `scripts/analytics/articleReview.test.ts`（追記）

**Interfaces:**
- Produces:
  - `HINTS: readonly string[]` = `["too_early","title_desc_rewrite","body_boost","cta_check","continue","sunset_candidate","no_data"]`
  - `detectHint({ daysSincePublish, entry, impressions, ctr, position, ctaPer100pv }): string`（各値は `number|null`）
  - `detectFlags({ last7, prev7, katakanaGaps, inboundLinks, staleDateText }): string[]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts に追記
import { detectFlags, detectHint, HINTS } from "./articleReview.mjs";

describe("detectHint(runbook ⑦ の表を上から当てる)", () => {
  const base = { daysSincePublish: 60, entry: 50, impressions: 500, ctr: 0.1, position: 3, ctaPer100pv: 12 };
  it.each([
    ["公開14日未満は too_early", { ...base, daysSincePublish: 13 }, "too_early"],
    ["順位≤5 かつ CTR<5% は title_desc_rewrite", { ...base, position: 5, ctr: 0.045 }, "title_desc_rewrite"],
    ["表示≥100 かつ 順位4〜10 は body_boost", { ...base, position: 8 }, "body_boost"],
    ["順位4〜10 でも表示<100 なら次へ", { ...base, position: 8, impressions: 99, entry: 50 }, "continue"],
    ["入口≥10 かつ CTA<8 は cta_check", { ...base, ctaPer100pv: 7.9 }, "cta_check"],
    ["入口≥5 は continue", { ...base, entry: 5, ctaPer100pv: null }, "continue"],
    ["表示<10 かつ 入口<3 は sunset_candidate", { ...base, entry: 2, impressions: 9, position: 12 }, "sunset_candidate"],
    ["どれにも当たらなければ no_data", { ...base, entry: 4, impressions: 50, position: 12, ctr: 0.2 }, "no_data"],
    ["入口が取得不可なら no_data", { ...base, entry: null }, "no_data"],
    ["公開日不明でも他の条件で判定する", { ...base, daysSincePublish: null }, "continue"],
    ["GSC 取得不可(順位 null)でも入口で判定する", { ...base, impressions: null, ctr: null, position: null }, "continue"],
  ])("%s", (_name, input, expected) => {
    expect(detectHint(input)).toBe(expected);
  });
  it("HINTS は7種を固定する", () => {
    expect(HINTS).toEqual(["too_early", "title_desc_rewrite", "body_boost", "cta_check", "continue", "sunset_candidate", "no_data"]);
  });
});

describe("detectFlags", () => {
  it("前週比 ±30% 超で weekly_spike", () => {
    expect(detectFlags({ last7: 131, prev7: 100, katakanaGaps: [], inboundLinks: 1, staleDateText: null })).toEqual(["weekly_spike"]);
    expect(detectFlags({ last7: 69, prev7: 100, katakanaGaps: [], inboundLinks: 1, staleDateText: null })).toEqual(["weekly_spike"]);
    expect(detectFlags({ last7: 130, prev7: 100, katakanaGaps: [], inboundLinks: 1, staleDateText: null })).toEqual([]);
    expect(detectFlags({ last7: 10, prev7: 0, katakanaGaps: [], inboundLinks: 1, staleDateText: null })).toEqual([]);
  });
  it("カタカナ欠落・被リンク0・古い日付表記をそれぞれ付ける(順序固定)", () => {
    expect(detectFlags({ last7: 100, prev7: 100, katakanaGaps: ["ハイロックス"], inboundLinks: 0, staleDateText: "9月4日時点" })).toEqual([
      "katakana_gap",
      "no_inbound_links",
      "stale_date_text",
    ]);
  });
  it("被リンク数が取得不可(null)なら no_inbound_links は付けない", () => {
    expect(detectFlags({ last7: 100, prev7: 100, katakanaGaps: [], inboundLinks: null, staleDateText: null })).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`detectHint is not a function`）

- [ ] **Step 3: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs に追記

export const HINTS = Object.freeze(["too_early", "title_desc_rewrite", "body_boost", "cta_check", "continue", "sunset_candidate", "no_data"]);

const has = (v) => v !== null && v !== undefined;

/** runbook ⑦ の判定表。上から当てて最初に当たったものを返す(設計書 §3.4)。 */
export function detectHint({ daysSincePublish, entry, impressions, ctr, position, ctaPer100pv }) {
  if (has(daysSincePublish) && daysSincePublish < 14) return "too_early";
  if (!has(entry)) return "no_data";
  if (has(position) && has(ctr) && position <= 5 && ctr < 0.05) return "title_desc_rewrite";
  if (has(impressions) && has(position) && impressions >= 100 && position >= 4 && position <= 10) return "body_boost";
  if (entry >= 10 && has(ctaPer100pv) && ctaPer100pv < 8) return "cta_check";
  if (entry >= 5) return "continue";
  if (has(impressions) && impressions < 10 && entry < 3) return "sunset_candidate";
  return "no_data";
}

/** ヒントとは独立に付くフラグ(設計書 §3.5)。順序は固定。 */
export function detectFlags({ last7, prev7, katakanaGaps, inboundLinks, staleDateText }) {
  const flags = [];
  if (prev7 > 0 && Math.abs(last7 - prev7) / prev7 > 0.3) flags.push("weekly_spike");
  if (katakanaGaps.length > 0) flags.push("katakana_gap");
  if (inboundLinks === 0) flags.push("no_inbound_links");
  if (staleDateText) flags.push("stale_date_text");
  return flags;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（40件）

- [ ] **Step 5: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts
git commit -m "feat(analytics): 記事の判定ヒントとフラグを runbook の表どおりに実装する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: プロファイル組み立てと Markdown 整形（純関数）

**Files:**
- Create: `scripts/analytics/fixtures/article-review/sample.json`
- Modify: `scripts/analytics/articleReview.mjs`（末尾に追記）
- Test: `scripts/analytics/articleReview.test.ts`（追記）

**Interfaces:**
- Consumes: Task 1〜5 の全関数
- Produces:
  - `buildArticleProfiles(input: ReviewInput): { articles: ArticleProfile[], demandGaps: DemandGap[] }`
  - `formatMarkdown(report: { meta, articles, demandGaps }): string`
  - `ReviewInput` の形（CLI が組み立てる。取得不可の項目は `null`）:

```js
{
  today: "2026-09-11",
  daily: [{ date, path, sessions }] | null,          // GA4 56日 日次入口
  channels: [{ path, channel, sessions, engagedSessions, durationTotal }] | null,
  sources: [{ path, source, sessions }] | null,
  regions: [{ path, region, sessions }] | null,
  pageViews: [{ path, pv, users, engagementSeconds }] | null,
  events: [{ path, event, location, count }] | null,
  pageQueries: [{ page, query, impressions, clicks, position }] | null, // GSC 28日
  pageDates: [{ page, date, impressions, clicks, position }] | null,    // GSC 56日
  queryTotals: [{ query, impressions, clicks, position }] | null,       // GSC 28日 クエリ全体
  pages: Map<path, { title, description, links, bodyText }> | null,    // 本番 HTML
  published: Map<path, "YYYY-MM-DD"> | null,                            // microCMS。無ければ GA4 初出日
}
```

  - `ArticleProfile` の形（設計書 §3.3 のキー名をそのまま使う）:

```js
{ slug, locale, path, title, description, publishedAt, daysSincePublish,
  weeklyEntry: [{ weekStart, sessions }], weeklyGsc: [{ weekStart, impressions, clicks, position }],
  last28: { entry, prevEntry, pv, users, engagedRate, avgDurationSec },
  channels: {...}, yahooShare, regions: { chibaShare, tokyoShare, top3 },
  cta: { count, per100pv, byLocation }, queries: [...], brandImpressions,
  inboundLinks: number|null, hint, flags: string[] }
```

- [ ] **Step 1: fixture を作る**

```json
// scripts/analytics/fixtures/article-review/sample.json
{
  "today": "2026-09-11",
  "daily": [
    { "date": "2026-09-10", "path": "/columns/hyrox-cost-guide", "sessions": 124 },
    { "date": "2026-09-03", "path": "/columns/hyrox-cost-guide", "sessions": 57 },
    { "date": "2026-08-27", "path": "/columns/hyrox-cost-guide", "sessions": 20 },
    { "date": "2026-08-20", "path": "/columns/hyrox-cost-guide", "sessions": 10 },
    { "date": "2026-09-10", "path": "/columns/pickleball-open-play-guide", "sessions": 2 },
    { "date": "2026-09-08", "path": "/en/columns/hyrox-cost-guide", "sessions": 4 }
  ],
  "channels": [
    { "path": "/columns/hyrox-cost-guide", "channel": "Organic Search", "sessions": 180, "engagedSessions": 110, "durationTotal": 22500 },
    { "path": "/columns/hyrox-cost-guide", "channel": "Direct", "sessions": 20, "engagedSessions": 10, "durationTotal": 500 },
    { "path": "/columns/pickleball-open-play-guide", "channel": "Organic Search", "sessions": 2, "engagedSessions": 2, "durationTotal": 600 },
    { "path": "/en/columns/hyrox-cost-guide", "channel": "Organic Search", "sessions": 4, "engagedSessions": 2, "durationTotal": 80 }
  ],
  "sources": [
    { "path": "/columns/hyrox-cost-guide", "source": "google", "sessions": 140 },
    { "path": "/columns/hyrox-cost-guide", "source": "yahoo", "sessions": 40 }
  ],
  "regions": [
    { "path": "/columns/hyrox-cost-guide", "region": "Tokyo", "sessions": 50 },
    { "path": "/columns/hyrox-cost-guide", "region": "Osaka", "sessions": 24 },
    { "path": "/columns/hyrox-cost-guide", "region": "Chiba", "sessions": 10 },
    { "path": "/columns/hyrox-cost-guide", "region": "Hokkaido", "sessions": 6 }
  ],
  "pageViews": [
    { "path": "/columns/hyrox-cost-guide", "pv": 250, "users": 200, "engagementSeconds": 9600 },
    { "path": "/columns/pickleball-open-play-guide", "pv": 5, "users": 5, "engagementSeconds": 145 },
    { "path": "/en/columns/hyrox-cost-guide", "pv": 6, "users": 5, "engagementSeconds": 60 }
  ],
  "events": [
    { "path": "/columns/hyrox-cost-guide", "event": "external_link_click", "location": "article_body_cta", "count": 10 },
    { "path": "/columns/hyrox-cost-guide", "event": "reserve_entry_click", "location": "article_body_cta", "count": 3 }
  ],
  "pageQueries": [
    { "page": "https://www.thepicklebang.com/columns/hyrox-cost-guide", "query": "ハイロックス 参加費", "impressions": 400, "clicks": 12, "position": 5.2 },
    { "page": "https://www.thepicklebang.com/columns/hyrox-cost-guide", "query": "hyrox 参加費", "impressions": 200, "clicks": 8, "position": 4.3 },
    { "page": "https://www.thepicklebang.com/columns/hyrox-cost-guide", "query": "ピックルバン", "impressions": 5, "clicks": 4, "position": 1 },
    { "page": "https://www.thepicklebang.com/", "query": "千葉 ピックルボール", "impressions": 199, "clicks": 5, "position": 5.5 }
  ],
  "pageDates": [
    { "page": "https://www.thepicklebang.com/columns/hyrox-cost-guide", "date": "2026-09-08", "impressions": 600, "clicks": 20, "position": 5 },
    { "page": "https://www.thepicklebang.com/columns/hyrox-cost-guide", "date": "2026-09-01", "impressions": 6000, "clicks": 300, "position": 4.9 }
  ],
  "queryTotals": [
    { "query": "ハイロックス 参加費", "impressions": 405, "clicks": 12, "position": 5.2 },
    { "query": "千葉 ピックルボール", "impressions": 199, "clicks": 5, "position": 5.5 },
    { "query": "ピックルバン", "impressions": 221, "clicks": 173, "position": 1 }
  ],
  "pages": {
    "/columns/hyrox-cost-guide": { "title": "HYROXの参加費はいくら？", "description": "参加費の目安。", "links": ["/columns/hyrox-beginners-guide"], "bodyText": "2026年8月4日時点の状況。" },
    "/columns/pickleball-open-play-guide": { "title": "オープンプレーとは", "description": "一人参加。", "links": [], "bodyText": "本文" },
    "/en/columns/hyrox-cost-guide": { "title": "HYROX entry fee", "description": "Fees.", "links": [], "bodyText": "body" }
  },
  "published": {
    "/columns/hyrox-cost-guide": "2026-08-26",
    "/columns/pickleball-open-play-guide": "2026-09-07"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

```ts
// scripts/analytics/articleReview.test.ts に追記
import { readFileSync } from "node:fs";
import { buildArticleProfiles, formatMarkdown } from "./articleReview.mjs";

function loadSample() {
  const raw = JSON.parse(readFileSync("scripts/analytics/fixtures/article-review/sample.json", "utf8"));
  return { ...raw, pages: new Map(Object.entries(raw.pages)), published: new Map(Object.entries(raw.published)) };
}

describe("buildArticleProfiles", () => {
  it("記事ごとに数字・判定ヒント・フラグをまとめ、入口降順に並べる", () => {
    const { articles, demandGaps } = buildArticleProfiles(loadSample());
    expect(articles.map((a) => a.path)).toEqual(["/columns/hyrox-cost-guide", "/en/columns/hyrox-cost-guide", "/columns/pickleball-open-play-guide"]);
    const cost = articles[0];
    expect(cost).toMatchObject({
      slug: "hyrox-cost-guide",
      locale: "ja",
      title: "HYROXの参加費はいくら？",
      publishedAt: "2026-08-26",
      daysSincePublish: 16,
      last28: { entry: 200, prevEntry: 0, pv: 250, users: 200, engagedRate: 0.6, avgDurationSec: 115 },
      yahooShare: 0.22,
      regions: { chibaShare: 0.11, tokyoShare: 0.56 },
      cta: { count: 13, per100pv: 5.2 },
      brandImpressions: 5,
      inboundLinks: 0,
      hint: "title_desc_rewrite",
      flags: ["weekly_spike", "katakana_gap", "no_inbound_links", "stale_date_text"],
    });
    expect(cost.weeklyEntry).toHaveLength(8);
    expect(cost.weeklyGsc).toHaveLength(8);
    expect(cost.queries[0]).toEqual({ query: "ハイロックス 参加費", impressions: 400, clicks: 12, ctr: 0.03, position: 5.2 });
    expect(articles[2]).toMatchObject({ hint: "too_early", daysSincePublish: 4 });
    expect(demandGaps).toEqual([{ query: "千葉 ピックルボール", impressions: 199, clicks: 5, position: 5.5, bestPage: "/", bestPagePosition: 5.5 }]);
  });
  it("公開日が無い記事は GA4 の初出日で代用する", () => {
    const input = loadSample();
    input.published = null;
    const { articles } = buildArticleProfiles(input);
    expect(articles[0]).toMatchObject({ publishedAt: "2026-08-20", daysSincePublish: 22 });
  });
  it("取得不可(null)の入力は値を null にし、判定は残った値で行う", () => {
    const input = { ...loadSample(), channels: null, sources: null, regions: null, pageViews: null, events: null, pageQueries: null, pageDates: null, queryTotals: null, pages: null };
    const { articles, demandGaps } = buildArticleProfiles(input);
    const cost = articles.find((a) => a.path === "/columns/hyrox-cost-guide");
    expect(cost).toMatchObject({ title: null, last28: { entry: null, pv: null }, yahooShare: null, cta: { count: null, per100pv: null }, queries: [], inboundLinks: null, hint: "no_data" });
    expect(cost.flags).toEqual(["weekly_spike"]);
    expect(demandGaps).toEqual([]);
  });
  it("入力がすべて null なら記事0件", () => {
    const { articles, demandGaps } = buildArticleProfiles({ today: "2026-09-11", daily: null, channels: null, sources: null, regions: null, pageViews: null, events: null, pageQueries: null, pageDates: null, queryTotals: null, pages: null, published: null });
    expect(articles).toEqual([]);
    expect(demandGaps).toEqual([]);
  });
});

describe("formatMarkdown", () => {
  it("見出し・記事表・需要ギャップ・取得不可を含む", () => {
    const report = buildArticleProfiles(loadSample());
    const md = formatMarkdown({ meta: { generatedAt: "2026-09-11T08:30:00+09:00", mode: "weekly", windows: buildWindows("2026-09-11"), publishedAtSource: "microcms", errors: [{ source: "gsc:pageDates", reason: "HTTP 503" }] }, ...report });
    expect(md).toContain("# 記事レビュー 2026-09-11 (weekly)");
    expect(md).toContain("| /columns/hyrox-cost-guide |");
    expect(md).toContain("title_desc_rewrite");
    expect(md).toContain("## 需要ギャップ");
    expect(md).toContain("千葉 ピックルボール");
    expect(md).toContain("gsc:pageDates: HTTP 503");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: FAIL（`buildArticleProfiles is not a function`）

- [ ] **Step 4: 最小実装を書く**

```js
// scripts/analytics/articleReview.mjs に追記

function nullable(map, path, key) {
  return map ? (map.get(path)?.[key] ?? null) : null;
}

/** GA4 日次の初出日(公開日の代用)。 */
function firstSeenDates(dailyRows) {
  const result = new Map();
  for (const row of dailyRows) {
    const path = normalizeArticlePath(row.path);
    if (!isArticlePath(path)) continue;
    if (!result.has(path) || row.date < result.get(path)) result.set(path, row.date);
  }
  return result;
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);
}

export function buildArticleProfiles(input) {
  const { today } = input;
  const windows = buildWindows(today);
  const daily = input.daily ?? [];
  const weekly = buildWeeklyEntry(daily, windows.ga4.cur.endDate);
  const channels = input.channels ? summarizeChannels(input.channels) : null;
  const sources = input.sources ? summarizeSources(input.sources) : null;
  const regions = input.regions ? summarizeRegions(input.regions) : null;
  const pageViews = input.pageViews ? summarizePageViews(input.pageViews) : null;
  const cta = input.events && pageViews ? summarizeCta(input.events, pageViews) : null;
  const pageQueries = input.pageQueries ? collectPageQueries(input.pageQueries) : null;
  const weeklyGsc = input.pageDates ? buildWeeklyGsc(input.pageDates, windows.gsc.cur.endDate) : null;
  const inbound = input.pages ? countInboundLinks(input.pages) : null;
  const firstSeen = firstSeenDates(daily);
  const emptyWeeks = (fields) =>
    Array.from({ length: 8 }, (_, i) => ({ weekStart: shiftDate(weekStart(windows.gsc.cur.endDate), -7 * (7 - i)), ...fields }));

  const paths = new Set([
    ...weekly.keys(),
    ...(channels?.keys() ?? []),
    ...(pageViews?.keys() ?? []),
    ...(pageQueries?.keys() ?? []),
    ...(input.pages?.keys() ?? []),
  ]);

  const articles = [...paths].map((path) => {
    const page = input.pages?.get(path) ?? null;
    const publishedAt = input.published?.get(path) ?? firstSeen.get(path) ?? null;
    const queries = pageQueries?.get(path)?.queries ?? [];
    const entry = nullable(channels, path, "entry");
    const prevEntry = input.daily ? sumSessionsBetween(daily, path, windows.ga4.prev.startDate, windows.ga4.prev.endDate) : null;
    const per100pv = nullable(cta, path, "per100pv");
    const profile = {
      slug: articleSlug(path),
      locale: articleLocale(path),
      path,
      title: page?.title ?? null,
      description: page?.description ?? null,
      publishedAt,
      daysSincePublish: publishedAt ? daysBetween(publishedAt, today) : null,
      weeklyEntry: weekly.get(path) ?? emptyWeeks({ sessions: 0 }),
      weeklyGsc: weeklyGsc?.get(path) ?? emptyWeeks({ impressions: 0, clicks: 0, position: null }),
      last28: {
        entry,
        prevEntry,
        pv: nullable(pageViews, path, "pv"),
        users: nullable(pageViews, path, "users"),
        engagedRate: nullable(channels, path, "engagedRate"),
        avgDurationSec: nullable(channels, path, "avgDurationSec"),
      },
      channels: nullable(channels, path, "channels"),
      yahooShare: nullable(sources, path, "yahooShare"),
      regions: regions?.get(path) ?? { chibaShare: null, tokyoShare: null, top3: [] },
      cta: { count: nullable(cta, path, "count"), per100pv, byLocation: nullable(cta, path, "byLocation") ?? {} },
      queries,
      brandImpressions: nullable(pageQueries, path, "brandImpressions"),
      inboundLinks: inbound ? (inbound.get(path) ?? 0) : null,
    };
    profile.hint = detectHint({
      daysSincePublish: profile.daysSincePublish,
      entry,
      impressions: nullable(pageQueries, path, "impressions"),
      ctr: nullable(pageQueries, path, "ctr"),
      position: nullable(pageQueries, path, "position"),
      ctaPer100pv: per100pv,
    });
    const end = windows.ga4.cur.endDate;
    profile.flags = detectFlags({
      last7: sumSessionsBetween(daily, path, shiftDate(end, -6), end),
      prev7: sumSessionsBetween(daily, path, shiftDate(end, -13), shiftDate(end, -7)),
      katakanaGaps: katakanaGap(queries, profile.title),
      inboundLinks: profile.inboundLinks,
      staleDateText: page ? findStaleDateText(page.bodyText, today) : null,
    });
    return profile;
  });

  articles.sort((a, b) => (b.last28.entry ?? -1) - (a.last28.entry ?? -1));
  const demandGaps = input.queryTotals && input.pageQueries ? findDemandGaps(input.queryTotals, input.pageQueries) : [];
  return { articles, demandGaps };
}

const cell = (v, digits = 0) => (v === null || v === undefined ? "-" : typeof v === "number" ? v.toFixed(digits) : String(v));

export function formatMarkdown({ meta, articles, demandGaps }) {
  const lines = [
    `# 記事レビュー ${meta.generatedAt.slice(0, 10)} (${meta.mode})`,
    "",
    `GA4 ${meta.windows.ga4.cur.startDate}〜${meta.windows.ga4.cur.endDate} / GSC ${meta.windows.gsc.cur.startDate}〜${meta.windows.gsc.cur.endDate} / 公開日の出所: ${meta.publishedAtSource}`,
    "",
    "## 記事",
    "",
    "| path | 入口S | 前期 | PV | Yahoo率 | 千葉率 | CTA/100PV | 非指名表示 | 順位 | CTR | ヒント | フラグ |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
  ];
  for (const a of articles) {
    const q = { impressions: a.queries.reduce((s, x) => s + x.impressions, 0) };
    lines.push(
      `| ${a.path} | ${cell(a.last28.entry)} | ${cell(a.last28.prevEntry)} | ${cell(a.last28.pv)} | ${cell(a.yahooShare === null ? null : a.yahooShare * 100)}% | ${cell(a.regions.chibaShare === null ? null : a.regions.chibaShare * 100)}% | ${cell(a.cta.per100pv, 1)} | ${q.impressions} | ${cell(a.queries.length ? a.queries[0].position : null, 1)} | ${cell(a.queries.length && q.impressions ? (a.queries.reduce((s, x) => s + x.clicks, 0) / q.impressions) * 100 : null, 1)}% | ${a.hint} | ${a.flags.join(" ") || "-"} |`,
    );
  }
  lines.push("", "## 需要ギャップ", "");
  if (demandGaps.length === 0) lines.push("なし");
  for (const g of demandGaps) lines.push(`- "${g.query}" 表示${g.impressions} クリック${g.clicks} 順位${g.position} → 受け: ${g.bestPage ?? "なし"}${g.bestPagePosition === null ? "" : ` (${g.bestPagePosition})`}`);
  lines.push("", "## 取得不可", "");
  if (meta.errors.length === 0) lines.push("なし");
  for (const e of meta.errors) lines.push(`- ${e.source}: ${e.reason}`);
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/articleReview.test.ts`
Expected: PASS（45件）。`daysSincePublish: 16` は 2026-08-26 → 09-11、`prevEntry: 0` は前期窓(07-17〜08-13)に日次行が無いため。

- [ ] **Step 6: カバレッジを確認し、未到達分岐にテストを足す**

Run: `npx vitest run scripts/analytics/articleReview.test.ts --coverage --coverage.include=scripts/analytics/articleReview.mjs`
Expected: statements/branches/functions/lines 100%。未到達行があれば、その分岐に対応する `it` を追加する（例: `channels` が null で `pageViews` がある場合、`weeklyGsc` 無し時の `emptyWeeks`、`cell` の数値以外）。

- [ ] **Step 7: コミット**

```bash
git add scripts/analytics/articleReview.mjs scripts/analytics/articleReview.test.ts scripts/analytics/fixtures/article-review/sample.json
git commit -m "feat(analytics): 記事プロファイルの組み立てと Markdown 整形を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: CLI `reviewArticles.mjs` と結線テスト

**Files:**
- Create: `scripts/analytics/reviewArticles.mjs`
- Create: `scripts/analytics/fixtures/mockArticleReview.mjs`
- Test: `scripts/analytics/reviewArticles.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `buildArticleProfiles`, `formatMarkdown`, `buildWindows`, `jstToday`, `ga4DateToIso`, `extractMeta`, `ARTICLE_EVENTS`（`articleReview.mjs`）、`normalizeArticlePath`/`isArticlePath`（`articleMetrics.mjs`）
- Produces: CLI。`node scripts/analytics/reviewArticles.mjs [--monthly] [--out DIR]`。出力 `DIR/YYYY-MM-DD.json` と `.md`。環境変数:
  - 必須: `GROWTH_GOOGLE_CLIENT_ID` / `GROWTH_GOOGLE_CLIENT_SECRET` / `GROWTH_GOOGLE_REFRESH_TOKEN` / `GROWTH_GA4_PROPERTY_ID` / `GROWTH_GSC_SITE_URL`
  - 任意: `GROWTH_SITE_ORIGIN`（既定 `https://www.thepicklebang.com`）、`GROWTH_MICROCMS_PROD_DOMAIN` / `GROWTH_MICROCMS_PROD_READ_KEY`
  - 終了コード: 取得失敗が1つでもあれば 1（JSON は書く）。起動前失敗（env 不足・OAuth 失敗）は 2 で JSON を書かない。

- [ ] **Step 1: MSW fixture を書く**

```js
// scripts/analytics/fixtures/mockArticleReview.mjs
// reviewArticles.mjs の子プロセス結線テスト専用。外部通信をすべて MSW で遮断する。
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const SITE = "https://www.thepicklebang.com";
const failure = process.env.TEST_ARTICLE_REVIEW_FAILURE ?? "";
const empty = process.env.TEST_ARTICLE_REVIEW_EMPTY === "1";
const dims = (body) => body.dimensions.map((d) => d.name).join(",");
const row = (dimensions, metrics) => ({ dimensionValues: dimensions.map((value) => ({ value })), metricValues: metrics.map((value) => ({ value: String(value) })) });
const daysAgo = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

const server = setupServer(
  http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({ access_token: "test-token" })),
  http.post("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport", async ({ request }) => {
    if (failure === "ga4") return new HttpResponse(null, { status: 503 });
    if (empty) return HttpResponse.json({ rows: [] });
    const body = await request.json();
    switch (dims(body)) {
      case "date,landingPagePlusQueryString":
        return HttpResponse.json({ rows: [row([daysAgo(1).replace(/-/g, ""), "/columns/example"], [30]), row([daysAgo(40).replace(/-/g, ""), "/columns/example"], [5])] });
      case "landingPagePlusQueryString,sessionDefaultChannelGroup":
        return HttpResponse.json({ rows: [row(["/columns/example", "Organic Search"], [40, 30, 120])] });
      case "landingPagePlusQueryString,sessionSource":
        return HttpResponse.json({ rows: [row(["/columns/example", "google"], [30]), row(["/columns/example", "yahoo"], [10])] });
      case "landingPagePlusQueryString,region":
        return HttpResponse.json({ rows: [row(["/columns/example", "Chiba"], [25]), row(["/columns/example", "Tokyo"], [15])] });
      case "pagePath":
        return HttpResponse.json({ rows: [row(["/columns/example"], [60, 50, 3000])] });
      case "pagePath,eventName,customEvent:location":
        return HttpResponse.json({ rows: [row(["/columns/example", "external_link_click", "article_body_cta"], [6])] });
      default:
        return HttpResponse.json({ rows: [] });
    }
  }),
  http.post("https://www.googleapis.com/webmasters/v3/sites/:site/searchAnalytics/query", async ({ request }) => {
    if (failure === "gsc") return new HttpResponse(null, { status: 503 });
    if (empty) return HttpResponse.json({ rows: [] });
    const body = await request.json();
    const key = body.dimensions.join(",");
    if (key === "page,query") return HttpResponse.json({ rows: [{ keys: [`${SITE}/columns/example`, "ピックルボール 例"], impressions: 300, clicks: 9, ctr: 0.03, position: 4.5 }] });
    if (key === "page,date") return HttpResponse.json({ rows: [{ keys: [`${SITE}/columns/example`, daysAgo(3)], impressions: 100, clicks: 3, ctr: 0.03, position: 4.5 }] });
    return HttpResponse.json({ rows: [{ keys: ["ピックルボール 例"], impressions: 300, clicks: 9, ctr: 0.03, position: 4.5 }, { keys: ["需要ギャップ 例"], impressions: 50, clicks: 0, ctr: 0, position: 12 }] });
  }),
  http.get(`${SITE}/columns/example`, () => HttpResponse.html(`<html><head><title>例の記事 | THE PICKLE BANG THEORY</title><meta name="description" content="説明"></head><body><p>本文</p></body></html>`)),
  http.get("https://prod.microcms.io/api/v1/:endpoint", ({ params }) =>
    HttpResponse.json({ contents: params.endpoint === "columns" ? [{ id: "example", slug: "example", publishedAt: "2026-08-01T00:00:00.000Z", revisedAt: "2026-08-02T00:00:00.000Z" }] : [] }),
  ),
);
server.listen({ onUnhandledRequest: "error" });
```

- [ ] **Step 2: 失敗する結線テストを書く**

```ts
// scripts/analytics/reviewArticles.test.ts
// @vitest-environment node
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "pbt-article-review-cli-")));
  const destination = join(root, "scripts/analytics");
  await mkdir(destination, { recursive: true });
  for (const file of ["reviewArticles.mjs", "articleReview.mjs", "articleMetrics.mjs"]) {
    await copyFile(resolve("scripts/analytics", file), join(destination, file));
  }
});
afterAll(() => rm(root, { recursive: true, force: true }));

const baseEnv = {
  NODE_ENV: "test",
  PATH: process.env.PATH,
  GROWTH_GOOGLE_CLIENT_ID: "test",
  GROWTH_GOOGLE_CLIENT_SECRET: "test",
  GROWTH_GOOGLE_REFRESH_TOKEN: "test",
  GROWTH_GA4_PROPERTY_ID: "123",
  GROWTH_GSC_SITE_URL: "https://www.thepicklebang.com",
};
function run(args: string[], env: Record<string, string> = {}) {
  return execute(process.execPath, ["--import", resolve("scripts/analytics/fixtures/mockArticleReview.mjs"), join(root, "scripts/analytics/reviewArticles.mjs"), "--out", join(root, "out"), ...args], {
    timeout: 15000,
    env: { ...baseEnv, GROWTH_MICROCMS_PROD_DOMAIN: "prod", GROWTH_MICROCMS_PROD_READ_KEY: "k", ...env },
  });
}
async function readJson(name: string) {
  return JSON.parse(await readFile(join(root, "out", name), "utf8"));
}
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

describe("記事レビュー CLI(実 API を叩かず MSW で再現)", () => {
  it("正常時は JSON と Markdown を書き、記事のヒントと需要ギャップを含む", async () => {
    const { stdout } = await run([]);
    expect(stdout).toContain(`out/${today}.json`);
    const report = await readJson(`${today}.json`);
    expect(report.meta).toMatchObject({ mode: "weekly", publishedAtSource: "microcms", errors: [] });
    const article = report.articles.find((a: { path: string }) => a.path === "/columns/example");
    expect(article).toMatchObject({ title: "例の記事", publishedAt: "2026-08-01", yahooShare: 0.25, regions: { chibaShare: 0.63 }, cta: { per100pv: 10 } });
    expect(article.hint).toBe("title_desc_rewrite");
    expect(report.demandGaps.map((g: { query: string }) => g.query)).toEqual(["需要ギャップ 例"]);
    const md = await readFile(join(root, "out", `${today}.md`), "utf8");
    expect(md).toContain("| /columns/example |");
  });
  it("--monthly は mode を monthly にする", async () => {
    await run(["--monthly"]);
    expect((await readJson(`${today}.json`)).meta.mode).toBe("monthly");
  });
  it("GSC 失敗でも JSON を残し、errors に理由を書いて終了コード1", async () => {
    await expect(run([], { TEST_ARTICLE_REVIEW_FAILURE: "gsc" })).rejects.toMatchObject({ code: 1 });
    const report = await readJson(`${today}.json`);
    expect(report.meta.errors.map((e: { source: string }) => e.source)).toEqual(["gsc:pageQueries", "gsc:pageDates", "gsc:queryTotals"]);
    expect(report.articles[0].queries).toEqual([]);
    expect(report.demandGaps).toEqual([]);
  });
  it("microCMS キーが無ければ GA4 初出日で代用する", async () => {
    await run([], { GROWTH_MICROCMS_PROD_DOMAIN: "", GROWTH_MICROCMS_PROD_READ_KEY: "" });
    const report = await readJson(`${today}.json`);
    expect(report.meta.publishedAtSource).toBe("ga4-first-seen");
    expect(report.articles[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("記事が0件でも JSON を書いて正常終了する", async () => {
    await run([], { TEST_ARTICLE_REVIEW_EMPTY: "1" });
    const report = await readJson(`${today}.json`);
    expect(report.articles).toEqual([]);
  });
  it("必須 env が無ければ API を呼ばずに終了コード2", async () => {
    await expect(run([], { GROWTH_GA4_PROPERTY_ID: "" })).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining("GROWTH_GA4_PROPERTY_ID") });
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run scripts/analytics/reviewArticles.test.ts`
Expected: FAIL（`reviewArticles.mjs` が無い）

- [ ] **Step 4: CLI を実装する**

```js
// scripts/analytics/reviewArticles.mjs
// 記事レビュー(週次ルーチン)の集計 CLI。読み取りのみ。書き込みは --out のディレクトリだけ。
// 使い方: node scripts/analytics/reviewArticles.mjs [--monthly] [--out out/article-review]
// 設計: docs/superpowers/specs/2026-09-11-article-review-routine-design.md §3
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isArticlePath, normalizeArticlePath } from "./articleMetrics.mjs";
import { ARTICLE_EVENTS, buildArticleProfiles, buildWindows, extractMeta, formatMarkdown, ga4DateToIso, jstToday } from "./articleReview.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUIRED_ENV = ["GROWTH_GOOGLE_CLIENT_ID", "GROWTH_GOOGLE_CLIENT_SECRET", "GROWTH_GOOGLE_REFRESH_TOKEN", "GROWTH_GA4_PROPERTY_ID", "GROWTH_GSC_SITE_URL"];
const TIMEOUT_MS = 15000;
const MAX_PAGES = 40;

function loadEnv() {
  let fileEnv = {};
  try {
    const text = readFileSync(join(ROOT, ".env.local"), "utf8");
    fileEnv = Object.fromEntries(
      text.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    // .env.local なし(テスト・クラウド)。process.env だけで動かす。
  }
  return { ...fileEnv, ...process.env };
}

function parseArgs(argv) {
  const out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(ROOT, "out", "article-review");
  return { monthly: argv.includes("--monthly"), out };
}

async function accessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: new URLSearchParams({ client_id: env.GROWTH_GOOGLE_CLIENT_ID, client_secret: env.GROWTH_GOOGLE_CLIENT_SECRET, refresh_token: env.GROWTH_GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`Google OAuth 失敗: ${res.status}`);
  return (await res.json()).access_token;
}

/** 取得を1本ずつ独立させ、失敗は null と理由で返す(共通契約)。 */
async function attempt(errors, source, fn) {
  try {
    return await fn();
  } catch (e) {
    errors.push({ source, reason: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

const ARTICLE_FILTER = (field) => ({
  orGroup: { expressions: ["/columns/", "/news/"].map((value) => ({ filter: { fieldName: field, stringFilter: { matchType: "CONTAINS", value } } })) },
});

async function main() {
  const env = loadEnv();
  const missing = REQUIRED_ENV.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`必須の環境変数がありません: ${missing.join(", ")}`);
    process.exit(2);
  }
  const { monthly, out } = parseArgs(process.argv.slice(2));
  const today = jstToday();
  const windows = buildWindows(today);
  const origin = env.GROWTH_SITE_ORIGIN || "https://www.thepicklebang.com";
  const token = await accessToken(env).catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const errors = [];

  const ga4 = async (body) => {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.GROWTH_GA4_PROPERTY_ID}:runReport`, { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`GA4 失敗: HTTP ${res.status}`);
    return (await res.json()).rows ?? [];
  };
  const gsc = async (body) => {
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GROWTH_GSC_SITE_URL)}/searchAnalytics/query`, { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`GSC 失敗: HTTP ${res.status}`);
    return (await res.json()).rows ?? [];
  };
  const dim = (row, i) => row.dimensionValues[i].value;
  const num = (row, i) => Number(row.metricValues[i].value);
  const landing = { name: "landingPagePlusQueryString" };

  const daily = await attempt(errors, "ga4:daily", async () =>
    (await ga4({ dateRanges: [windows.ga4.daily], dimensions: [{ name: "date" }, landing], metrics: [{ name: "sessions" }], dimensionFilter: ARTICLE_FILTER("landingPagePlusQueryString"), limit: 10000 })).map((r) => ({ date: ga4DateToIso(dim(r, 0)), path: dim(r, 1), sessions: num(r, 0) })),
  );
  const channels = await attempt(errors, "ga4:channels", async () =>
    (await ga4({ dateRanges: [windows.ga4.cur], dimensions: [landing, { name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "averageSessionDuration" }], dimensionFilter: ARTICLE_FILTER("landingPagePlusQueryString"), limit: 5000 })).map((r) => ({ path: dim(r, 0), channel: dim(r, 1), sessions: num(r, 0), engagedSessions: num(r, 1), durationTotal: num(r, 2) * num(r, 0) })),
  );
  const sources = await attempt(errors, "ga4:sources", async () =>
    (await ga4({ dateRanges: [windows.ga4.cur], dimensions: [landing, { name: "sessionSource" }], metrics: [{ name: "sessions" }], dimensionFilter: { andGroup: { expressions: [ARTICLE_FILTER("landingPagePlusQueryString"), { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } }] } }, limit: 5000 })).map((r) => ({ path: dim(r, 0), source: dim(r, 1), sessions: num(r, 0) })),
  );
  const regions = await attempt(errors, "ga4:regions", async () =>
    (await ga4({ dateRanges: [windows.ga4.cur], dimensions: [landing, { name: "region" }], metrics: [{ name: "sessions" }], dimensionFilter: ARTICLE_FILTER("landingPagePlusQueryString"), limit: 5000 })).map((r) => ({ path: dim(r, 0), region: dim(r, 1), sessions: num(r, 0) })),
  );
  const pageViews = await attempt(errors, "ga4:pageViews", async () =>
    (await ga4({ dateRanges: [windows.ga4.cur], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }, { name: "userEngagementDuration" }], dimensionFilter: ARTICLE_FILTER("pagePath"), limit: 1000 })).map((r) => ({ path: dim(r, 0), pv: num(r, 0), users: num(r, 1), engagementSeconds: num(r, 2) })),
  );
  const events = await attempt(errors, "ga4:events", async () =>
    (await ga4({ dateRanges: [windows.ga4.cur], dimensions: [{ name: "pagePath" }, { name: "eventName" }, { name: "customEvent:location" }], metrics: [{ name: "eventCount" }], dimensionFilter: { andGroup: { expressions: [ARTICLE_FILTER("pagePath"), { filter: { fieldName: "eventName", inListFilter: { values: ARTICLE_EVENTS } } }] } }, limit: 5000 })).map((r) => ({ path: dim(r, 0), event: dim(r, 1), location: dim(r, 2), count: num(r, 0) })),
  );
  const gscRow = (r) => ({ impressions: r.impressions, clicks: r.clicks, position: r.position });
  const pageQueries = await attempt(errors, "gsc:pageQueries", async () =>
    (await gsc({ ...windows.gsc.cur, dimensions: ["page", "query"], rowLimit: 5000 })).map((r) => ({ page: r.keys[0], query: r.keys[1], ...gscRow(r) })),
  );
  const pageDates = await attempt(errors, "gsc:pageDates", async () =>
    (await gsc({ ...windows.gsc.daily, dimensions: ["page", "date"], dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "includingRegex", expression: "/(columns|news)/" }] }], rowLimit: 5000 })).map((r) => ({ page: r.keys[0], date: r.keys[1], ...gscRow(r) })),
  );
  const queryTotals = await attempt(errors, "gsc:queryTotals", async () =>
    (await gsc({ ...windows.gsc.cur, dimensions: ["query"], rowLimit: 500 })).map((r) => ({ query: r.keys[0], ...gscRow(r) })),
  );

  const paths = new Set();
  for (const r of [...(daily ?? []), ...(channels ?? []), ...(pageViews ?? [])]) {
    const p = normalizeArticlePath(r.path);
    if (isArticlePath(p)) paths.add(p);
  }
  for (const r of pageQueries ?? []) {
    const p = normalizeArticlePath(r.page);
    if (isArticlePath(p)) paths.add(p);
  }
  const pages = await attempt(errors, "site:html", async () => {
    const result = new Map();
    for (const path of [...paths].slice(0, MAX_PAGES)) {
      const res = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "pbt-article-review/1.0" } });
      if (!res.ok) throw new Error(`HTML 取得失敗: ${path} HTTP ${res.status}`);
      result.set(path, extractMeta(await res.text(), origin));
    }
    return result;
  });

  let publishedAtSource = "ga4-first-seen";
  let published = null;
  if (env.GROWTH_MICROCMS_PROD_DOMAIN && env.GROWTH_MICROCMS_PROD_READ_KEY) {
    published = await attempt(errors, "microcms:published", async () => {
      const result = new Map();
      for (const endpoint of ["columns", "news"]) {
        const res = await fetch(`https://${env.GROWTH_MICROCMS_PROD_DOMAIN}.microcms.io/api/v1/${endpoint}?limit=100&fields=id,slug,publishedAt,revisedAt`, { headers: { "X-MICROCMS-API-KEY": env.GROWTH_MICROCMS_PROD_READ_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`microCMS 失敗: ${endpoint} HTTP ${res.status}`);
        for (const c of (await res.json()).contents ?? []) {
          const date = (c.publishedAt ?? "").slice(0, 10);
          for (const p of [`/${endpoint}/${c.slug ?? c.id}`, `/en/${endpoint}/${c.slug ?? c.id}`]) {
            if (date && (!result.has(p) || date < result.get(p))) result.set(p, date);
          }
        }
      }
      return result;
    });
    if (published) publishedAtSource = "microcms";
  }

  const report = buildArticleProfiles({ today, daily, channels, sources, regions, pageViews, events, pageQueries, pageDates, queryTotals, pages, published });
  const meta = { generatedAt: new Date(Date.now() + 9 * 3600e3).toISOString().replace("Z", "+09:00"), mode: monthly ? "monthly" : "weekly", windows, publishedAtSource, errors };
  mkdirSync(out, { recursive: true });
  const jsonPath = join(out, `${today}.json`);
  writeFileSync(jsonPath, JSON.stringify({ meta, ...report }, null, 2));
  writeFileSync(join(out, `${today}.md`), formatMarkdown({ meta, ...report }));
  console.log(`書き出し: ${jsonPath}（記事 ${report.articles.length} 件・需要ギャップ ${report.demandGaps.length} 件・取得不可 ${errors.length} 件）`);
  process.exitCode = errors.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
});
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/analytics/reviewArticles.test.ts`
Expected: PASS（6件）。`regions.chibaShare` は 25/40 = 0.63、`cta.per100pv` は 6/60×100 = 10、GSC の記事順位 4.5・CTR 3% → `title_desc_rewrite`。

- [ ] **Step 6: `.env.example` に変数を追記する**

`.env.example` の `MICROCMS_*` セクションの直後に追記（値は空）:

```
# 記事レビュー CLI(scripts/analytics/reviewArticles.mjs)が本番の公開日を読むための読み取り専用キー。
# .env.local の MICROCMS_* は dev サービスを指すため、本番用は別名で持つ(設計書 2026-09-11 §7 ⑤)。
GROWTH_MICROCMS_PROD_DOMAIN=
GROWTH_MICROCMS_PROD_READ_KEY=
# 任意: 記事 HTML を読むオリジン(既定 https://www.thepicklebang.com)
GROWTH_SITE_ORIGIN=
```

- [ ] **Step 7: 全テストと lint を回す**

Run: `npx vitest run scripts/analytics && npm run lint`
Expected: 全件 PASS、lint エラーなし

- [ ] **Step 8: 実データで1回だけ手動実行する（オーナーの `.env.local` がある環境で）**

Run: `node scripts/analytics/reviewArticles.mjs --out out/article-review`
Expected: `out/article-review/<今日>.json` と `.md` ができ、記事 25 本前後（ja/en 込み）、`meta.errors` が空。`microCMS` のキー未設定なら `publishedAtSource` は `ga4-first-seen` で、これは想定内（Task 8 でオーナーがキーを足す）。`.md` を開いて、9/10 の対話分析と同じ順位・入口の値が出ていることを目視する（cost-guide の順位 5 前後・入口 700 前後）。

- [ ] **Step 9: コミット**

```bash
git add scripts/analytics/reviewArticles.mjs scripts/analytics/reviewArticles.test.ts scripts/analytics/fixtures/mockArticleReview.mjs .env.example
git commit -m "feat(analytics): 記事レビュー CLI を追加する(GA4/GSC/HTML/microCMS を読み取り JSON と Markdown を出力)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: ルーチンのプロンプト正本とローカルタスク登録

**Files:**
- Create: `docs/growth/routines/article-review.md`
- Create: `~/.claude/scheduled-tasks/article-review/SKILL.md`（`create_scheduled_task` で登録。リポジトリ外）

**Interfaces:**
- Consumes: `node scripts/analytics/reviewArticles.mjs` の出力 JSON（Task 7）、Notion 記事ネタ案 DB（`collection://5adab8b1-f182-4123-b963-9463a2580d4a`）、施策提案 DB（読み取りのみ `collection://3503f4bc-b1c4-4927-91ce-7609a6c4e460`）
- Produces: 週次ブリーフの「## 記事アクション」表（Task 9 の weekly-driver が収穫する契約）

- [ ] **Step 1: オーナー作業を依頼する（実装者は待たずに Step 2 へ進む）**

オーナーに次の2点を依頼するメッセージを出す:
1. Notion に親ページ「記事レビュー」を作り、URL を共有する（ブリーフはその配下に作る）。
2. `.env.local` に `GROWTH_MICROCMS_PROD_DOMAIN=thepicklebang` と `GROWTH_MICROCMS_PROD_READ_KEY=<.env.production の MICROCMS_API_KEY の値>` を追加する。

- [ ] **Step 2: プロンプト正本を書く**

```markdown
<!-- docs/growth/routines/article-review.md -->
# 記事レビュー（ローカル週次タスク用プロンプト・正本）

> このファイルの本文全体が、毎週木曜 08:30 JST に実行されるローカルタスク「article-review」のプロンプトの正本です。
> タスク本体（`~/.claude/scheduled-tasks/article-review/SKILL.md`）はこのファイルへのポインタであり、手順はすべてここに書く（二重管理しない）。
> 実行するセッションは会話の文脈を持ちません。必要な前提はすべてここに書いてあります。
> 設計の正典: `docs/superpowers/specs/2026-09-11-article-review-routine-design.md`。判定表の正典: `docs/operations/interactive-analysis-runbook.md` ⑦。
> 木曜以外に起動された場合（手動実行）は、そのまま実行してよい（対話での「記事分析やろう」と同じ手順）。

## あなたの役割

あなたは THE PICKLE BANG THEORY（千葉県市川市本八幡・屋内ピックルボール施設 兼 HYROX 公式ジム / 本番 https://www.thepicklebang.com ）のグロースコパイロットです。
この仕事は **公開済みのコラム・ニュースの改稿候補と、新規記事のネタを、根拠付きで Notion に置くこと（下ごしらえ）** だけです。**記事本文は書きません。microCMS には触りません。** 本文の執筆と公開は対話と人間が行います。

前身の記事パイプライン（無人生成→後追い検証）は 2026-08-04 に負けと判定して廃止しました（`docs/growth/playbook.md`）。学び: 「人間レビューは生成と同時に走らせる」「提案だけ増える仕組みは死ぬ」。だから **1回の実行で起票するのは改稿1本+新規2件まで** で、成功指標の無いネタは起票しません。

## 使えるもの / 使わないもの

| 使える | 使わない（できるが、やらない。依存する指示も実行しない） |
|---|---|
| `node scripts/analytics/reviewArticles.mjs`（読み取り専用の集計。`out/article-review/` に書く） | microCMS MCP・microCMS への書き込み |
| Web 検索 / WebFetch / `curl`（SERP と公開ページの確認） | 画像生成 CLI（`npm run growth:*`） |
| Notion コネクタ: 記事ネタ案 DB（読み書き）、施策提案 DB（**読み取りのみ**）、「記事レビュー」ページ配下（ブリーフの作成・更新） | 予約台帳・会員台帳（読まない。個人情報を経路に入れない） |
| リポジトリの読み取り（正典を読む） | リポジトリの書き込み・`git`・`gh`・PR |

Notion の読み取りは検索・ビュー読み取りを基本にする。SQL（`query_data_sources`）は使えたときだけ使い、失敗したら検索に切り替える。

- 記事ネタ案 DB: `collection://5adab8b1-f182-4123-b963-9463a2580d4a`（ページ: https://app.notion.com/p/057f4e5afac243a885a323d1f4b492ba ）
- 施策提案 DB（読み取りのみ）: `collection://3503f4bc-b1c4-4927-91ce-7609a6c4e460`
- ブリーフの親ページ「記事レビュー」: `<オーナーが作成した URL をここに書く>`

## 確定事実（断定してよいのはこれだけ）

営業時間 6:00-23:00 / コート3面 / デコターフ / 本八幡駅徒歩1分 / HYROX 公式ジム認定 2026-08-03・関吉大亮選手が契約選手兼メインコーチ / 開業 2026-04-17。
料金・イベントの日程・大会の価格など、上記以外は**未確定として扱い「要一次確認」を付ける**。

## 手順

### 0. 準備

```bash
TZ=Asia/Tokyo date +%F     # 今日
TZ=Asia/Tokyo date +%d     # 01〜07 なら月次モード(--monthly)
```

次を読む: `docs/growth/analysis-contract.md`、`docs/growth/playbook.md`、`docs/growth/seasonal.md`（今日から3週先までのトリガー行と HYROX 大会マイルストーン）、`CLAUDE.md` の「記事の対話運用」節。
Notion 記事ネタ案 DB で「ステータス」が `提案中` と `下書き作成済み` の行のタイトル案を列挙する（重複起票の防止）。
Notion「記事レビュー」配下で前週のブリーフ（タイトル `YYYY-MM-DD 記事レビュー`）を読む（前週の「次週の候補」を引き継ぐ）。前週分が無ければ「前週ブリーフなし」と注記に書いて進む。

### 1. 集計スクリプトを実行する

```bash
node scripts/analytics/reviewArticles.mjs            # 通常週
node scripts/analytics/reviewArticles.mjs --monthly  # 第1木曜
```

`out/article-review/<今日>.json` を読む。`meta.errors` にある項目は本文で「取得不可」と書き、0 や推測で埋めない。
スクリプトが起動できない（終了コード 2、または JSON が無い）場合は **Notion に何も書かず**、メッセージに失敗理由だけを残して終了する。

### 2. 候補を選ぶ

**改稿候補（最大1本、ja のみ）**: `hint` が `title_desc_rewrite` / `body_boost` / `cta_check` の記事のうち、`queries` の表示合計が最大のもの。ただし次に当たる記事は除外し、記事アクション表に `判定待ち` として載せる:
- 記事ネタ案 DB の該当行で「28日判定日」「56日判定日」「90日判定日」のいずれかが今日より後
- 施策提案 DB で「状態」が `計測中` または `判定待ち` の施策の「成果物リンク」「仮説」にその記事のスラッグが含まれる

`flags` は改稿方針の材料にする: `katakana_gap` → title/description にカタカナ表記を足す、`no_inbound_links` → 内部リンクの追加を「改稿」ではなく他記事側の作業として書く、`stale_date_text` → 日付表記の更新、`weekly_spike` → 原因（大会・販売日・公開）を seasonal と突き合わせて注記する。

**新規ネタ（最大2件）**: 次の3源から選ぶ。
- `demandGaps`（表示が多い順。受けページがホームか順位 > 8）
- `seasonal.md` のトリガー日が今日から3週以内の行
- HYROX 大会マイルストーンの告知・12週プログラム・大会直後の窓

既存記事（`articles` の title と slug）または「提案中」「下書き作成済み」の行と検索意図が実質同一なら起票せず、ブリーフに「起票しない理由」を1行書く。上限を超えた候補は「次週の候補」に1行で残す。

### 3. SERP を確認する（合計5クエリまで）

改稿候補の主クエリ（`queries[0]`）と新規ネタの主クエリについて Web 検索し、上位10件のタイトルと種別（公式 / ポータル / ジム / 記事 / SNS）を記録し、「勝てる角度」を1行で書く。上位が公式・大手ポータルで埋まる語は、記事で狙わず「施設ページや別の語で受ける」と書く。

### 4. 本格リサーチ（新規ネタの上位1件のみ）

一次情報候補の URL（公式・自治体・協会・自施設の募集ページ）、H2 構成案（5〜7個）、既存記事との差分、excerpt 案（結論先出し 120〜160 字）を作る。料金・日程・所要時間は「要一次確認」を付け、断定しない。体験談はオーナー提供の一次情報が無い限り書かない。

### 5. Notion 記事ネタ案 DB に書く（書き込み順: 公開済み行 → 新規行）

**公開済み記事（`articles` の ja 全件）の既存行**（タイトル案で検索。無ければ作らない）:
- 「成績データ」: `入口S=<last28.entry> (前期 <prevEntry>) / PV=<pv> / CTA=<cta.per100pv>回/100PV / 非指名 表示<合計> 順位<queries[0].position> / Yahoo<yahooShare> / 千葉<chibaShare> / ヒント=<hint> / フラグ=<flags>` を1行
- 「成績更新時刻」: 今日
- 「公開後判定」: `continue` → `成功` / `too_early` と判定窓の途中 → `様子見` / `title_desc_rewrite` `body_boost` `cta_check` → `要改稿` / `sunset_candidate` → 公開後判定は変えず「ステータス」を `クローズ` にし「判定メモ」に理由 / `no_data` → 変更しない
- 改稿候補の行だけ「修正タイトル案」「修正案」（方針の箇条書き。本文は書かない）

**新規ネタ**: 「提案中」で新規行。タイトル案が同一の「提案中」行が既にあれば新規行を作らず、その行の「根拠」「成績更新時刻」だけを更新する。
- 媒体（コラム/ニュース）・記事タイプ・コラムカテゴリ・検索意図・根拠（狙うクエリの表示数と現状の受けページ、カニバリ判定）・狙う読者・想定CTA
- 成功指標: `公開28日で入口セッション ≥ 5、56日で狙うクエリの非指名順位 ≤ 10`（既定値。変える理由があれば書く）
- 上位1件は「構成案」「一次情報メモ」も

途中で失敗したら残りは書かず、完了分と未完了分をメッセージに列挙する。

### 6. 週次ブリーフを書く

「記事レビュー」ページの配下に `YYYY-MM-DD 記事レビュー` を1枚作る。同じ日付のページが既にあれば新規作成せず上書き更新する。節は固定:

```
## 結論
<3行。今週やること・やらないこと・理由>

## 記事アクション
| 対象 | 種別 | 理由 | 判定日 | Notion |
|---|---|---|---|---|
| <slug またはネタ名> | 改稿 / 新規 / 看取り / 判定待ち / 公開待ち | <1行> | YYYY-MM-DD または - | <URL> |

## 記事別の数字
<articles の ja 全件。入口S・前期比・PV・Yahoo率・千葉率・CTA/100PV・非指名表示・順位・ヒント・フラグ>

## SERP 比較
<手順3の記録>

## 需要ギャップ
<demandGaps 上位10件と、それぞれを「既存改稿で受ける / 新規 / 書かない」のどれにしたか>

## 注記
<取得不可・前週ブリーフなし・並走メモ・次週の候補>
```

「記事アクション」表は週次ドライバー（木曜 10:00）の Step R1b が収穫する。**列構成・列順・種別の語彙を変えない。**

### 7. 月次モード（第1木曜）で追加すること

- 全記事（ja）の判定表（記事別の数字にヒントを添える。runbook ⑦ の月初作業の代替）
- 看取り候補（`sunset_candidate`）の一覧と、放置でよいか再利用かの案
- 翌月の執筆枠（最大2本）と、その根拠

判定の確定は対話でオーナーが行う。本番は何も変わらないので 48 時間の自動確定は使わない。

### 8. メッセージ

結論3行とブリーフのリンクだけを送る。書き込みに失敗した項目があれば必ず列挙する。

## 規律

- 事実と推測を分ける。SERP や競合から拾った数字には出典 URL と確認日を付ける。
- 起票の必須条件（狙うクエリの表示数と受けページ・カニバリ判定・成功指標）を書けないネタは起票しない。
- 判定窓の途中の記事は改稿候補にしない。外部要因で交絡していれば「判定不能・ベースライン再設定」の提案に留める。
- 個人情報を書かない（台帳を読まないので経路に入らない）。
- 分量: ブリーフは結論と記事アクション表を先頭に置き、オーナーが5分で判断できる量にする。
```

- [ ] **Step 3: ローカルタスクを登録する**

`create_scheduled_task` を次の内容で呼ぶ（MCP `scheduled-tasks`）:

- `taskId`: `article-review`
- `title`: `【木曜】記事レビュー`
- `description`: `公開済みコラム・ニュースの改稿候補と新規ネタを根拠付きで Notion に置く週次の下ごしらえ（正本: docs/growth/routines/article-review.md）`
- `cronExpression`: `30 8 * * 4`
- `prompt`:

```
あなたは THE PICKLE BANG THEORY のグロースコパイロットの「記事レビュー」タスクです。

## 実行手順

1. Read ツールで `/Users/tsutsumi.akihiro/dev/bigban/docs/growth/routines/article-review.md` を読む。これがこのタスクのプロンプトの正本であり、役割・規律・手順・出力フォーマット・Notion 保存の契約がすべて書いてある。
2. 正本に書かれた手順0〜8をそのまま実行する（作業ディレクトリは `/Users/tsutsumi.akihiro/dev/bigban`）。

## 正本が読めない場合（フォールバック）

ファイルが存在しない・読めない場合は、記憶で代行せず、次の1行だけを出力して終了する:
「記事レビューが実行できませんでした（原因: 正本 docs/growth/routines/article-review.md が読めない）」
Notion への書き込みも行わない。

## 絶対の制約（正本と重複するが再掲）

- microCMS への書き込み・記事本文の生成・リポジトリへの書き込み・git・gh・PR 作成・画像生成 CLI・LINE 配信は行わない
- Notion は記事ネタ案 DB（collection://5adab8b1-f182-4123-b963-9463a2580d4a）と「記事レビュー」ページ配下以外に書き込まない。施策提案 DB は読み取りのみ
- 予約台帳・会員台帳は読まない
- 失敗を黙って飛ばさない。集計スクリプトが起動できなければ Notion に何も書かず失敗理由だけを報告する
```

Expected: `list_scheduled_tasks` に `article-review` が `30 8 * * 4`・enabled で載る。

- [ ] **Step 4: 正本ファイルをコミットする**

```bash
git add docs/growth/routines/article-review.md
git commit -m "docs(growth): 記事レビュールーチンのプロンプト正本を追加する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 既存ドキュメントの接続（weekly-driver・runbook・README）

**Files:**
- Modify: `docs/growth/routines/weekly-driver.md`（`### R1. Morning Business Brief の収穫（最優先）` の節の直後、`### R2.` の前）
- Modify: `docs/operations/interactive-analysis-runbook.md:46-47`
- Modify: `docs/growth/README.md:11`（`routines/morning-brief.md` の行の直後）

**Interfaces:**
- Consumes: Task 8 のブリーフ「## 記事アクション」表（列: 対象 / 種別 / 理由 / 判定日 / Notion）

- [ ] **Step 1: weekly-driver に R1b を追加する**

`### R2. 国内ピックルボール` の直前に挿入:

```markdown
### R1b. 記事レビューの収穫

ローカルの記事レビュー（木曜 08:30・正本 `docs/growth/routines/article-review.md`）が Notion「記事レビュー」配下に `YYYY-MM-DD 記事レビュー` を残している。
当日分（無ければ直近7日で最新の1枚）を Notion 検索で特定し、**`## 記事アクション` テーブルだけを収穫する**（列: 対象 / 種別 / 理由 / 判定日 / Notion。種別は 改稿 / 新規 / 看取り / 判定待ち / 公開待ち）。
種別が `改稿` `新規` の行を「今週のアクション」候補に載せる（記事の執筆・改稿は対話の担当なので、ここでは「対話で着手する」と書くだけ）。`判定待ち` は実験レーンの判定日と突き合わせて矛盾がないか確認する。
当日分も直近7日分も無ければ「記事レビューなし（Mac 未起動の可能性）」と1行書いて R2 へ進む。
```

- [ ] **Step 2: runbook の ⑥⑦ に参照を足す**

`docs/operations/interactive-analysis-runbook.md` の 46〜47 行目を次に置き換える:

```
⑥ SEO        : query.mjs --days 28 の取りこぼしクエリ→記事ネタ判定(木曜の記事レビューが先に出す。正本 docs/growth/routines/article-review.md)
⑦ 記事成績   : query.mjs --days 28 の「## 記事成績」→継続/改稿/看取り判定(旧 review-due の代替。第1木曜の記事レビュー --monthly が同じ判定表で下ごしらえ済み)
```

- [ ] **Step 3: README の表に行を足す**

`docs/growth/README.md` の `routines/morning-brief.md` の行の直後に追加:

```markdown
| `routines/article-review.md` | 記事レビュー(木曜 08:30・ローカル)のルーチンプロンプト正本。`scripts/analytics/reviewArticles.mjs` の JSON を読み、改稿候補1本+新規ネタ2件を Notion 記事ネタ案 DB と週次ブリーフに置く。**本文は書かない**。ブリーフの「## 記事アクション」表を週次 R1b が収穫する |
```

- [ ] **Step 4: 差分を確認してコミットする**

Run: `git diff --stat`
Expected: 3ファイル、合計 10 行前後の追加

```bash
git add docs/growth/routines/weekly-driver.md docs/operations/interactive-analysis-runbook.md docs/growth/README.md
git commit -m "docs(growth): 週次ドライバー・runbook・README を記事レビューに接続する

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 初回の手動実行・PR・並走開始

**Files:** なし（PR 作成と Notion 確認）

- [ ] **Step 1: 対話で初回実行する**

オーナーの環境で、`docs/growth/routines/article-review.md` の手順0〜8を対話で実行する（ローカルタスクの木曜を待たない）。
Expected: Notion 記事ネタ案 DB の公開済み記事の行に「成績データ」「公開後判定」が入り、「記事レビュー」配下にブリーフが1枚できる。「記事アクション」表の種別が語彙どおり。

- [ ] **Step 2: 対話の判定と突き合わせる（並走1週目）**

2026-09-10 の対話分析（artifact「コラム8本の成績表」と「コラム判定 9月9日」）の判定と、ブリーフの改稿候補・新規ネタを比較し、差分を「注記」に「並走メモ」として書く。差分の原因がスクリプトなら修正して Task 6/7 のテストを足し、解釈ならプロンプト正本を直す。

- [ ] **Step 3: 全テスト・lint・ビルドを回す**

Run: `npm test && npm run lint && npm run build`
Expected: 全件 PASS。カバレッジ閾値 100% を満たす。

- [ ] **Step 4: push して draft PR を作る（AI アカウント）**

```bash
gh auth status   # active account が ttmakhr1028ai-art であること。違えば gh auth switch --user ttmakhr1028ai-art
git push -u origin feat/article-review-routine
gh pr create --base develop --draft --title "feat(analytics): 記事レビュールーチンと集計 CLI を追加する" --body "$(cat <<'EOF'
## 何を変えたか
- `scripts/analytics/articleReview.mjs` / `reviewArticles.mjs`: 記事ごとの週次入口・チャネル・地域・CTA・GSC クエリ・判定ヒント・需要ギャップを JSON/Markdown に出す（読み取りのみ）
- `docs/growth/routines/article-review.md`: 木曜 08:30 のローカル週次ルーチン正本（改稿候補1本+新規ネタ2件を Notion に置く。本文は書かない）
- weekly-driver Step R1b / runbook ⑥⑦ / README の接続

## なぜ
設計書 `docs/superpowers/specs/2026-09-11-article-review-routine-design.md`。記事分析が毎回 ad-hoc スクリプトで再現性が無かったため。

## テスト
- 純関数: `scripts/analytics/articleReview.test.ts`（全分岐・カバレッジ100%）
- CLI: `scripts/analytics/reviewArticles.test.ts`（MSW で 正常 / GSC 失敗 / microCMS キー無し / 記事0件 / env 不足）
- 手動: 実データで1回実行し、9/10 の対話分析と値を照合

## 残タスク
- [ ] Notion「記事レビュー」親ページの URL を正本に記入（オーナー）
- [ ] `.env.local` に `GROWTH_MICROCMS_PROD_*` を追加（オーナー）
- [ ] 並走2週（2週連続で対話の判定と一致したら終了）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: draft PR が作成される。マージは人間が行う。

- [ ] **Step 5: 並走の終了判定を予定に入れる**

翌週・翌々週の木曜（9/17・9/24 以降の該当日）の対話で、ブリーフの候補と対話の判定を突き合わせ、2週連続一致で並走終了（設計書 §6）。一致しなければ原因を直してもう1週（最長4週）。終了時に PR の残タスクを更新する。

---

## セルフレビュー

**1. 仕様カバレッジ**

| 設計書の要件 | タスク |
|---|---|
| §2 構成と流れ（スクリプト→AI→Notion→週次ドライバー） | Task 7・8・9 |
| §3.1 ファイル構成（純関数 + CLI + fixtures、`isBrandQuery` 再利用、`query.mjs` 変更なし） | Task 1〜7 |
| §3.2 取得（GA4 6種・GSC 3種・HTML・microCMS 本番キー） | Task 7 |
| §3.3 出力 JSON/MD（`meta.errors`・null） | Task 6・7 |
| §3.4 判定ヒント7種 | Task 5 |
| §3.5 フラグ4種 | Task 4・5 |
| §3.6 エラー処理・性能（独立取得・終了コード1・15秒タイムアウト） | Task 7 |
| §4.1 置き場とスケジュール（cron `30 8 * * 4`） | Task 8 |
| §4.2 手順（正典・候補選定・SERP・本格リサーチ・Notion 書き込み・冪等性・書き込み順・ブリーフ・メッセージ） | Task 8 |
| §4.3 記事アクション表の契約と weekly-driver R1b | Task 8・9 |
| §4.4 月次モードと runbook ⑥⑦ の参照 | Task 7（`--monthly`）・Task 8・9 |
| §5 ガードレール | Task 8（正本と SKILL.md の制約） |
| §6 テストと並走 | Task 1〜7（テスト）・Task 10（並走） |
| §7 前提（env 名・cron・Notion 親ページ） | Task 7 Step 6・Task 8 Step 1・3 |
| §8 成功条件（12週後） | Task 10 Step 5 で並走終了を記録。12週後の判定は月次ストラテジストの対話で行う（本計画の範囲外） |
| §10 実装範囲 1〜5 | Task 1〜10 |

**2. プレースホルダ**: 「TBD」「適切に」「必要に応じて」は使っていない。Task 8 の親ページ URL はオーナー作業の結果を書き込む箇所として明示している（Step 1 で依頼）。

**3. 型と名前の一貫性**: `buildArticleProfiles` の入力キー（`daily / channels / sources / regions / pageViews / events / pageQueries / pageDates / queryTotals / pages / published`）は Task 6 の fixture・Task 7 の CLI・Task 7 の MSW で同じ名前を使っている。`hint` の7値と `flags` の4値は Task 5 の定数と Task 8 の正本で一致。`summarizeChannels` の入力 `durationTotal` は CLI 側で `averageSessionDuration × sessions` を掛けて渡す（Task 7）。`formatMarkdown` の見出しは Task 6 の注意書きどおり `meta.generatedAt.slice(0, 10)` を使う。
