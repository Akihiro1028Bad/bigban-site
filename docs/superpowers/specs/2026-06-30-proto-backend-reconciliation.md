# プロト → 現状バックエンド 突合表（reconciliation）

- 日付: 2026-06-30
- 目的: `approve-proto`（捨て駒・モック）が暗黙に前提する型・状態・スキーマと、稼働中バックエンド（Notionプロパティ・APIルート・run.mjsモード・zodスキーマ）の実体を項目別に突合し、繋ぎこみ前に不一致を確定する。
- 方法: 5レーン並列調査（記事LC / AI相談 / 施策 / 計測 / 下書き編集）→ 統合。全61項目。各 finding はファイル:行で裏取り済み。
- 正典: **`scripts/growth/*.ts` の zod スキーマ**（advise.ts / bodyComment.ts / revise.ts / metrics.ts 等）。プロト型は素朴な単値・フラット型で、ほぼ全フィールドが名前か形状で食い違う。

## 一言サマリ

絶対に合わない核心は「型の構造」と「データの粒度」。proto は UI操作段階を直接型にした単値・フラット型（`Stage`6値, `Metrics.views:number`, `Advice.overall:number`, `topQueries:string[]`）。本番は Notion select 由来のパイプライン型・`MetricDelta`構造体・zodスキーマ（`ArticleStage`, `MetricDelta{current/prior/deltaPct}`, `AdviceFix{area/severity}`, `SearchQueryStat[]`）。
**ただし差分B(AI相談)は裏側ループが全部実装済みで、ブロッカーは全て「proto側の型をzodスキーマに寄せれば解消」＝バックエンド拡張ゼロ。** 拡張が要るのは施策多種別の下流・本文画像指示・生成進捗・スパークライン（いずれも後続フェーズ／省略可）のみ。

## 差分B（AI相談）を阻む不一致 ★最優先（全て proto寄せで解消）

| # | 項目 | proto 前提 | backend 実体（正典） | 埋め方 |
|---|------|-----------|----------------------|--------|
| B1 | Advice 総合値 | `Advice.overall:number`(0-100) types.ts:100 | `AdviceSchema.summary:string`必須 advise.ts:73 | overall廃止→summary表示 |
| B2 | AdviceScore | `{label, score 0-100}` types.ts:89 | `{axis, score 0-5整数, note?}` advise.ts:53 | label→axis・0-5表示・note追加 |
| B3 | AdviceFix | `{quote必須, reason, suggestion}` types.ts:93 | `{area必須, severity 高/中/低 必須, quote?, reason, suggestion}` advise.ts:61 | area/severity追加・quote optional |
| B4 | sentence 入力 | `BodyComment{block, unit, text}` types.ts:236 | `{blockIndex, excerpt(完全文), comment}` bodyComment.ts:111 | 3フィールド全改名。excerptは再アンカー用に完全文 |
| B5 | sentence 結果 | `BodyCommentFix{block, from, to, sentence}` types.ts:243 | `{commentIndex, before, after}` bodyComment.ts:151 | proto型置換。反映は`applyBodyCommentItem`(before一意一致) |
| B6 | revise 入力形式 | `revise.outline:string`(自由文1テキストエリア) types.ts:265 | `instructions=ReviseComment[]{line, comment}` revise.ts:46 | UIを**行コメント入力フォーム**に。1テキストエリアは繋ぎ込み不可 |
| B7 | revise body ターゲット | `ReviseTarget=outline\|title\|body` types.ts:40 | **body修正ルート無し**（本文は comment-revise 経由）revise.ts:14 | ReviseTargetを outline\|title に限定。本文修正は sentence へ誘導 |
| B8 | ConsultStatus 値数 | 3値 requested/presenting/failed types.ts:259 | 5値 select なし/依頼中/**処理中**/提示中/失敗 advise.ts:36 | 写像: なし=初期/依頼中=requested/処理中=processing/提示中=presenting/失敗=failed。**処理中(PC lock済)は再依頼禁止(BUSY_STATUSES)** |
| B9 | overall 非同期性 | 即時モック(1800msタイマー) useConsult.ts | POST /advise→Notion書込→数分〜15分後にPCが結果書戻し | 即時前提ドロワーを**非同期ポーリング**に書き直す |
| B10 | overall 結果ラッパー | `Article.advice:Advice`を直接表示 | GET /draft → `{draft:{advice: AdviceView{status, advice:Advice\|null, raw}}}` draftTypes.ts:22 | AdviceView.advice を詰める。null時は status/失敗理由を別表示 |
| B11 | ドロワー結線 | 1ドロワー1エンジンで3種束ね | overall=/advise+/draft, revise=/revise+/revise/apply, sentence=/body-comment+comment-revise | kind毎にエンドポイント＋ポーリング対象を分離配線。**バックエンド拡張不要** |

