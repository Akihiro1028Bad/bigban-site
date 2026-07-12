# グロース セルフチューニングループ SI1(学習ログ収集基盤)実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推奨)または superpowers:executing-plans でタスク単位に実装する。各ステップは checkbox(`- [ ]`)で進捗管理する。
> **本計画の実装者は Codex CLI**(`codex exec`)。各タスクは自己完結ブリーフとして渡され、実装者は**そのタスク 1 つ分しか見ない**。だから各タスクは正確なファイルパス・完全なインターフェース(Consumes/Produces のシグネチャ)・完全なテストケース・実行コマンドと期待結果・コミットメッセージまで含む。「〜と同様」「適切に」等のプレースホルダは禁止。曖昧さが致命的な箇所(要約アルゴリズムのルール表・プロパティ名・シリアライズ出力例)は具体値/コードを書く。
> **git commit は Codex にさせず、レビュー後に fable5 が代行する**(各タスク末尾のコミットメッセージ案は fable5 用)。**push しない**。

**Goal:** グロースループの運用中に生まれて捨てられている一次データ(①人間の手動リッチ編集の前後差分 ②AI 助言の採用 ③画像再生成の試行成否 ④工程失敗)を、Notion「学習ログ」DB に **1 行 = 1 イベントの追記専用台帳**として落とす基盤を作る。書き込みはすべて**ベストエフォート**(本処理を止めない・失敗は沈黙させず LINE 通知)。集計・提案は SI2(別計画)で weekly が拾う。本計画は spec `docs/superpowers/specs/2026-07-05-growth-self-tuning-loop-design.md` の **§3(SI1 詳細)・§6・§7・§8 フェーズ SI1** のみを対象とし、**SI2(weekly 統合)・`systemProposal.ts`・`weekly.md` は含めない**。

**Architecture:** 既存グロースループの設計思想を完全踏襲する。純ロジック(型・差分要約・プロパティ組み立て・集計)は `scripts/growth/learningLog.ts` に集約し `src/lib/growth/learningLog.ts` から 1 行再エクスポートする(既存 `advise.ts`/`metrics.ts` と同型・Notion HTTP 依存なし・100% カバレッジ)。Notion 書き込みは薄いラッパ `appendLearningLog`(`learningLog.ts` 内・`createPage` を注入)1 箇所に集約する。CLI `learning-log-cli.ts`(`append`/`append-fail`/`recent`・カバレッジ除外)が PC ループ/`run.mjs` からの唯一の追記経路になる。API route(手動リッチ編集・助言採用反映)は `next/server` の `after()`(レスポンス後実行・Next.js 16 で stable)で `appendLearningLog` を直接呼ぶ。DB 未追加(`GROWTH_LEARNING_LOG_DS` 未設定)でも全経路の本処理は止まらず、テストも全て通る設計にする。

**Tech Stack:** Next.js 16.2.9 App Router(`after()` は `next/server` から import・`runtime = "nodejs"`)/ TypeScript strict / zod(外部入力検証)/ Vitest(node 環境の route test は `// @vitest-environment node`)/ Notion REST(`scripts/growth/notion.ts` の `createPage`/`chunkRichText`/`queryDataSource`)/ LINE push(`scripts/growth/line.ts` の `pushTextMessage`)/ 通知スロットル(`scripts/growth/notify-throttle.ts`)。

**前提条件(タスクにしない・オーナーが MCP で実施):**
- Notion「学習ログ」DB をオーナー(メインセッション)が Notion MCP で作成する(§3.1 のプロパティ: `イベント`(title)・`種別`(select: 編集/採否/画像試行/工程失敗)・`記録時刻`(date)・`記事タイトル`(rich_text)・`ページID`(rich_text)・`対象`(rich_text)・`結果`(select: 成功/失敗/リトライ)・`要約`(rich_text)・`回数`(number))。
- 作成後、その data source ID を `GROWTH_LEARNING_LOG_DS` 環境変数に設定する。
- **本計画のコードは `GROWTH_LEARNING_LOG_DS` 未設定でも全テストが green になり、本処理を一切止めない**(T4 の欠落耐性で担保)。

**タスク分割の判断(1-2 行):** 純ロジック(型・差分要約・タイトル・プロパティ・集計)を先に固め(T1〜T3)、それを消費する Notion 書き込みラッパ(T4)と CLI(T5)を積み、最後に 4 つの書き込み箇所を結線する(T6=手動編集 / T7=助言採用 / T8=画像再生成 / T9=run.mjs 工程失敗)。結線は純ロジックとラッパが GREEN になってから行い、常時 GREEN を保つ。文書(T10)は最後。T6/T7 は API route なので既存 `route.test.ts` の作法で「学習ログ追記が発火する/失敗しても 200 が返る」ケースを含める。

## Global Constraints

- **TDD 必須**(Red → Green → Refactor)。実装より先に失敗するテストを書く。各タスクの Steps に Red→Green→コミットを明示する。
- **カバレッジ 100% ゲート**。純ロジック(`learningLog.ts`)は 100%。CLI(`learning-log-cli.ts`)・`run.mjs` 変更・API route の薄い配線は既存方針どおり扱う。`learning-log-cli.ts` は `vitest.config.ts` の `coverage.exclude` に**理由コメント付き**で追記する(T5)。`appendLearningLog` ラッパは純ロジック側に置き、fetch モックでテストする(T4・既存 route.test の `vi.mock("@/lib/growth/notion")` 作法と同型)。
- **TS strict / `any` 禁止**(外部入力は `unknown`+zod で narrowing)/ `import type` で型のみ import / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止(最後の手段のみ `@ts-expect-error`+理由)。
- **命名規約**: scripts 純ロジックは `scripts/growth/camelCase.ts`(既存は `learningLog.ts` のように camelCase・`advise.ts`/`metrics.ts` 参照)、CLI は `kebab-cli.ts`(`learning-log-cli.ts`)、`src/lib/growth/*` 再エクスポートは camelCase(`learningLog.ts`)。テストは co-located(`learningLog.test.ts`)。
- **純ロジック分離を維持する**。Notion HTTP・LINE 送信・fire-and-forget の配線は CLI/ラッパ薄層に押し出す。`learningLog.ts` の型・要約・プロパティ・集計は**決定的純関数**(LLM を呼ばない・I/O を持たない)。
- **Notion 書き込みは 1 箇所**(`appendLearningLog`)に集約する。API route も CLI も同じラッパを使う(重複実装しない)。
- **欠落耐性**: `GROWTH_LEARNING_LOG_DS` 未設定なら追記は静かにスキップ。設定済みで書き込み失敗したときだけ LINE 通知(throttle 経由)。**「DS 未設定」と「設定済みで失敗」を区別する**(前者は沈黙 OK・後者は通知)。
- **rich_text の 2000 字制限**を守る。`要約` は必ず `chunkRichText`(既存 `scripts/growth/notion.ts` L126)を通す。長い差分は要約側で 2000 字以内に落とす。
- **SI2 のスコープ混入禁止**: `systemProposal.ts`・`weekly.md` への「システム振り返り」工程追加・「施策提案」DB の `システム改善` カテゴリ・`recent` を weekly の `allow` に足すこと、は本計画に**入れない**(別計画 SI2)。本計画で作る `recent` CLI サブコマンドは、SI2 が後で使うための素地として作るだけ(weekly.md/run.mjs weekly `allow` は変更しない)。
- コミットは日本語 Conventional Commits。

---

## T1: `learningLog.ts` の型 + タイトル + プロパティ + 読み取り(純ロジック・TDD)

**Files:**
- Create: `scripts/growth/learningLog.ts`
- Create: `src/lib/growth/learningLog.ts`(`export * from "../../../scripts/growth/learningLog";` の 1 行のみ)
- Create: `scripts/growth/learningLog.test.ts`(本タスク分の describe。T2/T3 で同ファイルに describe を追記)

**Interfaces(Produces):**

```ts
// ── イベント種別・discriminated union(spec §3.4.3) ──
export type LearningEventKind = "編集" | "採否" | "画像試行" | "工程失敗";

export const LEARNING_EVENT_KINDS: readonly LearningEventKind[] = [
  "編集",
  "採否",
  "画像試行",
  "工程失敗",
];

export type LearningImageResult = "成功" | "失敗" | "リトライ";

export type LearningEvent =
  | { kind: "編集"; pageId: string; title: string; before: string; after: string }
  | { kind: "採否"; pageId: string; title: string; aspect: string; before: string; after: string }
  | { kind: "画像試行"; pageId: string; title: string; style: string; result: "成功" | "失敗"; attempt: number }
  | { kind: "工程失敗"; mode: string; exitCode: number | null; detail: string };

// ── Notion「学習ログ」DB のプロパティ名(日本語・spec §3.1) ──
export const LEARNING_LOG_PROPS = {
  event: "イベント",       // title
  kind: "種別",           // select
  recordedAt: "記録時刻",  // date
  articleTitle: "記事タイトル", // rich_text
  pageId: "ページID",      // rich_text
  target: "対象",         // rich_text(編集領域/観点/style/mode)
  result: "結果",         // select(成功/失敗/リトライ)
  summary: "要約",        // rich_text
  count: "回数",          // number
} as const;

export const LEARNING_LOG_RESULTS: readonly LearningImageResult[] = ["成功", "失敗", "リトライ"];

// ── タイトル生成(spec §3.4.1) ──
export function buildLearningLogTitle(event: LearningEvent, editHeadline?: string): string;

// ── プロパティ組み立て(spec §3.4 末尾) ──
// nowIso はイベント発生時刻(ISO8601)。編集/採否は summarizeEditDiff(T2)の要約文字列を summary に渡す。
export function buildLearningLogProps(event: LearningEvent, nowIso: string, summary: string): Record<string, unknown>;

// ── 読み取り(weekly 集計の入力・spec §3.2) ──
export interface LearningLogRow {
  id: string;
  kind: LearningEventKind | "その他"; // 未知 select は「その他」へ寄せる(黙って落とさない)
  recordedAtMs: number | null;
  articleTitle: string;
  pageId: string;
  target: string;
  result: LearningImageResult | "";
  summary: string;
  count: number | null;
}
export function parseLearningLogPage(page: NotionPage): LearningLogRow;
```

**Consumes:**
- `import { chunkRichText, type NotionPage } from "./notion";`(実体は `scripts/growth/notion.ts`。`chunkRichText(text: string): NotionRichTextItem[]`・空文字は `[]` を返す。`NotionPage.properties: Record<string, unknown>`)。
- `summarizeEditDiff` は T2 で追加するが、`buildLearningLogProps`/`buildLearningLogTitle` は**要約文字列を引数で受け取る**設計にし、T1 では差分要約に依存しない(T1 と T2 の順序独立を保つ)。

**実装詳細(曖昧さ排除・具体値):**

