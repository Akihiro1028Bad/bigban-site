# 承認画面 proto 移植 P5a=施策＋成績 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認画面の「施策(ProposalView)」と「成績(PerformanceBoard)」を proto (`src/app/growth/approve-proto/`) デザインへ移植する。データは実 API・Notion pull 型のまま、見た目と操作感を proto へ寄せる。実データで出せない部分（種別詳細・期間切替・Sparkline）は縮約する。

**Architecture:** 施策は proto の master-detail＋種別フィルタ＋種別ルーティング詳細＋作成モーダルを移植。**種別(kind)は Notion に新設せず、既存 category(6値)から純関数 `kindFromCategory` で派生**（実データ駆動・BE 変更ゼロ）。article は既存仮説を実データ表示、非 article は縮約表示。成績は proto の集計カード/バナー/行/GSC 展開へ再スキン、GSC(検索)行展開は実データで実装、期間切替(7/28/90日)と Sparkline は縮約（非表示）。純ロジックは `src/lib/growth/*` に 100% テストで置き、proto presentation は coverage.exclude。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4(`--p-*`) / Framer Motion(mock 済) / Vitest + RTL / istanbul 100%。

## Global Constraints

- 出力・コミットは日本語。**push 禁止・PR 禁止・ローカルコミットのみ。** `next-env.d.ts`/`node_modules` は絶対にステージしない。
- TS strict・`any` 禁止・`React.FC` 禁止（関数宣言＋`XxxProps`）・`import type`・boolean は is/has/should/can・handler は on/handle・`@ts-ignore` 禁止（最終手段 `@ts-expect-error`＋理由）。
- `"use client"` は対話/ブラウザAPI/framer-motion が要る時のみ。framer-motion 使用ファイルは `"use client"`。next/image・next/font。
- a11y: セマンティックHTML・`div`+`onClick` 禁止（button/a）・role/aria 適切・コントラスト・prefers-reduced-motion。
- `MICROCMS_MANAGEMENT_API_KEY` 等 server-only（`NEXT_PUBLIC_` 禁止）。失敗を沈黙させない。
- Coverage 100%（istanbul・4指標・threshold 不変）。**pure logic 除外禁止**。proto presentation の薄い部品のみ exclude 可。フォーム検証・種別派生等のロジックは純関数に切り出して 100%（計測逃れ禁止）。
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。
- ダミーデータ禁止（実データで出せないものは縮約＝非表示）。

## 確定した設計判断（P5a・ユーザー裁定 2026-07-02）

1. **施策 種別詳細**: article のみ実データ（category＋既存仮説）。site/event/other は **UI（見た目）だけ縮約**（Notion スキーマ変更なし＝PC 側 pull ループ非波及）。**種別(kind)は既存 category から純関数 `kindFromCategory` で派生**（新プロパティ persist しない）。詳細フィールド型（SiteProposalDetail 等）は型として追加するが本番データには存在しない前提で欠落耐性表示。
2. **成績**: 期間切替(7/28/90日)と Sparkline(日次 series) は **縮約（非表示）**（本番は単一期間・series 無し・ダミー禁止）。**GSC(検索)行展開は実データで実装**（本番 `search` は実在）。→ proto `metricsView.ts` の `rangeView`/`fitSeries` は移植せず、`reviewLabels` のみ本番へ。
3. サブフェーズ分割: 本計画は **P5a（施策＋成績）**。公開キュー/プロンプト/グローバルは P5b。
4. coverage.exclude 追記見込み: `ProposalView.tsx`/`ProposalDetailBody.tsx`/`ProposalFormModal.tsx`（＋成績は複雑度で判断）。純ロジック `proposalKind.ts`・`metricsView`採用分は 100%・除外禁止。

## クラス名 読み替え表（proto→本番・`theme/approveTheme.css`）

| proto | 本番 |
|---|---|
| `proto-btn-primary` | `approve-btn-primary` |
| `proto-btn-ghost` | `approve-btn-ghost` |
| `proto-tool` | `approve-tool` |
| `proto-article` | `approve-article` |
| `proto-shimmer`/`proto-pulse` | `approve-shimmer`/`approve-pulse`（既存） |

