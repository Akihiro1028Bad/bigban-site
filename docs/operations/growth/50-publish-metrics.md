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

### CTAイベント別・実予約CSV（#280）

- GA4は `topPages(pagePath)` と `topPageCtaEvents(pagePath,eventName)` を別取得する。CTAレポートは正典 `ctaEvents.ts` のイベント名だけをfilterする。
- `growth:metrics` は `GROWTH_RESERVATION_CSV_PATH` の正規化CSVと収録範囲sidecar（既定 `<CSVパス>.coverage.json`、任意 `GROWTH_RESERVATION_COVERAGE_PATH`）を1回読み、mtimeを `syncedAt` として全記事の同一snapshotへ保存する。sidecarは `{"coverageStart":"YYYY-MM-DD","coverageEnd":"YYYY-MM-DD"}`。
- current/priorを別々に収録判定し、片方でも範囲外なら `coverage_incomplete` として実予約を未取得にする。両期間が完全収録された空CSVだけを実測0件として扱う。
- CSV/sidecarが未設定・読取失敗・不正でもGA4/GSC更新は継続し、実予約だけ `missing` にする。逆にGoogle認証・GA4取得・topPages一致が失敗しても、既知記事へ実予約状態を書き込む。7日超・未来・不正mtimeは古い表示となる。
- PerformanceBoardは予約意図、SNS、その他CTA、施設全体実予約、記事帰属実予約を混同せず表示する。
- CTA計測状態は `GROWTH_GA4_KEYEVENTS_SINCE` とレポート期間で判定する。期間全体が設定日以降なら `measured`、期間内に設定日があれば `partial`、期間前・不正・GA4失敗は `unmeasured`。記事公開日は使わない。