`buildLearningLogTitle(event, editHeadline)`(全角 60 字で切る。切る時は末尾に `…` を付けず単純 slice でよいが、**60 字ちょうどまで**にする):
- `編集`: `` `編集: ${editHeadline ?? "変更"} (${event.title.slice(0, 20)})` ``。`editHeadline` は T6/呼び出し側が `summarizeEditDiff().headline` を渡す(例「導入を短縮」)。空 title は `(無題)` にフォールバック(`event.title.trim() === "" ? "無題" : event.title.slice(0,20)`)。
- `採否`: `` `採用: ${event.aspect || "観点なし"} (${titleHead})` ``(`titleHead` は上と同じ 20 字切り+空フォールバック)。
- `画像試行`: `` `画像${event.result}: ${event.style} ×${event.attempt} (${titleHead})` ``。
- `工程失敗`: `` `失敗: ${event.mode} 異常終了(exit ${event.exitCode ?? "?"})` ``。
- 最後に `.slice(0, 60)` で全体を 60 字に丸める。

`buildLearningLogProps(event, nowIso, summary, titleHeadline?)`(**確定シグネチャ**: `buildLearningLogProps(event: LearningEvent, nowIso: string, summary: string, titleHeadline?: string): Record<string, unknown>`):
- 共通: `{ [LEARNING_LOG_PROPS.kind]: { select: { name: event.kind } }, [LEARNING_LOG_PROPS.recordedAt]: { date: { start: nowIso } }, [LEARNING_LOG_PROPS.event]: { title: chunkRichText(buildLearningLogTitle(event, titleHeadline)) }, [LEARNING_LOG_PROPS.summary]: { rich_text: chunkRichText(summary) } }`。
  - **title プロパティは rich_text と同じ要素構造**(`{ title: [{ text: { content } }] }`)なので `chunkRichText` の返り値をそのまま使える(タイトルは 60 字なので常に 1 要素)。
  - **`buildLearningLogProps` は内部で `buildLearningLogTitle(event, titleHeadline)` を呼ぶ**。`編集` の headline(「導入を短縮」等)は呼び出し側(T6)が `summarizeEditDiff().headline` を第 4 引数 `titleHeadline` で渡す。`summary` から機械抽出はしない。
- `編集`: 上記共通 + `{ [articleTitle]: { rich_text: chunkRichText(event.title) }, [pageId]: { rich_text: chunkRichText(event.pageId) } }`。**`編集` の `対象` は空 rich_text(`[]`)で確定**。region はタイトル(`titleHeadline`)と `要約`(T2 の summary 文字列の `[region]` 接頭辞)で表現し、`event` に region フィールドは持たせない(T3 の集計は summary 接頭辞から読む)。
- `採否`: 上記共通 + `articleTitle`=`event.title`・`pageId`=`event.pageId`・`対象`=`{ rich_text: chunkRichText(event.aspect) }`(空なら `[]`)。`結果`/`回数` は入れない。
- `画像試行`: 上記共通 + `articleTitle`=`event.title`・`pageId`=`event.pageId`・`対象`=`{ rich_text: chunkRichText(event.style) }`・`結果`=`{ select: { name: event.result } }`・`回数`=`{ number: event.attempt }`。
- `工程失敗`: 上記共通 + `articleTitle`=`{ rich_text: [] }`(空)・`pageId`=`{ rich_text: [] }`・`対象`=`{ rich_text: chunkRichText(event.mode) }`・`結果`=`{ select: { name: "失敗" } }`。`回数` は入れない。
- **注意**: `summary` が空文字なら `chunkRichText("")` は `[]` を返す(既存仕様)。それで OK(空要約はプロパティ空)。

`parseLearningLogPage(page)`(欠落プロパティは空/既定へ・安全側。読み取りヘルパは `advise.ts` L153-178 の `readSelectName`/`readRichTextPlain`/`readTitlePlain`/`readDateStartMs` と**同じ実装**をこのファイルにも置く=`advise.ts` から import しない〔将来の結合を避ける〕):
- `id`= `page.id`。
- `kind`= `種別` select 名。`LEARNING_EVENT_KINDS` に含まれなければ `"その他"`。
- `recordedAtMs`= `記録時刻` date.start を `Date.parse`。無効/欠落は `null`。
- `articleTitle`= `記事タイトル` rich_text plain。`pageId`= `ページID` rich_text plain。`target`= `対象` rich_text plain。`summary`= `要約` rich_text plain。
- `result`= `結果` select 名。`LEARNING_LOG_RESULTS` に含まれなければ `""`。
- `count`= `回数` number(`page.properties["回数"]` の `{ number?: number | null }`)。無ければ `null`。

**受け入れ挙動:**
- 4 イベント型が正しいプロパティ形(title/select/date/rich_text/number)に変換される。
- `工程失敗` は `記事タイトル`/`ページID` が空・`結果`=`失敗`。
- `画像試行` は `結果`=成否・`回数`=attempt・`対象`=style。
- タイトルは 60 字で丸められ、空 title はフォールバックする。
- `parseLearningLogPage` は欠落・未知 select を安全に空/`その他`/`""` へ寄せる。

**テストケース一覧(`learningLog.test.ts` › T1 分):**
- `buildLearningLogTitle`: 4 種別のタイトル生成 / 60 字超の丸め / `event.title` が空文字のフォールバック(`無題`)/ `工程失敗` の `exitCode=null` → `exit ?`。
- `buildLearningLogProps`(4 イベント):
  - `編集`: kind=編集・recordedAt=nowIso・articleTitle/pageId が入る・要約が rich_text 化・結果/回数プロパティが**無い**。
  - `採否`: 対象=aspect・aspect 空なら `対象` rich_text=`[]`。
  - `画像試行`: 結果 select=成功/失敗・回数 number=attempt・対象=style。
  - `工程失敗`: articleTitle rich_text=`[]`・pageId rich_text=`[]`・結果=失敗・対象=mode。
  - 要約 2001 字を渡すと `要約` rich_text が 2 要素に分割される(chunkRichText 経由の担保)。
- `parseLearningLogPage`: 全プロパティ揃ったページ → 各フィールド一致 / 空ページ → 全て空/null/`その他`/`""` / `種別`=未知値 → `その他` / `結果`=未知値 → `""` / `記録時刻` 不正文字列 → `recordedAtMs=null`。

**参照イディオム:** `scripts/growth/advise.ts`(L20-30 のプロパティ定数オブジェクト・L153-178 の読み取りヘルパ・L181-184 の select 正規化)。`scripts/growth/notion.ts`(`chunkRichText`・`NotionPage`)。再エクスポートは `src/lib/growth/advise.ts`(`export * from "../../../scripts/growth/advise";` の 1 行)。

**Steps:**
- [ ] `learningLog.test.ts` に T1 分のテストを書く → RED(`npx vitest run scripts/growth/learningLog.test.ts`)
- [ ] `learningLog.ts` に型・`buildLearningLogTitle`・`buildLearningLogProps`・`parseLearningLogPage`・読み取りヘルパを実装 → GREEN
- [ ] `src/lib/growth/learningLog.ts` 再エクスポート 1 行作成 → `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): 学習ログの型・タイトル・プロパティ組み立て・読み取りを追加(SI1)`

---

## T2: `summarizeEditDiff`(差分要約・決定的純ロジック・TDD)

**Files:**
- Modify: `scripts/growth/learningLog.ts`(`summarizeEditDiff` と補助 `htmlToPlainBlocks` を追加)
- Modify: `scripts/growth/learningLog.test.ts`(`summarizeEditDiff` describe を追記)

**Interfaces(Produces):**

```ts
export interface EditDiffSummary {
  headline: string;           // 一言(タイトル用)。例「導入を短縮」「加筆」「言い換え」
  region: "導入" | "見出し" | "本文" | "全体"; // 主に変わった領域
  beforeChars: number;
  afterChars: number;
  delta: number;              // afterChars - beforeChars
  sample: { before: string; after: string }; // 最初の changed ブロックの before→after(各 200 字)
  noChange: boolean;          // added/removed/changed すべて 0
}

// HTML をトップレベルブロックのプレーンテキスト配列へ(タグ除去)。
export function htmlToPlainBlocks(html: string): string[];

// 前後本文 HTML からブロック単位 LCS で構造化要約を作る(LLM 非依存・決定的)。
export function summarizeEditDiff(before: string, after: string): EditDiffSummary;

// EditDiffSummary を `要約` プロパティ用の 1 本の文字列へ整形(2000 字で切る)。
export function formatEditDiffSummary(diff: EditDiffSummary): string;
```

**実装詳細(spec §3.4.2 のルールを完全にコード化・曖昧さ排除):**

`htmlToPlainBlocks(html)`:
- **既存の分割器を再利用する(確認済み)**: `scripts/growth/decorate.ts` に `splitTopLevelBlocks(html: string): TopLevelBlock[]`(L132)が export 済み。`import { splitTopLevelBlocks, type TopLevelBlock } from "./decorate";` して使う(重複実装しない・DRY)。`TopLevelBlock` は `{ html: string; tag: string; start: number; end: number }`(`tag`=小文字の開始タグ名・確認済み)。
  - 見出し判定は `tag` から: `isHeading = /^h[1-6]$/.test(block.tag)`(`blockKindOf` は不要・`tag` で足りる)。
  - 各ブロックのテキスト化: `block.html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()`。空テキストブロックは配列から除外する。
- **確定シグネチャ**: `export function htmlToPlainBlocks(html: string): { text: string; isHeading: boolean }[];`(`splitTopLevelBlocks` の各 `block.tag` で `isHeading` を導出)。

`summarizeEditDiff(before, after)`:
1. `beforeBlocks = htmlToPlainBlocks(before)`・`afterBlocks = htmlToPlainBlocks(after)`。
2. **ブロック(行)単位 LCS**: `beforeBlocks[i].text` と `afterBlocks[j].text` の**テキスト完全一致**で LCS(最長共通部分列)を取る。LCS に含まれない before 側ブロックを `removedBlocks`(順序保持の配列)、after 側を `addedBlocks` とする。`changed` は**単純に `Math.min(removedBlocks.length, addedBlocks.length)`**、余りを純 added/removed とみなす(近似で十分・文字単位 diff はしない):`removedCount = removedBlocks.length`・`addedCount = addedBlocks.length`・`changed = Math.min(removedCount, addedCount)`・`pureAdded = addedCount - changed`・`pureRemoved = removedCount - changed`。
3. `beforeChars = before.replace(/<[^>]+>/g,"").length`(タグ除去後の文字数)・`afterChars` 同様・`delta = afterChars - beforeChars`。
4. `noChange = removedCount === 0 && addedCount === 0`（LCS が両者全長= 完全一致・ブロック並びも同一）。
5. **headline 判定(決定的ルール表・上から順に最初に真になったもの)**:
   | 条件 | headline |
   |---|---|
   | `noChange` | `無変更` |
   | 変化したブロックがすべて見出しブロック(removed+added の全ブロックが `isHeading`) | `見出しを修正` |
   | 先頭ブロックが変わった(`beforeBlocks[0]?.text !== afterBlocks[0]?.text`)かつ全体の変化が小さい(`pureAdded + pureRemoved + changed <= 2`) | `導入を修正` |
   | `pureAdded > pureRemoved` | `加筆` |
   | `pureRemoved > pureAdded` | `短縮` |
   | それ以外(changed 中心・added≒removed) | `言い換え` |
   - 「変化したブロックがすべて見出し」の判定: `changedBlocks = [...removedBlocks, ...addedBlocks]`(LCS 外)を集め、`changedBlocks.length > 0 && changedBlocks.every(b => b.isHeading)`。