色は proto のインライン `var(--p-*)` をそのまま使用可（`.approve-shell` 配下で解決）。danger は theme 実在の `--p-red-weak`/`--p-red`（`--p-bg-danger` は不在）。

## 参照ファイル（視覚仕様＝proto ソースが正）

- 施策 proto: `approve-proto/{ProposalView,ProposalDetailBody,ProposalFormModal}.tsx`・`proposalKind.ts`・`types.ts`。
- 成績 proto: `approve-proto/PerformanceBoard.tsx`・`metricsView.ts`・`types.ts`。
- 本番 現状: `src/app/growth/approve/{ProposalsView,AddProposalForm,HypothesisCard,PerformanceBoard}.tsx`・`src/lib/growth/{proposals,metrics,articleMetricsView}.ts`・`src/app/growth/approve/ApproveClient.tsx`。
- 本番プリミティブ: `ui/primitives.tsx`（`RingScore`/`Sparkline`/`MetaStat`/`EyecatchThumb`/`ScoreBar`/`StageChip`）・`ui/icons.tsx`。

---

### Task 1: 施策 純ロジック `proposalKind` ＋型追加

**Files:**
- Create: `src/lib/growth/proposalKind.ts`
- Test: `src/lib/growth/proposalKind.test.ts`
- Modify: `src/app/growth/approve/types.ts`（型追加のみ）

**Interfaces（Produces）:**
- `type ProposalKind = "article" | "site" | "event" | "other"`
- `type ProposalStatus = "pending" | "rejected" | "adopted"`
- `interface SiteProposalDetail { whatChange: string; whereTarget?: string; whyReason?: string }`
- `interface EventProposalDetail { whenLabel: string; audience?: string; format?: string; capacity?: string }`
- `KIND_META: Record<ProposalKind, { label: string; tone: string }>`（proto `proposalKind.ts` 逐語：article=accent/site=purple/event=green/other=text-3。tone は `var(--p-*)` トークン名 or 既存慣例に合わせる）
- `approveOutcomeFor(kind: ProposalKind): { buttonLabel: string; preview: string; toast: string; done: string }`（proto 逐語）
- **`kindFromCategory(category: string): ProposalKind`**（本 P5a 新規・実データ橋渡し）：`"イベント" → "event"`、それ以外の既存カテゴリ（コンテンツ/MEO/サイトデザイン/サイト表示内容/追加機能）→ `"article"`。未知/空 → `"article"`（欠落耐性）。

> 型は `types.ts` に追加。`SiteProposalDetail`/`EventProposalDetail` は将来/UI 用で本番データには通常存在しない（optional 扱い）。`kindFromCategory` は「種別を persist しない」方針の要（既存 category から決定的に派生）。

- [ ] **Step 1: 失敗テストを書く**（`proposalKind.test.ts`）

```ts
import { describe, expect, it } from "vitest";

import { KIND_META, approveOutcomeFor, kindFromCategory } from "./proposalKind";

describe("kindFromCategory", () => {
  it("イベントは event", () => {
    expect(kindFromCategory("イベント")).toBe("event");
  });
  it("コンテンツ等の記事系カテゴリは article", () => {
    expect(kindFromCategory("コンテンツ")).toBe("article");
    expect(kindFromCategory("MEO")).toBe("article");
    expect(kindFromCategory("サイトデザイン")).toBe("article");
  });
  it("未知/空は article へフォールバック", () => {
    expect(kindFromCategory("")).toBe("article");
    expect(kindFromCategory("不明カテゴリ")).toBe("article");
  });
});

describe("KIND_META", () => {
  it("4種別すべてに label と tone を持つ", () => {
    (["article", "site", "event", "other"] as const).forEach((k) => {
      expect(KIND_META[k].label).toBeTruthy();
      expect(KIND_META[k].tone).toBeTruthy();
    });
  });
});

describe("approveOutcomeFor", () => {
  it("種別ごとの承認出口テキストを返す", () => {
    expect(approveOutcomeFor("article").buttonLabel).toBeTruthy();
    expect(approveOutcomeFor("site").buttonLabel).toBeTruthy();
    expect(approveOutcomeFor("event").preview).toBeTruthy();
    expect(approveOutcomeFor("other").toast).toBeTruthy();
  });
});
```

