# 計測の修理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 効果判定に使える計測の土台を直す。サイトと LaBOLA を分けた集計、GA4 完了と予約台帳・テニスベア申込の週次突合、実ユーザー表示速度の定点取得を入れる。

**Architecture:** `query.mjs`(クラウド実行の素の node)には GA4 の `hostName` 分離と LaBOLA 段別集計だけを足す。週次の突合は Notion と テニスベアを読むためローカル実行の TypeScript(`tsx`)に分け、`scripts/analytics/weekly/` に純ロジックと薄い入口を置く。結果は画面に出すだけで、どこにも書き込まない。

**Tech Stack:** Node(`.mjs`)・TypeScript(tsx)・Vitest+MSW・zod(導入済み)・dotenv(導入済み)・`@vercel/speed-insights`(新規・承認済み)

**Spec:** `docs/superpowers/specs/2026-10-01-szb-505-measurement-design.md`

## Global Constraints

- コミットは司令塔の OK が出るまで絶対にしない(各タスクの「Commit」手順は OK 後にまとめて行う。途中は `git add` もしない)。
- 新しい依存は `@vercel/speed-insights` の1つだけ(承認済み)。
- `vitest.config.ts` の除外追加・`istanbul ignore` の新規追加・`.only/.skip` は禁止。カバレッジは statements/branches/functions/lines すべて 100%。
- `any` 禁止(`unknown` + 絞り込み)、`import type` を使う、strict。テストは対象と同じ場所に `名前.test.ts`。
- 外部通信のテストは MSW(fetch の直接モックはしない)。
- 台帳は**受付日時・ステータス・予約番号の3列だけ**読む。氏名・電話・メールなど個人情報の列は取得しない・出力しない。
- テスト予約は `scripts/hyrox-class/config.ts` の `EXCLUDED_RESERVATION_NOS` で除く。
- 出力は件数だけ。テニスベアの参加者名は読んでも出力・ログ・テストデータに残さない。
- GA4 管理画面・Vercel・PSI キー発行など外部サービスの設定は手順書にだけ書く(コードで触らない)。
- 既存ファイルの無関係な整形をしない(`messages/ja.json`・`messages/en.json` は触らない)。
- コミットメッセージは日本語の Conventional Commits。

## Review Focus

- 週の境界: 日曜 23:59(JST)と月曜 0:00 の申込・完了が正しい週に入る。年またぎの週(12/29〜1/4)が壊れない。→ Task 5
- GA4 の日付は UTC ではなく JST 前提のプロパティ設定で `YYYYMMDD` が返る。台帳の受付日時はオフセット付き時刻と日付のみが混在する。どちらも JST の日付に揃える。→ Task 5・7
- GA4 が行を丸めた・しきい値でデータを間引いた・ページ分割された場合に、静かに少なく数えない(不完全なら失敗扱い)。→ Task 6
- テニスベアの `applyDateTime` が null の申込、開催中止の回、主催者本人の申込。null は「日付不明」として別に数え、件数に黙って混ぜない。→ Task 8
- PSI のキー無し・429・ページ単位が件数不足(`origin_fallback`)・指標の一部欠落。いずれも「0」と区別して出す。→ Task 9
- 1つの節が失敗しても他の節の結果を出し、終了コードは非ゼロにする。→ Task 10
- 自動アクセス除外のフィルタは「画面 800x600 **かつ** Linux」の AND。800x600 の実ユーザー(古い端末)や Linux の実ユーザーを単独で巻き込まない。→ Task 2

---

### Task 1: Speed Insights を layout に追加する

**Files:**
- Modify: `package.json`, `package-lock.json`(依存追加)
- Modify: `src/app/[locale]/layout.tsx:150`
- Test: `src/app/[locale]/layout.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: すべてのページに `<SpeedInsights />` が出る。

- [ ] **Step 1: 依存を入れる**

Run: `npm install @vercel/speed-insights`
Expected: `package.json` の dependencies に `@vercel/speed-insights` が1つだけ増える。

- [ ] **Step 2: 失敗するテストを書く**

`src/app/[locale]/layout.test.tsx` の先頭の `vi.mock` 群に次を足す(`vi.mock("../../globals.css"...)` の直前)。

```tsx
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <div data-testid="speed-insights" />,
}));
```

既存の `describe("LocaleLayout"` の中、描画を検証している既存テストの隣に次を足す。既存テストが `await LocaleLayout(...)` を `render` する書き方に合わせる(下は同じ形を使った例。実際のヘルパー名はファイル内の既存テストに合わせる)。

```tsx
it("Speed Insights を描画する", async () => {
  const ui = await LocaleLayout({
    children: <p>本文</p>,
    params: Promise.resolve({ locale: "ja" }),
  });
  render(ui);
  expect(screen.getByTestId("speed-insights")).toBeInTheDocument();
});
```

- [ ] **Step 3: 落ちることを確認する**

Run: `npx vitest run "src/app/[locale]/layout.test.tsx"`
Expected: FAIL(`speed-insights` が見つからない)

- [ ] **Step 4: 実装する**

`src/app/[locale]/layout.tsx` の import に `import { SpeedInsights } from "@vercel/speed-insights/next";` を `Analytics` の import の次の行に足し、`<Analytics />` の次の行に `<SpeedInsights />` を足す。

```tsx
        <Analytics />
        <SpeedInsights />
        <GoogleAnalyticsTag />
```

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run "src/app/[locale]/layout.test.tsx"`
Expected: PASS

---

### Task 2: ホスト・自動アクセスの GA4 フィルタ部品(`hosts.mjs`)

**Files:**
- Create: `scripts/analytics/hosts.mjs`
- Test: `scripts/analytics/hosts.test.ts`

**Interfaces:**
- Produces(`hosts.mjs`):
  - `SITE_HOST = "www.thepicklebang.com"`、`LABOLA_HOST = "yoyaku.labola.jp"`
  - `stringFilter(fieldName: string, value: string, matchType?: string)` → GA4 の `{ filter: {...} }`
  - `hostFilter(host: string)` → `hostName` 完全一致
  - `excludeAutomatedAccess()` → 画面 `800x600` かつ OS `Linux` を除く `notExpression`
  - `andFilters(...expressions)` → 空・undefined を除いて AND でまとめる。1つならそのまま、0個なら `undefined`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LABOLA_HOST, SITE_HOST, andFilters, excludeAutomatedAccess, hostFilter, stringFilter } from "./hosts.mjs";