6. **region 判定(決定的・上から順)**:
   | 条件 | region |
   |---|---|
   | headline === `見出しを修正` | `見出し` |
   | 先頭ブロックが変わった(`beforeBlocks[0]?.text !== afterBlocks[0]?.text`) | `導入` |
   | 変化ブロック総数 `pureAdded+pureRemoved+changed >= 4` | `全体` |
   | それ以外 | `本文` |
7. `sample`: 最初の changed ペアを作る。**changed ペアの定義**: LCS 外の removed ブロックと added ブロックを配列順に zip し、その先頭ペアの `{ before: removedBlocks[0]?.text ?? "", after: addedBlocks[0]?.text ?? "" }` を各 `.slice(0, 200)`。両方無ければ `{ before: "", after: "" }`。

`formatEditDiffSummary(diff)`:
- `noChange` なら `"無変更"`。
- それ以外: `` `[${diff.region}] ${diff.headline} / ${diff.beforeChars}字→${diff.afterChars}字(${diff.delta >= 0 ? "+" : ""}${diff.delta})\n変更前: ${diff.sample.before}\n変更後: ${diff.sample.after}` ``。最後に `.slice(0, 2000)`。

**受け入れ挙動:**
- 加筆/短縮/言い換え/導入修正/見出し修正の headline が決定的に判定される。
- region が決定的に判定される。
- delta が正負で表示され、sample が 200 字で切られる。
- `noChange` が正しく検出される(完全一致 HTML → true)。
- 空入力・巨大入力(数万字)でも落ちず 2000 字以内の要約になる。

**テストケース一覧(`summarizeEditDiff` describe):**
- `htmlToPlainBlocks`: `<h2>見出し</h2><p>本文</p>` → `[{text:"見出し",isHeading:true},{text:"本文",isHeading:false}]` / 空/空白ブロック除外 / `&nbsp;` の空白化。
- headline: 純追加優位 → `加筆` / 純削除優位 → `短縮` / 同数 changed → `言い換え` / 先頭ブロックのみ変化+小規模 → `導入を修正` / 見出しブロックのみ変化 → `見出しを修正` / 完全一致 → `無変更`+`noChange=true`。
- region: 見出し変化 → `見出し` / 先頭変化 → `導入` / 4 ブロック以上変化 → `全体` / 中間段落 1 個変化 → `本文`。
- delta/文字数: before 100 字 after 60 字 → `delta=-40`(タグ除去後で数える担保として `<p>`+40字 の例で検証)。
- sample: 最初の changed ペアの before/after が各 200 字で切られる / changed が無い(純追加のみ)→ sample.before="" sample.after=先頭 added。
- `formatEditDiffSummary`: 2000 字超の sample を含む要約が 2000 字で切られる / noChange → `"無変更"`。
- 安全性: `summarizeEditDiff("","")` → noChange=true・全 0 / 巨大 HTML(3 万字)で throw しない。

**参照イディオム:** `scripts/growth/decorate.ts` の `splitTopLevelBlocks` 相当(あれば再利用・無ければ本関数内実装)。`scripts/growth/advise-apply.ts` L175-200 の `normalizeText`/ブロック照合の考え方(文字正規化)。

**Steps:**
- [ ] `sed -n '110,135p' scripts/growth/decorate.ts` で `TopLevelBlock`(`html`/`tag`/`start`/`end`)と `splitTopLevelBlocks` のシグネチャを確認(再利用のため)
- [ ] `summarizeEditDiff` describe を書く → RED(`npx vitest run scripts/growth/learningLog.test.ts`)
- [ ] `htmlToPlainBlocks`/`summarizeEditDiff`/`formatEditDiffSummary` を実装 → GREEN
- [ ] コミット案 `feat(growth): 手動編集の前後差分を決定的に要約する summarizeEditDiff を追加(SI1)`

---

## T3: `summarizeLearningLog`(集計・純ロジック・TDD)

**Files:**
- Modify: `scripts/growth/learningLog.ts`(`summarizeLearningLog` を追加)
- Modify: `scripts/growth/learningLog.test.ts`(`summarizeLearningLog` describe を追記)

**Interfaces(Produces):**

```ts
export interface LearningLogSummary {
  windowWeeks: number;
  totalRows: number;                          // ウィンドウ内の総件数
  countByKind: Record<LearningEventKind | "その他", number>;
  editRegionHeatmap: Record<string, number>;  // 編集イベントの region 別件数(target が空の編集は要約先頭から region を読めないため "不明")
  adoptAspectHeatmap: Record<string, number>; // 採否イベントの aspect(target)別件数
  imageRetryTop: { key: string; style: string; pageId: string; maxAttempt: number }[]; // 画像試行の (pageId+style) 別 最大 回数 降順
  failModeFrequency: Record<string, number>;  // 工程失敗の mode(target)別件数 降順で使えるよう key=mode
}

// 直近 windowWeeks 週(記録時刻 >= now - windowWeeks*7日)の行だけを集計する。
export function summarizeLearningLog(
  rows: readonly LearningLogRow[],
  nowMs: number,
  windowWeeks: number
): LearningLogSummary;
```

**実装詳細(spec §4.5・純ロジック):**
- ウィンドウ: `cutoff = nowMs - windowWeeks * 7 * 24 * 60 * 60 * 1000`。`recordedAtMs === null`(欠落)の行は**含める**(安全側・古いとは限らないため落とさない)か**除外**するかを決める必要がある → **除外する**(ウィンドウ集計の軸が無い行は傾向に使えない)。`recordedAtMs !== null && recordedAtMs >= cutoff` の行だけを対象。
- `countByKind`: 4 種別 + `その他` を 0 で初期化してからインクリメント。
- `editRegionHeatmap`: `kind==="編集"` の行について、region を `summary` から機械抽出する。`formatEditDiffSummary` の出力は先頭が `[${region}] `。**`summary.match(/^\[(導入|見出し|本文|全体)\]/)` で region を取り、取れなければ `"不明"`**。その region をキーにカウント。
- `adoptAspectHeatmap`: `kind==="採否"` の行の `target`(空なら `"不明"`)をキーにカウント。
- `imageRetryTop`: `kind==="画像試行"` の行を `key = ${pageId}::${target}`(target=style)でグルーピングし、各グループの `max(count ?? 0)` を `maxAttempt` とする。`maxAttempt` 降順にソートし**上位 10 件**を返す(`{ key, style: target, pageId, maxAttempt }`)。
- `failModeFrequency`: `kind==="工程失敗"` の行の `target`(mode・空なら `"不明"`)をキーにカウント。
- `totalRows`: ウィンドウ内の対象行数。

**受け入れ挙動:**
- ウィンドウ外(古い)行が除外される。`recordedAtMs=null` も除外される。
- 種別別件数・region ヒートマップ・aspect ヒートマップ・画像リトライ上位・失敗 mode 頻度が集計される。
- 0 件でも空サマリ(全カウント 0・配列空)を返し、throw しない。

**テストケース一覧(`summarizeLearningLog` describe):**
- ウィンドウ: 5 週前の行が windowWeeks=4 で除外される / 3 週前は含まれる / `recordedAtMs=null` は除外。
- `countByKind`: 各種別 + 未知種別(`その他`)がカウントされる。
- `editRegionHeatmap`: `[導入] ...` 要約 3 件で `{導入:3}` / 要約が region 抽出不能なら `不明`。
- `adoptAspectHeatmap`: aspect=`冗長` 2 件・空 1 件で `{冗長:2, 不明:1}`。
- `imageRetryTop`: 同一 pageId×style で count=1,3 の 2 行 → maxAttempt=3・maxAttempt 降順ソート・上位 10 件制限。
- `failModeFrequency`: mode=`revise` 3・`weekly` 1 → `{revise:3, weekly:1}`。
- 0 件 → 全カウント 0・配列空・throw しない。

**参照イディオム:** `scripts/growth/metricsReview.ts` の集計関数の型付け・`scripts/growth/digest.ts` の件数集約の形。

**Steps:**
- [ ] `summarizeLearningLog` describe を書く → RED
- [ ] 実装 → GREEN(`npx vitest run scripts/growth/learningLog.test.ts` で T1〜T3 全 green)
- [ ] コミット案 `feat(growth): 学習ログの直近ウィンドウ集計 summarizeLearningLog を追加(SI1)`

---

## T4: `appendLearningLog` ラッパ(Notion 書き込み集約・欠落耐性・TDD)

**Files:**
- Modify: `scripts/growth/learningLog.ts`(`appendLearningLog` と補助を追加)
- Modify: `scripts/growth/learningLog.test.ts`(`appendLearningLog` describe を追記)

**Interfaces(Produces):**

```ts
import type { NotionApiOptions } from "./notion";

export interface AppendLearningLogDeps {
  /** learning log DB の data source ID。未設定(undefined/空)ならスキップ。 */
  dataSourceId: string | undefined;
  notionOptions: NotionApiOptions;
  /** createPage を注入(テストで差し替え)。既定は notion.ts の createPage。 */
  createPageFn: (dataSourceId: string, props: Record<string, unknown>, options: NotionApiOptions) => Promise<string>;
  /** イベント発生時刻(既定 new Date().toISOString())。 */
  nowIso: string;
  /** 編集/採否の要約に使う前後差分(kind が 編集/採否 のときのみ)。 */
  diffSummary?: string;
  /** タイトルの headline(編集の「導入を短縮」等)。 */
  titleHeadline?: string;
}

export type AppendLearningLogOutcome =
  | { status: "skipped" }   // DS 未設定 → 静かにスキップ
  | { status: "appended"; pageId: string }
  | { status: "failed"; error: unknown }; // 設定済みで createPage が失敗 → 呼び出し側が通知

export async function appendLearningLog(
  event: LearningEvent,
  deps: AppendLearningLogDeps
): Promise<AppendLearningLogOutcome>;
```

**実装詳細:**
- `if (!deps.dataSourceId) return { status: "skipped" };`(DS 未設定=欠落耐性・沈黙 OK)。
- `props = buildLearningLogProps(event, deps.nowIso, deps.diffSummary ?? "", deps.titleHeadline)`。
- `try { const id = await deps.createPageFn(deps.dataSourceId, props, deps.notionOptions); return { status: "appended", pageId: id }; } catch (error) { return { status: "failed", error }; }`。
- **ラッパは throw しない**(常に outcome を返す)。通知(LINE)や dryrun 表示は呼び出し側(API route の `after()` / CLI)が outcome を見て行う。これにより「DS 未設定=沈黙」と「設定済み失敗=通知」を呼び出し側が区別できる。

