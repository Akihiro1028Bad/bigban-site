# Worker 可視化と reconcile

## 目的

承認画面から、自宅 PC 側の worker が「動いているか」「今どの記事/施策を処理しているか」「どこで失敗しているか」を確認できるようにする。

## Notion: Worker 運用ログ DB

環境変数 `GROWTH_WORKER_LOG_DS` に Worker 運用ログ DB の data source ID を設定する。未設定でも処理は止まらず、承認画面の運用タブに未設定として表示される。

必要プロパティ:

| プロパティ | 型 | 用途 |
| --- | --- | --- |
| `名前` | title | ログ行の要約 |
| `種別` | select | `job` / `heartbeat` / `warning` / `error` / `info` |
| `ステータス` | select | `running` / `success` / `failed` / `skipped` / `heartbeat` / `reconcile` |
| `モード` | rich text | `revise` / `advise` / `decorate` など |
| `Worker` | rich text | worker 識別子 |
| `開始時刻` | date | run 開始 |
| `終了時刻` | date | run 終了 |
| `記録時刻` | date | ログ記録時刻 |
| `終了コード` | number | process exit code |
| `再開コマンド` | rich text | 失敗時の再実行コマンド |
| `対象ページID` | rich text | 対象 Notion page ID |
| `対象タイトル` | rich text | 対象記事/施策タイトル |
| `対象種別` | select | `article` / `proposal` / `system` |
| `処理名` | rich text | 表示用の処理名 |
| `経過秒` | number | 将来拡張用 |
| `詳細` | rich text | 失敗理由・reconcile 詳細 |
| `証跡キー` | rich text | 将来の詳細証跡への参照 |

## 状態遷移

### Worker

| 状態 | 意味 | 表示 |
| --- | --- | --- |
| `healthy` | 最新 heartbeat が 15 分以内 | 運用タブ |
| `stale` | 最新 heartbeat が 15 分を超過 | 運用タブ + 左ナビバッジ |
| `unknown` | heartbeat なし / DB 未設定 | 運用タブ |

### Job

| 状態 | 意味 |
| --- | --- |
| `running` | `run.mjs` が headless agent を起動中 |
| `success` | exit code 0 |
| `failed` | exit code 非 0 / spawn error |
| `skipped` | lock / daily cap などで実行せず終了 |

### AI 依頼 activity

記事 DB の既存プロパティから `activities` を導出する。`AIへの指示` タブを開かなくても、記事一覧と記事詳細で進捗・提示結果・失敗を確認できる。

| activity | 元プロパティ |
| --- | --- |
| 構成案修正 / タイトル修正 | `修正ステータス` / `修正案` / `修正タイトル案` |
| スタイリング助言 | `アドバイスステータス` / `アドバイス結果` |
| 装飾提案 | `装飾ステータス` / `装飾提案` |
| アイキャッチ再生成 | `アイキャッチ再生成ステータス` |
| 本文画像再生成 | `本文画像再生成ステータス` |

## コマンド

```bash
npm run growth:daemon
npm run growth:reconcile
```

`growth:daemon` は heartbeat と各 `run.mjs` の開始/終了を Worker 運用ログ DB に記録する。`growth:reconcile` は自動修復せず、不整合を検出して JSON と Worker 運用ログ DB に記録する。

## reconcile が見るもの

- AI 依頼中/処理中なのに直近 worker 実行履歴がない
- 結果があるのに `提示中` / `失敗` として表示されていない
- 公開予約時刻を過ぎているが公開済みではない
- 下書き ID があるのに本文 HTML ミラーが空
- 成果物化済み施策に成果物リンクがない

## 注意

`run.mjs` 単体では、多くのモードで処理対象記事を実行前に特定できない。そのため v1 の run 履歴は `system` 対象として記録し、記事単位の進捗は Notion 記事行の activity から表示する。より詳細な証跡が必要な場合は、各 `next` CLI の JSON 出力を worker log に橋渡しする。

## Notion 行の蓄積（storage）

- **heartbeat は worker 毎に1行を upsert**（既存行を `updatePageProps` で更新）する。毎サイクル追記しないので heartbeat で行が無制限に増えることはない（daemon が高頻度でも heartbeat 行は worker 数分だけ）。
- **job イベント**（`start`/`finish` の `running`/`success`/`failed`/`skipped`）と **reconcile** は意味のある証跡として**追記**する。実作業と 1 日上限に比例した件数で、`run.mjs` は「依頼なし」時は書き込まない。
- 現状**自動の retention（古い行の削除）は無い**。長期運用で job/reconcile 行が増えたら、`記録時刻` が古い行を定期削除する掃除を追加する余地がある（未実装）。
- Notion 制限の目安: API はレート 3req/秒・1,000req/5分、読み取りは 100 行/ページ。DB 行数のハード上限は非公表だが、大規模化すると動作が重くなるため上記の upsert / 追記方針で行数を抑えている。