- [ ] **Step 2: 失敗確認** — Run: `npx vitest run src/lib/growth/proposalKind.test.ts` → FAIL（未定義）。

- [ ] **Step 3: 実装** — `proposalKind.ts` に proto `approve-proto/proposalKind.ts` の `KIND_META`/`approveOutcomeFor` を逐語移植（tone は `var(--p-accent)`/`var(--p-purple? )` 等・proto の値に合わせつつ theme 実在トークンへ）。`kindFromCategory` を上記仕様で実装。`types.ts` に型を追加（`import type` で ProposalKind 等を各所から使えるよう export）。

- [ ] **Step 4: 成功確認** — Run: `npx vitest run src/lib/growth/proposalKind.test.ts` → PASS・`proposalKind.ts` 100%。`npx tsc --noEmit -p tsconfig.json` → 0。

- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/proposalKind.ts src/lib/growth/proposalKind.test.ts src/app/growth/approve/types.ts
git commit -m "feat(growth): 施策の種別ロジック(KIND_META/approveOutcomeFor/kindFromCategory)と型を追加

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: `ProposalDetailBody` 移植（4分岐 router・article 実データ/他縮約）

**Files:**
- Create: `src/app/growth/approve/ProposalDetailBody.tsx`
- 参照: `approve-proto/ProposalDetailBody.tsx`・本番 `HypothesisCard.tsx`（article 実データ源）

**Interfaces（Consumes）:** `ProposalKind`/`KIND_META`（Task1）・`PendingItem`（`./types`・article の仮説フィールドは既存 HypothesisCard が読むもの）・`ui/icons`。

**やること:** proto の種別ルーティング（`:29-69`）を移植。
- **article**: 既存 `HypothesisCard` が表示する仮説6項目（記事タイプ/狙う読者/検索意図/勝ち筋/成功指標/想定CTA）を proto の仮説グリッド見た目で**実データ表示**（PendingItem の既存 hypothesis フィールドを使用）。
- **site/event/other**: 本番データに詳細フィールドが**無い**ため縮約：種別ラベル（`KIND_META[kind].label`）＋メモ/note（あれば）のみ表示し、詳細フィールド欄は**出さない**（欠落耐性・ダミー禁止）。proto の site/event/other レイアウトは参考にしつつ「データが無い種別は簡素表示」で可。
- `KIND_ICON` は proto に倣い `ui/icons` の該当アイコンで表現。

- [ ] **Step 1**: proto `ProposalDetailBody.tsx` の4分岐と、本番 `HypothesisCard.tsx` が読む PendingItem の仮説フィールド名を確認。
- [ ] **Step 2**: `ProposalDetailBody.tsx` を実装（article=実仮説グリッド・非article=縮約）。`"use client"` は framer-motion 未使用なら不要（proto が motion を使うなら付与）。
- [ ] **Step 3**: `npx tsc --noEmit`（0）/ `npx eslint src/app/growth/approve/ProposalDetailBody.tsx`（0）。**この時点では ApproveClient 未結線のため単体でコンパイルが通ることを確認**（結線は Task 4）。
- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/ProposalDetailBody.tsx
git commit -m "feat(growth): 施策詳細ボディ ProposalDetailBody を proto から移植（article実データ・他種別は縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: `ProposalFormModal` 移植（作成モーダル・実API 結線・検証は純ロジック）

