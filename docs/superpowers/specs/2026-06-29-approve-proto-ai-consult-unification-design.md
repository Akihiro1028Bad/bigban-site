# 承認画面プロトタイプ AI往復UI統合 設計書

- 日付: 2026-06-29
- 対象: `src/app/growth/approve-proto/`（承認画面プロトタイプ #proto）
- 種別: 機能統合・リファクタ（プロトタイプ内。本番ロジックには非干渉）

## 1. 目的

承認画面プロトタイプには、AIと往復する系統が4つ存在し、ライフサイクルがほぼ同型のまま重複している:

| 系統 | 入力 | 提示（出力） | 起点 |
|---|---|---|---|
| revise（修正案） | タイトル/本文への自由文指示＋構成案の行コメント | 元/新 diff（対象ごと反映） | フッター→モーダル／構成案ビュー |
| advice（アドバイス） | 任意の「見てほしい点」 | 採点＋強み＋直すべき点（本文へ追記） | アドバイスタブ |
| bodyComment（本文コメント） | 本文の文ごとの注釈 | 文ブロックの before/after（個別/一括反映） | 本文タブのインライン＋ |

4系統とも `none → requested(待ち) → presenting(提示) → failed(再依頼)` のライフサイクルを持ち、`setTimeout` モック・失敗注入・トースト・待ちシマー・提示カードの apply/dismiss が**4回コピペ**されている。状態フィールドも `reviseStatus` / `adviceStatus` / `bodyCommentStatus` と3本並走している。

**ゴール**: この往復を「AIに相談」1系統へ統合し、(a) 3ドアの学習コスト と (b) コード重複 を同時に解消する。

## 2. スコープと非スコープ

### スコープ
- `approve-proto` 内のAI往復UIの統合（エンジン層・UI層）
- 既存の提示の中身（採点 / diff / before-after）は**温存**し、共通枠の中で描画する
- failed/再依頼の表示・型は温存する

### 非スコープ
- 本番ロジック（`scripts/growth/*`、`src/lib/growth/*`、`src/app/[locale]/news/*`）の変更
- AI出力内容そのものの改善（プロンプト・モデル）
- プレビュー機能（既存 `preview/[id]` ルート）の変更
- 別プロトタイプ（approve-proto2 は削除済み）

## 3. 設計方針

### 境界の引き方

**統合する（重複の核）**:
- ライフサイクル `requested → presenting → failed`
- `setTimeout` モック・失敗注入・タイマークリーンアップ
- 再依頼（retry）
- トースト・待ちシマー
- 提示カードの「枠」と apply / dismiss の語彙

**残す（本質的に別物）**:
- 3つの入力手段（全体 textarea / 修正トグル / 文ごと注釈）
- 3つの提示中身（採点 / diff / before-after）

→ 変わる部分（入力手段・提示中身）だけモード別に残し、それ以外を1本化する。

### UI構造（案C: 相談ドロワー）

本文を見ながら相談できるよう、全画面モーダルではなく**右側レール型ドロワー**（本文はドロワーの左に残り、クリック可能）。

```
┌─ AIに相談 ───────────────[esc]┐
│ [全体を見てもらう][ここを直す][この文] │  ← モード切替(セグメント)
│ ┌ 入力(モードで変化) ───────────┐ │
│ │ 全体 : textarea「見てほしい点(任意)」  │ │
│ │ 修正 : ☑タイトル ☑本文 + 指示欄      │ │
│ │ 文   : 本文の＋で追加した注釈リスト    │ │
│ └─────────────────[相談する]┘ │
│ ── 相談の結果（共通カード）──────── │
│ ▸ [修正]カード status=提示 → diff      │
│ ▸ [全体]カード status=待ち → shimmer   │
│ ▸ [文]  カード status=失敗 → 再依頼    │
└──────────────────────────┘
```

- **入力の起点は文脈に残す**: 「この文」は本文インラインの＋から、「構成」は構成ビューの行コメントから注釈を足す → どちらも consult になってドロワーの結果に合流（**出力は1か所**）。
- **結果は共通カード**: ヘッダ（モードバッジ＋入力リキャップ＋ステータス）は共通。本体だけ既存の3レンダラ（採点 / diff / before-after）を差し込む。
- 本文は左ペインに**1つだけ**描画。「この文」モードでも左ペイン本文に＋を出すだけで、本文を再描画しない（案Aで生じる本文の二重描画を回避）。

## 4. アーキテクチャ

### ① エンジン層 — `useConsult` フック（新規）

`reviseStatus` / `adviceStatus` / `bodyCommentStatus` の3並走を、Article 上の `consults: Consult[]` 1本へ置換する。

```ts
type ConsultKind = "overall" | "revise" | "sentence";
type ConsultStatus = "requested" | "presenting" | "failed";

interface ConsultInput {
  overall?: { focus: string };                                   // advice の「見てほしい点」
  revise?:  { title?: string; body?: string; outline?: string }; // revise 指示
  sentence?: BodyComment[];                                      // 文ごと注釈（送信時スナップショット）
}

interface ConsultResult {
  overall?: Advice;             // 既存型を再利用
  revise?:  ReviseProposal;     // 既存型を再利用
  sentence?: BodyCommentFix[];  // 既存型を再利用
}

interface Consult {
  id: string;
  kind: ConsultKind;
  status: ConsultStatus;
  input: ConsultInput;
  result?: ConsultResult;
}
```

`useConsult` が公開する操作:

- `request(kind, input)` — `Consult{status:"requested"}` を生成し、モックタイマーを起動。完了で `{status:"presenting", result}` か、失敗注入時は `{status:"failed"}` に遷移。
- `retry(id)` — 同一 input でモックを再実行（`failed → requested → …`）。
- `applyResult(id, target?)` — 提示の一部/全部を Article 本体（title/body/outline）へ反映。
- `dismiss(id)` — 提示を破棄。
- apply / dismiss 完了で当該 consult を `consults` から除去（履歴は持たない＝現挙動踏襲）。

タイマー・失敗注入・クリーンアップはこのフックに一元化する。`BodyComment[]`（文注釈の下書き）は送信前バッファとして Article 上に残し、`request("sentence", …)` 時にスナップショットして consult へ移す。

### ② UI層

- `ConsultDrawer.tsx`（新規）— ドロワーの殻。`AnimatePresence` + `motion`（x方向スライド）。ヘッダ（タイトル＋esc閉じ）、モード切替セグメント、モード別 composer、結果ストリームを内包。`useDialog` でフォーカストラップ／esc を踏襲。
- `ConsultCard.tsx`（新規）— 共通枠＋ステータス分岐。
  - `requested` → 待ちシマー「AIが考えています…」
  - `failed` → エラー＋「再依頼する」
  - `presenting` → モード別本体を差し込み（apply / dismiss）
- 提示本体は既存ビューから**本体だけ**抽出:
  - `ReviseProposalBody`（`ReviseCompareView` の diff 部）
  - `AdviceBody`（`AdviceView` の採点＋強み＋fixes 部）
  - `SentenceFixBody`（`BodyCommentView` の fixes 部）
- 本文インラインの＋（文注釈の追加 UI）は左ペインに残し、ドロワーの「この文」モードへ注釈を流す。

### ③ ファイル変更一覧

**新規**
- `useConsult.ts`（エンジン）
- `ConsultDrawer.tsx`（殻）
- `ConsultCard.tsx`（共通枠＋ステータス）
- `ReviseProposalBody.tsx` / `AdviceBody.tsx` / `SentenceFixBody.tsx`（提示本体の抽出先）

**改修**
- `types.ts` — `Consult` 系の型追加。`Article` の3系統 status/instruction/proposal フィールドを `consults: Consult[]` に置換。`BodyComment` / `Advice` / `ReviseProposal` / `OutlineSection` / `BodyCommentFix` は提示本体の型として温存。
- `page.tsx` — `requestRevise` / `requestAdvice` / `requestBodyComment` の3ハンドラ＋state を `useConsult` へ集約。フッター「修正を依頼」＝ドロワーを "ここを直す" モードで開く。校正クラスタの3タブ → 単一「AIに相談」入口（ドロワーを開く）。
- 構成ビュー（`OutlineView`）の行コメント → revise consult（`input.revise.outline`）として request。

**退役**
- `ReviseRequestModal.tsx`（→「ここを直す」composer へ吸収）
- 旧3タブの殻（`ReviseCompareView` / `AdviceView` / `BodyCommentView` の殻部分。本体は上記へ抽出）

## 5. データフロー

1. ユーザーがドロワーを開く（フッター「AIに相談」/「修正を依頼」、または本文＋／構成行コメント）。
2. モードを選び入力 → 「相談する」。
3. `useConsult.request(kind, input)` が `Consult{requested}` を `consults` に追加 → モックタイマー起動。
4. タイマー完了 → `presenting`（or 失敗注入で `failed`）。結果ストリームにカードが現れる。
5. `presenting` カードで対象ごと「反映」→ `applyResult` が Article 本体を更新し、当該 consult を除去。「却下」→ `dismiss` で除去。
6. `failed` カードの「再依頼」→ `retry`。

並行相談を許容（`consults` は配列）。例: 「全体待ち」と「修正提示」が同時に存在しうる。

## 6. エラーハンドリング

- 失敗注入は `useConsult` 内に集約（現状の確率的失敗を踏襲）。
- `failed` 状態は共通カードの分岐で「同じ入力で再依頼」を提供（表示・型を温存）。
- タイマーは consult 単位で管理し、アンマウント／除去時に必ずクリーンアップ（リーク防止）。

## 7. テスト方針

- `useConsult` をユニットテスト: request → presenting / failed 遷移、retry、applyResult による Article 更新、dismiss による除去、タイマークリーンアップ（fake timers）。
- 共通カードのステータス3分岐（requested / failed / presenting）をレンダリングテスト。
- ドロワーの a11y: `role="dialog"` / esc 閉じ / フォーカストラップ（`useDialog` 経由）。
- 既存の提示本体（diff / 採点 / before-after）の反映挙動は抽出後も同等であることを確認。
- プロトタイプはカバレッジ計測外（CLAUDE.md の純ロジック分離方針）だが、`useConsult` はロジック中心なのでテスト対象とする。

## 8. 設計判断（代替案との対比）

- **統合の深さ**: 「1パネル＋1エンジン（3モード内包）」を採用。エンジンのみ統合（UXの3ドアが残る）/ 完全単一チャネル（並行相談不可）は不採用。
- **パネル構造**: 案C（相談ドロワー）。案A（全部1タブ）は本文の二重描画が必要、案B（入力分散・結果のみ集約）は「1入口感」が弱いため不採用。
- **履歴**: 持たない。apply/dismiss 完了でカードはストリームから消える（現挙動踏襲、YAGNI）。
- **本文描画**: 左ペインに1つだけ。「この文」モードは本文に＋を出すのみ。