describe("GA4 フィルタ部品", () => {
  it("ホスト名は hostName の完全一致", () => {
    expect(hostFilter(SITE_HOST)).toEqual({
      filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: "www.thepicklebang.com" } },
    });
    expect(LABOLA_HOST).toBe("yoyaku.labola.jp");
  });

  it("文字列フィルタは一致方式を変えられる", () => {
    expect(stringFilter("pagePath", "/x", "CONTAINS").filter.stringFilter.matchType).toBe("CONTAINS");
  });

  it("自動アクセスは『800x600 かつ Linux』の AND を NOT で除く(片方だけでは除かない)", () => {
    const expression = excludeAutomatedAccess();
    expect(expression.notExpression.andGroup.expressions).toEqual([
      stringFilter("screenResolution", "800x600"),
      stringFilter("operatingSystem", "Linux"),
    ]);
  });

  it("andFilters は空を除き、1つならそのまま、0個なら undefined", () => {
    const a = hostFilter(SITE_HOST);
    const b = stringFilter("pagePath", "/x");
    expect(andFilters(a, undefined, b)).toEqual({ andGroup: { expressions: [a, b] } });
    expect(andFilters(undefined, a)).toBe(a);
    expect(andFilters(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/hosts.test.ts`
Expected: FAIL(`hosts.mjs` が無い)

- [ ] **Step 3: 実装する**

```js
// GA4 は自社サイトと LaBOLA を同じプロパティで計測する。ホストを分けて集計するための部品。
// 自動アクセスは 2026-09-16 から LaBOLA のカレンダーに来ている「画面 800x600・Linux」の巡回
// (V 調査 2026-09-30。自社の処理ではなく第三者の巡回とみている)。
export const SITE_HOST = "www.thepicklebang.com";
export const LABOLA_HOST = "yoyaku.labola.jp";
const AUTOMATED_SCREEN = "800x600";
const AUTOMATED_OS = "Linux";

export function stringFilter(fieldName, value, matchType = "EXACT") {
  return { filter: { fieldName, stringFilter: { matchType, value } } };
}

export function hostFilter(host) {
  return stringFilter("hostName", host);
}

/** 画面 800x600 かつ Linux のときだけ除く。どちらか片方だけの実ユーザーは巻き込まない。 */
export function excludeAutomatedAccess() {
  return {
    notExpression: {
      andGroup: {
        expressions: [stringFilter("screenResolution", AUTOMATED_SCREEN), stringFilter("operatingSystem", AUTOMATED_OS)],
      },
    },
  };
}

export function andFilters(...expressions) {
  const list = expressions.filter((expression) => expression !== undefined);
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : { andGroup: { expressions: list } };
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/hosts.test.ts`
Expected: PASS

---

### Task 3: LaBOLA 段別集計(`labolaFunnel.mjs`)

**Files:**
- Create: `scripts/analytics/labolaFunnel.mjs`
- Test: `scripts/analytics/labolaFunnel.test.ts`

**Interfaces:**
- Consumes: `hosts.mjs` の `LABOLA_HOST`・`hostFilter`・`stringFilter`・`andFilters`・`excludeAutomatedAccess`
- Produces:
  - `LABOLA_STEPS: { label: string; matchType: string; value: string }[]`(週カレンダー・予約情報・顧客情報・支払い・最終確認・完了の6段)
  - `collectLabolaFunnel(ga4: (body: object) => Promise<{ rows?: {metricValues: {value: string}[]}[] }>, range: {startDate: string; endDate: string}): Promise<{ label: string; all: number; human: number }[]>`
  - `formatLabolaFunnel(rows): string`

各段のユーザー数は `totalUsers`(ディメンションなし)。`all` は自動アクセスを除かない値、`human` は除いた値。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LABOLA_STEPS, collectLabolaFunnel, formatLabolaFunnel } from "./labolaFunnel.mjs";

const range = { startDate: "2026-09-17", endDate: "2026-09-29" };

function report(value: string | null) {
  return value === null ? {} : { rows: [{ metricValues: [{ value }] }] };
}

describe("LaBOLA 段別集計", () => {
  it("6段を定義している(週カレンダー〜完了)", () => {
    expect(LABOLA_STEPS.map((step) => step.label)).toEqual(["週カレンダー", "予約情報", "顧客情報", "支払い", "最終確認", "完了"]);
  });

  it("各段を『除かない/自動アクセス除外』の2回で引き、LaBOLA ホストに絞る", async () => {
    const bodies: { dimensionFilter: unknown; dateRanges: unknown }[] = [];
    const ga4 = async (body: object) => {
      bodies.push(body as { dimensionFilter: unknown; dateRanges: unknown });
      const isHumanOnly = JSON.stringify(body).includes("notExpression");
      return report(isHumanOnly ? "10" : "30");
    };
    const rows = await collectLabolaFunnel(ga4, range);
    expect(rows[0]).toEqual({ label: "週カレンダー", all: 30, human: 10 });
    expect(bodies).toHaveLength(12);
    expect(JSON.stringify(bodies[0].dimensionFilter)).toContain("yoyaku.labola.jp");
    expect(bodies[0].dateRanges).toEqual([range]);
  });

  it("行が無い段は 0 として扱う", async () => {
    const rows = await collectLabolaFunnel(async () => report(null), range);
    expect(rows.every((row) => row.all === 0 && row.human === 0)).toBe(true);
  });

  it("整形は自動アクセスの数と、除外後の前段からの通過率を出す", () => {
    const text = formatLabolaFunnel([
      { label: "週カレンダー", all: 300, human: 100 },
      { label: "予約情報", all: 60, human: 25 },
      { label: "顧客情報", all: 0, human: 0 },
    ]);
    expect(text).toContain("週カレンダー  全体=300 自動除外後=100 (自動アクセス 200)");
    expect(text).toContain("予約情報  全体=60 自動除外後=25 (自動アクセス 35) 前段から25%");
    expect(text).toContain("顧客情報  全体=0 自動除外後=0 (自動アクセス 0) 前段から0%");
  });

  it("前段が 0 のときの通過率は『―』", () => {
    const text = formatLabolaFunnel([
      { label: "週カレンダー", all: 0, human: 0 },
      { label: "予約情報", all: 5, human: 5 },
    ]);
    expect(text).toContain("予約情報  全体=5 自動除外後=5 (自動アクセス 0) 前段から―");
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/labolaFunnel.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

```js
// LaBOLA(予約システム)の段別ユーザー数。ページパスは 2026-10-01 に GA4 の実データで確認した。
// 完了ページは /r/api/payment/booking/complete/<id>(決済戻りの先)。
import { LABOLA_HOST, andFilters, excludeAutomatedAccess, hostFilter, stringFilter } from "./hosts.mjs";

export const LABOLA_STEPS = [
  { label: "週カレンダー", matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar_week/" },
  { label: "予約情報", matchType: "CONTAINS", value: "/booking-info/" },
  { label: "顧客情報", matchType: "CONTAINS", value: "/customer-info/" },
  { label: "支払い", matchType: "CONTAINS", value: "/customer-payment/" },
  { label: "最終確認", matchType: "CONTAINS", value: "/customer-confirm/" },
  { label: "完了", matchType: "CONTAINS", value: "/booking/complete/" },
];

function users(report) {
  return Number(report.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

export async function collectLabolaFunnel(ga4, range) {
  const query = (step, humanOnly) =>
    ga4({
      dateRanges: [range],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: andFilters(
        hostFilter(LABOLA_HOST),
        stringFilter("pagePath", step.value, step.matchType),
        humanOnly ? excludeAutomatedAccess() : undefined
      ),
    });
  return Promise.all(
    LABOLA_STEPS.map(async (step) => {
      const [all, human] = await Promise.all([query(step, false), query(step, true)]);
      return { label: step.label, all: users(all), human: users(human) };
    })
  );
}

export function formatLabolaFunnel(rows) {
  return rows
    .map((row, index) => {
      const previous = index === 0 ? null : rows[index - 1].human;
      const passRate = previous === null ? "" : ` 前段から${previous > 0 ? `${Math.round((row.human / previous) * 100)}%` : "―"}`;
      return `${row.label}  全体=${row.all} 自動除外後=${row.human} (自動アクセス ${row.all - row.human})${passRate}`;
    })
    .join("\n");
}
```

注: 通過率の「前段から」は、同じ期間に両方の段を見たユーザー数の比ではなく、各段の独立したユーザー数の比(参考値)。出力見出しにその旨を書く(Task 4)。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/labolaFunnel.test.ts`
Expected: PASS

---

### Task 4: `query.mjs` をホスト分離する

**Files:**
- Modify: `scripts/analytics/query.mjs`(import・ページ別PV・チャネル別・入口セッション・予約ページ別PV の節)
- Modify: `scripts/analytics/fixtures/mockGoogle.mjs`(ディメンション無しのレポートに答える)
- Modify: `scripts/analytics/query.test.ts`(コピー対象に新ファイルを足し、出力を検証)

**Interfaces:**
- Consumes: Task 2・3 の関数
- Produces: 週次・月次の出力に「(サイト)」付きのページ別PV・チャネル別セッションと、「LaBOLA 段別」節

- [ ] **Step 1: 失敗するテストを書く**

`scripts/analytics/query.test.ts`:
- `beforeAll` のコピー対象 `["query.mjs", "monitoring.mjs", "articleMetrics.mjs", "ctaEvents.mjs"]` に `"hosts.mjs"`, `"labolaFunnel.mjs"` を足す。
- `describe` の中に次の2テストを足す。

```ts
  it("ページ別PVとチャネル別セッションはサイトのホストに絞り、見出しに(サイト)と書く", async () => {
    const { stdout } = await run(["--days", "28"]);
    expect(stdout).toContain("## GA4 ページ別PV(サイト・上位・前期比)");
    expect(stdout).toContain("## GA4 チャネル別セッション(サイト・前期比)");
  });
  it("LaBOLA 段別を、自動アクセスを除いた値つきで出す", async () => {
    const { stdout } = await run(["--days", "7"]);
    expect(stdout).toContain("## LaBOLA 段別ユーザー数(自動アクセス除外つき・参考値)");
    expect(stdout).toContain("週カレンダー  全体=");
  });
```

`fixtures/mockGoogle.mjs` の `runReport` ハンドラは `body.dimensions[0].name` を直接読んでいる。ディメンション無しのリクエストでも落ちないよう、`dimensions` が無いときは `totalUsers` 1行を返す分岐を先頭に足す。

```js
    if (!body.dimensions) return HttpResponse.json({ rows: [{ metricValues: [{ value: "7" }] }] });
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/query.test.ts`
Expected: FAIL(見出しが無い)

- [ ] **Step 3: 実装する**

`scripts/analytics/query.mjs`:

1. import に追加:
```js
import { SITE_HOST, hostFilter } from "./hosts.mjs";
import { collectLabolaFunnel, formatLabolaFunnel } from "./labolaFunnel.mjs";
```
2. 「ページ別PV」「チャネル別」「入口セッション(`landingPagePlusQueryString`)」の `ga4({...})` 3か所に `dimensionFilter: hostFilter(SITE_HOST),` を足す。
3. 見出しを `## GA4 ページ別PV(サイト・上位・前期比)` と `## GA4 チャネル別セッション(サイト・前期比)` に変える。
4. 「予約ページ別PV(参考値…)」の節(`const funnel = await ga4({...})` から `if ((funnel.rows ?? []).length > 0) {...}` まで)を、次に置き換える。
```js
  const labolaFunnel = await collectLabolaFunnel(ga4, cur);
  console.log("\n## LaBOLA 段別ユーザー数(自動アクセス除外つき・参考値)");
  console.log("(各段のユーザー数を独立に数えた値。『前段から』は同一ユーザーの通過率ではない。自動アクセス=画面800x600かつLinux)");
  console.log(formatLabolaFunnel(labolaFunnel));
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/query.test.ts scripts/analytics/hosts.test.ts scripts/analytics/labolaFunnel.test.ts`
Expected: PASS

- [ ] **Step 5: 実データで確認する(読み取りのみ)**

Run: `node scripts/analytics/query.mjs --days 7`(`.env.local` は用意済み)
Expected: 「LaBOLA 段別」節が出て、週カレンダーの「自動アクセス」が数百〜千程度で、ページ別PVの上位に `/r/...` が並ばない。出力は証跡として保存する(保存先: `.superpowers/evidence/szb-505/`)。

---

### Task 5: 週の計算(`weeks.ts`)

**Files:**
- Create: `scripts/analytics/weekly/weeks.ts`
- Test: `scripts/analytics/weekly/weeks.test.ts`

**Interfaces:**
- Produces(すべて JST の日付文字列 `YYYY-MM-DD`):
  - `weekStartOf(date: string): string` — その日を含む週の月曜日
  - `addDays(date: string, days: number): string`
  - `jstDateOf(now: Date): string` — 現在時刻の JST の日付
  - `recentWeekStarts(now: Date, count: number): string[]` — 今週を含む直近 `count` 週の月曜日(古い順)
  - `gaDateToIso(gaDate: string): string` — `"20260929"` → `"2026-09-29"`(形が違えば `Error`)
  - `instantToJstDate(value: string): string | null` — 日付だけ(`2026-09-29`)はそのまま、時刻つきは JST の日付に直す。解釈できなければ `null`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";

import { addDays, gaDateToIso, instantToJstDate, jstDateOf, recentWeekStarts, weekStartOf } from "./weeks";

describe("週の計算(JST・月曜始まり)", () => {
  it("週頭は月曜日。日曜は前の月曜に入る", () => {
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28"); // 月
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // 日
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // 次の月
  });

  it("年またぎの週は前年の月曜から始まる", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("JST の日付は UTC の日曜 15:00 以降なら翌日(月曜)になる", () => {
    expect(jstDateOf(new Date("2026-10-04T14:59:59Z"))).toBe("2026-10-04");
    expect(jstDateOf(new Date("2026-10-04T15:00:00Z"))).toBe("2026-10-05");
  });

  it("直近の週頭を古い順に返す(今週を含む)", () => {
    expect(recentWeekStarts(new Date("2026-10-01T03:00:00Z"), 3)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("GA4 の YYYYMMDD を ISO に直し、形が違えば例外", () => {
    expect(gaDateToIso("20260929")).toBe("2026-09-29");
    expect(() => gaDateToIso("2026-09-29")).toThrow("GA4 の日付の形が想定と違います");
  });

  it("台帳の日時は JST の日付にそろえる(日付のみ・UTC・オフセット付き)", () => {
    expect(instantToJstDate("2026-09-29")).toBe("2026-09-29");
    expect(instantToJstDate("2026-09-28T16:30:00.000Z")).toBe("2026-09-29");
    expect(instantToJstDate("2026-09-29T00:30:00.000+09:00")).toBe("2026-09-29");
    expect(instantToJstDate("not a date")).toBeNull();
  });
});
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/weekly/weeks.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

```ts
/** 週(JST・月曜始まり)の計算。日付はすべて `YYYY-MM-DD` の文字列で扱う。 */
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const GA_DATE = /^(\d{4})(\d{2})(\d{2})$/u;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function jstDateOf(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function recentWeekStarts(now: Date, count: number): string[] {
  const current = weekStartOf(jstDateOf(now));
  return Array.from({ length: count }, (_, index) => addDays(current, -7 * (count - 1 - index)));
}

export function gaDateToIso(gaDate: string): string {
  const match = GA_DATE.exec(gaDate);
  if (!match) throw new Error(`GA4 の日付の形が想定と違います: ${gaDate}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function instantToJstDate(value: string): string | null {
  if (ISO_DATE.test(value)) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : jstDateOf(new Date(time));
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly/weeks.test.ts`
Expected: PASS

---

### Task 6: GA4 の週次イベント回数(`googleToken.ts`・`ga4Weekly.ts`)

**Files:**
- Create: `scripts/analytics/weekly/googleToken.ts`、`scripts/analytics/weekly/ga4Weekly.ts`
- Test: `scripts/analytics/weekly/googleToken.test.ts`、`scripts/analytics/weekly/ga4Weekly.test.ts`

**Interfaces:**
- Consumes: Task 5 の `weekStartOf`・`gaDateToIso`、Task 2 の `hostFilter`・`stringFilter`・`andFilters`
- Produces:
  - `fetchGoogleAccessToken(env: Record<string, string | undefined>): Promise<string>` — `GROWTH_GOOGLE_CLIENT_ID`・`GROWTH_GOOGLE_CLIENT_SECRET`・`GROWTH_GOOGLE_REFRESH_TOKEN` が欠ければ例外
  - `interface Ga4Context { token: string; propertyId: string }`
  - `weeklyEventCounts(ctx: Ga4Context, query: { startDate: string; endDate: string; eventNames: readonly string[]; host: string; extraFilter?: object }): Promise<Map<string, number>>` — キーは週頭の日付。GA4 が不完全なレポートを返したら例外

- [ ] **Step 1: 失敗するテストを書く(googleToken)**

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { fetchGoogleAccessToken } from "./googleToken";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const env = { GROWTH_GOOGLE_CLIENT_ID: "id", GROWTH_GOOGLE_CLIENT_SECRET: "secret", GROWTH_GOOGLE_REFRESH_TOKEN: "refresh" };

describe("fetchGoogleAccessToken", () => {
  it("リフレッシュトークンでアクセストークンを取る", async () => {
    let body = "";
    server.use(
      http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ access_token: "tok" });
      }),
    );
    await expect(fetchGoogleAccessToken(env)).resolves.toBe("tok");
    expect(body).toContain("grant_type=refresh_token");
  });

  it("必要な環境変数が欠けていれば、通信せずに例外", async () => {
    await expect(fetchGoogleAccessToken({ ...env, GROWTH_GOOGLE_REFRESH_TOKEN: undefined })).rejects.toThrow("GROWTH_GOOGLE_REFRESH_TOKEN");
  });

  it("HTTP エラーは状態コードつきで例外", async () => {
    server.use(http.post("https://oauth2.googleapis.com/token", () => new HttpResponse(null, { status: 400 })));
    await expect(fetchGoogleAccessToken(env)).rejects.toThrow("Google OAuth 失敗: 400");
  });

  it("応答に access_token が無ければ例外", async () => {
    server.use(http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({})));
    await expect(fetchGoogleAccessToken(env)).rejects.toThrow("access_token");
  });
});
```

- [ ] **Step 2: 実装する(googleToken)**

```ts
import { z } from "zod";

const REQUIRED = ["GROWTH_GOOGLE_CLIENT_ID", "GROWTH_GOOGLE_CLIENT_SECRET", "GROWTH_GOOGLE_REFRESH_TOKEN"] as const;
const tokenSchema = z.object({ access_token: z.string().min(1) });

export async function fetchGoogleAccessToken(env: Record<string, string | undefined>): Promise<string> {
  for (const key of REQUIRED) if (!env[key]) throw new Error(`${key} が未設定です`);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: env.GROWTH_GOOGLE_CLIENT_ID as string,
      client_secret: env.GROWTH_GOOGLE_CLIENT_SECRET as string,
      refresh_token: env.GROWTH_GOOGLE_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth 失敗: ${response.status}`);
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Google OAuth の応答に access_token がありません");
  return parsed.data.access_token;
}
```

注: `as string` は環境変数の存在を直前の `for` で確認済みのため。型を絞れる書き方にできるなら(例: 先に `const [id, secret, refresh] = REQUIRED.map(...)`)そちらを優先し、`as` を避ける。

- [ ] **Step 3: 失敗するテストを書く(ga4Weekly)**

```ts
// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { weeklyEventCounts } from "./ga4Weekly";

const endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const ctx = { token: "t", propertyId: "123" };
const query = { startDate: "2026-09-21", endDate: "2026-10-04", eventNames: ["labola_reserve_complete"], host: "yoyaku.labola.jp" };
const row = (date: string, count: string) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: count }] });

describe("weeklyEventCounts", () => {
  it("日別の回数を JST の週(月曜始まり)にまとめる", async () => {
    server.use(
      http.post(endpoint, () =>
        HttpResponse.json({ rows: [row("20260927", "3"), row("20260928", "4"), row("20261004", "5")], rowCount: 3 }),
      ),
    );
    const counts = await weeklyEventCounts(ctx, query);
    expect([...counts.entries()]).toEqual([
      ["2026-09-21", 3],
      ["2026-09-28", 9],
    ]);
  });

  it("イベント名とホストで絞り、追加フィルタを AND で足す", async () => {
    let body: unknown;
    server.use(http.post(endpoint, async ({ request }) => ((body = await request.json()), HttpResponse.json({ rows: [], rowCount: 0 }))));
    await weeklyEventCounts(ctx, { ...query, extraFilter: { filter: { fieldName: "customEvent:location", stringFilter: { matchType: "EXACT", value: "x" } } } });
    const text = JSON.stringify(body);
    expect(text).toContain("labola_reserve_complete");
    expect(text).toContain("yoyaku.labola.jp");
    expect(text).toContain("customEvent:location");
    expect(text).toContain('"eventCount"');
  });

  it("HTTP エラーは例外", async () => {
    server.use(http.post(endpoint, () => new HttpResponse("denied", { status: 403 })));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 失敗: 403");
  });

  it.each([
    ["行が分割されている", { rows: [row("20260928", "1")], rowCount: 2 }],
    ["しきい値で間引かれた", { rows: [row("20260928", "1")], rowCount: 1, metadata: { subjectToThresholding: true } }],
    ["その他行に丸められた", { rows: [row("20260928", "1")], rowCount: 1, metadata: { dataLossFromOtherRow: true } }],
  ])("不完全なレポート(%s)は静かに少なく数えず例外", async (_label, payload) => {
    server.use(http.post(endpoint, () => HttpResponse.json(payload)));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 のレポートが不完全です");
  });

  it("数値でない回数は例外", async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({ rows: [row("20260928", "abc")], rowCount: 1 })));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 の応答の形が想定と違います");
  });
});
```

- [ ] **Step 4: 実装する(ga4Weekly)**

```ts
import { z } from "zod";

import { andFilters, hostFilter, stringFilter } from "../hosts.mjs";
import { gaDateToIso, weekStartOf } from "./weeks";

export interface Ga4Context {
  token: string;
  propertyId: string;
}

export interface WeeklyEventQuery {
  startDate: string;
  endDate: string;
  eventNames: readonly string[];
  host: string;
  extraFilter?: object;
}

const reportSchema = z.object({
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string() })).min(1),
        metricValues: z.array(z.object({ value: z.string().regex(/^\d+$/u) })).min(1),
      }),
    )
    .optional(),
  rowCount: z.number().optional(),
  metadata: z.object({ subjectToThresholding: z.boolean().optional(), dataLossFromOtherRow: z.boolean().optional() }).optional(),
});

