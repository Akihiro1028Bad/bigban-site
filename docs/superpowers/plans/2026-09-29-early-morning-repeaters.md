# 早朝ピックル リピーター可視化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** テニスベアと LaBOLA の早朝ピックル参加者を人単位で数え、Notion に常連一覧・参加記録・開催回を保存し、前夜 21:00 に LINE グループへ参加者一覧(何回目か)を送る。

**Architecture:** Mac のローカルルーチンが `npm run early:sync` を 08:30 / 20:30 に実行する。スクリプトはテニスベアの HTML(`window.__NUXT__`)を実行せずに AST 評価して参加者を取り、Notion API で予約台帳を読み、名寄せ・回数・判定を決定的に計算して Notion の4オブジェクトへ差分書き込みする。クラウドルーチンは 21:00 に橋渡しページの JSON を読み、翌日が開催日なら Flex をそのまま LINE に push する。

**Tech Stack:** TypeScript(tsx 実行)、Vitest 4 + istanbul(カバレッジ100%)、acorn(構文解析のみ)、zod 4、Notion REST API(2022-06-28)、LINE Messaging API(push)、Claude ローカル定期タスク + claude.ai クラウドルーチン。

**Spec:** `docs/superpowers/specs/2026-09-29-early-morning-repeaters-design.md`(以下「設計書」)。

## Global Constraints

- 早朝イベントの判定は開始時刻 `06:00`(JST)。タイトル文言に依存しない
- テニスベアのゲスト(`user.id === -1` または `guestUserFlg === true`)は常に除外する
- 開催回・回数・連続・ご無沙汰は日数ではなく**開催回**単位。中止回は開催回に含めない
- 判定基準: 新顔=累計1〜2回、常連=直近8開催のうち4回以上、ご無沙汰=累計3回以上かつ最終参加後の開催4回以上連続不参加。優先順 ご無沙汰 > 常連 > 新顔 > 通常
- 節目: 5・10・20・30・50回、以降50回ごと
- 外部サイトの JS は実行しない(`vm` / `eval` / `new Function` 禁止)。acorn で解析し、許可したノードだけ評価する
- 個人名はリポジトリ(コード・テスト・ログ・コミット・PR)に残さない。テストは架空の名前(「テスト太郎」等)だけを使う。標準出力は件数のみ
- 予約台帳から電話番号・メール・住所・生年月日を取得しない(`filter_properties` で6列に限定)
- スタッフ入力列(① リワード済み・メモ、② 出欠)をルーチンは上書きしない(例外は3つだけ: 統合時のリワード済みの和集合、メモの空欄補完、欠席の書き写し。どれも値を消さない)
- テニスベアへのリクエストは1秒以上の間隔を空ける
- TypeScript: `strict`、`any` 禁止、型のみの import は `import type`、`@ts-ignore` 禁止
- テストは `// @vitest-environment node` を先頭に置き、`fetch` は注入した `FetchFn` のスタブで置き換える(`scripts/growth/http.ts` の既存パターン)。CLAUDE.md の「API モックは MSW」は Web アプリ側のテスト向けと解釈し、`scripts/` 配下はリポジトリの既存パターンに揃える(2026-09-29 オーナー判断。設計書 §11 も同じ)
- カバレッジ 100%(statements/branches/functions/lines)。CLI 入口だけ除外し、`docs/testing/growth-coverage-alternatives.{json,md}` に登録する
- コミットメッセージは日本語・Conventional Commits・末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- push は AI アカウント `ttmakhr1028ai-art` のトークンを明示指定する(`gh auth switch` が定着しないため)
- 作業場所は worktree `/Users/tsutsumi.akihiro/dev/bigban-early-morning`(ブランチ `feature/early-morning-repeaters`)。最初に `npm ci` を実行する

## File Structure

```
scripts/early-morning/
  types.ts            ドメイン型(テニスベア・LaBOLA・開催回・人・参加記録・集計)
  config.ts           固定値(サークルID・開始時刻・判定基準・節目・間隔)
  notionIds.ts        Notion の DB/ページ ID(Task 1 で確定)
  dates.ts            JST の日付・時刻の算出と表示整形
  nuxtPayload.ts      HTML から window.__NUXT__ を取り出し AST 評価する
  tennisbear.ts       サークル一覧・イベント詳細の抽出と取得
  notionProps.ts      Notion プロパティ値の組み立て・読み取り
  notionClient.ts     Notion REST の薄いクライアント(429/5xx リトライ・ページング)
  identity.ts         氏名正規化・人キー・名寄せ
  ledger.ts           予約台帳から早朝イベント予約を取得
  attendance.ts       開催回・人・参加記録の組み立てと回次採番
  metrics.ts          人ごとの集計・状態・節目・次回開催回
  lineMessage.ts      LINE Flex メッセージの組み立て
  notionSync.ts       Notion 4オブジェクトの読み取り・差分書き込み・統合
  sync.ts             全体の実行順序と失敗時の橋渡し更新
  early-sync.ts       CLI 入口(カバレッジ対象外)
  *.test.ts           各ファイルに併置
docs/growth/routines/early-morning-notify.md   クラウドルーチンのプロンプト正本
docs/operations/early-morning-repeaters.md     スタッフ向け運用メモ
```

変更: `package.json`(acorn・npm script)、`vitest.config.ts`、`docs/testing/growth-coverage-alternatives.{json,md}`、`docs/operations/interactive-analysis-runbook.md`(個人情報の例外)、`CLAUDE.md`(1段落)。

## PR 分割

CLAUDE.md の「PR は 400 行未満」に合わせ、同じブランチから順に3本出す。

- PR1: Task 1〜6(Notion 準備・取得層)
- PR2: Task 7〜9(集計・文面)
- PR3: Task 10〜13(書き込み・実行・運用)

---

### Task 1: Notion の置き場所を作り、ID を確定する

**Files:**
- Create: `scripts/early-morning/notionIds.ts`
- Test: `scripts/early-morning/notionIds.test.ts`
- Modify: `docs/operations/interactive-analysis-runbook.md`(「台帳の個人情報の扱い」の表の直後)

**Interfaces:**
- Produces: `NOTION_IDS: { ledgerDb: string; peopleDb: string; recordsDb: string; sessionsDb: string; bridgePage: string; peopleDbUrl: string }`

- [ ] **Step 1: 親ページと DB を Notion コネクタで作る**

ToolSearch で `select:mcp__1d8ba1a9-d2ad-4641-bf1a-0352fbf4ff91__notion-create-pages,mcp__1d8ba1a9-d2ad-4641-bf1a-0352fbf4ff91__notion-create-database,mcp__1d8ba1a9-d2ad-4641-bf1a-0352fbf4ff91__notion-fetch` を読み込む。

1. ワークスペース直下(非公開)にページ「早朝ピックル常連」を作る。本文は「早朝ピックルのリピーター集計。ローカルの early:sync が更新する。個人名を含むため共有しない」の1行。
2. その中に DB を3つ作る(列名は1文字も変えない)。

① **早朝常連**: `表示名`(title) / `識別子`(text) / `テニスベアID`(number) / `LaBOLA氏名`(text) / `累計`(number) / `直近8回`(number) / `連続`(number) / `初参加日`(date) / `最終参加日`(date) / `状態`(select: 新顔・常連・ご無沙汰・通常) / `次回申込`(checkbox) / `次の節目`(text) / `到達節目`(multi-select: 5,10,20,30,50,100) / `未渡し節目`(multi-select: 同) / `リワード済み`(multi-select: 同) / `メモ`(text) / `同期ハッシュ`(text)

② **早朝参加記録**: `キー`(title) / `開催日`(date) / `人`(relation → ①、片方向) / `経路`(select: テニスベア・LaBOLA・両方) / `申込日時`(date) / `状態`(select: 申込・キャンセル・元データになし) / `回次`(number) / `出欠`(select: 欠席) / `元データ`(text) / `同期ハッシュ`(text)

③ **早朝開催回**: `開催日`(title) / `日付`(date) / `テニスベアイベントID`(text) / `中止`(checkbox) / `申込数`(number) / `同期ハッシュ`(text)

3. 同じ親ページの下にページ「次回の早朝(通知橋渡し)」を作る。本文は空でよい。

- [ ] **Step 2: ① にビューを作る**

`notion-create-view` を ToolSearch で読み込み、① に次のビューを作る: 「次回の参加者」(次回申込 = チェック、累計の降順) / 「未渡しリワード」(未渡し節目が空でない) / 「ご無沙汰」(状態 = ご無沙汰、最終参加日の降順) / 「累計ランキング」(累計の降順) / 「LaBOLA氏名が未対応」(識別子が `lb:` で始まる)。

- [ ] **Step 3: オーナーに共有を依頼して待つ**

オーナーへの依頼文(そのまま伝える):「Notion のページ『早朝ピックル常連』を開き、右上『…』→『接続』→『bigban-growth』を追加してください。終わったら一言ください。」

- [ ] **Step 4: API から読めることを確認する**

作成した4つの ID(ハイフンなし32桁)を `PEOPLE` `RECORDS` `SESSIONS` `BRIDGE` に入れて実行する。

```bash
cd /Users/tsutsumi.akihiro/dev/bigban && set -a && . ./.env.local && set +a
for id in $PEOPLE $RECORDS $SESSIONS; do curl -s -o /dev/null -w "db $id: %{http_code}\n" -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/databases/$id; done
curl -s -o /dev/null -w "page $BRIDGE: %{http_code}\n" -H "Authorization: Bearer $NOTION_TOKEN" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/pages/$BRIDGE
```

Expected: 4行すべて `200`。`404` ならオーナーの共有が未完了なので Step 3 に戻る。

- [ ] **Step 5: 失敗するテストを書く**

`scripts/early-morning/notionIds.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NOTION_IDS } from "./notionIds";

describe("NOTION_IDS", () => {
  it("DB とページの ID はハイフンなし32桁の16進数", () => {
    const { ledgerDb, peopleDb, recordsDb, sessionsDb, bridgePage } = NOTION_IDS;
    for (const id of [ledgerDb, peopleDb, recordsDb, sessionsDb, bridgePage]) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("予約台帳は既存の Labora 予約台帳を指す", () => {
    expect(NOTION_IDS.ledgerDb).toBe("f93a73e9821e4a70b8ed72d3b413c203");
  });

  it("常連 DB の URL は常連 DB の ID を含む notion.so の URL", () => {
    expect(NOTION_IDS.peopleDbUrl).toBe(`https://www.notion.so/${NOTION_IDS.peopleDb}`);
  });
});
```

- [ ] **Step 6: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/notionIds.test.ts`
Expected: FAIL(`Cannot find module './notionIds'`)

- [ ] **Step 7: 実装する**

`scripts/early-morning/notionIds.ts`(Step 4 で確認した実 ID を入れる):

```ts
/**
 * 早朝リピーター集計が読み書きする Notion の ID。秘密情報ではない(アクセスには NOTION_TOKEN が要る)。
 * 親ページ「早朝ピックル常連」は bigban-growth 連携に共有済みであること。
 */
const PEOPLE_DB = "<Step 4 の PEOPLE>";

export const NOTION_IDS = {
  ledgerDb: "f93a73e9821e4a70b8ed72d3b413c203",
  peopleDb: PEOPLE_DB,
  recordsDb: "<Step 4 の RECORDS>",
  sessionsDb: "<Step 4 の SESSIONS>",
  bridgePage: "<Step 4 の BRIDGE>",
  peopleDbUrl: `https://www.notion.so/${PEOPLE_DB}`,
} as const;
```

`<…>` は Step 4 で 200 を確認した値そのものに置き換える(このファイルに山括弧が残っていたら未完了)。

- [ ] **Step 8: テストが通ることを確認する**

Run: `npx vitest run scripts/early-morning/notionIds.test.ts`
Expected: PASS(3件)

- [ ] **Step 9: runbook に例外を追記する**

`docs/operations/interactive-analysis-runbook.md` の「台帳の個人情報の扱い」の表の直後に追加する:

```markdown
**例外(2026-09-29〜)**: Notion ページ「早朝ピックル常連」配下の DB(早朝常連・早朝参加記録・早朝開催回)と「次回の早朝(通知橋渡し)」ページには、リワードと声かけの運用のため氏名・ニックネームを置く。置くのは名前と参加集計だけで、連絡先は置かない。書き込むのは `npm run early:sync` だけ。設計: `docs/superpowers/specs/2026-09-29-early-morning-repeaters-design.md`
```

- [ ] **Step 10: コミット**

```bash
git add scripts/early-morning/notionIds.ts scripts/early-morning/notionIds.test.ts docs/operations/interactive-analysis-runbook.md
git commit -m "feat: 早朝リピーター集計の Notion 置き場所を定義する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 型・固定値・日付ユーティリティ

**Files:**
- Create: `scripts/early-morning/types.ts`, `scripts/early-morning/config.ts`, `scripts/early-morning/dates.ts`
- Test: `scripts/early-morning/dates.test.ts`, `scripts/early-morning/config.test.ts`

**Interfaces:**
- Produces(types.ts):

```ts
export type TbUserStatus = "APPROVE" | "CANCEL";
export interface TbParticipant { userId: number; name: string; status: TbUserStatus; isGuest: boolean; appliedAt: string | null; }
export interface TbEventSummary { id: number; startAt: string; isCallOff: boolean; }
export interface TbEventDetail extends TbEventSummary { participants: TbParticipant[]; ignoredStatusCount: number; }
export interface LbReservation { reservationNo: string; name: string; date: string; timeSlot: string; isCancelled: boolean; receivedAt: string | null; }
export interface NameLink { tbId: number; lbName: string; }
export type Route = "テニスベア" | "LaBOLA" | "両方";
export type RecordStatus = "申込" | "キャンセル";
export interface Session { date: string; tbEventIds: number[]; isCallOff: boolean; }
export interface Person { key: string; displayName: string; tbId: number | null; lbName: string | null; }
export interface AttendanceRecord { key: string; date: string; personKey: string; route: Route; appliedAt: string | null; status: RecordStatus; sources: string[]; ordinal: number | null; }
export type PersonState = "新顔" | "常連" | "ご無沙汰" | "通常";
export interface PersonStats extends Person { total: number; recent: number; streak: number; firstDate: string | null; lastDate: string | null; state: PersonState; nextMilestone: string; reachedMilestones: number[]; isNextApplied: boolean; }
```

- Produces(config.ts): `CIRCLE_ID = 36659`、`TENNISBEAR_BASE_URL`、`EARLY_START_TIME = "06:00"`、`FETCH_INTERVAL_MS = 1000`、`FETCH_TIMEOUT_MS = 30000`、`RULES`、`MILESTONES`、`MILESTONE_STEP_AFTER_LAST`
- Produces(dates.ts): `jstDate(now: Date): string`(`YYYY-MM-DD`)、`jstDateTime(now: Date): string`(`YYYY-MM-DDTHH:MM:SS+09:00`)、`isoDatePart(iso: string): string`、`isoTimePart(iso: string): string`(`HH:MM`)、`formatMonthDayWeekday(date: string): string`(`10/6(火)`)、`formatMonthDayTime(isoJst: string): string`(`10/5 20:31`)、`formatStartTime(hhmm: string): string`(`6:00`)

- [ ] **Step 1: 依存を入れる**

```bash
cd /Users/tsutsumi.akihiro/dev/bigban-early-morning
npm ci
npm install --save-dev acorn@^8.16.0
```

- [ ] **Step 2: 失敗するテストを書く**

`scripts/early-morning/dates.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatMonthDayTime,
  formatMonthDayWeekday,
  formatStartTime,
  isoDatePart,
  isoTimePart,
  jstDate,
  jstDateTime,
} from "./dates";

describe("dates", () => {
  it("UTC の夜は JST の翌日になる", () => {
    const now = new Date("2026-10-05T15:30:00Z");
    expect(jstDate(now)).toBe("2026-10-06");
    expect(jstDateTime(now)).toBe("2026-10-06T00:30:00+09:00");
  });

  it("ISO 文字列から日付と時刻を取り出す", () => {
    expect(isoDatePart("2026-08-25T06:00:00.000+09:00")).toBe("2026-08-25");
    expect(isoTimePart("2026-08-25T06:00:00.000+09:00")).toBe("06:00");
  });

  it("月日と曜日を表示用に整える", () => {
    expect(formatMonthDayWeekday("2026-10-06")).toBe("10/6(火)");
    expect(formatMonthDayWeekday("2026-10-04")).toBe("10/4(日)");
  });

  it("更新日時を M/D HH:MM に整える", () => {
    expect(formatMonthDayTime("2026-10-05T20:31:00+09:00")).toBe("10/5 20:31");
  });

  it("開始時刻の先頭ゼロを外す", () => {
    expect(formatStartTime("06:00")).toBe("6:00");
    expect(formatStartTime("19:00")).toBe("19:00");
  });
});
```

`scripts/early-morning/config.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EARLY_START_TIME, MILESTONES, MILESTONE_STEP_AFTER_LAST, RULES } from "./config";

describe("config", () => {
  it("設計書の判定基準と一致する", () => {
    expect(EARLY_START_TIME).toBe("06:00");
    expect(RULES).toEqual({
      recentWindow: 8,
      regularMinInWindow: 4,
      dormantMisses: 4,
      dormantMinTotal: 3,
      newMaxTotal: 2,
    });
    expect(MILESTONES).toEqual([5, 10, 20, 30, 50]);
    expect(MILESTONE_STEP_AFTER_LAST).toBe(50);
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/dates.test.ts scripts/early-morning/config.test.ts`
Expected: FAIL(モジュールが見つからない)

- [ ] **Step 4: 実装する**

`scripts/early-morning/types.ts`: 上の Interfaces の型定義をそのまま書く(各型に1行の JSDoc。`startAt` は「`+09:00` 付き ISO8601」、`date` は「JST の `YYYY-MM-DD`」、`sources` は「`tb:{イベントID}` / `lb:{予約番号}`」、`ordinal` は「申込かつ欠席でない回だけ採番。それ以外は null」と書く)。

`scripts/early-morning/config.ts`:

```ts
/** 早朝リピーター集計の固定値。判定基準を変えるときはこのファイルだけを直す。 */
export const CIRCLE_ID = 36659;
export const TENNISBEAR_BASE_URL = "https://www.tennisbear.net";
/** 早朝イベントとみなす開始時刻(JST)。タイトル文言には依存しない。 */
export const EARLY_START_TIME = "06:00";
/** テニスベアへの連続リクエストの間隔。 */
export const FETCH_INTERVAL_MS = 1000;
export const FETCH_TIMEOUT_MS = 30_000;

/** 状態判定の基準(開催回単位)。 */
export const RULES = {
  recentWindow: 8,
  regularMinInWindow: 4,
  dormantMisses: 4,
  dormantMinTotal: 3,
  newMaxTotal: 2,
} as const;

/** 節目。最後の値より先は MILESTONE_STEP_AFTER_LAST ごと。 */
export const MILESTONES = [5, 10, 20, 30, 50] as const;
export const MILESTONE_STEP_AFTER_LAST = 50;
```

`scripts/early-morning/dates.ts`:

```ts
const JST = "Asia/Tokyo";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** JST の日付 YYYY-MM-DD。 */
export function jstDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** JST の日時 YYYY-MM-DDTHH:MM:SS+09:00。 */
export function jstDateTime(now: Date): string {
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return `${text.replace(" ", "T")}+09:00`;
}

/** +09:00 付き ISO8601 の日付部分。 */
export function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/** +09:00 付き ISO8601 の時刻部分 HH:MM。 */
export function isoTimePart(iso: string): string {
  return iso.slice(11, 16);
}

/** YYYY-MM-DD を M/D(曜) にする。 */
export function formatMonthDayWeekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}(${weekday})`;
}

/** +09:00 付き ISO8601 を M/D HH:MM にする。 */
export function formatMonthDayTime(isoJst: string): string {
  return `${Number(isoJst.slice(5, 7))}/${Number(isoJst.slice(8, 10))} ${isoJst.slice(11, 16)}`;
}