**受け入れ挙動:**
- DS 未設定(`dataSourceId=undefined` or `""`)→ `createPageFn` を呼ばず `{status:"skipped"}`。
- DS 設定済み → `createPageFn(dataSourceId, props, options)` が呼ばれ `{status:"appended", pageId}`。
- `createPageFn` が reject → `{status:"failed", error}`(throw しない)。
- props は `buildLearningLogProps` の出力(T1 のテストで別途担保)。

**テストケース一覧(`appendLearningLog` describe):**
- DS 未設定 → `createPageFn` 未呼出・`{status:"skipped"}`(`vi.fn()` の `createPageFn` で `not.toHaveBeenCalled()`)。
- DS 設定済み・成功 → `createPageFn` が `(dataSourceId, props, options)` で呼ばれ `{status:"appended", pageId:"log-1"}`。props の `種別` が event.kind と一致。
- DS 設定済み・`createPageFn` reject(`new Error("notion down")`)→ `{status:"failed"}`・error が透過。
- `編集` イベントで `diffSummary`/`titleHeadline` が props/title に反映される(`buildLearningLogProps` 経由の結合確認)。

**参照イディオム:** `src/app/api/growth/draft/edit/route.test.ts` の `vi.mock("@/lib/growth/notion")` + `vi.fn()` 注入。ただし本タスクは純ロジック側テストなので、`createPageFn` を**引数注入**(モジュールモック不要)で差し替える(`advise.ts` が `fetchFn` を注入する思想と同型)。

**Steps:**
- [ ] `appendLearningLog` describe を書く → RED
- [ ] 実装 → GREEN
- [ ] コミット案 `feat(growth): 学習ログ書き込みラッパ appendLearningLog を追加(DS未設定スキップ・失敗透過)(SI1)`

---

## T5: `learning-log-cli.ts`(append / append-fail / recent)+ package.json + coverage 除外

**Files:**
- Create: `scripts/growth/learning-log-cli.ts`(薄い配線・カバレッジ除外)
- Modify: `package.json`(scripts に `growth:learning-log` と `growth:learning-log:recent` を追加)
- Modify: `vitest.config.ts`(`coverage.exclude` に `scripts/growth/learning-log-cli.ts` を理由コメント付きで追記)

**Interfaces(CLI 契約):**

```
npm run growth:learning-log -- append <種別> <ペイロードJSONファイル>
npm run growth:learning-log -- append-fail <mode> <exitCode> <detail>
npm run growth:learning-log -- recent [週数]        # 既定 4 週
npm run growth:learning-log:recent                  # = recent 4(weekly が SI2 で読む固定スクリプト・引数なし)
```

- `GROWTH_LEARNING_LOG_DS` 未設定時: `append`/`append-fail` は静かにスキップ(exit 0・no-op)。`recent` は空配列 `[]` を JSON 出力(exit 0)。
- `GROWTH_DRYRUN=1`: 書き込み/通知せず内容を stdout に表示。

**実装詳細(既存 `advise-cli.ts` の骨格を踏襲):**
- `import "dotenv/config";`・`import { readFileSync } from "node:fs";`。
- `import { defaultFetch } from "./http";`・`import { pushTextMessage } from "./line";`・`import { createPage, queryDataSource, type NotionApiOptions } from "./notion";`。
- `import { appendLearningLog, parseLearningLogPage, summarizeEditDiff, formatEditDiffSummary, LEARNING_LOG_PROPS, LEARNING_EVENT_KINDS, type LearningEvent } from "./learningLog";`。
- `import { shouldSendFailureNotice, failureSignature, type NotifyThrottleRecord } from "./notify-throttle";`。
- `const DS = process.env.GROWTH_LEARNING_LOG_DS;`・`const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);`。
- `requireEnv(name)`(`advise-cli.ts` L48-52 と同一)・`notionOptions()`(`{ token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch }`)。
- **入力 JSON のスキーマ検証(zod)**: `append` のペイロードは信頼できない外部入力なので zod で検証する。各 kind ごとにスキーマを定義(`learningLog.ts` に `LearningEventSchema`(discriminated union zod)を**T5 で追加**して import する。純ロジック側に置くことで検証も 100% カバレッジ対象にする):

  ```ts
  // learningLog.ts へ T5 で追加(純ロジック・テスト対象)
  export const LearningEventSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("編集"), pageId: z.string(), title: z.string(), before: z.string(), after: z.string() }),
    z.object({ kind: z.literal("採否"), pageId: z.string(), title: z.string(), aspect: z.string(), before: z.string(), after: z.string() }),
    z.object({ kind: z.literal("画像試行"), pageId: z.string(), title: z.string(), style: z.string(), result: z.enum(["成功","失敗"]), attempt: z.number().int().min(1) }),
    z.object({ kind: z.literal("工程失敗"), mode: z.string(), exitCode: z.number().nullable(), detail: z.string() }),
  ]);
  export function parseLearningEvent(raw: string): LearningEvent | null {
    try { const r = LearningEventSchema.safeParse(JSON.parse(raw)); return r.success ? r.data : null; } catch { return null; }
  }
  ```
  → **`parseLearningEvent` と `LearningEventSchema` は learningLog.ts に置き、learningLog.test.ts でテストする**(T5 の Steps に Red/Green を含める)。CLI はこれを使うだけ。

- `append(kind, jsonPath)`:
  - `const event = parseLearningEvent(readFileSync(jsonPath, "utf-8"));`。`if (!event) throw new Error("ペイロードJSONが不正です。");`。`if (event.kind !== kind) throw new Error("種別が一致しません。");`。
  - `編集`/`採否` は差分要約を作る: `const diff = summarizeEditDiff(event.before, event.after);`。**`編集` で `diff.noChange` なら追記スキップ**(spec §3.3.a「無変更は記録しない」・exit 0)。`const diffSummary = formatEditDiffSummary(diff);`・`const titleHeadline = event.kind === "編集" ? diff.headline : undefined;`。
  - `画像試行`/`工程失敗` は `diffSummary` 不要。ただし `画像試行` の `要約`= 依頼指示メモは event に無いので `diffSummary` を空にし、`工程失敗` の `要約`= `` `exit ${event.exitCode ?? "?"} / ${event.detail.slice(-500)}` `` を `diffSummary` に渡す(要約文字列として流用)。
  - DRYRUN 時は `buildLearningLogProps` の内容を stdout 表示して return。
  - `const outcome = await appendLearningLog(event, { dataSourceId: DS, notionOptions: notionOptions(), createPageFn: createPage, nowIso: new Date().toISOString(), diffSummary, titleHeadline });`。
  - `if (outcome.status === "failed") await notifyThrottled(event.kind, ...);`(下記)。`skipped`/`appended` は何もしない。
- `appendFail(mode, exitCodeStr, detail)`: `run.mjs`(d)専用ショートカット。`const event: LearningEvent = { kind: "工程失敗", mode, exitCode: exitCodeStr === "" ? null : Number(exitCodeStr), detail };`(`Number` が NaN なら `null`)。`diffSummary = ` `exit ${event.exitCode ?? "?"} / ${detail.slice(-500)}` ``。以降 `append` と同じ appendLearningLog 呼び出し。失敗時 throttled 通知。
- `recent(weeksStr)`: `const weeks = weeksStr ? Number(weeksStr) : 4;`(NaN/0 以下は 4)。`if (!DS) { process.stdout.write("[]\n"); return; }`。`記録時刻 >= now - weeks*7日` の `filter` で `queryDataSource(DS, { filter, sorts:[{property:"記録時刻", direction:"descending"}], pageSize: 100 }, options)`。`filter` は `{ property: "記録時刻", date: { on_or_after: new Date(cutoffMs).toISOString() } }`。`pages.map(parseLearningLogPage)` を `JSON.stringify` して stdout 出力。**全行スキャンしない**(pageSize 100・1 ページのみ・spec §3.6/§4.5)。**ただし `pages.length === 100` のときは stderr に `警告: 学習ログが100件で打ち切られました(直近${weeks}週にそれ以上あります)` を出す**(沈黙切り捨て禁止・stdout の JSON は汚さない)。DRYRUN でも読み取りは実行してよい(書き込みなし)。
- `notifyThrottled(kind, pageId)`(失敗通知・spec §3.5): throttle 状態ファイルは CLI が管理する。**状態ファイル**は `.growth-tmp/learning-log-notify.json`(既存 `.growth-tmp` を使う)。読み書きは `advise-cli` にならい CLI 内で行う(純ロジックは `notify-throttle.ts` の `shouldSendFailureNotice`)。
  - `const signature = failureSignature("learning-log", kind);`。ウィンドウ `const WINDOW_MS = 30 * 60 * 1000;`(30 分・連投防止)。
  - 状態ファイル読み込み失敗は空配列(fail-open= 必ず送る・notify-throttle.ts のコメント方針)。`const decision = shouldSendFailureNotice(records, signature, Date.now(), WINDOW_MS);`。`writeFileSync` で `decision.records` を保存。
  - `if (decision.send)`: DRYRUN なら stdout 表示、そうでなければ `await pushTextMessage(requireEnv("LINE_GROUP_ID"), ` `学習ログの記録に失敗しました(${kind})。台帳への追記に失敗しています。` `, { channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"), fetchFn: defaultFetch });`。
  - 通知自体が失敗しても CLI の exit は変えない(best-effort)。
- `main()`: `advise-cli.ts` L175-199 と同じ骨格。`switch (command) { case "append": ...; case "append-fail": ...; case "recent": ...; default: throw }`。`main().catch` は stderr 出力 + `process.exitCode = 1`(既存踏襲)。**ただし append/append-fail の「本処理を止めない」制約は run.mjs/呼び出し側が exit を無視することで担保**(CLI 自体は不正引数で exit 1 にしてよい)。

**package.json 追加(既存の `growth:*` 命名慣習に合わせる。`growth:metrics` の直後あたりに追加):**
```json
    "growth:learning-log": "tsx scripts/growth/learning-log-cli.ts",
    "growth:learning-log:recent": "tsx scripts/growth/learning-log-cli.ts recent 4",
```

**vitest.config.ts 追加(`coverage.exclude` 配列の CLI 群〔`scripts/growth/metrics-cli.ts` 付近〕に追記):**
```ts
        // 学習ログ CLI(#SI1)。薄い I/O 配線(Notion 書き込み・LINE 通知・状態ファイル)。
        // 純ロジック(型・差分要約・集計・appendLearningLog・parseLearningEvent)は learningLog.ts でテスト済み。
        "scripts/growth/learning-log-cli.ts",
```

**受け入れ挙動:**
- `parseLearningEvent`(純ロジック・テスト対象)が 4 種別を検証し、不正 JSON/スキーマ不一致で `null`。
- DS 未設定で `append`/`append-fail` は no-op(exit 0)・`recent` は `[]`。
- `編集` で `noChange` なら追記しない。
- 書き込み失敗時に throttle 経由で LINE 通知(30 分ウィンドウ)。