export async function weeklyEventCounts(ctx: Ga4Context, query: WeeklyEventQuery): Promise<Map<string, number>> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${ctx.propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      dateRanges: [{ startDate: query.startDate, endDate: query.endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: andFilters(
        { filter: { fieldName: "eventName", inListFilter: { values: [...query.eventNames] } } },
        hostFilter(query.host),
        query.extraFilter,
      ),
      limit: 1000,
    }),
  });
  if (!response.ok) throw new Error(`GA4 失敗: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const parsed = reportSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("GA4 の応答の形が想定と違います");
  const report = parsed.data;
  const rows = report.rows ?? [];
  if ((report.rowCount ?? 0) > rows.length || report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow) {
    throw new Error("GA4 のレポートが不完全です(行の分割・しきい値・丸め)");
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    const week = weekStartOf(gaDateToIso(row.dimensionValues[0].value));
    counts.set(week, (counts.get(week) ?? 0) + Number(row.metricValues[0].value));
  }
  return counts;
}
```

注: テストの `stringFilter` import は `extraFilter` を組み立てる箇所で使うなら残す。使わなければ import から外す(lint の未使用)。

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly/googleToken.test.ts scripts/analytics/weekly/ga4Weekly.test.ts`
Expected: PASS

---

### Task 7: 予約台帳の週次受付件数(`ledgerWeekly.ts`)

**Files:**
- Create: `scripts/analytics/weekly/ledgerWeekly.ts`
- Test: `scripts/analytics/weekly/ledgerWeekly.test.ts`

**Interfaces:**
- Consumes: `NotionClient`(`scripts/early-morning/notionClient`)、`readDate`・`readPlainText`・`readSelect`・`NotionPage`(`scripts/early-morning/notionProps`)、`EXCLUDED_RESERVATION_NOS`(`scripts/hyrox-class/config`)、`instantToJstDate`・`weekStartOf`(Task 5)
- Produces:
  - `RECEIPT_COLUMNS = ["予約番号", "ステータス", "受付日時"] as const`
  - `interface LedgerWeekCounts { received: number; cancelled: number }`
  - `fetchLedgerWeeklyCounts(client: NotionClient, ledgerDbId: string): Promise<{ byWeek: Map<string, LedgerWeekCounts>; undated: number }>` — 受付日時が無い/読めない行は `undated` に数える。テスト予約は除く。キャンセル済みも `received` に数え、`cancelled` にも数える。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { NotionClient } from "../../early-morning/notionClient";
import { EXCLUDED_RESERVATION_NOS } from "../../hyrox-class/config";
import { RECEIPT_COLUMNS, fetchLedgerWeeklyCounts } from "./ledgerWeekly";

const text = (name: string, content: string) => ({ [name]: { rich_text: [{ plain_text: content }] } });
function page(no: string, status: string | null, receivedAt: string | null) {
  return {
    id: no,
    properties: {
      ...text("予約番号", no),
      ステータス: { select: status ? { name: status } : null },
      受付日時: { date: receivedAt ? { start: receivedAt } : null },
    },
  };
}
function client(pages: ReturnType<typeof page>[], columns: readonly string[] = [...RECEIPT_COLUMNS, "予約者"]) {
  const queryAll = vi.fn(async () => pages);
  const getDatabase = vi.fn(async () => ({ properties: Object.fromEntries(columns.map((name) => [name, { id: `id-${name}` }])) }));
  return { client: { getDatabase, queryAll } as unknown as NotionClient, queryAll };
}

describe("fetchLedgerWeeklyCounts", () => {
  it("受付日時の週ごとに数え、キャンセル済みも受付に含めて別にも数える", async () => {
    const { client: notion } = client([
      page("#10", "確定", "2026-09-28T09:00:00.000+09:00"),
      page("#11", "キャンセル", "2026-09-29"),
      page("#12", "確定", "2026-10-04T23:59:00.000+09:00"),
      page("#13", "確定", "2026-10-05T00:00:00.000+09:00"),
    ]);
    const { byWeek, undated } = await fetchLedgerWeeklyCounts(notion, "db");
    expect(byWeek.get("2026-09-28")).toEqual({ received: 3, cancelled: 1 });
    expect(byWeek.get("2026-10-05")).toEqual({ received: 1, cancelled: 0 });
    expect(undated).toBe(0);
  });

  it("テスト予約は除き、受付日時が無い/読めない行は undated に数える", async () => {
    const { client: notion } = client([
      page(EXCLUDED_RESERVATION_NOS[0], "確定", "2026-09-28"),
      page("#20", "確定", null),
      page("#21", "確定", "garbage"),
      page("#22", "確定", "2026-09-28"),
    ]);
    const { byWeek, undated } = await fetchLedgerWeeklyCounts(notion, "db");
    expect(byWeek.get("2026-09-28")).toEqual({ received: 1, cancelled: 0 });
    expect(undated).toBe(2);
  });

  it("読む列は予約番号・ステータス・受付日時の3列だけ(個人情報の列を取らない)", async () => {
    const { client: notion, queryAll } = client([]);
    await fetchLedgerWeeklyCounts(notion, "db");
    expect(queryAll).toHaveBeenCalledWith("db", {}, ["id-予約番号", "id-ステータス", "id-受付日時"]);
  });

  it("台帳に必要な列が無ければ例外", async () => {
    const { client: notion } = client([], ["予約番号", "ステータス"]);
    await expect(fetchLedgerWeeklyCounts(notion, "db")).rejects.toThrow("予約台帳に列「受付日時」がありません");
  });
});
```

- [ ] **Step 2: 実装する**

```ts
/** Notion「Labora 予約台帳」から、週ごとの受付件数だけを数える。読む列は3つだけ(氏名・連絡先は取らない)。 */
import type { NotionClient } from "../../early-morning/notionClient";
import { readDate, readPlainText, readSelect } from "../../early-morning/notionProps";
import { EXCLUDED_RESERVATION_NOS } from "../../hyrox-class/config";
import { instantToJstDate, weekStartOf } from "./weeks";

export const RECEIPT_COLUMNS = ["予約番号", "ステータス", "受付日時"] as const;

export interface LedgerWeekCounts {
  received: number;
  cancelled: number;
}

export async function fetchLedgerWeeklyCounts(
  client: NotionClient,
  ledgerDbId: string,
): Promise<{ byWeek: Map<string, LedgerWeekCounts>; undated: number }> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = RECEIPT_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const pages = await client.queryAll(ledgerDbId, {}, propertyIds);
  const byWeek = new Map<string, LedgerWeekCounts>();
  let undated = 0;
  for (const page of pages) {
    if (EXCLUDED_RESERVATION_NOS.includes(readPlainText(page, "予約番号").trim())) continue;
    const receivedAt = readDate(page, "受付日時");
    const date = receivedAt === null ? null : instantToJstDate(receivedAt);
    if (date === null) {
      undated += 1;
      continue;
    }
    const week = weekStartOf(date);
    const counts = byWeek.get(week) ?? { received: 0, cancelled: 0 };
    byWeek.set(week, {
      received: counts.received + 1,
      cancelled: counts.cancelled + (readSelect(page, "ステータス") === "キャンセル" ? 1 : 0),
    });
  }
  return { byWeek, undated };
}
```

- [ ] **Step 3: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly/ledgerWeekly.test.ts`
Expected: PASS

---

### Task 8: テニスベアの週次申込件数(`tennisbearApplications.ts`)

**Files:**
- Create: `scripts/analytics/weekly/tennisbearApplications.ts`
- Test: `scripts/analytics/weekly/tennisbearApplications.test.ts`
- Test fixtures: テストの中でテニスベアの HTML を組み立てる(`window.__NUXT__` の形は `scripts/early-morning/tennisbear.test.ts` の既存の作り方に合わせる)

**Interfaces:**
- Consumes: `extractCircleEvents`・`extractEventDetail`(`scripts/early-morning/tennisbear`)、`parseNuxtState`(`scripts/early-morning/nuxtPayload`)、`CIRCLE_ID`・`TENNISBEAR_BASE_URL`・`FETCH_TIMEOUT_MS`(`scripts/early-morning/config`)、Task 5 の `instantToJstDate`・`weekStartOf`
- Produces:
  - `fetchTennisbearApplicationCounts(deps: { fetchFn: FetchFn; sleep: (ms: number) => Promise<void>; intervalMs: number; windowStart: string }): Promise<{ byWeek: Map<string, number>; undated: number; events: number }>`
    - サークルの開催回のうち、開始日が `windowStart` 以降で中止でない回だけ詳細を取り、参加申込(参加・キャンセルの両方)の申込日時を週に数える。
    - 申込日時が null/読めないものは `undated`。名前は読んでも返さない。

先に `scripts/early-morning/tennisbear.test.ts` と `nuxtPayload.test.ts` を読み、HTML フィクスチャの作り方(`window.__NUXT__` のシリアライズ形)を確認してから、テストを書く。

- [ ] **Step 1: 失敗するテストを書く**

テストで検証する振る舞い(各1ケース):
1. 2回の開催回から、申込日時の週ごとに件数が数えられる(参加・キャンセル両方を数える)。
2. 開始日が `windowStart` より前の回と、中止の回は詳細を取りに行かない(取得URLの記録で確認)。
3. 申込日時が null の申込は `undated` に数え、週の件数に混ぜない。
4. 詳細の取得ごとに `sleep(intervalMs)` が呼ばれる。
5. 一覧の取得が HTTP エラーなら例外(`取得に失敗しました`)。
6. 結果にもテスト内のデータにも参加者名を含めない(名前はダミー文字列 `参加者A` のみ)。

HTTP は MSW。`https://www.tennisbear.net/pickleball/circle/36659/events` と `.../event/<id>/info` を `HttpResponse.text(html)` で返す。

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/weekly/tennisbearApplications.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

```ts
/** テニスベアのサークルの開催回から、申込日時の週ごとの件数だけを数える。参加者名は返さない。 */
import { FETCH_TIMEOUT_MS, CIRCLE_ID, TENNISBEAR_BASE_URL } from "../../early-morning/config";
import { parseNuxtState } from "../../early-morning/nuxtPayload";
import { extractCircleEvents, extractEventDetail, TennisbearError } from "../../early-morning/tennisbear";
import type { FetchFn } from "../../growth/http";
import { instantToJstDate, weekStartOf } from "./weeks";

export interface TennisbearApplicationDeps {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
  windowStart: string;
}

async function fetchPage(url: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PBT-weekly-health)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new TennisbearError(`${url} の取得に失敗しました (HTTP ${response.status})`);
  return response.text();
}

export async function fetchTennisbearApplicationCounts(
  deps: TennisbearApplicationDeps,
): Promise<{ byWeek: Map<string, number>; undated: number; events: number }> {
  const circleHtml = await fetchPage(`${TENNISBEAR_BASE_URL}/pickleball/circle/${CIRCLE_ID}/events`, deps.fetchFn);
  const targets = extractCircleEvents(parseNuxtState(circleHtml)).filter(
    (event) => !event.isCallOff && (instantToJstDate(event.startAt) ?? "") >= deps.windowStart,
  );
  const byWeek = new Map<string, number>();
  let undated = 0;
  for (const event of targets) {
    await deps.sleep(deps.intervalMs);
    const detail = extractEventDetail(parseNuxtState(await fetchPage(`${TENNISBEAR_BASE_URL}/pickleball/event/${event.id}/info`, deps.fetchFn)));
    if (detail.id !== event.id) throw new TennisbearError(`イベント ${event.id} の詳細が別のイベントを返しました`);
    for (const participant of detail.participants) {
      const date = participant.appliedAt === null ? null : instantToJstDate(participant.appliedAt);
      if (date === null) {
        undated += 1;
        continue;
      }
      const week = weekStartOf(date);
      byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
    }
  }
  return { byWeek, undated, events: targets.length };
}
```

注: `startAt` が日付に直せない回は `""` と比較して対象外になる(安全側)。この分岐(読めない `startAt`)もテストで固定する(テスト1の隣に1ケース足す)。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly/tennisbearApplications.test.ts`
Expected: PASS

---

### Task 9: CrUX(`crux.ts`)

**Files:**
- Create: `scripts/analytics/weekly/crux.ts`
- Test: `scripts/analytics/weekly/crux.test.ts`

**Interfaces:**
- Produces:
  - `CRUX_PATHS = ["/", "/reserve", "/hyrox", "/en"] as const`
  - `interface CruxMetric { name: string; p75: number | null; category: string | null }`
  - `interface CruxPageResult { path: string; scope: "page" | "origin"; metrics: CruxMetric[] }`
  - `fetchCruxResults(deps: { apiKey: string; baseUrl: string }): Promise<CruxPageResult[]>`
    - 1ページごとに PSI(`runPagespeed`、`strategy=mobile`、`category=performance`)を呼ぶ。`loadingExperience.origin_fallback === true`、または `loadingExperience.metrics` が無いときは `scope: "origin"` として `originLoadingExperience` の値を使う(ページ単位は件数不足)。
    - 指標は LCP・INP・CLS・FCP・TTFB の p75。CLS は PSI が 100倍の整数で返すので 100 で割る。指標が無ければ `p75: null`。
    - HTTP エラー(429 を含む)は `PSI 失敗: <status>` の例外。
  - `formatCruxResults(results: CruxPageResult[]): string`
  - `formatCruxSkipped(): string` — `PSI_API_KEY が未設定のため CrUX の取得をスキップしました(手順書: docs/operations/measurement-repair-checklist.md)`

PSI のレスポンスの指標キー: `LARGEST_CONTENTFUL_PAINT_MS`・`INTERACTION_TO_NEXT_PAINT`・`CUMULATIVE_LAYOUT_SHIFT_SCORE`・`FIRST_CONTENTFUL_PAINT_MS`・`EXPERIMENTAL_TIME_TO_FIRST_BYTE`。各 `{ percentile: number, category: "FAST"|"AVERAGE"|"SLOW" }`。実装前に Context7 か PSI 公式ドキュメントで確認すること(Task 実行時に確認)。

- [ ] **Step 1: 失敗するテストを書く**

MSW で `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` を返す。ケース:
1. ページ単位の実データがある → `scope: "page"`、p75 が取れる、CLS は 100 で割る。
2. `origin_fallback: true` → `scope: "origin"` で `originLoadingExperience` の値を使う。
3. 指標の一部が無い → その指標は `p75: null`。
4. リクエストに `key`・`strategy=mobile`・`category=performance`・対象 URL が付く(キー値そのものはログ/出力に出さない)。
5. 429 → `PSI 失敗: 429`。
6. `formatCruxResults` は `/  [ページ単位]  LCP 2.2s(良好) INP 155ms CLS 0.00 FCP 1.3s TTFB 0.5s` の形、オリジン代替は `[オリジンで代替(ページ単位は件数不足)]`、`p75: null` は `LCP 取得不可`。
7. `formatCruxSkipped()` の文言。

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run scripts/analytics/weekly/crux.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

```ts
import { z } from "zod";

export const CRUX_PATHS = ["/", "/reserve", "/hyrox", "/en"] as const;

const METRICS = [
  { name: "LCP", key: "LARGEST_CONTENTFUL_PAINT_MS", scale: 1 },
  { name: "INP", key: "INTERACTION_TO_NEXT_PAINT", scale: 1 },
  { name: "CLS", key: "CUMULATIVE_LAYOUT_SHIFT_SCORE", scale: 100 },
  { name: "FCP", key: "FIRST_CONTENTFUL_PAINT_MS", scale: 1 },
  { name: "TTFB", key: "EXPERIMENTAL_TIME_TO_FIRST_BYTE", scale: 1 },
] as const;

export interface CruxMetric {
  name: string;
  p75: number | null;
  category: string | null;
}
export interface CruxPageResult {
  path: string;
  scope: "page" | "origin";
  metrics: CruxMetric[];
}

const experienceSchema = z
  .object({
    metrics: z.record(z.string(), z.object({ percentile: z.number(), category: z.string() })).optional(),
    origin_fallback: z.boolean().optional(),
  })
  .optional();
const psiSchema = z.object({ loadingExperience: experienceSchema, originLoadingExperience: experienceSchema });

type Experience = z.infer<typeof experienceSchema>;

function toMetrics(experience: Experience): CruxMetric[] {
  return METRICS.map(({ name, key, scale }) => {
    const metric = experience?.metrics?.[key];
    return { name, p75: metric ? metric.percentile / scale : null, category: metric?.category ?? null };
  });
}

export async function fetchCruxResults(deps: { apiKey: string; baseUrl: string }): Promise<CruxPageResult[]> {
  const results: CruxPageResult[] = [];
  for (const path of CRUX_PATHS) {
    const query = new URLSearchParams({ url: `${deps.baseUrl}${path}`, strategy: "mobile", category: "performance", key: deps.apiKey });
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`PSI 失敗: ${response.status}`);
    const parsed = psiSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("PSI の応答の形が想定と違います");
    const page = parsed.data.loadingExperience;
    const hasPageData = page?.metrics !== undefined && page.origin_fallback !== true;
    results.push({ path, scope: hasPageData ? "page" : "origin", metrics: toMetrics(hasPageData ? page : parsed.data.originLoadingExperience) });
  }
  return results;
}

