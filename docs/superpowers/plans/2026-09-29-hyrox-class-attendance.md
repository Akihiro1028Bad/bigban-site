# HYROX DAISUKE CLASS 参加者通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予約台帳から DAISUKE CLASS の参加を人単位で集計して Notion に貯め、開催日の 9:00 にコーチ入りの LINE グループへ当日の参加者・通算の何回目・所見を送る。

**Architecture:** Mac のローカルルーチンが 08:30 に `npm run hyrox:sync` を実行する。スクリプトは Notion API で予約台帳(10列)を読み、イベント名で DAISUKE CLASS を抽出・クラス判定し、氏名(と別名)で名寄せして回数・状態・利用歴・所見を決定的に計算し、Notion の3 DB へ差分書き込みし、橋渡しページに当日の Flex JSON を置く。クラウドルーチンは 09:00 に橋渡しページを読み、今日が開催日ならそのまま LINE に push する。Notion クライアント・日付・氏名正規化・橋渡しの読み書きは `scripts/early-morning/` から直接 import する。

**Tech Stack:** TypeScript(tsx 実行)、Vitest 4 + istanbul(カバレッジ100%)、zod 4、Notion REST API(2022-06-28)、LINE Messaging API(push)、Claude ローカル定期タスク + claude.ai クラウドルーチン。

**Spec:** `docs/superpowers/specs/2026-09-29-hyrox-class-attendance-design.md`(以下「設計書」)。

## Global Constraints

- **前提**: `feature/early-morning-repeaters` が develop にマージ済みであること。Task 1 の最初に確認し、未マージなら作業を始めずに止まって報告する
- DAISUKE CLASS の判定: `予約種別 = イベント` かつ イベント名に `DAISUKE` を含む(大文字小文字を区別しない)。料金プランの文言は使わない
- クラス: イベント名に `ビギナー` → ビギナー、`ダブルス` → ダブルス、それ以外 → 通常(この順)
- 開催回は `利用日 + 開始時刻(時間帯の先頭5文字)`。キーは `YYYY-MM-DD_HH:MM`。参加記録のキーは `{開催回キー}_{人キー}`。人キーは `lb:{正規化氏名}`
- 利用歴の分類はイベント名で行い、コートはスペース予約の分類にだけ使う(ミニシミュレーション・ピクロックスがピックルのコートで記帳されているため)
- テスト予約 `#3`・`#16` は集計のすべてから除外する(`config.ts` の `EXCLUDED_RESERVATION_NOS`)
- 判定基準: 新顔=通算1〜2回(0回も新顔)、常連=直近28日に3回以上、ご無沙汰=通算3回以上かつ最終参加から28日以上。優先順 ご無沙汰 > 常連 > 新顔 > 通常。「直近28日」は `daysBetween(参加日, 今日) < 28`
- 所見は設計書 §11 の6ルールを上から順に適用し、その回より前の参加(同じ日の前の回を含む)だけで決める。AI は使わない
- 個人名はリポジトリ(コード・テスト・ログ・コミット・PR)に残さない。テストは架空の名前(「架空一郎」等)だけを使う。標準出力は件数のみ
- 予約台帳からは10列(`予約番号 / 予約者 / 利用日 / 時間帯 / ステータス / 受付日時 / コート / 予約種別 / イベント名 / 会員番号`)だけを `filter_properties` で取得する。電話番号・メール・住所・生年月日は取得しない。会員番号は名寄せ(同じ番号は同じ人)にだけ使い、Notion には書かない(2026-09-30 オーナー決定・Task M1 で追加。以降の9列の記述は10列に読み替える)
- スタッフ入力列(① 別名・メモ、② 出欠)をルーチンは上書きしない。例外は3つだけ: 統合時のメモの空欄補完、統合時の別名の追記(統合元の別名を統合先の別名列へ足す。2026-09-30 オーナー決定)、欠席の書き写し(どれも値を消さない)
- `scripts/early-morning/` のファイルは import するだけで、変更しない
- TypeScript: `strict`、`any` 禁止、型のみの import は `import type`、`@ts-ignore` 禁止
- テストは `// @vitest-environment node` を先頭に置く。Notion を使うテストは偽物で置き換える: Task 2 は台帳の読み取り専用の小さな偽物(テストファイル内)、Task 9 以降は `scripts/hyrox-class/fixtures/fakeNotion.ts`(MSW は使わない。2026-09-29 オーナー判断、早朝と同じ)
- カバレッジ 100%(statements/branches/functions/lines)。CLI 入口 `scripts/hyrox-class/hyrox-sync.ts` だけ除外し、`docs/testing/growth-coverage-alternatives.{json,md}` に登録する
- コミットメッセージは日本語・Conventional Commits・末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。`git commit -n` は使わない(フックが誤検知する)
- push と PR 作成はオーナーの動作確認のあと。push は AI アカウント `ttmakhr1028ai-art` のトークンを明示指定する
- 作業場所は worktree `/Users/tsutsumi.akihiro/dev/bigban-hyrox-class`(ブランチ `feature/hyrox-class-attendance`)
- テストの実行: `npx vitest run <ファイル>`。PR の区切りでは `npx vitest run --coverage`、`npx tsc --noEmit`、`npm run lint` がすべて通ること

## ファイル構成

| ファイル | 責務 |
|---|---|
| `scripts/hyrox-class/types.ts` | 型(台帳の行・開催回・参加記録・人・集計値・別名) |
| `scripts/hyrox-class/config.ts` | 判定基準とパターン(ここだけ直せば基準が変わる) |
| `scripts/hyrox-class/classify.ts` | イベント名からの判定(DAISUKE か・クラス・利用歴の分類・短縮名) |
| `scripts/hyrox-class/ledger.ts` | 予約台帳の読み取り(10列・テスト予約除外) |
| `scripts/hyrox-class/identity.ts` | 人・開催回・参加記録のキー、別名による名寄せ |
| `scripts/hyrox-class/attendance.ts` | 台帳の行 → 開催回・参加記録(回次)・人 |
| `scripts/hyrox-class/metrics.ts` | 参加の判定、状態、週連続、人ごとの集計 |
| `scripts/hyrox-class/history.ts` | 利用歴の索引と要約 |
| `scripts/hyrox-class/lineNotes.ts` | 所見の6ルール |
| `scripts/hyrox-class/lineMessage.ts` | LINE Flex の組み立て |
| `scripts/hyrox-class/notionSync.ts` | Notion 3 DB の読み取りと差分書き込み |
| `scripts/hyrox-class/sync.ts` | 1回分の実行(失敗時は橋渡しを失敗にする) |
| `scripts/hyrox-class/notionIds.ts` | Notion の ID |
| `scripts/hyrox-class/hyrox-sync.ts` | CLI 入口(テスト対象外) |
| `scripts/hyrox-class/fixtures/notionProps.ts` | テスト用: Notion の読み取り形のプロパティと台帳ページの組み立て(Task 2) |
| `scripts/hyrox-class/fixtures/fakeNotion.ts` | テスト用: Notion の偽物(Task 9) |
| `docs/growth/routines/hyrox-class-notify.md` | クラウドルーチンのプロンプト(正本) |

PR の区切り(設計書 §16): **PR (a)** = Task 1〜7、**PR (b)** = Task 8〜11、**PR (c)** = Task 12〜13。

---

### Task 1: 型・設定・イベント名からの判定

**Files:**
- Create: `scripts/hyrox-class/types.ts`
- Create: `scripts/hyrox-class/config.ts`
- Create: `scripts/hyrox-class/classify.ts`
- Test: `scripts/hyrox-class/classify.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `types.ts`: `ClassType`, `ReservationKind`, `LedgerRow`, `Session`, `RecordStatus`, `ClassRecord`, `Person`, `PersonState`, `PersonStats`, `AliasLink`(下のコードのとおり)
  - `config.ts`: `DAISUKE_PATTERN`, `HYROX_EVENT_PATTERN`, `HYROX_SHORT_NAMES`, `HYROX_EVENT_FALLBACK`, `HYROX_COURT`, `PICKLE_COURTS`, `EXCLUDED_RESERVATION_NOS`, `RULES`, `CLASS_ORDER`, `CLASS_HEADINGS`, `CLASS_NOTE_LABELS`
  - `classify.ts`: `isDaisuke(eventName: string): boolean` / `classOf(eventName: string): ClassType` / `shortEventName(eventName: string): string` / `historyCategoryOf(row: LedgerRow): HistoryCategory | null` / `type HistoryCategory`

- [ ] **Step 1: 前提の確認**

```bash
cd /Users/tsutsumi.akihiro/dev/bigban-hyrox-class
git status --short
git fetch origin
git rebase origin/develop
ls scripts/early-morning/notionClient.ts scripts/early-morning/notionProps.ts scripts/early-morning/identity.ts scripts/early-morning/dates.ts scripts/early-morning/notionSync.ts scripts/early-morning/lineMessage.ts
grep -hoE "export (async )?(function|class|const|interface|type) (createNotionClient|NotionClient|NotionBlock|NotionPage|prop|readPlainText|readSelect|readDate|readCheckbox|normalizeName|jstDate|jstDateTime|addDays|daysBetween|formatMonthDay|formatMonthDayWeekday|formatMonthDayTime|formatStartTime|hashOf|readBridge|writeBridge|markBridgeFailed|WriteCounts|FlexMessage)\b" scripts/early-morning/*.ts | sort -u | wc -l
npm ci
```

Expected:
- `git status --short` が何も出さない(出たら rebase の前に止まって報告する)
- 6ファイルがすべて表示される。1つでも `No such file` なら早朝がまだマージされていない。作業を止めてコントローラーに報告する
- `grep … | wc -l` が `24`(この計画が使う早朝側の export がすべてある)。24 未満なら、どれが無いかを `grep` の出力で確かめ、止まって報告する(早朝側で名前や形が変わっている)

- [ ] **Step 2: 型と設定を書く(テスト対象の土台。ロジックなし)**

`scripts/hyrox-class/types.ts`:

```ts
/** HYROX DAISUKE CLASS 参加者集計の型。 */

/** DAISUKE CLASS のクラス。イベント名から判定する。 */
export type ClassType = "ビギナー" | "通常" | "ダブルス";

/** 予約台帳の予約種別。 */
export type ReservationKind = "イベント" | "スペース";

/** 予約台帳の1行(読む9列から必要なものだけ)。 */
export interface LedgerRow {
  reservationNo: string;
  name: string;
  /** JST の YYYY-MM-DD。 */
  date: string;
  /** 開始時刻 HH:MM。 */
  startTime: string;
  isCancelled: boolean;
  court: string | null;
  kind: ReservationKind;
  /** スペース予約・記帳漏れは空文字。 */
  eventName: string;
}

/** 開催回。キーは `{開催日}_{開始時刻}`。 */
export interface Session {
  key: string;
  date: string;
  startTime: string;
  classType: ClassType;
  eventName: string;
}

export type RecordStatus = "申込" | "キャンセル";

/** 参加記録(1人×1回)。キーは `{開催日}_{開始時刻}_{人キー}`。 */
export interface ClassRecord {
  key: string;
  sessionKey: string;
  date: string;
  startTime: string;
  classType: ClassType;
  personKey: string;
  reservationNos: string[];
  status: RecordStatus;
  /** 通算の何回目か。キャンセル・欠席は null。 */
  ordinal: number | null;
}

export interface Person {
  key: string;
  displayName: string;
}

export type PersonState = "新顔" | "常連" | "ご無沙汰" | "通常";

export interface PersonStats {
  key: string;
  displayName: string;
  total: number;
  classCounts: Record<ClassType, number>;
  firstDate: string | null;
  lastDate: string | null;
  state: PersonState;
  isNextApplied: boolean;
  /** 利用歴の要約(設計書 §8)。なければ空文字。 */
  history: string;
}

/** ① 参加者の「別名」列(スタッフ入力)。 */
export interface AliasLink {
  personKey: string;
  alias: string;
}
```

`scripts/hyrox-class/config.ts`:

```ts
/** HYROX DAISUKE CLASS 集計の固定値。判定基準を変えるときはこのファイルだけを直す。 */
import type { ClassType } from "./types";

export const DAISUKE_PATTERN = /daisuke/iu;
/** 利用歴で HYROX 系イベントとみなすイベント名。コートでは判定しない(ピックルのコートで記帳された HYROX イベントがある)。 */
export const HYROX_EVENT_PATTERN = /hyrox|ハイロックス|ピクロックス/iu;
/** 利用歴の短縮名。上から順に、最初に含まれていた語を使う。 */
export const HYROX_SHORT_NAMES = ["体験会", "モーニングクラス", "ミニシミュレーション", "ピクロックス"] as const;
export const HYROX_EVENT_FALLBACK = "HYROXイベント";
export const HYROX_COURT = "HYROX";
export const PICKLE_COURTS: readonly string[] = ["A:アルテミス", "B:ビックバン", "C:コメット"];
/** テスト予約(2026-09-29 のイベント名の埋め戻しで確認)。集計のすべてから除外する。 */
export const EXCLUDED_RESERVATION_NOS: readonly string[] = ["#3", "#16"];

export const RULES = {
  newMaxTotal: 2,
  recentDays: 28,
  regularMin: 3,
  dormantDays: 28,
  dormantMinTotal: 3,
  streakMinWeeks: 2,
} as const;

/** クラスの並び。回数が同じときの優先順にも使う。 */
export const CLASS_ORDER: readonly ClassType[] = ["ビギナー", "通常", "ダブルス"];
/** LINE の回見出しのクラス名。 */
export const CLASS_HEADINGS: Readonly<Record<ClassType, string>> = { ビギナー: "ビギナーの部", 通常: "通常", ダブルス: "ダブルス" };
/** 所見の文中のクラス名。 */
export const CLASS_NOTE_LABELS: Readonly<Record<ClassType, string>> = { ビギナー: "ビギナー", 通常: "通常回", ダブルス: "ダブルス" };
```

- [ ] **Step 3: 失敗するテストを書く**

`scripts/hyrox-class/classify.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { classOf, historyCategoryOf, isDaisuke, shortEventName } from "./classify";
import type { LedgerRow } from "./types";

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    reservationNo: "#100",
    name: "架空一郎",
    date: "2026-09-30",
    startTime: "20:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    eventName: "HYROX TRAINING @ DAISUKE CLASS",
    ...overrides,
  };
}

describe("isDaisuke", () => {
  it.each([
    ["HYROX TRAINING @ DAISUKE CLASS", true],
    ["DAISUKE class（経験者）", true],
    ["HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）", false],
    ["", false],
  ])("%s → %s", (name, expected) => {
    expect(isDaisuke(name)).toBe(expected);
  });
});

describe("classOf", () => {
  it.each([
    ["HYROX TRAINING @ DAISUKE CLASS　ビギナーの部", "ビギナー"],
    ["DAISUKE class（ビギナー）", "ビギナー"],
    ["HYROX TRAINING @ DAISUKE CLASS ダブルスクラス", "ダブルス"],
    ["DAISUKE class（経験者）", "通常"],
    ["HYROX TRAINING @ DAISUKE CLASS", "通常"],
  ])("%s → %s", (name, expected) => {
    expect(classOf(name)).toBe(expected);
  });
});

describe("shortEventName", () => {
  it.each([
    ["HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）", "体験会"],
    ["HYROX TRAINING｜モーニングクラス（経験者向け）", "モーニングクラス"],
    ["HYROX ミニシミュレーション（本番の半分の距離で8種目）", "ミニシミュレーション"],
    ["ピクロックス（ピックルボール体験×HYROX体験）", "ピクロックス"],
    ["ハイロックスクラス", "HYROXイベント"],
  ])("%s → %s", (name, expected) => {
    expect(shortEventName(name)).toBe(expected);
  });
});