/** HH:MM の時の先頭ゼロを外す。 */
export function formatStartTime(hhmm: string): string {
  return `${Number(hhmm.slice(0, 2))}${hhmm.slice(2)}`;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/early-morning/dates.test.ts scripts/early-morning/config.test.ts && npx tsc --noEmit -p .`
Expected: PASS、型エラーなし

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json scripts/early-morning/types.ts scripts/early-morning/config.ts scripts/early-morning/dates.ts scripts/early-morning/dates.test.ts scripts/early-morning/config.test.ts
git commit -m "feat: 早朝リピーター集計の型と固定値と日付処理を追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `window.__NUXT__` を実行せずに評価する

**Files:**
- Create: `scripts/early-morning/nuxtPayload.ts`
- Test: `scripts/early-morning/nuxtPayload.test.ts`

**Interfaces:**
- Produces: `class NuxtPayloadError extends Error`、`extractNuxtSource(html: string): string`、`parseNuxtState(html: string): unknown`、`node(value: unknown): AstNode` / `nodeList(value: unknown): Array<AstNode | null>`(構文木の形の検査。acorn の正常な出力では失敗側に届かないため、直接テストできるように export する)

実データ(2026-09-29 調査)の構文: `(function(a,b,…){return {…}}(引数…))`。関数本体は `return` 1文のみ。値に現れるノードは ObjectExpression / Property / ArrayExpression / Literal / Identifier / UnaryExpression(`-`・`void`)だけ。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/nuxtPayload.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NuxtPayloadError, extractNuxtSource, node, nodeList, parseNuxtState } from "./nuxtPayload";

function page(payload: string): string {
  return `<html><body><div id="__nuxt"></div><script>window.__NUXT__=${payload};</script></body></html>`;
}

describe("extractNuxtSource", () => {
  it("script から代入式の右辺を取り出す", () => {
    expect(extractNuxtSource(page("(function(a){return {x:a}}(1))"))).toBe(
      "(function(a){return {x:a}}(1))",
    );
  });

  it("window.__NUXT__ がなければエラー", () => {
    expect(() => extractNuxtSource("<html></html>")).toThrow(NuxtPayloadError);
  });
});

describe("parseNuxtState", () => {
  it("引数参照・入れ子・配列・エスケープを復元する", () => {
    const html = page(
      '(function(a,b,c){return {state:{id:a,flag:b,none:c,list:[a,"x\\u002Fy",{n:-1}],"quoted-key":void 0}}}(10,false,null))',
    );
    expect(parseNuxtState(html)).toEqual({
      state: { id: 10, flag: false, none: null, list: [10, "x/y", { n: -1 }], "quoted-key": undefined },
    });
  });

  it("配列の穴は undefined、! 演算と undefined 識別子に対応する", () => {
    const html = page("(function(a){return {list:[,a],neg:!a,u:undefined}}(true))");
    expect(parseNuxtState(html)).toEqual({ list: [undefined, true], neg: false, u: undefined });
  });

  it("__proto__ キーでプロトタイプを汚さない", () => {
    const state = parseNuxtState(page('(function(){return {"__proto__":{polluted:true}}}())')) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(state, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    ["関数呼び出しでない", "{a:1}"],
    ["呼び出し先が関数式でない", "foo(1)"],
    ["引数が識別子でない", "(function({a}){return {}}(1))"],
    ["本体が return 1文でない", "(function(a){a.x=1;return {}}(1))"],
    ["未定義の識別子", "(function(){return {x:window}}())"],
    ["未対応の構文", "(function(){return {x:1+1}}())"],
    ["未対応の単項演算", "(function(){return {x:typeof 1}}())"],
    ["数値以外の負号", '(function(){return {x:-"a"}}())'],
    ["計算プロパティ", '(function(){return {["x"]:1}}())'],
    ["スプレッド", "(function(a){return {...a}}({}))"],
    ["正規表現", "(function(){return {x:/a/}}())"],
    ["テンプレート文字列", "(function(){return {x:`a`}}())"],
    ["メソッド", "(function(){return {m(){}}}())"],
  ])("%s はエラーにする", (_label, payload) => {
    expect(() => parseNuxtState(page(payload))).toThrow(NuxtPayloadError);
  });
});

describe("構文木の形の検査", () => {
  it("ノードでない値・配列でない値はエラー、正しい形はそのまま返す", () => {
    expect(() => node(null)).toThrow(NuxtPayloadError);
    expect(() => node({ type: 1 })).toThrow(NuxtPayloadError);
    expect(() => nodeList("x")).toThrow(NuxtPayloadError);
    expect(nodeList([null, { type: "Literal" }])).toEqual([null, { type: "Literal" }]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/nuxtPayload.test.ts`
Expected: FAIL(`Cannot find module './nuxtPayload'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/nuxtPayload.ts`:

```ts
/**
 * テニスベアの HTML に埋め込まれた window.__NUXT__ を、JS を実行せずに復元する。
 * acorn で構文解析し、実データに現れるノードだけを評価する。未知の構文は推測せずエラーにする。
 */
import { parseExpressionAt } from "acorn";

const NUXT_PATTERN = /<script>window\.__NUXT__=([\s\S]*?);?<\/script>/;

export interface AstNode {
  type: string;
  [key: string]: unknown;
}

type Scope = ReadonlyMap<string, unknown>;

export class NuxtPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NuxtPayloadError";
  }
}

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function node(value: unknown): AstNode {
  if (!isNode(value)) throw new NuxtPayloadError("構文木の形が想定と違います");
  return value;
}

export function nodeList(value: unknown): Array<AstNode | null> {
  if (!Array.isArray(value)) throw new NuxtPayloadError("構文木の形が想定と違います");
  return value.map((item) => (item === null ? null : node(item)));
}

function identifierName(value: AstNode): string {
  if (value.type !== "Identifier") throw new NuxtPayloadError(`識別子ではありません: ${value.type}`);
  return String(value.name);
}

export function extractNuxtSource(html: string): string {
  const match = NUXT_PATTERN.exec(html);
  if (!match) throw new NuxtPayloadError("window.__NUXT__ が見つかりません");
  return match[1];
}

function evaluateObject(value: AstNode, scope: Scope): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of nodeList(value.properties)) {
    const property = node(item);
    if (property.type !== "Property" || property.computed || property.method || property.kind !== "init") {
      throw new NuxtPayloadError(`未対応のプロパティ: ${property.type}`);
    }
    const key = node(property.key);
    const name = key.type === "Identifier" ? String(key.name) : String(evaluateLiteral(key));
    Object.defineProperty(result, name, {
      value: evaluate(node(property.value), scope),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function evaluateLiteral(value: AstNode): unknown {
  if (value.type !== "Literal" || value.regex) throw new NuxtPayloadError(`未対応のリテラル: ${value.type}`);
  return value.value;
}

function evaluateUnary(value: AstNode, scope: Scope): unknown {
  const argument = evaluate(node(value.argument), scope);
  switch (value.operator) {
    case "void":
      return undefined;
    case "!":
      return !argument;
    case "-":
      if (typeof argument !== "number") throw new NuxtPayloadError("数値以外に負号が付いています");
      return -argument;
    default:
      throw new NuxtPayloadError(`未対応の単項演算: ${String(value.operator)}`);
  }
}

function evaluate(value: AstNode, scope: Scope): unknown {
  switch (value.type) {
    case "Literal":
      return evaluateLiteral(value);
    case "Identifier": {
      const name = identifierName(value);
      if (scope.has(name)) return scope.get(name);
      if (name === "undefined") return undefined;
      throw new NuxtPayloadError(`未定義の識別子: ${name}`);
    }
    case "ArrayExpression":
      return nodeList(value.elements).map((element) => (element === null ? undefined : evaluate(element, scope)));
    case "ObjectExpression":
      return evaluateObject(value, scope);
    case "UnaryExpression":
      return evaluateUnary(value, scope);
    default:
      throw new NuxtPayloadError(`未対応の構文: ${value.type}`);
  }
}

/** HTML から window.__NUXT__ の値を復元する。 */
export function parseNuxtState(html: string): unknown {
  const root = node(parseExpressionAt(extractNuxtSource(html), 0, { ecmaVersion: 2022 }));
  if (root.type !== "CallExpression") throw new NuxtPayloadError("関数呼び出しではありません");
  const callee = node(root.callee);
  if (callee.type !== "FunctionExpression") throw new NuxtPayloadError("呼び出し先が関数式ではありません");
  const params = nodeList(callee.params).map((param) => identifierName(node(param)));
  const args = nodeList(root.arguments).map((arg) => evaluate(node(arg), new Map()));
  const scope = new Map(params.map((name, index) => [name, args[index]]));
  const statements = nodeList(node(callee.body).body);
  const onlyStatement = statements.length === 1 ? node(statements[0]) : null;
  if (!onlyStatement || onlyStatement.type !== "ReturnStatement") {
    throw new NuxtPayloadError("関数本体が return 1文ではありません");
  }
  return evaluate(node(onlyStatement.argument), scope);
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/nuxtPayload.test.ts --coverage --coverage.include=scripts/early-morning/nuxtPayload.ts`
Expected: PASS、nuxtPayload.ts が 100%。100% に届かない分岐があれば、その分岐に届くテストケースを `it.each` に足す(実装側に `istanbul ignore` を足さない)。

- [ ] **Step 5: 実データで全件解析できることを確かめる(ファイルに残さない)**

```bash
npx tsx -e '
import { parseNuxtState } from "./scripts/early-morning/nuxtPayload";
for (const url of ["https://www.tennisbear.net/pickleball/circle/36659/events", "https://www.tennisbear.net/pickleball/event/1590430/info"]) {
  const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const state = parseNuxtState(html);
  console.log(url, typeof state, JSON.stringify(state).length);
}'
```

Expected: 2行とも `object` と数十万文字程度の長さ。エラーなら未対応ノードの種類を確認し、テストを足してから評価器を広げる。

- [ ] **Step 6: コミット**

```bash
git add scripts/early-morning/nuxtPayload.ts scripts/early-morning/nuxtPayload.test.ts
git commit -m "feat: テニスベアの埋め込みデータを実行せずに復元する評価器を追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: テニスベアの早朝イベントと参加者を取る

**Files:**
- Create: `scripts/early-morning/tennisbear.ts`
- Test: `scripts/early-morning/tennisbear.test.ts`

**Interfaces:**
- Consumes: `parseNuxtState`(Task 3)、`TbEventSummary` / `TbEventDetail` / `TbParticipant`(Task 2)、`FetchFn`(`scripts/growth/http.ts`)、`isoTimePart`、`CIRCLE_ID` / `TENNISBEAR_BASE_URL` / `EARLY_START_TIME` / `FETCH_TIMEOUT_MS`
- Produces:
  - `class TennisbearError extends Error`
  - `extractCircleEvents(state: unknown): TbEventSummary[]`
  - `extractEventDetail(state: unknown): TbEventDetail`
  - `isEarlyEvent(event: TbEventSummary): boolean`
  - `fetchEarlyEventDetails(deps: { fetchFn: FetchFn; sleep: (ms: number) => Promise<void>; intervalMs: number }): Promise<TbEventDetail[]>`(開始日時の昇順。中止回は取得せず `participants: []`)

データの場所(2026-09-29 調査): サークル一覧は `state.feature.circle.circleDetail.CircleOrganizedEvents.{circleOrganizedFutureEventList,circleOrganizedPastEventList}[]`(`id` / `startDatetimeString` / `callOff`)。イベント詳細は `state.feature.event.eventDetail.EventDetail.event`(`id` / `startDateTime` / `callOff` / `participantList[]` / `cancelUserList[]`)。参加者は `eventUserStatusType` / `guestUserFlg` / `applyDateTime` / `user.{id,name}`。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/tennisbear.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import {
  TennisbearError,
  extractCircleEvents,
  extractEventDetail,
  fetchEarlyEventDetails,
  isEarlyEvent,
} from "./tennisbear";

function summary(id: number, start: string, callOff = false) {
  return { id, startDatetimeString: start, callOff, eventTitle: "無関係なタイトル" };
}

function circleState(future: unknown[], past: unknown[]) {
  return {
    state: {
      feature: {
        circle: {
          circleDetail: {
            CircleOrganizedEvents: { circleOrganizedFutureEventList: future, circleOrganizedPastEventList: past },
          },
        },
      },
    },
  };
}

function user(id: number, name: string, status: string, guest = false) {
  return { eventUserStatusType: status, guestUserFlg: guest, applyDateTime: "2026-09-20T10:00:00.000+09:00", user: { id, name } };
}

function eventState(id: number, start: string, participants: unknown[], cancels: unknown[] = [], callOff = false) {
  return {
    state: {
      feature: {
        event: {
          eventDetail: {
            EventDetail: {
              event: { id, startDateTime: start, callOff, participantList: participants, cancelUserList: cancels },
            },
          },
        },
      },
    },
  };
}

function htmlOf(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

function response(body: string, status = 200): HttpResponse {
  return { ok: status < 400, status, json: async () => ({}), text: async () => body };
}

describe("extractCircleEvents", () => {
  it("今後と過去の一覧を合わせ、同じ ID は1件にする", () => {
    const state = circleState(
      [summary(3, "2026-10-06T06:00:00.000+09:00")],
      [summary(2, "2026-09-29T06:00:00.000+09:00", true), summary(3, "2026-10-06T06:00:00.000+09:00")],
    );
    expect(extractCircleEvents(state)).toEqual([
      { id: 3, startAt: "2026-10-06T06:00:00.000+09:00", isCallOff: false },
      { id: 2, startAt: "2026-09-29T06:00:00.000+09:00", isCallOff: true },
    ]);
  });

  it("形が違えばエラー", () => {
    expect(() => extractCircleEvents({ state: {} })).toThrow(TennisbearError);
  });
});

describe("isEarlyEvent", () => {
  it("開始 06:00 だけを早朝とみなす", () => {
    expect(isEarlyEvent({ id: 1, startAt: "2026-10-06T06:00:00.000+09:00", isCallOff: false })).toBe(true);
    expect(isEarlyEvent({ id: 2, startAt: "2026-10-06T12:00:00.000+09:00", isCallOff: false })).toBe(false);
  });
});

describe("extractEventDetail", () => {
  it("申込とキャンセルを取り、ゲストに印を付け、未知の状態は数だけ数える", () => {
    const state = eventState(
      9,
      "2026-09-22T06:00:00.000+09:00",
      [user(11, "テスト太郎", "APPROVE"), user(-1, "LBゲスト1", "APPROVE", true), user(12, "テスト次郎", "APPLYING")],
      [user(13, "テスト三郎", "CANCEL")],
    );
    expect(extractEventDetail(state)).toEqual({
      id: 9,
      startAt: "2026-09-22T06:00:00.000+09:00",
      isCallOff: false,
      ignoredStatusCount: 1,
      participants: [
        { userId: 11, name: "テスト太郎", status: "APPROVE", isGuest: false, appliedAt: "2026-09-20T10:00:00.000+09:00" },
        { userId: -1, name: "LBゲスト1", status: "APPROVE", isGuest: true, appliedAt: "2026-09-20T10:00:00.000+09:00" },
        { userId: 13, name: "テスト三郎", status: "CANCEL", isGuest: false, appliedAt: "2026-09-20T10:00:00.000+09:00" },
      ],
    });
  });

  it("ID が -1 ならゲスト印がなくてもゲスト扱い", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [{ ...user(-1, "枠", "APPROVE"), guestUserFlg: false }]);
    expect(extractEventDetail(state).participants[0].isGuest).toBe(true);
  });

  it("キャンセル一覧に CANCEL 以外があれば数だけ数える", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [], [user(14, "テスト四郎", "DECLINE")]);
    expect(extractEventDetail(state).ignoredStatusCount).toBe(1);
  });

  it("形が違えばエラー", () => {
    expect(() => extractEventDetail({ state: { feature: {} } })).toThrow(TennisbearError);
  });
});

describe("fetchEarlyEventDetails", () => {
  const circleHtml = htmlOf(
    circleState(
      [summary(5, "2026-10-06T06:00:00.000+09:00"), summary(6, "2026-10-06T12:00:00.000+09:00")],
      [summary(4, "2026-09-29T06:00:00.000+09:00"), summary(3, "2026-09-24T06:00:00.000+09:00", true)],
    ),
  );

  it("早朝だけを開始順に取得し、中止回は取得しない", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url.endsWith("/circle/36659/events")) return response(circleHtml);
      if (url.endsWith("/event/4/info")) return response(htmlOf(eventState(4, "2026-09-29T06:00:00.000+09:00", [user(11, "テスト太郎", "APPROVE")])));
      if (url.endsWith("/event/5/info")) return response(htmlOf(eventState(5, "2026-10-06T06:00:00.000+09:00", [])));
      return response("", 404);
    });
    const sleep = vi.fn(async () => undefined);

    const details = await fetchEarlyEventDetails({ fetchFn, sleep, intervalMs: 1000 });

    expect(details.map((d) => [d.id, d.isCallOff, d.participants.length])).toEqual([
      [3, true, 0],
      [4, false, 1],
      [5, false, 0],
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://www.tennisbear.net/pickleball/circle/36659/events");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("HTTP エラーは TennisbearError", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("", 503));
    await expect(fetchEarlyEventDetails({ fetchFn, sleep: async () => undefined, intervalMs: 0 })).rejects.toThrow(
      "HTTP 503",
    );
  });

  it("詳細ページの ID が一覧と違えばエラー", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      url.endsWith("/events")
        ? response(htmlOf(circleState([summary(5, "2026-10-06T06:00:00.000+09:00")], [])))
        : response(htmlOf(eventState(99, "2026-10-06T06:00:00.000+09:00", []))),
    );
    await expect(fetchEarlyEventDetails({ fetchFn, sleep: async () => undefined, intervalMs: 0 })).rejects.toThrow(
      TennisbearError,
    );
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/tennisbear.test.ts`
Expected: FAIL(`Cannot find module './tennisbear'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/tennisbear.ts`:

```ts
/** テニスベアのサークル一覧とイベント詳細から、早朝イベントの参加者を取り出す。 */
import { z } from "zod";

import type { FetchFn } from "../growth/http";
import { CIRCLE_ID, EARLY_START_TIME, FETCH_TIMEOUT_MS, TENNISBEAR_BASE_URL } from "./config";
import { isoTimePart } from "./dates";
import { parseNuxtState } from "./nuxtPayload";
import type { TbEventDetail, TbEventSummary, TbParticipant } from "./types";

export class TennisbearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TennisbearError";
  }
}

const summarySchema = z.object({ id: z.number().int(), startDatetimeString: z.string(), callOff: z.boolean() });

const circleSchema = z.object({
  state: z.object({
    feature: z.object({
      circle: z.object({
        circleDetail: z.object({
          CircleOrganizedEvents: z.object({
            circleOrganizedFutureEventList: z.array(summarySchema),
            circleOrganizedPastEventList: z.array(summarySchema),
          }),
        }),
      }),
    }),
  }),
});

const participantSchema = z.object({
  eventUserStatusType: z.string(),
  guestUserFlg: z.boolean(),
  applyDateTime: z.string().nullable(),
  user: z.object({ id: z.number().int(), name: z.string() }),
});

const eventSchema = z.object({
  state: z.object({
    feature: z.object({
      event: z.object({
        eventDetail: z.object({
          EventDetail: z.object({
            event: z.object({
              id: z.number().int(),
              startDateTime: z.string(),
              callOff: z.boolean(),
              participantList: z.array(participantSchema),
              cancelUserList: z.array(participantSchema),
            }),
          }),
        }),
      }),
    }),
  }),
});

type RawParticipant = z.infer<typeof participantSchema>;

function parseWith<T>(schema: z.ZodType<T>, state: unknown, label: string): T {
  const result = schema.safeParse(state);
  if (!result.success) throw new TennisbearError(`${label}の形が想定と違います: ${result.error.message}`);
  return result.data;
}

export function extractCircleEvents(state: unknown): TbEventSummary[] {
  const lists = parseWith(circleSchema, state, "サークル一覧").state.feature.circle.circleDetail.CircleOrganizedEvents;
  const byId = new Map<number, TbEventSummary>();
  for (const item of [...lists.circleOrganizedFutureEventList, ...lists.circleOrganizedPastEventList]) {
    if (!byId.has(item.id)) byId.set(item.id, { id: item.id, startAt: item.startDatetimeString, isCallOff: item.callOff });
  }
  return [...byId.values()];
}

export function isEarlyEvent(event: TbEventSummary): boolean {
  return isoTimePart(event.startAt) === EARLY_START_TIME;
}

function toParticipant(raw: RawParticipant, status: TbParticipant["status"]): TbParticipant {
  return {
    userId: raw.user.id,
    name: raw.user.name,
    status,
    isGuest: raw.guestUserFlg || raw.user.id === -1,
    appliedAt: raw.applyDateTime,
  };
}

export function extractEventDetail(state: unknown): TbEventDetail {
  const event = parseWith(eventSchema, state, "イベント詳細").state.feature.event.eventDetail.EventDetail.event;
  const approved = event.participantList.filter((p) => p.eventUserStatusType === "APPROVE");
  const cancelled = event.cancelUserList.filter((p) => p.eventUserStatusType === "CANCEL");
  const ignoredStatusCount =
    event.participantList.length - approved.length + (event.cancelUserList.length - cancelled.length);
  return {
    id: event.id,
    startAt: event.startDateTime,
    isCallOff: event.callOff,
    ignoredStatusCount,
    participants: [
      ...approved.map((p) => toParticipant(p, "APPROVE")),
      ...cancelled.map((p) => toParticipant(p, "CANCEL")),
    ],
  };
}

async function fetchHtml(url: string, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn(url, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PBT-early-sync)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new TennisbearError(`${url} の取得に失敗しました (HTTP ${res.status})`);
  return res.text();
}

export async function fetchEarlyEventDetails(deps: {
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  intervalMs: number;
}): Promise<TbEventDetail[]> {
  const circleHtml = await fetchHtml(`${TENNISBEAR_BASE_URL}/pickleball/circle/${CIRCLE_ID}/events`, deps.fetchFn);
  const early = extractCircleEvents(parseNuxtState(circleHtml))
    .filter(isEarlyEvent)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const details: TbEventDetail[] = [];
  for (const event of early) {
    if (event.isCallOff) {
      details.push({ ...event, participants: [], ignoredStatusCount: 0 });
      continue;
    }
    await deps.sleep(deps.intervalMs);
    const html = await fetchHtml(`${TENNISBEAR_BASE_URL}/pickleball/event/${event.id}/info`, deps.fetchFn);
    const detail = extractEventDetail(parseNuxtState(html));
    if (detail.id !== event.id) throw new TennisbearError(`イベント ${event.id} の詳細が別のイベントを返しました`);
    details.push(detail);
  }
  return details;
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/tennisbear.test.ts --coverage --coverage.include=scripts/early-morning/tennisbear.ts`
Expected: PASS、100%

- [ ] **Step 5: 実データで件数だけ確かめる(名前は出さない)**

```bash
npx tsx -e '
import { defaultFetch } from "./scripts/growth/http";
import { fetchEarlyEventDetails } from "./scripts/early-morning/tennisbear";
const d = await fetchEarlyEventDetails({ fetchFn: defaultFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), intervalMs: 1000 });
console.log(d.map((e) => `${e.startAt.slice(0, 10)} id=${e.id} callOff=${e.isCallOff} approve=${e.participants.filter((p) => p.status === "APPROVE" && !p.isGuest).length} guest=${e.participants.filter((p) => p.isGuest).length} ignored=${e.ignoredStatusCount}`).join("\n"));'
```

Expected: 2026-08-04 以降の火・木の早朝回が並ぶ。9/22 は `approve=15 guest=3`、9/29 は `approve=10 guest=1`(設計書1章の突き合わせと一致)。

- [ ] **Step 6: コミット**

```bash
git add scripts/early-morning/tennisbear.ts scripts/early-morning/tennisbear.test.ts
git commit -m "feat: テニスベアの早朝イベントの参加者を取得する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Notion REST クライアントとプロパティ変換

**Files:**
- Create: `scripts/early-morning/notionProps.ts`, `scripts/early-morning/notionClient.ts`
- Test: `scripts/early-morning/notionProps.test.ts`, `scripts/early-morning/notionClient.test.ts`

**Interfaces:**
- Consumes: `FetchFn` / `HttpResponse`(`scripts/growth/http.ts`)
- Produces(notionProps.ts):
  - `interface NotionPage { id: string; properties: Record<string, unknown> }`
  - `prop.title(text)` / `prop.text(text | null)` / `prop.number(n | null)` / `prop.date(d | null)` / `prop.select(name | null)` / `prop.multiSelect(names)` / `prop.checkbox(v)` / `prop.relation(ids)` — それぞれ Notion API のプロパティ値オブジェクトを返す
  - `chunkText(text: string, size?: number): string[]`(既定 2000)
  - `readPlainText(page, name): string` / `readNumber(page, name): number | null` / `readSelect(page, name): string | null` / `readMultiSelect(page, name): string[]` / `readDate(page, name): string | null`
- Produces(notionClient.ts):
  - `class NotionApiError extends Error { status: number }`
  - `interface NotionBlock { id: string; type: string; [key: string]: unknown }`
  - `interface NotionClient { getDatabase(id: string): Promise<{ properties: Record<string, { id: string }> }>; queryAll(databaseId: string, body?: Record<string, unknown>, filterPropertyIds?: readonly string[]): Promise<NotionPage[]>; createPage(databaseId: string, properties: Record<string, unknown>): Promise<NotionPage>; updatePage(pageId: string, properties: Record<string, unknown>): Promise<void>; archivePage(pageId: string): Promise<void>; listChildren(blockId: string): Promise<NotionBlock[]>; deleteBlock(blockId: string): Promise<void>; appendChildren(blockId: string, children: readonly unknown[]): Promise<void> }`
  - `createNotionClient(options: { token: string; fetchFn: FetchFn; sleep: (ms: number) => Promise<void>; maxRetries?: number }): NotionClient`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/notionProps.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  chunkText,
  prop,
  readDate,
  readMultiSelect,
  readNumber,
  readPlainText,
  readSelect,
  type NotionPage,
} from "./notionProps";

const page: NotionPage = {
  id: "p1",
  properties: {
    名前: { type: "title", title: [{ plain_text: "テスト" }, { plain_text: "太郎" }] },
    メモ: { type: "rich_text", rich_text: [{ plain_text: "abc" }] },
    数: { type: "number", number: 3 },
    種別: { type: "select", select: { name: "常連" } },
    空種別: { type: "select", select: null },
    節目: { type: "multi_select", multi_select: [{ name: "5" }, { name: "10" }] },
    日: { type: "date", date: { start: "2026-09-22" } },
    空日: { type: "date", date: null },
  },
};

describe("prop", () => {
  it("Notion API の値の形を作る", () => {
    expect(prop.title("a")).toEqual({ title: [{ type: "text", text: { content: "a" } }] });
    expect(prop.text(null)).toEqual({ rich_text: [] });
    expect(prop.text("b")).toEqual({ rich_text: [{ type: "text", text: { content: "b" } }] });
    expect(prop.number(null)).toEqual({ number: null });
    expect(prop.date("2026-09-22")).toEqual({ date: { start: "2026-09-22" } });
    expect(prop.date(null)).toEqual({ date: null });
    expect(prop.select("常連")).toEqual({ select: { name: "常連" } });
    expect(prop.select(null)).toEqual({ select: null });
    expect(prop.multiSelect(["5"])).toEqual({ multi_select: [{ name: "5" }] });
    expect(prop.checkbox(true)).toEqual({ checkbox: true });
    expect(prop.relation(["x"])).toEqual({ relation: [{ id: "x" }] });
  });

  it("2000文字ごとに分ける", () => {
    expect(chunkText("a".repeat(4001)).map((c) => c.length)).toEqual([2000, 2000, 1]);
    expect(chunkText("")).toEqual([]);
  });
});

describe("read*", () => {
  it("各型の値を読む", () => {
    expect(readPlainText(page, "名前")).toBe("テスト太郎");
    expect(readPlainText(page, "メモ")).toBe("abc");
    expect(readNumber(page, "数")).toBe(3);
    expect(readSelect(page, "種別")).toBe("常連");
    expect(readSelect(page, "空種別")).toBeNull();
    expect(readMultiSelect(page, "節目")).toEqual(["5", "10"]);
    expect(readDate(page, "日")).toBe("2026-09-22");
    expect(readDate(page, "空日")).toBeNull();
  });

  it("列がない・型が違うときは空の値", () => {
    expect(readPlainText(page, "なし")).toBe("");
    expect(readNumber(page, "種別")).toBeNull();
    expect(readSelect(page, "なし")).toBeNull();
    expect(readMultiSelect(page, "なし")).toEqual([]);
    expect(readDate(page, "なし")).toBeNull();
  });
});
```

`scripts/early-morning/notionClient.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import { NotionApiError, createNotionClient } from "./notionClient";

function res(status: number, body: unknown, retryAfter: string | null = null): HttpResponse {
  return {
    ok: status < 400,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? retryAfter : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function client(fetchFn: FetchFn) {
  const sleep = vi.fn(async () => undefined);
  return { sleep, notion: createNotionClient({ token: "secret_test", fetchFn, sleep, maxRetries: 2 }) };
}

describe("createNotionClient", () => {
  it("ページングして全件を返し、filter_properties を付ける", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(res(200, { results: [{ id: "a", properties: {} }], has_more: true, next_cursor: "c1" }))
      .mockResolvedValueOnce(res(200, { results: [{ id: "b", properties: {} }], has_more: false, next_cursor: null }));
    const { notion } = client(fetchFn);

    const pages = await notion.queryAll("db1", { filter: { x: 1 } }, ["p%1", "p2"]);

    expect(pages.map((p) => p.id)).toEqual(["a", "b"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.notion.com/v1/databases/db1/query?filter_properties=p%251&filter_properties=p2");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ filter: { x: 1 }, page_size: 100 });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret_test");
    expect((init.headers as Record<string, string>)["Notion-Version"]).toBe("2022-06-28");
    expect(JSON.parse(String(fetchFn.mock.calls[1][1].body))).toEqual({ filter: { x: 1 }, page_size: 100, start_cursor: "c1" });
  });

  it("429 は Retry-After 秒待って再試行、5xx は1秒待って再試行", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(res(429, {}, "3"))
      .mockResolvedValueOnce(res(502, {}))
      .mockResolvedValueOnce(res(200, { properties: { 名前: { id: "t" } } }));
    const { notion, sleep } = client(fetchFn);

    await expect(notion.getDatabase("db1")).resolves.toEqual({ properties: { 名前: { id: "t" } } });
    expect(sleep.mock.calls).toEqual([[3000], [1000]]);
  });

  it("headers のない応答でも1秒待って再試行する", async () => {
    const noHeaders: HttpResponse = { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(noHeaders).mockResolvedValueOnce(res(200, { id: "p" }));
    const { notion, sleep } = client(fetchFn);
    await notion.updatePage("p", {});
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("Retry-After がなければ1秒", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(res(429, {})).mockResolvedValueOnce(res(200, { id: "p" }));
    const { notion, sleep } = client(fetchFn);
    await notion.updatePage("p", {});
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("再試行を使い切るか 4xx なら NotionApiError", async () => {
    const tooMany = vi.fn<FetchFn>().mockResolvedValue(res(503, { message: "down" }));
    await expect(client(tooMany).notion.archivePage("p")).rejects.toThrow(NotionApiError);
    expect(tooMany).toHaveBeenCalledTimes(3);

    const bad = vi.fn<FetchFn>().mockResolvedValue(res(400, { message: "bad" }));
    await expect(client(bad).notion.createPage("db", {})).rejects.toMatchObject({ status: 400 });
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("ページ作成・更新・アーカイブ・ブロック操作の HTTP を組み立てる", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url, init) => {
      if (url.includes("/children") && init.method === "GET") {
        return res(200, url.includes("start_cursor")
          ? { results: [{ id: "b2", type: "code" }], has_more: false, next_cursor: null }
          : { results: [{ id: "b1", type: "paragraph" }], has_more: true, next_cursor: "k" });
      }
      return res(200, { id: "new", properties: {} });
    });
    const { notion } = client(fetchFn);

    await expect(notion.createPage("db", { a: 1 })).resolves.toEqual({ id: "new", properties: {} });
    await notion.updatePage("p", { b: 2 });
    await notion.archivePage("p");
    await expect(notion.listChildren("pg")).resolves.toEqual([{ id: "b1", type: "paragraph" }, { id: "b2", type: "code" }]);
    await notion.deleteBlock("b1");
    await notion.appendChildren("pg", [{ type: "code" }]);

    const calls = fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url} ${init.body ?? ""}`);
    expect(calls).toEqual([
      'POST https://api.notion.com/v1/pages {"parent":{"database_id":"db"},"properties":{"a":1}}',
      'PATCH https://api.notion.com/v1/pages/p {"properties":{"b":2}}',
      'PATCH https://api.notion.com/v1/pages/p {"archived":true}',
      "GET https://api.notion.com/v1/blocks/pg/children?page_size=100 ",
      "GET https://api.notion.com/v1/blocks/pg/children?page_size=100&start_cursor=k ",
      "DELETE https://api.notion.com/v1/blocks/b1 ",
      'PATCH https://api.notion.com/v1/blocks/pg/children {"children":[{"type":"code"}]}',
    ]);
  });

  it("応答の形が違えばエラー", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(res(200, { unexpected: true }));
    await expect(client(fetchFn).notion.queryAll("db")).rejects.toThrow(NotionApiError);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/notionProps.test.ts scripts/early-morning/notionClient.test.ts`
Expected: FAIL(モジュールが見つからない)

- [ ] **Step 3: 実装する**

`scripts/early-morning/notionProps.ts`:

```ts
/** Notion API のプロパティ値の組み立てと読み取り。 */
import { z } from "zod";

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

const RICH_TEXT_LIMIT = 2000;

export function chunkText(text: string, size = RICH_TEXT_LIMIT): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
  return chunks;
}