function formatMetric({ name, p75, category }: CruxMetric): string {
  if (p75 === null) return `${name} 取得不可`;
  const value = name === "CLS" ? p75.toFixed(2) : name === "INP" || name === "TTFB" && p75 < 1000 ? `${Math.round(p75)}ms` : `${(p75 / 1000).toFixed(1)}s`;
  const label = category === "FAST" ? "良好" : category === "AVERAGE" ? "要改善" : category === "SLOW" ? "不良" : "";
  return `${name} ${value}${label ? `(${label})` : ""}`;
}

export function formatCruxResults(results: CruxPageResult[]): string {
  return results
    .map(({ path, scope, metrics }) => `${path}  [${scope === "page" ? "ページ単位" : "オリジンで代替(ページ単位は件数不足)"}]  ${metrics.map(formatMetric).join(" ")}`)
    .join("\n");
}

export function formatCruxSkipped(): string {
  return "PSI_API_KEY が未設定のため CrUX の取得をスキップしました(手順書: docs/operations/measurement-repair-checklist.md)";
}
```

注: `formatMetric` の単位の分岐は読みにくいので、実装時に「ms で出す指標(INP)」「秒で出す指標(LCP・FCP・TTFB)」に整理し、`TTFB` を ms にするか秒にするかをテストで固定する(上のコードはたたき台)。

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly/crux.test.ts`
Expected: PASS

