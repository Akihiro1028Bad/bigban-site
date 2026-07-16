# セルフチューニングループ(自己改善) - SI1 学習ログ収集基盤

> 設計書: `docs/superpowers/specs/2026-07-05-growth-self-tuning-loop-design.md`
> 実装計画: `docs/superpowers/plans/2026-07-05-growth-self-tuning-SI1.md`
> 前提: Notion「学習ログ」DB(→ [40-notion-props.md](40-notion-props.md))を作成し `GROWTH_LEARNING_LOG_DS` を設定。未設定なら全経路が静かにスキップ。

## 何を拾うか(1 行 = 1 イベント・追記専用・ベストエフォート)

| 種別 | 発火点 | 記録内容 |
|---|---|---|
| `編集` | `POST /api/growth/draft/edit` 保存成功(after) | 手動リッチ編集の前後差分要約(無変更は記録しない)。 |
| `採否` | 同上(client が `source=advise-apply`/`comment-revise` を付与) | 採用した fix の観点(fix ごとに 1 行)。 |
| `不採用` | `POST /api/growth/learning-log/reject` | 承認画面で反映しなかった案を fix ごとに 1 行記録する。 |
| `画像試行` | `growth:body-image-regen`/`growth:eyecatch-regen` の done/fail | style・成否・直近 4 週累積回数。 |
| `工程失敗` | `run.mjs` の notifyLoopFail / pull 失敗 / weekly 異常終了 | mode・exit code・detail 末尾。`growth:learning-log -- append-fail` 経由。 |

> Notion「学習ログ」DB の `種別` select に `不採用` オプションを手動追加する必要がある。

## 純ロジックと CLI

- 純ロジック(型・差分要約 `summarizeEditDiff`・プロパティ組み立て・集計 `summarizeLearningLog`・書き込みラッパ `appendLearningLog`): `scripts/growth/learningLog.ts`(+ `src/lib/growth/learningLog.ts` 再エクスポート・100% カバレッジ)。
- CLI: `npm run growth:learning-log -- <append|append-fail|recent>`(薄い配線・カバレッジ除外)。`growth:learning-log:recent`(= recent 4)は SI2 の weekly が読む固定スクリプト。

## 安全原則

- **本処理を止めない**: 追記はレスポンス後(API は `after()`)/ CLI 末尾で best-effort。失敗しても保存・生成・ループの成否は不変。
- **沈黙させない**: DS 設定済みで書き込み失敗した時だけ、PC 側 CLI が `notify-throttle` 経由で LINE 通知(30 分ウィンドウ)。API route はサーバログに出す(Vercel から LINE を叩かない)。
- **DS 未設定は静かにスキップ**(基盤未導入でも運用を壊さない)。
- **追記専用**: 既存行の更新・削除経路は作らない。要約は 2000 字上限(生全文は載せない)。

# 部分成功の学習

`工程部分成功` は失敗頻度へ加算せず、`partialModeFrequency` で独立集計する。要約には失敗 stage、安全化済み detail、再開コマンドを残す。学習ログ自体の追記失敗は元の operation outcome を変更しない。
