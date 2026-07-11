# 設計書：週次LINE通知にレポート要約＋合言葉を載せる

- 日付: 2026-07-09
- 対象: グロース週次LINE通知（`scripts/growth/notify-line.ts` ＋ `digest.ts` / `digest-flex.ts`）
- ステータス: 設計合意済み

## 1. 背景と目的

週次グロースレポート（Notion「週次グロースレポート」DB・本文は `今週の数字 / 優先上位 / 論点 / データ注意` の4セクション）を、**Notionを開かずLINEで要約として読めるようにする**。加えて、承認画面リンクは残しつつ**合言葉も通知に載せて**、LINEからそのまま承認画面に入れるようにする。

現状の週次通知（Flexダイジェスト）は `今週の数字 / 優先施策 / 保留件数 / 承認リンク` を持つが、**レポートの質的な内容（論点・データ注意）が無く**、合言葉も載っていない。

## 2. 要件（合意事項）

- **要約**でよい（全文ではない。各セクションは要点に絞る）。
- 形式は **Flexカード**（既存 `buildDigestFlex` を拡張。太字見出し・承認ボタン・合言葉を1枚に）。
- **論点 / データ注意** をレポート本文から抽出して要約表示する（新規）。
- **今週の数字 / 優先施策** は既存ロジック（DB算出）をそのまま使う。
- **承認画面リンクは残す**（既存 `buildApproveUrl`）。
- **合言葉を表示**する。値は **`APPROVE_SECRET`（env）をそのまま表示**（ベタ書きしない＝ゲートの実体と常に一致。オーナーは `APPROVE_SECRET=ピックルバン` を Vercel＋自宅PC の env に設定）。
- 欠落耐性: レポート本文が取れない/該当セクションが無い/`APPROVE_SECRET` 未設定でも通知は落とさず、その部分だけ省く。

## 3. アーキテクチャ

| レイヤ | ファイル | テスト |
| --- | --- | --- |
| レポート要約 純ロジック（新規） | `scripts/growth/digest.ts`（`extractReportSummary`）＋型 | **TDD・100%** |
| ダイジェスト整形（拡張） | `scripts/growth/digest.ts`（`buildDigestMessage` altText）／`scripts/growth/digest-flex.ts`（`buildDigestFlex`） | **TDD・100%** |
| I/O 結線（拡張） | `scripts/growth/notify-line.ts`（本文取得＋`APPROVE_SECRET`読取＋digestInput組立） | カバレッジ除外（薄いI/O） |

### 3.1 レポート要約 純ロジック（`extractReportSummary`）

Notionレポート本文ブロック配列から、質的セクションの要点を抽出する。DOM/IO 非依存。

```
interface ReportSummary {
  discussion: string[];   // 論点 の要点行(最大 N 行)
  dataNotes: string[];    // データ注意 の要点行(最大 N 行)
}
extractReportSummary(blocks: readonly NotionBlock[]): ReportSummary
```

- 見出しブロック（heading_2/heading_3）の plain_text が「論点」「データ注意」を**含む**かで区間を特定し、次の見出しまでの paragraph / bulleted_list_item の plain_text を要点行として集める。
- 各セクション**最大 3 行**（要約なので絞る。超過分は落とし、末尾に「…」を付ける等）。長すぎる行は省略（例 120 字で `…`）。
- 見出しの表記ゆれに寛容（「今週の論点」「主要な論点」等も「論点」を含めばヒット）。該当なしは空配列（欠落耐性）。

### 3.2 DigestInput 拡張（`digest.ts`）

```
interface DigestInput {
  // ... 既存(periodLabel/metrics/topActions/pendingCount/reportUrl/approveUrl/warnings/sha)
  reportSummary?: ReportSummary;   // 追加。未指定/空なら該当セクション非表示
  passphrase?: string | null;      // 追加。APPROVE_SECRET。未設定なら合言葉行を出さない
}
```

### 3.3 表示（`buildDigestFlex` / `buildDigestMessage`）

Flexカード（altTextも同内容をテキストで）:
```
📊 週次グロースレポート（M/D〜M/D）
■ 今週の数字     … 主要指標(既存)
■ 優先施策       … top3(既存)
■ 論点           … reportSummary.discussion(新規・最大3行)
■ データ注意     … reportSummary.dataNotes(新規・あれば)
[承認画面を開く]  … approveUrl ボタン(既存)
🔑 合言葉: <APPROVE_SECRET>   … 新規(あれば)
(失敗サマリ行・既存)
```
- 論点/データ注意が空なら見出しごと省く。合言葉が無ければ行ごと省く。

### 3.4 I/O 結線（`notify-line.ts`）

- `getLatestReport` で得た `report.id` に対し `listBlockChildren(report.id, opts)` で本文ブロックを取得 → `extractReportSummary(blocks)`。
- `process.env.APPROVE_SECRET` を読み `passphrase` に。
- `digestInput` に `reportSummary` / `passphrase` を追加して既存の `buildDigestMessage` / `buildDigestFlex` に渡す。
- 既存の `reportUrl`（公開Notionリンク）は現状のまま（`NOTION_PUBLIC_DOMAIN` 設定時のみ表示）。要約が主・リンクは補助。

## 4. リスク

- **MEDIUM**: レポート見出しの表記ゆれ → キーワード包含マッチ＋欠落時空配列で吸収。
- **LOW**: 合言葉をLINEに載せるセキュリティ → 既存設計が「LINEで届いた合言葉を入力」前提（gate文言）なので方針一致。信頼できるLINEグループが前提。
- **LOW**: `APPROVE_SECRET` が自宅PC(notify)env と本番(gate)env でズレると表示と実体が食い違う → env表示方式なので「両方に同じ値を入れる」運用で回避（ベタ書きより安全）。

## 5. テスト戦略

- `extractReportSummary`: 論点/データ注意の抽出・表記ゆれ・最大行数・長文省略・該当なし空配列（純ロジック100%）。
- `buildDigestMessage`/`buildDigestFlex`: reportSummary 有/無、passphrase 有/無での表示分岐（純ロジック100%）。
- `notify-line.ts`: カバレッジ除外（I/O）。実データ手動確認は `GROWTH_DRYRUN=1` で altText を目視。

## 6. スコープ外（YAGNI）

- 全文掲載（要約に限定）。
- 論点以外の新セクション追加。
- 合言葉のローテーション自動化。