function richText(text: string) {
  return chunkText(text).map((content) => ({ type: "text", text: { content } }));
}

export const prop = {
  title: (text: string) => ({ title: richText(text) }),
  text: (text: string | null) => ({ rich_text: text ? richText(text) : [] }),
  number: (value: number | null) => ({ number: value }),
  date: (value: string | null) => ({ date: value ? { start: value } : null }),
  select: (name: string | null) => ({ select: name ? { name } : null }),
  multiSelect: (names: readonly string[]) => ({ multi_select: names.map((name) => ({ name })) }),
  checkbox: (value: boolean) => ({ checkbox: value }),
  relation: (ids: readonly string[]) => ({ relation: ids.map((id) => ({ id })) }),
};

const plainTextSchema = z.array(z.object({ plain_text: z.string() }));
const textPropSchema = z.union([
  z.object({ title: plainTextSchema }).transform((v) => v.title),
  z.object({ rich_text: plainTextSchema }).transform((v) => v.rich_text),
]);
const numberPropSchema = z.object({ number: z.number().nullable() });
const selectPropSchema = z.object({ select: z.object({ name: z.string() }).nullable() });
const multiSelectPropSchema = z.object({ multi_select: z.array(z.object({ name: z.string() })) });
const datePropSchema = z.object({ date: z.object({ start: z.string() }).nullable() });

export function readPlainText(page: NotionPage, name: string): string {
  const parsed = textPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.map((part) => part.plain_text).join("") : "";
}

export function readNumber(page: NotionPage, name: string): number | null {
  const parsed = numberPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.number : null;
}

export function readSelect(page: NotionPage, name: string): string | null {
  const parsed = selectPropSchema.safeParse(page.properties[name]);
  return parsed.success ? (parsed.data.select?.name ?? null) : null;
}

export function readMultiSelect(page: NotionPage, name: string): string[] {
  const parsed = multiSelectPropSchema.safeParse(page.properties[name]);
  return parsed.success ? parsed.data.multi_select.map((option) => option.name) : [];
}

export function readDate(page: NotionPage, name: string): string | null {
  const parsed = datePropSchema.safeParse(page.properties[name]);
  return parsed.success ? (parsed.data.date?.start ?? null) : null;
}
```

`scripts/early-morning/notionClient.ts`:

```ts
/** Notion REST API の薄いクライアント。429 は Retry-After、5xx は1秒待って再試行する。 */
import { z } from "zod";

import type { FetchFn } from "../growth/http";
import type { NotionPage } from "./notionProps";

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const DEFAULT_RETRY_MS = 1000;

export class NotionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionClient {
  getDatabase(id: string): Promise<{ properties: Record<string, { id: string }> }>;
  queryAll(databaseId: string, body?: Record<string, unknown>, filterPropertyIds?: readonly string[]): Promise<NotionPage[]>;
  createPage(databaseId: string, properties: Record<string, unknown>): Promise<NotionPage>;
  updatePage(pageId: string, properties: Record<string, unknown>): Promise<void>;
  archivePage(pageId: string): Promise<void>;
  listChildren(blockId: string): Promise<NotionBlock[]>;
  deleteBlock(blockId: string): Promise<void>;
  appendChildren(blockId: string, children: readonly unknown[]): Promise<void>;
}

const pageSchema = z.object({ id: z.string(), properties: z.record(z.string(), z.unknown()) });
const listSchema = <T extends z.ZodType>(item: T) =>
  z.object({ results: z.array(item), has_more: z.boolean(), next_cursor: z.string().nullable() });
const blockSchema = z.looseObject({ id: z.string(), type: z.string() });
const databaseSchema = z.object({ properties: z.record(z.string(), z.object({ id: z.string() })) });

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new NotionApiError(`${label} の応答の形が想定と違います`, 200);
  return result.data;
}

export function createNotionClient(options: {
  token: string;
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  maxRetries?: number;
}): NotionClient {
  const maxRetries = options.maxRetries ?? 3;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const res = await options.fetchFn(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new NotionApiError(`Notion API ${method} ${path} が失敗しました (HTTP ${res.status}): ${await res.text()}`, res.status);
      }
      const retryAfter = Number(res.headers?.get("retry-after"));
      await options.sleep(res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_MS);
    }
  }

  async function paginate<T>(fetchPage: (cursor: string | null) => Promise<{ results: T[]; has_more: boolean; next_cursor: string | null }>): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | null = null;
    do {
      const page = await fetchPage(cursor);
      all.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return all;
  }

  return {
    async getDatabase(id) {
      return parse(databaseSchema, await request("GET", `/databases/${id}`), "getDatabase");
    },
    async queryAll(databaseId, body = {}, filterPropertyIds = []) {
      const query = filterPropertyIds.map((id) => `filter_properties=${encodeURIComponent(id)}`).join("&");
      const path = `/databases/${databaseId}/query${query ? `?${query}` : ""}`;
      return paginate(async (cursor) =>
        parse(listSchema(pageSchema), await request("POST", path, { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }), "queryAll"),
      );
    },
    async createPage(databaseId, properties) {
      return parse(pageSchema, await request("POST", "/pages", { parent: { database_id: databaseId }, properties }), "createPage");
    },
    async updatePage(pageId, properties) {
      await request("PATCH", `/pages/${pageId}`, { properties });
    },
    async archivePage(pageId) {
      await request("PATCH", `/pages/${pageId}`, { archived: true });
    },
    async listChildren(blockId) {
      return paginate(async (cursor) =>
        parse(
          listSchema(blockSchema),
          await request("GET", `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`),
          "listChildren",
        ),
      );
    },
    async deleteBlock(blockId) {
      await request("DELETE", `/blocks/${blockId}`);
    },
    async appendChildren(blockId, children) {
      await request("PATCH", `/blocks/${blockId}/children`, { children });
    },
  };
}
```

注: `z.looseObject` は zod 4 の API(未知キーを残す)。`npx tsc --noEmit -p .` で型が通らない場合は `z.object({...}).passthrough()` に置き換える。

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/notionProps.test.ts scripts/early-morning/notionClient.test.ts --coverage --coverage.include='scripts/early-morning/notion{Props,Client}.ts' && npx tsc --noEmit -p .`
Expected: PASS、100%、型エラーなし

- [ ] **Step 5: コミット**

```bash
git add scripts/early-morning/notionProps.ts scripts/early-morning/notionProps.test.ts scripts/early-morning/notionClient.ts scripts/early-morning/notionClient.test.ts
git commit -m "feat: 早朝リピーター集計用の Notion クライアントを追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 名寄せと予約台帳の読み取り

**Files:**
- Create: `scripts/early-morning/identity.ts`, `scripts/early-morning/ledger.ts`
- Test: `scripts/early-morning/identity.test.ts`, `scripts/early-morning/ledger.test.ts`

**Interfaces:**
- Consumes: `NotionClient`(Task 5)、`readPlainText` / `readDate` / `readSelect` / `NotionPage`(Task 5)、`EARLY_START_TIME`、`LbReservation` / `NameLink`
- Produces(identity.ts): `normalizeName(name: string): string`、`tbKey(id: number): string`(`tb:123`)、`lbKey(name: string): string`(`lb:{正規化氏名}`)、`buildLinkMap(links: readonly NameLink[]): Map<string, number>`、`resolveLbKey(name: string, linkMap: ReadonlyMap<string, number>): string`、`recordKey(date: string, personKey: string): string`(`{date}_{personKey}`)、`personKeyOfRecordKey(key: string): string`
- Produces(ledger.ts): `LEDGER_COLUMNS`、`isEarlyTimeSlot(slot: string): boolean`、`toReservation(page: NotionPage): LbReservation | null`、`fetchEarlyReservations(client: NotionClient, ledgerDbId: string): Promise<LbReservation[]>`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/identity.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildLinkMap, lbKey, normalizeName, personKeyOfRecordKey, recordKey, resolveLbKey, tbKey } from "./identity";

describe("identity", () => {
  it("全角・半角の空白を除き NFKC で揃える", () => {
    expect(normalizeName("テスト　太郎")).toBe("テスト太郎");
    expect(normalizeName(" テスト 太郎 ")).toBe("テスト太郎");
    expect(normalizeName("ﾃｽﾄ")).toBe("テスト");
  });

  it("人キーと記録キーを作り、記録キーから人キーを戻す", () => {
    expect(tbKey(148195)).toBe("tb:148195");
    expect(lbKey("テスト　太郎")).toBe("lb:テスト太郎");
    const key = recordKey("2026-09-22", "lb:テスト太郎");
    expect(key).toBe("2026-09-22_lb:テスト太郎");
    expect(personKeyOfRecordKey(key)).toBe("lb:テスト太郎");
  });

  it("対応表にある LaBOLA 氏名はテニスベアの人キーに寄せる", () => {
    const linkMap = buildLinkMap([{ tbId: 7, lbName: "テスト　太郎" }]);
    expect(resolveLbKey("テスト太郎", linkMap)).toBe("tb:7");
    expect(resolveLbKey("テスト次郎", linkMap)).toBe("lb:テスト次郎");
  });
});
```

`scripts/early-morning/ledger.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { NotionClient } from "./notionClient";
import type { NotionPage } from "./notionProps";
import { LEDGER_COLUMNS, fetchEarlyReservations, isEarlyTimeSlot, toReservation } from "./ledger";

function ledgerPage(fields: { no?: string; name?: string; date?: string | null; slot?: string; status?: string; at?: string }): NotionPage {
  return {
    id: fields.no ?? "x",
    properties: {
      予約番号: { title: [{ plain_text: fields.no ?? "#1" }] },
      予約者: { rich_text: [{ plain_text: fields.name ?? "テスト太郎" }] },
      利用日: { date: fields.date === null ? null : { start: fields.date ?? "2026-09-22" } },
      時間帯: { rich_text: [{ plain_text: fields.slot ?? "06:00～08:00" }] },
      ステータス: { select: { name: fields.status ?? "有効" } },
      受付日時: { date: fields.at ? { start: fields.at } : null },
    },
  };
}

describe("isEarlyTimeSlot", () => {
  it.each(["06:00～08:00", "06:00-08:00", " 06:00〜08:00"])("%s は早朝", (slot) => {
    expect(isEarlyTimeSlot(slot)).toBe(true);
  });
  it("それ以外は早朝でない", () => {
    expect(isEarlyTimeSlot("19:00～20:00")).toBe(false);
  });
});

describe("toReservation", () => {
  it("必要な6列だけを読む", () => {
    expect(toReservation(ledgerPage({ no: "#871", status: "キャンセル", at: "2026-09-10T21:00:00.000+09:00" }))).toEqual({
      reservationNo: "#871",
      name: "テスト太郎",
      date: "2026-09-22",
      timeSlot: "06:00～08:00",
      isCancelled: true,
      receivedAt: "2026-09-10T21:00:00.000+09:00",
    });
  });

  it("利用日・氏名・時間帯が欠けていれば null", () => {
    expect(toReservation(ledgerPage({ date: null }))).toBeNull();
    expect(toReservation(ledgerPage({ name: "" }))).toBeNull();
    expect(toReservation(ledgerPage({ slot: "" }))).toBeNull();
  });
});

describe("fetchEarlyReservations", () => {
  it("6列の ID で絞ってイベント予約を取り、早朝だけ返す", async () => {
    const properties = Object.fromEntries(LEDGER_COLUMNS.map((name, i) => [name, { id: `id${i}` }]));
    const notion = {
      getDatabase: vi.fn(async () => ({ properties })),
      queryAll: vi.fn(async () => [ledgerPage({ no: "#1" }), ledgerPage({ no: "#2", slot: "19:00-20:00" }), ledgerPage({ date: null })]),
    } as unknown as NotionClient;

    const result = await fetchEarlyReservations(notion, "ledger");

    expect(result.map((r) => r.reservationNo)).toEqual(["#1"]);
    expect(notion.queryAll).toHaveBeenCalledWith(
      "ledger",
      { filter: { property: "予約種別", select: { equals: "イベント" } } },
      ["id0", "id1", "id2", "id3", "id4", "id5"],
    );
  });

  it("列が見つからなければエラー", async () => {
    const notion = { getDatabase: vi.fn(async () => ({ properties: {} })) } as unknown as NotionClient;
    await expect(fetchEarlyReservations(notion, "ledger")).rejects.toThrow("予約台帳に列「予約番号」がありません");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/identity.test.ts scripts/early-morning/ledger.test.ts`