**Files:**
- Create: `src/app/growth/approve/ProposalFormModal.tsx`
- Create: `src/lib/growth/proposalForm.ts`（フォーム検証・API ペイロード整形の純ロジック）
- Test: `src/lib/growth/proposalForm.test.ts`
- 参照: `approve-proto/ProposalFormModal.tsx`・本番 `AddProposalForm.tsx`（実API 結線元）・`proposals.ts`（`PROPOSAL_CATEGORIES`/`parseProposalInput`）

**Interfaces（Produces / proposalForm.ts）:**
- `validateProposalForm(input: { name: string; kind: ProposalKind; category?: string; note?: string }): { ok: true; payload: { name: string; category: string; note?: string } } | { ok: false; error: string }`
  - `name` 必須（空→error「施策名を入力してください」等・proto/本番文言に合わせる）。
  - **kind→category 写像（persist は既存 API の {name,category,note} のみ）**: `article`→フォームで選んだ category(6値)。`event`→category `"イベント"`。`site`/`other`→category は既存6値のうち妥当な既定（例 `site`→`"サイトデザイン"`・`other`→`"コンテンツ"`）へ写像（詳細フィールドは persist しない＝縮約）。写像規則は本純関数に集約し 100% テスト。

**やること（ProposalFormModal.tsx）:** proto の `role="dialog" aria-modal`＋framer-motion＋種別セグメント4ボタンを移植。施策名(共通必須)＋種別別フィールド（article=カテゴリ6値チップ＋メモ／event=当面 name＋メモ＋(将来 whenLabel 等は UI 参考のみ・persist しない)／site/other=name＋メモ）。送信は `validateProposalForm` で整形し **既存 `POST /api/growth/proposals`**（`AddProposalForm` と同じ経路・`onAdded` コールバック）へ。`role="alert"` エラー表示。`useDialog`（focus）を root に付与・閉じるは既存規約（Kbd/クリック）。

> **重要**: 非 article 種別の詳細フィールドは persist できない（Notion 未拡張）。フォームでは詳細入力欄を**出さない**か、出しても送信ペイロードに含めない（縮約）。UI が誤解を生むなら「(準備中)」ラベルや当該欄非表示で対応。**実際に保存されるのは name/category/note のみ**。

- [ ] **Step 1: `proposalForm.ts` の失敗テスト**（`validateProposalForm`：name 必須・kind→category 写像・note 任意 の各ケース）。実 code は proto/本番文言と `PROPOSAL_CATEGORIES` を確認して確定。

```ts
import { describe, expect, it } from "vitest";

import { validateProposalForm } from "./proposalForm";

describe("validateProposalForm", () => {
  it("name 空は error", () => {
    const r = validateProposalForm({ name: "", kind: "article" });
    expect(r.ok).toBe(false);
  });
  it("article は選択 category を保持", () => {
    const r = validateProposalForm({ name: "夏の記事", kind: "article", category: "コンテンツ", note: "x" });
    expect(r).toEqual({ ok: true, payload: { name: "夏の記事", category: "コンテンツ", note: "x" } });
  });
  it("event は category=イベント へ写像", () => {
    const r = validateProposalForm({ name: "体験会", kind: "event" });
    expect(r.ok && r.payload.category).toBe("イベント");
  });
});
```

- [ ] **Step 2: 失敗確認** — Run: `npx vitest run src/lib/growth/proposalForm.test.ts` → FAIL。
- [ ] **Step 3: 実装** — `proposalForm.ts`（写像・検証）＋`ProposalFormModal.tsx`（proto 見た目・`validateProposalForm` 利用・実 API 結線）。
- [ ] **Step 4: 確認** — Run: `npx vitest run src/lib/growth/proposalForm.test.ts`（PASS・100%）/ `npx tsc --noEmit`（0）/ `npx eslint`（0）。
- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve/ProposalFormModal.tsx src/lib/growth/proposalForm.ts src/lib/growth/proposalForm.test.ts
git commit -m "feat(growth): 施策作成モーダル ProposalFormModal を proto から移植（検証は純ロジック100%・実API結線・詳細は縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: `ProposalView` 移植＋ApproveClient 結線（master-detail・種別フィルタ・却下）