describe("historyCategoryOf", () => {
  it("DAISUKE CLASS とイベント名が空のイベントは数えない", () => {
    expect(historyCategoryOf(row())).toBeNull();
    expect(historyCategoryOf(row({ eventName: "" }))).toBeNull();
  });

  it("ピックルのコートで記帳された HYROX イベントも HYROX 系にする", () => {
    expect(
      historyCategoryOf(row({ court: "A:アルテミス", eventName: "HYROX ミニシミュレーション（アーリーアクセスコード付き）" })),
    ).toEqual({ kind: "HYROXイベント", shortName: "ミニシミュレーション" });
    expect(historyCategoryOf(row({ court: "B:ビックバン", eventName: "ピクロックス（ピックルボール体験×HYROX体験）" }))).toEqual({
      kind: "HYROXイベント",
      shortName: "ピクロックス",
    });
  });

  it("HYROX を含まないイベントはピックル", () => {
    expect(historyCategoryOf(row({ court: "A:アルテミス", eventName: "早朝ピックルボール（初中級）" }))).toEqual({ kind: "ピックル" });
  });

  it("スペース予約は HYROX エリアなら貸切、A/B/C ならピックル、それ以外は数えない", () => {
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "" }))).toEqual({ kind: "HYROXエリア貸切" });
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: "C:コメット" }))).toEqual({ kind: "ピックル" });
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: "その他" }))).toBeNull();
    expect(historyCategoryOf(row({ kind: "スペース", eventName: "", court: null }))).toBeNull();
  });
});
```

- [ ] **Step 4: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/classify.test.ts`
Expected: FAIL(`Failed to resolve import "./classify"`)

- [ ] **Step 5: 最小の実装を書く**

`scripts/hyrox-class/classify.ts`:

```ts
/** イベント名からの判定(DAISUKE CLASS かどうか・クラス・利用歴の分類)。 */
import {
  DAISUKE_PATTERN,
  HYROX_COURT,
  HYROX_EVENT_FALLBACK,
  HYROX_EVENT_PATTERN,
  HYROX_SHORT_NAMES,
  PICKLE_COURTS,
} from "./config";
import type { ClassType, LedgerRow } from "./types";

export type HistoryCategory =
  | { kind: "HYROXイベント"; shortName: string }
  | { kind: "HYROXエリア貸切" }
  | { kind: "ピックル" };

export function isDaisuke(eventName: string): boolean {
  return DAISUKE_PATTERN.test(eventName);
}

export function classOf(eventName: string): ClassType {
  if (eventName.includes("ビギナー")) return "ビギナー";
  if (eventName.includes("ダブルス")) return "ダブルス";
  return "通常";
}

export function shortEventName(eventName: string): string {
  return HYROX_SHORT_NAMES.find((name) => eventName.includes(name)) ?? HYROX_EVENT_FALLBACK;
}

/** 利用歴の分類。DAISUKE CLASS・イベント名が空のイベント・分類できないスペースは null。 */
export function historyCategoryOf(row: LedgerRow): HistoryCategory | null {
  if (row.kind === "イベント") {
    if (row.eventName === "" || isDaisuke(row.eventName)) return null;
    return HYROX_EVENT_PATTERN.test(row.eventName)
      ? { kind: "HYROXイベント", shortName: shortEventName(row.eventName) }
      : { kind: "ピックル" };
  }
  if (row.court === HYROX_COURT) return { kind: "HYROXエリア貸切" };
  return row.court !== null && PICKLE_COURTS.includes(row.court) ? { kind: "ピックル" } : null;
}
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/classify.test.ts`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add scripts/hyrox-class/types.ts scripts/hyrox-class/config.ts scripts/hyrox-class/classify.ts scripts/hyrox-class/classify.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス集計の型とイベント名からの判定を追加する

料金プランの文言は回ごとに揺れるため、台帳のイベント名で DAISUKE CLASS と
クラスを判定する。利用歴もコートではなくイベント名で分類する。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 予約台帳の読み取り

**Files:**
- Create: `scripts/hyrox-class/fixtures/notionProps.ts`
- Create: `scripts/hyrox-class/ledger.ts`
- Test: `scripts/hyrox-class/ledger.test.ts`

**Interfaces:**
- Consumes: `LedgerRow`(Task 1)、`EXCLUDED_RESERVATION_NOS`(Task 1)、`NotionClient`(`scripts/early-morning/notionClient.ts`)、`NotionPage` / `readDate` / `readPlainText` / `readSelect`(`scripts/early-morning/notionProps.ts`)
- Produces:
  - `ledger.ts`: `LEDGER_COLUMNS`(9列の readonly tuple)/ `toLedgerRow(page: NotionPage): LedgerRow | null` / `fetchLedgerRows(client: NotionClient, ledgerDbId: string): Promise<{ rows: LedgerRow[]; skipped: number }>`
  - `fixtures/notionProps.ts`(テスト用): `text(v: string)` / `title(v: string)` / `select(v: string | null)` / `interface LedgerPageInput` / `ledgerProps(input?: LedgerPageInput): Record<string, unknown>`

- [ ] **Step 1: テスト用のプロパティ組み立てを書く(Task 9・10 でも使う)**

`scripts/hyrox-class/fixtures/notionProps.ts`:

```ts
/** テスト用: Notion API が読み取り時に返す形のプロパティを組み立てる。 */
export const text = (value: string) => ({ rich_text: [{ plain_text: value }] });
export const title = (value: string) => ({ title: [{ plain_text: value }] });
export const select = (value: string | null) => ({ select: value === null ? null : { name: value } });

export interface LedgerPageInput {
  no?: string;
  name?: string;
  date?: string | null;
  slot?: string;
  status?: string | null;
  court?: string | null;
  kind?: string | null;
  event?: string;
}

/** 予約台帳の1ページ分のプロパティ。既定は 9/30 20:00 の DAISUKE CLASS の有効な予約。 */
export function ledgerProps(input: LedgerPageInput = {}): Record<string, unknown> {
  const value = {
    no: "#100",
    name: "架空一郎",
    date: "2026-09-30",
    slot: "20:00～21:00",
    status: "有効",
    court: "HYROX",
    kind: "イベント",
    event: "HYROX TRAINING @ DAISUKE CLASS",
    ...input,
  };
  return {
    予約番号: title(value.no),
    予約者: text(value.name),
    利用日: { date: value.date === null ? null : { start: value.date } },
    時間帯: text(value.slot),
    ステータス: select(value.status),
    コート: select(value.court),
    予約種別: select(value.kind),
    イベント名: text(value.event),
  };
}
```

`ledgerProps` の分岐(`date` / `status` / `court` / `kind` が null)は、このタスクのテストがすべて通る。

- [ ] **Step 2: 失敗するテストを書く**

`scripts/hyrox-class/ledger.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionClient } from "../early-morning/notionClient";
import type { NotionPage } from "../early-morning/notionProps";
import { ledgerProps, type LedgerPageInput } from "./fixtures/notionProps";
import { LEDGER_COLUMNS, fetchLedgerRows, toLedgerRow } from "./ledger";

function page(input: LedgerPageInput = {}): NotionPage {
  return { id: "p", properties: ledgerProps(input) };
}

/** 台帳の読み取りに使う2メソッドだけを持つ偽物。列 ID は列名と同じにする。 */
function stubNotion(columns: readonly string[], pages: NotionPage[]) {
  const queries: { db: string; filterPropertyIds: readonly string[] }[] = [];
  const unused = async (): Promise<never> => {
    throw new Error("このテストでは使わない");
  };
  const client: NotionClient = {
    getDatabase: async () => ({ properties: Object.fromEntries(columns.map((name) => [name, { id: name }])) }),
    queryAll: async (db, _body, filterPropertyIds = []) => {
      queries.push({ db, filterPropertyIds });
      return pages;
    },
    createPage: unused,
    updatePage: unused,
    archivePage: unused,
    listChildren: unused,
    deleteBlock: unused,
    appendChildren: unused,
  };
  return { client, queries };
}

describe("toLedgerRow", () => {
  it("読む列から行を作り、開始時刻は時間帯の先頭5文字、前後の空白は除く", () => {
    expect(toLedgerRow(page({ slot: "19:00～19:50", event: " HYROX TRAINING @ DAISUKE CLASS ビギナーの部 " }))).toEqual({
      reservationNo: "#100",
      name: "架空一郎",
      date: "2026-09-30",
      startTime: "19:00",
      isCancelled: false,
      court: "HYROX",
      kind: "イベント",
      eventName: "HYROX TRAINING @ DAISUKE CLASS ビギナーの部",
    });
  });

  it("キャンセルとスペース予約を読む", () => {
    expect(toLedgerRow(page({ status: "キャンセル", kind: "スペース", event: "" }))).toMatchObject({
      isCancelled: true,
      kind: "スペース",
      eventName: "",
    });
  });

  it.each([
    ["予約者が空", { name: " " }],
    ["利用日がない", { date: null }],
    ["時間帯が短い", { slot: "9:0" }],
    ["ステータスがない", { status: null }],
    ["予約種別がない", { kind: null }],
    ["予約種別が想定外", { kind: "その他" }],
  ])("%sなら null", (_label, input) => {
    expect(toLedgerRow(page(input))).toBeNull();
  });
});

describe("fetchLedgerRows", () => {
  it("9列だけを指定して読み、テスト予約を除き、読めない行を数える", async () => {
    const { client, queries } = stubNotion(
      [...LEDGER_COLUMNS, "電話番号"],
      [page({ no: "#100" }), page({ no: "#3" }), page({ no: "#101", name: "" })],
    );

    const result = await fetchLedgerRows(client, "ledger");

    expect(result.rows.map((row) => row.reservationNo)).toEqual(["#100"]);
    expect(result.skipped).toBe(1);
    expect(queries).toEqual([{ db: "ledger", filterPropertyIds: [...LEDGER_COLUMNS] }]);
  });

  it("列が欠けていたら失敗する", async () => {
    const { client } = stubNotion(
      LEDGER_COLUMNS.filter((name) => name !== "イベント名"),
      [],
    );
    await expect(fetchLedgerRows(client, "ledger")).rejects.toThrow("予約台帳に列「イベント名」がありません");
  });
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/ledger.test.ts`
Expected: FAIL(`Failed to resolve import "./ledger"`)

- [ ] **Step 4: 最小の実装を書く**

`scripts/hyrox-class/ledger.ts`:

```ts
/** Notion「Labora 予約台帳」から全予約を読む。連絡先の列は取得しない。 */
import type { NotionClient } from "../early-morning/notionClient";
import { readDate, readPlainText, readSelect, type NotionPage } from "../early-morning/notionProps";
import { EXCLUDED_RESERVATION_NOS } from "./config";
import type { LedgerRow } from "./types";

export const LEDGER_COLUMNS = ["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時", "コート", "予約種別", "イベント名"] as const;

const START_TIME_LENGTH = 5;

export function toLedgerRow(page: NotionPage): LedgerRow | null {
  const name = readPlainText(page, "予約者").trim();
  const date = readDate(page, "利用日");
  const timeSlot = readPlainText(page, "時間帯").trim();
  const status = readSelect(page, "ステータス");
  const kind = readSelect(page, "予約種別");
  if (!name || !date || timeSlot.length < START_TIME_LENGTH || !status) return null;
  if (kind !== "イベント" && kind !== "スペース") return null;
  return {
    reservationNo: readPlainText(page, "予約番号").trim(),
    name,
    date: date.slice(0, 10),
    startTime: timeSlot.slice(0, START_TIME_LENGTH),
    isCancelled: status === "キャンセル",
    court: readSelect(page, "コート"),
    kind,
    eventName: readPlainText(page, "イベント名").trim(),
  };
}

export async function fetchLedgerRows(client: NotionClient, ledgerDbId: string): Promise<{ rows: LedgerRow[]; skipped: number }> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = LEDGER_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const parsed = (await client.queryAll(ledgerDbId, {}, propertyIds)).map(toLedgerRow);
  const rows = parsed.filter((row): row is LedgerRow => row !== null);
  return {
    rows: rows.filter((row) => !EXCLUDED_RESERVATION_NOS.includes(row.reservationNo)),
    skipped: parsed.length - rows.length,
  };
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/ledger.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add scripts/hyrox-class/fixtures/notionProps.ts scripts/hyrox-class/ledger.ts scripts/hyrox-class/ledger.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス集計の予約台帳の読み取りを追加する

連絡先を取得しないよう9列だけを filter_properties で読み、テスト予約を除く。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: キーと別名による名寄せ

> 実装後の fix コミット(owner 決定)で buildAliasMap / absorb / runSync を変更した。最新はコードを正とする。


**Files:**
- Create: `scripts/hyrox-class/identity.ts`
- Test: `scripts/hyrox-class/identity.test.ts`

**Interfaces:**
- Consumes: `AliasLink`(Task 1)、`normalizeName(name: string): string`(`scripts/early-morning/identity.ts`)
- Produces: `personKeyOf(name: string): string` / `splitAliases(text: string): string[]` / `buildAliasMap(links: readonly AliasLink[]): Map<string, string>` / `canonicalPersonKey(personKey: string, aliasMap: ReadonlyMap<string, string>): string` / `resolvePersonKey(name: string, aliasMap: ReadonlyMap<string, string>): string` / `sessionKeyOf(date: string, startTime: string): string` / `recordKeyOf(sessionKey: string, personKey: string): string` / `sessionKeyOfRecordKey(recordKey: string): string` / `personKeyOfRecordKey(recordKey: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/identity.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildAliasMap,
  canonicalPersonKey,
  personKeyOf,
  personKeyOfRecordKey,
  recordKeyOf,
  resolvePersonKey,
  sessionKeyOf,
  sessionKeyOfRecordKey,
  splitAliases,
} from "./identity";

describe("personKeyOf", () => {
  it("全角・半角の空白を除いて正規化した氏名をキーにする", () => {
    expect(personKeyOf("架空　一郎 ")).toBe("lb:架空一郎");
  });
});

describe("splitAliases", () => {
  it("読点・カンマで分け、空白だけの要素を除く", () => {
    expect(splitAliases(" かくう一郎、架空 壱郎,,，")).toEqual(["かくう一郎", "架空 壱郎"]);
  });
});

describe("buildAliasMap / canonicalPersonKey / resolvePersonKey", () => {
  it("別名の人キーを統合先へ向け、自分自身を指す別名は無視する", () => {
    const aliasMap = buildAliasMap([{ personKey: "lb:架空一郎", alias: "かくう一郎、架空　一郎" }]);
    expect([...aliasMap]).toEqual([["lb:かくう一郎", "lb:架空一郎"]]);
    expect(canonicalPersonKey("lb:かくう一郎", aliasMap)).toBe("lb:架空一郎");
    expect(canonicalPersonKey("lb:架空二郎", aliasMap)).toBe("lb:架空二郎");
    expect(resolvePersonKey("かくう 一郎", aliasMap)).toBe("lb:架空一郎");
  });
});

describe("開催回・参加記録のキー", () => {
  it("組み立てて分解できる", () => {
    const sessionKey = sessionKeyOf("2026-09-30", "20:00");
    const key = recordKeyOf(sessionKey, "lb:架空一郎");
    expect(key).toBe("2026-09-30_20:00_lb:架空一郎");
    expect(sessionKeyOfRecordKey(key)).toBe("2026-09-30_20:00");
    expect(personKeyOfRecordKey(key)).toBe("lb:架空一郎");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/identity.test.ts`
Expected: FAIL(`Failed to resolve import "./identity"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/identity.ts`:

```ts
/** 人・開催回・参加記録のキーと、別名による名寄せ。人は正規化した氏名で識別する。 */
import { normalizeName } from "../early-morning/identity";
import type { AliasLink } from "./types";

/** `YYYY-MM-DD_HH:MM` の長さ。 */
const SESSION_KEY_LENGTH = 16;

export function personKeyOf(name: string): string {
  return `lb:${normalizeName(name)}`;
}

export function splitAliases(text: string): string[] {
  return text
    .split(/[,、，]/u)
    .map((alias) => alias.trim())
    .filter((alias) => alias !== "");
}

/** 別名の人キー → 統合先の人キー。自分自身を指す別名は無視する。 */
export function buildAliasMap(links: readonly AliasLink[]): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const link of links) {
    for (const alias of splitAliases(link.alias)) {
      const aliasKey = personKeyOf(alias);
      if (aliasKey !== link.personKey) aliasMap.set(aliasKey, link.personKey);
    }
  }
  return aliasMap;
}

export function canonicalPersonKey(personKey: string, aliasMap: ReadonlyMap<string, string>): string {
  return aliasMap.get(personKey) ?? personKey;
}

export function resolvePersonKey(name: string, aliasMap: ReadonlyMap<string, string>): string {
  return canonicalPersonKey(personKeyOf(name), aliasMap);
}

export function sessionKeyOf(date: string, startTime: string): string {
  return `${date}_${startTime}`;
}

export function recordKeyOf(sessionKey: string, personKey: string): string {
  return `${sessionKey}_${personKey}`;
}

export function sessionKeyOfRecordKey(recordKey: string): string {
  return recordKey.slice(0, SESSION_KEY_LENGTH);
}

export function personKeyOfRecordKey(recordKey: string): string {
  return recordKey.slice(SESSION_KEY_LENGTH + 1);
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/identity.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/hyrox-class/identity.ts scripts/hyrox-class/identity.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス集計のキーと別名による名寄せを追加する

氏名の表記ゆれをスタッフが別名列で統合できるよう、別名の人キーを統合先へ向ける対応表を作る。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 開催回・参加記録・人の組み立て

**Files:**
- Create: `scripts/hyrox-class/attendance.ts`
- Test: `scripts/hyrox-class/attendance.test.ts`

**Interfaces:**
- Consumes: `LedgerRow` / `Session` / `ClassRecord` / `Person`(Task 1)、`isDaisuke` / `classOf`(Task 1)、`sessionKeyOf` / `recordKeyOf` / `resolvePersonKey`(Task 3)
- Produces: `interface Attendance { sessions: Session[]; records: ClassRecord[]; people: Person[]; missingEventName: number }` / `buildAttendance(input: { rows: readonly LedgerRow[]; aliasMap: ReadonlyMap<string, string>; absentKeys: ReadonlySet<string> }): Attendance`。`sessions` と `records` はキーの昇順(= 日時順)。`absentKeys` は統合先の人キーで作った参加記録のキー

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/attendance.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildAttendance } from "./attendance";
import type { LedgerRow } from "./types";

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    reservationNo: "#100",
    name: "架空一郎",
    date: "2026-09-30",
    startTime: "20:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    eventName: "HYROX TRAINING @ DAISUKE CLASS",
    ...overrides,
  };
}

