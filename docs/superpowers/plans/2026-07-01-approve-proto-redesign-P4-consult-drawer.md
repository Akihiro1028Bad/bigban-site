# 承認画面 proto 移植 P4=相談ドロワー再スキン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本番 `/growth/approve` の相談(consult)サーフェス（ドロワー・コンポーザ・カード・各Body）を、proto (`src/app/growth/approve-proto/`) のダークデザインへ**見た目だけ**再スキンする（ロジック・props・role/aria・実API・純ロジックは不変）。

**Architecture:** 本番 consult/* 7ファイルはライトTailwind（`bg-white`/`border-gray-200`/`text-blue-600`）で書かれている。これを proto の `--p-*` ダークトークン＋`.approve-*` クラス（`approveTheme.css` 由来）へ塗り替える。差分Bの結線（`consult.ts`／`useConsult`／各フック／実API）は完成済みで**触らない**。唯一の新規純ロジックは、AI講評の観点別スコア(0-5)から総評リング用の0-100を導出する関数（100%テスト）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Tailwind v4（`--p-*` トークン）/ Framer Motion（`__mocks__` 済）/ Vitest + RTL / istanbul coverage（100%ゲート）。

## Global Constraints

- 出力・コミットは日本語。**push 禁止・PR 作成禁止。ローカルコミットのみ。** `next-env.d.ts` / `node_modules` は絶対にステージしない。
- TS strict・`any` 禁止・`React.FC` 禁止（関数宣言＋`XxxProps` interface）・`import type`・boolean は is/has/should/can・handler は on/handle・`@ts-ignore` 禁止（最終手段 `@ts-expect-error`＋理由）。
- `"use client"` は対話/ブラウザAPI/framer-motion が要る時のみ。framer-motion 使用ファイルは `"use client"`。next/image・next/font。
- a11y: セマンティックHTML・`div`+`onClick` 禁止（button/a）・キーボード操作可能・role/aria 適切・コントラスト・prefers-reduced-motion。
- `MICROCMS_MANAGEMENT_API_KEY` 等は server-only（`NEXT_PUBLIC_` 禁止）。失敗を沈黙させない。
- Coverage 100%（istanbul・4指標・threshold 不変）。**pure logic 除外禁止**。consult/* 7ファイルは既に `vitest.config.ts` で exclude 済（class 変更だけなら追加除外不要）。`hooks/useConsult.ts` は除外されておらず**テスト対象維持**（グルーフック）。
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。

## 確定した設計判断（P4・メイン裁定）

1. **総評リング**: backend `Advice` に 0-100 が無いため、**観点別スコア(0-5)の平均×20** で 0-100 を導出する純関数 `overallFromScores` を新設（100%テスト）。RingScore に渡す（＝「観点スコアの平均」の意味）。BE改修なし。（ユーザー裁定 2026-07-01）
2. **観点スコア表示**: 本番 0-5 を `score/5*100` で width% に写像し proto のバー表現へ。
3. **diff 表示**: 本番 `WordDiffView`（`wordDiff.ts`・AA対応）を**維持**し、proto の「元/新2列」レイアウトだけ採用（proto の `OutlineDiff`/`segDiff` は移植しない＝YAGNI）。
4. **apply 粒度**: proto は対象別/個別だが、**本番の粒度（revise=全体1操作・sentence=一括のみ）を維持**し見た目だけ寄せる（実APIと整合）。proto の対象別UIは出さない。
5. **shimmer/pulse**: `approveTheme.css` に `approve-pulse`(191)・`approve-shimmer`(204) が**既存**。proto の `proto-shimmer`/`proto-pulse` はこれらへ読み替え（**キーフレーム追記不要**）。
6. **ドロワーの `.approve-shell` スコープ**: `--p-*` トークンと `.approve-*` クラスは `.approve-shell` 配下でしか解決されない。ConsultDrawer は `.approve-shell` の**外**（MotionConfig 直下）で描画されるため、**ドロワー root（`motion.aside`）に `className="approve-shell ..."` を付与**（`DraftEditWorkspace` と同方式）。scrim には付けない。
7. **esc 閉じ／閉じるボタン**: proto は `useDialog()`（esc閉じ・focus）＋`<Kbd>esc</Kbd>`。本番 `hooks/useDialog.ts`（P1移植済）と `Kbd`（primitives）を使い、ドロワーに esc 閉じを導入し閉じるボタンを `<Kbd>esc</Kbd>` 表現へ。`aria-modal={false}`（本文操作を妨げない）は**維持**。

## クラス名 読み替え表（proto コードを貼る際に必須）

| proto | 本番（`approveTheme.css`・`.approve-shell` 配下） |
|---|---|
| `proto-btn-primary` | `approve-btn-primary` |
| `proto-btn-ghost` | `approve-btn-ghost` |
| `proto-tool` | `approve-tool` |
| `proto-changed` | `approve-changed` |
| `proto-article` | `approve-article` |
| `proto-shimmer` | `approve-shimmer`（既存・追記不要） |
| `proto-pulse` | `approve-pulse`（既存・追記不要） |

色は proto の**インラインstyle**（`var(--p-bg-elevated)` 等）をそのまま使ってよい（`--p-*` は `.approve-shell` 配下で解決）。

## 参照ファイル（各再スキンの視覚仕様＝proto ソースが正）

- proto: `src/app/growth/approve-proto/{ConsultDrawer,ConsultComposer,ConsultCard,AdviceResultBody,ReviseProposalBody,SentenceFixBody,CommentableBody}.tsx`・`ui.tsx`(RingScore/Kbd/Icon)。
- 本番プリミティブ: `src/app/growth/approve/ui/primitives.tsx`（`RingScore` value=0-100/size・`Kbd`・`ScoreBar`）・`ui/icons.tsx`（`IconWand/IconChart/IconArrowUp/IconArrowDown/IconCheck/IconX/IconRefresh/IconSparkles` 等）。
- テーマ: `src/app/growth/approve/theme/approveTheme.css`。
- 本番相談: `src/app/growth/approve/consult/*.tsx`・`hooks/useConsult.ts`（**触らない**）・`src/lib/growth/consult.ts`。

## 再スキンタスク共通の不変契約（T2〜T8 すべてに適用）

- **変更してよいのは JSX の `className` と、装飾専用のマークアップ構造（ラッパ div・アイコン・視覚要素）だけ**。
- **変更してはならない**: props インターフェイス・`role`/`aria-*`/`htmlFor`/`aria-label` の値・イベントハンドラ（on*）・呼び出す関数/実API・条件分岐（status/mode 出し分け）・テキスト文言（アクセシブルネームに使われるもの）。
- framer-motion の `motion.*`/`AnimatePresence`/`layoutId`/トランジション値は proto に合わせてよいが、既存の開閉挙動は保つ。
- 各タスク末で: 対象ファイルの既存テスト（あれば）＋ `ApproveClient.test.tsx` が緑・`tsc`・`eslint` が緑であることを確認（consult/* は coverage 除外済のためカバレッジは不変のはず）。

---

### Task 1: 総評スコア導出 純関数 `overallFromScores`

**Files:**
- Create: `src/app/growth/approve/adviceScore.ts`
- Test: `src/app/growth/approve/adviceScore.test.ts`

**Interfaces:**
- Produces: `overallFromScores(scores: readonly { score: number }[]): number` — 0-100 の整数。空配列は 0。`round((Σscore / n) * 20)`。

**Consumes:** なし（純関数）。Task 5（AdviceResultBody）が `advice.scores` を渡して RingScore の value に使う。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from "vitest";

import { overallFromScores } from "./adviceScore";

describe("overallFromScores", () => {
  it("観点スコア(0-5)の平均×20で0-100を返す", () => {
    expect(overallFromScores([{ score: 5 }, { score: 4 }, { score: 3 }])).toBe(80);
  });
  it("単一スコアも平均×20", () => {
    expect(overallFromScores([{ score: 4 }])).toBe(80);
  });
  it("四捨五入して整数を返す", () => {
    // 平均 (5+4)/2=4.5 → ×20 = 90
    expect(overallFromScores([{ score: 5 }, { score: 4 }])).toBe(90);
    // 平均 (3+4+3)/3=3.333.. → ×20 = 66.66.. → 67
    expect(overallFromScores([{ score: 3 }, { score: 4 }, { score: 3 }])).toBe(67);
  });
  it("空配列は0", () => {
    expect(overallFromScores([])).toBe(0);
  });
  it("全0は0", () => {
    expect(overallFromScores([{ score: 0 }, { score: 0 }])).toBe(0);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `npx vitest run src/app/growth/approve/adviceScore.test.ts`
Expected: FAIL（`overallFromScores` 未定義）。

- [ ] **Step 3: 実装**

```ts
/**
 * AI講評の観点別スコア(各0-5)の平均を0-100へ写像する（総評リング表示用）。
 * backend Advice に総評数値が無いため、観点平均×20で決定的に導出する。
 * 空配列は0（講評未取得/観点なしの安全既定）。
 */