**テストケース一覧:**
- **`learningLog.test.ts` › `parseLearningEvent`(純ロジック・T5 で追加)**: 4 種別の妥当 JSON → 対応する event / 不正 JSON → null / kind 欠落 → null / `画像試行` の `attempt=0` → null(min(1)) / `result` 未知値 → null。
- **CLI 自体はカバレッジ除外**なので専用テストは不要(既存 `advise-cli.ts` に単体テストが無いのと同じ)。動作確認は Steps の dryrun 手動確認で行う。

**Steps:**
- [ ] `learningLog.test.ts` に `parseLearningEvent`/`LearningEventSchema` の describe を書く → RED
- [ ] `learningLog.ts` に `LearningEventSchema`/`parseLearningEvent` を実装 → GREEN
- [ ] `learning-log-cli.ts` を実装 → `npx tsc --noEmit` 0
- [ ] `package.json` に 2 スクリプト追加・`vitest.config.ts` に除外追記
- [ ] 手動 dryrun 確認: `GROWTH_DRYRUN=1 npm run growth:learning-log -- append-fail revise 1 "test detail"`(DS 未設定なら no-op、設定+dryrun なら props 表示)/ `GROWTH_LEARNING_LOG_DS= npm run growth:learning-log:recent` → `[]`
- [ ] `npx vitest run scripts/growth/learningLog.test.ts` 全 green
- [ ] コミット案 `feat(growth): 学習ログ CLI(append/append-fail/recent)とイベント検証を追加(SI1)`

---

## T6: 手動リッチ編集の前後差分を結線 — `draft/edit/route.ts`(`after()`)

**Files:**
- Modify: `src/app/api/growth/draft/edit/route.ts`(成功直前に `after()` で学習ログ追記)
- Modify: `src/app/api/growth/draft/edit/route.test.ts`(追記発火 / 失敗しても 200 のケース追記)

**Consumes(実物のシグネチャ・現物確認済み):**
- `route.ts` L100 で `previousBody = draftBodyOf(page)`(旧本文)が既に手元にある。L116 で `sanitized = sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG)`(新本文)が手元にある。L99 で `title = ideaTitleOf(page).trim()`。L150 で `return NextResponse.json({ success: true });`(唯一の成功 return)。
- `notionOptions()`(L44-48)は `{ token, fetchFn: defaultFetch }` を返す(NOTION_TOKEN)。
- **追加 import**: `import { after } from "next/server";`(既存 L12 の `import { NextResponse } from "next/server";` と同じ行にまとめる)。`import { appendLearningLog, summarizeEditDiff, formatEditDiffSummary } from "@/lib/growth/learningLog";`・`import { createPage } from "@/lib/growth/notion";`(既存 L19-24 の notion import に `createPage` を足す)。
- `after()` は Next.js 16 で `next/server` から stable export(context7 確認済み・`runtime="nodejs"` の Route Handler で使用可・レスポンス後実行・**エラー時も callback は走るが、本コードは成功パスの中でのみ `after()` を呼ぶので失敗保存は記録されない**)。

**Produces(結線点):**
- **`return NextResponse.json({ success: true });`(L150)の直前**に以下を挿入する。ここは microCMS 同期まで完全成功した点(spec §3.3.a「保存が完全成功したときのみ」)。

  ```ts
  // #SI1: 手動リッチ編集の前後差分を学習ログへベストエフォート追記(after=レスポンス後実行)。
  // 本処理(保存)の成否には一切影響させない。無変更保存は記録しない。
  const learningLogDs = process.env.GROWTH_LEARNING_LOG_DS;
  const editDiff = summarizeEditDiff(previousBody, sanitized);
  if (learningLogDs && !editDiff.noChange) {
    after(async () => {
      const outcome = await appendLearningLog(
        { kind: "編集", pageId, title, before: previousBody, after: sanitized },
        {
          dataSourceId: learningLogDs,
          notionOptions: notionOpts,
          createPageFn: createPage,
          nowIso: new Date().toISOString(),
          diffSummary: formatEditDiffSummary(editDiff),
          titleHeadline: editDiff.headline,
        }
      );
      if (outcome.status === "failed") {
        // 沈黙させない: 失敗をサーバログへ(LINE throttle 通知は PC 側 CLI が担う。
        // route から LINE を叩くと Vercel 側に LINE トークンが要る&連投制御の状態ファイルが持てないため、
        // route はサーバログのみ・記録漏れの可視化は CLI 経路〔T5/T8/T9〕と weekly の突き合わせで担保)。
        console.error("learning-log append failed (draft/edit)", outcome.error);
      }
    });
  }
  return NextResponse.json({ success: true });
  ```

- **`pageId` の型**: L67 で `const pageId = (body...).pageId;` は `unknown` だが L69 の `isNotionPageId(pageId)` narrowing 後は `string`。`appendLearningLog` に渡すのは narrowing 済みの `pageId`。`title`/`previousBody`/`sanitized` はいずれも `string`。
- **注**: spec §3.5 は API route の失敗を「LINE 通知(throttle)」と書くが、**Vercel サーバレスからの LINE 通知は (1) LINE トークンを Vercel 環境に置く必要があり (2) throttle 状態ファイルを持てない**。そこで本計画は route 側は `console.error`(サーバログ)に留め、LINE throttle 通知は状態ファイルを持てる PC 側 CLI 経路(T5/T8/T9)に集約する。これは spec の「沈黙させない」原則(記録漏れを可視化する)を満たしつつ、Vercel 制約と両立する**計画側の確定判断**(Self-Review で spec 逸脱として明記)。

**受け入れ挙動:**
- 変更ありの保存が完全成功 → `after()` 内で `appendLearningLog` が `編集` イベントで呼ばれる。
- 無変更保存(`before===after`)→ `after()` を登録しない(追記しない)。
- `GROWTH_LEARNING_LOG_DS` 未設定 → `after()` を登録しない(本処理は従来どおり 200)。
- 学習ログ追記が失敗しても Web レスポンスは `{success:true}`・200(after はレスポンス後)。
- 保存が失敗(409/404/502/400)する経路では `after()` に到達しない(失敗保存は記録しない)。

**テストケース一覧(`route.test.ts` に追記・既存作法):**
- `after()` のテスト方法: **`vi.mock("next/server", ...)` で `after` を `vi.fn((cb) => cb())`(即時実行)にモック**し、`createPage`(notion モック)が `編集` プロパティで呼ばれることを検証する。既存テストは `vi.mock("@/lib/growth/notion", ...)` で `getPage`/`updatePageProps` をモックしているので、そこに `createPage: vi.fn()` を足す。
  - `next/server` モック例:
    ```ts
    vi.mock("next/server", async (orig) => ({
      ...(await orig<typeof import("next/server")>()),
      after: vi.fn((cb: () => unknown) => { void cb(); }),
    }));
    ```
- 追記発火: `GROWTH_LEARNING_LOG_DS="ds-log"` 設定・変更あり保存(previousBody と新 bodyHtml が異なる)→ `createPage` が `("ds-log", propsWith種別=編集, opts)` で呼ばれる。previousBody を持たせるには既存 `patchDraft失敗時ロールバック` テスト(L208)の `BODY_MIRROR_PROP` セット方法を使い、新旧が異なる本文にする。
- 無変更スキップ: previousBody と保存本文が(サニタイズ後)同一 → `createPage` 未呼出・200。
- DS 未設定: `delete process.env.GROWTH_LEARNING_LOG_DS` → `createPage` 未呼出・200(既存の成功テストが回帰しない)。
- 追記失敗でも 200: `createPage` を reject させても `res.status===200`・`{success:true}`(after 内 try/catch=appendLearningLog が throw しないため。念のため `console.error` が呼ばれることは検証しない〔ログは実装詳細〕)。
- 保存失敗時は未発火: getPage 409(生成中)→ `createPage` 未呼出。

**参照イディオム:** `src/app/api/growth/draft/edit/route.test.ts`(`vi.mock("@/lib/growth/notion")`・`pageWith` ヘルパ・`BODY_MIRROR_PROP` の旧本文セット L208-214)。`context7` で確認した `after` の Route Handler 用法。

**Steps:**
- [ ] `route.test.ts` に `next/server` モック + 追記発火/無変更/DS未設定/失敗でも200/失敗時未発火のケースを書く → RED
- [ ] `route.ts` に import 追加 + L150 直前の結線を実装 → GREEN(`npx vitest run src/app/api/growth/draft/edit/route.test.ts`)
- [ ] `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): 手動リッチ編集の前後差分を学習ログへ追記(after結線)(SI1)`

---

## T7: 助言採用の反映を結線 — advise-apply / comment-revise(client → `draft/edit`)