---

### Task 10: 週次レポートの組み立てと実行入口

**Files:**
- Create: `scripts/analytics/weekly/weeklyReport.ts`(各節の整形)、`scripts/analytics/weekly/runWeekly.ts`(節の独立実行)、`scripts/analytics/weekly/weekly-health.ts`(入口)
- Test: `scripts/analytics/weekly/weeklyReport.test.ts`、`scripts/analytics/weekly/runWeekly.test.ts`
- Modify: `package.json`(`"analytics:weekly": "tsx scripts/analytics/weekly/weekly-health.ts"`)

**Interfaces:**
- Consumes: Task 5〜9 の関数
- Produces:
  - `formatReconciliation(weeks: string[], ga4: Map<string, number>, ledger: Map<string, LedgerWeekCounts>, undatedLedger: number, currentWeek: string): string`
    - 週ごとに `YYYY-MM-DD週  GA4完了=<n> 台帳受付=<n> 差=<±n> (うちキャンセル <n>)`。今週には `(途中)` を付ける。末尾に差の読み方の1行と、`undatedLedger > 0` なら `受付日時なし <n> 件は含まない`。
  - `formatTennisbear(weeks, clicks: Map<string, number>, applications: { byWeek: Map<string, number>; undated: number; events: number }, currentWeek): string`
    - 週ごとに `クリック=<n> 申込=<n> 申込÷クリック=<x>%`(クリックが 0 なら `―`)。末尾に `対象 <events> 回・申込日時なし <undated> 件は含まない`。
  - `interface WeeklyDeps { now: Date; env: Record<string, string | undefined>; notion: NotionClient; sleep: (ms: number) => Promise<void> }`
  - `runWeekly(deps: WeeklyDeps): Promise<{ text: string; hasFailure: boolean }>` — 節(`予約完了と台帳の突合`・`テニスベア申込`・`CrUX`)を独立に実行し、失敗した節は `取得不可: <理由>` を出して `hasFailure: true`。`PSI_API_KEY` が無い CrUX 節は失敗ではなくスキップ(`hasFailure` にしない)。
  - 週は直近8週(`recentWeekStarts(now, 8)`)。GA4 の期間は最初の週頭〜昨日(JST)。
  - GA4 のイベント: 完了は `labola_reserve_complete` と `labola_reserve_complete_program`(ホスト = LaBOLA)。テニスベアは `reservation_click` かつ `customEvent:location = reserve_choice_pickle_event`(ホスト = サイト)。台帳 DB は `NOTION_IDS.ledgerDb`。
  - `weekly-health.ts`(入口): `.env.local` を読み(`dotenv`)、`createNotionClient`・`runWeekly` を呼び、`text` を標準出力に出し、`hasFailure` なら終了コード 1。薄い配線(ロジックは持たない)。

