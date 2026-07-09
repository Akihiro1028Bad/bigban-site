# 設計書：CTAの構造化ノード編集（手動リッチエディタ ＋ AIインライン指示）

- 日付: 2026-07-09
- 対象: グロース下書き編集（`/growth/approve`）
- ステータス: 設計合意済み（実装計画へ移行前）

## 1. 背景と目的

グロース記事の下書きにおける CTA（Call To Action）ボタンが、現状**編集できない**。

- `DraftEditor.tsx` の `PRESERVE_SELECTORS` に `div.cta` があり、CTA は outerHTML を丸ごと持つ**アトミックな「保持専用ブロック」**（移動/削除のみ・中身は不可）。
- `draftEditorContent.ts` の `PRESERVED_BLOCK_LABELS.cta` に `hint: "文言・リンクの編集は次の更新で対応予定"` と明記済み。
- 実際の生成物の多くは `<p><a class="cta" href="…">文言</a></p>`（一次）/ `cta--ghost`（二次）の**インラインリンク**で、この場合テキストは打てても **href / 種別を変える手段が無い**。
- AI 装飾（decorate #147）も「許可セット外（list/table/**cta** 等）は提案しない」と CTA を除外。AI 本文コメント（#182）もアトミックブロックは対象外。

本機能で CTA を**構造化ノード**として扱い、①手動リッチエディタ ②AI インライン指示 の両方から編集可能にする。

## 2. 要件（合意事項）

### 手動編集（4操作すべて MVP に含む）
1. ボタン文言の編集
2. リンク先 URL の変更（プリセット＝予約/LINE/Instagram/問い合わせ/アクセス/価格 ＋ 自由 URL）
3. 一次（塗り `cta`）⇄ 二次（枠線 `cta--ghost`）の切替
4. CTA の追加 / 削除

### AI インライン指示
- 既存の #182「本文コメント」pull ループを CTA に拡張する。
- AI は文言・種別・URL（プリセット/任意どちらも）を**提案**できる。
- **反映は必ず人間の「採用」を経る**（既存 #182 モデル）。これが URL 変更時の canon 逸脱・誤リンクに対する安全網。

