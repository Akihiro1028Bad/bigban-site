# グロースループ 正典(canon)

> CLAUDE.md「グロースループ記事生成」節の詳細をモード別に分割した索引のトップ。
> ここは**常時意識すべき不変ルール**だけを置く。各モードの細部は同ディレクトリの個別ファイルへ。

## 正典の優先順位(矛盾したら上が勝つ)

1. **`scripts/growth/facility-context.json`** — 施設の現況(開業前/開業済み・基準日)・確定事実・**書いてはいけない未確定項目**の唯一の単一ソース。`npm run growth:facility-context` で出力し、下書きモード冒頭で正典として注入(style-guide §13)。
2. **`docs/operations/growth-article-style.md`** — 文体・構成・地理スコープ・NG表現の正典。
3. **`docs/operations/growth-weekly-runbook.md`** — 運用手順の正典(各モードの詳細手順)。

## 絶対禁止(全モード共通・無人実行でも厳守)

- **本番公開しない**(下書きのまま。microCMS MCP は headless 非接続=スクリプト経由のみ)。
- **git push / git commit しない**(`run.mjs` の `DISALLOW` で `Bash(git push:*)`/`Bash(git commit:*)` を明示拒否)。
- **未確定情報を断定しない**(facility-context の `doNotWrite`(料金・正確な所要分・未確定の日時。列挙はファイルを正典とし、ここに再掲しない)。必要時は「最新情報をご確認ください」と促す)。なお営業時間 6:00-23:00・コート3面・デコターフは公表済みの確定事実(#217)で、断定してよい。
- **失敗を沈黙させない**(途中失敗は工程名・再開コマンドを出力し、`data/growth-failures.log` に追記する。LINE は週次完了と週次モード自身の失敗だけに絞り、週次本文で直近7日の失敗件数をサマリする。冪等に再開できる設計を崩さない)。

## 実行(headless / `claude -p`)

- ランチャー: `scripts/growth/run.mjs`(Windows/macOS 両対応)。プロンプトは stdin で渡す。
- 動作確認(claude 非起動): `GROWTH_DRYRUN=1`。
- 下書き系の勝負所モデルは既定 `claude-opus-4-8`(`GROWTH_DRAFTS_MODEL` で上書き可)。weekly(ネタ出し)も同様に既定 `claude-opus-4-8`(`GROWTH_WEEKLY_MODEL` で上書き可)。

## 実行モード一覧と参照先

| モード | コマンド | 何をするか | 詳細 |
|---|---|---|---|
| weekly | `growth:weekly` | 週次分析→Notionレポート+施策提案 | runbook「週次モード」 |
| drafts | `growth:drafts` | 承認記事→microCMS下書き+画像 | [20-draft.md](20-draft.md) |
| initiatives | `growth:initiatives` | 承認施策→Notion本文に文案/仕様書 | runbook「施策実行モード」 |
| revise | `growth:revise-loop` | 構成案/タイトルの修正ループ(#40/#139B) | [30-loops.md](30-loops.md) |
| regen | `growth:regen-loop` | アイキャッチ AI 再生成(#144) | [30-loops.md](30-loops.md) |
| regen-body | `growth:regen-body-loop` | 本文画像 AI 再生成(#156) | [30-loops.md](30-loops.md) |
| advise | `growth:advise-loop` | スタイリング・アドバイザー(#146・read-only) | [30-loops.md](30-loops.md) |
| decorate | `growth:decorate-loop` | 装飾アシスタント(#147) | [30-loops.md](30-loops.md) |
| apply | (advise-apply #165) | アドバイス採用→本文反映 | [30-loops.md](30-loops.md) |
| comment-revise | (#182) | 本文インラインコメント→AI修正 | [30-loops.md](30-loops.md) |
| (純データ) | `growth:metrics` | GA4成績→Notion(計測ループ #C4) | [50-publish-metrics.md](50-publish-metrics.md) |
| (純データ) | `growth:publish-due` | 予約公開の到来分を公開(#H24) | [50-publish-metrics.md](50-publish-metrics.md) |

## 人間向けガイド(初期構築・日常運用)

- **初期構築**: [01-setup-guide.md](01-setup-guide.md) — 新環境を一から立ち上げ、週次モードの空実行が通るまで(自宅PCのタスク登録・環境変数・LINE 承認を全統合)。
- **日常運用**: [10-operator-guide.md](10-operator-guide.md) — 週次サイクル(承認→下書き→公開→レビュー)を通しで回す運用者向けの1本。

## 設計の共通原則(全ループ)

- **pull型**: 承認画面(Vercel)は Notion に「依頼」を書くだけ。重い処理(claude/画像生成/microCMS書込)は常時稼働PCのループが拾う。
- **承認画面は基本 Notion を読むだけ**(GA4/microCMS の強権操作は PC 側ループに集約)。
- **純ロジックを分離**: DOM/IO 非依存の純関数(`scripts/growth/*.ts`)＋`src/lib/growth/*` 再エクスポート。CLI/`run.mjs`/`gen-*` はカバレッジ除外。
- **欠落耐性**: Notion プロパティが未追加でも沈黙落ちせず動く/その旨を報告する。必要プロパティ一覧は [40-notion-props.md](40-notion-props.md)。
- **段階ガード(#H9)**: 生成中/公開済みは予約・各操作を弾く。

## セキュリティ(強権限 API)

- **`MICROCMS_MANAGEMENT_API_KEY` は server-only**(`NEXT_PUBLIC_` 禁止・クライアントへ渡さない)。
- ⚠️ **本番公開前に `APPROVE_AUTH_ENABLED` を必ず ON にする**(承認画面が強権限 API を叩くため。gate は実装済み・開発段階はオフ)。
- 横断的なセキュリティハードニング(safeEqual・featureFlags分離・依存CVE 等)は #7 に集約。