Expected: FAIL(モジュールが見つからない)

- [ ] **Step 3: 実装する**

`scripts/early-morning/identity.ts`:

```ts
/** 人の識別子と名寄せ。テニスベアは不変の user.id、LaBOLA は正規化した氏名で識別する。 */
import type { NameLink } from "./types";

export function normalizeName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}

export function tbKey(id: number): string {
  return `tb:${id}`;
}

export function lbKey(name: string): string {
  return `lb:${normalizeName(name)}`;
}

/** 正規化氏名 → テニスベア ID。 */
export function buildLinkMap(links: readonly NameLink[]): Map<string, number> {
  return new Map(links.map((link) => [normalizeName(link.lbName), link.tbId]));
}

export function resolveLbKey(name: string, linkMap: ReadonlyMap<string, number>): string {
  const tbId = linkMap.get(normalizeName(name));
  return tbId === undefined ? lbKey(name) : tbKey(tbId);
}

const DATE_LENGTH = 10;

export function recordKey(date: string, personKey: string): string {
  return `${date}_${personKey}`;
}

export function personKeyOfRecordKey(key: string): string {
  return key.slice(DATE_LENGTH + 1);
}
```

`scripts/early-morning/ledger.ts`:

```ts
/** Notion「Labora 予約台帳」から早朝イベントの予約を読む。連絡先の列は取得しない。 */
import { EARLY_START_TIME } from "./config";
import type { NotionClient } from "./notionClient";
import { readDate, readPlainText, readSelect, type NotionPage } from "./notionProps";
import type { LbReservation } from "./types";

export const LEDGER_COLUMNS = ["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時"] as const;

export function isEarlyTimeSlot(slot: string): boolean {
  return slot.trim().slice(0, 5) === EARLY_START_TIME;
}

export function toReservation(page: NotionPage): LbReservation | null {
  const name = readPlainText(page, "予約者").trim();
  const date = readDate(page, "利用日");
  const timeSlot = readPlainText(page, "時間帯").trim();
  if (!name || !date || !timeSlot) return null;
  return {
    reservationNo: readPlainText(page, "予約番号"),
    name,
    date: date.slice(0, 10),
    timeSlot,
    isCancelled: readSelect(page, "ステータス") === "キャンセル",
    receivedAt: readDate(page, "受付日時"),
  };
}

export async function fetchEarlyReservations(client: NotionClient, ledgerDbId: string): Promise<LbReservation[]> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = LEDGER_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const pages = await client.queryAll(
    ledgerDbId,
    { filter: { property: "予約種別", select: { equals: "イベント" } } },
    propertyIds,
  );
  return pages
    .map(toReservation)
    .filter((reservation): reservation is LbReservation => reservation !== null && isEarlyTimeSlot(reservation.timeSlot));
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/identity.test.ts scripts/early-morning/ledger.test.ts --coverage --coverage.include='scripts/early-morning/{identity,ledger}.ts'`
Expected: PASS、100%

- [ ] **Step 5: 実データで件数だけ確かめる**

```bash
npx tsx -e '
import { readFileSync } from "node:fs"; import { parse } from "dotenv";
const env = parse(readFileSync(".env.local"));
import { defaultFetch } from "./scripts/growth/http";
import { createNotionClient } from "./scripts/early-morning/notionClient";
import { fetchEarlyReservations } from "./scripts/early-morning/ledger";
const client = createNotionClient({ token: env.NOTION_TOKEN, fetchFn: defaultFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
const r = await fetchEarlyReservations(client, "f93a73e9821e4a70b8ed72d3b413c203");
console.log(r.length, r.filter((x) => !x.isCancelled).length);'
```

(worktree に `.env.local` がなければ `ln -s /Users/tsutsumi.akihiro/dev/bigban/.env.local .env.local` を先に実行する。`.env.local` は `.gitignore` 済み)

Expected: 2026-09-29 時点で `16 13` 以上(予約が増えていれば増える)。

- [ ] **Step 6: コミットして PR1 を出す**

```bash
git add scripts/early-morning/identity.ts scripts/early-morning/identity.test.ts scripts/early-morning/ledger.ts scripts/early-morning/ledger.test.ts
git commit -m "feat: 早朝予約の名寄せと予約台帳の読み取りを追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run lint && npx tsc --noEmit -p . && npx vitest run --coverage
```

全体テストとカバレッジ 100% を確認してから push する。AI アカウントのトークンを明示指定する(`gh auth token --user ttmakhr1028ai-art` で取得)。PR タイトル `feat: 早朝リピーター集計の取得層を追加する`、ベース `develop`、本文に設計書へのリンクと PR 分割の説明(1/3)を書く。

---

### Task 7: 開催回・人・参加記録の組み立て

**Files:**
- Create: `scripts/early-morning/attendance.ts`
- Test: `scripts/early-morning/attendance.test.ts`

**Interfaces:**
- Consumes: `TbEventDetail` / `LbReservation` / `NameLink` / `Session` / `Person` / `AttendanceRecord` / `Route` / `RecordStatus`(Task 2)、`isoDatePart`、`tbKey` / `buildLinkMap` / `resolveLbKey` / `recordKey`(Task 6)
- Produces:
  - `interface AttendanceInput { events: readonly TbEventDetail[]; reservations: readonly LbReservation[]; links: readonly NameLink[]; absentKeys: ReadonlySet<string> }`
  - `interface AttendanceResult { sessions: Session[]; people: Person[]; records: AttendanceRecord[]; unmatchedReservations: number }`
  - `buildAttendance(input: AttendanceInput): AttendanceResult`(sessions は日付昇順、records は日付→人キー昇順)

規則: 中止でない回だけから記録を作る。ゲストは除外。同じ日×同じ人は1記録(申込が1件でもあれば「申込」)。経路は「申込」の出どころ(全件キャンセルなら全出どころ)。回次は日付順に「申込」かつ `absentKeys` にない記録だけ採番。開催回に対応しない LaBOLA 予約は `unmatchedReservations` に数える。表示名は日付の新しいテニスベアのニックネームを優先し、テニスベアに出てこない人は LaBOLA 氏名。対応表にあるテニスベアの人には `lbName` を入れる。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/attendance.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildAttendance } from "./attendance";
import type { LbReservation, TbEventDetail, TbParticipant } from "./types";

function tb(userId: number, name: string, status: TbParticipant["status"] = "APPROVE", isGuest = false): TbParticipant {
  return { userId, name, status, isGuest, appliedAt: `2026-09-01T0${userId % 10}:00:00.000+09:00` };
}

function event(id: number, date: string, participants: TbParticipant[], isCallOff = false): TbEventDetail {
  return { id, startAt: `${date}T06:00:00.000+09:00`, isCallOff, participants, ignoredStatusCount: 0 };
}

function lb(no: string, name: string, date: string, isCancelled = false): LbReservation {
  return { reservationNo: no, name, date, timeSlot: "06:00～08:00", isCancelled, receivedAt: "2026-09-02T10:00:00.000+09:00" };
}

describe("buildAttendance", () => {
  it("中止回・ゲストを除き、同日2イベントを1回にまとめる", () => {
    const result = buildAttendance({
      events: [
        event(1, "2026-08-25", [tb(11, "テスト太郎")], true),
        event(2, "2026-08-25", [tb(11, "テスト太郎"), tb(-1, "PBT CLUB会員枠1", "APPROVE", true)]),
        event(3, "2026-09-01", [tb(11, "新しい名前"), tb(12, "テスト次郎", "CANCEL")]),
      ],
      reservations: [],
      links: [],
      absentKeys: new Set(),
    });

    expect(result.sessions).toEqual([
      { date: "2026-08-25", tbEventIds: [1, 2], isCallOff: false },
      { date: "2026-09-01", tbEventIds: [3], isCallOff: false },
    ]);
    expect(result.people).toEqual([
      { key: "tb:11", displayName: "新しい名前", tbId: 11, lbName: null },
      { key: "tb:12", displayName: "テスト次郎", tbId: 12, lbName: null },
    ]);
    expect(result.records.map((r) => [r.key, r.status, r.ordinal, r.sources])).toEqual([
      ["2026-08-25_tb:11", "申込", 1, ["tb:2"]],
      ["2026-09-01_tb:11", "申込", 2, ["tb:3"]],
      ["2026-09-01_tb:12", "キャンセル", null, ["tb:3"]],
    ]);
  });

  it("全イベント中止の日は中止の開催回で、記録を作らない", () => {
    const result = buildAttendance({ events: [event(1, "2026-08-27", [tb(11, "テスト太郎")], true)], reservations: [], links: [], absentKeys: new Set() });
    expect(result.sessions).toEqual([{ date: "2026-08-27", tbEventIds: [1], isCallOff: true }]);
    expect(result.records).toEqual([]);
  });

  it("LaBOLA は氏名で数え、対応表があればテニスベアの人に寄せて経路を両方にする", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎")]), event(4, "2026-09-15", [])],
      reservations: [
        lb("#692", "テスト　太郎", "2026-09-08"),
        lb("#871", "テスト太郎", "2026-09-15"),
        lb("#853", "テスト花子", "2026-09-08"),
        lb("#686", "テスト花子", "2026-09-10", true),
      ],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(),
    });

    expect(result.unmatchedReservations).toBe(1);
    expect(result.people).toEqual([
      { key: "tb:11", displayName: "テスト太郎", tbId: 11, lbName: "テスト太郎" },
      { key: "lb:テスト花子", displayName: "テスト花子", tbId: null, lbName: "テスト花子" },
    ]);
    expect(result.records.map((r) => [r.key, r.route, r.ordinal, r.sources])).toEqual([
      ["2026-09-08_lb:テスト花子", "LaBOLA", 1, ["lb:#853"]],
      ["2026-09-08_tb:11", "両方", 1, ["lb:#692", "tb:3"]],
      ["2026-09-15_tb:11", "LaBOLA", 2, ["lb:#871"]],
    ]);
  });

  it("キャンセルと申込が混ざれば申込、欠席の記録は回次を飛ばす", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎", "CANCEL")]), event(4, "2026-09-15", [tb(11, "テスト太郎")]), event(5, "2026-09-22", [tb(11, "テスト太郎")])],
      reservations: [lb("#1", "テスト太郎", "2026-09-08")],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(["2026-09-15_tb:11"]),
    });

    expect(result.records.map((r) => [r.date, r.status, r.route, r.ordinal])).toEqual([
      ["2026-09-08", "申込", "LaBOLA", 1],
      ["2026-09-15", "申込", "テニスベア", null],
      ["2026-09-22", "申込", "テニスベア", 2],
    ]);
  });

  it("全出どころがキャンセルなら経路は全出どころ、申込日時は最も早いもの", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [tb(11, "テスト太郎", "CANCEL")])],
      reservations: [lb("#1", "テスト太郎", "2026-09-08", true)],
      links: [{ tbId: 11, lbName: "テスト太郎" }],
      absentKeys: new Set(),
    });
    expect(result.records).toEqual([
      {
        key: "2026-09-08_tb:11",
        date: "2026-09-08",
        personKey: "tb:11",
        route: "両方",
        appliedAt: "2026-09-01T01:00:00.000+09:00",
        status: "キャンセル",
        sources: ["lb:#1", "tb:3"],
        ordinal: null,
      },
    ]);
  });

  it("対応表の人がテニスベアに出てこなければ、LaBOLA 氏名でテニスベア ID 付きの人を作る", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [])],
      reservations: [lb("#1", "テスト花子", "2026-09-08")],
      links: [{ tbId: 99, lbName: "テスト花子" }],
      absentKeys: new Set(),
    });
    expect(result.people).toEqual([{ key: "tb:99", displayName: "テスト花子", tbId: 99, lbName: "テスト花子" }]);
    expect(result.records.map((r) => r.key)).toEqual(["2026-09-08_tb:99"]);
  });

  it("申込日時がどれも無ければ null", () => {
    const result = buildAttendance({
      events: [event(3, "2026-09-08", [{ ...tb(11, "テスト太郎"), appliedAt: null }])],
      reservations: [],
      links: [],
      absentKeys: new Set(),
    });
    expect(result.records[0].appliedAt).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/attendance.test.ts`
Expected: FAIL(`Cannot find module './attendance'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/attendance.ts`:

```ts
/** 両経路の申込を開催回・人・参加記録にまとめ、人ごとの回次を採番する。 */
import { isoDatePart } from "./dates";
import { buildLinkMap, normalizeName, recordKey, resolveLbKey, tbKey } from "./identity";
import type {
  AttendanceRecord,
  LbReservation,
  NameLink,
  Person,
  RecordStatus,
  Route,
  Session,
  TbEventDetail,
} from "./types";

export interface AttendanceInput {
  events: readonly TbEventDetail[];
  reservations: readonly LbReservation[];
  links: readonly NameLink[];
  absentKeys: ReadonlySet<string>;
}

export interface AttendanceResult {
  sessions: Session[];
  people: Person[];
  records: AttendanceRecord[];
  unmatchedReservations: number;
}

type Origin = "テニスベア" | "LaBOLA";

interface Entry {
  date: string;
  personKey: string;
  origin: Origin;
  status: RecordStatus;
  appliedAt: string | null;
  source: string;
}

function buildSessions(events: readonly TbEventDetail[]): Session[] {
  const byDate = new Map<string, TbEventDetail[]>();
  for (const event of events) {
    const date = isoDatePart(event.startAt);
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      tbEventIds: list.map((event) => event.id).sort((a, b) => a - b),
      isCallOff: list.every((event) => event.isCallOff),
    }));
}

function routeOf(origins: ReadonlySet<Origin>): Route {
  if (origins.size === 2) return "両方";
  return origins.has("LaBOLA") ? "LaBOLA" : "テニスベア";
}

function mergeEntries(entries: readonly Entry[]): AttendanceRecord {
  const { date, personKey } = entries[0];
  const applied = entries.filter((entry) => entry.status === "申込");
  const status: RecordStatus = applied.length > 0 ? "申込" : "キャンセル";
  const basis = applied.length > 0 ? applied : entries;
  const appliedTimes = entries.map((entry) => entry.appliedAt).filter((at): at is string => at !== null).sort();
  return {
    key: recordKey(date, personKey),
    date,
    personKey,
    route: routeOf(new Set(basis.map((entry) => entry.origin))),
    appliedAt: appliedTimes[0] ?? null,
    status,
    sources: [...new Set(entries.map((entry) => entry.source))].sort(),
    ordinal: null,
  };
}

function assignOrdinals(records: AttendanceRecord[], absentKeys: ReadonlySet<string>): AttendanceRecord[] {
  const counters = new Map<string, number>();
  return records.map((record) => {
    if (record.status !== "申込" || absentKeys.has(record.key)) return record;
    const ordinal = (counters.get(record.personKey) ?? 0) + 1;
    counters.set(record.personKey, ordinal);
    return { ...record, ordinal };
  });
}