**Files:**
- Create: `src/app/growth/approve/ProposalView.tsx`
- Modify: `src/app/growth/approve/ApproveClient.tsx`（`ProposalsView`+`AddProposalForm` の描画を `ProposalView`+`ProposalFormModal` へ差し替え）
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（施策 view のテスト移設）
- Modify: `vitest.config.ts`（`ProposalView.tsx`/`ProposalDetailBody.tsx`/`ProposalFormModal.tsx` を exclude 追記）
- 参照: `approve-proto/ProposalView.tsx`・本番 `ProposalsView.tsx`・`ApproveClient.tsx:1005-1013`

**やること:** proto の master-detail（左一覧＋右詳細）・**種別フィルタ chip 行**（`kindFromCategory` で各 proposal の kind を派生し `["all","article","site","event","other"]` でフィルタ）・却下入力（未処理に戻す）・**結末プレビュー行**（`approveOutcomeFor(kind).preview`）を移植。詳細ペインは `ProposalDetailBody`。承認/却下は**既存の実ハンドラ**（現行 BoardCard の onApprove/onReject＝`decideFromPanel`/`decide` 相当）へ結線（挙動不変）。作成は `ProposalFormModal`。

> **結線の不変契約**: 承認・却下・作成の**実 API 経路とハンドラは現行のまま**。ProposalView は現行 `ProposalsView`+`AddProposalForm`+`renderItem(BoardCard)` の役割を統合するが、**決定ロジック（decide/reject/addProposal）は ApproveClient 既存のものを渡す**。2ペイン（P3a）の枠内に収める。

- [ ] **Step 1**: `ApproveClient.tsx:1005-1013` 付近の現行施策描画（`visibleProposals`/`renderItem`/`addProposal`/承認却下ハンドラ）を精読し、ProposalView へ渡す props を確定。proto `ProposalView.tsx` の構造・フィルタ・却下入力・結末プレビューを確認。
- [ ] **Step 2**: `ProposalView.tsx` 実装（`kindFromCategory` で kind 派生・フィルタ・master-detail・`ProposalDetailBody`・`approveOutcomeFor` プレビュー・却下）。`"use client"`（framer-motion）。
- [ ] **Step 3**: ApproveClient を差し替え（`ProposalsView`+`AddProposalForm` 撤去→`ProposalView`+`ProposalFormModal`）。`vitest.config.ts` に3ファイル exclude 追記（理由コメント）。
- [ ] **Step 4**: `ApproveClient.test.tsx` の施策 view テストを新構造へ移設（承認/却下/作成/フィルタの実挙動を維持・空アサート禁止）。旧 `ProposalsView.test.tsx`/`AddProposalForm.test.tsx`/`HypothesisCard.test.tsx` は、対応コンポーネントが未使用になれば削除（grep で他参照ゼロ確認）・使用中なら残置。
- [ ] **Step 5: ゲート** — `npx tsc --noEmit`（0）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・グローバル100%）。**カバレッジが 100% を割る場合はテスト補完 or dead code 削除で解消**（純ロジックは exclude 禁止）。
- [ ] **Step 6: Commit**

