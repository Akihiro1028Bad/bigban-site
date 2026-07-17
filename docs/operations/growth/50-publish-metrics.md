# 公開キューと計測ループ

> 下書き→公開の振り分け/予約と、公開後の GA4 成績可視化。共通原則は [00-canon.md](00-canon.md)。

## 公開キュー(#H23 例外管理型 ＋ #H24 予約公開)

- 公開権限は人間だけが付与する。AIの自律判断は公開権限にならず、記事案の承認も下書き生成の許可に限られる。
- **即時公開**は人間が再認証後に「今すぐ公開」を選び、公開APIが決定的に処理する。**予約公開**は人間が再認証後に日時を指定して将来の公開権限を付与する。予約解除が確実に有効なのはworkerの対象取得前までで、実行中は間に合わない場合がある。
- 記事タブ上部の折りたたみ「公開キュー」(`PublishQueue.tsx`)で、下書き済み記事を **公開OK(green)** と **要対応(例外・理由付き)** に振り分け、green を**一括公開**／**一括予約**できる。
- 公開可否＝アイキャッチ有り＋本文非空(`partitionPublishQueue`／`publishBlockReason`)。
- 公開は既存 `/api/growth/publish`(冪等)を ready 件数ぶん順次呼ぶ。
- **予約公開はプル型**: microCMS は書き込み API で予約公開を持たない(`reservationTime` は管理画面専用・read-only／status PATCH は `["PUBLISH"|"DRAFT"]` のみ)ため、`/api/growth/publish/schedule` は Notion `公開予約時刻` に時刻を書くだけ(強権キー不要)。
- 実際の予約公開は非AIの決定的worker `npm run growth:publish-due`(`publish-due-cli.ts`)が、実行開始時のスナップショットから `selectDuePublications` で到来分を選び、各対象を公開直前ゲートで検証して `publishContent`(管理キー)で公開＋予約解除＋LINE通知する。公開直前に予約状態そのものは再取得しない。
- 承認画面のキュー表示は Notion のミラーを読む(`toPendingItems` が `eyecatchUrl`/`hasDraftBody`/`scheduledAtMs` を載せる)。強権操作は再認証後の人間の明示操作に限定する。
- 純ロジック `scripts/growth/publishQueue.ts`(`publishBlockReason`/`partitionPublishQueue`/`selectDuePublications`/`buildScheduleProps`/`PUBLISH_SCHEDULE_PROP`・`src/lib/growth/publishQueue.ts` 再エクスポート)＋表示整形 `articleMetricsView.ts`(`formatScheduledAt`)、CLI はカバレッジ除外。
- 生成中/公開済みは段階ガード(#H9)で予約も弾く。

## 計測ループ(#C4・成績ボード・pull型)

- 公開記事の GA4 成績(表示数/ユーザー数＋前週比)を承認画面の「成績ボード」(`PerformanceBoard.tsx`)に表示。
- プル型＝PC の `npm run growth:metrics`(`metrics-cli.ts`)が GA4 `topPages` を取得し、公開記事の `articlePagePath` と突き合わせて `成績データ`＋`成績更新時刻`を Notion へ書く。`measurementStatus` は行あり=`measured`、取得成功・行なし=`path-unmatched`、認証/取得失敗=`source-error`。前2者は実測値（行なしは明示的0）、`source-error` の0はプレースホルダーで、集計・改稿判定から除外する。いずれも独立した実予約状態は更新する。
- 承認画面は `toPendingItems` が `成績データ` を `parseMetrics`(zod・安全側 null)して `PendingItem.metrics` に載せ、`PerformanceBoard` が合計＋表示数降順リストを描画。
- **成績ボードの表示経路は Notion ミラーの読み取り専用**(GA4/microCMS は触らない)。
- 純ロジック `scripts/growth/metrics.ts`(`articlePagePath`/`normalizePagePath`/`metricsForPagePath`/`serializeMetrics`/`parseMetrics`/`buildMetricsMirrorProps`/`summarizeMetrics`・`src/lib/growth/metrics.ts` 再エクスポート)＋表示整形 `articleMetricsView.ts`(`formatCount`/`formatDelta`)、CLI はカバレッジ除外。
- `growth:metrics` は cron 等で定期実行(claude 不使用の純データ結線・`GROWTH_DRYRUN=1` で空実行)。

### 実予約データ(施設経営データ基盤)

実予約は **施設経営データ基盤**(設計: `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md`)から供給する。週次でラボーラ管理画面から全期間CSVをドロップディレクトリへエクスポートし、`npm run growth:ingest` が正準データセット(PII除去済みJSONL)とスナップショット(集計+気づき)を生成、LINEダイジェストを送る。`growth:metrics` は `GROWTH_RESERVATION_DATA_DIR/canonical/` を読み、従来どおり記事別の実予約状態をNotionミラーへ書く(coverage不足→`coverage_incomplete`、未設定/読取失敗→`missing` の扱いは従来と同じ)。旧CSV+sidecar形式は廃止。

### 経営ボード(P2)

`npm run growth:ingest` はローカルの正準データと日付別スナップショットを昇格し、LINE週次ダイジェスト送信後に、PIIを含まない検証済みスナップショットだけを `POST /api/growth/analytics/snapshot` へ送る。Vercel側はマシン専用の `Authorization: Bearer` を検証し、Private Vercel Blobへlatestと日付別の2ファイルを保存する。アップロードが失敗してもローカル取り込みは完了扱いで、次回実行時にlatestを上書きして回復する。

- Vercel: Private Blobストアを作成し、`BLOB_READ_WRITE_TOKEN` と32文字以上の `GROWTH_ANALYTICS_INGEST_TOKEN` を設定する。Blobのアクセス設定はPrivateにする。
- 自宅PC: 同じ `GROWTH_ANALYTICS_INGEST_TOKEN` と、`GROWTH_ANALYTICS_UPLOAD_URL=https://<本番ドメイン>/api/growth/analytics/snapshot` を設定する。片方でも未設定ならアップロードは1行ログでスキップする。
- ローカル確認: `BLOB_READ_WRITE_TOKEN` を設定せず、`GROWTH_ANALYTICS_FILE_DIR`（未設定なら `GROWTH_RESERVATION_DATA_DIR/snapshots`）を使う。スナップショットストアはこの順でBlob→明示ファイルディレクトリ→予約データ配下のsnapshotsを選ぶ。