export function buildAttendance(input: AttendanceInput): AttendanceResult {
  const sessions = buildSessions(input.events);
  const activeDates = new Set(sessions.filter((session) => !session.isCallOff).map((session) => session.date));
  const people = new Map<string, Person>();
  const entries: Entry[] = [];

  const sortedEvents = [...input.events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  for (const event of sortedEvents) {
    if (event.isCallOff) continue;
    const date = isoDatePart(event.startAt);
    for (const participant of event.participants) {
      if (participant.isGuest) continue;
      const key = tbKey(participant.userId);
      const existing = people.get(key);
      people.set(key, { key, displayName: participant.name, tbId: participant.userId, lbName: existing?.lbName ?? null });
      entries.push({
        date,
        personKey: key,
        origin: "テニスベア",
        status: participant.status === "APPROVE" ? "申込" : "キャンセル",
        appliedAt: participant.appliedAt,
        source: `tb:${event.id}`,
      });
    }
  }

  const linkMap = buildLinkMap(input.links);
  for (const link of input.links) {
    const person = people.get(tbKey(link.tbId));
    if (person) people.set(person.key, { ...person, lbName: link.lbName });
  }

  let unmatchedReservations = 0;
  for (const reservation of input.reservations) {
    if (!activeDates.has(reservation.date)) {
      unmatchedReservations += 1;
      continue;
    }
    const key = resolveLbKey(reservation.name, linkMap);
    if (!people.has(key)) {
      const linkedTbId = linkMap.get(normalizeName(reservation.name)) ?? null;
      people.set(key, { key, displayName: reservation.name, tbId: linkedTbId, lbName: reservation.name });
    }
    entries.push({
      date: reservation.date,
      personKey: key,
      origin: "LaBOLA",
      status: reservation.isCancelled ? "キャンセル" : "申込",
      appliedAt: reservation.receivedAt,
      source: `lb:${reservation.reservationNo}`,
    });
  }

  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = recordKey(entry.date, entry.personKey);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  const records = [...grouped.values()]
    .map(mergeEntries)
    .sort((a, b) => a.date.localeCompare(b.date) || a.personKey.localeCompare(b.personKey));

  return {
    sessions,
    people: [...people.values()],
    records: assignOrdinals(records, input.absentKeys),
    unmatchedReservations,
  };
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/attendance.test.ts --coverage --coverage.include=scripts/early-morning/attendance.ts`
Expected: PASS、100%。`people` の並び順がテストと違う場合は、挿入順(テニスベアを日付順→LaBOLA)になっているかを確認する。

- [ ] **Step 5: コミット**

```bash
git add scripts/early-morning/attendance.ts scripts/early-morning/attendance.test.ts
git commit -m "feat: 早朝の開催回と参加記録を組み立てて回次を採番する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 人ごとの集計と状態判定

**Files:**
- Create: `scripts/early-morning/metrics.ts`
- Test: `scripts/early-morning/metrics.test.ts`

**Interfaces:**
- Consumes: `Person` / `AttendanceRecord` / `Session` / `PersonStats` / `PersonState`(Task 2)、`RULES` / `MILESTONES` / `MILESTONE_STEP_AFTER_LAST`
- Produces:
  - `milestonesUpTo(total: number): number[]`
  - `nextMilestone(total: number): number`
  - `findNextSession(sessions: readonly Session[], today: string): Session | null`(`date > today` かつ中止でない最初の回)
  - `computeStats(input: { people: readonly Person[]; records: readonly AttendanceRecord[]; sessions: readonly Session[]; today: string }): PersonStats[]`(累計の降順→キーの昇順)

「開催済み」は `date <= today` かつ中止でない回。累計・直近・連続・ご無沙汰は開催済みの回と、`ordinal !== null` の記録だけで数える。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/metrics.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeStats, findNextSession, milestonesUpTo, nextMilestone } from "./metrics";
import type { AttendanceRecord, Person, Session } from "./types";

const DATES = [
  "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01",
  "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06",
];
const sessions: Session[] = DATES.map((date, i) => ({ date, tbEventIds: [i], isCallOff: date === "2026-09-01" }));

function person(key: string): Person {
  return { key, displayName: key, tbId: null, lbName: null };
}

function attended(personKey: string, dates: string[], status: AttendanceRecord["status"] = "申込"): AttendanceRecord[] {
  return dates.map((date, i) => ({
    key: `${date}_${personKey}`,
    date,
    personKey,
    route: "テニスベア",
    appliedAt: null,
    status,
    sources: [],
    ordinal: status === "申込" ? i + 1 : null,
  }));
}

describe("milestones", () => {
  it("5・10・20・30・50、以降50ごと", () => {
    expect(milestonesUpTo(4)).toEqual([]);
    expect(milestonesUpTo(30)).toEqual([5, 10, 20, 30]);
    expect(milestonesUpTo(160)).toEqual([5, 10, 20, 30, 50, 100, 150]);
    expect(nextMilestone(0)).toBe(5);
    expect(nextMilestone(9)).toBe(10);
    expect(nextMilestone(50)).toBe(100);
  });
});

describe("findNextSession", () => {
  it("今日より後で中止でない最初の回", () => {
    expect(findNextSession(sessions, "2026-09-29")?.date).toBe("2026-10-06");
    expect(findNextSession(sessions, "2026-08-30")?.date).toBe("2026-09-08");
    expect(findNextSession(sessions, "2026-10-06")).toBeNull();
  });
});

describe("computeStats", () => {
  const today = "2026-09-29";

  it("常連: 直近8開催で4回以上、連続は最新回から数える", () => {
    const records = attended("tb:1", ["2026-08-25", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"]);
    const [stats] = computeStats({ people: [person("tb:1")], records, sessions, today });
    expect(stats).toMatchObject({
      total: 5,
      recent: 5,
      streak: 5, // 9/1 は中止回なので開催回に含めず、8/25 まで連続
      firstDate: "2026-08-25",
      lastDate: "2026-09-29",
      state: "常連",
      nextMilestone: "あと5回で10回",
      reachedMilestones: [5],
      isNextApplied: true,
    });
  });

  it("ご無沙汰: 累計3回以上で最終参加後4開催連続不参加(中止回は数えない)", () => {
    const records = attended("tb:2", ["2026-08-04", "2026-08-11", "2026-08-18"]);
    const [stats] = computeStats({ people: [person("tb:2")], records, sessions, today });
    expect(stats).toMatchObject({ total: 3, streak: 0, state: "ご無沙汰", isNextApplied: false });
  });

  it("新顔: 累計1〜2回。キャンセルと欠席(ordinal null)は数えない", () => {
    const records = [
      ...attended("tb:3", ["2026-09-22"]),
      ...attended("tb:3", ["2026-09-29"], "キャンセル"),
      { ...attended("tb:3", ["2026-09-15"])[0], ordinal: null },
    ];
    const [stats] = computeStats({ people: [person("tb:3")], records, sessions, today });
    expect(stats).toMatchObject({ total: 1, state: "新顔", lastDate: "2026-09-22" });
  });

  it("通常: どれにも当たらない。未参加の人は累計0で新顔", () => {
    const records = attended("tb:4", ["2026-08-04", "2026-08-11", "2026-09-29"]);
    const stats = computeStats({ people: [person("tb:5"), person("tb:4")], records, sessions, today });
    expect(stats.map((s) => [s.key, s.total, s.state, s.firstDate])).toEqual([
      ["tb:4", 3, "通常", "2026-08-04"],
      ["tb:5", 0, "新顔", null],
    ]);
  });

  it("次回の開催回がなければ次回申込は false", () => {
    const records = attended("tb:6", ["2026-10-06"]);
    const [stats] = computeStats({ people: [person("tb:6")], records, sessions, today: "2026-10-06" });
    expect(stats.isNextApplied).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/metrics.test.ts`
Expected: FAIL(`Cannot find module './metrics'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/metrics.ts`:

```ts
/** 人ごとの累計・直近・連続・状態・節目を開催回単位で計算する。 */
import { MILESTONES, MILESTONE_STEP_AFTER_LAST, RULES } from "./config";
import type { AttendanceRecord, Person, PersonState, PersonStats, Session } from "./types";

const LAST_FIXED = MILESTONES[MILESTONES.length - 1];

function milestoneAt(index: number): number {
  return index < MILESTONES.length ? MILESTONES[index] : LAST_FIXED + (index - MILESTONES.length + 1) * MILESTONE_STEP_AFTER_LAST;
}

export function milestonesUpTo(total: number): number[] {
  const reached: number[] = [];
  for (let index = 0; milestoneAt(index) <= total; index += 1) reached.push(milestoneAt(index));
  return reached;
}

export function nextMilestone(total: number): number {
  return milestoneAt(milestonesUpTo(total).length);
}

export function findNextSession(sessions: readonly Session[], today: string): Session | null {
  return sessions.find((session) => !session.isCallOff && session.date > today) ?? null;
}

function stateOf(total: number, recent: number, missedSinceLast: number): PersonState {
  if (total >= RULES.dormantMinTotal && missedSinceLast >= RULES.dormantMisses) return "ご無沙汰";
  if (recent >= RULES.regularMinInWindow) return "常連";
  if (total <= RULES.newMaxTotal) return "新顔";
  return "通常";
}

export function computeStats(input: {
  people: readonly Person[];
  records: readonly AttendanceRecord[];
  sessions: readonly Session[];
  today: string;
}): PersonStats[] {
  const held = input.sessions
    .filter((session) => !session.isCallOff && session.date <= input.today)
    .map((session) => session.date);
  const recentDates = held.slice(-RULES.recentWindow);
  const next = findNextSession(input.sessions, input.today);

  const stats = input.people.map((person): PersonStats => {
    const mine = input.records.filter((record) => record.personKey === person.key);
    const attended = new Set(
      mine.filter((record) => record.ordinal !== null && record.date <= input.today).map((record) => record.date),
    );
    const dates = [...attended].sort();
    const total = dates.length;
    const lastDate = dates[total - 1] ?? null;
    let streak = 0;
    for (let index = held.length - 1; index >= 0 && attended.has(held[index]); index -= 1) streak += 1;
    const missedSinceLast = lastDate === null ? 0 : held.filter((date) => date > lastDate).length;
    const recent = recentDates.filter((date) => attended.has(date)).length;
    const upcoming = nextMilestone(total);
    return {
      ...person,
      total,
      recent,
      streak,
      firstDate: dates[0] ?? null,
      lastDate,
      state: stateOf(total, recent, missedSinceLast),
      nextMilestone: `あと${upcoming - total}回で${upcoming}回`,
      reachedMilestones: milestonesUpTo(total),
      isNextApplied: next !== null && mine.some((record) => record.date === next.date && record.status === "申込"),
    };
  });

  return stats.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/metrics.test.ts --coverage --coverage.include=scripts/early-morning/metrics.ts`
Expected: PASS、100%

- [ ] **Step 5: コミット**

```bash
git add scripts/early-morning/metrics.ts scripts/early-morning/metrics.test.ts
git commit -m "feat: 早朝参加者の累計と状態と節目を計算する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: LINE Flex メッセージの組み立て

**Files:**
- Create: `scripts/early-morning/lineMessage.ts`
- Test: `scripts/early-morning/lineMessage.test.ts`

**Interfaces:**
- Consumes: `Session` / `AttendanceRecord` / `Person`(Task 2)、`formatMonthDayWeekday` / `formatMonthDayTime` / `formatStartTime`(Task 2)
- Produces:
  - `interface LineEntry { displayName: string; ordinal: number; isLaBola: boolean }`
  - `interface FlexMessage { type: "flex"; altText: string; contents: Record<string, unknown> }`
  - `selectLineEntries(session: Session, records: readonly AttendanceRecord[], people: ReadonlyMap<string, Person>): LineEntry[]`
  - `buildFlexMessage(input: { sessionDate: string; startTime: string; entries: readonly LineEntry[]; updatedAt: string; notionUrl: string }): FlexMessage`

並び順: 回数の多い順、同数は表示名順、初参加(1回目)は最後。LaBOLA 印は経路が LaBOLA か両方の人。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/lineMessage.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildFlexMessage, selectLineEntries } from "./lineMessage";
import type { AttendanceRecord, Person } from "./types";

function record(personKey: string, ordinal: number | null, route: AttendanceRecord["route"] = "テニスベア", status: AttendanceRecord["status"] = "申込", date = "2026-10-06"): AttendanceRecord {
  return { key: `${date}_${personKey}`, date, personKey, route, appliedAt: null, status, sources: [], ordinal };
}

const people = new Map<string, Person>(
  ["A", "B", "C", "D", "E", "F"].map((k) => [k, { key: k, displayName: `テスト${k}`, tbId: null, lbName: null }]),
);

describe("selectLineEntries", () => {
  it("次回の申込だけを回数の多い順に並べ、初参加は最後", () => {
    const entries = selectLineEntries(
      { date: "2026-10-06", tbEventIds: [1], isCallOff: false },
      [
        record("A", 3),
        record("B", 1),
        record("C", 15, "LaBOLA"),
        record("D", 3, "両方"),
        record("E", null, "テニスベア", "キャンセル"),
        record("F", 8, "テニスベア", "申込", "2026-09-29"),
        record("Z", 2),
      ],
      people,
    );
    expect(entries).toEqual([
      { displayName: "テストC", ordinal: 15, isLaBola: true },
      { displayName: "テストA", ordinal: 3, isLaBola: false },
      { displayName: "テストD", ordinal: 3, isLaBola: true },
      { displayName: "Z", ordinal: 2, isLaBola: false }, // 人が見つからなければ人キーを表示
      { displayName: "テストB", ordinal: 1, isLaBola: false },
    ]);
  });
});

describe("buildFlexMessage", () => {
  const base = { sessionDate: "2026-10-06", startTime: "06:00", updatedAt: "2026-10-05T20:31:00+09:00", notionUrl: "https://www.notion.so/abc" };

  it("見出し・人数・各行・フッターを作る", () => {
    const message = buildFlexMessage({
      ...base,
      entries: [
        { displayName: "テストC", ordinal: 15, isLaBola: true },
        { displayName: "テストB", ordinal: 1, isLaBola: false },
      ],
    });
    expect(message.type).toBe("flex");
    expect(message.altText).toBe("明日の早朝ピックル 10/6(火) 申込2名");
    const text = JSON.stringify(message.contents);
    expect(text).toContain("明日の早朝ピックル");
    expect(text).toContain("10/6(火) 6:00");
    expect(text).toContain("申込 2名");
    expect(text).toContain("テストC（LaBOLA）");
    expect(text).toContain("15回目");
    expect(text).toContain("初参加 🔰");
    expect(text).toContain("https://www.notion.so/abc?openExternalBrowser=1");
    expect(text).toContain("最終更新 10/5 20:31");
    expect(text).toContain("LaBOLA予約は本日朝8時時点までを反映");
    expect(text).not.toContain("🎁");
  });

  it("申込がなければその旨を1行出す", () => {
    const text = JSON.stringify(buildFlexMessage({ ...base, entries: [] }).contents);
    expect(text).toContain("申込 0名");
    expect(text).toContain("まだ申込はありません");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/lineMessage.test.ts`
Expected: FAIL(`Cannot find module './lineMessage'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/lineMessage.ts`:

```ts
/** 前夜 LINE 通知の Flex メッセージ。参加者一覧と各人の何回目かだけを載せる。 */
import { formatMonthDayTime, formatMonthDayWeekday, formatStartTime } from "./dates";
import type { AttendanceRecord, Person, Session } from "./types";

export interface LineEntry {
  displayName: string;
  ordinal: number;
  isLaBola: boolean;
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

const HEADER_COLOR = "#11317B";
const MUTED = "#8A8A8A";

export function selectLineEntries(
  session: Session,
  records: readonly AttendanceRecord[],
  people: ReadonlyMap<string, Person>,
): LineEntry[] {
  const entries = records
    .filter((record) => record.date === session.date && record.status === "申込" && record.ordinal !== null)
    .map((record) => ({
      displayName: people.get(record.personKey)?.displayName ?? record.personKey,
      ordinal: record.ordinal as number,
      isLaBola: record.route !== "テニスベア",
    }));
  return entries.sort((a, b) => {
    const aFirst = a.ordinal === 1 ? 1 : 0;
    const bFirst = b.ordinal === 1 ? 1 : 0;
    return aFirst - bFirst || b.ordinal - a.ordinal || a.displayName.localeCompare(b.displayName, "ja");
  });
}

function entryRow(entry: LineEntry) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: `${entry.displayName}${entry.isLaBola ? "（LaBOLA）" : ""}`, size: "sm", flex: 4, wrap: true },
      { type: "text", text: entry.ordinal === 1 ? "初参加 🔰" : `${entry.ordinal}回目`, size: "sm", flex: 2, align: "end" },
    ],
  };
}

export function buildFlexMessage(input: {
  sessionDate: string;
  startTime: string;
  entries: readonly LineEntry[];
  updatedAt: string;
  notionUrl: string;
}): FlexMessage {
  const day = formatMonthDayWeekday(input.sessionDate);
  const count = input.entries.length;
  const rows =
    count > 0
      ? input.entries.map(entryRow)
      : [{ type: "text", text: "まだ申込はありません", size: "sm", color: MUTED }];
  return {
    type: "flex",
    altText: `明日の早朝ピックル ${day} 申込${count}名`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: HEADER_COLOR,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "明日の早朝ピックル", color: "#FFFFFF", size: "sm" },
          { type: "text", text: `${day} ${formatStartTime(input.startTime)}`, color: "#FFFFFF", weight: "bold", size: "lg", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `申込 ${count}名`, weight: "bold", size: "md" },
          { type: "separator", margin: "md" },
          ...rows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#333333",
            height: "sm",
            action: { type: "uri", label: "Notionで一覧を開く", uri: `${input.notionUrl}?openExternalBrowser=1` },
          },
          { type: "text", text: `最終更新 ${formatMonthDayTime(input.updatedAt)}`, size: "xxs", color: MUTED, align: "center" },
          { type: "text", text: "LaBOLA予約は本日朝8時時点までを反映", size: "xxs", color: MUTED, align: "center", wrap: true },
        ],
      },
    },
  };
}
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/lineMessage.test.ts --coverage --coverage.include=scripts/early-morning/lineMessage.ts`
Expected: PASS、100%

- [ ] **Step 5: コミットして PR2 を出す**

```bash
git add scripts/early-morning/lineMessage.ts scripts/early-morning/lineMessage.test.ts
git commit -m "feat: 早朝の前夜通知の Flex メッセージを組み立てる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run lint && npx tsc --noEmit -p . && npx vitest run --coverage
```

PR タイトル `feat: 早朝リピーター集計の集計と通知文面を追加する`(2/3)。

---

### Task 10: Notion への差分書き込みと統合

**Files:**
- Create: `scripts/early-morning/notionSync.ts`
- Test: `scripts/early-morning/notionSync.test.ts`

**Interfaces:**
- Consumes: `NotionClient`(Task 5)、`prop` / `chunkText` / `read*` / `NotionPage`(Task 5)、`normalizeName` / `tbKey` / `recordKey` / `personKeyOfRecordKey`(Task 6)、`PersonStats` / `AttendanceRecord` / `Session` / `NameLink`(Task 2)、`FlexMessage`(Task 9)
- Produces:
  - `interface NotionIdsLike { peopleDb: string; recordsDb: string; sessionsDb: string; bridgePage: string }`
  - `interface PeopleRow { pageId: string; key: string; tbId: number | null; lbName: string | null; rewarded: string[]; memo: string; hash: string }`
  - `interface RecordRow { pageId: string; key: string; date: string; personKey: string; status: string | null; isAbsent: boolean; hash: string }`
  - `interface SessionRow { pageId: string; date: string; hash: string }`
  - `interface NotionState { people: PeopleRow[]; records: RecordRow[]; sessions: SessionRow[] }`
  - `interface WriteCounts { created: number; updated: number; archived: number }`
  - `interface BridgePayload { nextDate: string | null; updatedAt: string; status: "ok" | "failed"; failure: string | null; flex: FlexMessage | null }`
  - `hashOf(value: unknown): string`
  - `readNotionState(client: NotionClient, ids: NotionIdsLike): Promise<NotionState>`
  - `deriveLinks(people: readonly PeopleRow[]): NameLink[]`
  - `deriveAbsentKeys(records: readonly RecordRow[], links: readonly NameLink[]): Set<string>`
  - `syncSessions(client, ids, sessions: readonly Session[], records: readonly AttendanceRecord[], existing: readonly SessionRow[]): Promise<WriteCounts>`
  - `syncPeople(client, ids, stats: readonly PersonStats[], existing: readonly PeopleRow[], links: readonly NameLink[]): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }>`
  - `syncRecords(client, ids, records: readonly AttendanceRecord[], pageIdByKey: ReadonlyMap<string, string>, existing: readonly RecordRow[], links: readonly NameLink[], absentKeys: ReadonlySet<string>): Promise<WriteCounts>`
  - `readBridge(client, pageId: string): Promise<BridgePayload | null>`
  - `writeBridge(client, pageId: string, payload: BridgePayload): Promise<void>`
  - `markBridgeFailed(client, pageId: string, failure: string, now: string): Promise<void>`

規則:
- 各行の書き込み値から `hashOf` を計算し `同期ハッシュ` に入れる。既存行のハッシュが同じなら書かない
- ① のスタッフ列(リワード済み・メモ)は通常書かない。`未渡し節目` = 到達節目 − リワード済み
- 統合: `lb:{氏名}` の既存行の正規化氏名が対応表にあれば、その行を統合元とする。統合先(`tb:{id}`)のリワード済みに統合元の値を足し(和集合)、統合先のメモが空なら統合元のメモを入れ、統合元をアーカイブする
- ② で計算結果にない既存行: 人キーが統合元の `lb:` キーならアーカイブ、それ以外は `状態` を「元データになし」に更新(既にそうなら何もしない)
- ② の `出欠` は原則書かない。例外は `absentKeys` に入っている記録だけで、そのときは `出欠: 欠席` を書く(統合で作り直した行に欠席を引き継ぐため。空欄にする書き込みはしない)
- 同じキーの既存行が2つ以上あれば(手動実行と定期実行の重なり)、最初の1つを残して残りをアーカイブする(①②③共通)
- ④ の本文は JSON のコードブロック1つ。書き込みは既存ブロックを全削除してから追加

- [ ] **Step 1: 失敗するテストを書く**

テスト用のメモリ上の Notion(`FakeNotion`)を作り、呼び出しを記録しながら DB 内容を保持する。

`scripts/early-morning/notionSync.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionBlock, NotionClient } from "./notionClient";
import { readPlainText, type NotionPage } from "./notionProps";
import {
  deriveAbsentKeys,
  deriveLinks,
  hashOf,
  markBridgeFailed,
  readBridge,
  readNotionState,
  syncPeople,
  syncRecords,
  syncSessions,
  writeBridge,
  type BridgePayload,
  type PeopleRow,
  type RecordRow,
} from "./notionSync";
import type { AttendanceRecord, PersonStats } from "./types";

const ids = { peopleDb: "people", recordsDb: "records", sessionsDb: "sessions", bridgePage: "bridge" };

/** 実際の Notion API は読み取り時に plain_text を返すので、偽物でも書いた値に plain_text を補う。 */
function addPlainText(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = (value as { text?: { content?: unknown } }).text;
    if (typeof text?.content === "string") return { ...value, plain_text: text.content };
  }
  return value;
}

function withPlainText(properties: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties, addPlainText)) as Record<string, unknown>;
}

class FakeNotion implements NotionClient {
  pages = new Map<string, { db: string; properties: Record<string, unknown>; archived: boolean }>();
  blocks: NotionBlock[] = [];
  log: string[] = [];
  private seq = 0;