- [ ] **Step 1: 失敗するテストを書く(weeklyReport)**

ケース: (1) 差の符号(GA4 > 台帳なら `+`、小さければ `-`)と今週の `(途中)`、(2) 台帳に無い週・GA4 に無い週は 0 として出す、(3) 受付日時なしの注記が `undatedLedger > 0` のときだけ出る、(4) テニスベアの申込÷クリックはクリック 0 で `―`、(5) 対象回数と日付不明の注記。完全一致でなく、`toContain` で行の核心部分を固定する。

- [ ] **Step 2: 実装する(weeklyReport)**

```ts
import type { LedgerWeekCounts } from "./ledgerWeekly";

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function weekLabel(week: string, currentWeek: string): string {
  return `${week}週${week === currentWeek ? "(途中)" : ""}`;
}

export function formatReconciliation(
  weeks: readonly string[],
  ga4: ReadonlyMap<string, number>,
  ledger: ReadonlyMap<string, LedgerWeekCounts>,
  undatedLedger: number,
  currentWeek: string,
): string {
  const lines = weeks.map((week) => {
    const completed = ga4.get(week) ?? 0;
    const counts = ledger.get(week) ?? { received: 0, cancelled: 0 };
    return `${weekLabel(week, currentWeek)}  GA4完了=${completed} 台帳受付=${counts.received} 差=${signed(completed - counts.received)} (うちキャンセル ${counts.cancelled})`;
  });
  lines.push("差の読み方: GA4が多い=重複発火・別経路の完了の疑い / GA4が少ない=計測漏れ・別端末の予約の疑い");
  if (undatedLedger > 0) lines.push(`※受付日時のない台帳 ${undatedLedger} 件は含まない`);
  return lines.join("\n");
}

export interface TennisbearApplications {
  byWeek: ReadonlyMap<string, number>;
  undated: number;
  events: number;
}

export function formatTennisbear(
  weeks: readonly string[],
  clicks: ReadonlyMap<string, number>,
  applications: TennisbearApplications,
  currentWeek: string,
): string {
  const lines = weeks.map((week) => {
    const clickCount = clicks.get(week) ?? 0;
    const applied = applications.byWeek.get(week) ?? 0;
    const rate = clickCount === 0 ? "―" : `${Math.round((applied / clickCount) * 100)}%`;
    return `${weekLabel(week, currentWeek)}  クリック=${clickCount} 申込=${applied} 申込÷クリック=${rate}`;
  });
  lines.push(`対象 ${applications.events} 回・申込日時なし ${applications.undated} 件は含まない`);
  return lines.join("\n");
}
```