> 注: B11 で synthesizer は「AdviceCard/DecorationAssistant が ApproveClient 未render」と述べたが、別途 grep で `DraftReadyView.tsx:81,89` に render 済みを確認済み（差分C＝完了）。本ドロワー統合では起点を「AIに相談」ボタンへ集約する作業。

## その他サーフェスの主要不一致（後続フェーズ向け）

### 記事ライフサイクル / ステージ
- **Stage型 全6値が非対応**: proto `idea/outline_review/generating/draft_review/scheduled/published` vs 本番 `ArticleStage: proposed/queued/generating/drafted/published/rejected`（1対1ゼロ）。proto Stage を廃棄し本番 `ArticleStage`+`ProposalStage` を直import、`board.ts:22` の `ARTICLE_COLUMNS`/`STAGE_STEPS` を正とする。
- `outline_review`→`proposed`内で outline 有無分岐、`scheduled`→`drafted`+`scheduledAtMs≠null` で判定（Notion値追加不要）。`draft_review`→`drafted`（名称違いのみ）。
- `genProgress`/`generatingStep`/`stuck`: 本番 PendingItem/Notion に該当プロパティ無し → **省略**が現実的（表示するなら Notion新プロパティ+run.mjs書込で工数大）。
- `scheduledLabel`廃止→`formatScheduledAt(scheduledAtMs)`。`scheduledAtMs` は唯一ほぼ一致（undefined↔null 差のみ）。

### 施策多種別（差分A）
- `ProposalKind`(article/site/event/other): 本番 PendingItem にフィールド無し → `proposals.ts` に `categoryToKind()` 純関数 or Notion「種別」select新設（**要判断**）。
- `ProposalStatus`(pending/rejected/adopted): 本番 `ProposalStage: untouched/approved/rejected` → proto廃止し本番に統一（pending→untouched, adopted→approved）。
- `SiteProposalDetail`/`EventProposalDetail`: 本番Notion「施策提案」DBに受け皿無し → Notionプロパティ追加 or 既存「想定アクション」テキストに包含してサブフォーム縮小（**要判断**）。
- `evidence[]`=Notion「根拠」rich_text分割で配列化可、`proposalCategory`=「カテゴリ」select、`freeNote`=「想定アクション」で代替、`proposalRejectNote`=プロパティ無し(Low)。
- **カテゴリ6分類→kind4種別の導出規則が未定義**（MEO/サイト系/追加機能は1対1にならない）→ **要プロダクト判断**。
- `Hypothesis.plannedCta`: proto `string` vs 本番 `string[]`(multi_select) approve.ts:39 → proto を `string[]` に。