export function overallFromScores(scores: readonly { score: number }[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 20);
}
```

- [ ] **Step 4: 成功確認**

Run: `npx vitest run src/app/growth/approve/adviceScore.test.ts`
Expected: PASS（5ケース・adviceScore.ts 100%）。

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve/adviceScore.ts src/app/growth/approve/adviceScore.test.ts
git commit -m "feat(growth): 相談講評の総評リング用に観点平均→0-100導出の純関数を追加

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: ConsultDrawer 再スキン（＋`.approve-shell` スコープ＋esc閉じ＋Kbd）

**Files:**
- Modify: `src/app/growth/approve/consult/ConsultDrawer.tsx`
- 参照(視覚仕様): `src/app/growth/approve-proto/ConsultDrawer.tsx`

**やること:**
1. `motion.aside`（現 `:110-118`）の `className` を proto ダークへ。**root に `approve-shell` を付与**（例: `className="approve-shell fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col"`）。背景・境界・影は proto のインラインstyle（`background: var(--p-bg-elevated)`・`borderLeft: "1px solid var(--p-border-strong)"`・`boxShadow: "-18px 0 50px rgba(0,0,0,0.4)"`）。scrim（`:102`）は proto の `rgba(4,6,9,0.5)` へ（`approve-shell` は付けない）。
2. ヘッダ（`:121-127`）: 見出し文字色を `var(--p-text)`。閉じるボタンを proto 準拠の `<Kbd>esc</Kbd>`（`import { Kbd } from "../ui/primitives"`）。`aria-label="閉じる"` は**維持**、`onClick={onClose}` は不変。
3. タブ（`role="tablist"`/`role="tab"` `:135-`）: active/inactive の配色を proto（active=`var(--p-bg-active)`＋`var(--p-text)`・inactive=`var(--p-text-3)`）へ。`role`/`aria-selected`/ラベル文言は不変。
4. **esc 閉じ**: `import { useDialog } from "../hooks/useDialog"` し、`const dialogRef = useDialog(onClose)`（本番 useDialog のシグネチャに合わせる。要 Step 1 で確認）を `motion.aside` の `ref` に付与。`aria-modal={false}` は維持（focus-trap は modal でないため入れない／useDialog が esc とフォーカスのみ担うか要確認）。
5. `--p-*` 未解決を避けるため、コンテンツ本文（`:161` overflow エリア）も含めドロワー内は全て `.approve-shell` 配下に入る（root付与で自動的に満たす）。

- [ ] **Step 1: 現状と useDialog シグネチャ確認**

`src/app/growth/approve/hooks/useDialog.ts` を読み、`useDialog` が `onClose` を引数に取り ref を返すか（P1移植版の実シグネチャ）を確認。proto `useDialog` と差があれば本番シグネチャに合わせる。ConsultDrawer 現行の props/role を読み、不変契約の対象を把握。

- [ ] **Step 2: className / esc / Kbd を書き換え**

上記 1〜5 を適用。**props・role・aria値・onClose・タブ文言・framer-motion 開閉挙動は不変**。

- [ ] **Step 3: 型・lint・テスト緑**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint src/app/growth/approve/consult/ConsultDrawer.tsx`（0）/ `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（緑・ドロワー開閉/タブ切替テストが通ること）。ConsultDrawer 専用テストがあれば実行。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/ConsultDrawer.tsx
git commit -m "refactor(growth): 相談ドロワーを proto ダークへ再スキン（approve-shell スコープ・esc閉じ・Kbd・見た目のみ）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: ConsultComposer 再スキン

**Files:**
- Modify: `src/app/growth/approve/consult/ConsultComposer.tsx`
- 参照: `src/app/growth/approve-proto/ConsultComposer.tsx`

**やること:** overall モードの textarea（`border-gray-300`）と「相談する」ボタン（`bg-blue-600 text-white`）を proto へ（textarea=`background: var(--p-bg-input)`・`border: 1px solid var(--p-border)`・`color: var(--p-text)`／ボタン=`approve-btn-primary`＋`IconWand`）。revise/sentence モードの本番結線（`Section`/`SectionEditor`/`ReviseCommentForm`/`CommentableBody`＋`revise.*`/`bodyCommentConsult`）は**構造・props・API不変**、配色だけ proto へ。`<label htmlFor>`・`role="alert"`（error）は不変。

> **注意**: proto の ConsultComposer は revise を「チェックボックス式（RevisePart）」で構成しており本番の実結線（Section/ReviseCommentForm）と**非互換**。proto の composer 構造は移植せず、**本番の構造を維持したまま配色のみ寄せる**（設計判断4）。

- [ ] **Step 1**: 本番 ConsultComposer を読み、3モード（overall/revise/sentence）の分岐・props・実API結線・role を把握。
- [ ] **Step 2**: 各モードの `className` を proto ダークへ。ボタンは `approve-btn-*`＋アイコン。**分岐・props・API・文言・role 不変**。
- [ ] **Step 3**: `npx tsc --noEmit`（PASS）/ `npx eslint ...ConsultComposer.tsx`（0）/ `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（緑）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/ConsultComposer.tsx
git commit -m "refactor(growth): 相談コンポーザを proto ダークへ再スキン（3モードの結線・props・API 不変・配色のみ）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: ConsultCard 再スキン（`approve-shimmer`/`approve-pulse` 適用）