- [ ] **Step 3: 失敗するテストを書く(runWeekly)**

MSW(Google OAuth・GA4・PSI・テニスベア)と `FakeNotion`(`scripts/hyrox-class/fixtures/fakeNotion.ts`)で、次を固定する。
1. 3節とも成功 → `text` に3つの見出しがあり `hasFailure: false`。
2. GA4 が 503 → 突合とテニスベアの GA4 部分は `取得不可:` になるが、CrUX は出る。`hasFailure: true`。
3. Notion が失敗 → 突合は `取得不可`、テニスベアの節は出る。
4. `PSI_API_KEY` なし → CrUX はスキップ文言、`hasFailure` は他の節が成功なら `false`。
5. 出力に台帳の氏名・テニスベアの参加者名・API キー・トークンが含まれない(ダミー値を仕込んで `not.toContain`)。
6. GA4 の期間が「最初の週頭〜昨日(JST)」で、リクエスト本文の日付で確認する。

- [ ] **Step 4: 実装する(runWeekly・入口・npm スクリプト)**

```ts
// runWeekly.ts
import { NOTION_IDS } from "../../early-morning/notionIds";
import type { NotionClient } from "../../early-morning/notionClient";
import { FETCH_INTERVAL_MS } from "../../early-morning/config";
import { defaultFetch } from "../../growth/http";
import { LABOLA_HOST, SITE_HOST } from "../hosts.mjs";
import { CRUX_PATHS, fetchCruxResults, formatCruxResults, formatCruxSkipped } from "./crux";
import { weeklyEventCounts } from "./ga4Weekly";
import { fetchGoogleAccessToken } from "./googleToken";
import { fetchLedgerWeeklyCounts } from "./ledgerWeekly";
import { fetchTennisbearApplicationCounts } from "./tennisbearApplications";
import { formatReconciliation, formatTennisbear } from "./weeklyReport";
import { addDays, jstDateOf, recentWeekStarts } from "./weeks";

export interface WeeklyDeps {
  now: Date;
  env: Record<string, string | undefined>;
  notion: NotionClient;
  sleep: (ms: number) => Promise<void>;
}

const WEEK_COUNT = 8;
const COMPLETE_EVENTS = ["labola_reserve_complete", "labola_reserve_complete_program"] as const;
const PICKLE_EVENT_LOCATION = "reserve_choice_pickle_event";

interface SectionResult {
  text: string;
  failed: boolean;
}

async function section(title: string, run: () => Promise<string>): Promise<SectionResult> {
  try {
    return { text: `## ${title}\n${await run()}`, failed: false };
  } catch (error) {
    return { text: `## ${title}\n取得不可: ${error instanceof Error ? error.message : String(error)}`, failed: true };
  }
}

