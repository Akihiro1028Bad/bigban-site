# グロースループ セルフチューニングループ(自己改善機能)設計 — SI1 / SI2

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

**日付**: 2026-07-05 / **ステータス**: ドラフト / **対象**: グロースループ記事生成システムの自己改善機能
**関連文書**: `docs/operations/growth/00-canon.md`・`30-loops.md`・`40-notion-props.md`・`50-publish-metrics.md`・`docs/operations/growth-weekly-runbook.md`・`docs/operations/growth-article-style.md`
**前提コード**: `scripts/growth/notion.ts`(`createPage`/`chunkRichText`/`updatePageProps`/`updatePageSelect`)・`scripts/growth/advise-cli.ts`(pull 型 CLI の型)・`scripts/growth/loopFailure.ts`(失敗通知本文)・`scripts/growth/run.mjs`(モード定義・DISALLOW)・`src/app/api/growth/draft/edit/route.ts`(手動リッチ編集の保存 API)・`scripts/growth/metrics.ts`(成績データミラー)

> **確定済み設計判断(ユーザー承認済み・本 spec では変更しない)**: 機能名「セルフチューニングループ」。目的は、システムが**自分自身の成果データ・失敗ログ・「人間が AI 出力をどう直したか」**を材料に改善施策を **提案として** 出すこと(自動適用しない・pull 型・present 方式の既存思想の踏襲)。対象 4 領域(記事の質 / 運用の効率 / ツール機能そのもの / グロース施策全般)。二段構え(SI1: 学習ログ収集基盤 → SI2: weekly 統合)。安全原則(適用は人間のみ / `run.mjs` の commit・push DISALLOW 継続 / `facility-context.json` を変更する提案は禁止 / 学習ログ書き込みはベストエフォート・失敗は沈黙させず LINE 通知)。

---

## 1. 背景・目的

### 1.1 いま「捨てられている」もの

グロースループは記事の生成・修正・画像・公開・計測まで一通り自動化されているが、**運用の過程で生まれる一次データが記録されず流れ去っている**。具体的には次の 4 つが「その場限り」で消えている。