**背景(現物確認済み・重要):** advise-apply(#165)と comment-revise(#182)の「採用 → 本文反映」は**サーバの反映 API ではなくクライアントで完結**する。`src/app/growth/approve/hooks/useAdviceConsult.ts` L111-144 `applyNow` が `applyAdviceItems(bodyHtml, proposal)` で本文を書き換え、`POST /api/growth/draft/edit`(L121)で保存する。comment-revise も `src/app/growth/approve/hooks/useBodyCommentConsult.ts` L147 `applyNow` が同様に `applyBodyCommentProposal` → `POST /api/growth/draft/edit`(L156)。**採用 fix の観点(aspect)はクライアント側にしかない**(advise は `AdviceFix.area`、comment は指摘テキスト)。T6 で `draft/edit` は既に `編集` を記録するが、これらの反映も `編集` として記録されてしまう。spec §3.3.b は `採否`(aspect 付き)として記録することを要求する。

**確定判断(計画側):** `draft/edit` の POST body に**任意の `source` フィールド**を足し、client の `applyNow` から `source: "advise-apply"` または `source: "comment-revise"` と、採用 fix の aspect 配列 `adoptedAspects: string[]` を渡す。route は `source` が助言採用系なら `after()` で `編集` の代わりに **fix ごとに 1 行 `採否`** を追記する(spec §3.3.b「複数 fix なら fix ごとに 1 行」)。aspect が無い場合は空文字。**却下は記録しない**(applyNow は採用したものだけ保存するので自然に満たす)。

**Files:**
- Modify: `src/app/api/growth/draft/edit/route.ts`(POST body に任意 `source`/`adoptedAspects` を受理し、`source` 有りなら `編集` でなく `採否` を追記)
- Modify: `src/app/api/growth/draft/edit/route.test.ts`(source 付きで `採否` が fix ごとに追記されるケース)
- Modify: `src/app/growth/approve/hooks/useAdviceConsult.ts`(`applyNow` の `draft/edit` POST に `source`/`adoptedAspects` を付与)
- Modify: `src/app/growth/approve/hooks/useBodyCommentConsult.ts`(同上)
- Modify(必要時): 各 hook の co-located テストがあれば追随(下記で確認)

**Consumes(実物・確認済み):**
- `useAdviceConsult.ts` L113 `const { html, applied, skipped } = applyAdviceItems(bodyHtml, adviceApply.proposal);`。`applied` は反映された `AdviceApplyItem[]`。**`AdviceApplyItem`(`scripts/growth/advise-apply.ts` L132-140)は `{ fixIndex, before, after }` で aspect(area)を直接持たない**。観点(area)は `advice.fixes[fixIndex].area` に居る。`useAdviceConsult` は `advice`(`AdviceView`)を props で受け取れる(L14 `advice?: AdviceView`)。→ **aspect は `applied.map(item => advice?.advice?.fixes[item.fixIndex]?.area ?? "")` で導出する**(`advice` が無ければ空・欠落耐性)。`AdviceFix.area`(`advise.ts` L62-70)が観点(文体/構成/読みやすさ 等)。
- `useBodyCommentConsult.ts` L148 `const { html, applied, skipped } = applyBodyCommentProposal(bodyHtml, proposal);`。**`BodyCommentProposalItem`(`scripts/growth/bodyComment.ts` L151-159)は `{ commentIndex, before, after }` で aspect テキストを持たない**。comment の指摘テキストは `comments`(送ったコメント配列)側にあるが、hook が反映時に comment 本文を保持しているとは限らない。→ **comment-revise の aspect は一律 `"インラインコメント"`(固定文字列)にする**(`applied.map(() => "インラインコメント")`)。これで「comment 由来の採用」であることは `対象`=`インラインコメント` で区別でき、細分は SI1 スコープ外(将来拡張)。

**Produces:**
- **route.ts の POST body 受理**(T6 の結線を分岐):
  ```ts
  const source = (body as { source?: unknown })?.source;
  const rawAspects = (body as { adoptedAspects?: unknown })?.adoptedAspects;
  const isAdopt = source === "advise-apply" || source === "comment-revise";
  const adoptedAspects: string[] = Array.isArray(rawAspects)
    ? rawAspects.filter((a): a is string => typeof a === "string").slice(0, 20)
    : [];
  ```
  T6 の結線ブロックを次のように分岐する(成功 return 直前):
  ```ts
  const learningLogDs = process.env.GROWTH_LEARNING_LOG_DS;
  if (learningLogDs) {
    if (isAdopt && adoptedAspects.length > 0) {
      // #SI1(b): 採用 fix ごとに 1 行「採否」を追記(却下は client 側で送られない)。
      after(async () => {
        for (const aspect of adoptedAspects) {
          const outcome = await appendLearningLog(
            { kind: "採否", pageId, title, aspect, before: previousBody, after: sanitized },
            { dataSourceId: learningLogDs, notionOptions: notionOpts, createPageFn: createPage,
              nowIso: new Date().toISOString(), diffSummary: `採用観点: ${aspect}` }
          );
          if (outcome.status === "failed") console.error("learning-log append failed (adopt)", outcome.error);
        }
      });
    } else {
      // #SI1(a): 手動編集(source なし)は「編集」を 1 行。無変更はスキップ(T6 のブロック)。
      const editDiff = summarizeEditDiff(previousBody, sanitized);
      if (!editDiff.noChange) {
        after(async () => { /* T6 と同じ 編集 追記 */ });
      }
    }
  }
  return NextResponse.json({ success: true });
  ```
  - **`採否` の要約**: before/after 全文は載せない(台帳肥大防止)。`採用観点: ${aspect}` を要約とする(spec §3.4.2 は編集の差分要約用。採否は観点主体でよい)。before/after は `event` に持つが `buildLearningLogProps` の `採否` は要約=引数 `diffSummary` を使うので全文は入らない。
- **useAdviceConsult.ts `applyNow`**(L121 の fetch body を変更):
  ```ts
  const adoptedAspects = applied.map((item) => advice?.advice?.fixes[item.fixIndex]?.area ?? "");
  const saveRes = await fetch("/api/growth/draft/edit", {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ pageId, bodyHtml: html, source: "advise-apply", adoptedAspects }),
  });
  ```
  - `advice` は `useAdviceConsult` の props(L14 `advice?: AdviceView`)。`AdviceView.advice.fixes[i].area`(`advise.ts`)が観点。`applyNow` が `advice` を参照するため、`useAdviceConsult` の分割代入(L38-43)に `advice` を含める(現状 `adviceApply`/`bodyHtml` は取っているが `advice` は取っていない場合、追加する)。
- **useBodyCommentConsult.ts `applyNow`**(L156 の fetch body を変更): `source: "comment-revise"`・`adoptedAspects: applied.map(() => "インラインコメント")`(固定文字列・comment 由来を区別)。

**受け入れ挙動:**
- advise 採用反映 → `draft/edit` に `source:"advise-apply"` + aspect 配列が POST され、fix ごとに `採否` 行が追記される。
- comment 採用反映 → `source:"comment-revise"` で `採否` 行が追記される。
- `source` 無し(手動リッチ編集)→ 従来どおり `編集` 行(T6)。
- 追記失敗しても保存レスポンスは 200(after 後実行)。
- DS 未設定 → 追記なし・保存は 200。

**テストケース一覧:**
- **route.test.ts**: `source:"advise-apply"` + `adoptedAspects:["冗長","敬体乱れ"]` → `createPage` が 2 回(aspect ごと)`種別=採否`・`対象=冗長`/`敬体乱れ` で呼ばれる / `source` 無し → `種別=編集`(T6 のケースと排他) / `adoptedAspects` 空 → `採否` 追記なし(手動編集扱いになり `編集` を記録) / `source` 付きでも DS 未設定 → 追記なし・200 / 追記失敗でも 200。
- **hook テスト**(co-located があれば): `applyNow` の fetch body に `source`/`adoptedAspects` が含まれる。**まず `ls src/app/growth/approve/hooks/*.test.*` で `useAdviceConsult`/`useBodyCommentConsult` のテスト有無を確認**。無ければ `ApproveClient.test.tsx` 経由の既存反映テストが回帰しないことのみ確認(MSW の `/api/growth/draft/edit` ハンドラが body の追加フィールドを無視するなら追加不要)。

**参照イディオム:** `useAdviceConsult.ts` L61-78 `postJson`/L111-144 `applyNow`。`useBodyCommentConsult.ts` L147-183 `applyNow`。route の POST body narrowing は `draft/edit/route.ts` L67-75 の `unknown` からの取り出し方。

**Steps:**
- [ ] `ls src/app/growth/approve/hooks/useAdviceConsult.test.* useBodyCommentConsult.test.*` でテスト有無確認
- [ ] `useAdviceConsult` の分割代入(L38-43)に `advice` が含まれているか確認し、無ければ追加(applyNow が `advice.advice.fixes` を参照するため)
- [ ] route.test.ts に `採否` 分岐ケースを書く → RED
- [ ] route.ts の分岐・両 hook の POST body を実装 → GREEN(`npx vitest run src/app/api/growth/draft/edit/ src/app/growth/approve/`)
- [ ] `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): 助言採用の反映を学習ログへ採否として追記(advise-apply/comment-revise)(SI1)`

---

## T8: 画像再生成の試行を結線 — `body-image-regen-cli.ts` / `eyecatch-regen-cli.ts`

**背景(現物確認済み):** 両 CLI とも `done`(成功)/`fail`(失敗)で試行が確定する。`body-image-regen-cli.ts` の `done`(L192-227)/`fail`(L229-234)は `row = bodyRegenRowFromPage(getPage(...))` を持ち、`row.title`・`row.requestedStyle`(= `RequestedBodyImageStyle`)が取れる。`eyecatch-regen-cli.ts` の `done`(L167-188)/`fail`(L190-195)は `row.title` を持つが **style を持たない**(アイキャッチは単一・スタイル概念が row に無い)→ eyecatch は `style="eyecatch"` 固定で記録する。

**Files:**
- Modify: `scripts/growth/body-image-regen-cli.ts`(done/fail の Notion 書き込み後に学習ログ追記)
- Modify: `scripts/growth/eyecatch-regen-cli.ts`(done/fail の Notion 書き込み後に学習ログ追記)

**Consumes(実物):**
- 両 CLI に既に `import { defaultFetch } from "./http";`・`createPage` は無いので **`notion.ts` の import に `createPage` を追加**(body-image-regen-cli は L36-44 の notion import・eyecatch-regen-cli は L35-41)。
- `import { appendLearningLog } from "./learningLog";`。`import { spawnSync }` は使わず、CLI 内で直接 `appendLearningLog` を呼ぶ(CLI は `.ts` なので純ロジック直呼び可)。
- 失敗通知(throttle)は T5 の `learning-log-cli` の `notifyThrottled` と同じロジックが必要 → **重複を避けるため、`notifyThrottled` 相当を `learningLog.ts` に純ロジックとして持たせず**、各 CLI は「appendLearningLog が `failed` を返したら stderr に出す」に留める(spec §3.5 CLI 分は「失敗を stderr に出し、learning-log CLI が自前で LINE 通知」だが、body/eyecatch CLI は learning-log CLI を経由せず直接 appendLearningLog を呼ぶ設計なので、**失敗時はこれらの CLI 内で直接 `pushTextMessage` を throttle 付きで送る**。throttle 状態ファイルとロジックは T5 と共通化する)。
  - **共通化の確定判断**: throttle 通知ヘルパを純ロジック化して重複を消す。`learningLog.ts` に **`buildLearningLogFailNotice(kind: string): string`**(通知本文の純関数)を追加し、throttle 判定は各 CLI が `notify-throttle.ts` の `shouldSendFailureNotice` を直接使う。状態ファイルパス `.growth-tmp/learning-log-notify.json` を 3 CLI(learning-log/body-image-regen/eyecatch-regen)で共有する。**状態ファイル read/write のヘルパを `learning-log-cli.ts` から export すると CLI 間依存になる**ため、各 CLI に 10 行程度の同一 throttle 配線をコピーする(CLI はカバレッジ除外・薄い配線なので許容)。

**Produces:**
- **body-image-regen-cli.ts `done`**(L222 `await write(pageId, {...done props}, options);` の後・L223 の notifyFlex の後):
  ```ts
  // #SI1(c): 画像再生成の成功試行を学習ログへ。attempt=直近4週の同一(pageId,style)件数+1。
  await recordImageAttempt(pageId, row.title, row.requestedStyle, "成功", options);
  ```
- **body-image-regen-cli.ts `fail`**(L232-233 の後): `await recordImageAttempt(pageId, title, /* style */ styleOfRow, "失敗", options);`。**注意**: `fail` は `title` しか取っていない(L231)。style を得るには `fail` でも `bodyRegenRowFromPage` から `requestedStyle` を読む必要がある → L231 を `const row = bodyRegenRowFromPage(await getPage(pageId, options)); const title = row.title;` に変え、`row.requestedStyle` を使う。
- **`recordImageAttempt` ヘルパ**(各 CLI 内に定義):
  ```ts
  async function countRecentImageAttempts(pageId: string, style: string, options: NotionApiOptions): Promise<number> {
    const ds = process.env.GROWTH_LEARNING_LOG_DS;
    if (!ds) return 0;
    const cutoff = new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { pages } = await queryDataSource(ds, {
        filter: { and: [
          { property: "種別", select: { equals: "画像試行" } },
          { property: "ページID", rich_text: { contains: pageId } },
          { property: "対象", rich_text: { equals: style } },
          { property: "記録時刻", date: { on_or_after: cutoff } },
        ] },
        pageSize: 100,
      }, options);
      return pages.length;
    } catch { return 0; } // 数えられない時は 0(→ attempt=1・欠落耐性)
  }
  async function recordImageAttempt(pageId: string, title: string, style: string, result: "成功"|"失敗", options: NotionApiOptions): Promise<void> {
    const ds = process.env.GROWTH_LEARNING_LOG_DS;
    const attempt = (await countRecentImageAttempts(pageId, style, options)) + 1;
    if (DRYRUN) { process.stdout.write(`[dry-run] learning-log 画像試行 ${style} ×${attempt} ${result}\n`); return; }
    const outcome = await appendLearningLog(
      { kind: "画像試行", pageId, title, style, result, attempt },
      { dataSourceId: ds, notionOptions: options, createPageFn: createPage, nowIso: new Date().toISOString() }
    );
    if (outcome.status === "failed") {
      process.stderr.write(`learning-log 画像試行の記録に失敗: ${String(outcome.error)}\n`);
      await notifyLearningLogFailThrottled("画像試行"); // 下記 throttle 配線
    }
  }
  ```
  - `attempt` は spec §3.3.c どおり「直近 4 週の (pageId,style) 件数 + 1」。数えられない(DS 未設定/失敗)ときは 1(欠落耐性)。**`回数` フィールドで累積を表す**方式(spec §3.3.c 確定方式)。`結果` は成否のみ(`リトライ` は将来予約)。
- **eyecatch-regen-cli.ts** も同型。ただし `style="eyecatch"` 固定(row に style が無い)。`done`(L184 の後)/`fail`(L194 の後)に `await recordImageAttempt(pageId, row.title /* or title */, "eyecatch", "成功"|"失敗", options);`。`fail`(L190-195)は `title` のみ取得なので `regenRowFromPage(...).title` をそのまま使い、style は固定文字列。
- **throttle 通知配線**(各 CLI 内・T5 と同一・カバレッジ除外):
  ```ts
  import { shouldSendFailureNotice, failureSignature, type NotifyThrottleRecord } from "./notify-throttle";
  import { buildLearningLogFailNotice } from "./learningLog";
  // 状態ファイル: .growth-tmp/learning-log-notify.json（3 CLI 共有）
  async function notifyLearningLogFailThrottled(kind: string): Promise<void> {
    const path = ...(.growth-tmp/learning-log-notify.json);
    let records: NotifyThrottleRecord[] = [];
    try { records = JSON.parse(readFileSync(path, "utf-8")); } catch { records = []; }
    const decision = shouldSendFailureNotice(records, failureSignature("learning-log", kind), Date.now(), 30*60*1000);
    try { mkdirSync(dir, {recursive:true}); writeFileSync(path, JSON.stringify(decision.records)); } catch {}
    if (!decision.send) return;
    if (DRYRUN) { process.stdout.write(`[dry-run] LINE: ${buildLearningLogFailNotice(kind)}\n`); return; }
    try { await pushTextMessage(requireEnv("LINE_GROUP_ID"), buildLearningLogFailNotice(kind), { channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"), fetchFn: defaultFetch }); } catch {}
  }
  ```
  - `buildLearningLogFailNotice(kind)` は **`learningLog.ts` に純関数として追加**(T8 で追加・テスト対象): `` `学習ログの記録に失敗しました(${kind})。台帳への追記に失敗しています。` ``。T5 の `learning-log-cli` の通知本文もこれを使う(重複排除)。
- **重要な非影響性**: `recordImageAttempt`/`notifyLearningLogFailThrottled` が失敗しても `done`/`fail` 自体の exit コードは変えない(spec §3.5)。`done`/`fail` 関数の末尾で呼ぶだけ・throw させない(内部 try/catch は appendLearningLog が throw しない設計 T4 で担保)。

**受け入れ挙動:**
- body-image-regen `done` → `画像試行`(成功)行・`回数`=直近4週件数+1・`対象`=style。
- body-image-regen `fail` → `画像試行`(失敗)行。
- eyecatch-regen done/fail → `画像試行` 行・`対象`=`eyecatch`。
- DS 未設定 → 追記スキップ・done/fail は従来どおり成功。
- 追記失敗 → stderr + throttle 付き LINE 通知・done/fail の exit は不変。

**テストケース一覧:**
- **CLI はカバレッジ除外**なので CLI 専用テストは不要。
- **`learningLog.test.ts` › `buildLearningLogFailNotice`(純ロジック・T8 で追加)**: `buildLearningLogFailNotice("画像試行")` が期待文字列を返す。
- 手動 dryrun 確認(Steps): `GROWTH_DRYRUN=1` で done を叩き `[dry-run] learning-log 画像試行 ...` が出る(実データ不要なら省略可・dryrun は getPage を叩くため実 Notion が要る点に注意→ dryrun でも getPage は実行される。手動確認は任意)。

**参照イディオム:** `scripts/growth/body-image-regen-cli.ts`(done/fail・`bodyRegenRowFromPage`・`write` ヘルパ・DRYRUN 分岐)。`scripts/growth/advise-cli.ts` L81-90(`notify`/`requireEnv`/dryrun)。`scripts/growth/notify-throttle.ts`(`shouldSendFailureNotice`)。`run.mjs` の `.growth-tmp` パス(`path.join(here, "..", "..", ".growth-tmp")` 相当・CLI では `path.join(process.cwd(), ".growth-tmp")` でよい)。

**Steps:**
- [ ] `learningLog.test.ts` に `buildLearningLogFailNotice` の describe を書く → RED
- [ ] `learningLog.ts` に `buildLearningLogFailNotice` を実装 → GREEN
- [ ] body-image-regen-cli.ts / eyecatch-regen-cli.ts に import 追加 + `recordImageAttempt`/`countRecentImageAttempts`/`notifyLearningLogFailThrottled` を実装し done/fail 末尾で呼ぶ(fail は row から style を取り直す)→ `npx tsc --noEmit` 0
- [ ] 既存 CLI テスト(`body-image-regen.test.ts`/`eyecatch-regen.test.ts` は純ロジック側=CLI ではない)が回帰しないことを確認(`npx vitest run scripts/growth/body-image-regen.test.ts scripts/growth/eyecatch-regen.test.ts`)
- [ ] コミット案 `feat(growth): 画像再生成の試行成否を学習ログへ追記(回数=直近4週累積)(SI1)`

---

## T9: 工程失敗を結線 — `run.mjs`(notifyLoopFail / pull 失敗 / weekly 異常終了)

**背景(現物確認済み):** `run.mjs` は `.ts` を import できない(L257-259 のコメント)。したがって台帳追記は **npm script 経由**(T5 の `growth:learning-log -- append-fail`)。既存 `spawnSync(isWin ? "npm.cmd" : "npm", ["run", ...], {...})` の書き方が 3 箇所ある(pull 失敗 L272・notifyLoopFail L313・weekly は L345 の `runNpm`)。

**Files:**
- Modify: `scripts/growth/run.mjs`(3 箇所に append-fail を追加)

**Consumes(実物の行・関数):**
- `notifyLoopFail(kind, { exitCode, detail })`(L310-325): `mode !== "weekly"` のときだけ LINE 通知する。ここで台帳追記も足す。
- pull 失敗ブロック(L266-284): `pullLatestOrAbort` 内。`notify-pull-fail` を spawnSync した後 `process.exit(1)` する。ここで `mode` の pull 失敗を台帳へ。
- weekly 異常終了(L340-348): `child.on("exit")` の `mode === "weekly"` 分岐。`exitCode !== 0` のとき `GROWTH_NOTIFY_ERROR` で notify-line する。ここで weekly の append-fail を足す。
- `GROWTH_DRYRUN`/`GROWTH_SKIP_PULL` 時の no-op: pull 失敗ブロックは L260 で既に skip 済み(dryrun/skip は pull 自体をしない)。notifyLoopFail は dryrun 時は L194-204 で早期 exit するため到達しない。weekly も dryrun は L198-203 で早期 exit。→ **既存の dryrun ガードにより append-fail も自然に no-op**(追加ガード不要)。

**Produces(3 箇所に spawnSync を追加。既存の spawnSync 書式を踏襲):**

1. **`notifyLoopFail` 内**(L324 の spawnSync の後・関数末尾):
   ```js
   // #SI1(d): 工程失敗を学習ログ台帳へ best-effort 追記(LINE 通知の後・exit は変えない)。
   spawnSync(isWin ? "npm.cmd" : "npm",
     ["run", "growth:learning-log", "--", "append-fail", mode, String(exitCode ?? ""), detail ?? ""],
     { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
   ```
2. **pull 失敗ブロック**(L282 の notify-pull-fail spawnSync の後・`process.exit(1)`〔L283〕の前):
   ```js
   spawnSync(isWin ? "npm.cmd" : "npm",
     ["run", "growth:learning-log", "--", "append-fail", "pull", String(pull.status ?? 1), detail],
     { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
   ```
   - `mode` ではなく `"pull"` を mode 値にする(spec §3.3.d「`対象`=mode(`revise`/`weekly`/`pull` 等)」に pull を含む)。`detail` は L265 で算出済み(pull の stdout/stderr 末尾 3 行)。
3. **weekly 異常終了**(L344 の `env` を組む箇所の直後、`runNpm("growth:notify-line", env)` の前後どちらでもよいが notify-line の**後**に置く):
   ```js
   if (exitCode !== 0) {
     spawnSync(isWin ? "npm.cmd" : "npm",
       ["run", "growth:learning-log", "--", "append-fail", "weekly", String(exitCode), ""],
       { stdio: ["ignore", "inherit", "inherit"], shell: isWin, env: { ...process.env } });
   }
   ```
   - weekly は `notifyLoopFail` の対象外(L311 で return)なので、ここで明示的に追記する。detail は空("")でよい(weekly の詳細は notify-line 側)。

- **best-effort 厳守**: いずれの spawnSync も戻り値を見ない・exit コードを変えない。`growth:learning-log` が DS 未設定なら T5 の CLI が no-op(exit 0)。CLI がクラッシュしても spawnSync の失敗は無視する(run.mjs の exit は元の失敗コードのまま)。

**受け入れ挙動:**
- revise 等の loop 異常終了 → LINE 通知 + `growth:learning-log append-fail <mode> <exit> <detail>` が走り `工程失敗` 行が増える。
- pull 非 ff 失敗 → notify-pull-fail + `append-fail pull <status> <detail>`。
- weekly 異常終了 → notify-line + `append-fail weekly <exit>`。
- `GROWTH_DRYRUN`/`GROWTH_SKIP_PULL` → 既存の早期 exit/skip により append-fail も走らない。
- `growth:learning-log` が失敗しても run.mjs の exit コードは元の失敗コードのまま。

**テストケース一覧:**
- `run.mjs` はカバレッジ除外(既存 `run.test.ts` は存在するが `run.mjs` 全体は exclude 対象か確認 → `run.test.ts` があるので **exclude されていない**。ただし本タスクは spawnSync の追加のみで、`run.test.ts` が spawnSync をモックしているか確認する)。
  - **`run.test.ts` を確認**(`grep -n "spawnSync\|append-fail\|notifyLoopFail\|learning-log" scripts/growth/run.test.ts`)。spawnSync をモックしているなら、append-fail 呼び出しの引数を検証するケースを追加。モックしていない/run.mjs を子プロセス起動しているなら、既存テストが回帰しないことのみ確認し、append-fail の検証は手動 dryrun に委ねる。
- 手動確認(Steps・dryrun): `GROWTH_DRYRUN=1 npm run growth:revise-loop`(→ dryrun で早期 exit・append-fail 呼ばれない)を確認。実失敗の検証は実運用ログで確認。

**参照イディオム:** `run.mjs` L272-282(notify-pull-fail の spawnSync)・L313-324(notify-loop-fail の spawnSync)・L341-345(weekly の env/runNpm)。

**Steps:**
- [ ] `grep -n "spawnSync\|append-fail\|learning-log" scripts/growth/run.test.ts` で run.test.ts の spawnSync モック有無を確認
- [ ] (モックがあれば)run.test.ts に append-fail 引数検証ケースを書く → RED
- [ ] run.mjs の 3 箇所に spawnSync を追加 → GREEN(あれば)/ `node --check scripts/growth/run.mjs` で構文確認
- [ ] 手動 dryrun 確認: `GROWTH_DRYRUN=1 npm run growth:revise-loop` が早期 exit する(append-fail が走らない)
- [ ] コミット案 `feat(growth): run.mjs の工程失敗(loop/pull/weekly)を学習ログへ追記(SI1)`

---

## T10: ドキュメント(.env.example / 40-notion-props.md / 70-self-tuning.md / CLAUDE.md 索引)

**Files:**
- Modify: `.env.example`(`GROWTH_LEARNING_LOG_DS` を追加)
- Modify: `docs/operations/growth/40-notion-props.md`(「学習ログ」DB の節を追加)
- Create: `docs/operations/growth/70-self-tuning.md`(SI1 の記録経路)
- Modify: `CLAUDE.md`(グロース索引に 70-self-tuning.md の 1 行を追加)

**Produces:**

- **`.env.example`**(`GROWTH_GOOGLE_TOKEN_EXPIRES_AT`〔L51〕付近の GROWTH セクション末尾に追記):
  ```
  # セルフチューニングループ(学習ログ)DB の data source ID(Notion 管理画面で作成後に設定)。
  # 未設定なら学習ログ追記は静かにスキップ(本処理は止まらない・SI1)。
  GROWTH_LEARNING_LOG_DS=
  ```
- **`40-notion-props.md`**(末尾に新節を追加。既存の表形式に合わせる):
  ```
  ## 学習ログ DB(セルフチューニング・SI1・別 DB)

  > **別 data source**(記事ネタ案とは別 DB)。ID は環境変数 `GROWTH_LEARNING_LOG_DS` で与える(コード内固定ではない)。
  > **追記専用の台帳**(1 行 = 1 イベント・既存行を更新/削除しない)。未追加でも本処理は止まらない(欠落耐性)。

  | プロパティ | 型 | 用途 |
  |---|---|---|
  | `イベント` | title | 1 行の見出し(自動生成)。例「編集: 導入を短縮(…)」「失敗: revise 異常終了(exit 1)」。 |
  | `種別` | select | `編集`/`採否`/`画像試行`/`工程失敗`。**この 4 値の事前追加が前提**。未知値は集計で「その他」。 |
  | `記録時刻` | date | イベント発生時刻(ISO8601)。直近 N 週抽出の軸。 |
  | `記事タイトル` | rich_text | 対象記事タイトル(記事に紐づくイベントのみ)。 |
  | `ページID` | rich_text | 対象「記事ネタ案」ページ ID(記事に紐づくイベントのみ)。 |
  | `対象` | rich_text | サブ分類。編集=領域/採否=観点/画像試行=style/工程失敗=モード名。 |
  | `結果` | select | `成功`/`失敗`/`リトライ`(画像試行・工程失敗のみ)。**3 値の事前追加が前提**。 |
  | `要約` | rich_text | イベント要約(2000 字上限・生全文は載せない)。 |
  | `回数` | number | 画像試行の直近 4 週累積回数(同一 pageId×style)。 |

  - 記録経路の詳細は [70-self-tuning.md](70-self-tuning.md)。集計・提案(SI2)は別途。
  ```
- **`70-self-tuning.md`**(新規・SI1 の記録経路をまとめる):
  ```
  # セルフチューニングループ(自己改善)— SI1 学習ログ収集基盤

  > 設計書: `docs/superpowers/specs/2026-07-05-growth-self-tuning-loop-design.md`
  > 実装計画: `docs/superpowers/plans/2026-07-05-growth-self-tuning-SI1.md`
  > 前提: Notion「学習ログ」DB(→ [40-notion-props.md](40-notion-props.md))を作成し `GROWTH_LEARNING_LOG_DS` を設定。未設定なら全経路が静かにスキップ。

  ## 何を拾うか(1 行 = 1 イベント・追記専用・ベストエフォート)

  | 種別 | 発火点 | 記録内容 |
  |---|---|---|
  | `編集` | `POST /api/growth/draft/edit` 保存成功(after) | 手動リッチ編集の前後差分要約(無変更は記録しない)。 |
  | `採否` | 同上(client が `source=advise-apply`/`comment-revise` を付与) | 採用した fix の観点(fix ごとに 1 行)。却下は記録しない。 |
  | `画像試行` | `growth:body-image-regen`/`growth:eyecatch-regen` の done/fail | style・成否・直近 4 週累積回数。 |
  | `工程失敗` | `run.mjs` の notifyLoopFail / pull 失敗 / weekly 異常終了 | mode・exit code・detail 末尾。`growth:learning-log -- append-fail` 経由。 |

  ## 純ロジックと CLI

  - 純ロジック(型・差分要約 `summarizeEditDiff`・プロパティ組み立て・集計 `summarizeLearningLog`・書き込みラッパ `appendLearningLog`): `scripts/growth/learningLog.ts`(+ `src/lib/growth/learningLog.ts` 再エクスポート・100% カバレッジ)。
  - CLI: `npm run growth:learning-log -- <append|append-fail|recent>`(薄い配線・カバレッジ除外)。`growth:learning-log:recent`(= recent 4)は SI2 の weekly が読む固定スクリプト。

  ## 安全原則

  - **本処理を止めない**: 追記はレスポンス後(API は `after()`)/ CLI 末尾で best-effort。失敗しても保存・生成・ループの成否は不変。
  - **沈黙させない**: DS 設定済みで書き込み失敗した時だけ、PC 側 CLI が `notify-throttle` 経由で LINE 通知(30 分ウィンドウ)。API route はサーバログに出す(Vercel から LINE を叩かない)。
  - **DS 未設定は静かにスキップ**(基盤未導入でも運用を壊さない)。
  - **追記専用**: 既存行の更新・削除経路は作らない。要約は 2000 字上限(生全文は載せない)。
  ```
- **`CLAUDE.md`**(「グロースループ記事生成」節の「分割ドキュメント」リストに 1 行追加):
  ```
  - セルフチューニング(SI1 学習ログ): `docs/operations/growth/70-self-tuning.md`
  ```

**受け入れ挙動:**
- 4 ファイルが更新/新規作成され、記録経路・プロパティ・環境変数・安全原則が文書化される。

**Steps:**
- [ ] `.env.example`・`40-notion-props.md`・`70-self-tuning.md`・`CLAUDE.md` を更新/作成
- [ ] リンク切れが無いことを目視確認(相対パス)
- [ ] コミット案 `docs(growth): セルフチューニング SI1 の記録経路・学習ログDB・環境変数を文書化`

---

## 受け入れ基準(spec §8 フェーズ SI1 完了条件)

1. 手動リッチ編集を保存すると学習ログ DB に `編集` 行が 1 つ増え、`要約` に前後差分の構造化要約が入る(無変更保存では増えない)。
2. advise/comment-revise の採用反映で `採否` 行が採用 fix ごとに増える(却下は記録しない)。
3. 画像再生成の done/fail で `画像試行` 行が成否つきで増え、`回数` に直近 4 週累積が入る。
4. `run.mjs` の工程失敗(revise 等 / pull / weekly)で LINE 通知と同時に `工程失敗` 行が増える。
5. `GROWTH_LEARNING_LOG_DS` 未設定/DB 未作成でも上記 4 経路の本処理は一切止まらない(追記だけ静かにスキップ)。設定済みで書き込み失敗したときは、PC 側 CLI から LINE 通知が飛ぶ(throttle 済み)/ API route はサーバログに出す。
6. 純ロジック(`learningLog.ts`)のテストが 100% カバレッジで green。`GROWTH_DRYRUN=1` で追記/通知せず内容表示。
7. `learning-log-cli.ts`・`run.mjs` は `vitest.config.ts` の `coverage.exclude` に入っている。

## 検証(最終・T10 後)

- `npx vitest run scripts/growth/learningLog.test.ts src/app/api/growth/draft/edit/` 全 green。
- `npx vitest run --coverage` で `scripts/growth/learningLog.ts` が 100%(statements/branches/functions/lines)。
- `npx tsc --noEmit` 0(`after` import・`unknown` narrowing・`LearningEvent` 型整合)。
- `npm run lint`(`.growth-tmp/` 既知分以外 0)。
- `node --check scripts/growth/run.mjs` 構文 OK。
- 手動 dryrun: `GROWTH_LEARNING_LOG_DS= npm run growth:learning-log:recent` → `[]` / `GROWTH_DRYRUN=1 GROWTH_LEARNING_LOG_DS=dummy npm run growth:learning-log -- append-fail revise 1 "x"` → dryrun 表示。

## 非スコープ(本計画に含めない)

- SI2 一切(`systemProposal.ts`・`weekly.md` の「システム振り返り」工程・「施策提案」DB の `システム改善` カテゴリ・weekly `allow` への `recent` 追加)。
- 却下(dismiss)の記録(SI1 は採用のみ)。
- LLM による差分要約(`summarizeEditDiff` は決定的純ロジック)。
- `notion.ts` の `createPageWithChildren` 追加(YAGNI)。
- 学習ログ DB の作成そのもの(オーナーが MCP で実施・前提条件)。
- `結果` select の `リトライ` 値の使用(将来予約・SI1 は `回数` フィールドで累積表現)。