**Files:**
- Modify: `src/app/growth/approve/consult/ConsultCard.tsx`
- 参照: `src/app/growth/approve-proto/ConsultCard.tsx`

**やること:** カード枠を `var(--p-bg-elevated)`・ラベルチップを `var(--p-bg-active)` へ。**待ちスケルトンを `animate-pulse`→`approve-shimmer`（既存クラス）** へ、待ち見出しを `IconWand` の `approve-pulse`＋「AIが考えています…」へ。失敗ブロックを `var(--p-red-weak)`＋`IconX`＋`approve-btn-primary`「再依頼」へ。`#165` の `AdviceApplySection`（apply/adopt フロー）は**本番固有で維持**し配色だけ寄せる。`<section aria-label>`・`aria-busy`・status 分岐（requested/processing/presenting/failed）は不変。

- [ ] **Step 1**: 本番 ConsultCard の status 分岐・`AdviceApplySection`・aria を把握。`approve-shimmer`/`approve-pulse` の使い方を `approveTheme.css:191,204` で確認。
- [ ] **Step 2**: 配色・スケルトン・失敗ブロックを proto へ。**分岐・aria・ハンドラ不変**。
- [ ] **Step 3**: `tsc`（PASS）/ `eslint`（0）/ `vitest run ApproveClient.test.tsx`（緑・待ち/失敗/presenting 表示テスト）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/ConsultCard.tsx
git commit -m "refactor(growth): 相談カードを proto ダークへ再スキン（approve-shimmer/pulse・status 分岐と #165 フロー不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: AdviceResultBody 再スキン（RingScore 導出＋観点バー）

