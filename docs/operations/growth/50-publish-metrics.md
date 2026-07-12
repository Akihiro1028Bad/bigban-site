# 公開キューと計測ループ

> 下書き→公開の振り分け/予約と、公開後の GA4 成績可視化。共通原則は [00-canon.md](00-canon.md)。

## 公開キュー(#H23 例外管理型 ＋ #H24 予約公開)

- 記事タブ上部の折りたたみ「公開キュー」(`PublishQueue.tsx`)で、下書き済み記事を **公開OK(green)** と **要対応(例外・理由付き)** に振り分け、green を**一括公開**／**一括予約**できる。
- 公開可否＝アイキャッチ有り＋本文非空(`partitionPublishQueue`／`publishBlockReason`)。
- 公開は既存 `/api/growth/publish`(冪等)を ready 件数ぶん順次呼ぶ。
- **予約公開はプル型**: microCMS は書き込み API で予約公開を持たない(`reservationTime` は管理画面専用・read-only／status PATCH は `["PUBLISH"|"DRAFT"]` のみ)ため、`/api/growth/publish/schedule` は Notion `公開予約時刻` に時刻を書くだけ(強権キー不要)。
- 実際の公開は PC の `npm run growth:publish-due`(`publish-due-cli.ts`)が `selectDuePublications` で到来分を選び `publishContent`(管理キー)で公開＋予約解除＋LINE通知。
- 承認画面は Notion を読むだけ(`toPendingItems` が `eyecatchUrl`/`hasDraftBody`/`scheduledAtMs` を載せる)。
- 純ロジック `scripts/growth/publishQueue.ts`(`publishBlockReason`/`partitionPublishQueue`/`selectDuePublications`/`buildScheduleProps`/`PUBLISH_SCHEDULE_PROP`・`src/lib/growth/publishQueue.ts` 再エクスポート)＋表示整形 `articleMetricsView.ts`(`formatScheduledAt`)、CLI はカバレッジ除外。
- 生成中/公開済みは段階ガード(#H9)で予約も弾く。

## 計測ループ(#C4・成績ボード・pull型)

- 公開記事の GA4 成績(表示数/ユーザー数＋前週比)を承認画面の「成績ボード」(`PerformanceBoard.tsx`)に表示。
- プル型＝PC の `npm run growth:metrics`(`metrics-cli.ts`)が GA4 `topPages`(pagePath→screenPageViews/activeUsers・current/prior 2期間)を取得 → Notion 公開記事(ステータス=公開済み)ごとに microCMS を contentId で引いて `slug`/`locale`→`articlePagePath` で GA4 pagePath を組み立て → `metricsForPagePath`(クエリ違いの行は合算)で突き合わせ → `成績データ`(JSON)＋`成績更新時刻`(date)を Notion へ書く。
- 承認画面は `toPendingItems` が `成績データ` を `parseMetrics`(zod・安全側 null)して `PendingItem.metrics` に載せ、`PerformanceBoard` が合計＋表示数降順リストを描画。
- **承認画面は Notion を読むだけ**(GA4/microCMS は触らない)。
- 純ロジック `scripts/growth/metrics.ts`(`articlePagePath`/`normalizePagePath`/`metricsForPagePath`/`serializeMetrics`/`parseMetrics`/`buildMetricsMirrorProps`/`summarizeMetrics`・`src/lib/growth/metrics.ts` 再エクスポート)＋表示整形 `articleMetricsView.ts`(`formatCount`/`formatDelta`)、CLI はカバレッジ除外。
- `growth:metrics` は cron 等で定期実行(claude 不使用の純データ結線・`GROWTH_DRYRUN=1` で空実行)。