### 成績ボード / 計測
- **`Metrics` フラット単値 vs `ArticleMetrics` MetricDelta**: proto `views:number` vs 本番 `views:MetricDelta{current/prior/deltaPct}` metrics.ts:42 → UI単値参照を全て `.current` に・deltaPctはnullガード。
- **`series[]` スパークライン**: 本番に日次データ無し（週次「直近7日vs前7日」固定）→ 現状**描画不可**。短期は前週比 deltaPct のみ表示で代替（日次取得はGA4拡張で工数大）。
- `Range`(7/28/90日): 本番7日固定 → 7日固定に落とす。
- `SearchMetrics`/`topQueries`: proto単値+`string[]` vs 本番 `MetricDelta`+`SearchQueryStat[]{query,clicks,...}` → `.current`・`q.query` 参照化（詳細表示可になる利点）。
- `reviewLabels`: proto閾値ロジック(metricsView.ts)を捨て、本番 `scripts/growth/metricsReview.ts` を正として採用。

### 下書き編集 / 構成案 / 画像 / 公開キュー
- **`OutlineSection[]` JSON配列 vs `outline:string`**: 本番Notion「構成案」は plain text、revise/edit は `{outline:string}` 送受信 approve.ts:53 → JSON独自スキーマ化 or plain text(見出し一覧)に落とす（**要設計判断**）。
- **`ImageInstruction`(off/auto/custom) が一切無い** ★最大ミスマッチ: 本番は構成案テキスト中の `[画像:<スタイル>: <説明>]` 記法のみ解釈 body-image.ts:4。mode/isEyecatch/advancedNote の型・プロパティ・APIルート全部無し → (A)テキスト記法に変換し既存記法に合流（拡張ゼロ）or (B)Notion新プロパティ+API+run.mjs拡張（工数大）（**要判断**）。
- `checklist` 手動toggle vs `draftQuality()` 自動算出(draftQuality.ts:140, read-only) → proto手動checklistを `QualityCheck[]` 表示に差し替え・toggle廃止。
- `bodyImages:number`/`bodyImageUrls[]` vs `targetSrc`(microcms URL識別) → proto数値/配列管理を捨て既存 EyecatchPicker/BodyImagePicker パターン踏襲。
- `metaDescription`: `/api/growth/draft/excerpt` 実装済・契約ほぼ一致(200字上限)＝良好。
- publish/schedule: proto は `scheduledAtMs` を持つだけ vs 本番は即時publish(管理キー必須)と予約schedule(drafted必須・Notion書込のみ)が別ルート別認証 → ms→ISO変換しUIで publish と schedule を明確分岐（予約後も stage は drafted）。
- 本文画像3枚上限: 本番 `BODY_IMAGE_MAX=3` 強制＝整合（良好）。

## 確定事項（2026-06-30 ユーザーとの突合対話で決定）

差分Bには判断不要（全て proto を zod スキーマに寄せるだけ）。以下は各論点の決定。

1. **施策種別**: カテゴリから導出する純関数 `categoryToKind()` で **6種**（記事/サイト/イベント/MEO/SEO/その他）。Notion新「種別」プロパティは足さない。対応表は差分B設計書 §9 参照。
2. **SEOの出どころ**: 週次AIに **SEOカテゴリを新設**（`PROPOSAL_CATEGORIES` に1語＋weekly.md）。既存のSEO分析視点が SEO 施策として上がる。
3. **承認後アウトカム**: 既存 `initiatives` を**活かす**。施策を承認→AIが文案/仕様書を自動生成→人が実作業→**「対応済み」で非表示**。「承認で initiatives が動く」は意図仕様（地雷解消）。initiatives に event/SEO の生成分岐を追加。`ProposalStage` に終端「対応済み」を新設。
4. **計測スパークライン**: **廃止**（A）。日次データが無いため。前週比 deltaPct のみ表示。
5. **本文画像指示**: **バックエンド新設**（B）。Notionプロパティ＋API＋run.mjs拡張で構造化画像指示を保持（下書き編集フェーズで本格実装）。
6. **AI相談ドロワー（差分B）**: 3モード（overall/revise/sentence）。装飾は別枠維持。段階で自動出し分け（構成案段階=revise、下書き段階=overall+sentence）。型は zod スキーマに全面準拠（B1〜B8）。
</parameter>
</invoke>