**Files:**
- Modify: `src/app/growth/approve/consult/AdviceResultBody.tsx`
- 参照: `src/app/growth/approve-proto/AdviceResultBody.tsx`

**Interfaces:**
- Consumes: `overallFromScores`（Task 1・`../adviceScore`）・`RingScore`（`../ui/primitives`・value=0-100/size）・`IconArrowUp`/`IconArrowDown`/`IconChart`/`IconCheck`（`../ui/icons`）。

**やること:**
1. 総評ブロックへ **`RingScore value={overallFromScores(advice.scores)} size={64}`** を復帰（現状は `summary` テキストのみ・コメント「RingScore は撤去」を解消）。summary テキストは残し RingScore の隣に置く。
2. `scores`（本番 `{axis,score(0-5),note?}`）を proto の 2列バーグラフへ。バー幅は `score/5*100`%（`(s.score / 5) * 100`）。色は proto 基準（`score>=4` 緑 `var(--p-green)`／`>=3.25` accent `var(--p-accent)`／else amber `var(--p-amber)` 等・proto AdviceResultBody の閾値に合わせる。0-100 換算なら 80/65 境界）。ラベルは `s.axis`、注記は `s.note`。
3. `strengths` を `IconArrowUp`、`fixes`（`{area,severity,quote?,reason,suggestion}`）を `IconArrowDown`＋severity バッジ（`var(--p-red-weak)`/`var(--p-amber-weak)`/`var(--p-bg-active)`）＋quote=`border-l-2` `var(--p-amber)`＋suggestion=`IconChart`。**採用チェック（`<input type=checkbox aria-label>`・`onToggleAdopt`・#165）は不変**、配色のみ。
4. `aria-label="観点別スコア"` 等の aria 値は不変。