```bash
git add -A -- ':!next-env.d.ts' ':!node_modules'
git commit -m "feat(growth): 施策を proto ProposalView(master-detail/種別フィルタ)へ移植し ApproveClient 結線（決定/作成の実API不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: 成績 純ロジック `reviewLabels` 移植（期間切替は縮約）

**Files:**
- Modify or Create: `src/lib/growth/metricsView.ts`（新設。`reviewLabels` を置く）＋ Test `metricsView.test.ts`
- 参照: `approve-proto/metricsView.ts`（`reviewLabels` `:74`）・本番 `PerformanceBoard.tsx` の現行 `reviewLabels()`（`:91`）・`articleMetricsView.ts`

**Interfaces（Produces）:**
- `reviewLabels(m: ArticleMetrics): string[]`（deltaPct/position/ctr/publishedAt で判定・複数該当可。proto 逐語だが**本番 `ArticleMetrics` 型に合わせる**：`views/users/keyEvents` は `MetricDelta`、`search` は `SearchMetrics`（MetricDelta＋`SearchQueryStat[]`）、`period`）。本番 `PerformanceBoard.tsx:91` の現行 `reviewLabels` と proto を突き合わせ、判定閾値は proto 準拠・入力型は本番準拠で確定。

> **rangeView/fitSeries は移植しない**（期間切替・Sparkline 縮約のため不要＝YAGNI）。`reviewLabels` のみ純ロジック化して 100%。

- [ ] **Step 1: 失敗テスト**（`metricsView.test.ts`：伸びている/CTR弱い/順位あと少し/要改稿 の各判定・複数該当・publishedAt 経過）。本番 `PerformanceBoard.test.tsx` の判定ラベルテストと proto を参照して入力/期待を確定。
- [ ] **Step 2: 失敗確認** — Run: `npx vitest run src/lib/growth/metricsView.test.ts` → FAIL。
- [ ] **Step 3: 実装** — `reviewLabels` を本番型で実装（proto の判定ロジック準拠）。
- [ ] **Step 4: 確認** — Run: `npx vitest run src/lib/growth/metricsView.test.ts`（PASS・100%）/ `npx tsc --noEmit`（0）。
- [ ] **Step 5: Commit**

```bash
git add src/lib/growth/metricsView.ts src/lib/growth/metricsView.test.ts
git commit -m "feat(growth): 成績の判定ラベル reviewLabels を純ロジック化（本番型準拠・100%・期間切替は縮約で非移植）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: `PerformanceBoard` 再スキン（proto 見た目・GSC 展開実装・期間/Sparkline 縮約）

**Files:**
- Modify: `src/app/growth/approve/PerformanceBoard.tsx`
- Modify (必要なら): `src/app/growth/approve/PerformanceBoard.test.tsx`（構造変更に追随・検証強度維持）
- Modify (複雑化時): `vitest.config.ts`（exclude 追記＝下記判断）
- 参照: `approve-proto/PerformanceBoard.tsx`・`reviewLabels`(Task5)・`ui/primitives`(RingScore/EyecatchThumb/MetaStat)

**やること:** proto 見た目へ再スキン：
- サマリーカード（合計表示数/ユーザー/記事数＝**本番 `summarizeMetrics` の実データ**）・「いちばん伸びた記事」バナー（実データの最大 delta 記事）・行リスト（`EyecatchThumb`＋判定ラベル＝`reviewLabels`＋チェブロン）。
- **GSC 行展開（RowDetail）を framer-motion で実装**（クリック/表示/CTR/順位＋上位クエリ＝**本番 `search`（MetricDelta＋`SearchQueryStat[]`）の実データ**）。proto `topQueries:string[]` ではなく本番 `SearchQueryStat[]` を表示。
- **期間切替(7/28/90日)ボタンと Sparkline は出さない（縮約）**。proto の該当 UI は移植しない。
- `aria-label="成績ボード"`・`role="list"`/`listitem`（本番既存）は**維持**。判定ラベル配色は proto トーンへ。

> **coverage 判断**: RowDetail の framer-motion 展開を含み PerformanceBoard が複雑化する。純ロジック（`reviewLabels`・整形は `articleMetricsView.ts`）は lib で 100% 済のため、PerformanceBoard.tsx が DOM/アニメ主体で計測しづらければ **exclude 追記**（理由コメント）も可。ただし**可能な限り既存 `PerformanceBoard.test.tsx` を新構造へ移設して非 exclude 維持**を優先（GSC 展開・判定ラベル・合計・順序の実挙動テスト）。exclude する場合も主要分岐の behavior テストは残す。