### UX（モックで合意済み）
- 本文中の CTA ボタンをクリック→選択状態→**インライン編集ポップオーバー**（文言入力／宛先セレクト＋確定 URL 表示＋自由 URL／一次·二次トグル／削除）。既存「装飾ポップオーバー(#179)」の様式を流用。
- ツールバーに「CTA 挿入」ボタン。
- AI 提案は**変更前後の差分（文言/宛先/種別）**を見せ、「採用/破棄」。

## 3. canon（正典）制約

CTA のリンク先は正典で縛られる（単一ソース＝`scripts/growth/facility-context.json`）。
- 予約: 2026年7月時点 RESERVA `https://reserva.be/tpbt`、8月以降は labola へ切替予定。
- SNS 導線は公式 Instagram / 公式 LINE のみ。
- 未確定情報の断定禁止（`facility-context.json` の `doNotWrite`）。

→ **宛先プリセットの URL はハードコードせず `facility-context.json` を参照**し、予約サービス切替（7月→8月）に自動追従する。任意 URL は許可するが、AI 経由の URL 変更は人間採用を必須にする。

## 4. アーキテクチャ

リポジトリ規約（純ロジック分離＋テスト、薄い UI/CLI はカバレッジ除外）に準拠する。

| レイヤ | ファイル | テスト方針 |
| --- | --- | --- |
| CTA 純ロジック（新規） | `scripts/growth/ctaBlock.ts` ＋ `src/lib/growth/ctaBlock.ts`（再export） | **TDD・100% 必須** |
| 手動 UI | `src/app/growth/approve/DraftEditor.tsx`（CTA ノード / nodeView / ツールバー挿入） | カバレッジ除外（既存慣例）・ブラウザ検証 |
| AI 純ロジック | `scripts/growth/bodyComment.ts`（CTA 行対応）＋ comment-revise プロンプト | **TDD・100% 必須** |
| AI ループ/CLI | `scripts/growth/comment-revise-cli.ts`（CTA 適用の結線） | 除外（薄い I/O） |
| サニタイザ | `src/lib/news/sanitize.ts`（`cta`/`cta--ghost` は許可済み・変更不要） | 既存 |

### 4.1 CTA 純ロジック（`ctaBlock.ts`）

CTA の構造化モデルと変換・検証を DOM 非依存で提供する（`draftEditorContent.ts` と同じ設計思想）。

```
type CtaVariant = "primary" | "ghost";
interface Cta { label: string; href: string; variant: CtaVariant; }

parseCta(html): Cta | null          // <a class="cta[ cta--ghost]" href>label</a> と <div class="cta">… を吸収
serializeCta(cta): string           // 正準 HTML へ直列化（サニタイザ往復で class が残ることをテスト）
CTA_DESTINATIONS: 宛先プリセット      // {key,label,url} 配列。URL は facility-context 参照
validateCta(cta): { ok, errors }     // 文言必須・URL 形式（プリセット or http(s)）
```

- **後方互換**: `parseCta` は `<a class="cta">`（p 内も含む）と旧 `<div class="cta">` の両形を吸収し、内部表現に正規化する。これにより `PRESERVE_SELECTORS` から `div.cta` を外しても既存下書きが壊れない。
- 予約 URL は `facility-context.json`（確定事実）から読む。

### 4.2 手動 UI（`DraftEditor.tsx`）

- `Cta = Node.create`（TipTap カスタムノード）
  - `parseHTML`: `a.cta` / `a.cta.cta--ghost` / `div.cta` を認識
  - attrs: `{ label, href, variant }`（`parseCta` 由来）
  - `renderHTML`: `serializeCta` 相当の正準 HTML
  - `addNodeView`: 既存 `PreservedBlock` を手本にした React nodeView
- `PRESERVE_SELECTORS` から `div.cta` を除去（CTA はアトミック保持をやめ、編集可能ノードにする）。
- nodeView UI: クリックでインラインポップオーバー（文言 input／宛先 select ＋確定 URL 表示／自由 URL／一次·二次トグル／削除）。attrs⇄html 変換は `ctaBlock.ts` に委譲し UI は薄く保つ。
- ツールバー「CTA 挿入」→ 既定 CTA（予約・一次）を挿入して即編集。

### 4.3 AI インライン指示（#182 拡張）

- `extractReviewLines`（`scripts/growth/bodyComment.ts`）で CTA を**コメント可能行**として扱う。アンカーは CTA の文言 excerpt（既存の `{blockIndex, excerpt}` アンカー方式に合わせる）。
- `comment-revise` プロンプトに CTA 変更ルールを追加:
  - 変更可能: 文言 / 種別 / 宛先（プリセット一覧＝canon ／ 任意 URL も可）
  - 反映は人間採用前提。未確定情報の断定禁止、予約 URL は facility-context 準拠。
- 適用パスは `serializeCta` で正準 HTML を生成し、本文へ差し込む。
- CTA 行のアンカー方式の最終確定は Phase 3 着手時に `bodyComment.ts` の実コードで行う（下記リスク参照）。

## 5. データフロー

- **手動**: エディタ内で CTA ノードを編集 → 保存時 `sanitizeDraftHtml`（`cta`/`cta--ghost` 許可）→ `POST /api/growth/draft/edit` → Notion 本文ミラー更新。
- **AI**: 承認画面が CTA 行へコメントを `POST /api/growth/body-comment` → Notion に依頼を書く（pull 型）→ 常時稼働 PC の `comment-revise-cli` が拾い、AI が提案生成 → 承認画面が提案を表示 → 人間が「採用」→ `serializeCta` で本文反映。

## 6. 実装フェーズ

- **Phase 1 — CTA 純ロジック（`ctaBlock.ts`・TDD・100%）**: parse/serialize/宛先プリセット/validate、サニタイザ往復テスト、後方互換テスト。
- **Phase 2 — TipTap CTA ノード＋インライン編集 UI（`DraftEditor.tsx`）**: ノード定義・nodeView・ポップオーバー・ツールバー挿入・`div.cta` の保持解除。
- **Phase 3 — AI インライン指示（#182 拡張）**: `extractReviewLines` の CTA 対応、comment-revise プロンプト、適用パス。
- **Phase 4 — 検証**: `tsc --noEmit` / 全テスト / **coverage 真の 100%**（純ロジックは実テスト、除外は規約どおり）/ ブラウザ動作確認。

Phase 単位でレビュー・コミット。実装は Codex に委譲（ブリーフに「除外/istanbul ignore/防御コード削除でカバレッジを繕うの禁止」を明記し、fable5 が通常環境で必ず再検証）。

## 7. リスク

- **HIGH**: `div.cta` を保持対象から外す変更が既存下書きの `div.cta` ブロックに影響しうる → `parseCta` で両形吸収し後方互換を担保（Phase 1 でテスト）。
- **MEDIUM**: CTA を #182（テキスト文アンカー前提）で扱う設計差 → CTA 行のアンカー方式は Phase 3 着手時に実コードで最終確定。
- **MEDIUM**: 予約 URL の canon 追従 → `facility-context.json` 単一ソース参照で回避。
- **LOW**: サニタイザは `cta`/`cta--ghost` 許可済み。

## 8. テスト戦略

- `ctaBlock.ts` / `bodyComment.ts`（CTA 部分）: 単体で 100%（parse 両形・serialize 往復・validate 分岐・宛先プリセット・アンカー）。
- `DraftEditor.tsx`: カバレッジ除外（既存慣例）。挙動はブラウザ検証＋純ロジック側テストで担保。
- API/CLI: 既存の route.test / 除外規約を踏襲。
- 全体: `npx vitest run --coverage` で All files 100%、`tsc --noEmit` パスを Phase 4 で確認。

## 9. スコープ外（YAGNI）

- CTA のスタイル（色・角丸等）の編集 UI（テーマ CSS 固定のまま）。
- 複数ボタンをまとめる新レイアウト。
- AI が CTA を新規挿入する提案（今回は既存 CTA の編集のみ。挿入は手動）。