- [ ] **Step 1**: 本番 AdviceResultBody の props（`advice/adopted/selectable/classifications/onToggleAdopt`）・aria・#165 チェックUI を把握。proto の RingScore 配置とバー閾値・アイコンを確認。
- [ ] **Step 2**: RingScore（Task1導出）＋観点バー＋strengths/fixes を proto へ。**props・aria・onToggleAdopt 不変**。`import { overallFromScores } from "../adviceScore"`。
- [ ] **Step 3**: `tsc`（PASS）/ `eslint`（0）/ `vitest run ApproveClient.test.tsx`（緑・講評表示/採用チェックのテスト）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/AdviceResultBody.tsx
git commit -m "refactor(growth): 講評ボディを proto へ再スキン（総評リング=観点平均導出・観点バー・#165採用チェック不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: ReviseProposalBody 再スキン（元/新2列＋WordDiffView 維持）

**Files:**
- Modify: `src/app/growth/approve/consult/ReviseProposalBody.tsx`
- 参照: `src/app/growth/approve-proto/ReviseProposalBody.tsx`

**やること:** 本番の props（`currentOutline,outlineProposal,titleProposal,busy,onApply,onDiscard`・**revise 全体に1操作**）は**不変**。`WordDiffView`（`wordDiff.ts`）は**維持**。見た目を proto の「元/新2列」レイアウト＋changed ハイライト（`var(--p-green-weak)`＋`box-shadow: inset 2px 0 0 var(--p-green)`）へ寄せる。反映ボタンを `approve-btn-primary`（or proto の `var(--p-green)` 緑ボタン）へ、棄却を `approve-btn-ghost` へ。`<section aria-label>` は不変。proto の対象別 apply（ReviseTarget）UIは**出さない**（設計判断4）。

- [ ] **Step 1**: 本番 ReviseProposalBody の props・`WordDiffView` 使用箇所・onApply/onDiscard・aria を把握。proto の2列レイアウト/changed ハイライトを確認。
- [ ] **Step 2**: 2列レイアウト＋配色へ。`WordDiffView`・props・onApply/onDiscard・aria 不変。
- [ ] **Step 3**: `tsc`（PASS）/ `eslint`（0）/ `vitest run ApproveClient.test.tsx`（緑・構成案提示/反映/棄却のテスト）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/ReviseProposalBody.tsx
git commit -m "refactor(growth): 構成案提案ボディを proto へ再スキン（元/新2列・WordDiffView と1操作 apply は不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 7: SentenceFixBody 再スキン

**Files:**
- Modify: `src/app/growth/approve/consult/SentenceFixBody.tsx`
- 参照: `src/app/growth/approve-proto/SentenceFixBody.tsx`

**やること:** 本番 props（`proposal:BodyCommentProposalItem[],busy,onApplyAll`・**一括反映のみ**）は不変。item カードを proto 配色（`var(--p-bg-input)`・before=`line-through` `var(--p-text-3)`・after 強調＝`var(--p-green-weak)`）へ。「すべて反映」を `approve-btn-primary`＋`IconCheck` へ。`structureNote`（#M5）表示は維持。`<section aria-label>` 不変。proto の個別 apply/dismiss は**出さない**（設計判断4）。

- [ ] **Step 1**: 本番 SentenceFixBody の props・onApplyAll・structureNote・aria を把握。
- [ ] **Step 2**: item カード＋一括ボタンを proto 配色へ。**props・onApplyAll・aria 不変**。
- [ ] **Step 3**: `tsc`（PASS）/ `eslint`（0）/ `vitest run ApproveClient.test.tsx`（緑・sentence 提案/一括反映のテスト）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/SentenceFixBody.tsx
git commit -m "refactor(growth): 文修正ボディを proto へ再スキン（配色のみ・一括反映 props 不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 8: CommentableBody 再スキン

**Files:**
- Modify: `src/app/growth/approve/consult/CommentableBody.tsx`
- 参照: `src/app/growth/approve-proto/CommentableBody.tsx`