1. **人間が AI 出力をどう直したか**(最重要の教師信号): 手動リッチ編集(`/api/growth/draft/edit`)は保存前の本文(`draftBodyOf(page)` 由来)と保存後の本文を両方手元に持っているのに、**前後差分をどこにも残していない**。「AI はここを毎回冗長に書く」「見出しをいつも人が短くする」という最も価値のある改善材料が保存直後に捨てられる。
2. **AI 提案の採否**: advise(#146)・comment-revise(#182)の採用/却下は `.growth-tmp/*.json` の一時ファイルに乗るだけで、確定した「どの助言が採られ、どの助言が無視されたか」の台帳がない。「AI が繰り返す無駄な助言」を特定できない。
3. **画像再生成のリトライ累積**: アイキャッチ(#144)/本文画像(#156)の再生成は `再生成ステータス` の現在値しか持たず、**「この記事は 5 回作り直した」という試行の履歴**が残らない。特定スタイル(`court`/`flow`/`infographic` の文字焼き込み)の失敗率が見えない。
4. **工程失敗の傾向**: `run.mjs` の失敗は LINE 通知(`loopFailure.ts`)で人に届くが**流れて消える**。「revise が今週 3 回落ちた」「pull が非 ff で毎朝止まる」という頻度・傾向が集計できない。

### 1.2 何を拾うのか

セルフチューニングループは上の 4 つを **1 行 1 イベントの追記専用台帳(Notion「学習ログ」DB)** に落とし(SI1)、週次の weekly モードがその台帳と既存信号(成績データ・公開後判定・却下理由)を読んで、**既存「施策提案」DB に新カテゴリ「システム改善」で改善施策を登録する**(SI2)。施策には既存の `仮説`/`成功指標`/`検証予定日`/`検証結果`/`検証済み` の検証追跡と学習ループ(却下理由を読んで繰り返さない)が**そのまま効く**。

### 1.3 対象 4 領域と出力の粒度

| 領域 | 材料 | 提案の粒度 |
|---|---|---|
| ① 記事の質 | 手動編集の前後差分・advise/comment-revise の採否 | **具体 diff 案**(対象ファイル `scripts/growth/prompts/*.md`・`docs/operations/growth-article-style.md` ＋変更前後テキスト)まで |
| ② 運用の効率 | 工程失敗イベント・画像再生成リトライ | 設定値なら **diff 案**、手順なら**施策文** |
| ③ ツール機能そのもの | 編集差分・採否ログの傾向 | **機能開発の要件案**まで(実装は通常の spec→計画→実装フローへ渡す) |
| ④ グロース施策全般 | 既存 weekly の担当(成績・GA4/GSC・市場) | **新設しない**。学習ログという材料が増える分の**強化のみ** |

### 1.4 設計の据え方(既存思想の完全踏襲)

- **pull 型**: 書き込み側(API route・PC ループ)は Notion に 1 行足すだけ。集計・提案は weekly が拾う。
- **present 方式**: 改善は必ず「施策提案」として提示され、**適用は人間のみ**。自動適用は一切しない。
- **純ロジック分離**: 集計・差分要約・スキーマは `scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポート・100% カバレッジ＋TDD。CLI/`run.mjs`/`gen-*` はカバレッジ除外。
- **欠落耐性**: 学習ログ DB 未追加でも本処理(編集保存・ループ)は止まらない。書き込み失敗は握り潰さず LINE 通知。

---

## 2. 全体アーキテクチャ(SI1 / SI2)

### 2.1 関係図

```
┌─────────────────────── SI1: 学習ログ収集基盤(追記専用・1行=1イベント) ───────────────────────┐
│                                                                                             │
│  (a) 手動リッチ編集     (b) advise/comment-revise 採否   (c) 画像再生成試行   (d) 工程失敗       │
│  /api/growth/draft/edit   /api/growth/advise/apply 等      body-image-regen 等    run.mjs        │
│      │  保存前後を比較         │  採用fixを記録               │  依頼→成否を記録    │  失敗と同時   │
│      └──────────┬───────────┴────────────┬──────────────┴─────────┬───────┘              │
│                 ▼(ベストエフォート・失敗は LINE 通知)                 ▼                          │
│         appendLearningLog(event) ── Notion「学習ログ」DB に createPage で 1 行追記               │
│                                    (data source: 新設・§3.1)                                  │
└──────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                │  (読むだけ・週1回)
                                                ▼
┌─────────────────────── SI2: weekly 統合(週次「システム振り返り」) ───────────────────────────┐
│                                                                                             │
│  weekly.md に工程追加 →  学習ログ DB 直近分 + 既存信号(成績/公開後判定/却下理由)を読む          │
│      │                                                                                       │
│      ▼  傾向を分析(4領域)→ 改善施策を作る                                                     │
│  既存「施策提案」DB へ createPage(カテゴリ=「システム改善」・ページ本文に diff 案)               │
│      │                                                                                       │
│      ▼  既存の検証追跡がそのまま効く                                                            │
│  仮説 / 成功指標 / 検証予定日 → growth:proposal-review-due が到来判定 → 検証結果 → 学習ループ     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 データフロー(時系列)

1. **平常運用中(随時)**: 記事編集・AI 助言採用・画像再生成・工程失敗のたびに、各書き込み箇所が `appendLearningLog(event)` をベストエフォートで呼ぶ(API route はレスポンス後実行の `after()`、CLI/`run.mjs` は同期呼び出し)。本処理の成否には影響させない(§3.5)。
2. **週次(weekly 実行時)**: weekly モードが `growth:learning-log` CLI の `recent` で直近 N 週分の学習ログを JSON で受け取り、既存の `growth:existing`(成績・却下・検証結果)と併せて分析する。
3. **提案**: weekly が「システム改善」カテゴリの施策を「施策提案」DB に作る。①記事の質・②運用効率・③ツール機能に該当するものは、**diff 案または要件案をページ本文に**書く(§4.4)。
4. **検証・学習**: 既存 `growth:proposal-review-due` が検証予定日で到来判定し、人が `検証結果` を書く。次週以降の weekly は却下・検証結果を読んで同じ提案を繰り返さない(既存学習ループ)。

### 2.3 新設・変更する構成要素の一覧

| 種別 | 追加/変更 | 目的 |
|---|---|---|
| Notion DB | **新設**「学習ログ」DB(§3.1) | イベント台帳 |
| 純ロジック | `scripts/growth/learningLog.ts`＋`src/lib/growth/learningLog.ts` 再エクスポート(§3.2/§3.4) | イベント型・プロパティ組み立て・差分要約・集計 |
| CLI | `scripts/growth/learning-log-cli.ts`(`append`/`recent`・§3.6) | ループ/weekly からの Notion 読み書き(薄い配線・カバレッジ除外) |
| API 変更 | `src/app/api/growth/draft/edit/route.ts`(§3.3.a) | 保存前後差分の記録 |
| API 変更 | advise-apply / comment-revise の反映 API(§3.3.b) | 採用 fix の記録 |
| ループ変更 | `body-image-regen`/`eyecatch-regen` CLI(§3.3.c) | 再生成試行の記録 |
| ループ変更 | `run.mjs` の `notifyLoopFail` / pull 失敗(§3.3.d) | 工程失敗の記録 |
| プロンプト | `scripts/growth/prompts/weekly.md`(§4.2) | 「システム振り返り」工程 |
| Notion select | 「施策提案」DB `カテゴリ` に「システム改善」追加(§4.3) | 提案の分類 |
| 純ロジック | `scripts/growth/systemProposal.ts`＋再エクスポート(§4.4) | 提案ページ本文(diff ブロック)の組み立て(構造の正典) |
| 環境変数 | `.env.example` に学習ログ DB の data source ID(§6.4) | CLI/API が参照 |
| ドキュメント | 40-notion-props.md・30-loops.md(新節)・weekly-runbook・CLAUDE.md 索引(§8) | 運用手順 |

---

## 3. SI1 詳細: 学習ログ収集基盤

### 3.1 Notion「学習ログ」DB のプロパティ定義

**性格**: **追記専用の台帳**。1 行 = 1 イベント。既存行を更新・削除しない(集計は weekly が読むだけ)。data source ID は環境変数 `GROWTH_LEARNING_LOG_DS`(§6.4)で外から与える(既存 3 DB の ID がコード内固定なのに対し、新設 DB は環境変数にして、DB 作成後にオーナーが差し込む運用にする)。

命名は既存 DB の日本語プロパティ慣習(`ステータス`/`成績データ`/`検証予定日` 等)に合わせる。

| プロパティ | 型 | 必須 | 用途・値 |
|---|---|---|---|
| `イベント` | title | ○ | 1 行の見出し。`buildLearningLogTitle`(§3.4.1)が生成。例「編集: 導入を短縮(本八幡ではじめる…)」「失敗: revise 異常終了」。人が一覧で流し読みできる要約。 |
| `種別` | select | ○ | イベント分類。値は 4 種固定: `編集`(手動リッチ編集の前後差分)/ `採否`(advise・comment-revise の採用)/ `画像試行`(画像再生成の依頼→成否)/ `工程失敗`(run.mjs の失敗)。**この 4 値の事前追加が前提**。未知値は weekly 集計で「その他」に寄せる(黙って落とさない)。 |
| `記録時刻` | date | ○ | イベント発生時刻(ISO8601)。weekly の「直近 N 週」抽出の軸(§4.5)。 |
| `記事タイトル` | rich_text | | 対象記事のタイトル案(`ideaTitleOf` 由来)。工程失敗など記事に紐づかないイベントは空。 |
| `ページID` | rich_text | | 対象「記事ネタ案」ページ ID(記事に紐づくイベントのみ)。人が元記事を辿るための参照。集計キーには使わない(台帳の突き合わせ用)。 |
| `対象` | rich_text | | イベントのサブ分類。`編集`=編集領域(例 `導入`/`見出し`/`本文`)/ `採否`=助言の観点(例 `冗長`/`敬体乱れ`)/ `画像試行`=スタイル(`mascot`/`court` 等)/ `工程失敗`=モード名(`revise`/`weekly`/`pull` 等)。weekly が傾向を刻む軸。空でも可(欠落耐性)。 |
| `結果` | select | | `画像試行`と`工程失敗`の成否。値: `成功`/`失敗`/`リトライ`(画像で N 回目の再依頼)。`編集`/`採否` では空。**この 3 値の事前追加が前提**(画像・失敗イベントを記録する場合)。 |
| `要約` | rich_text | | イベントの中身の要約(2000 字上限・§3.4.2 の差分要約アルゴリズムで作る)。`編集`=前後差分の要約/ `採否`=採用した fix の before→after 要約/ `画像試行`=依頼指示＋成否メモ/ `工程失敗`=exit code＋detail 末尾。生の全文は載せない(台帳肥大防止)。 |
| `回数` | number | | `画像試行`の試行回数(同一記事×同一スタイルで直近 4 週内の N 回目・§3.3.c)。それ以外は空。リトライ多発の可視化に使う。 |

**設計上の注意**:

- `要約` は Notion rich_text の 1 オブジェクト 2000 字制限を守るため、**必ず `chunkRichText`(既存)で分割**して書く。差分が長い場合は要約側で 2000 字以内に落とす(§3.4.2)。台帳は「傾向を見る」ものなので全文保存は不要。
- 台帳が肥大しても weekly は `記録時刻` フィルタ + `pageSize` で直近分だけ引く(§4.5)。全行スキャンはしない。
- **既存 3 DB は変更しない**。学習ログは独立 DB。記事ネタ案・施策提案・週次レポートのスキーマには一切追加しない。

### 3.2 純ロジック `learningLog.ts` の責務

`scripts/growth/learningLog.ts`(＋ `src/lib/growth/learningLog.ts` で `export * from "../../../scripts/growth/learningLog"`)に以下を置く。Notion 依存(HTTP・API キー)は持たず、**入力 → プロパティ値/要約文字列/集計結果の純変換**だけを担う(既存 `advise.ts`/`metrics.ts` と同型)。

- `LearningEventKind = "編集" | "採否" | "画像試行" | "工程失敗"`(型)。
- `LearningEvent`(discriminated union・§3.4)。各イベントの入力データ。
- `buildLearningLogTitle(event): string`(§3.4.1)。
- `summarizeEditDiff(before: string, after: string): EditDiffSummary`(§3.4.2)。
- `buildLearningLogProps(event): Record<string, unknown>`。イベントを Notion createPage 用プロパティに変換(`title`/`select`/`date`/`rich_text`/`number`)。rich_text は `chunkRichText` を通す。
- `parseLearningLogPage(page): LearningLogRow`。読み出し用(weekly 集計の入力)。欠落プロパティは空/既定へ(安全側)。
- `summarizeLearningLog(rows, now, windowWeeks): LearningLogSummary`(§4.5)。直近ウィンドウの集計(種別別件数・対象別ヒートマップ・画像リトライ上位・失敗モード頻度)。

### 3.3 各書き込み箇所の変更点

すべての書き込みは **`appendLearningLog` を呼ぶベストエフォート**(§3.5)。本処理(保存・反映・生成)の戻り値・ステータスには一切影響させない。

#### (a) 手動リッチ編集の前後差分 — `src/app/api/growth/draft/edit/route.ts`

現状、`route.ts` は保存前に `previousBody = draftBodyOf(page)` を取得済み(L100)で、保存後の本文 `sanitized` も手元にある(L116)。**この 2 つが揃っているのに差分を記録していない**。

- **変更**: microCMS 同期成功(L148 の直後・`return NextResponse.json({ success: true })` の前)に、`previousBody` と `sanitized` から編集イベントを作って追記する。
  - 記録タイミング: **保存が完全成功したときのみ**(microCMS 同期まで通った後)。ロールバックした失敗保存は記録しない(実際に人が確定した編集だけを教師信号にする)。
  - イベント: `{ kind: "編集", pageId, title, before: previousBody, after: sanitized }`。
  - `before === after`(実質無変更の保存)は**記録しない**(`summarizeEditDiff` が「無変更」を返したら append をスキップ)。
  - 追記は `next/server` の **`after()`(レスポンス後実行)** で発火する。Web リクエストのレイテンシに乗せず、かつ Vercel のサーバーレス環境でレスポンス返却後に処理が凍結されて書き込みが失われる問題を避ける(単純な非 await の fire-and-forget は Vercel では途中で殺されうるため採らない)。
- **API キー**: 学習ログ書き込みは既存の `NOTION_TOKEN`(このルートが既に持つ `notionOptions()`)で行う。追加キーは不要。

#### (b) advise / comment-revise の採否 — 反映 API

advise-apply(#165)・comment-revise(#182)は「採用された fix を本文へ反映」する経路を承認画面側(反映 API)に持つ。**採用が確定した時=本文に反映されたとき**に、採用された fix を記録する。

- **変更**: 反映 API(採用分を本文へ書き戻す POST ハンドラ)で、反映成功後に採用された各 fix について `{ kind: "採否", pageId, title, aspect, before, after }` を追記する。
  - `aspect`(`対象`): fix の観点(advise の観点別カテゴリ・comment の指摘種別。取得できなければ空)。
  - **採用したものだけ記録**。却下(dismiss)は記録しない(SI1 スコープ・「何が採られたか」を集める)。
  - 反映が複数 fix ある場合は fix ごとに 1 行(1 イベント)。
- 反映 API が現状どのファイルかは実装 plan で確定する(`src/app/api/growth/advise/apply` 系・comment-revise 反映系)。**この spec では「採用確定点で 1 fix = 1 append」を要件として固定**する。

#### (c) 画像再生成の試行 — `body-image-regen-cli.ts` / `eyecatch-regen-cli.ts`

画像再生成は依頼→PC ループ生成→`done`/`fail` で完結する。**試行の記録は CLI の `done`/`fail` 時点**(成否が確定した点)で行う。

- **変更**: `body-image-regen`(#156)と `eyecatch-regen`(#144)の CLI で、`done` 成功時に `{ kind: "画像試行", pageId, title, style, result: "成功", attempt }`、`fail` 時に `result: "失敗"` を追記する。
  - `attempt`(`回数`): 同一記事×同一スタイルの**直近 4 週ウィンドウ内**の試行回数(N 回目)。**算出は「この記事のこのスタイルで直近 4 週に何件の `画像試行` 行があるか」を append 直前に learning-log CLI が数える**(`recent` を再利用し、`pageId`＋`対象(style)` で数えて +1)。全期間の累積ではない(リトライ多発の可視化が目的で、weekly の読み取り範囲〔§4.5〕と揃える)。数えられない(DB 未追加等)ときは空にする(欠落耐性)。
  - リトライを可視化するのが目的なので、`result` に `リトライ`(2 回目以降の依頼)を使ってもよい(初回=`成功`/`失敗`、2 回目以降で再依頼が来たら 1 行 `リトライ` を足す)。**本 spec は「done/fail の成否のみ記録し、`回数` フィールドで累積を表す」方式を採る**(実装が単純で、リトライ回数は `回数` を見れば分かる)。`結果` select の `リトライ` 値は将来用に予約する。
- 記録は CLI 内で既存の Notion 書き込み(`updatePageProps` 等)の**後**・LINE 通知の前後どちらでもよいが、**失敗しても done/fail 自体は成功扱いにする**(§3.5)。

#### (d) 工程失敗 — `scripts/growth/run.mjs`

`run.mjs` は失敗時に `notifyLoopFail(kind, {exitCode, detail})` で LINE 通知する(L310)。pull 失敗は `notify-pull-fail` を呼ぶ(L272)。**LINE 通知と同時に台帳へも 1 行**足す。

- **制約**: `run.mjs` は `.ts` を import できない(既存コメント L257 参照)。したがって台帳追記も **npm script 経由**で行う。`notifyLoopFail` 内(および pull 失敗ブロック)で、`spawnSync(npm, ["run", "growth:learning-log", "--", "append-fail", mode, String(exitCode ?? ""), detail ?? ""])` を**追加で呼ぶ**。
  - LINE 通知(`notify-loop-fail`/`notify-pull-fail`)は現状どおり必ず送る。台帳追記はその後の best-effort(spawnSync が失敗しても exit コードは変えない・§3.5)。
  - イベント: `{ kind: "工程失敗", mode, exitCode, detail }`。`対象`=mode・`結果`=`失敗`・`要約`=`exit <code> / <detail 末尾>`。記事に紐づかないので `ページID`/`記事タイトル` は空。
  - `GROWTH_DRYRUN`/`GROWTH_SKIP_PULL` 時は既存挙動どおり no-op に揃える(動作確認を壊さない)。
- **weekly の失敗**: weekly は `notify-line` 側で通知する経路(L340)なので、`notifyLoopFail` の対象外(L311)。weekly 異常終了の台帳追記は `notify-line` 経路には足さず、**`run.mjs` の weekly 異常終了ブロック(L344 の `GROWTH_NOTIFY_ERROR` を組む箇所)で同じ `append-fail weekly <exit>` を spawnSync する**。実装 plan で最小差分を確定する。

### 3.4 イベント型と要約の作り方

#### 3.4.1 タイトル生成 `buildLearningLogTitle`

種別ごとに「一覧で流し読みできる」1 行を作る(全角 60 字目安で切る)。

- `編集`: `編集: <差分の一言> (<記事タイトル先頭20字>)`。差分の一言は `summarizeEditDiff` の `headline`(例「導入を短縮」「見出しを言い換え」)。
- `採否`: `採用: <観点> (<記事タイトル先頭20字>)`。
- `画像試行`: `画像<成功/失敗>: <style> ×<回数> (<記事タイトル先頭20字>)`。
- `工程失敗`: `失敗: <mode> 異常終了(exit <code>)`。

#### 3.4.2 差分要約アルゴリズム `summarizeEditDiff`(方針を確定)

前後の本文 HTML(`before`/`after`)から、**生 diff を丸ごと保存せず**、傾向が見える構造化要約を作る。**LLM を呼ばない純ロジック**(決定的・テスト可能・追記経路を軽く保つ)。

1. **正規化**: 両者を `htmlToPlainBlocks(html): string[]`(既存の `splitTopLevelBlocks`〔`decorate.ts`〕相当があれば再利用、無ければ純ロジックで新設)でトップレベルブロック配列(見出し・段落・リスト項目)に落とし、タグを除いたテキストにする。
2. **ブロック単位の LCS 差分**: ブロック配列同士を**行(ブロック)単位の LCS**で突き合わせ、`added`/`removed`/`changed` ブロック数を数える。文字単位 diff はしない(ブロック粒度で十分・計算量も抑える)。
3. **指標の算出**(`EditDiffSummary`):
   - `headline`: 最も大きい変化の一言(例: 追加ブロック優位→「加筆」/ 削除優位→「短縮」/ 同数の changed→「言い換え」/ 先頭ブロックが変わった→「導入を修正」/ 見出しブロックのみ変化→「見出しを修正」)。判定は決定的ルール表で行う。
   - `region`(`対象`): 主に変わった領域(`導入`=先頭ブロック / `見出し`=heading ブロック / `本文`=それ以外 / `全体`=広範)。
   - `beforeChars`/`afterChars`/`delta`: 文字数と増減。
   - `sample`: 変わった箇所の**代表 1 ペア**(最初の changed ブロックの before→after を各 200 字で切ったもの)。ここに「人がどう直したか」の具体が入る。
   - `noChange: boolean`: 実質無変更(added/removed/changed すべて 0)。true なら append をスキップ(§3.3.a)。
4. **`要約` 文字列**: `region`・`delta`・`sample`(before→after)を 1 本の文字列に整形し、2000 字で切る。長い本文でも要約は常に 2000 字以内。

この要約が weekly の①記事の質分析の一次材料になる(「導入がいつも冗長で人が短縮している」→ プロンプトの導入指示を直す diff 案)。

#### 3.4.3 イベント型(discriminated union)

```
LearningEvent =
  | { kind: "編集";     pageId: string; title: string; before: string; after: string }
  | { kind: "採否";     pageId: string; title: string; aspect: string; before: string; after: string }
  | { kind: "画像試行"; pageId: string; title: string; style: string; result: "成功" | "失敗"; attempt: number }
  | { kind: "工程失敗"; mode: string; exitCode: number | null; detail: string }
```

`buildLearningLogProps(event)` がこれを Notion プロパティへ変換する(rich_text は `chunkRichText`、date は `記録時刻=now`、number は `回数`)。

### 3.5 書き込み失敗時の挙動(ベストエフォートの厳密化)

学習ログ書き込みは**本処理を絶対に止めない**が、**沈黙もさせない**。

- **API route(a・b)**: `appendLearningLog` は `next/server` の `after()` 内で実行し、内部で自前 try/catch する(§3.3.a)。失敗しても Web レスポンス(`{ success: true }`)は返る(レスポンスは `after()` 実行前に確定済み)。失敗時は **`console.error`(Vercel サーバログ)に出す**。LINE 通知は行わない — Vercel から LINE を叩くには LINE トークンを Vercel 環境に置く必要があり、throttle の状態ファイルも持てないため、**LINE throttle 通知は状態ファイルを持てる PC 側 CLI 経路(下記)に集約**する(実装計画で確定した判断)。
- **CLI(c)/`run.mjs`(d)**: 追記の spawnSync/CLI が失敗しても、`done`/`fail`/`notifyLoopFail` 自体の終了コードは変えない。CLI 側は失敗を stderr に出し、**LINE 通知**(既存 `pushTextMessage`・`LINE_GROUP_ID`)で「学習ログの記録に失敗(種別)」を送る(工程失敗の記録漏れも沈黙させない)。通知の多発を避けるため、**既存 `notify-throttle.ts` で 30 分ウィンドウのスロットル**をかける(状態ファイル `.growth-tmp/learning-log-notify.json`)。
- **DB 未追加(欠落耐性)**: `GROWTH_LEARNING_LOG_DS` 未設定 or DB 未作成(createPage が 404 相当)なら、追記は**静かにスキップ**してよい(まだ基盤が入っていない段階での運用を壊さない)。ただし「DS 未設定」と「設定済みだが書き込み失敗」は区別し、後者だけ LINE 通知する。判定は learning-log CLI 内で行う。

### 3.6 CLI `learning-log-cli.ts`

`scripts/growth/learning-log-cli.ts`(薄い配線・カバレッジ除外)。既存 CLI(`advise-cli.ts`)と同じ骨格(`requireEnv`/`notionOptions`/`GROWTH_DRYRUN` 対応)。

- `append <種別> <ペイロードJSONファイル>`: JSON を読み、`buildLearningLogProps` で変換し `createPage(learningLogDs, props)`。API route(a・b)からは HTTP 内で直接 `appendLearningLog`(純ロジック＋`createPage`)を呼ぶので CLI を経由しないが、**CLI も同じ純ロジックを使う**(重複実装しない)。
- `append-fail <mode> <exitCode> <detail>`: `run.mjs`(d)専用のショートカット(工程失敗イベントを 1 行足す)。`.ts` を import できない `run.mjs` からの唯一の追記経路。
- `recent [週数]`: 直近 N 週(既定 4)の学習ログを `記録時刻` フィルタ + `pageSize` で引き、`parseLearningLogPage` で行にして **JSON を標準出力**する(weekly が読む・§4.5)。全行スキャンしない。
- `GROWTH_DRYRUN=1` では書き込み/通知せず内容を表示。

**注意**: API route(a・b)は Next.js の実行時に `appendLearningLog`(= 純ロジック `buildLearningLogProps` + `notion.ts` の `createPage`)を直接呼ぶ。`appendLearningLog` は `src/lib/growth/learningLog.ts` から使える薄いラッパ(`scripts/growth/learningLog.ts` に置き、`createPage`・DS ID・token を受け取る形)にする。CLI は同じラッパを Node から呼ぶ。**Notion 書き込みのコードは 1 箇所**(`appendLearningLog`)に集約する。

---

## 4. SI2 詳細: weekly 統合(システム振り返り)

### 4.1 方針

weekly モードに**「システム振り返り」工程を 1 つ追加**する。新モード・新ループは作らない(pull 型の常時ループは SI1 の追記だけ)。weekly は元々 pull 型で「読んで施策を作る」役なので、材料(学習ログ)が 1 つ増えるだけの自然な拡張。

### 4.2 `weekly.md` への追加内容(方針)

`scripts/growth/prompts/weekly.md` の `<workflow>` に、既存手順 2(`growth:existing` で既存行取得)と並ぶ**入力取得**、および手順 5(施策登録)と並ぶ**登録先**を足す。

- **入力の追加(手順 2 の直後)**: `npm run growth:learning-log:recent` を実行し、直近 4 週の学習ログ(種別別・対象別の傾向)を読む。`run.mjs` の weekly モードの `allow` に `Bash(npm run growth:learning-log:recent)` を追加する(§6.1)。weekly が実行するのはこの固定スクリプトのみ(引数付きの `-- recent 8` 等は人間の手動調査用)。
- **分析工程の追加(手順 3 の後・システム振り返り)**: マーケターチーム分析(既存 6 カテゴリ)に加えて、**「システム振り返り」**を行う。学習ログ + 既存信号(成績データ・公開後判定・却下理由)から、4 領域(記事の質 / 運用効率 / ツール機能 / グロース施策の強化)の改善点を抽出する。
  - **①記事の質**: `編集`イベントの傾向(どの領域が毎回直されるか)・`採否`の採用観点から、**プロンプト(`scripts/growth/prompts/*.md`)/文体ガイド(`growth-article-style.md`)の具体 diff 案**を作る。対象ファイルの現行テキストを Read で確認し、変更前後を明示する。
  - **②運用効率**: `工程失敗`の頻度(どのモードがよく落ちるか)・`画像試行`のリトライ多発(どのスタイルが崩れやすいか)から、設定値の diff 案(例: `GROWTH_REVISE_DAILY_CAP` の見直し)または手順の施策文を作る。
  - **③ツール機能**: 編集差分・採否の傾向から、機能開発の**要件案**(何を・なぜ・受け入れ条件の骨子)を作る。実装は通常フロー(spec→計画→実装)へ渡す前提で、施策には「要件案」だけを書く。
  - **④グロース施策の強化**: 既存 weekly の担当。学習ログを材料に既存の 6 カテゴリ提案を厚くする(新カテゴリは作らない)。
- **登録の追加(手順 5)**: ①〜③の改善は「施策提案」DB に **`カテゴリ=システム改善`** で登録する(§4.3)。仮説・成功指標・検証予定日は既存施策と同じ書式(必須・空欄で出さない)。diff 案/要件案は**ページ本文**に書く(§4.4)。
- **`facility-context` 聖域の明記(非交渉ルール)**: システム振り返りは、`scripts/growth/facility-context.json` の**確定事実・禁止事項(doNotWrite)を変更する提案を出してはならない**。これは人間だけが更新する聖域。プロンプト側にこの禁止を明記する(既存の「未確定情報を断定しない」と同格の非交渉ルールとして `<non_negotiables>` に追加)。
- **質が量に優先**: システム改善施策も「効果を測れる仮説が立つものだけ」。無ければ 0 件でよい(既存の施策ルールと同じ)。

### 4.3 「施策提案」DB `カテゴリ` に「システム改善」を追加

- 既存「施策提案」DB(data source `3503f4bc-b1c4-4927-91ce-7609a6c4e460`)の `カテゴリ` select に **`システム改善`** 値を 1 つ足す(オーナーが Notion 管理画面で事前追加。**この値の事前追加が前提**)。
- **既存カテゴリ・既存プロパティは変更しない**。`システム改善` は既存 6 カテゴリ(コンテンツ/MEO/サイトデザイン/サイト表示内容/追加機能/イベント)と並ぶ 7 つ目。
- 施策 ID の命名は既存踏襲(`<週キー>-SYS-01` 等。例 `2026-W27-SYS-01`)。`SYS` を「システム改善」の略号として予約する。
- 欠落耐性: `カテゴリ` に `システム改善` 値が未追加でも、weekly の登録は沈黙落ちしない(Notion select は未知値でもプロパティ設定自体は通るが、安全のため weekly は登録前に `growth:existing` 相当で既存値を確認し、未追加なら「システム改善カテゴリ未追加のため登録スキップ+報告」する。**value 未追加時の挙動は「作らずに報告」を既定**にする=勝手に select 値を増やさない)。

### 4.4 提案ページ本文のフォーマット定義(diff 案/要件案)

施策の**プロパティ**(施策名/カテゴリ/仮説/成功指標/検証予定日 等)は既存どおり。**具体 diff 案・要件案は施策ページの本文(ブロック)**に書く。プロパティ rich_text の 2000 字制限を避け、diff を読みやすく載せるため。

#### 4.4.1 ページ本文の構造(領域別)

- **①記事の質(プロンプト/文体ガイドの diff 案)**:
  ```
  [heading_2] 対象ファイル
  [paragraph]  scripts/growth/prompts/drafts.md(導入の指示)
  [heading_2] 根拠(学習ログ)
  [paragraph]  直近4週で「導入を短縮」編集が7件。人が毎回 AI の冗長な導入を削っている。
  [heading_2] 変更前
  [code]       <現行テキストの該当部分>
  [heading_2] 変更後(案)
  [code]       <提案テキスト>
  [heading_2] 適用手順
  [paragraph]  承認後、Claude Code セッションで対象ファイルを上記に差し替え→テスト→ローカルコミット。
  ```
- **②運用効率**: 設定値なら上と同じ diff 形式(対象=`.env.example` 等・変更前後)。手順改善なら `根拠`＋`施策文`(手順の箇条書き)。
- **③ツール機能(要件案)**:
  ```
  [heading_2] 要件案(何を・なぜ)
  [heading_2] 受け入れ条件の骨子
  [heading_2] 実装フロー
  [paragraph]  通常の spec→計画→実装フローで着手する(この施策は要件案まで)。
  ```

#### 4.4.2 純ロジック `systemProposal.ts`

`scripts/growth/systemProposal.ts`(＋再エクスポート)に、上記本文構造を **Notion ブロック配列に組み立てる純関数**を置く。

- `SystemProposalBody`(型・領域 discriminated union: `prompt-diff` / `config-diff` / `ops-playbook` / `feature-requirement`)。
- `buildSystemProposalBlocks(body): NotionBlock[]`。heading_2/paragraph/code ブロックの配列を作る。**各ブロックの rich_text は `chunkRichText` を通し 2000 字ごとに分割**(長い diff は 1 ブロック内で複数 rich_text 要素、または複数 code ブロックに割る)。code ブロックは 2000 字/ブロックで**複数ブロックに分割**する(§1 の Notion 制約)。
- `buildSystemProposalProps(meta): Record<string, unknown>`。施策名/カテゴリ=`システム改善`/仮説/成功指標/検証予定日/施策 ID を既存書式で組み立て。

#### 4.4.3 Notion への書き込み経路(MCP・既存作法)

実 weekly の Notion 書き込みは headless では Notion MCP ツール経由(既存 weekly の作法)。**weekly は MCP で本文付きページを作り、本文ブロックの構造は §4.4.1 のフォーマット(=`buildSystemProposalBlocks` の出力と同型)に従う**。

- `buildSystemProposalBlocks` は「本文構造の正典」としてテストで固定する(weekly.md はこの構造を提示し、MCP でそのとおりに作らせる)。
- `notion.ts` への `createPageWithChildren` 追加は**今回は行わない**(YAGNI・使い手がいない)。将来この経路を CLI 化するときに初めて追加する(§9 非スコープ)。

### 4.5 学習ログの読み取り範囲

- **直近 4 週**(既定)。`growth:learning-log:recent`(実体は learning-log CLI の `recent`)が `記録時刻 >= now - 4週` でフィルタして引く。週数は CLI 引数で可変(`recent 8` 等・手動調査用)。
- 4 週にする理由: weekly は毎週回る。傾向を見るには 1 週では少なく、古すぎると既に直した改善が混じる。既存の検証サイクル(施策の `検証予定日` は「28 日後」目安)と揃えて 4 週を既定にする。
- `summarizeLearningLog(rows, now, 4)` が種別別件数・対象別ヒートマップ(どの領域が何回直されたか)・画像リトライ上位・失敗モード頻度を集計し、weekly の分析入力にする。**集計は純ロジック**(テスト対象)。

### 4.6 既存学習ループとの接続

- システム改善施策も既存「施策提案」DB に載るので、**`growth:proposal-review-due`(検証予定日で到来判定→検証結果候補→検証済み記録→LINE 通知)がそのまま効く**。追加実装は不要。
- 次週以降の weekly は `growth:existing`(却下理由・検証結果)を読む既存学習ループで、**効かなかった/オーナーが却下したシステム改善提案を繰り返さない**。SI2 は新しい信号源(学習ログ)を足すだけで、検証・学習の仕組みは既存を再利用する。

---

## 5. 適用フロー(人間ワークフロー)

システム改善施策は**必ず人間が適用する**。自動適用は一切ない。

1. **提示**: weekly が「施策提案」DB に `カテゴリ=システム改善` の施策を作る(仮説・成功指標・検証予定日つき・本文に diff 案/要件案)。承認画面/Notion で人が読む。
2. **承認判断**: オーナーが施策を読み、`ステータス` を採否判断(承認/却下)。却下なら判断者メモに理由を書く(既存学習ループの入力)。
3. **適用(人間立会いの Claude Code セッション)**: 承認された diff 案は、**別途 Claude Code セッションで人間立会いのもと適用**する。
   - ①記事の質/②設定 diff: 対象ファイル(`prompts/*.md`・`growth-article-style.md`・`.env.example` 等)を diff どおり編集 → テスト(該当あれば)→ **ローカルコミット**(push は人が確認後)。`run.mjs` の commit/push DISALLOW は無人ループに対する制約であり、この人間セッションでの手動コミットは対象外(**無人での自動コミットは一切しない**という原則は不変)。
   - ③ツール機能(要件案): 通常の spec→計画→実装フローに乗せる(この施策は「要件案まで」なので、着手判断も人)。
4. **検証**: `検証予定日` が来たら `growth:proposal-review-due` が LINE 通知。人が成功指標(記事の質改善なら次サイクルの `編集`イベント減少・失敗改善なら `工程失敗`頻度低下 等)を突き合わせ、`検証結果` を書く。
5. **学習**: `検証結果`・却下理由は次週 weekly が読み、効いた方向を厚く・効かない/却下方向を繰り返さない。

**`facility-context.json` の扱い(絶対)**: いかなる施策も `facility-context.json` の確定事実・doNotWrite を変更する diff を出さない。仮に学習ログから「この未確定項目を書きたい」傾向が出ても、**それは施策にしない**(聖域=人間だけが更新)。プロンプトで禁止し(§4.2)、レビュー時にも人が弾く。

---

## 6. セキュリティ・ガード

### 6.1 認可・段階ガード

- SI1 の API 変更(a・b)は**既存ルートへの追記**であり、認可・ガードは既存のまま(`verifyToken` の `Authorization: Bearer`＋`articleEditGuard`〔#H9〕)。学習ログ追記は認可通過後の成功処理内でのみ発火する。新エンドポイントは増やさない(=新たな攻撃面を作らない)。
- weekly モードの `allow` に追加するのは `Bash(npm run growth:learning-log:recent)` の**読み取り 1 コマンドのみ**(§4.2)。append 系は weekly に許可しない(weekly は台帳を読むだけ)。

### 6.2 秘密情報

- 学習ログの書き込み/読み取りは既存 `NOTION_TOKEN`(server-only)を使う。`NEXT_PUBLIC_` に置かない。`MICROCMS_MANAGEMENT_API_KEY` 等は無関係(学習ログは microCMS を触らない)。
- LINE 通知は既存 `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_GROUP_ID`。

### 6.3 ログ肥大・暴走対策

- **要約のみ保存**: `要約` は 2000 字上限(`summarizeEditDiff` が切る)。本文全文・生 diff は台帳に載せない。
- **直近ウィンドウ読み**: weekly は `recent`(直近 4 週・`pageSize` 制限)だけ引く。全行スキャンしない。台帳が年単位で肥大しても weekly のコストは一定。
- **日次上限の再利用(通知抑制)**: 学習ログ書き込み失敗の LINE 通知は `notify-throttle.ts` でスロットル(§3.5)。障害時に通知が連投して埋もれるのを防ぐ。
- **画像リトライの可視化 → 既存日次上限で頭打ち**: 画像再生成自体は既存の `REVISE_DAILY_CAP`(`run.mjs`)で上限が効く。学習ログはリトライを**記録して可視化する**だけで、生成回数を増やさない。
- **台帳は追記専用**: 既存行の更新・削除経路を作らない(改竄・誤更新の面を作らない)。

### 6.4 環境変数

- `.env.example` に追加:
  ```
  # セルフチューニングループ(学習ログ)DB の data source ID(Notion 管理画面で作成後に設定)
  GROWTH_LEARNING_LOG_DS=
  ```
- 未設定時は SI1 の追記を静かにスキップ(§3.5 の欠落耐性)。SI2 の `recent` は空配列を返し、weekly は「学習ログなし」で従来動作(推測しない)。

---

## 7. テスト戦略(純ロジックのユニットテスト)

TDD 必須・純ロジックは 100% カバレッジ。CLI(`learning-log-cli.ts`)・`run.mjs` 変更・weekly.md はカバレッジ除外(既存方針)。テスト対象:

| 対象(`scripts/growth/*.test.ts`) | 検証内容 |
|---|---|
| `learningLog.test.ts` › `summarizeEditDiff` | 加筆/短縮/言い換え/導入修正/見出し修正の headline 判定・region 判定・delta 計算・`noChange` 検出・sample 200 字切り・空/巨大入力の安全処理 |
| `learningLog.test.ts` › `buildLearningLogTitle` | 4 種別のタイトル生成・60 字切り・記事タイトル空のフォールバック |
| `learningLog.test.ts` › `buildLearningLogProps` | 4 イベント型 → Notion プロパティ変換・rich_text の `chunkRichText` 分割・date/number/select の形・`結果`/`回数` の有無 |
| `learningLog.test.ts` › `parseLearningLogPage` | 欠落プロパティ → 空/既定(安全側)・未知 `種別`/`結果` の寄せ |
| `learningLog.test.ts` › `summarizeLearningLog` | 直近 4 週フィルタ・種別別件数・対象別ヒートマップ・画像リトライ上位・失敗モード頻度・0 件で空サマリ(壊れない) |
| `systemProposal.test.ts` › `buildSystemProposalBlocks` | 4 領域(prompt-diff/config-diff/ops-playbook/feature-requirement)のブロック構造・code ブロックの 2000 字分割・長大 diff の複数ブロック化 |
| `systemProposal.test.ts` › `buildSystemProposalProps` | `カテゴリ=システム改善`・施策 ID(`-SYS-` 命名)・仮説/成功指標/検証予定日の形・欠落時の扱い |
| `appendLearningLog`(ラッパ) | DS 未設定=静かにスキップ / 設定済み失敗=LINE 通知(throttle 経由)/ dryrun 表示。※ HTTP は fetch モックで検証(既存 `advise.test.ts` の作法) |

**方針**: 差分要約・集計・ブロック組み立てはすべて決定的純関数にし、テストで固定する。Notion 書き込み・LINE 通知・fire-and-forget の配線は CLI/ラッパ薄層に押し出し、そこはカバレッジ除外(既存の `advise-cli.ts`/`metrics-cli.ts` と同じ分離)。

---

## 8. 実装フェーズ分割

### フェーズ SI1: 学習ログ収集基盤

**内容**:
1. Notion「学習ログ」DB をオーナーが作成(§3.1 のプロパティ)＋ `GROWTH_LEARNING_LOG_DS` 設定＋ `.env.example` 追記。
2. 純ロジック `learningLog.ts`(型・`summarizeEditDiff`・`buildLearningLogTitle`・`buildLearningLogProps`・`parseLearningLogPage`・`summarizeLearningLog`)＋再エクスポート＋テスト。
3. `appendLearningLog` ラッパ(`createPage` 呼び出し・DS 未設定スキップ・失敗時 LINE throttle 通知)。
4. CLI `learning-log-cli.ts`(`append`/`append-fail`/`recent`)＋ package.json スクリプト(`growth:learning-log`・`growth:learning-log:recent`)。
5. 書き込み箇所の結線: (a) `draft/edit/route.ts`・(b) advise-apply/comment-revise 反映 API・(c) `body-image-regen-cli.ts`/`eyecatch-regen-cli.ts`・(d) `run.mjs` の `notifyLoopFail`/pull 失敗/weekly 異常終了。
6. ドキュメント: `40-notion-props.md` に「学習ログ」DB 節、`30-loops.md`(または新規分割ファイル `docs/operations/growth/70-self-tuning.md`)に SI1 の記録経路、CLAUDE.md 索引に 1 行。

**完了条件**:
- 手動リッチ編集を保存すると学習ログ DB に `編集` 行が 1 つ増え、`要約` に前後差分の構造化要約が入る(無変更保存では増えない)。
- advise/comment-revise の採用反映で `採否` 行が採用 fix ごとに増える。
- 画像再生成の done/fail で `画像試行` 行が成否つきで増え、`回数` に累積が入る。
- `run.mjs` の工程失敗(revise 等)で LINE 通知と同時に `工程失敗` 行が増える。
- DS 未設定/DB 未作成でも上記 4 経路の本処理は一切止まらない(追記だけ静かにスキップ)。設定済みで書き込み失敗したときは LINE 通知が飛ぶ(throttle 済み)。
- 純ロジックのテストが 100% カバレッジで green。`GROWTH_DRYRUN=1` で追記/通知せず内容表示。

### フェーズ SI2: weekly 統合

**内容**(SI1 完了後):
1. 「施策提案」DB `カテゴリ` に `システム改善` 値をオーナーが追加。
2. 純ロジック `systemProposal.ts`(`buildSystemProposalBlocks`・`buildSystemProposalProps`)＋テスト。
3. `weekly.md` に「システム振り返り」工程・入力(`recent`)・登録(`システム改善`)・`facility-context` 聖域の非交渉ルールを追記。`run.mjs` の weekly `allow` に `Bash(npm run growth:learning-log:recent)` を追加。
4. ドキュメント: `weekly-runbook` に「システム振り返り」手順、`40-notion-props.md` に `システム改善` カテゴリ、CLAUDE.md 索引更新。

**完了条件**:
- weekly 実行時に `growth:learning-log:recent` で直近 4 週の学習ログを読み、傾向を分析する。
- ①記事の質・②運用効率の改善は対象ファイルの現行テキストを確認した上で**変更前後を含む diff 案**を施策ページ本文に書く。③ツール機能は要件案を書く。
- 施策は `カテゴリ=システム改善`・`-SYS-` 施策 ID・仮説/成功指標/検証予定日つきで登録される。効果を測れない案は 0 件でよい。
- `facility-context.json` を変更する提案が出ない(プロンプトの非交渉ルールで禁止)。
- `growth:proposal-review-due` がシステム改善施策の検証予定日を既存どおり拾う。次週 weekly が却下/検証結果を読んで繰り返さない。
- `システム改善` カテゴリ値が未追加のときは「作らず報告」する(勝手に select 値を増やさない)。

---

## 9. 非スコープ

- **自動適用**: 提案の適用・コミットを無人で行うことは一切しない。`run.mjs` の commit/push DISALLOW は不変。適用は人間立会いの Claude Code セッションのみ(§5)。
- **`facility-context.json` の変更提案**: 確定事実・doNotWrite を動かす提案を出さない(人間だけが更新する聖域)。
- **実 KPI の自動取得**: 予約件数・LINE 友だち数・口コミ等の実 KPI 自動取得はしない(既存どおりオーナー手入力・改善案#4 の範囲)。学習ログは運用の一次データ(編集・採否・試行・失敗)だけを扱う。
- **却下(dismiss)の記録**: SI1 は「採用された助言」だけを記録する。却下助言・却下記事の網羅的記録はスコープ外(将来拡張)。
- **LLM による差分要約**: `summarizeEditDiff` は決定的純ロジック(LLM を呼ばない)。意味的要約は weekly の分析工程(Claude)が学習ログを読んで行う。
- **`notion.ts` の `createPageWithChildren` 追加**: weekly は MCP で本文付きページを作るため今回は不要(YAGNI)。将来この経路を CLI 化するときに追加する。
- **④グロース施策全般の新設**: 既存 weekly の担当を再設計しない。学習ログという材料が増える分の強化のみ(§4.2 ④)。
- **既存 3 DB のスキーマ変更**: 記事ネタ案・週次レポートのプロパティは変更しない。「施策提案」DB も `カテゴリ` select 値 1 つの追加のみ(既存プロパティ不変)。
- **ツール機能施策(③)の実装**: 施策には要件案までを書く。実装は通常の spec→計画→実装フローへ渡す(このループ内で実装しない)。

---

## 10. 制約(プロジェクト規約・再掲)

- TDD 必須・純ロジック 100% カバレッジ(CLI・`run.mjs`・薄い配線は `vitest.config.ts` の `coverage.exclude` に追記)。
- TS strict / `any` 禁止(外部入力は `unknown`＋zod 検証)/ `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- 純ロジック分離: ロジックは `scripts/growth/*.ts`＋`src/lib/growth/*` 再エクスポート。Notion 書き込みは 1 箇所(`appendLearningLog`)に集約。
- pull 型: 書き込み側(API/ループ)は Notion に 1 行足すだけ。集計・提案は weekly が拾う。適用は人。
- 欠落耐性: 新 DB・新 select 値が未追加でも本処理を止めない。書き込み失敗は沈黙させず LINE 通知(throttle)。
- 出力(spec/計画/コミット/説明)は日本語。無人での push/commit 禁止(`run.mjs` DISALLOW 継続)。push 時のみ `ttmakhr1028ai-art`。
