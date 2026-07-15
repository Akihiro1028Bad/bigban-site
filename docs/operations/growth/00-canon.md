# グロースループ 正典(canon)

> CLAUDE.md「グロースループ記事生成」節の詳細をモード別に分割した索引のトップ。
> ここは**常時意識すべき不変ルール**だけを置く。各モードの細部は同ディレクトリの個別ファイルへ。

## 正典の優先順位(矛盾したら上が勝つ)

1. **`scripts/growth/facility-context.json`** — 施設の現況(開業前/開業済み・基準日)・確定事実・**書いてはいけない未確定項目**の唯一の単一ソース。`npm run growth:facility-context` で出力し、下書きモード冒頭で正典として注入(style-guide §13)。
2. **`docs/operations/growth-article-style.md`** — 文体・構成・地理スコープ・NG表現の正典。
3. **`docs/operations/growth-weekly-runbook.md`** — 運用手順の正典(各モードの詳細手順)。

## 公開権限の境界

- **AI生成**: 提案・構成・本文・画像の生成工程。AIの自律判断だけでは本番公開しない。記事案の承認は公開権限ではない。承認は下書き生成の許可であり、承認直後には公開されないため、公開には別途公開操作が必要。
- **即時公開**: 人間が再認証後に公開キューで「今すぐ公開」を選び、その場で公開権限を付与する。`/api/growth/publish` が入力と段階ガードを再検証して決定的に公開する。
- **予約公開**: 人間が再認証後に日時を指定した時点で、対象記事へ将来の公開権限を付与する。非AIの決定的workerである `npm run growth:publish-due` は実行開始時に到来予約のスナップショットを取得し、その対象を公開直前ゲートで検証して公開する。予約解除はworkerが対象を取得する前まで有効。worker実行中の解除は間に合わない場合があるため、直前取消を保証しない(公開直前の予約状態再取得は別issue候補)。

AIの生成工程と、人間が付与する公開権限を混同しない。workerが予約済み記事を公開するのはAIの自律判断ではなく、先行する人間の明示操作を決定的に執行する処理である。

## 絶対禁止(全モード共通・無人実行でも厳守)