const noAlias = new Map<string, string>();
const noAbsent = new Set<string>();
const BEGINNER = "HYROX TRAINING @ DAISUKE CLASS ビギナーの部";

describe("buildAttendance", () => {
  it("DAISUKE のイベント予約だけから、開始時刻ごとの開催回を作り、イベント名が空の予約を数える", () => {
    const result = buildAttendance({
      rows: [
        row({ reservationNo: "#1", startTime: "19:00", eventName: BEGINNER }),
        row({ reservationNo: "#2", startTime: "20:00" }),
        row({ reservationNo: "#4", startTime: "09:00", eventName: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）" }),
        row({ reservationNo: "#5", kind: "スペース", eventName: "" }),
        row({ reservationNo: "#6", eventName: "" }),
      ],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions).toEqual([
      { key: "2026-09-30_19:00", date: "2026-09-30", startTime: "19:00", classType: "ビギナー", eventName: BEGINNER },
      { key: "2026-09-30_20:00", date: "2026-09-30", startTime: "20:00", classType: "通常", eventName: "HYROX TRAINING @ DAISUKE CLASS" },
    ]);
    expect(result.records.map((record) => record.key)).toEqual(["2026-09-30_19:00_lb:架空一郎", "2026-09-30_20:00_lb:架空一郎"]);
    expect(result.missingEventName).toBe(1);
  });

  it("同じ回の同じ人の予約は1記録にまとめ、有効が1件でもあれば申込にする", () => {
    const result = buildAttendance({
      rows: [row({ reservationNo: "#2" }), row({ reservationNo: "#1", isCancelled: true }), row({ reservationNo: "#3", isCancelled: true })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.records).toEqual([
      {
        key: "2026-09-30_20:00_lb:架空一郎",
        sessionKey: "2026-09-30_20:00",
        date: "2026-09-30",
        startTime: "20:00",
        classType: "通常",
        personKey: "lb:架空一郎",
        reservationNos: ["#1", "#2", "#3"],
        status: "申込",
        ordinal: 1,
      },
    ]);
  });

  it("キャンセルだけの人は回次なしのキャンセル。全員キャンセルの回も開催回に残し、表示名はキャンセルの表記を使う", () => {
    const result = buildAttendance({
      rows: [row({ isCancelled: true, name: "架空 一郎", eventName: "DAISUKE class（経験者）" })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions.map((session) => session.eventName)).toEqual(["DAISUKE class（経験者）"]);
    expect(result.records[0]).toMatchObject({ status: "キャンセル", ordinal: null });
    expect(result.people).toEqual([{ key: "lb:架空一郎", displayName: "架空 一郎" }]);
  });

  it("開催回の代表は有効な予約の行にする", () => {
    const result = buildAttendance({
      rows: [row({ isCancelled: true, eventName: "DAISUKE class（経験者）" }), row({ name: "架空二郎" })],
      aliasMap: noAlias,
      absentKeys: noAbsent,
    });
    expect(result.sessions[0].eventName).toBe("HYROX TRAINING @ DAISUKE CLASS");
  });

  it("回次は日時順に数え、欠席の回は飛ばす", () => {
    const result = buildAttendance({
      rows: [row({ date: "2026-09-30" }), row({ date: "2026-09-23" }), row({ date: "2026-09-25" })],
      aliasMap: noAlias,
      absentKeys: new Set(["2026-09-25_20:00_lb:架空一郎"]),
    });
    expect(result.records.map((record) => [record.date, record.ordinal])).toEqual([
      ["2026-09-23", 1],
      ["2026-09-25", null],
      ["2026-09-30", 2],
    ]);
  });

  it("別名は統合先の人に寄せ、表示名は最新の有効な予約の表記にする", () => {
    const result = buildAttendance({
      rows: [
        row({ reservationNo: "#1", date: "2026-09-23", name: "かくう一郎" }),
        row({ reservationNo: "#2", date: "2026-09-30", name: "架空　一郎" }),
        row({ reservationNo: "#3", date: "2026-10-02", name: "架空一郎", isCancelled: true }),
      ],
      aliasMap: new Map([["lb:かくう一郎", "lb:架空一郎"]]),
      absentKeys: noAbsent,
    });
    expect(result.people).toEqual([{ key: "lb:架空一郎", displayName: "架空　一郎" }]);
    expect(result.records.map((record) => [record.personKey, record.ordinal])).toEqual([
      ["lb:架空一郎", 1],
      ["lb:架空一郎", 2],
      ["lb:架空一郎", null],
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/attendance.test.ts`
Expected: FAIL(`Failed to resolve import "./attendance"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/attendance.ts`:

```ts
/** 台帳の行から DAISUKE CLASS の開催回・参加記録・人を組み立てる。 */
import { classOf, isDaisuke } from "./classify";
import { recordKeyOf, resolvePersonKey, sessionKeyOf } from "./identity";
import type { ClassRecord, LedgerRow, Person, Session } from "./types";

export interface Attendance {
  sessions: Session[];
  records: ClassRecord[];
  people: Person[];
  /** イベント名が空のイベント予約の数(集計の対象外)。 */
  missingEventName: number;
}

function timeOf(row: LedgerRow): string {
  return sessionKeyOf(row.date, row.startTime);
}

function buildSessions(rows: readonly LedgerRow[]): Session[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) groups.set(timeOf(row), [...(groups.get(timeOf(row)) ?? []), row]);
  return [...groups.entries()]
    .map(([key, group]) => {
      const representative = group.find((row) => !row.isCancelled) ?? group[0];
      return {
        key,
        date: representative.date,
        startTime: representative.startTime,
        classType: classOf(representative.eventName),
        eventName: representative.eventName,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function groupRecords(rows: readonly LedgerRow[], sessions: readonly Session[], aliasMap: ReadonlyMap<string, string>): ClassRecord[] {
  const sessionByKey = new Map(sessions.map((session) => [session.key, session]));
  const byKey = new Map<string, ClassRecord>();
  for (const row of rows) {
    const session = sessionByKey.get(timeOf(row)) as Session;
    const personKey = resolvePersonKey(row.name, aliasMap);
    const key = recordKeyOf(session.key, personKey);
    const current = byKey.get(key);
    byKey.set(key, {
      key,
      sessionKey: session.key,
      date: session.date,
      startTime: session.startTime,
      classType: session.classType,
      personKey,
      reservationNos: [...(current?.reservationNos ?? []), row.reservationNo].sort(),
      status: !row.isCancelled || current?.status === "申込" ? "申込" : "キャンセル",
      ordinal: null,
    });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function assignOrdinals(records: readonly ClassRecord[], absentKeys: ReadonlySet<string>): ClassRecord[] {
  const counts = new Map<string, number>();
  return records.map((record) => {
    if (record.status !== "申込" || absentKeys.has(record.key)) return record;
    const ordinal = (counts.get(record.personKey) ?? 0) + 1;
    counts.set(record.personKey, ordinal);
    return { ...record, ordinal };
  });
}

/** 表示名は最新の有効な予約の表記。有効な予約がなければ最新の予約の表記。 */
function buildPeople(rows: readonly LedgerRow[], aliasMap: ReadonlyMap<string, string>): Person[] {
  const latest = new Map<string, LedgerRow>();
  for (const row of [...rows].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))) {
    const key = resolvePersonKey(row.name, aliasMap);
    if (!row.isCancelled || !latest.has(key)) latest.set(key, row);
  }
  return [...latest.entries()]
    .map(([key, row]) => ({ key, displayName: row.name }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function buildAttendance(input: {
  rows: readonly LedgerRow[];
  aliasMap: ReadonlyMap<string, string>;
  absentKeys: ReadonlySet<string>;
}): Attendance {
  const events = input.rows.filter((row) => row.kind === "イベント");
  const daisuke = events.filter((row) => isDaisuke(row.eventName));
  const sessions = buildSessions(daisuke);
  return {
    sessions,
    records: assignOrdinals(groupRecords(daisuke, sessions, input.aliasMap), input.absentKeys),
    people: buildPeople(daisuke, input.aliasMap),
    missingEventName: events.filter((row) => row.eventName === "").length,
  };
}
```

注意: `buildPeople` は「キャンセルだけの人」のテストで `!latest.has(key)` 側、「別名」のテストで「有効の後のキャンセルを採らない」側を通る。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/attendance.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/hyrox-class/attendance.ts scripts/hyrox-class/attendance.test.ts
git commit -F - <<'EOF'
feat: HYROX クラスの開催回・参加記録・人を台帳から組み立てる

同じ回の重複予約は1記録にまとめ、回次は日時順に数えて欠席の回を飛ばす。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---
### Task 5: 状態・週連続・人ごとの集計

**Files:**
- Create: `scripts/hyrox-class/metrics.ts`
- Test: `scripts/hyrox-class/metrics.test.ts`

**Interfaces:**
- Consumes: `ClassRecord` / `ClassType` / `Person` / `PersonState` / `PersonStats`(Task 1)、`RULES`(Task 1)、`addDays` / `daysBetween`(`scripts/early-morning/dates.ts`)
- Produces: `isParticipation(record: ClassRecord): boolean`(申込かつ回次あり)/ `stateOf(past: readonly ClassRecord[], today: string): PersonState` / `mondayOf(date: string): string` / `weekStreak(dates: readonly string[], today: string): number` / `countByClass(records: readonly ClassRecord[]): Record<ClassType, number>` / `computeStats(input: { people: readonly Person[]; records: readonly ClassRecord[]; today: string; historyByPerson: ReadonlyMap<string, string> }): PersonStats[]`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/metrics.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeStats, countByClass, isParticipation, mondayOf, stateOf, weekStreak } from "./metrics";
import type { ClassRecord } from "./types";

function rec(date: string, overrides: Partial<ClassRecord> = {}): ClassRecord {
  const sessionKey = `${date}_20:00`;
  return {
    key: `${sessionKey}_lb:架空一郎`,
    sessionKey,
    date,
    startTime: "20:00",
    classType: "通常",
    personKey: "lb:架空一郎",
    reservationNos: ["#1"],
    status: "申込",
    ordinal: 1,
    ...overrides,
  };
}

const today = "2026-10-07";

describe("isParticipation", () => {
  it("申込で回次があるものだけを参加とみなす", () => {
    expect(isParticipation(rec(today))).toBe(true);
    expect(isParticipation(rec(today, { ordinal: null }))).toBe(false);
    expect(isParticipation(rec(today, { status: "キャンセル", ordinal: null }))).toBe(false);
  });
});

describe("stateOf", () => {
  it("通算3回以上で最終参加から28日以上ならご無沙汰", () => {
    expect(stateOf([rec("2026-08-01"), rec("2026-08-05"), rec("2026-09-09")], today)).toBe("ご無沙汰");
  });

  it("最終参加から27日ならご無沙汰にせず、直近28日の回数で判定する", () => {
    expect(stateOf([rec("2026-08-01"), rec("2026-08-05"), rec("2026-09-10")], today)).toBe("通常");
  });

  it("直近28日に3回以上で常連", () => {
    expect(stateOf([rec("2026-09-10"), rec("2026-09-20"), rec(today)], today)).toBe("常連");
  });

  it("通算2回以下は新顔(0回も新顔)", () => {
    expect(stateOf([rec("2026-10-01")], today)).toBe("新顔");
    expect(stateOf([], today)).toBe("新顔");
  });
});

describe("mondayOf", () => {
  it.each([
    ["2026-10-07", "2026-10-05"],
    ["2026-10-05", "2026-10-05"],
    ["2026-10-04", "2026-09-28"],
  ])("%s の週の月曜は %s", (date, monday) => {
    expect(mondayOf(date)).toBe(monday);
  });
});

describe("weekStreak", () => {
  it("今週を含めず、先週から遡って参加のある週が続いた数", () => {
    expect(weekStreak(["2026-09-09", "2026-09-25", "2026-09-30"], today)).toBe(2);
  });

  it("先週に参加がなければ 0(今週の参加は数えない)", () => {
    expect(weekStreak(["2026-10-05", "2026-09-23"], today)).toBe(0);
  });
});

describe("countByClass", () => {
  it("クラスごとに数える", () => {
    expect(countByClass([rec(today, { classType: "ビギナー" }), rec(today), rec(today)])).toEqual({ ビギナー: 1, 通常: 2, ダブルス: 0 });
  });
});

describe("computeStats", () => {
  it("今日までの参加で集計し、今日以降の申込で次回申込にし、利用歴を添える", () => {
    const people = [
      { key: "lb:架空一郎", displayName: "架空一郎" },
      { key: "lb:架空二郎", displayName: "架空二郎" },
    ];
    const records = [
      rec("2026-09-23", { classType: "ビギナー", ordinal: 1 }),
      rec("2026-09-30", { ordinal: 2 }),
      rec("2026-10-02", { status: "キャンセル", ordinal: null }),
      rec("2026-10-09", { ordinal: 3 }),
      rec("2026-09-30", { key: "2026-09-30_20:00_lb:架空二郎", personKey: "lb:架空二郎", status: "キャンセル", ordinal: null }),
    ];

    const stats = computeStats({ people, records, today, historyByPerson: new Map([["lb:架空一郎", "体験会(9/22)"]]) });

    expect(stats).toEqual([
      {
        key: "lb:架空一郎",
        displayName: "架空一郎",
        total: 2,
        classCounts: { ビギナー: 1, 通常: 1, ダブルス: 0 },
        firstDate: "2026-09-23",
        lastDate: "2026-09-30",
        state: "新顔",
        isNextApplied: true,
        history: "体験会(9/22)",
      },
      {
        key: "lb:架空二郎",
        displayName: "架空二郎",
        total: 0,
        classCounts: { ビギナー: 0, 通常: 0, ダブルス: 0 },
        firstDate: null,
        lastDate: null,
        state: "新顔",
        isNextApplied: false,
        history: "",
      },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/metrics.test.ts`
Expected: FAIL(`Failed to resolve import "./metrics"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/metrics.ts`:

```ts
/** 参加の判定・状態・週連続・人ごとの集計。基準は config.ts の RULES。 */
import { addDays, daysBetween } from "../early-morning/dates";
import { RULES } from "./config";
import type { ClassRecord, ClassType, Person, PersonState, PersonStats } from "./types";

const DAYS_PER_WEEK = 7;

/** 参加として数える記録(申込で、欠席でないので回次がある)。 */
export function isParticipation(record: ClassRecord): boolean {
  return record.status === "申込" && record.ordinal !== null;
}

/** past は今日までの参加(日時順)。優先順: ご無沙汰 > 常連 > 新顔 > 通常。 */
export function stateOf(past: readonly ClassRecord[], today: string): PersonState {
  const lastDate = past.at(-1)?.date;
  if (past.length >= RULES.dormantMinTotal && lastDate !== undefined && daysBetween(lastDate, today) >= RULES.dormantDays) {
    return "ご無沙汰";
  }
  const recent = past.filter((record) => daysBetween(record.date, today) < RULES.recentDays).length;
  if (recent >= RULES.regularMin) return "常連";
  if (past.length <= RULES.newMaxTotal) return "新顔";
  return "通常";
}

export function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % DAYS_PER_WEEK));
}

/** 今週を含めず、先週から遡って参加がある週(月曜始まり)が続いた数。dates は今日より前の参加日。 */
export function weekStreak(dates: readonly string[], today: string): number {
  const weeks = new Set(dates.map(mondayOf));
  let streak = 0;
  for (let monday = addDays(mondayOf(today), -DAYS_PER_WEEK); weeks.has(monday); monday = addDays(monday, -DAYS_PER_WEEK)) {
    streak += 1;
  }
  return streak;
}

export function countByClass(records: readonly ClassRecord[]): Record<ClassType, number> {
  return {
    ビギナー: records.filter((record) => record.classType === "ビギナー").length,
    通常: records.filter((record) => record.classType === "通常").length,
    ダブルス: records.filter((record) => record.classType === "ダブルス").length,
  };
}

export function computeStats(input: {
  people: readonly Person[];
  records: readonly ClassRecord[];
  today: string;
  historyByPerson: ReadonlyMap<string, string>;
}): PersonStats[] {
  return input.people.map((person) => {
    const own = input.records.filter((record) => record.personKey === person.key);
    const past = own.filter((record) => isParticipation(record) && record.date <= input.today);
    return {
      key: person.key,
      displayName: person.displayName,
      total: past.length,
      classCounts: countByClass(past),
      firstDate: past[0]?.date ?? null,
      lastDate: past.at(-1)?.date ?? null,
      state: stateOf(past, input.today),
      isNextApplied: own.some((record) => record.status === "申込" && record.date >= input.today),
      history: input.historyByPerson.get(person.key) ?? "",
    };
  });
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/metrics.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/hyrox-class/metrics.ts scripts/hyrox-class/metrics.test.ts
git commit -F - <<'EOF'
feat: HYROX クラスの状態判定と週連続と人ごとの集計を追加する

DAISUKE CLASS は週に複数回・曜日も変わるため、開催回数ではなく日数(28日)と週で判定する。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 利用歴の索引と要約

**Files:**
- Create: `scripts/hyrox-class/history.ts`
- Test: `scripts/hyrox-class/history.test.ts`

**Interfaces:**
- Consumes: `LedgerRow`(Task 1)、`historyCategoryOf`(Task 1)、`resolvePersonKey`(Task 3)、`formatMonthDay`(`scripts/early-morning/dates.ts`)
- Produces: `buildHistoryIndex(rows: readonly LedgerRow[], aliasMap: ReadonlyMap<string, string>): Map<string, LedgerRow[]>` / `summarizeHistory(rows: readonly LedgerRow[]): string` / `historyBefore(index: ReadonlyMap<string, readonly LedgerRow[]>, personKey: string, date: string): string`(`date` より前の日の利用だけを要約。当日は含めない)

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/history.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildHistoryIndex, historyBefore, summarizeHistory } from "./history";
import type { LedgerRow } from "./types";

const TRIAL = "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）";

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    reservationNo: "#200",
    name: "架空一郎",
    date: "2026-09-22",
    startTime: "09:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    eventName: TRIAL,
    ...overrides,
  };
}

describe("summarizeHistory", () => {
  it("HYROX 系は短縮名ごと(1回なら日付、複数なら回数)、貸切とピックルは回数でまとめ、DAISUKE は数えない", () => {
    expect(
      summarizeHistory([
        row({ date: "2026-09-22" }),
        row({ date: "2026-09-26", eventName: "HYROX ミニシミュレーション（本番の半分の距離で8種目）", court: "A:アルテミス" }),
        row({ date: "2026-09-27", eventName: "HYROX ミニシミュレーション（アーリーアクセスコード付き）" }),
        row({ kind: "スペース", eventName: "" }),
        row({ kind: "スペース", eventName: "", court: "B:ビックバン" }),
        row({ eventName: "早朝ピックルボール（初中級）", court: "A:アルテミス" }),
        row({ eventName: "HYROX TRAINING @ DAISUKE CLASS" }),
      ]),
    ).toBe("体験会(9/22)・ミニシミュレーション 2回・HYROXエリア貸切 1回・ピックル 2回");
  });

  it("何もなければ空文字", () => {
    expect(summarizeHistory([])).toBe("");
  });
});

describe("buildHistoryIndex / historyBefore", () => {
  it("キャンセル・DAISUKE を除き、別名で寄せ、指定日より前の利用だけを要約する", () => {
    const index = buildHistoryIndex(
      [
        row({ name: "かくう一郎", date: "2026-09-22" }),
        row({ date: "2026-09-26", eventName: "HYROX ミニシミュレーション（本番の半分の距離で8種目）", isCancelled: true }),
        row({ date: "2026-09-30", eventName: "HYROX TRAINING @ DAISUKE CLASS" }),
        row({ date: "2026-10-07", eventName: "早朝ピックルボール（初中級）", court: "A:アルテミス" }),
        row({ date: "2026-10-01", kind: "スペース", eventName: "" }),
      ],
      new Map([["lb:かくう一郎", "lb:架空一郎"]]),
    );

    expect(historyBefore(index, "lb:架空一郎", "2026-10-07")).toBe("体験会(9/22)・HYROXエリア貸切 1回");
    expect(historyBefore(index, "lb:架空一郎", "2026-10-08")).toBe("体験会(9/22)・HYROXエリア貸切 1回・ピックル 1回");
    expect(historyBefore(index, "lb:未登録", "2026-10-08")).toBe("");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/history.test.ts`
Expected: FAIL(`Failed to resolve import "./history"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/history.ts`:

```ts
/** DAISUKE CLASS 以外の施設利用歴(HYROX 系イベント・HYROX エリア貸切・ピックル)の索引と要約。 */
import { formatMonthDay } from "../early-morning/dates";
import { historyCategoryOf, type HistoryCategory } from "./classify";
import { resolvePersonKey, sessionKeyOf } from "./identity";
import type { LedgerRow } from "./types";

/** 人キー → 利用歴に数える台帳の行(日時順)。キャンセル・DAISUKE CLASS・分類できない行は含めない。 */
export function buildHistoryIndex(rows: readonly LedgerRow[], aliasMap: ReadonlyMap<string, string>): Map<string, LedgerRow[]> {
  const index = new Map<string, LedgerRow[]>();
  const sorted = [...rows].sort((a, b) => sessionKeyOf(a.date, a.startTime).localeCompare(sessionKeyOf(b.date, b.startTime)));
  for (const row of sorted) {
    if (row.isCancelled || historyCategoryOf(row) === null) continue;
    const key = resolvePersonKey(row.name, aliasMap);
    index.set(key, [...(index.get(key) ?? []), row]);
  }
  return index;
}

/** 例「体験会(9/22)・ミニシミュレーション 2回・HYROXエリア貸切 1回・ピックル 5回」。rows は日時順。 */
export function summarizeHistory(rows: readonly LedgerRow[]): string {
  const categorized = rows.map((row) => ({ row, category: historyCategoryOf(row) }));
  const hyroxDates = new Map<string, string[]>();
  for (const { row, category } of categorized) {
    if (category?.kind === "HYROXイベント") hyroxDates.set(category.shortName, [...(hyroxDates.get(category.shortName) ?? []), row.date]);
  }
  const count = (kind: HistoryCategory["kind"]) => categorized.filter(({ category }) => category?.kind === kind).length;
  const rentals = count("HYROXエリア貸切");
  const pickles = count("ピックル");
  return [
    ...[...hyroxDates].map(([name, dates]) => (dates.length === 1 ? `${name}(${formatMonthDay(dates[0])})` : `${name} ${dates.length}回`)),
    ...(rentals > 0 ? [`HYROXエリア貸切 ${rentals}回`] : []),
    ...(pickles > 0 ? [`ピックル ${pickles}回`] : []),
  ].join("・");
}

/** date より前の日の利用だけを要約する(当日の利用は含めない)。 */
export function historyBefore(index: ReadonlyMap<string, readonly LedgerRow[]>, personKey: string, date: string): string {
  return summarizeHistory((index.get(personKey) ?? []).filter((row) => row.date < date));
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/history.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/hyrox-class/history.ts scripts/hyrox-class/history.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス参加者の施設利用歴を要約する

初参加の人がどこから来たかをコーチが分かるよう、HYROX 系イベント・HYROX エリア貸切・
ピックルの利用を別名も含めて集計する。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: 所見の6ルール(PR (a) の最後)

**Files:**
- Create: `scripts/hyrox-class/lineNotes.ts`
- Test: `scripts/hyrox-class/lineNotes.test.ts`

**Interfaces:**
- Consumes: `ClassRecord` / `ClassType` / `LedgerRow`(Task 1)、`CLASS_NOTE_LABELS` / `CLASS_ORDER` / `RULES`(Task 1)、`historyBefore`(Task 6)、`isParticipation` / `weekStreak`(Task 5)、`daysBetween` / `formatMonthDay`(`scripts/early-morning/dates.ts`)
- Produces: `FIRST_TIME_NOTE` / `NO_HISTORY_NOTE`(文字列定数)/ `noteFor(input: { classType: ClassType; prior: readonly ClassRecord[]; today: string; history: string }): string[]`(1行、初参加だけ2行)/ `buildNotes(input: { today: string; records: readonly ClassRecord[]; historyIndex: ReadonlyMap<string, readonly LedgerRow[]> }): Map<string, string[]>`(キーは今日の参加記録のキー)

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/lineNotes.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildNotes, noteFor } from "./lineNotes";
import type { ClassRecord, LedgerRow } from "./types";

function rec(date: string, overrides: Partial<ClassRecord> = {}): ClassRecord {
  const sessionKey = `${date}_20:00`;
  return {
    key: `${sessionKey}_lb:架空一郎`,
    sessionKey,
    date,
    startTime: "20:00",
    classType: "通常",
    personKey: "lb:架空一郎",
    reservationNos: ["#1"],
    status: "申込",
    ordinal: 1,
    ...overrides,
  };
}

const today = "2026-10-07";

describe("noteFor", () => {
  it("1. 初参加は声かけと利用歴の2行", () => {
    expect(noteFor({ classType: "ビギナー", prior: [], today, history: "体験会(9/22)" })).toEqual([
      "初めての方。声かけをお願いします",
      "これまで: 体験会(9/22)",
    ]);
  });

  it("1. 利用歴がなければ施設の利用も初めて", () => {
    expect(noteFor({ classType: "ビギナー", prior: [], today, history: "" })).toEqual([
      "初めての方。声かけをお願いします",
      "施設の利用も初めて",
    ]);
  });

  it("2. 今日のクラスに初めてなら、前にいたクラスの回数を添える", () => {
    const prior = [rec("2026-09-16", { classType: "ビギナー" }), rec("2026-09-23", { classType: "ビギナー" }), rec("2026-09-25", { classType: "ダブルス" })];
    expect(noteFor({ classType: "通常", prior, today, history: "" })).toEqual(["通常回は初めて(ビギナー2回)"]);
  });

  it("2. 前にいたクラスが同数なら、クラスの並び順で先のもの", () => {
    const prior = [rec("2026-09-25", { classType: "ダブルス" }), rec("2026-09-23", { classType: "ビギナー" })];
    expect(noteFor({ classType: "通常", prior, today, history: "" })).toEqual(["通常回は初めて(ビギナー1回)"]);
  });

  it("3. 通算2回目", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-30")], today, history: "" })).toEqual(["2回目(初参加 9/30)"]);
  });

  it("4. 最終参加から28日以上なら久しぶり", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-08-19"), rec("2026-09-09")], today, history: "" })).toEqual(["久しぶり(前回 9/9)"]);
  });

  it("5. 2週以上続いていれば週連続", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-23"), rec("2026-09-30")], today, history: "" })).toEqual(["2週連続・前回 9/30"]);
  });

  it("6. それ以外は直近28日の回数", () => {
    expect(noteFor({ classType: "通常", prior: [rec("2026-09-16"), rec("2026-09-30")], today, history: "" })).toEqual(["直近28日で2回・前回 9/30"]);
  });
});

describe("buildNotes", () => {
  it("今日の参加記録ごとに、今日より前の参加と利用歴から所見を作る", () => {
    const records = [
      rec("2026-09-30"),
      rec(today, { ordinal: 2 }),
      rec(today, { key: `${today}_20:00_lb:架空二郎`, personKey: "lb:架空二郎", ordinal: 1 }),
      rec(today, { key: `${today}_20:00_lb:架空三郎`, personKey: "lb:架空三郎", status: "キャンセル", ordinal: null }),
      rec("2026-10-09", { ordinal: 3 }),
    ];
    const trial: LedgerRow = {
      reservationNo: "#200",
      name: "架空二郎",
      date: "2026-09-22",
      startTime: "09:00",
      isCancelled: false,
      court: "HYROX",
      kind: "イベント",
      eventName: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）",
    };

    const notes = buildNotes({ today, records, historyIndex: new Map([["lb:架空二郎", [trial]]]) });

    expect([...notes]).toEqual([
      [`${today}_20:00_lb:架空一郎`, ["2回目(初参加 9/30)"]],
      [`${today}_20:00_lb:架空二郎`, ["初めての方。声かけをお願いします", "これまで: 体験会(9/22)"]],
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/lineNotes.test.ts`
Expected: FAIL(`Failed to resolve import "./lineNotes"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/lineNotes.ts`:

```ts
/** LINE の所見(設計書 §11 の6ルール)。今日の回を含まない過去の参加だけで、決まった文言を作る。 */
import { daysBetween, formatMonthDay } from "../early-morning/dates";
import { CLASS_NOTE_LABELS, CLASS_ORDER, RULES } from "./config";
import { historyBefore } from "./history";
import { isParticipation, weekStreak } from "./metrics";
import type { ClassRecord, ClassType, LedgerRow } from "./types";

export const FIRST_TIME_NOTE = "初めての方。声かけをお願いします";
export const NO_HISTORY_NOTE = "施設の利用も初めて";

function mostFrequentClass(prior: readonly ClassRecord[]): { classType: ClassType; count: number } {
  return CLASS_ORDER.map((classType) => ({ classType, count: prior.filter((record) => record.classType === classType).length })).reduce(
    (best, current) => (current.count > best.count ? current : best),
  );
}

/** prior は今日より前の参加(日時順)。 */
export function noteFor(input: { classType: ClassType; prior: readonly ClassRecord[]; today: string; history: string }): string[] {
  const { prior, today } = input;
  if (prior.length === 0) {
    return [FIRST_TIME_NOTE, input.history === "" ? NO_HISTORY_NOTE : `これまで: ${input.history}`];
  }
  if (!prior.some((record) => record.classType === input.classType)) {
    const previous = mostFrequentClass(prior);
    return [`${CLASS_NOTE_LABELS[input.classType]}は初めて(${CLASS_NOTE_LABELS[previous.classType]}${previous.count}回)`];
  }
  if (prior.length === 1) return [`2回目(初参加 ${formatMonthDay(prior[0].date)})`];
  const lastDate = prior[prior.length - 1].date;
  const last = `前回 ${formatMonthDay(lastDate)}`;
  if (daysBetween(lastDate, today) >= RULES.dormantDays) return [`久しぶり(${last})`];
  const streak = weekStreak(
    prior.map((record) => record.date),
    today,
  );
  if (streak >= RULES.streakMinWeeks) return [`${streak}週連続・${last}`];
  const recent = prior.filter((record) => daysBetween(record.date, today) < RULES.recentDays).length;
  return [`直近${RULES.recentDays}日で${recent}回・${last}`];
}

/** 今日の各参加記録(申込で欠席でない)の所見。キーは参加記録のキー。 */
export function buildNotes(input: {
  today: string;
  records: readonly ClassRecord[];
  historyIndex: ReadonlyMap<string, readonly LedgerRow[]>;
}): Map<string, string[]> {
  const participations = input.records.filter(isParticipation);
  return new Map(
    participations
      .filter((record) => record.date === input.today)
      .map((record) => [
        record.key,
        noteFor({
          classType: record.classType,
          prior: participations.filter((other) => other.personKey === record.personKey && other.date < input.today),
          today: input.today,
          history: historyBefore(input.historyIndex, record.personKey, input.today),
        }),
      ]),
  );
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/lineNotes.test.ts`
Expected: PASS

- [ ] **Step 5: PR (a) の全体確認**

```bash
npx vitest run --coverage 2>&1 | grep -E "hyrox-class|All files|ERROR|Coverage for"
npx tsc --noEmit
npm run lint
```

Expected: `scripts/hyrox-class/` の全ファイル(`fixtures/notionProps.ts` を含む)が statements/branches/functions/lines 100%。全体のしきい値エラーなし。`tsc` と `lint` はエラー0件。100% に届かない行があれば、その行を通すテストを該当タスクのテストファイルに足す(実装を削って合わせない)。

- [ ] **Step 6: コミット**

```bash
git add scripts/hyrox-class/lineNotes.ts scripts/hyrox-class/lineNotes.test.ts
git commit -F - <<'EOF'
feat: HYROX クラスの LINE 所見を決まった文言で作る

コーチが声かけに使えるよう、初参加・クラス替え・2回目・久しぶり・週連続・直近の回数を
今日より前の参加だけから判定する。AI は使わない。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: PR (a) の区切り**

ここで作業を止め、コントローラー(とオーナー)の確認を待つ。push と PR 作成は確認後に行う(Global Constraints)。PR タイトル: `feat: HYROX DAISUKE CLASS 参加者集計のロジックを追加する`。

---
### Task 8: LINE Flex の組み立て(PR (b) の最初)

**Files:**
- Create: `scripts/hyrox-class/lineMessage.ts`
- Test: `scripts/hyrox-class/lineMessage.test.ts`

**Interfaces:**
- Consumes: `ClassRecord` / `Person` / `Session`(Task 1)、`CLASS_HEADINGS`(Task 1)、`isParticipation`(Task 5)、`formatMonthDayTime` / `formatMonthDayWeekday` / `formatStartTime`(`scripts/early-morning/dates.ts`)、`type FlexMessage`(`scripts/early-morning/lineMessage.ts`)
- Produces: `interface LineEntry { displayName: string; ordinal: number; notes: string[] }` / `selectEntries(session: Session, records: readonly ClassRecord[], people: ReadonlyMap<string, Person>, notes: ReadonlyMap<string, string[]>): LineEntry[]` / `buildFlexMessage(input: { date: string; sessions: readonly { session: Session; entries: readonly LineEntry[] }[]; updatedAt: string; notionUrl: string }): FlexMessage`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/lineMessage.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildFlexMessage, selectEntries } from "./lineMessage";
import type { ClassRecord, Session } from "./types";

const session: Session = {
  key: "2026-10-07_19:00",
  date: "2026-10-07",
  startTime: "19:00",
  classType: "ビギナー",
  eventName: "HYROX TRAINING @ DAISUKE CLASS ビギナーの部",
};

function rec(personKey: string, ordinal: number | null, overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    key: `${session.key}_${personKey}`,
    sessionKey: session.key,
    date: session.date,
    startTime: session.startTime,
    classType: session.classType,
    personKey,
    reservationNos: ["#1"],
    status: "申込",
    ordinal,
    ...overrides,
  };
}

describe("selectEntries", () => {
  it("この回の参加だけを、回数の多い順・同数は名前順・初参加は最後に並べ、所見を添える", () => {
    const records = [
      rec("lb:A", 1),
      rec("lb:B", 5),
      rec("lb:C", 2),
      rec("lb:D", null, { status: "キャンセル" }),
      rec("lb:E", 3, { sessionKey: "2026-10-07_20:00" }),
      rec("lb:G", 4),
      rec("lb:F", 4),
    ];
    const people = new Map(
      ["A", "B", "F", "G"].map((suffix) => [`lb:${suffix}`, { key: `lb:${suffix}`, displayName: `架空${suffix}` }]),
    );
    const notes = new Map([[`${session.key}_lb:A`, ["初めての方。声かけをお願いします", "施設の利用も初めて"]]]);

    expect(selectEntries(session, records, people, notes)).toEqual([
      { displayName: "架空B", ordinal: 5, notes: [] },
      { displayName: "架空F", ordinal: 4, notes: [] },
      { displayName: "架空G", ordinal: 4, notes: [] },
      { displayName: "lb:C", ordinal: 2, notes: [] },
      { displayName: "架空A", ordinal: 1, notes: ["初めての方。声かけをお願いします", "施設の利用も初めて"] },
    ]);
  });
});

describe("buildFlexMessage", () => {
  it("回ごとに見出し・人数・参加者・所見を並べ、フッターに Notion と最終更新を置く", () => {
    const flex = buildFlexMessage({
      date: "2026-10-07",
      sessions: [
        {
          session,
          entries: [
            { displayName: "架空B", ordinal: 5, notes: [] },
            { displayName: "架空A", ordinal: 1, notes: ["初めての方。声かけをお願いします", "施設の利用も初めて"] },
          ],
        },
        {
          session: { ...session, key: "2026-10-07_20:00", startTime: "20:00", classType: "通常" },
          entries: [{ displayName: "架空C", ordinal: 12, notes: ["通常回は初めて(ビギナー3回)"] }],
        },
      ],
      updatedAt: "2026-10-07T08:31:00+09:00",
      notionUrl: "https://www.notion.so/people",
    });

    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe("本日のDAISUKE CLASS 10/7(水) 19:00 ビギナーの部 2名・20:00 通常 1名");
    const body = flex.contents.body as { contents: Record<string, unknown>[] };
    expect(body.contents.map((item) => item.text ?? item.type)).toEqual([
      "19:00 ビギナーの部  2名",
      "separator",
      "box",
      "box",
      "初めての方。声かけをお願いします",
      "施設の利用も初めて",
      "20:00 通常  1名",
      "separator",
      "box",
      "通常回は初めて(ビギナー3回)",
    ]);
    const json = JSON.stringify(flex);
    expect(json).toContain("初参加 🔰");
    expect(json).toContain("5回目");
    expect(json).toContain("本日の DAISUKE CLASS");
    expect(json).toContain("https://www.notion.so/people?openExternalBrowser=1");
    expect(json).toContain("最終更新 10/7 08:31");
    expect(json).toContain("予約は本日朝8時時点までを反映");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/lineMessage.test.ts`
Expected: FAIL(`Failed to resolve import "./lineMessage"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/lineMessage.ts`:

```ts
/** 当日朝の LINE 通知の Flex メッセージ。回ごとに見出し・参加者・何回目(初参加は 🔰)・所見を載せる。 */
import { formatMonthDayTime, formatMonthDayWeekday, formatStartTime } from "../early-morning/dates";
import type { FlexMessage } from "../early-morning/lineMessage";
import { CLASS_HEADINGS } from "./config";
import { isParticipation } from "./metrics";
import type { ClassRecord, Person, Session } from "./types";

export interface LineEntry {
  displayName: string;
  ordinal: number;
  /** 所見の行(通常1行、初参加は2行)。 */
  notes: string[];
}

const HEADER_COLOR = "#1A1A1A";
const MUTED = "#8A8A8A";

export function selectEntries(
  session: Session,
  records: readonly ClassRecord[],
  people: ReadonlyMap<string, Person>,
  notes: ReadonlyMap<string, string[]>,
): LineEntry[] {
  return records
    .filter((record) => record.sessionKey === session.key && isParticipation(record))
    .map((record) => ({
      displayName: people.get(record.personKey)?.displayName ?? record.personKey,
      ordinal: record.ordinal as number,
      notes: notes.get(record.key) ?? [],
    }))
    .sort((a, b) => {
      const aFirst = a.ordinal === 1 ? 1 : 0;
      const bFirst = b.ordinal === 1 ? 1 : 0;
      return aFirst - bFirst || b.ordinal - a.ordinal || a.displayName.localeCompare(b.displayName, "ja");
    });
}

function headingOf(session: Session): string {
  return `${formatStartTime(session.startTime)} ${CLASS_HEADINGS[session.classType]}`;
}

function entryRows(entry: LineEntry) {
  return [
    {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        { type: "text", text: entry.displayName, size: "sm", flex: 4, wrap: true },
        { type: "text", text: entry.ordinal === 1 ? "初参加 🔰" : `${entry.ordinal}回目`, size: "sm", flex: 2, align: "end" },
      ],
    },
    ...entry.notes.map((note) => ({ type: "text", text: note, size: "xs", color: MUTED, wrap: true, margin: "none" })),
  ];
}

function sessionBlock(item: { session: Session; entries: readonly LineEntry[] }) {
  return [
    { type: "text", text: `${headingOf(item.session)}  ${item.entries.length}名`, weight: "bold", size: "md", margin: "lg" },
    { type: "separator", margin: "sm" },
    ...item.entries.flatMap(entryRows),
  ];
}

export function buildFlexMessage(input: {
  date: string;
  sessions: readonly { session: Session; entries: readonly LineEntry[] }[];
  updatedAt: string;
  notionUrl: string;
}): FlexMessage {
  const day = formatMonthDayWeekday(input.date);
  const summary = input.sessions.map((item) => `${headingOf(item.session)} ${item.entries.length}名`).join("・");
  return {
    type: "flex",
    altText: `本日のDAISUKE CLASS ${day} ${summary}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: HEADER_COLOR,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "本日の DAISUKE CLASS", color: "#FFFFFF", size: "sm" },
          { type: "text", text: day, color: "#FFFFFF", weight: "bold", size: "lg", margin: "sm" },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: input.sessions.flatMap(sessionBlock) },
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
          { type: "text", text: "予約は本日朝8時時点までを反映", size: "xxs", color: MUTED, align: "center", wrap: true },
        ],
      },
    },
  };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/lineMessage.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add scripts/hyrox-class/lineMessage.ts scripts/hyrox-class/lineMessage.test.ts
git commit -F - <<'EOF'
feat: HYROX クラスの当日 LINE 通知の Flex を組み立てる

同じ日に複数の回があるため、回ごとに見出しと人数を出し、参加者と所見を並べる。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Notion 3 DB の読み取りと差分書き込み

> 実装後の fix コミット(owner 決定)で buildAliasMap / absorb / runSync を変更した。最新はコードを正とする。


**Files:**
- Create: `scripts/hyrox-class/fixtures/fakeNotion.ts`
- Create: `scripts/hyrox-class/notionSync.ts`
- Test: `scripts/hyrox-class/notionSync.test.ts`

**Interfaces:**
- Consumes: `AliasLink` / `ClassRecord` / `PersonStats` / `Session`(Task 1)、`canonicalPersonKey` / `personKeyOfRecordKey` / `recordKeyOf` / `sessionKeyOfRecordKey`(Task 3)、`text` / `title` / `select`(Task 2 の fixtures)、`hashOf` / `type WriteCounts`(`scripts/early-morning/notionSync.ts`)、`NotionClient` / `NotionBlock`(`scripts/early-morning/notionClient.ts`)、`prop` / `readCheckbox` / `readPlainText` / `readSelect` / `NotionPage`(`scripts/early-morning/notionProps.ts`)
- Produces:
  - `notionSync.ts`: `interface HyroxNotionIds { peopleDb; recordsDb; sessionsDb; bridgePage: string }` / `PeopleRow` / `RecordRow` / `SessionRow` / `HyroxNotionState` / `readHyroxState(client, ids): Promise<HyroxNotionState>` / `deriveAliasLinks(people: readonly PeopleRow[]): AliasLink[]` / `deriveAbsentKeys(records: readonly RecordRow[], aliasMap: ReadonlyMap<string, string>): Set<string>` / `syncSessions(client, ids, sessions, records, existing: readonly SessionRow[]): Promise<WriteCounts>` / `syncPeople(client, ids, stats, existing: readonly PeopleRow[], aliasMap): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }>` / `syncRecords(client, ids, records, pageIdByKey: ReadonlyMap<string, string>, existing: readonly RecordRow[], aliasMap, absentKeys: ReadonlySet<string>): Promise<WriteCounts>`
  - `fixtures/fakeNotion.ts`(テスト用): `class FakeNotion implements NotionClient`(公開フィールド `pages` / `blocks` / `log` / `columns` / `failQueryDb` / `failAppend`、メソッド `seed(db, properties): string` / `live(db): NotionPage[]`)

- [ ] **Step 1: テスト用の Notion の偽物を書く(Task 10 でも使う。全メソッドと分岐は Task 9・10 のテストで通る)**

`scripts/hyrox-class/fixtures/fakeNotion.ts`:

```ts
/** テスト用の Notion の偽物。書いた値には実 API と同じく plain_text を補う。 */
import type { NotionBlock, NotionClient } from "../../early-morning/notionClient";
import type { NotionPage } from "../../early-morning/notionProps";

interface StoredPage {
  db: string;
  properties: Record<string, unknown>;
  archived: boolean;
}

function addPlainText(_key: string, value: unknown): unknown {
  const content = (value as { text?: { content?: unknown } } | null)?.text?.content;
  return typeof content === "string" ? { ...(value as object), plain_text: content } : value;
}

function withPlainText(properties: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties, addPlainText)) as Record<string, unknown>;
}

export class FakeNotion implements NotionClient {
  pages = new Map<string, StoredPage>();
  blocks: NotionBlock[] = [];
  log: string[] = [];
  /** getDatabase が返す列名(列 ID は列名と同じにする)。 */
  columns: readonly string[] = [];
  /** この DB の queryAll を失敗させる。 */
  failQueryDb: string | null = null;
  failAppend = false;
  private seq = 0;

  seed(db: string, properties: Record<string, unknown>): string {
    const id = `seed${++this.seq}`;
    this.pages.set(id, { db, properties, archived: false });
    return id;
  }

  live(db: string): NotionPage[] {
    return [...this.pages.entries()]
      .filter(([, page]) => page.db === db && !page.archived)
      .map(([id, page]) => ({ id, properties: page.properties }));
  }

  async getDatabase() {
    return { properties: Object.fromEntries(this.columns.map((name) => [name, { id: name }])) };
  }

  async queryAll(databaseId: string): Promise<NotionPage[]> {
    if (databaseId === this.failQueryDb) throw new Error(`query ${databaseId} failed`);
    return this.live(databaseId);
  }

  async createPage(databaseId: string, properties: Record<string, unknown>) {
    const id = `new${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties), archived: false });
    this.log.push(`create ${databaseId}`);
    return { id, properties };
  }

  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId) as StoredPage;
    page.properties = { ...page.properties, ...withPlainText(properties) };
    this.log.push(`update ${pageId}`);
  }

  async archivePage(pageId: string) {
    (this.pages.get(pageId) as StoredPage).archived = true;
    this.log.push(`archive ${pageId}`);
  }

  async listChildren() {
    return this.blocks;
  }

  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((block) => block.id !== blockId);
  }

  async appendChildren(_blockId: string, children: readonly unknown[]) {
    if (this.failAppend) throw new Error("append failed");
    this.blocks = [
      ...this.blocks,
      ...children.map((child) => ({ ...withPlainText(child as Record<string, unknown>), id: `blk${++this.seq}`, type: "code" })),
    ];
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`scripts/hyrox-class/notionSync.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readPlainText, readSelect } from "../early-morning/notionProps";
import { FakeNotion } from "./fixtures/fakeNotion";
import { select, text, title } from "./fixtures/notionProps";
import {
  deriveAbsentKeys,
  deriveAliasLinks,
  readHyroxState,
  syncPeople,
  syncRecords,
  syncSessions,
  type PeopleRow,
  type RecordRow,
} from "./notionSync";
import type { ClassRecord, PersonStats, Session } from "./types";

const ids = { peopleDb: "people", recordsDb: "records", sessionsDb: "sessions", bridgePage: "bridge" };

function stats(key: string, overrides: Partial<PersonStats> = {}): PersonStats {
  return {
    key,
    displayName: `名前${key}`,
    total: 3,
    classCounts: { ビギナー: 2, 通常: 1, ダブルス: 0 },
    firstDate: "2026-09-09",
    lastDate: "2026-09-30",
    state: "常連",
    isNextApplied: true,
    history: "体験会(9/22)",
    ...overrides,
  };
}

function rec(sessionKey: string, personKey: string, overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    key: `${sessionKey}_${personKey}`,
    sessionKey,
    date: sessionKey.slice(0, 10),
    startTime: sessionKey.slice(11),
    classType: "通常",
    personKey,
    reservationNos: ["#1"],
    status: "申込",
    ordinal: 1,
    ...overrides,
  };
}

function propsOf(notion: FakeNotion, pageId: string) {
  return { id: pageId, properties: notion.pages.get(pageId)?.properties ?? {} };
}

describe("readHyroxState", () => {
  it("3つの DB を読み、別名・メモ・次回申込・欠席・キーを取り出す", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text(" かくう一郎 "), メモ: text("膝に注意"), 次回申込: { checkbox: true }, 同期ハッシュ: text("h1") });
    notion.seed("records", { キー: title("2026-09-30_20:00_lb:架空一郎"), 状態: select("申込"), 出欠: select("欠席"), 同期ハッシュ: text("h2") });
    notion.seed("sessions", { キー: title("2026-09-30_20:00"), 同期ハッシュ: text("h3") });

    const state = await readHyroxState(notion, ids);

    expect(state.people).toEqual([{ pageId: "seed1", key: "lb:架空一郎", alias: "かくう一郎", memo: "膝に注意", isNextApplied: true, hash: "h1" }]);
    expect(state.records).toEqual([
      { pageId: "seed2", key: "2026-09-30_20:00_lb:架空一郎", personKey: "lb:架空一郎", status: "申込", isAbsent: true, hash: "h2" },
    ]);
    expect(state.sessions).toEqual([{ pageId: "seed3", key: "2026-09-30_20:00", hash: "h3" }]);
  });
});

describe("deriveAliasLinks / deriveAbsentKeys", () => {
  it("別名のある行だけを対応にし、欠席のキーは統合先の人キーに寄せる", () => {
    const people: PeopleRow[] = [
      { pageId: "p1", key: "lb:架空一郎", alias: "かくう一郎", memo: "", isNextApplied: false, hash: "" },
      { pageId: "p2", key: "lb:架空二郎", alias: "", memo: "", isNextApplied: false, hash: "" },
    ];
    expect(deriveAliasLinks(people)).toEqual([{ personKey: "lb:架空一郎", alias: "かくう一郎" }]);

    const records: RecordRow[] = [
      { pageId: "r1", key: "2026-09-23_20:00_lb:かくう一郎", personKey: "lb:かくう一郎", status: "申込", isAbsent: true, hash: "" },
      { pageId: "r2", key: "2026-09-30_20:00_lb:架空二郎", personKey: "lb:架空二郎", status: "申込", isAbsent: false, hash: "" },
    ];
    expect([...deriveAbsentKeys(records, new Map([["lb:かくう一郎", "lb:架空一郎"]]))]).toEqual(["2026-09-23_20:00_lb:架空一郎"]);
  });
});

describe("syncSessions", () => {
  it("開催回を作り、申込数は申込の人数。変化がなければ書かず、重複行はアーカイブする", async () => {
    const notion = new FakeNotion();
    const session: Session = { key: "2026-09-30_20:00", date: "2026-09-30", startTime: "20:00", classType: "通常", eventName: "HYROX TRAINING @ DAISUKE CLASS" };
    const records = [rec(session.key, "lb:A"), rec(session.key, "lb:B", { status: "キャンセル", ordinal: null })];

    expect(await syncSessions(notion, ids, [session], records, [])).toEqual({ created: 1, updated: 0, archived: 0 });
    expect(notion.live("sessions")[0].properties.申込数).toEqual({ number: 1 });

    const state = await readHyroxState(notion, ids);
    const duplicate = notion.seed("sessions", { キー: title(session.key), 同期ハッシュ: text("old") });
    const second = await syncSessions(notion, ids, [session], records, [...state.sessions, { pageId: duplicate, key: session.key, hash: "old" }]);

    expect(second).toEqual({ created: 0, updated: 0, archived: 1 });
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
  });
});

describe("syncPeople", () => {
  it("人を作り、スタッフ列(別名・メモ)は書かない", async () => {
    const notion = new FakeNotion();
    const { pageIdByKey, counts } = await syncPeople(notion, ids, [stats("lb:A")], [], new Map());

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
    const [row] = notion.live("people");
    expect(pageIdByKey.get("lb:A")).toBe(row.id);
    expect(Object.keys(row.properties)).not.toContain("メモ");
    expect(Object.keys(row.properties)).not.toContain("別名");
    expect(readPlainText(row, "利用歴")).toBe("体験会(9/22)");
  });

  it("別名の人の行を統合先へ吸収してアーカイブし、統合先のメモが空なら移す。別名列は残す", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text("かくう一郎") });
    const source = notion.seed("people", { 識別子: text("lb:かくう一郎"), メモ: text("膝に注意") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts.archived).toBe(1);
    expect(notion.pages.get(source)?.archived).toBe(true);
    expect(readPlainText(propsOf(notion, target), "メモ")).toBe("膝に注意");
    expect(readPlainText(propsOf(notion, target), "別名")).toBe("かくう一郎");
  });

  it("統合先にメモがあれば上書きしない。同じ識別子の重複行も吸収する", async () => {
    const notion = new FakeNotion();
    const target = notion.seed("people", { 識別子: text("lb:架空一郎"), 別名: text("かくう一郎"), メモ: text("既存") });
    const duplicate = notion.seed("people", { 識別子: text("lb:架空一郎"), メモ: text("重複のメモ") });
    const source = notion.seed("people", { 識別子: text("lb:かくう一郎"), メモ: text("別名のメモ") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts.archived).toBe(2);
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
    expect(notion.pages.get(source)?.archived).toBe(true);
    expect(readPlainText(propsOf(notion, target), "メモ")).toBe("既存");
  });

  it("別名の統合先の行がまだ無ければ吸収しない", async () => {
    const notion = new FakeNotion();
    notion.seed("people", { 識別子: text("lb:かくう一郎") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [stats("lb:架空一郎")], state.people, new Map([["lb:かくう一郎", "lb:架空一郎"]]));

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
  });

  it("計算から消えた人の次回申込を外す", async () => {
    const notion = new FakeNotion();
    const gone = notion.seed("people", { 識別子: text("lb:Z"), 次回申込: { checkbox: true }, 同期ハッシュ: text("h") });
    const state = await readHyroxState(notion, ids);

    const { counts } = await syncPeople(notion, ids, [], state.people, new Map());

    expect(counts).toEqual({ created: 0, updated: 1, archived: 0 });
    expect(notion.pages.get(gone)?.properties.次回申込).toEqual({ checkbox: false });
  });
});

describe("syncRecords", () => {
  it("参加記録を作り、欠席を書き写す。人のページが無ければ失敗する", async () => {
    const notion = new FakeNotion();
    const record = rec("2026-09-30_20:00", "lb:A", { ordinal: null });

    const counts = await syncRecords(notion, ids, [record], new Map([["lb:A", "pA"]]), [], new Map(), new Set([record.key]));

    expect(counts).toEqual({ created: 1, updated: 0, archived: 0 });
    const [row] = notion.live("records");
    expect(row.properties.出欠).toEqual({ select: { name: "欠席" } });
    expect(row.properties.人).toEqual({ relation: [{ id: "pA" }] });
    await expect(syncRecords(notion, ids, [record], new Map(), [], new Map(), new Set())).rejects.toThrow("参加記録の人のページが見つかりません");
  });

  it("元データから消えた記録は元データになしにし、別名の記録と重複はアーカイブする", async () => {
    const notion = new FakeNotion();
    const gone = notion.seed("records", { キー: title("2026-09-23_20:00_lb:A"), 状態: select("申込") });
    const already = notion.seed("records", { キー: title("2026-09-16_20:00_lb:A"), 状態: select("元データになし") });
    const alias = notion.seed("records", { キー: title("2026-09-23_20:00_lb:かくう一郎"), 状態: select("申込") });
    const duplicate = notion.seed("records", { キー: title("2026-09-23_20:00_lb:A"), 状態: select("申込") });
    const state = await readHyroxState(notion, ids);

    const counts = await syncRecords(notion, ids, [], new Map(), state.records, new Map([["lb:かくう一郎", "lb:A"]]), new Set());

    expect(counts).toEqual({ created: 0, updated: 1, archived: 2 });
    expect(readSelect(propsOf(notion, gone), "状態")).toBe("元データになし");
    expect(notion.pages.get(alias)?.archived).toBe(true);
    expect(notion.pages.get(duplicate)?.archived).toBe(true);
    expect(notion.log).not.toContain(`update ${already}`);
  });
});
```

- [ ] **Step 3: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/notionSync.test.ts`
Expected: FAIL(`Failed to resolve import "./notionSync"`)

- [ ] **Step 4: 最小の実装を書く**

`scripts/hyrox-class/notionSync.ts`:

```ts
/**
 * HYROX 参加者の Notion 3 DB の読み取りと差分書き込み。
 * スタッフ入力列(別名・メモ・出欠)は、統合時のメモの空欄補完と欠席の書き写しを除いて書かない。
 */
import type { NotionClient } from "../early-morning/notionClient";
import { prop, readCheckbox, readPlainText, readSelect } from "../early-morning/notionProps";
import { hashOf, type WriteCounts } from "../early-morning/notionSync";
import { canonicalPersonKey, personKeyOfRecordKey, recordKeyOf, sessionKeyOfRecordKey } from "./identity";
import type { AliasLink, ClassRecord, PersonStats, Session } from "./types";

export interface HyroxNotionIds {
  peopleDb: string;
  recordsDb: string;
  sessionsDb: string;
  bridgePage: string;
}

export interface PeopleRow {
  pageId: string;
  key: string;
  alias: string;
  memo: string;
  isNextApplied: boolean;
  hash: string;
}

export interface RecordRow {
  pageId: string;
  key: string;
  personKey: string;
  status: string | null;
  isAbsent: boolean;
  hash: string;
}

export interface SessionRow {
  pageId: string;
  key: string;
  hash: string;
}

export interface HyroxNotionState {
  people: PeopleRow[];
  records: RecordRow[];
  sessions: SessionRow[];
}

const HASH = "同期ハッシュ";
const VANISHED = "元データになし";

function emptyCounts(): WriteCounts {
  return { created: 0, updated: 0, archived: 0 };
}

export async function readHyroxState(client: NotionClient, ids: HyroxNotionIds): Promise<HyroxNotionState> {
  const [peoplePages, recordPages, sessionPages] = await Promise.all([
    client.queryAll(ids.peopleDb),
    client.queryAll(ids.recordsDb),
    client.queryAll(ids.sessionsDb),
  ]);
  return {
    people: peoplePages.map((page) => ({
      pageId: page.id,
      key: readPlainText(page, "識別子"),
      alias: readPlainText(page, "別名").trim(),
      memo: readPlainText(page, "メモ"),
      isNextApplied: readCheckbox(page, "次回申込"),
      hash: readPlainText(page, HASH),
    })),
    records: recordPages.map((page) => {
      const key = readPlainText(page, "キー");
      return {
        pageId: page.id,
        key,
        personKey: personKeyOfRecordKey(key),
        status: readSelect(page, "状態"),
        isAbsent: readSelect(page, "出欠") === "欠席",
        hash: readPlainText(page, HASH),
      };
    }),
    sessions: sessionPages.map((page) => ({ pageId: page.id, key: readPlainText(page, "キー"), hash: readPlainText(page, HASH) })),
  };
}

export function deriveAliasLinks(people: readonly PeopleRow[]): AliasLink[] {
  return people.filter((row) => row.alias !== "").map((row) => ({ personKey: row.key, alias: row.alias }));
}

/** スタッフが「欠席」を付けた参加記録のキー(統合先の人キーに寄せる)。 */
export function deriveAbsentKeys(records: readonly RecordRow[], aliasMap: ReadonlyMap<string, string>): Set<string> {
  return new Set(
    records
      .filter((row) => row.isAbsent)
      .map((row) => recordKeyOf(sessionKeyOfRecordKey(row.key), canonicalPersonKey(row.personKey, aliasMap))),
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
async function archiveDuplicates<T extends { pageId: string; key: string }>(
  client: NotionClient,
  rows: readonly T[],
  counts: WriteCounts,
): Promise<T[]> {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
      continue;
    }
    seen.add(row.key);
    kept.push(row);
  }
  return kept;
}

export async function syncSessions(
  client: NotionClient,
  ids: HyroxNotionIds,
  sessions: readonly Session[],
  records: readonly ClassRecord[],
  existing: readonly SessionRow[],
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const byKey = new Map((await archiveDuplicates(client, existing, counts)).map((row) => [row.key, row]));
  for (const session of sessions) {
    const applicants = records.filter((record) => record.sessionKey === session.key && record.status === "申込").length;
    await upsert(
      client,
      ids.sessionsDb,
      {
        キー: prop.title(session.key),
        開催日: prop.date(session.date),
        開始時刻: prop.text(session.startTime),
        クラス: prop.select(session.classType),
        イベント名: prop.text(session.eventName),
        申込数: prop.number(applicants),
      },
      byKey.get(session.key),
      counts,
    );
  }
  return counts;
}

function personProperties(stats: PersonStats): Record<string, unknown> {
  return {
    氏名: prop.title(stats.displayName),
    識別子: prop.text(stats.key),
    通算: prop.number(stats.total),
    ビギナー: prop.number(stats.classCounts.ビギナー),
    通常: prop.number(stats.classCounts.通常),
    ダブルス: prop.number(stats.classCounts.ダブルス),
    初参加日: prop.date(stats.firstDate),
    最終参加日: prop.date(stats.lastDate),
    状態: prop.select(stats.state),
    次回申込: prop.checkbox(stats.isNextApplied),
    利用歴: prop.text(stats.history),
  };
}

/** source を target に吸収してアーカイブする。メモは target が空のときだけ移す(値を消さない)。 */
async function absorb(client: NotionClient, target: PeopleRow, source: PeopleRow, counts: WriteCounts): Promise<PeopleRow> {
  const isMemoTransferred = target.memo === "" && source.memo !== "";
  if (isMemoTransferred) {
    await client.updatePage(target.pageId, { メモ: prop.text(source.memo) });
    counts.updated += 1;
  }
  await client.archivePage(source.pageId);
  counts.archived += 1;
  return isMemoTransferred ? { ...target, memo: source.memo } : target;
}

/** 同じ識別子の重複行と、別名に当たる人の行を統合先へ吸収する。 */
async function mergePeople(
  client: NotionClient,
  rows: readonly PeopleRow[],
  aliasMap: ReadonlyMap<string, string>,
  counts: WriteCounts,
): Promise<Map<string, PeopleRow>> {
  const byKey = new Map<string, PeopleRow>();
  for (const row of rows) {
    const current = byKey.get(row.key);
    byKey.set(row.key, current ? await absorb(client, current, row, counts) : row);
  }
  for (const [key, row] of [...byKey]) {
    const target = byKey.get(canonicalPersonKey(key, aliasMap));
    if (!target || target.key === key) continue;
    byKey.set(target.key, await absorb(client, target, row, counts));
    byKey.delete(key);
  }
  return byKey;
}

export async function syncPeople(
  client: NotionClient,
  ids: HyroxNotionIds,
  stats: readonly PersonStats[],
  existing: readonly PeopleRow[],
  aliasMap: ReadonlyMap<string, string>,
): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }> {
  const counts = emptyCounts();
  const byKey = await mergePeople(client, existing, aliasMap, counts);
  const pageIdByKey = new Map<string, string>();
  for (const person of stats) {
    pageIdByKey.set(person.key, await upsert(client, ids.peopleDb, personProperties(person), byKey.get(person.key), counts));
  }
  const computed = new Set(stats.map((person) => person.key));
  for (const row of byKey.values()) {
    if (computed.has(row.key) || !row.isNextApplied) continue;
    // ハッシュも空に戻す: 後で同じ値に戻ったとき、差分判定でハッシュが一致して書き戻されなくなるのを防ぐため。
    await client.updatePage(row.pageId, { 次回申込: prop.checkbox(false), [HASH]: prop.text("") });
    counts.updated += 1;
  }
  return { pageIdByKey, counts };
}

export async function syncRecords(
  client: NotionClient,
  ids: HyroxNotionIds,
  records: readonly ClassRecord[],
  pageIdByKey: ReadonlyMap<string, string>,
  existing: readonly RecordRow[],
  aliasMap: ReadonlyMap<string, string>,
  absentKeys: ReadonlySet<string>,
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, counts);
  const byKey = new Map(unique.map((row) => [row.key, row]));
  for (const record of records) {
    const personPageId = pageIdByKey.get(record.personKey);
    if (!personPageId) throw new Error("参加記録の人のページが見つかりません");
    await upsert(
      client,
      ids.recordsDb,
      {
        キー: prop.title(record.key),
        開催日: prop.date(record.date),
        開始時刻: prop.text(record.startTime),
        クラス: prop.select(record.classType),
        人: prop.relation([personPageId]),
        状態: prop.select(record.status),
        回次: prop.number(record.ordinal),
        予約番号: prop.text(record.reservationNos.join(", ")),
        ...(absentKeys.has(record.key) ? { 出欠: prop.select("欠席") } : {}),
      },
      byKey.get(record.key),
      counts,
    );
  }
  const computed = new Set(records.map((record) => record.key));
  for (const row of unique) {
    if (computed.has(row.key)) continue;
    if (canonicalPersonKey(row.personKey, aliasMap) !== row.personKey) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
    } else if (row.status !== VANISHED) {
      // ハッシュも空に戻す: 記録が元の値のまま復活したとき、差分判定で書き換わらなくなるのを防ぐため。
      await client.updatePage(row.pageId, { 状態: prop.select(VANISHED), [HASH]: prop.text("") });
      counts.updated += 1;
    }
  }
  return counts;
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/notionSync.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add scripts/hyrox-class/fixtures/fakeNotion.ts scripts/hyrox-class/notionSync.ts scripts/hyrox-class/notionSync.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス参加者の Notion 同期を追加する

変化した行だけを書き、別名に当たる人の行は統合先へ吸収する。スタッフが入れた別名・メモ・
出欠は消さない。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: 1回分の実行

> 実装後の fix コミット(owner 決定)で buildAliasMap / absorb / runSync を変更した。最新はコードを正とする。


**Files:**
- Create: `scripts/hyrox-class/sync.ts`
- Test: `scripts/hyrox-class/sync.test.ts`

**Interfaces:**
- Consumes: Task 2〜9 のすべて。`addDays` / `jstDate` / `jstDateTime`(`scripts/early-morning/dates.ts`)、`markBridgeFailed` / `readBridge` / `writeBridge` / `type WriteCounts`(`scripts/early-morning/notionSync.ts`)、`type FlexMessage`(`scripts/early-morning/lineMessage.ts`)
- Produces: `interface SyncDeps { notion: NotionClient; now: Date; ids: HyroxNotionIds & { ledgerDb: string; peopleDbUrl: string } }` / `interface SyncSummary { sessions: number; people: number; records: number; todaySessions: number; skippedRows: number; missingEventName: number; writes: WriteCounts }` / `runSync(deps: SyncDeps): Promise<SyncSummary>`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/hyrox-class/sync.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readBridge } from "../early-morning/notionSync";
import { FakeNotion } from "./fixtures/fakeNotion";
import { ledgerProps } from "./fixtures/notionProps";
import { LEDGER_COLUMNS } from "./ledger";
import { runSync } from "./sync";

const ids = {
  ledgerDb: "ledger",
  peopleDb: "people",
  recordsDb: "records",
  sessionsDb: "sessions",
  bridgePage: "bridge",
  peopleDbUrl: "https://www.notion.so/people",
};

/** JST 2026-10-07(水) 08:30。 */
const now = new Date("2026-10-06T23:30:00Z");
const BEGINNER = "HYROX TRAINING @ DAISUKE CLASS ビギナーの部";

function setup(): FakeNotion {
  const notion = new FakeNotion();
  notion.columns = [...LEDGER_COLUMNS];
  notion.seed("ledger", ledgerProps({ no: "#10", name: "架空一郎", date: "2026-09-30", slot: "20:00～21:00" }));
  notion.seed("ledger", ledgerProps({ no: "#11", name: "架空一郎", date: "2026-10-07", slot: "19:00～19:50", event: BEGINNER }));
  notion.seed("ledger", ledgerProps({ no: "#12", name: "架空二郎", date: "2026-10-07", slot: "19:00～19:50", event: BEGINNER }));
  notion.seed(
    "ledger",
    ledgerProps({ no: "#13", name: "架空二郎", date: "2026-09-22", slot: "09:00～09:50", event: "HYROX体験会｜種目と器具を一通り体験できる50分（初心者OK）" }),
  );
  notion.seed("ledger", ledgerProps({ no: "#14", name: "架空三郎", date: "2026-10-09", slot: "20:00～21:00" }));
  return notion;
}

describe("runSync", () => {
  it("台帳から集計して Notion に書き、今日の回の Flex を橋渡しページに置く", async () => {
    const notion = setup();

    const summary = await runSync({ notion, now, ids });

    expect(summary).toEqual({
      sessions: 3,
      people: 3,
      records: 4,
      todaySessions: 1,
      skippedRows: 0,
      missingEventName: 0,
      writes: { created: 10, updated: 0, archived: 0 },
    });
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.nextDate).toBe("2026-10-07");
    expect(bridge?.status).toBe("ok");
    const flex = JSON.stringify(bridge?.flex);
    expect(flex).toContain("19:00 ビギナーの部  2名");
    expect(flex).toContain("ビギナーは初めて(通常回1回)");
    expect(flex).toContain("これまで: 体験会(9/22)");
  });

  it("2回目の実行は変化がなければ Notion の DB に書かない", async () => {
    const notion = setup();
    await runSync({ notion, now, ids });

    const second = await runSync({ notion, now, ids });

    expect(second.writes).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it("今日 LINE に載せる回がなければ nextDate と flex は null", async () => {
    const notion = setup();

    const summary = await runSync({ notion, now: new Date("2026-10-07T23:30:00Z"), ids });

    expect(summary.todaySessions).toBe(0);
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.nextDate).toBeNull();
    expect(bridge?.flex).toBeNull();
  });

  it("台帳の取得に失敗したら DB に書かず、橋渡しを失敗にして投げ直す", async () => {
    const notion = setup();
    notion.failQueryDb = "ledger";

    await expect(runSync({ notion, now, ids })).rejects.toThrow("query ledger failed");

    expect(notion.live("people")).toEqual([]);
    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.status).toBe("failed");
    expect(bridge?.failure).toBe("予約台帳: query ledger failed");
  });

  it("橋渡しの失敗記録にも失敗したら、元の例外を投げる", async () => {
    const notion = setup();
    notion.failQueryDb = "ledger";
    notion.failAppend = true;

    await expect(runSync({ notion, now, ids })).rejects.toThrow("query ledger failed");
  });

  it("Error 以外が投げられても、失敗理由を文字列にして残す", async () => {
    class RejectingNotion extends FakeNotion {
      override async queryAll(): Promise<never> {
        return Promise.reject("boom");
      }
    }
    const notion = new RejectingNotion();
    notion.columns = [...LEDGER_COLUMNS];

    await expect(runSync({ notion, now, ids })).rejects.toBe("boom");

    const bridge = await readBridge(notion, "bridge");
    expect(bridge?.failure).toBe("予約台帳: boom");
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/hyrox-class/sync.test.ts`
Expected: FAIL(`Failed to resolve import "./sync"`)

- [ ] **Step 3: 最小の実装を書く**

`scripts/hyrox-class/sync.ts`:

```ts
/** HYROX DAISUKE CLASS 集計の1回分の実行。失敗時は橋渡しページを「失敗」にしてから例外を投げ直す。 */
import { addDays, jstDate, jstDateTime } from "../early-morning/dates";
import type { FlexMessage } from "../early-morning/lineMessage";
import type { NotionClient } from "../early-morning/notionClient";
import { markBridgeFailed, writeBridge, type WriteCounts } from "../early-morning/notionSync";
import { buildAttendance, type Attendance } from "./attendance";
import { buildHistoryIndex, historyBefore } from "./history";
import { buildAliasMap } from "./identity";
import { fetchLedgerRows } from "./ledger";
import { buildFlexMessage, selectEntries, type LineEntry } from "./lineMessage";
import { buildNotes } from "./lineNotes";
import { computeStats } from "./metrics";
import {
  deriveAbsentKeys,
  deriveAliasLinks,
  readHyroxState,
  syncPeople,
  syncRecords,
  syncSessions,
  type HyroxNotionIds,
} from "./notionSync";
import type { LedgerRow, Session } from "./types";

export interface SyncDeps {
  notion: NotionClient;
  now: Date;
  ids: HyroxNotionIds & { ledgerDb: string; peopleDbUrl: string };
}

export interface SyncSummary {
  sessions: number;
  people: number;
  records: number;
  todaySessions: number;
  skippedRows: number;
  missingEventName: number;
  writes: WriteCounts;
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

/** 今日の回のうち、申込(欠席でない)が1人以上いる回と、その参加者。 */
function todayItems(
  attendance: Attendance,
  today: string,
  historyIndex: ReadonlyMap<string, readonly LedgerRow[]>,
): { session: Session; entries: LineEntry[] }[] {
  const notes = buildNotes({ today, records: attendance.records, historyIndex });
  const people = new Map(attendance.people.map((person) => [person.key, person]));
  return attendance.sessions
    .filter((session) => session.date === today)
    .map((session) => ({ session, entries: selectEntries(session, attendance.records, people, notes) }))
    .filter((item) => item.entries.length > 0);
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const today = jstDate(deps.now);
  const updatedAt = jstDateTime(deps.now);
  const { notion, ids } = deps;

  const ledger = await step(deps, "予約台帳", () => fetchLedgerRows(notion, ids.ledgerDb));
  // スタッフ入力を古いスナップショットで上書きしないよう、台帳の取得のあと(書き込みの直前)に読む。
  const state = await step(deps, "Notion読み取り", () => readHyroxState(notion, ids));

  const aliasMap = buildAliasMap(deriveAliasLinks(state.people));
  const absentKeys = deriveAbsentKeys(state.records, aliasMap);
  const attendance = buildAttendance({ rows: ledger.rows, aliasMap, absentKeys });
  const historyIndex = buildHistoryIndex(ledger.rows, aliasMap);
  const tomorrow = addDays(today, 1);
  const stats = computeStats({
    people: attendance.people,
    records: attendance.records,
    today,
    historyByPerson: new Map(attendance.people.map((person) => [person.key, historyBefore(historyIndex, person.key, tomorrow)])),
  });
  const items = todayItems(attendance, today, historyIndex);
  const flex: FlexMessage | null =
    items.length > 0 ? buildFlexMessage({ date: today, sessions: items, updatedAt, notionUrl: ids.peopleDbUrl }) : null;

  const writes = await step(deps, "Notion書き込み", async () => {
    const sessionCounts = await syncSessions(notion, ids, attendance.sessions, attendance.records, state.sessions);
    const people = await syncPeople(notion, ids, stats, state.people, aliasMap);
    const recordCounts = await syncRecords(notion, ids, attendance.records, people.pageIdByKey, state.records, aliasMap, absentKeys);
    await writeBridge(notion, ids.bridgePage, { nextDate: flex ? today : null, updatedAt, status: "ok", failure: null, flex });
    return addCounts(sessionCounts, people.counts, recordCounts);
  });

  return {
    sessions: attendance.sessions.length,
    people: attendance.people.length,
    records: attendance.records.length,
    todaySessions: items.length,
    skippedRows: ledger.skipped,
    missingEventName: attendance.missingEventName,
    writes,
  };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/sync.test.ts`
Expected: PASS

- [ ] **Step 5: カバレッジを確認する**

Run: `npx vitest run --coverage 2>&1 | grep -E "hyrox-class|All files"`
Expected: `scripts/hyrox-class/` の全ファイル(`fixtures/` を含む)が 100%(入口 `hyrox-sync.ts` は Task 11 で作るのでまだ無い)。未到達の行があれば、その行を通すテストを該当タスクのテストファイルに足す(実装を削って合わせない)。

- [ ] **Step 6: コミット**

```bash
git add scripts/hyrox-class/sync.ts scripts/hyrox-class/sync.test.ts
git commit -F - <<'EOF'
feat: HYROX クラス集計の1回分の実行を追加する

台帳の取得と Notion 読み取りに失敗したら DB を書かず、橋渡しページに失敗を残す。
今日 LINE に載せる回があるときだけ Flex を置く。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Notion の作成・ID・実行入口・runbook(PR (b) の最後)

**Files:**
- Create: `scripts/hyrox-class/notionIds.ts`
- Test: `scripts/hyrox-class/notionIds.test.ts`
- Create: `scripts/hyrox-class/hyrox-sync.ts`
- Modify: `package.json`(`scripts` に `hyrox:sync` を追加)
- Modify: `vitest.config.ts`(`coverage.exclude` に入口を追加)
- Modify: `docs/testing/growth-coverage-alternatives.json` / `docs/testing/growth-coverage-alternatives.md`
- Modify: `docs/operations/interactive-analysis-runbook.md`(「台帳の個人情報の扱い」の例外に追記)

**Interfaces:**
- Consumes: `runSync`(Task 10)、`createNotionClient`(`scripts/early-morning/notionClient.ts`)、`defaultFetch`(`scripts/growth/http.ts`)
- Produces: `NOTION_IDS`(`ledgerDb` / `peopleDb` / `recordsDb` / `sessionsDb` / `bridgePage` / `peopleDbUrl`)。`npm run hyrox:sync`

- [ ] **Step 1: 失敗するテストを書く(ID の形の検査。Step 3 で実 ID を入れるまで失敗する)**

`scripts/hyrox-class/notionIds.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NOTION_IDS } from "./notionIds";

describe("NOTION_IDS", () => {
  it("すべての ID が Notion の32桁の16進数で、一覧の URL は参加者 DB を指す", () => {
    for (const name of ["ledgerDb", "peopleDb", "recordsDb", "sessionsDb", "bridgePage"] as const) {
      expect(NOTION_IDS[name], name).toMatch(/^[0-9a-f]{32}$/u);
    }
    expect(NOTION_IDS.peopleDbUrl).toBe(`https://www.notion.so/${NOTION_IDS.peopleDb}`);
  });

  it("予約台帳は早朝集計と同じ DB", () => {
    expect(NOTION_IDS.ledgerDb).toBe("f93a73e9821e4a70b8ed72d3b413c203");
  });
});
```

Run: `npx vitest run scripts/hyrox-class/notionIds.test.ts`
Expected: FAIL(`Failed to resolve import "./notionIds"`)

- [ ] **Step 2: Notion に親ページ・3 DB・橋渡しページを作る(Notion コネクタ。コントローラーが行う)**

Notion コネクタ(`notion-create-pages` / `notion-create-database` / `notion-create-view`)で次を作る。すべて同じ親ページの下に置く。

1. 親ページ「HYROX クラス参加者」(ワークスペースの非公開ページ)。本文: `DAISUKE CLASS の参加者集計(npm run hyrox:sync が書き込む)。個人名を含むため、ファイル・コミットに書き出さない。設計: docs/superpowers/specs/2026-09-29-hyrox-class-attendance-design.md`
2. DB「HYROX 参加者」: `氏名` TITLE / `識別子` RICH_TEXT / `別名` RICH_TEXT / `通算` NUMBER / `ビギナー` NUMBER / `通常` NUMBER / `ダブルス` NUMBER / `初参加日` DATE / `最終参加日` DATE / `状態` SELECT('新顔','常連','ご無沙汰','通常') / `次回申込` CHECKBOX / `利用歴` RICH_TEXT / `メモ` RICH_TEXT / `同期ハッシュ` RICH_TEXT
3. DB「HYROX 参加記録」: `キー` TITLE / `開催日` DATE / `開始時刻` RICH_TEXT / `クラス` SELECT('ビギナー','通常','ダブルス') / `人` RELATION(「HYROX 参加者」のデータソース)/ `状態` SELECT('申込','キャンセル','元データになし') / `回次` NUMBER / `出欠` SELECT('欠席') / `予約番号` RICH_TEXT / `同期ハッシュ` RICH_TEXT
4. DB「HYROX 開催回」: `キー` TITLE / `開催日` DATE / `開始時刻` RICH_TEXT / `クラス` SELECT('ビギナー','通常','ダブルス') / `イベント名` RICH_TEXT / `申込数` NUMBER / `同期ハッシュ` RICH_TEXT
5. ページ「今日の DAISUKE CLASS(通知橋渡し)」(本文は空でよい。`writeBridge` がコードブロックを置く)
6. 「HYROX 参加者」のビュー: 次回の参加者(`次回申込` = true)/ 新顔(`状態` = 新顔)/ ご無沙汰(`状態` = ご無沙汰)/ 通算ランキング(`通算` 降順)/ 別名が入っている行(`別名` が空でない)

作成後、2〜5 の ID(URL の末尾32桁の16進数。ハイフンは除く)を控える。

**人間の作業(オーナー)**: 親ページ「HYROX クラス参加者」を Notion の連携 `bigban-growth` に共有する(「…」→「接続」→ bigban-growth)。共有が済むまで Step 7 は実行できない。

- [ ] **Step 3: ID を書く**

`scripts/hyrox-class/notionIds.ts`(`<…>` には Step 2 で控えた実際の ID を入れる。32桁の16進数以外が残っていれば Step 4 のテストが失敗する):

```ts
/**
 * HYROX 参加者集計が読み書きする Notion の ID。秘密情報ではない(アクセスには NOTION_TOKEN が要る)。
 * 親ページ「HYROX クラス参加者」は bigban-growth 連携に共有済みであること。
 */
const PEOPLE_DB = "<HYROX 参加者 DB の ID>";

export const NOTION_IDS = {
  ledgerDb: "f93a73e9821e4a70b8ed72d3b413c203",
  peopleDb: PEOPLE_DB,
  recordsDb: "<HYROX 参加記録 DB の ID>",
  sessionsDb: "<HYROX 開催回 DB の ID>",
  bridgePage: "<今日の DAISUKE CLASS(通知橋渡し)ページの ID>",
  peopleDbUrl: `https://www.notion.so/${PEOPLE_DB}`,
} as const;
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run scripts/hyrox-class/notionIds.test.ts`
Expected: PASS

- [ ] **Step 5: 実行入口と npm スクリプトを書く**

`scripts/hyrox-class/hyrox-sync.ts`:

```ts
/**
 * HYROX DAISUKE CLASS 参加者集計の実行入口。
 *
 *   npm run hyrox:sync
 *
 * .env.local の NOTION_TOKEN を使う。標準出力は件数だけ(個人名は出さない)。
 * HYROX_SYNC_TODAY=YYYY-MM-DD を付けると、その日の 08:30 JST として実行する(LINE の試し送り専用。
 * Notion の集計値もその日時点になるので、試し送りのあとは付けずにもう一度実行して戻す)。
 * 終了コード: 0 = 成功 / 1 = 失敗(Notion の橋渡しページに理由を残している)。
 * 薄い配線のためテスト対象外(ロジックは sync.ts でテスト済み)。
 */
import { existsSync, readFileSync } from "node:fs";

import { parse } from "dotenv";

import { createNotionClient } from "../early-morning/notionClient";
import { defaultFetch } from "../growth/http";
import { NOTION_IDS } from "./notionIds";
import { runSync } from "./sync";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const [key, value] of Object.entries(parse(readFileSync(".env.local")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveNow(): Date {
  const override = process.env.HYROX_SYNC_TODAY;
  if (!override) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(override)) throw new Error("HYROX_SYNC_TODAY は YYYY-MM-DD で指定してください。");
  return new Date(`${override}T08:30:00+09:00`);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  loadEnvLocal();
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN を .env.local に設定してください。");
  const notion = createNotionClient({ token, fetchFn: defaultFetch, sleep });
  const startedAt = Date.now();
  const summary = await runSync({ notion, now: resolveNow(), ids: NOTION_IDS });
  process.stdout.write(
    [
      `開催回 ${summary.sessions} / 人 ${summary.people} / 参加記録 ${summary.records} / 今日の回 ${summary.todaySessions}`,
      `書き込み 作成${summary.writes.created}・更新${summary.writes.updated}・アーカイブ${summary.writes.archived}`,
      `読めない台帳行 ${summary.skippedRows} / イベント名が空 ${summary.missingEventName}`,
      `所要 ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`hyrox:sync に失敗しました: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
```

`package.json` の `scripts` に、`"early:sync"` の次の行として追加する:

```json
    "hyrox:sync": "tsx scripts/hyrox-class/hyrox-sync.ts"
```

(`"early:sync"` の行末にカンマを足す。)

- [ ] **Step 6: カバレッジ除外を登録する**

`vitest.config.ts` の `coverage.exclude` の末尾(`"scripts/early-morning/early-sync.ts",` の次)に追加:

```ts
        // HYROX クラス集計の実行入口(薄い I/O 入口)。ロジックは sync.ts でテスト済み。
        "scripts/hyrox-class/hyrox-sync.ts",
```

`docs/testing/growth-coverage-alternatives.json` の `exclusions` の末尾(`"scripts/early-morning/early-sync.ts": {…}` の後ろにカンマを付けて)に追加:

```json
    "scripts/hyrox-class/hyrox-sync.ts": {
      "reason": "HYROXクラス集計CLIの薄いI/O入口",
      "guarantees": [
        "scripts/hyrox-class/sync.test.ts"
      ],
      "kind": "alternative-test",
      "residualRisk": "実環境固有の結線はCI外",
      "excludedFiles": [
        "scripts/hyrox-class/hyrox-sync.ts"
      ]
    }
```

`docs/testing/growth-coverage-alternatives.md` の表の最後の行の次に追加:

```markdown
| `scripts/hyrox-class/hyrox-sync.ts` | `scripts/hyrox-class/sync.test.ts` | alternative-test | 実環境固有の結線はCI外 |
```

Run: `npx vitest run vitest.config.test.ts`
Expected: PASS(除外と対応表のパスの集合が一致する)

- [ ] **Step 7: runbook に例外を追記する**

`docs/operations/interactive-analysis-runbook.md` の「台帳の個人情報の扱い」にある早朝の例外の段落(`**例外(2026-09-29〜)**: Notion ページ「早朝ピックル常連」…`)の直後に、空行を1行はさんで追加:

```markdown
**例外(2026-09-29〜)**: Notion ページ「HYROX クラス参加者」配下の DB(HYROX 参加者・HYROX 参加記録・HYROX 開催回)と「今日の DAISUKE CLASS(通知橋渡し)」ページには、コーチとスタッフの声かけのため氏名と参加集計・施設の利用歴(種類と回数)を置く。連絡先は置かない。書き込むのは `npm run hyrox:sync` だけ。通知先の LINE グループにはコーチが入っている。設計: `docs/superpowers/specs/2026-09-29-hyrox-class-attendance-design.md`
```

- [ ] **Step 8: PR (b) の全体確認**

```bash
npx vitest run --coverage 2>&1 | grep -E "hyrox-class|All files|ERROR|Coverage for"
npx tsc --noEmit
npm run lint
```

Expected: `scripts/hyrox-class/`(入口を除く)がすべて 100%、しきい値エラーなし、`tsc` と `lint` はエラー0件。

- [ ] **Step 9: 実データでの受け入れ確認(Step 2 の共有が済んでから)**

```bash
npm run hyrox:sync
```

Expected: 終了コード 0。標準出力の `読めない台帳行` と `イベント名が空` が 0。続けてもう一度実行し、`書き込み 作成0・更新0・アーカイブ0` になること(ただし当日の日付が変わる前に実行する)。

そのうえで会話内で照合する(結果はファイルに残さない):
- Notion「HYROX 開催回」の 8/28〜 の各回の `申込数` が、LaBOLA 管理画面の各回の参加人数と一致する
- 「HYROX 参加者」に同じ人が表記ゆれで2行に分かれていれば、オーナーに見せて `別名` を入れてもらい、再実行して統合されることを確かめる

- [ ] **Step 10: コミット**

```bash
git add scripts/hyrox-class/notionIds.ts scripts/hyrox-class/notionIds.test.ts scripts/hyrox-class/hyrox-sync.ts package.json vitest.config.ts docs/testing/growth-coverage-alternatives.json docs/testing/growth-coverage-alternatives.md docs/operations/interactive-analysis-runbook.md
git commit -F - <<'EOF'
feat: HYROX クラス集計の実行入口と Notion の ID を追加する

npm run hyrox:sync で台帳から集計して Notion に書く。個人名を Notion に置く例外を runbook に明記する。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 11: PR (b) の区切り**

ここで作業を止め、確認を待つ。PR タイトル: `feat: HYROX DAISUKE CLASS の Notion 同期と LINE の Flex を追加する`。

---

### Task 12: クラウドルーチンのプロンプトと作成(PR (c))

> 2026-09-30 オーナー決定で集計もクラウドルーチンに統合した(8:45 の1本)。ローカル定期実行(Task 13 Step 3)は行わない。最新は `docs/growth/routines/hyrox-class-notify.md` と設計書 §3 を正とする。

**Files:**
- Create: `docs/growth/routines/hyrox-class-notify.md`

**Interfaces:**
- Consumes: `NOTION_IDS.bridgePage`(Task 11)、橋渡しの JSON の形(`nextDate` / `updatedAt` / `status` / `failure` / `flex`、早朝と同じ)
- Produces: クラウドルーチン「HYROX クラス当日通知」(無効の状態で作成)

- [ ] **Step 1: プロンプトの正本を書く**

`docs/growth/routines/hyrox-class-notify.md`(`<bridgePage の ID>` は `scripts/hyrox-class/notionIds.ts` の `bridgePage` と同じ値にする):

````markdown
# HYROX DAISUKE CLASS 当日通知(クラウドルーチン)

> 毎日 09:00 JST に実行。今日 DAISUKE CLASS がある日だけ、コーチ入りの LINE グループへ送る。それ以外の日は何もしない(沈黙が正常)。
> 設計: `docs/superpowers/specs/2026-09-29-hyrox-class-attendance-design.md` §11
> このファイルが正本。クラウドルーチンにはこの本文をそのまま貼っている。直したらルーチンも同じ内容に更新する。

あなたは HYROX DAISUKE CLASS の当日通知係です。判定や集計はしません。Notion の橋渡しページにある Flex メッセージを、条件を確かめて送るだけです。

## 手順

1. 基準日を JST で確定する:
   `TODAY=$(TZ=Asia/Tokyo date +%Y-%m-%d)`
2. Notion コネクタでページ「今日の DAISUKE CLASS(通知橋渡し)」(ID: `<bridgePage の ID>`)を取得し、本文の JSON コードブロックを読む。コードブロックが複数あるときは**最後のもの**が最新。キーは `nextDate` / `updatedAt` / `status` / `failure` / `flex`。
3. `nextDate` が `TODAY` と違う、または `flex` が null なら、何も送らずに終了する(これは正常)。
4. 警告行を決める(該当するものを上から順に、最大2行):
   - `status` が `"failed"` → `⚠ {failure の「:」より前}の処理に失敗したため前回のデータです`
   - `updatedAt` の日付部分(先頭10文字)が `TODAY` より前 → `⚠ 最新ではありません(最終更新 {updatedAt の M/D HH:MM})`
5. 警告行があれば、`flex.contents.body.contents` の**先頭**に、行ごとに次のオブジェクトを挿入する(文言以外は変えない):
   `{"type":"text","text":"<警告行>","size":"xs","color":"#D64545","wrap":true}`
   Flex のそれ以外の部分は一切変更しない。
6. 送信する。JSON は `payload.json` にファイルとして書き出してから送る(`jq` など追加のツールは使わない):
   - `payload.json` の中身は `{"to": "<LINE_HYROX_GROUP_ID の値>", "messages": [<手順5の後の flex>]}`。値は `printenv LINE_HYROX_GROUP_ID` で読む
   - 送信:
   ```
   curl -s -o resp.txt -w "%{http_code}" -X POST https://api.line.me/v2/bot/message/push \
     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @payload.json
   ```
   200 以外なら、HTTP コードと resp.txt の本文を報告して終了する。
7. `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_HYROX_GROUP_ID` が未設定、または Notion に到達できないときは送らずに報告する。

## 禁止

- 参加者の並べ替え・名前の変更・回数の再計算・所見(各参加者の下の灰色の行)の書き換え
- 橋渡しページ以外の Notion への書き込み
- 予約メールチェックの LINE グループ(`LINE_GROUP_ID`)へ送ること
- 個人名をファイルやコミットに残すこと(この作業はリポジトリに何も書かない)
````

- [ ] **Step 2: ルーチンを無効の状態で作る(コントローラーが RemoteTrigger で行う)**

1. `RemoteTrigger` の `get` で予約メールチェック(`trig_01WrQc3hbfT8QgDcm8SdLBaV`)を読み、`job_config.ccr.environment_id`(`env_016yu2zZKZC73qPmuKVKeSFY`)・`session_context`・Notion の `mcp_connections` の形を確かめる。
2. `RemoteTrigger` の `create` で次の内容のルーチンを作る:
   - 名前: `HYROX クラス当日通知`
   - `cron_expression`: `CRON_TZ=Asia/Tokyo 0 9 * * *`
   - `enabled`: `false`(Task 13 で有効にする)
   - 環境: 予約メールチェックと同じ `env_016yu2zZKZC73qPmuKVKeSFY`
   - `allowed_tools`: 予約メールチェックと同じ(`Bash` / `Read` / `Write` / `Edit` / `Glob` / `Grep` / `WebFetch` / `WebSearch`)
   - MCP 接続: Notion だけ
   - プロンプト: Step 1 のファイルの本文(`#` 見出しから末尾まで)をそのまま
3. 作成結果の実行時刻(次回 9:00 JST)とルーチンの URL をオーナーに伝える。

- [ ] **Step 3: コミット**

```bash
git add docs/growth/routines/hyrox-class-notify.md
git commit -F - <<'EOF'
docs: HYROX クラス当日通知のクラウドルーチンのプロンプトを追加する

コーチ入りのグループへ、橋渡しページの Flex を条件を確かめて送るだけにする(集計はしない)。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: 試し送り・有効化(ローカル定期実行は不要)

> 2026-09-30 オーナー決定で集計もクラウドルーチンに統合した(8:45 の1本)。ローカル定期実行(Task 13 Step 3)は行わない。最新は `docs/growth/routines/hyrox-class-notify.md` と設計書 §3 を正とする。

**Files:** なし(運用設定。リポジトリは変更しない)

**Interfaces:**
- Consumes: `npm run hyrox:sync`(Task 11)、クラウドルーチン(Task 12)

- [ ] **Step 1: 人間の作業の確認**

オーナーに次の2点が済んでいるか確認する。済んでいなければここで止まる。
- コーチ入りの LINE グループに Bot を招待し、グループ ID を取得して、クラウド環境 `env_016yu2zZKZC73qPmuKVKeSFY` に `LINE_HYROX_GROUP_ID` として登録した
- Notion の親ページ「HYROX クラス参加者」を連携 `bigban-growth` に共有した(Task 11 Step 2)

- [ ] **Step 2: 試し送り**

クラウドルーチンは実行のたびに集計(手順2)をやり直し、橋渡しを上書きする。試し送りはこの前提で行う。

基本(開催日の朝):
1. 開催日の朝(08:20 以降・予約メールチェックの記帳の後、8:45 より前)に、`RemoteTrigger` の `run` でルーチンを手動実行する。集計から当日分の送信まで本番と同じ流れで確かめられる。
2. `list_runs` → `get_run_log` で HTTP 200 で送れたことを確かめる。
3. オーナー(またはコーチ)にグループの表示を確認してもらう。見出し・人数・参加者・何回目・所見・Notion ボタンの見た目に OK をもらう。

開催日以外に試す場合:
1. 台帳で参加者のいる過去の開催日を1つ選び(例: 2026-09-30)、ローカルでその日として集計する:
   ```bash
   HYROX_SYNC_TODAY=2026-09-30 npm run hyrox:sync
   ```
   Expected: `今日の回 1` 以上。
2. Notion コネクタで「今日の DAISUKE CLASS(通知橋渡し)」の JSON の `nextDate` だけを今日の日付(JST)に書き換える(`updatedAt` はそのまま。古いデータの警告行が出ることもあわせて確かめる)。
3. ルーチンのプロンプトの先頭に一時的に「今回は試し送り: 手順2(集計)を実行しない」の1行を足し、`RemoteTrigger` の `run` で手動実行する。`list_runs` → `get_run_log` で HTTP 200 を確かめる。
4. オーナー(またはコーチ)にグループの表示(警告行を含む)を確認してもらい、OK をもらう。
5. ルーチンのプロンプトを元の本文(`docs/growth/routines/hyrox-class-notify.md`)に戻す。日付の指定なしでもう一度実行して、Notion を今日時点に戻す:
   ```bash
   npm run hyrox:sync
   ```

- [ ] **Step 3: ローカルの定期実行(不要: クラウドに統合)**

2026-09-30 のオーナー決定で集計はクラウドルーチンの08:45に統合したため、ローカルの定期タスクは作らない。この Step は行わない。

- [ ] **Step 4: クラウドルーチンを有効にする**

オーナーの OK を得てから、`RemoteTrigger` の `update` で `enabled: true` にする。次回実行時刻をオーナーに伝える。

- [ ] **Step 5: 初回の実送信の確認(設計書 §14 完了の条件 4)**

次の開催日の 8:45 の送信を、オーナー(またはコーチ)にグループで確認してもらう。確認できたら、この計画は完了。