  seed(db: string, properties: Record<string, unknown>): string {
    const id = `seed${++this.seq}`;
    this.pages.set(id, { db, properties, archived: false });
    return id;
  }
  async getDatabase() {
    return { properties: {} };
  }
  async queryAll(databaseId: string): Promise<NotionPage[]> {
    return [...this.pages.entries()]
      .filter(([, p]) => p.db === databaseId && !p.archived)
      .map(([id, p]) => ({ id, properties: p.properties }));
  }
  async createPage(databaseId: string, properties: Record<string, unknown>) {
    const id = `new${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties), archived: false });
    this.log.push(`create ${databaseId}`);
    return { id, properties };
  }
  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId)!;
    page.properties = { ...page.properties, ...withPlainText(properties) };
    this.log.push(`update ${pageId} ${Object.keys(properties).sort().join(",")}`);
  }
  async archivePage(pageId: string) {
    this.pages.get(pageId)!.archived = true;
    this.log.push(`archive ${pageId}`);
  }
  async listChildren() {
    return this.blocks;
  }
  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
    this.log.push(`delete ${blockId}`);
  }
  async appendChildren(_blockId: string, children: readonly unknown[]) {
    this.blocks = [...this.blocks, ...children.map((c, i) => ({ id: `blk${i}`, ...(c as Record<string, unknown>), type: "code" }))];
    this.log.push("append");
  }
}

const text = (v: string) => ({ rich_text: [{ plain_text: v }] });
const title = (v: string) => ({ title: [{ plain_text: v }] });

function stats(key: string, overrides: Partial<PersonStats> = {}): PersonStats {
  return {
    key,
    displayName: `名前${key}`,
    tbId: key.startsWith("tb:") ? Number(key.slice(3)) : null,
    lbName: null,
    total: 5,
    recent: 4,
    streak: 2,
    firstDate: "2026-08-04",
    lastDate: "2026-09-29",
    state: "常連",
    nextMilestone: "あと5回で10回",
    reachedMilestones: [5],
    isNextApplied: true,
    ...overrides,
  };
}

function rec(date: string, personKey: string, ordinal: number | null = 1): AttendanceRecord {
  return { key: `${date}_${personKey}`, date, personKey, route: "テニスベア", appliedAt: null, status: "申込", sources: ["tb:1"], ordinal };
}

describe("readNotionState / deriveLinks / deriveAbsentKeys", () => {
  it("3つの DB を読み、対応表と欠席キーを作る", async () => {
    const notion = new FakeNotion();
    notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト　太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("m"), 同期ハッシュ: text("h1"),
    });
    notion.seed("people", { 識別子: text("tb:8"), テニスベアID: { number: 8 }, LaBOLA氏名: text(""), 同期ハッシュ: text("") });
    notion.seed("records", { キー: title("2026-09-15_lb:テスト太郎"), 出欠: { select: { name: "欠席" } }, 状態: { select: { name: "申込" } }, 同期ハッシュ: text("r") });
    notion.seed("records", { キー: title("2026-09-22_tb:8"), 出欠: { select: null }, 状態: { select: null }, 同期ハッシュ: text("") });
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("s") });

    const state = await readNotionState(notion, ids);
    expect(state.people.map((p) => [p.key, p.tbId, p.lbName, p.rewarded, p.memo])).toEqual([
      ["tb:7", 7, "テスト　太郎", ["5"], "m"],
      ["tb:8", 8, null, [], ""],
    ]);
    expect(state.records.map((r) => [r.date, r.personKey, r.isAbsent, r.status])).toEqual([
      ["2026-09-15", "lb:テスト太郎", true, "申込"],
      ["2026-09-22", "tb:8", false, null],
    ]);
    expect(state.sessions).toEqual([{ pageId: expect.any(String), date: "2026-09-22", hash: "s" }]);

    const links = deriveLinks(state.people);
    expect(links).toEqual([{ tbId: 7, lbName: "テスト　太郎" }]);
    expect([...deriveAbsentKeys(state.records, links)]).toEqual(["2026-09-15_tb:7"]);
  });
});

describe("syncSessions", () => {
  it("同じ開催日の行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("") });
    notion.seed("sessions", { 開催日: title("2026-09-22"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const counts = await syncSessions(notion, ids, [{ date: "2026-09-22", tbEventIds: [1], isCallOff: false }], [], state.sessions);
    expect(counts).toEqual({ created: 0, updated: 1, archived: 1 });
  });

  it("新しい回は作成、変化した回だけ更新", async () => {
    const notion = new FakeNotion();
    const sessionsInput = [
      { date: "2026-09-22", tbEventIds: [1, 2], isCallOff: false },
      { date: "2026-09-29", tbEventIds: [3], isCallOff: false },
    ];
    const counts1 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1")], []);
    expect(counts1).toEqual({ created: 2, updated: 0, archived: 0 });

    const state = await readNotionState(notion, ids);
    const counts2 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1")], state.sessions);
    expect(counts2).toEqual({ created: 0, updated: 0, archived: 0 });

    const counts3 = await syncSessions(notion, ids, sessionsInput, [rec("2026-09-22", "tb:1"), rec("2026-09-22", "tb:2")], state.sessions);
    expect(counts3).toEqual({ created: 0, updated: 1, archived: 0 });
  });
});

describe("syncPeople", () => {
  it("作成・差分更新・未渡し節目・スタッフ列の保持", async () => {
    const notion = new FakeNotion();
    const existingId = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text(""),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text("スタッフのメモ"), 同期ハッシュ: text("old"),
    });
    const state = await readNotionState(notion, ids);

    const result = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] }), stats("tb:9")], state.people, []);

    expect(result.counts).toEqual({ created: 1, updated: 1, archived: 0 });
    expect(result.pageIdByKey.get("tb:7")).toBe(existingId);
    const updated = notion.pages.get(existingId)!.properties;
    expect(updated.未渡し節目).toEqual({ multi_select: [{ name: "10" }] });
    expect(updated.メモ).toEqual(text("スタッフのメモ"));
    expect(notion.log.find((l) => l.startsWith("update"))).not.toContain("リワード済み");

    const again = await readNotionState(notion, ids);
    const second = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] }), stats("tb:9")], again.people, []);
    expect(second.counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("LaBOLA単独行を対応表の人に統合し、リワード済みは和集合・メモは空欄補完", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", {
      識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "5" }] }, メモ: text(""), 同期ハッシュ: text(""),
    });
    const source = notion.seed("people", {
      識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"),
      リワード済み: { multi_select: [{ name: "10" }] }, メモ: text("LaBOLA側のメモ"), 同期ハッシュ: text(""),
    });
    const state = await readNotionState(notion, ids);
    const links = deriveLinks(state.people);

    const result = await syncPeople(notion, ids, [stats("tb:7", { reachedMilestones: [5, 10] })], state.people, links);

    expect(result.counts.archived).toBe(1);
    expect(notion.pages.get(source)!.archived).toBe(true);
    const merged = notion.pages.get(target)!.properties;
    expect(merged.リワード済み).toEqual({ multi_select: [{ name: "10" }, { name: "5" }] });
    expect(readPlainText({ id: target, properties: merged }, "メモ")).toBe("LaBOLA側のメモ");
    expect(merged.未渡し節目).toEqual({ multi_select: [] });
  });

  it("統合先にメモがあれば残し、両方空ならメモは空", async () => {
    for (const [targetMemo, sourceMemo, expected] of [["A", "B", "A"], ["", "", ""]] as const) {
      const notion = new FakeNotion();
      const target = notion.seed("people", {
        識別子: text("tb:7"), テニスベアID: { number: 7 }, LaBOLA氏名: text("テスト太郎"), メモ: text(targetMemo), 同期ハッシュ: text(""),
      });
      notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), メモ: text(sourceMemo), 同期ハッシュ: text("") });
      const state = await readNotionState(notion, ids);
      await syncPeople(notion, ids, [stats("tb:7")], state.people, deriveLinks(state.people));
      expect(readPlainText({ id: target, properties: notion.pages.get(target)!.properties }, "メモ")).toBe(expected);
    }
  });

  it("同じ識別子の行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("tb:7"), テニスベアID: { number: 7 }, 同期ハッシュ: text("") });
    const dup = notion.seed("people", { 識別子: text("tb:7"), テニスベアID: { number: 7 }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [stats("tb:7")], state.people, []);
    expect(result.counts.archived).toBe(1);
    expect(notion.pages.get(dup)!.archived).toBe(true);
  });

  it("統合先の行がまだなければ統合しない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:テスト太郎"), LaBOLA氏名: text("テスト太郎"), 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const result = await syncPeople(notion, ids, [], state.people, [{ tbId: 99, lbName: "テスト太郎" }]);
    expect(result.counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });
});

describe("syncRecords", () => {
  it("作成・差分更新・統合元はアーカイブ・消えた記録は元データになし", async () => {
    const notion = new FakeNotion();
    const mergedAway = notion.seed("records", { キー: title("2026-09-08_lb:テスト太郎"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const vanished = notion.seed("records", { キー: title("2026-09-01_tb:5"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const alreadyGone = notion.seed("records", { キー: title("2026-08-25_tb:5"), 状態: { select: { name: "元データになし" } }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);

    const counts = await syncRecords(
      notion,
      ids,
      [rec("2026-09-08", "tb:7"), rec("2026-09-15", "tb:7", 2)],
      new Map([["tb:7", "pagePerson7"]]),
      state.records,
      [{ tbId: 7, lbName: "テスト太郎" }],
      new Set(),
    );

    expect(counts).toEqual({ created: 2, updated: 1, archived: 1 });
    expect(notion.pages.get(mergedAway)!.archived).toBe(true);
    expect(notion.pages.get(vanished)!.properties.状態).toEqual({ select: { name: "元データになし" } });
    expect(notion.log.some((l) => l.startsWith(`update ${alreadyGone}`))).toBe(false);
    const created = [...notion.pages.values()].find((p) => JSON.stringify(p.properties.キー).includes("2026-09-15_tb:7"))!;
    expect(created.properties.人).toEqual({ relation: [{ id: "pagePerson7" }] });
    expect(created.properties.回次).toEqual({ number: 2 });
    expect(created.properties).not.toHaveProperty("出欠");
  });

  it("人のページが見つからなければエラー", async () => {
    const notion = new FakeNotion();
    await expect(syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map(), [], [], new Set())).rejects.toThrow("tb:7");
  });

  it("変化のない記録は書かない", async () => {
    const notion = new FakeNotion();
    await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), [], [], new Set());
    const state = await readNotionState(notion, ids);
    const counts = await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), state.records, [], new Set());
    expect(counts).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("欠席の記録には出欠を書き写す(統合で作り直した行でも欠席が消えない)", async () => {
    const notion = new FakeNotion();
    await syncRecords(notion, ids, [rec("2026-09-15", "tb:7", null)], new Map([["tb:7", "p"]]), [], [], new Set(["2026-09-15_tb:7"]));
    const created = [...notion.pages.values()][0];
    expect(created.properties.出欠).toEqual({ select: { name: "欠席" } });
  });

  it("同じキーの行が重複していれば1つを残してアーカイブする", async () => {
    const notion = new FakeNotion();
    const first = notion.seed("records", { キー: title("2026-09-08_tb:7"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const second = notion.seed("records", { キー: title("2026-09-08_tb:7"), 状態: { select: { name: "申込" } }, 同期ハッシュ: text("") });
    const state = await readNotionState(notion, ids);
    const counts = await syncRecords(notion, ids, [rec("2026-09-08", "tb:7")], new Map([["tb:7", "p"]]), state.records, [], new Set());
    expect(counts.archived).toBe(1);
    expect(notion.pages.get(first)!.archived).toBe(false);
    expect(notion.pages.get(second)!.archived).toBe(true);
  });
});

describe("bridge", () => {
  const payload: BridgePayload = {
    nextDate: "2026-10-06",
    updatedAt: "2026-10-05T20:31:00+09:00",
    status: "ok",
    failure: null,
    flex: { type: "flex", altText: "a", contents: { type: "bubble", note: "x".repeat(2500) } },
  };

  it("既存ブロックを消して JSON コードブロック1つを書き、読み戻せる", async () => {
    const notion = new FakeNotion();
    notion.blocks = [{ id: "old", type: "paragraph" }];
    await writeBridge(notion, "bridge", payload);
    expect(notion.log).toEqual(["delete old", "append"]);
    expect(notion.blocks).toHaveLength(1);
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    expect(code.code.rich_text.length).toBeGreaterThan(1);
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: code.code.rich_text.map((t) => ({ plain_text: t.text.content })) } }];
    await expect(readBridge(notion, "bridge")).resolves.toEqual(payload);
  });

  it("コードブロックがない・JSON が壊れていれば null", async () => {
    const notion = new FakeNotion();
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: "{broken" }] } }];
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: '{"foo":1}' }] } }];
    await expect(readBridge(notion, "bridge")).resolves.toBeNull();
  });

  it("失敗時は状態と理由だけを書き換え、前回の内容を残す", async () => {
    const notion = new FakeNotion();
    notion.blocks = [{ id: "b", type: "code", code: { rich_text: [{ plain_text: JSON.stringify(payload) }] } }];
    await markBridgeFailed(notion, "bridge", "テニスベア: HTTP 503", "2026-10-06T20:30:00+09:00");
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    const written = JSON.parse(code.code.rich_text.map((t) => t.text.content).join(""));
    expect(written).toEqual({ ...payload, status: "failed", failure: "テニスベア: HTTP 503" });
  });

  it("前回の内容がなければ空の内容で失敗を書く", async () => {
    const notion = new FakeNotion();
    await markBridgeFailed(notion, "bridge", "予約台帳: x", "2026-10-06T20:30:00+09:00");
    const code = notion.blocks[0] as unknown as { code: { rich_text: Array<{ text: { content: string } }> } };
    expect(JSON.parse(code.code.rich_text.map((t) => t.text.content).join(""))).toEqual({
      nextDate: null, updatedAt: "2026-10-06T20:30:00+09:00", status: "failed", failure: "予約台帳: x", flex: null,
    });
  });
});

describe("hashOf", () => {
  it("同じ値は同じ、違う値は違う16桁", () => {
    expect(hashOf({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(hashOf({ a: 1 })).toBe(hashOf({ a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });
});

describe("型の確認", () => {
  it("PeopleRow と RecordRow は export されている", () => {
    const p: PeopleRow = { pageId: "", key: "", tbId: null, lbName: null, rewarded: [], memo: "", hash: "" };
    const r: RecordRow = { pageId: "", key: "", date: "", personKey: "", status: null, isAbsent: false, hash: "" };
    expect([p.key, r.key]).toEqual(["", ""]);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/notionSync.test.ts`
Expected: FAIL(`Cannot find module './notionSync'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/notionSync.ts`:

```ts
/**
 * Notion の早朝4オブジェクトの読み取りと差分書き込み。
 * スタッフ入力列(リワード済み・メモ・出欠)は、統合時の和集合・空欄補完と欠席の書き写しを除いて書かない。
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeName, personKeyOfRecordKey, recordKey, tbKey } from "./identity";
import type { FlexMessage } from "./lineMessage";
import type { NotionClient } from "./notionClient";
import { chunkText, prop, readMultiSelect, readNumber, readPlainText, readSelect } from "./notionProps";
import type { AttendanceRecord, NameLink, PersonStats, Session } from "./types";

export interface NotionIdsLike {
  peopleDb: string;
  recordsDb: string;
  sessionsDb: string;
  bridgePage: string;
}

export interface PeopleRow {
  pageId: string;
  key: string;
  tbId: number | null;
  lbName: string | null;
  rewarded: string[];
  memo: string;
  hash: string;
}

export interface RecordRow {
  pageId: string;
  key: string;
  date: string;
  personKey: string;
  status: string | null;
  isAbsent: boolean;
  hash: string;
}

export interface SessionRow {
  pageId: string;
  date: string;
  hash: string;
}

export interface NotionState {
  people: PeopleRow[];
  records: RecordRow[];
  sessions: SessionRow[];
}

export interface WriteCounts {
  created: number;
  updated: number;
  archived: number;
}

export interface BridgePayload {
  nextDate: string | null;
  updatedAt: string;
  status: "ok" | "failed";
  failure: string | null;
  flex: FlexMessage | null;
}

const HASH = "同期ハッシュ";
const VANISHED = "元データになし";

export function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function emptyCounts(): WriteCounts {
  return { created: 0, updated: 0, archived: 0 };
}

export async function readNotionState(client: NotionClient, ids: NotionIdsLike): Promise<NotionState> {
  const [peoplePages, recordPages, sessionPages] = await Promise.all([
    client.queryAll(ids.peopleDb),
    client.queryAll(ids.recordsDb),
    client.queryAll(ids.sessionsDb),
  ]);
  return {
    people: peoplePages.map((page) => ({
      pageId: page.id,
      key: readPlainText(page, "識別子"),
      tbId: readNumber(page, "テニスベアID"),
      lbName: readPlainText(page, "LaBOLA氏名") || null,
      rewarded: readMultiSelect(page, "リワード済み"),
      memo: readPlainText(page, "メモ"),
      hash: readPlainText(page, HASH),
    })),
    records: recordPages.map((page) => {
      const key = readPlainText(page, "キー");
      return {
        pageId: page.id,
        key,
        date: key.slice(0, 10),
        personKey: personKeyOfRecordKey(key),
        status: readSelect(page, "状態"),
        isAbsent: readSelect(page, "出欠") === "欠席",
        hash: readPlainText(page, HASH),
      };
    }),
    sessions: sessionPages.map((page) => ({
      pageId: page.id,
      date: readPlainText(page, "開催日"),
      hash: readPlainText(page, HASH),
    })),
  };
}

export function deriveLinks(people: readonly PeopleRow[]): NameLink[] {
  return people
    .filter((row) => row.tbId !== null && row.lbName !== null)
    .map((row) => ({ tbId: row.tbId as number, lbName: row.lbName as string }));
}

function linkedNames(links: readonly NameLink[]): Map<string, number> {
  return new Map(links.map((link) => [normalizeName(link.lbName), link.tbId]));
}

/** lb: キーの人キーを対応表でテニスベアの人キーに寄せる。 */
function canonicalKey(personKey: string, names: ReadonlyMap<string, number>): string {
  if (!personKey.startsWith("lb:")) return personKey;
  const tbId = names.get(personKey.slice(3));
  return tbId === undefined ? personKey : tbKey(tbId);
}

export function deriveAbsentKeys(records: readonly RecordRow[], links: readonly NameLink[]): Set<string> {
  const names = linkedNames(links);
  return new Set(
    records.filter((row) => row.isAbsent).map((row) => recordKey(row.date, canonicalKey(row.personKey, names))),
  );
}

async function upsert(
  client: NotionClient,
  databaseId: string,
  properties: Record<string, unknown>,
  existing: { pageId: string; hash: string } | undefined,
  counts: WriteCounts,
): Promise<string> {
  const hash = hashOf(properties);
  if (!existing) {
    const page = await client.createPage(databaseId, { ...properties, [HASH]: prop.text(hash) });
    counts.created += 1;
    return page.id;
  }
  if (existing.hash !== hash) {
    await client.updatePage(existing.pageId, { ...properties, [HASH]: prop.text(hash) });
    counts.updated += 1;
  }
  return existing.pageId;
}

/** 同じキーの行が複数あれば最初の1つを残し、残りをアーカイブする。 */
async function archiveDuplicates<T extends { pageId: string }>(
  client: NotionClient,
  rows: readonly T[],
  keyOf: (row: T) => string,
  counts: WriteCounts,
): Promise<T[]> {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

export async function syncSessions(
  client: NotionClient,
  ids: NotionIdsLike,
  sessions: readonly Session[],
  records: readonly AttendanceRecord[],
  existing: readonly SessionRow[],
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, (row) => row.date, counts);
  const byDate = new Map(unique.map((row) => [row.date, row]));
  for (const session of sessions) {
    const applicants = records.filter((record) => record.date === session.date && record.status === "申込").length;
    await upsert(
      client,
      ids.sessionsDb,
      {
        開催日: prop.title(session.date),
        日付: prop.date(session.date),
        テニスベアイベントID: prop.text(session.tbEventIds.join(", ")),
        中止: prop.checkbox(session.isCallOff),
        申込数: prop.number(applicants),
      },
      byDate.get(session.date),
      counts,
    );
  }
  return counts;
}

function personProperties(stats: PersonStats, rewarded: readonly string[]): Record<string, unknown> {
  const reached = stats.reachedMilestones.map(String);
  return {
    表示名: prop.title(stats.displayName),
    識別子: prop.text(stats.key),
    テニスベアID: prop.number(stats.tbId),
    LaBOLA氏名: prop.text(stats.lbName),
    累計: prop.number(stats.total),
    直近8回: prop.number(stats.recent),
    連続: prop.number(stats.streak),
    初参加日: prop.date(stats.firstDate),
    最終参加日: prop.date(stats.lastDate),
    状態: prop.select(stats.state),
    次回申込: prop.checkbox(stats.isNextApplied),
    次の節目: prop.text(stats.nextMilestone),
    到達節目: prop.multiSelect(reached),
    未渡し節目: prop.multiSelect(reached.filter((milestone) => !rewarded.includes(milestone))),
  };
}

async function mergePeople(
  client: NotionClient,
  existing: readonly PeopleRow[],
  links: readonly NameLink[],
  counts: WriteCounts,
): Promise<Map<string, PeopleRow>> {
  const names = linkedNames(links);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  for (const source of existing) {
    const targetKey = canonicalKey(source.key, names);
    const target = byKey.get(targetKey);
    if (targetKey === source.key || !target) continue;
    const rewarded = [...new Set([...target.rewarded, ...source.rewarded])].sort();
    const memo = target.memo || source.memo;
    await client.updatePage(target.pageId, { リワード済み: prop.multiSelect(rewarded), メモ: prop.text(memo || null) });
    await client.archivePage(source.pageId);
    counts.updated += 1;
    counts.archived += 1;
    byKey.set(targetKey, { ...target, rewarded, memo });
    byKey.delete(source.key);
  }
  return byKey;
}

export async function syncPeople(
  client: NotionClient,
  ids: NotionIdsLike,
  stats: readonly PersonStats[],
  existing: readonly PeopleRow[],
  links: readonly NameLink[],
): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, (row) => row.key, counts);
  const byKey = await mergePeople(client, unique, links, counts);
  const pageIdByKey = new Map<string, string>();
  for (const person of stats) {
    const row = byKey.get(person.key);
    const pageId = await upsert(client, ids.peopleDb, personProperties(person, row?.rewarded ?? []), row, counts);
    pageIdByKey.set(person.key, pageId);
  }
  return { pageIdByKey, counts };
}

export async function syncRecords(
  client: NotionClient,
  ids: NotionIdsLike,
  records: readonly AttendanceRecord[],
  pageIdByKey: ReadonlyMap<string, string>,
  existing: readonly RecordRow[],
  links: readonly NameLink[],
  absentKeys: ReadonlySet<string>,
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, (row) => row.key, counts);
  const byKey = new Map(unique.map((row) => [row.key, row]));
  const computedKeys = new Set(records.map((record) => record.key));
  for (const record of records) {
    const personPageId = pageIdByKey.get(record.personKey);
    if (!personPageId) throw new Error(`参加記録の人 ${record.personKey} のページが見つかりません`);
    await upsert(
      client,
      ids.recordsDb,
      {
        キー: prop.title(record.key),
        開催日: prop.date(record.date),
        人: prop.relation([personPageId]),
        経路: prop.select(record.route),
        申込日時: prop.date(record.appliedAt),
        状態: prop.select(record.status),
        回次: prop.number(record.ordinal),
        元データ: prop.text(record.sources.join(", ")),
        ...(absentKeys.has(record.key) ? { 出欠: prop.select("欠席") } : {}),
      },
      byKey.get(record.key),
      counts,
    );
  }
  const names = linkedNames(links);
  for (const row of unique) {
    if (computedKeys.has(row.key)) continue;
    if (canonicalKey(row.personKey, names) !== row.personKey) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
    } else if (row.status !== VANISHED) {
      await client.updatePage(row.pageId, { 状態: prop.select(VANISHED) });
      counts.updated += 1;
    }
  }
  return counts;
}

const bridgeSchema = z.object({
  nextDate: z.string().nullable(),
  updatedAt: z.string(),
  status: z.enum(["ok", "failed"]),
  failure: z.string().nullable(),
  flex: z.object({ type: z.literal("flex"), altText: z.string(), contents: z.record(z.string(), z.unknown()) }).nullable(),
});

const codeBlockSchema = z.object({ code: z.object({ rich_text: z.array(z.object({ plain_text: z.string() })) }) });

export async function readBridge(client: NotionClient, pageId: string): Promise<BridgePayload | null> {
  const blocks = await client.listChildren(pageId);
  const code = blocks.map((block) => codeBlockSchema.safeParse(block)).find((parsed) => parsed.success);
  if (!code?.success) return null;
  try {
    const parsed = bridgeSchema.safeParse(JSON.parse(code.data.code.rich_text.map((part) => part.plain_text).join("")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeBridge(client: NotionClient, pageId: string, payload: BridgePayload): Promise<void> {
  for (const block of await client.listChildren(pageId)) await client.deleteBlock(block.id);
  await client.appendChildren(pageId, [
    {
      object: "block",
      type: "code",
      code: {
        language: "json",
        rich_text: chunkText(JSON.stringify(payload, null, 2)).map((content) => ({ type: "text", text: { content } })),
      },
    },
  ]);
}

export async function markBridgeFailed(client: NotionClient, pageId: string, failure: string, now: string): Promise<void> {
  const previous = await readBridge(client, pageId);
  const base: BridgePayload = previous ?? { nextDate: null, updatedAt: now, status: "failed", failure: null, flex: null };
  await writeBridge(client, pageId, { ...base, status: "failed", failure });
}
```

注: `readBridge` の `JSON.parse` 失敗は「内容が読めない」ことを意味する正常な分岐(null を返し、呼び出し側が空として扱う)で、エラーを握りつぶしているのではない。`bridgeSchema` の `flex` の `contents` は `z.record` なので、`FlexMessage` 型とは `contents: Record<string, unknown>` で一致する。

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning/notionSync.test.ts --coverage --coverage.include=scripts/early-morning/notionSync.ts && npx tsc --noEmit -p .`
Expected: PASS、100%、型エラーなし。届かない分岐があれば、その条件を満たすケースをテストに足す。

- [ ] **Step 5: コミット**

```bash
git add scripts/early-morning/notionSync.ts scripts/early-morning/notionSync.test.ts
git commit -m "feat: 早朝リピーター集計を Notion に差分で書き込み名寄せを統合する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 実行の組み立て・CLI・npm script

**Files:**
- Create: `scripts/early-morning/sync.ts`, `scripts/early-morning/early-sync.ts`
- Test: `scripts/early-morning/sync.test.ts`
- Modify: `package.json`(scripts)、`vitest.config.ts`(coverage.exclude)、`docs/testing/growth-coverage-alternatives.json`、`docs/testing/growth-coverage-alternatives.md`

**Interfaces:**
- Consumes: Task 4〜10 の全関数、`NOTION_IDS`(Task 1)、`jstDate` / `jstDateTime`、`FETCH_INTERVAL_MS` / `EARLY_START_TIME`
- Produces:
  - `interface SyncDeps { notion: NotionClient; fetchFn: FetchFn; sleep: (ms: number) => Promise<void>; now: Date; ids: NotionIdsLike & { ledgerDb: string; peopleDbUrl: string } }`
  - `interface SyncSummary { events: number; sessions: number; people: number; records: number; unmatchedReservations: number; ignoredStatuses: number; writes: WriteCounts; nextDate: string | null }`
  - `runSync(deps: SyncDeps): Promise<SyncSummary>`
  - npm script `early:sync`

実行順: ① Notion の現状を読む → ② テニスベアを取る → ③ 予約台帳を取る → ④ 計算 → ⑤ 開催回・人・記録を書く → ⑥ 橋渡しを書く。①〜③または⑤のどこかで失敗したら、橋渡しを「失敗」にしてから例外を投げ直す(橋渡しの更新自体も失敗した場合は元の例外を優先する)。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/early-morning/sync.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import type { NotionBlock, NotionClient } from "./notionClient";
import type { NotionPage } from "./notionProps";
import { runSync } from "./sync";

const ids = {
  ledgerDb: "ledger",
  peopleDb: "people",
  recordsDb: "records",
  sessionsDb: "sessions",
  bridgePage: "bridge",
  peopleDbUrl: "https://www.notion.so/people",
};

function html(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

const circle = {
  state: { feature: { circle: { circleDetail: { CircleOrganizedEvents: {
    circleOrganizedFutureEventList: [{ id: 2, startDatetimeString: "2026-10-06T06:00:00.000+09:00", callOff: false }],
    circleOrganizedPastEventList: [{ id: 1, startDatetimeString: "2026-09-29T06:00:00.000+09:00", callOff: false }],
  } } } } },
};

function detail(id: number, start: string, userIds: number[]) {
  return {
    state: { feature: { event: { eventDetail: { EventDetail: { event: {
      id, startDateTime: start, callOff: false, cancelUserList: [],
      participantList: userIds.map((uid) => ({
        eventUserStatusType: "APPROVE", guestUserFlg: false, applyDateTime: null, user: { id: uid, name: `テスト${uid}` },
      })),
    } } } } } },
  };
}

function res(body: string, status = 200): HttpResponse {
  return { ok: status < 400, status, json: async () => ({}), text: async () => body };
}

function tennisbear(status = 200): FetchFn {
  return vi.fn<FetchFn>(async (url) => {
    if (status !== 200) return res("", status);
    if (url.endsWith("/events")) return res(html(circle));
    if (url.endsWith("/event/1/info")) return res(html(detail(1, "2026-09-29T06:00:00.000+09:00", [11, 12])));
    return res(html(detail(2, "2026-10-06T06:00:00.000+09:00", [11])));
  });
}

/** 実際の Notion API は読み取り時に plain_text を返すので、偽物でも書いた値に plain_text を補う。 */
function addPlainText(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = (value as { text?: { content?: unknown } }).text;
    if (typeof text?.content === "string") return { ...value, plain_text: text.content };
  }
  return value;
}

function withPlainText(properties: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties, addPlainText)) as Record<string, unknown>;
}

class MemoryNotion implements NotionClient {
  pages = new Map<string, { db: string; properties: Record<string, unknown> }>();
  blocks: NotionBlock[] = [];
  failOn: string | null = null;
  private seq = 0;
  async getDatabase() {
    return { properties: Object.fromEntries(["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時"].map((n) => [n, { id: n }])) };
  }
  async queryAll(databaseId: string): Promise<NotionPage[]> {
    if (this.failOn === `query ${databaseId}`) throw new Error(`query ${databaseId} failed`);
    if (databaseId === "ledger") {
      return [{ id: "l1", properties: {
        予約番号: { title: [{ plain_text: "#1" }] }, 予約者: { rich_text: [{ plain_text: "テスト花子" }] },
        利用日: { date: { start: "2026-09-29" } }, 時間帯: { rich_text: [{ plain_text: "06:00～08:00" }] },
        ステータス: { select: { name: "有効" } }, 受付日時: { date: null },
      } }];
    }
    return [...this.pages.entries()].filter(([, p]) => p.db === databaseId).map(([id, p]) => ({ id, properties: p.properties }));
  }
  async createPage(databaseId: string, properties: Record<string, unknown>) {
    if (this.failOn === `create ${databaseId}`) throw new Error("create failed");
    const id = `p${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties) });
    return { id, properties };
  }
  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId)!;
    page.properties = { ...page.properties, ...withPlainText(properties) };
  }
  async archivePage(pageId: string) {
    this.pages.delete(pageId);
  }
  async listChildren() {
    if (this.failOn === "listChildren") throw new Error("bridge failed");
    return this.blocks;
  }
  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
  }
  async appendChildren(_id: string, children: readonly unknown[]) {
    this.blocks = children.map((c, i) => {
      const block = c as { code: { rich_text: Array<{ text: { content: string } }> } };
      return { id: `b${i}`, type: "code", code: { rich_text: block.code.rich_text.map((t) => ({ plain_text: t.text.content })) } };
    });
  }
  bridge(): Record<string, unknown> {
    const code = this.blocks[0] as unknown as { code: { rich_text: Array<{ plain_text: string }> } };
    return JSON.parse(code.code.rich_text.map((t) => t.plain_text).join(""));
  }
}

const now = new Date("2026-10-05T11:30:00Z"); // JST 2026-10-05 20:30

describe("runSync", () => {
  it("取得・計算・書き込み・橋渡しを行い、件数を返す", async () => {
    const notion = new MemoryNotion();
    const summary = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids });

    expect(summary).toEqual({
      events: 2,
      sessions: 2,
      people: 3,
      records: 4,
      unmatchedReservations: 0,
      ignoredStatuses: 0,
      writes: { created: 9, updated: 0, archived: 0 },
      nextDate: "2026-10-06",
    });
    const bridge = notion.bridge();
    expect(bridge).toMatchObject({ nextDate: "2026-10-06", updatedAt: "2026-10-05T20:30:00+09:00", status: "ok", failure: null });
    expect(JSON.stringify(bridge.flex)).toContain("テスト11");
    expect(JSON.stringify(bridge.flex)).toContain("2回目");

    const again = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids });
    expect(again.writes).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("次回の開催回がなければ nextDate と flex は null", async () => {
    const notion = new MemoryNotion();
    const later = new Date("2026-10-06T11:30:00Z");
    const summary = await runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now: later, ids });
    expect(summary.nextDate).toBeNull();
    expect(notion.bridge()).toMatchObject({ nextDate: null, flex: null });
  });

  it("テニスベアの取得に失敗したら橋渡しを失敗にして例外を投げる", async () => {
    const notion = new MemoryNotion();
    await expect(runSync({ notion, fetchFn: tennisbear(503), sleep: async () => undefined, now, ids })).rejects.toThrow("HTTP 503");
    expect(notion.bridge()).toMatchObject({ status: "failed", failure: expect.stringContaining("テニスベア") });
    expect([...notion.pages.values()]).toHaveLength(0);
  });

  it("予約台帳・Notion 読み取り・書き込みの失敗もそれぞれ理由を残す", async () => {
    for (const [failOn, label] of [["query ledger", "予約台帳"], ["query people", "Notion読み取り"], ["create sessions", "Notion書き込み"]] as const) {
      const notion = new MemoryNotion();
      notion.failOn = failOn;
      await expect(runSync({ notion, fetchFn: tennisbear(), sleep: async () => undefined, now, ids })).rejects.toThrow();
      expect(notion.bridge()).toMatchObject({ status: "failed", failure: expect.stringContaining(label) });
    }
  });

  it("橋渡しの更新も失敗したら元の例外を投げる", async () => {
    const notion = new MemoryNotion();
    notion.failOn = "listChildren";
    await expect(runSync({ notion, fetchFn: tennisbear(503), sleep: async () => undefined, now, ids })).rejects.toThrow("HTTP 503");
  });

  it("Error 以外が投げられても文字列にして残す", async () => {
    const notion = new MemoryNotion();
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw "boom";
    });
    await expect(runSync({ notion, fetchFn, sleep: async () => undefined, now, ids })).rejects.toBe("boom");
    expect(notion.bridge()).toMatchObject({ failure: "テニスベア: boom" });
  });
});
```

期待値の根拠(2026-10-05 20:30 JST 時点): 開催回は 9/29 と 10/6 の2つ。人は tb:11・tb:12・lb:テスト花子 の3人。記録は 9/29 に3件、10/6 に1件の計4件。作成は 開催回2 + 人3 + 記録4 = 9。tb:11 の 10/6 は2回目。

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/early-morning/sync.test.ts`
Expected: FAIL(`Cannot find module './sync'`)

- [ ] **Step 3: 実装する**

`scripts/early-morning/sync.ts`:

```ts
/** 早朝リピーター集計の1回分の実行。失敗時は橋渡しページを「失敗」にしてから例外を投げ直す。 */
import type { FetchFn } from "../growth/http";
import { buildAttendance } from "./attendance";
import { EARLY_START_TIME, FETCH_INTERVAL_MS } from "./config";
import { jstDate, jstDateTime } from "./dates";
import { fetchEarlyReservations } from "./ledger";
import { buildFlexMessage, selectLineEntries } from "./lineMessage";
import { computeStats, findNextSession } from "./metrics";
import type { NotionClient } from "./notionClient";
import {
  deriveAbsentKeys,
  deriveLinks,
  markBridgeFailed,
  readNotionState,
  syncPeople,
  syncRecords,
  syncSessions,
  writeBridge,
  type NotionIdsLike,
  type WriteCounts,
} from "./notionSync";
import { fetchEarlyEventDetails } from "./tennisbear";

export interface SyncDeps {
  notion: NotionClient;
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  now: Date;
  ids: NotionIdsLike & { ledgerDb: string; peopleDbUrl: string };
}

export interface SyncSummary {
  events: number;
  sessions: number;
  people: number;
  records: number;
  unmatchedReservations: number;
  ignoredStatuses: number;
  writes: WriteCounts;
  nextDate: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function step<T>(deps: SyncDeps, label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await markBridgeFailed(deps.notion, deps.ids.bridgePage, `${label}: ${messageOf(error)}`, jstDateTime(deps.now)).catch(
      () => undefined,
    );
    throw error;
  }
}

function addCounts(...all: WriteCounts[]): WriteCounts {
  return all.reduce(
    (sum, counts) => ({
      created: sum.created + counts.created,
      updated: sum.updated + counts.updated,
      archived: sum.archived + counts.archived,
    }),
    { created: 0, updated: 0, archived: 0 },
  );
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const today = jstDate(deps.now);
  const updatedAt = jstDateTime(deps.now);
  const { notion, ids } = deps;

  const state = await step(deps, "Notion読み取り", () => readNotionState(notion, ids));
  const events = await step(deps, "テニスベア", () =>
    fetchEarlyEventDetails({ fetchFn: deps.fetchFn, sleep: deps.sleep, intervalMs: FETCH_INTERVAL_MS }),
  );
  const reservations = await step(deps, "予約台帳", () => fetchEarlyReservations(notion, ids.ledgerDb));

  const links = deriveLinks(state.people);
  const absentKeys = deriveAbsentKeys(state.records, links);
  const attendance = buildAttendance({ events, reservations, links, absentKeys });
  const stats = computeStats({ people: attendance.people, records: attendance.records, sessions: attendance.sessions, today });
  const next = findNextSession(attendance.sessions, today);
  const peopleByKey = new Map(attendance.people.map((person) => [person.key, person]));

  const writes = await step(deps, "Notion書き込み", async () => {
    const sessionCounts = await syncSessions(notion, ids, attendance.sessions, attendance.records, state.sessions);
    const people = await syncPeople(notion, ids, stats, state.people, links);
    const recordCounts = await syncRecords(notion, ids, attendance.records, people.pageIdByKey, state.records, links, absentKeys);
    await writeBridge(notion, ids.bridgePage, {
      nextDate: next?.date ?? null,
      updatedAt,
      status: "ok",
      failure: null,
      flex: next
        ? buildFlexMessage({
            sessionDate: next.date,
            startTime: EARLY_START_TIME,
            entries: selectLineEntries(next, attendance.records, peopleByKey),
            updatedAt,
            notionUrl: ids.peopleDbUrl,
          })
        : null,
    });
    return addCounts(sessionCounts, people.counts, recordCounts);
  });

  return {
    events: events.length,
    sessions: attendance.sessions.length,
    people: attendance.people.length,
    records: attendance.records.length,
    unmatchedReservations: attendance.unmatchedReservations,
    ignoredStatuses: events.reduce((sum, event) => sum + event.ignoredStatusCount, 0),
    writes,
    nextDate: next?.date ?? null,
  };
}
```

`scripts/early-morning/early-sync.ts`:

```ts
/**
 * 早朝リピーター集計の実行入口。
 *
 *   npm run early:sync
 *
 * .env.local の NOTION_TOKEN を使う。標準出力は件数だけ(個人名は出さない)。
 * 終了コード: 0 = 成功 / 1 = 失敗(Notion の橋渡しページに理由を残している)。
 * 薄い配線のためテスト対象外(ロジックは sync.ts でテスト済み)。
 */
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { defaultFetch } from "../growth/http";
import { createNotionClient } from "./notionClient";
import { NOTION_IDS } from "./notionIds";
import { runSync } from "./sync";

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
  const startedAt = Date.now();
  const summary = await runSync({ notion, fetchFn: defaultFetch, sleep, now: new Date(), ids: NOTION_IDS });
  process.stdout.write(
    [
      `早朝イベント ${summary.events} / 開催回 ${summary.sessions} / 人 ${summary.people} / 参加記録 ${summary.records}`,
      `書き込み 作成${summary.writes.created}・更新${summary.writes.updated}・アーカイブ${summary.writes.archived}`,
      `次回 ${summary.nextDate ?? "なし"} / 対応なし予約 ${summary.unmatchedReservations} / 未知の状態 ${summary.ignoredStatuses}`,
      `所要 ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`early:sync に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

`package.json` の `scripts` の末尾に追加する。現在の最後の行 `"growth:body-diff": "tsx scripts/growth/body-diff.ts"` の行末にカンマを足し、その次の行に次の1行をカンマなしで置く(置いた後 `node -e 'require("./package.json")'` でエラーが出ないことを確かめる):

```json
"early:sync": "tsx scripts/early-morning/early-sync.ts"
```

`vitest.config.ts` の `coverage.exclude` の末尾に追加:

```ts
        // 早朝リピーター集計の実行入口(薄い I/O 入口)。ロジックは sync.ts でテスト済み。
        "scripts/early-morning/early-sync.ts",
```

`docs/testing/growth-coverage-alternatives.json` の `exclusions` に追加:

```json
    "scripts/early-morning/early-sync.ts": {
      "reason": "早朝リピーター集計CLIの薄いI/O入口",
      "guarantees": [
        "scripts/early-morning/sync.test.ts"
      ],
      "kind": "alternative-test",
      "residualRisk": "実環境固有の結線はCI外",
      "excludedFiles": [
        "scripts/early-morning/early-sync.ts"
      ]
    }
```

`docs/testing/growth-coverage-alternatives.md` の対応表(列は path / 保証先 / 種別 / 残存リスク)の最後の行の次に、次の1行を追加する:

```markdown
| `scripts/early-morning/early-sync.ts` | `scripts/early-morning/sync.test.ts` | alternative-test | 実環境固有の結線はCI外 |
```

- [ ] **Step 4: テストとカバレッジを確認する**

Run: `npx vitest run scripts/early-morning vitest.config.test.ts --coverage --coverage.include='scripts/early-morning/**' && npx tsc --noEmit -p . && npm run lint`
Expected: PASS、`scripts/early-morning` 配下(early-sync.ts 以外)が 100%、vitest.config.test.ts の対応表チェックも PASS。

- [ ] **Step 5: コミット**

```bash
git add scripts/early-morning/sync.ts scripts/early-morning/sync.test.ts scripts/early-morning/early-sync.ts package.json vitest.config.ts docs/testing/growth-coverage-alternatives.json docs/testing/growth-coverage-alternatives.md
git commit -m "feat: 早朝リピーター集計を1コマンドで実行できるようにする

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 実データでの初回実行と受け入れ確認

**Files:** なし(確認のみ。結果はファイルに残さない)

- [ ] **Step 1: 初回実行**

```bash
cd /Users/tsutsumi.akihiro/dev/bigban-early-morning
ls -la .env.local || ln -s /Users/tsutsumi.akihiro/dev/bigban/.env.local .env.local
npm run early:sync
```

Expected: 終了コード 0。早朝イベント 20件前後、開催回 20前後、作成が数百件。所要は数分(Notion の書き込みが律速)。

- [ ] **Step 2: 2回目は書き込みがほぼゼロになることを確認**

Run: `npm run early:sync`
Expected: `作成0・更新0〜数件・アーカイブ0`

- [ ] **Step 3: 設計書1章の突き合わせ表と照合する(会話内で確認)**

Notion コネクタで ③ 早朝開催回を読み、9/8・9/15・9/22・9/29・8/25・8/11 の `申込数` が「テニスベアのアカウント申込数(ゲスト除く)+ LaBOLA 有効予約数 − 両方にいる人数」と一致することを確かめる。例: 9/22 はテニスベア15 + LaBOLA 2(両方にいる人がいなければ)= 17。① の「LaBOLA氏名が未対応」ビューに LaBOLA 予約者が並んでいることを確かめる。結果はオーナーに会話で報告し、ファイルには残さない。

- [ ] **Step 4: 橋渡しページを確認する**

Notion コネクタで「次回の早朝(通知橋渡し)」を読み、`status: "ok"`、`nextDate` が次の火曜または木曜、`flex.altText` に人数が入っていることを確かめる。

- [ ] **Step 5: LINE に試し送信する(オーナーの了解を得てから)**

オーナーに「LINE グループに試し送信してよいか」を確認してから、ローカルの `.env.local` の LINE 設定で1回だけ送る:

```bash
npx tsx -e '
import { readFileSync } from "node:fs"; import { parse } from "dotenv";
const env = parse(readFileSync(".env.local"));
import { defaultFetch } from "./scripts/growth/http";
import { createNotionClient } from "./scripts/early-morning/notionClient";
import { readBridge } from "./scripts/early-morning/notionSync";
import { NOTION_IDS } from "./scripts/early-morning/notionIds";
const client = createNotionClient({ token: env.NOTION_TOKEN, fetchFn: defaultFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
const bridge = await readBridge(client, NOTION_IDS.bridgePage);
if (!bridge?.flex) throw new Error("flex なし");
const res = await fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: env.LINE_GROUP_ID, messages: [bridge.flex] }) });
console.log(res.status, await res.text());'
```

Expected: `200 {}`。LINE グループで表示を確認してもらい、見た目の修正があれば Task 9 に戻る。

---

### Task 13: 定期実行と運用ドキュメント

**Files:**
- Create: `docs/growth/routines/early-morning-notify.md`、`docs/operations/early-morning-repeaters.md`
- Modify: `CLAUDE.md`(「グロースコパイロット」節の後に1段落)、`docs/growth/README.md`(ルーチン一覧に1行)

- [ ] **Step 1: クラウドルーチンのプロンプト正本を書く**

`docs/growth/routines/early-morning-notify.md`:

````markdown
# 早朝ピックル 前夜通知(クラウドルーチン)

> 毎日 21:00 JST に実行。翌朝に早朝回がある日だけ LINE グループへ送る。それ以外の日は何もしない(沈黙が正常)。
> 設計: `docs/superpowers/specs/2026-09-29-early-morning-repeaters-design.md` §8

あなたは早朝ピックルの前夜通知係です。判定や集計はしません。Notion の橋渡しページにある Flex メッセージを、条件を確かめて送るだけです。

## 手順

1. 基準日を JST で確定する:
   `TOMORROW=$(TZ=Asia/Tokyo date -v+1d +%Y-%m-%d 2>/dev/null || TZ=Asia/Tokyo date -d tomorrow +%Y-%m-%d)`
   `NOW_EPOCH=$(date +%s)`
2. Notion コネクタでページ「次回の早朝(通知橋渡し)」(ID: `<NOTION_IDS.bridgePage>`)を取得し、本文の JSON コードブロックを読む。キーは `nextDate` / `updatedAt` / `status` / `failure` / `flex`。
3. `nextDate` が `TOMORROW` と違う、または `flex` が null なら、何も送らずに終了する(これは正常)。
4. 警告行を決める(該当するものを上から順に、最大2行):
   - `status` が `"failed"` → `⚠ {failure の「:」より前}の取得に失敗したため前回のデータです`
   - `updatedAt` が現在より24時間以上前 → `⚠ 最新ではありません(最終更新 {updatedAt の M/D HH:MM})`
5. 警告行があれば、`flex.contents.body.contents` の**先頭**に、行ごとに次のオブジェクトを挿入する(文言以外は変えない):
   `{"type":"text","text":"<警告行>","size":"xs","color":"#D64545","wrap":true}`
   Flex のそれ以外の部分は一切変更しない。
6. 送信する。予約メールチェックと同じく、JSON は `payload.json` にファイルとして書き出してから送る(`jq` など追加のツールは使わない):
   - `payload.json` の中身は `{"to": "<LINE_GROUP_ID の値>", "messages": [<手順5の後の flex>]}`。`LINE_GROUP_ID` の値は `printenv LINE_GROUP_ID` で読む
   - 送信:
   ```
   curl -s -o resp.txt -w "%{http_code}" -X POST https://api.line.me/v2/bot/message/push \
     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @payload.json
   ```
   200 以外なら、HTTP コードと resp.txt の本文を報告して終了する。
7. `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_GROUP_ID` が未設定、または Notion に到達できないときは送らずに報告する。

## 禁止

- 参加者の並べ替え・名前の変更・回数の再計算
- 橋渡しページ以外の Notion への書き込み
- 個人名をファイルやコミットに残すこと(この作業はリポジトリに何も書かない)
````

`<NOTION_IDS.bridgePage>` は Task 1 で確定した ID に置き換える。

- [ ] **Step 2: スタッフ向け運用メモを書く**

`docs/operations/early-morning-repeaters.md`:

```markdown
# 早朝ピックル 常連一覧の使い方(スタッフ向け)

Notion「早朝ピックル常連」に、早朝ピックルの参加者が1人1行で並んでいます。1日2回(朝8:30・夜20:30)自動で更新されます。前夜21時には、翌朝の参加者一覧が LINE グループに届きます。

## スタッフが書く欄(自動更新で消えません)

- **リワード済み**(早朝常連): 特典を渡した節目(5・10・20…)を選ぶ。「未渡し節目」から消える
- **メモ**(早朝常連): 自由記述
- **出欠**(早朝参加記録): 申込したのに来なかった回に「欠席」を付ける。その回は回数から外れる(任意)

## 同じ人が2行に分かれているとき

テニスベアと LaBOLA の両方で申し込む人は、最初は別々の行になります。テニスベア側の行(テニスベアIDがある行)の「LaBOLA氏名」に、LaBOLA の予約名をそのまま入れてください。次の自動更新で1行にまとまります(リワード済みは両方の合計、メモは空の方に移ります)。未対応の人はビュー「LaBOLA氏名が未対応」に出ます。

## 数え方

- テニスベアのゲスト枠(「LBゲスト1」など)は数えません。LaBOLA 予約から直接数えるため、ゲスト枠の入力漏れがあっても回数は正しくなります
- 同じ日に両方で申し込んでいても1回です
- 「参加」は申込ベースです。来なかった回は「出欠」で外してください

## 止め方

- 通知だけ止める: claude.ai のルーチン一覧で「早朝前夜通知」を無効にする(集計は続く)
- 集計も止める: Claude デスクトップの定期タスク `early-morning-sync` を無効にする
- Notion のデータはそのまま残る。再開すれば全期間を数え直すので、止めていた間の分も自動で埋まる

## 困ったとき

- LINE に「⚠ 最新ではありません」と出る: Mac が起動していなかったため、前回の集計を送っています
- LINE に「⚠ …の取得に失敗」と出る: テニスベアか予約台帳が読めませんでした。翌日も続く場合はオーナーへ
```

- [ ] **Step 3: CLAUDE.md と ルーチン一覧に追記する**

`CLAUDE.md` の「## グロースコパイロット (定期ルーチン)」節の直後に追加:

```markdown
## 早朝ピックル リピーター集計

> 設計書: `docs/superpowers/specs/2026-09-29-early-morning-repeaters-design.md` / スタッフ向け: `docs/operations/early-morning-repeaters.md`

- ローカル定期タスク `early-morning-sync`(08:30/20:30)が `npm run early:sync` を実行し、Notion「早朝ピックル常連」配下を更新する。クラウドルーチン「早朝前夜通知」(21:00)が橋渡しページの Flex を LINE に送る(プロンプト正本: `docs/growth/routines/early-morning-notify.md`)
- 個人名を置いてよいのは Notion「早朝ピックル常連」配下と LINE だけ。コード・テスト・ログ・コミットに実名を残さない
```

`docs/growth/README.md` のルーチン表に1行追加:

```markdown
| `routines/early-morning-notify.md` | 早朝ピックルの前夜通知(毎日 21:00・翌朝に開催がある日だけ LINE へ送る。沈黙が正常) |
```

- [ ] **Step 4: コミットして PR3 を出す**

```bash
git add docs/growth/routines/early-morning-notify.md docs/operations/early-morning-repeaters.md CLAUDE.md docs/growth/README.md
git commit -m "docs: 早朝リピーター集計の定期実行と運用手順を追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run lint && npx tsc --noEmit -p . && npx vitest run --coverage
```

PR タイトル `feat: 早朝リピーター集計の書き込みと定期実行を追加する`(3/3)。本文にテスト計画(Task 12 の確認項目)を書く。

- [ ] **Step 5: ローカル実行用の worktree を用意する(PR3 が develop にマージされた後)**

```bash
cd /Users/tsutsumi.akihiro/dev/bigban
git fetch origin develop
git worktree add --detach ../bigban-ops origin/develop
cd ../bigban-ops && npm ci
ln -s /Users/tsutsumi.akihiro/dev/bigban/.env.local .env.local
npm run early:sync
```

Expected: 終了コード 0、2回目相当の少ない書き込み件数。

- [ ] **Step 6: ローカル定期タスクを作る**

ToolSearch で `select:mcp__scheduled-tasks__create_scheduled_task` を読み込み、次の内容で作る。

- taskId: `early-morning-sync`
- cron: `30 8,20 * * *`
- description: `早朝ピックルの参加者を集計し Notion 常連一覧と前夜通知の橋渡しを更新する`
- prompt:

```
あなたは早朝ピックル リピーター集計のローカル実行係です。次のコマンドをこの順で実行し、最後のコマンドの標準出力をそのまま報告してください。集計や判断はしません。

cd /Users/tsutsumi.akihiro/dev/bigban-ops
git fetch -q origin develop
git checkout -q --detach origin/develop
git diff --quiet HEAD@{1} HEAD -- package-lock.json || npm ci --silent
npm run early:sync

終了コードが 0 以外なら、標準エラーの内容と「Notion の『次回の早朝(通知橋渡し)』に失敗理由が記録されています」を報告してください。個人名はファイルに書かないでください。
```

作成後、Mac がスリープ・停止していた時間帯をまたいだ翌日に `mcp__scheduled-tasks__list_task_runs`(taskId `early-morning-sync`)で実行履歴を確かめる。スリープ明けに取りこぼした回が実行されていなければ、`docs/operations/early-morning-repeaters.md` の「困ったとき」に「Mac を起動していなかった日は朝8:30の集計結果が前夜通知に使われる(24時間以内なので警告は出ない)」と追記する。

- [ ] **Step 7: クラウドルーチンを作る(無効のまま)**

1. `RemoteTrigger` の `get` で `trig_01WrQc3hbfT8QgDcm8SdLBaV`(予約メールチェック)を取得し、`job_config.ccr.environment_id`(`env_016yu2zZKZC73qPmuKVKeSFY`)と、`mcp_connections` のうち Notion の要素を控える。
2. `RemoteTrigger` の `create` で作る: 名前「早朝前夜通知」、`cron_expression` `0 12 * * *`(UTC 12:00 = JST 21:00)、`enabled: false`、同じ `environment_id`、Notion の `mcp_connections` だけ、プロンプトは「リポジトリの docs/growth/routines/early-morning-notify.md を読み、その内容に完全に従って実行してください。ファイルが無い場合は『早朝前夜通知のセットアップが未完了です』と報告して終了してください。」、`sources` に `https://github.com/Akihiro1028Bad/bigban-site`。
3. 結果の URL と次回実行時刻をオーナーに伝え、「claude.ai のルーチン一覧で『早朝前夜通知』を有効にしてください」と依頼する(設計書12章の人間作業2)。
4. 有効化の翌日以降、`RemoteTrigger` の `list_runs` で初回実行が成功したこと、翌朝に開催がない日は何も送っていないことを確認する。

---

## Self-Review 結果

- **設計書との対応**: 1章の突き合わせ→Task 12 Step 3 / 3章の構成→Task 11・13 / 4.1 テニスベア→Task 3・4 / 4.2 予約台帳(6列限定・開催回がない予約の除外・反映遅れの注記)→Task 6・7・9 / 5章 名寄せ・1回の定義→Task 6・7・10 / 6章 Notion 構成→Task 1・10 / 7章 判定→Task 8 / 8章 LINE→Task 9・13 / 9章 エラー処理→Task 5・10・11 / 10章 個人情報→Global Constraints・Task 1 Step 9・Task 13 / 11章 テスト→各 Task / 12章 人間作業→Task 1 Step 3・Task 13 Step 7 / 13章 確認事項→Task 3 Step 5・Task 4 Step 5
- **型の一貫性**: `NotionIdsLike`(Task 10)+ `ledgerDb` / `peopleDbUrl` を `SyncDeps.ids`(Task 11)で使い、`NOTION_IDS`(Task 1)はその両方を満たす。`FlexMessage` は Task 9 で定義し Task 10 の `BridgePayload` で使う。`recordKey` / `personKeyOfRecordKey` は Task 6 で定義し Task 7・10 で使う。
- **残す判断**: Notion ID(Task 1)と橋渡しページ ID(Task 13 Step 1)は作成時にしか決まらないため、確定手順と「山括弧が残っていたら未完了」という確認方法を書いた。

---

## 追補: クラス別集計・所見・主催者除外(Task 14〜18)

> 設計書 §14(2026-09-29 オーナー決定)。**実行順: Task 14 → 15 → 16 → 17 → 18 → Task 12 Step 5(試し送信)→ Task 13**。Task 1〜11 と Task 12 Step 1〜4 は完了済み。
> 既存のファイル・テストは TDD で直す(先に期待を変えたテストを書いて落とし、それから実装)。既存テストの期待値を変えるのは、この追補で仕様が変わった箇所だけ。

### Task 14: 主催者の除外

**Files:** Modify `scripts/early-morning/tennisbear.ts`, `scripts/early-morning/tennisbear.test.ts`, `scripts/early-morning/config.ts`, `scripts/early-morning/config.test.ts`

**Interfaces:**
- Produces: `config.ts` に `export const EXCLUDED_TB_USER_IDS: readonly number[] = [];`(JSDoc: 「主催者以外に参加者一覧から除外するスタッフのテニスベア ID。名前は書かない」)
- Changes: `extractEventDetail(state: unknown, excludedUserIds: readonly number[] = EXCLUDED_TB_USER_IDS): TbEventDetail`

仕様:
- イベント詳細の schema に `organizer: z.object({ id: z.number().int() })` を追加する(`state.feature.event.eventDetail.EventDetail.event.organizer.id`、2026-09-29 に実データで確認済み)
- `participantList` と `cancelUserList` の両方から、`user.id === organizer.id` または `excludedUserIds` に含まれる参加者を**取り除く**(`participants` に入れず、`ignoredStatusCount` にも数えない)
- 取り除く判定はステータス判定より先に行う

テスト(tennisbear.test.ts):
- 既存の `eventState` ヘルパーに `organizer: { id: 999 }` を足し、既存テストの期待値は変えない
- 追加: 主催者(id 999)が APPROVE で participantList にいても `participants` に出ない
- 追加: `extractEventDetail(state, [11])` で id 11 の参加者が申込・キャンセルの両方から消える
- 追加: 主催者が APPLYING のような未知の状態でも `ignoredStatusCount` に数えない
- config.test.ts: `EXCLUDED_TB_USER_IDS` が空配列であることを確かめる

コミット: `feat: 早朝集計から主催者と指定スタッフを除外する`

### Task 15: 開催回のクラスと日付ヘルパー

**Files:** Create `scripts/early-morning/classes.ts`, `scripts/early-morning/classes.test.ts`。Modify `types.ts`, `config.ts`, `config.test.ts`, `dates.ts`, `dates.test.ts`, `attendance.ts`, `attendance.test.ts`, `notionSync.ts`, `notionSync.test.ts`, `metrics.test.ts`, `lineMessage.test.ts`, `sync.test.ts`(Session の形が変わる箇所だけ)

**Interfaces:**
- `types.ts`: `export type SessionClass = "初中級" | "中級以上" | "その他";` / `export type ClassKey = Exclude<SessionClass, "その他">;` / `Session` に `classType: SessionClass` を追加
- `config.ts`: `export const CLASS_BY_WEEKDAY: Readonly<Record<number, ClassKey>> = { 2: "初中級", 4: "中級以上" };`(キーは `getUTCDay()` の曜日番号。2=火、4=木)
- `classes.ts`:
  - `export const CLASS_WEEKDAY_LABEL: Readonly<Record<ClassKey, string>> = { 初中級: "火", 中級以上: "木" };`
  - `export const CLASS_KEYS: readonly ClassKey[] = ["初中級", "中級以上"];`
  - `export function classOfDate(date: string): SessionClass`(`YYYY-MM-DD` の曜日から。該当なしは `"その他"`)
  - `export function otherClass(key: ClassKey): ClassKey`
- `dates.ts` に追加: `formatMonthDay(date: string): string`(`2026-08-20` → `8/20`)、`addDays(date: string, days: number): string`(UTC で計算、`2026-09-30`+1 → `2026-10-01`)、`daysBetween(from: string, to: string): number`(`2026-08-20`→`2026-10-01` は 42)
- `attendance.ts` の `buildSessions` が `classType: classOfDate(date)` を入れる
- `notionSync.ts` の `syncSessions` が ③ に `クラス: prop.select(session.classType)` を書く

テスト:
- classes.test.ts: 2026-10-06(火)→初中級、2026-10-01(木)→中級以上、2026-06-24(水)/06-28(日)/06-29(月)→その他、`otherClass` の往復
- dates.test.ts: 上の3関数の例、`addDays` の月またぎ
- attendance.test.ts: sessions の期待値に `classType` を足す(日付の曜日どおり)
- notionSync.test.ts: syncSessions で作られた行に `クラス` が入ること
- 他のテストの Session フィクスチャに `classType` を足して tsc を通す(期待値の意味は変えない)

コミット: `feat: 早朝の開催回に火曜初中級・木曜中級以上のクラスを持たせる`

### Task 16: クラス別の判定と Notion の列

**Files:** Create `scripts/early-morning/classStats.ts`, `scripts/early-morning/classStats.test.ts`。Modify `config.ts`, `config.test.ts`, `types.ts`, `metrics.ts`, `metrics.test.ts`, `notionSync.ts`, `notionSync.test.ts`, `sync.test.ts`(期待値が変わる箇所だけ)

**Interfaces:**
- `config.ts`: `RULES` を `{ newMaxTotal: 2 } as const` にし、`export const CLASS_RULES = { recentWindow: 4, regularMin: 3, dormantMisses: 4, dormantMinTotal: 3, perfectMin: 3 } as const;` を追加。`NOTE_LONG_GAP_DAYS = 28` も追加
- `classStats.ts`:
  - `export interface ClassStats { attended: number; heldSinceFirst: number; streak: number; recentAttended: number; firstDate: string | null; lastDate: string | null; missedSinceLast: number }`
  - `export function computeClassStats(input: { personKey: string; records: readonly AttendanceRecord[]; sessions: readonly Session[]; classKey: ClassKey; before: string }): ClassStats` — `before` は**含まない**上限日。対象の開催回 = `!isCallOff && classType === classKey && date < before`(日付昇順)。参加 = その人の記録のうち `ordinal !== null` で対象の開催回の日付にあるもの。`heldSinceFirst` = 初参加日以降の対象開催回の数(参加なしなら 0)。`streak` = 最新の対象開催回から遡った連続参加数。`recentAttended` = 最新 `CLASS_RULES.recentWindow` 回のうち参加数。`missedSinceLast` = 最終参加日より後の対象開催回の数
  - `export function isClassRegular(s: ClassStats): boolean`(`recentAttended >= regularMin`)
  - `export function isClassDormant(s: ClassStats): boolean`(`attended >= dormantMinTotal && missedSinceLast >= dormantMisses`)
  - `export function isPerfect(s: ClassStats): boolean`(`attended >= perfectMin && attended === heldSinceFirst`)
- `types.ts` の `PersonStats`: `recent` を削除し、`classCounts: Record<ClassKey, number>` を追加
- `metrics.ts` の `computeStats`: クラス別の値は `computeClassStats({..., before: addDays(today, 1)})` で求める。状態は設計書 §14.2 の順(参加しているクラス=`attended > 0` のクラス。それが1つ以上あり、すべて `isClassDormant` → ご無沙汰 / いずれか `isClassRegular` → 常連 / `total <= RULES.newMaxTotal` → 新顔 / それ以外 → 通常)。`total`・`streak`(全体)・節目・次回申込はこれまでどおり
- `notionSync.ts` の `personProperties`: `直近8回` を書かない。代わりに `初中級(火)`・`中級以上(木)` に `classCounts` を書く

テスト:
- classStats.test.ts(架空の人・火木の開催回を作る): 皆勤(4回中4回で `isPerfect`)、休止期間(木曜の開催がない期間)をまたいでも `missedSinceLast` が増えないこと、火曜だけの人の木曜 `attended === 0`、中止回を数えないこと、`before` 当日を含まないこと、`isClassDormant` の境界(3回・4回あき)
- metrics.test.ts: 火曜だけ皆勤の人が「常連」になる(旧基準では8回中4回で「常連」でも「通常」でもあり得た例)/ 木曜が休止中の木曜常連が「ご無沙汰」にならない / 火木両方の人で火曜ご無沙汰・木曜常連なら「常連」/ その他の回だけの人は新顔か通常 / `classCounts` の値
- notionSync.test.ts: 人の行に `初中級(火)`・`中級以上(木)` が入り、`直近8回` を書かない

コミット: `feat: 早朝の常連判定を火曜と木曜のクラス別にする`

### Task 17: LINE の所見とクラス表示

**Files:** Create `scripts/early-morning/lineNotes.ts`, `scripts/early-morning/lineNotes.test.ts`。Modify `lineMessage.ts`, `lineMessage.test.ts`, `sync.ts`, `sync.test.ts`

**Interfaces:**
- `lineNotes.ts`: `export function buildLineNotes(input: { session: Session; records: readonly AttendanceRecord[]; sessions: readonly Session[] }): Map<string, string>` — 翌日の回 `session` に「申込」で `ordinal !== null` の人ごとに所見を返す(キーは人キー)。所見は `session.date` を含まない過去のデータだけで作る
- `lineMessage.ts`: `LineEntry` に `note: string` を追加。`selectLineEntries(session, records, people, notes: ReadonlyMap<string, string>)`(該当なしは `""`)。`buildFlexMessage` の入力に `classLabel: string | null` を追加し、見出し2行目を `${day} ${start}` + (`classLabel` があれば ` ${classLabel}`)にする。各行の下に `note` が空でなければ `{ type: "text", text: note, size: "xs", color: "#8A8A8A", wrap: true, margin: "none" }` を出す
- `sync.ts`: `buildLineNotes` の結果を `selectLineEntries` に渡し、`classLabel` は `next.classType === "その他" ? null : next.classType`

所見の文言(設計書 §14.4。C=その回のクラス、W=`CLASS_WEEKDAY_LABEL[C]`、s=C の `computeClassStats(before: session.date)`、o=もう一方のクラスの同じ値。日付は `formatMonthDay`):
1. `ordinal === 1` → `初めての方。声かけをお願いします`(これだけ)
2. `ordinal === 2` → `2回目（前回 ${M/D} が初参加）`(M/D=その人の全体の初参加日。これだけ)
3. `session.classType === "その他"` → `""`
4. 1つ目: `s.attended === 0` → `${W}曜は初参加` / `isPerfect(s)` → `${W}曜 皆勤（${s.firstDate}から${s.attended}回連続）` / `isClassDormant(s)` → `久しぶり（${W}曜は${s.lastDate}以来）` / それ以外 → `${W}曜 ${s.heldSinceFirst}回中${s.attended}回`
5. 2つ目(1つ目が「初参加」「皆勤」「久しぶり」以外のときの連続は最優先): `s.streak >= 3` かつ皆勤でない → `${s.streak}回連続` / それ以外で `isClassRegular(o)` → `${Wo}曜も常連` / それ以外で `s.lastDate` があり `daysBetween(s.lastDate, session.date) >= NOTE_LONG_GAP_DAYS` かつ久しぶりでない → `前回 ${s.lastDate}`
6. 1つ目と2つ目を `・` でつなぐ(2つ目がなければ1つ目だけ)

lineNotes.test.ts(架空の人。2026-06〜10 の火木の開催回を組み、木曜は 9 月を休止にする):
- 1回目 → `初めての方。声かけをお願いします`
- 2回目 → `2回目（前回 9/22 が初参加）`
- 火曜皆勤の人の火曜回 → `火曜 皆勤（8/4から8回連続）`
- 木曜 12回中11回・7回連続(休止前)の人の木曜再開回 → `木曜 12回中11回・7回連続`
- 木曜 11回中6回・前回 8/20 の人の 10/1 → `木曜 11回中6回・前回 8/20`
- 火曜 11回中8回・木曜常連の人の火曜回 → `火曜 11回中8回・木曜も常連`
- 火曜に初めて来る木曜常連 → `火曜は初参加・木曜も常連`
- 火曜で3回参加後4回あいた人 → `久しぶり（火曜は M/D以来）`
- その他の回 → `""`
lineMessage.test.ts: 所見の行が出る/空なら出ない、見出しに `初中級` が付く/`classLabel: null` なら付かない
sync.test.ts: 橋渡しの flex に所見とクラスが入る(既存の期待値は必要な箇所だけ更新)

コミット: `feat: 早朝の前夜通知に参加者ごとの所見とクラスを出す`

### Task 18: Notion の列の更新と実データでの再確認(コントローラ)

1. Notion コネクタで ③ 早朝開催回に `クラス`(select: 初中級・中級以上・その他)、① 早朝常連に `初中級(火)`・`中級以上(木)`(number)を追加し、① の `直近8回` を削除する
2. worktree で `npm run early:sync` を2回実行(2回目は作成0・アーカイブ0、更新は所見・列追加に伴う初回差分のみで、その次は0)
3. 主催者の人の行(識別子 `tb:{organizer.id}`)は計算対象から外れて古い値のまま残るので、1回だけアーカイブする(参加記録は自動で「元データになし」になる)
4. 次回回の flex を文字にしてオーナーに見せ、了解後に Task 12 Step 5(試し送信)へ