- **AIの自律判断だけで本番公開しない**(AI生成は下書きまで。公開は上記の即時公開または予約公開だけ)。
- **git push / git commit しない**(`run.mjs` の `DISALLOW` で `Bash(git push:*)`/`Bash(git commit:*)` を明示拒否)。
- **未確定情報を断定しない**(facility-context の `doNotWrite`(料金・正確な所要分・未確定の日時。列挙はファイルを正典とし、ここに再掲しない)。必要時は「最新情報をご確認ください」と促す)。なお営業時間 6:00-23:00・コート3面・デコターフは公表済みの確定事実(#217)で、断定してよい。
- **失敗を沈黙させない**(途中失敗は工程名・再開コマンドを出力し、`data/growth-failures.log` に追記する。LINE の通常通知は週次完了と週次モード自身の失敗に絞る。例外として `publish-due` の成功通知・失敗通知と、#283 の timeout critical通知は送信する。週次本文では直近7日の失敗件数をサマリし、冪等に再開できる設計を崩さない)。
- **秘密を通知へ載せない**（承認合言葉はVercelだけに置き、LINE・URL・Bearer・通常APIへ渡さない。運用は[security.md](security.md)）。

## 実行(headless agent)

- ランチャー: `scripts/growth/run.mjs`(Windows/macOS 両対応)。プロンプトは stdin で渡す。
- 既定は承認画面 `AIモデル` の工程別設定。Notion「AIモデル設定」DBを自宅PC workerが起動前に読み、Claude Code CLI / Codex CLIを工程ごとに選ぶ。Notionが読めない場合はコード内推奨値へフォールバックする。
- 動作確認(agent 非起動): `GROWTH_DRYRUN=1`。
- プロバイダー・モデル・推論強度は承認画面の工程別設定だけで選ぶ。Notionを読めない場合はコード内推奨値へフォールバックする。
- Codex 側の実行制御は `GROWTH_CODEX_APPROVAL`(既定 `never`) / `GROWTH_CODEX_SANDBOX`(既定 `danger-full-access`) で調整する。Claude専用のallowedToolsや`mcp__claude_ai_Notion`は渡さない。

## 実行モード一覧と参照先

| モード | コマンド | 何をするか | 詳細 |
|---|---|---|---|
| weekly | `growth:weekly` | 週次分析→Notionレポート+施策提案 | runbook「週次モード」 |
| drafts | `growth:drafts` | 承認記事→microCMS下書き+画像 | [20-draft.md](20-draft.md) |
| drafts-auto | `growth:drafts-auto` | opt-in: 承認済み/生成中かつ下書きID未作成がある時だけ下書き生成 | [20-draft.md](20-draft.md) |

長時間ジョブは有限 timeout と JSON lease（既定 heartbeat 60秒・expiry 15分）で管理する。PID死亡は即時回収し、同一PCでPIDが生存中でも heartbeat expiry 後は回収する。leaseを失った旧ジョブはSIGTERM→SIGKILLのfenceで停止する。手動 `drafts` と `drafts-auto` は同じ `revise.lock` を共有する。
| initiatives | `growth:initiatives` | 承認施策→Notion本文に文案/仕様書 | runbook「施策実行モード」 |
| initiatives-auto | `growth:initiatives-auto` | opt-in: 承認済み施策がある時だけ施策実行 | runbook「施策実行モード」 |
| revise | `growth:revise-loop` | 構成案/タイトルの修正ループ(#40/#139B) | [30-loops.md](30-loops.md) |
| image-prompt | `growth:image-prompt -- <spec.json>` | 初回下書きの画像プロンプト設計（本文は変更しない） | [20-draft.md](20-draft.md) |
| regen | `growth:regen-loop` | アイキャッチ AI 再生成(#144) | [30-loops.md](30-loops.md) |
| regen-body | `growth:regen-body-loop` | 本文画像 AI 再生成(#156) | [30-loops.md](30-loops.md) |
| advise | `growth:advise-loop` | スタイリング・アドバイザー(#146・read-only) | [30-loops.md](30-loops.md) |
| decorate | `growth:decorate-loop` | 装飾アシスタント(#147) | [30-loops.md](30-loops.md) |
| apply | (advise-apply #165) | アドバイス採用→本文反映 | [30-loops.md](30-loops.md) |
| comment-revise | (#182) | 本文インラインコメント→AI修正 | [30-loops.md](30-loops.md) |
| (純データ) | `growth:metrics` | GA4成績→Notion(計測ループ #C4) | [50-publish-metrics.md](50-publish-metrics.md) |
| (非AI・決定的worker) | `growth:publish-due` | 実行開始時の到来分を公開直前ゲートで検証して公開(#H24) | [50-publish-metrics.md](50-publish-metrics.md) |

## 人間向けガイド(初期構築・日常運用)

- **初期構築**: [01-setup-guide.md](01-setup-guide.md) — 新環境を一から立ち上げ、週次モードの空実行が通るまで(自宅PCのタスク登録・環境変数・LINE 承認を全統合)。
- **日常運用**: [10-operator-guide.md](10-operator-guide.md) — 週次サイクル(承認→下書き→公開→レビュー)を通しで回す運用者向けの1本。

## 設計の共通原則(全ループ)

- **pull型**: 承認画面(Vercel)からのAI処理依頼は Notion に書き、重い処理(headless agent/画像生成/microCMS書込)は常時稼働PCのループが拾う。即時公開は再認証後に公開APIへ、人間が許可した予約公開は非AI workerへ渡す。
- **読み取りと強権操作を分離**: 一覧・計測表示は Notion のミラーを読む。microCMS の強権操作は再認証した人間の明示操作または、その人間が事前許可した予約を処理するPC側workerに限定する。
- **純ロジックを分離**: DOM/IO 非依存の純関数(`scripts/growth/*.ts`)＋`src/lib/growth/*` 再エクスポート。CLI/`run.mjs`/`gen-*` はカバレッジ除外。
- **欠落耐性**: Notion プロパティが未追加でも沈黙落ちせず動く/その旨を報告する。必要プロパティ一覧は [40-notion-props.md](40-notion-props.md)。
- **段階ガード(#H9)**: 生成中/公開済みは予約・各操作を弾く。

## セキュリティ(強権限 API)

- **`MICROCMS_API_KEY` は server-only**(`NEXT_PUBLIC_` 禁止・クライアントへ渡さない)。
- ⚠️ **本番公開前に `APPROVE_AUTH_ENABLED` を必ず ON にする**(承認画面が強権限 API を叩くため。gate は実装済み・開発段階はオフ)。
- 横断的なセキュリティハードニング(safeEqual・featureFlags分離・依存CVE 等)は #7 に集約。