**やること:** 本番 props（`bodyHtml,bodyCommentConsult`）・`extractReviewLines`（`bodyComment.ts`）・`useBodyCommentConsult` 結線は不変。行ガター（`text-gray-400`→`var(--p-text-3)`）・「＋」ボタン（`bg-blue-600`→`approve-btn-primary` or `var(--p-accent)`）・コメントスレッド（`bg-gray-50`/`bg-blue-50`→`var(--p-bg-elevated)`/`var(--p-bg-active)`）を proto へ。本文は `approve-article` クラス（proto の `proto-article` 相当）。`<button aria-label="N行目にコメント">`・`role="alert"`・textarea `aria-label` は不変。

> **注意**: これは consult モードの本文注釈UI（`consult/CommentableBody.tsx`）。P3b-T7 で再スキンした `InlineCommentReview.tsx` とは**別ファイル**。

- [ ] **Step 1**: 本番 CommentableBody の props・行分割・aria・「＋」/スレッドUI を把握。
- [ ] **Step 2**: 配色を proto ダークへ。**props・結線・aria・文言 不変**。
- [ ] **Step 3**: `tsc`（PASS）/ `eslint`（0）/ `vitest run ApproveClient.test.tsx`（緑・行コメント追加/削除のテスト）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/CommentableBody.tsx
git commit -m "refactor(growth): 相談本文注釈ボディを proto ダークへ再スキン（結線・props・aria 不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 9: フェーズ末ゲート＋ブラウザ確認観点

**Files:** なし（検証のみ）。コントローラ（メイン）が実測する。

- [ ] **Step 1: 全体ゲート実測**

Run:
- `npx tsc --noEmit -p tsconfig.json` → 出力なし
- `npx eslint src/app/growth/approve/` → 0
- `npx vitest run --coverage` → 全ファイル全緑・グローバル100%（4指標）

- [ ] **Step 2: 作業ツリー確認**

`git status --short` が `next-env.d.ts` / `node_modules` のみであること。未push。

- [ ] **Step 3: ledger 更新＋ブラウザ確認観点提示**

`.superpowers/sdd/progress.md` に P4 完了を記録。ユーザーへ確認観点（相談ドロワーのダーク化・タブ・esc閉じ／講評の総評リング＝観点平均・観点バー／構成案の元新2列diff／文修正の一括反映／本文注釈のダーク化）を提示し**停止**。

---

## Self-Review

**1. Spec coverage（設計書 line 85 P4 = ConsultDrawer/Composer/Card/各Body の再スキン・RingScore/diff/sentence）:**
- ConsultDrawer → T2 ✅ / ConsultComposer → T3 ✅ / ConsultCard → T4 ✅ / AdviceResultBody(RingScore) → T5 ✅ / ReviseProposalBody(diff) → T6 ✅ / SentenceFixBody(sentence) → T7 ✅ / CommentableBody → T8 ✅。RingScore の数値源 → T1（overallFromScores）✅。差分Bの結線維持（触らない）→ 各タスクの不変契約 ✅。coverage 除外は既済・useConsult 非除外維持 → Global Constraints ✅。
- ギャップ: ConsultCard の `AdviceApplySection`（#165）は proto に無いが本番固有で維持＝T4 で明記済 ✅。

**2. Placeholder scan:** T1 は完全コード。T2〜T8 は「proto ソースが視覚仕様・class 読み替え表・不変契約」で具体化。`TBD`/「適宜」/抽象指示なし ✅。各タスクに Step 1（現状把握）を置き、実ファイル読解で細部を埋める設計（re-skin の性質上、全 JSX の複製より proto 参照が DRY）✅。

**3. Type consistency:** `overallFromScores(scores: readonly {score:number}[]): number` を T1 で定義、T5 で `overallFromScores(advice.scores)` として消費（`advice.scores` は `{axis,score,note?}[]` ＝ `{score:number}` を構造的に満たす）✅。`RingScore value/size`・`Kbd`・`useDialog`・アイコン名は実在確認済（primitives.tsx/icons.tsx/hooks/useDialog.ts）✅。クラス名は既存確認済（approveTheme.css）✅。

**懸念（実行時に解消）:** T2 の `useDialog` シグネチャは P1 移植版の実装に依存（Step 1 で確認）。proto と差があれば本番版へ合わせる。