export async function runWeekly(deps: WeeklyDeps): Promise<{ text: string; hasFailure: boolean }> {
  const weeks = recentWeekStarts(deps.now, WEEK_COUNT);
  const currentWeek = weeks[weeks.length - 1];
  const range = { startDate: weeks[0], endDate: addDays(jstDateOf(deps.now), -1) };
  const ga4 = async () => ({ token: await fetchGoogleAccessToken(deps.env), propertyId: deps.env.GROWTH_GA4_PROPERTY_ID ?? "" });

  const results = await Promise.all([
    section("GA4 予約完了と予約台帳の週次突合", async () => {
      const ctx = await ga4();
      const [completed, ledger] = await Promise.all([
        weeklyEventCounts(ctx, { ...range, eventNames: COMPLETE_EVENTS, host: LABOLA_HOST }),
        fetchLedgerWeeklyCounts(deps.notion, NOTION_IDS.ledgerDb),
      ]);
      return formatReconciliation(weeks, completed, ledger.byWeek, ledger.undated, currentWeek);
    }),
    section("テニスベア行きクリックと申込(週次)", async () => {
      const ctx = await ga4();
      const [clicks, applications] = await Promise.all([
        weeklyEventCounts(ctx, {
          ...range,
          eventNames: ["reservation_click"],
          host: SITE_HOST,
          extraFilter: { filter: { fieldName: "customEvent:location", stringFilter: { matchType: "EXACT", value: PICKLE_EVENT_LOCATION } } },
        }),
        fetchTennisbearApplicationCounts({ fetchFn: defaultFetch, sleep: deps.sleep, intervalMs: FETCH_INTERVAL_MS, windowStart: weeks[0] }),
      ]);
      return formatTennisbear(weeks, clicks, applications, currentWeek);
    }),
    deps.env.PSI_API_KEY
      ? section("CrUX(実ユーザーの表示速度・モバイル p75)", async () =>
          formatCruxResults(await fetchCruxResults({ apiKey: deps.env.PSI_API_KEY ?? "", baseUrl: `https://${SITE_HOST}` })),
        )
      : Promise.resolve({ text: `## CrUX(実ユーザーの表示速度・モバイル p75)\n${formatCruxSkipped()}`, failed: false }),
  ]);
  return { text: results.map((result) => result.text).join("\n\n"), hasFailure: results.some((result) => result.failed) };
}
```

注: `CRUX_PATHS` の import は `fetchCruxResults` 内で使われるため、ここでは不要なら外す。`FETCH_INTERVAL_MS` は `scripts/early-morning/config.ts` に既にある。`ga4()` を2節が別々に呼ぶのでトークンを2回取る。1回にまとめられるなら(先に1回取って渡す)そうする(失敗の分離を保つため、トークン取得失敗は両節の失敗になる点をテストで固定する)。

```ts
// weekly-health.ts(入口。薄い配線のためロジックを持たない)
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { createNotionClient } from "../../early-morning/notionClient";
import { defaultFetch } from "../../growth/http";
import { runWeekly } from "./runWeekly";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const [key, value] of Object.entries(parse(readFileSync(".env.local")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN を .env.local に設定してください。");
  const notion = createNotionClient({ token, fetchFn: defaultFetch, sleep });
  const { text, hasFailure } = await runWeekly({ now: new Date(), env: process.env, notion, sleep });
  process.stdout.write(`${text}\n`);
  if (hasFailure) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`analytics:weekly に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

`package.json` の scripts に `"analytics:weekly": "tsx scripts/analytics/weekly/weekly-health.ts"` を足す。

- [ ] **Step 5: 通ることを確認する**

Run: `npx vitest run scripts/analytics/weekly`
Expected: PASS

- [ ] **Step 6: カバレッジに入口が現れるか確認する**

Run: `npx vitest run --coverage scripts/analytics 2>&1 | grep -n "weekly-health"`
Expected: 出力なし(入口はテストから import されないため集計に入らない)。もし `weekly-health.ts` が未カバーとして出たら、除外を足さずに司令塔へ相談する。

- [ ] **Step 7: 実データで確認する(読み取りのみ)**

Run: `npm run analytics:weekly`
Expected: 3節が出る(PSI キーなしなら CrUX はスキップ文言)。出力は証跡として保存する。氏名・トークンが出ていないことを目で確認する。

---

### Task 11: 手順書と運用手順への追記

**Files:**
- Create: `docs/operations/measurement-repair-checklist.md`
- Modify(追記のみ): `docs/operations/interactive-analysis-runbook.md`

**Interfaces:** なし(文書)

- [ ] **Step 1: 手順書を書く**

構成(この順):
1. **先に確認すること**: Vercel のプランで Speed Insights が使えるか(使えない場合は `<SpeedInsights />` はデータが送られないだけで画面に影響しない。CrUX の取得だけで運用する)。
2. **GA4 管理画面の設定**(それぞれ「どこを開く → 何を入れる → 確認方法」):
   - 自動アクセスの除外: 「画面 800x600 かつ Linux」の巡回を GA4 のレポートから除く方法(データフィルタ、または内部トラフィックの定義)。設定前に「テスト」状態で影響を確認する。**過去分は消えない**ので、遡って除くには集計スクリプトの除外(`excludeAutomatedAccess`)を使う、と書く。
   - 決済代行2ドメイン `api3.veritrans.co.jp`・`fep.sps-system.com` を「参照の除外」に追加。
   - ChatGPT(`chatgpt.com` の referral)を AI チャネルに入れるカスタムチャネルグループの定義。
   - `labola_reserve_complete`・`labola_reserve_complete_program` をキーイベントに指定。
3. **PSI API キー**: Google Cloud コンソールで PageSpeed Insights API を有効化してキーを作る → `.env.local` に `PSI_API_KEY=` を追記(値をチャットやファイルに書かない)。ローカルだけで使う。
4. **設定後の確認**: `npm run analytics:weekly` と `node scripts/analytics/query.mjs --days 7` で、Direct の減少・決済戻りの Referral の減少・AI チャネルの増加を確認する観点。
5. **基準値(修理前の参考)**: LaBOLA 週カレンダー閲覧→予約情報 約23%(自動アクセス除外後)、ホーム閲覧→予約案内クリック 52%。13% は誤り。
6. **週次の読み方**: 台帳との差が出たときの見方(Task 10 の「差の読み方」と同じ)、テニスベアの申込÷クリックの見方。

- [ ] **Step 2: 運用手順に追記する**

`docs/operations/interactive-analysis-runbook.md` の週次の手順の節に、1項目だけ追記する(既存の記述は変えない)。

```md
- 計測の健全性: `npm run analytics:weekly`(GA4 予約完了と予約台帳の週次突合・テニスベア申込・CrUX)。出力は画面に出すだけ。個人情報は出ない。設定の手順は `docs/operations/measurement-repair-checklist.md`。
```

追記位置は、実際のファイルを読んで、週次の手順が並んでいる箇所に合わせる。

---

### Task 12: 全体の検証と証跡

**Files:** なし(確認のみ)。証跡の保存先は `.superpowers/evidence/szb-505/`(gitignore 済み・コミットしない)。

- [ ] **Step 1: テスト・カバレッジ・lint・型**

Run: `npm run test:coverage`
Expected: すべて PASS、statements/branches/functions/lines 100%、閾値エラーなし。

Run: `npm run lint`
Expected: エラーなし。

Run: `npx tsc --noEmit`
Expected: エラーなし。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 2: 画面の確認(dev サーバー・ポート 3201)**

Run: `npx next dev -p 3201`(バックグラウンド)
ホーム `/` を モバイル 375px とデスクトップ 1440px で開き、スクリーンショットを `.superpowers/evidence/szb-505/` に保存する。ネットワークに `/_vercel/speed-insights/script.js` の読み込みがあるか、コンソールにエラーが無いかも確認する(開発モードでは送信されない場合があるので、読み込みだけを見る)。

- [ ] **Step 3: 実データの出力を証跡に保存する**

`node scripts/analytics/query.mjs --days 7` と `npm run analytics:weekly` の出力を `.superpowers/evidence/szb-505/` にテキストで保存する(氏名・トークンが無いことを確認)。

- [ ] **Step 4: 後片付け**

検証後に `.next`・`coverage` を削除する(司令塔の指示)。`.env.local` は gitignore 済みなので残してよいが、値をログやファイルに書かない。

- [ ] **Step 5: 司令塔へ確認依頼を送る**

変更の要約、証跡の絶対パス、テスト・カバレッジ・lint・型の結果、オーナー確認事項(Vercel プラン・PSI キー・GA4 設定)を送る。**ここで止まって待つ。OK が出るまでコミットしない。**

- [ ] **Step 6: OK 後にコミット・push・PR(司令塔の OK が出てから)**

日本語の Conventional Commits で分ける(例: `feat: 表示速度の計測に Speed Insights を入れる` / `feat: 集計スクリプトをサイトと LaBOLA で分けて自動アクセスを除く` / `feat: 週次で予約完了と台帳・テニスベア申込を突き合わせる` / `docs: 計測修理の手順書を足す`)。設計書・計画書も含める。push と PR 作成は AI アカウントのトークンを明示する(共通指示書の手順)。