- [ ] **Step 1**: 本番 `PerformanceBoard.tsx` の現行構造（summarizeMetrics/reviewLabels/GSC 表示/aria）と proto の見た目・RowDetail を確認。`reviewLabels` を Task5 の lib からの import へ差し替え。
- [ ] **Step 2**: proto 見た目へ再スキン＋GSC RowDetail 実装（実 search データ）。期間切替/Sparkline は出さない。
- [ ] **Step 3**: テスト移設/追随（`PerformanceBoard.test.tsx`：無計測/合計/順序/前週比/GSC展開/判定ラベルを新構造で・検証強度維持）。exclude する場合は `vitest.config.ts` に理由コメント付き追記。
- [ ] **Step 4: ゲート** — `npx tsc --noEmit`（0）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・グローバル100%）。
- [ ] **Step 5: Commit**

```bash
git add -A -- ':!next-env.d.ts' ':!node_modules'
git commit -m "refactor(growth): 成績ボードを proto へ再スキン（GSC行展開=実データ実装・期間切替/Sparklineは縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 7: P5a フェーズ末ゲート＋ブラウザ確認観点

**Files:** なし（検証のみ・コントローラ実測）。

- [ ] **Step 1: 全体ゲート実測** — `npx tsc --noEmit -p tsconfig.json`（出力なし）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・グローバル100%・4指標）。
- [ ] **Step 2: 作業ツリー確認** — `git status --short` が `next-env.d.ts`/`node_modules` のみ・未push。
- [ ] **Step 3: ledger 更新＋ブラウザ確認観点提示** — `.superpowers/sdd/progress.md` に P5a 完了を記録。ユーザーへ確認観点（施策: master-detail・種別フィルタ・作成モーダル・承認/却下／成績: サマリーカード・バナー・GSC 行展開・判定ラベル／縮約: 種別詳細・期間切替・Sparkline は非表示）を提示し**停止**。

---

## Self-Review

**1. Spec coverage（設計書 line 86 の P5 のうち施策＋成績＝P5a）:**
- ProposalView（種別ルーティング）→ T1(純ロジック/型)+T2(詳細router)+T3(作成モーダル)+T4(view+結線) ✅。種別ルーティング=BE の代替として `kindFromCategory` 派生（BE 変更回避・裁定どおり縮約）✅。
- PerformanceBoard（期間/GSC は縮約）→ T5(reviewLabels)+T6(再スキン・GSC実装・期間/Sparkline縮約) ✅。
- coverage: 純ロジック（proposalKind/proposalForm/metricsView）100%・presentation exclude ✅。実 API 結線（proposals POST・decide/reject）不変 ✅。

**2. Placeholder scan:** T1/T3/T5 は純ロジックに完全なテストコード。T2/T4/T6 は proto ソースが視覚仕様・結線契約・縮約規則を明記。「適宜」等の抽象指示なし。各タスクに Step 1（現状把握）を置き実ファイル読解で細部確定（port の性質上、全 JSX 複製より proto 参照が DRY）✅。

**3. Type consistency:** `ProposalKind`/`ProposalStatus`/`SiteProposalDetail`/`EventProposalDetail`（T1・types.ts）→ T2/T3/T4 で消費 ✅。`kindFromCategory`(T1)→T3/T4 で kind 派生に使用 ✅。`validateProposalForm`(T3)→ペイロード `{name,category,note}` は既存 `POST /api/growth/proposals` と一致 ✅。`reviewLabels(m: ArticleMetrics)`(T5)→T6 で使用・入力は本番 `ArticleMetrics`（MetricDelta/SearchMetrics）✅。`rangeView`/`fitSeries` は縮約で非移植＝後続タスクが参照しないこと確認 ✅。

**懸念（実行時に解消）:** (a) `KIND_META` の tone を proto の値からどの `--p-*` トークンへ写すかは T1 Step3 で theme 実在トークンに合わせる（purple/green 系が theme に無ければ近い既存トークンへ）。(b) 非 article 種別の詳細フィールドを form に出すか否かは T3 で「persist できないものは出さない」を優先（縮約明記）。(c) PerformanceBoard の exclude 要否は T6 Step3 で複雑度により判断（純ロジックは lib で 100% 済のため exclude 可・ただし behavior テストは残す）。
