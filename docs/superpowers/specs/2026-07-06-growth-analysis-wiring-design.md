# グロースループ 分析結線 改善2件 設計書(改善6・改善9)

- 対象リポジトリ: `bigban-growth-loop-mvp`
- 起票日: 2026-07-06
- 前提レビュー: 2026-07-06 実装レビューの改善バックログ(`project_growth_loop_review_backlog.md`)。本書は 🟡6・🟢9 の2件を閉じる。
- 直前タスク: 🔴4件(`docs/superpowers/specs/2026-07-06-growth-red-fixes-design.md`)は**ワーキングツリーに未コミットで載っている**。本書はその状態を正として裏取り済み(特に `weekly.md` の手順番号・`publishGate.ts`・`knownPaths.ts`・`existing.ts` は現行ツリーの実体で確認)。
- 関連正典: `docs/operations/growth/00-canon.md`(pull型・純ロジック分離・欠落耐性・失敗を沈黙させない)、`CLAUDE.md`(TDD 必須・純ロジック 100% カバレッジ・CLI/`run.mjs`/`gen-*` はカバレッジ除外)。
- 実装体制: 実装は codex。設計判断は本書で確定済み(codex は覆さない)。疑義は本書「要確認」で採用案付きに明示。

---

## 0. サマリ(この設計書で閉じる2つの穴)

| 改善 | 何が足りないか | どのループを閉じるか |
|---|---|---|
| 改善6: reviewLabels を weekly に結線 | 成績判定ラベル(`reviewLabels`: CTR弱い/順位あと少し/読まれるがCTA弱い/要改稿/伸びている/未計測)は承認画面 UI(`PerformanceBoard.tsx`)と review-due では使われているが、**weekly の唯一のグラウンドトゥルース `growth:existing` 出力には記事ごとに併記されていない**。weekly は「効いた型を厚くする(集計)」は読めるが「この記事は CTR が弱いからタイトルを直す」といった**記事単位の次の打ち手**を材料化できていない。 | 計測→次回の打ち手(記事単位のリライト施策) |
| 改善9: カニバリ照合+ファネルカバレッジ | 新ネタが既存記事の検索意図と食い合う(カニバリ)かどうか、どの記事タイプ×媒体が薄いか(カバレッジ)を、weekly が機械集計として読めない。外部キーワード API は入れず、**手元の Notion 行だけで機械が「材料」を集計**し、判断は LLM に委ねる。 | ネタ選定(重複回避・網羅性) |

**設計の背骨**: 両改善とも新モード・新ループを増やさない。既存の純ロジック `reviewLabels`(`metricsReview.ts`)・`parseMetrics`(`metrics.ts`)・`summarizeExisting`(`existing.ts`)に**集計出力を1〜2節足すだけ**で閉じる。すべて I/O を持たない純関数として `existing.ts`(または新規純ロジックファイル)へ実装し、`existing-cli.ts`(カバレッジ除外)は Notion 行を渡す薄い配線に留める。判断材料の供給に徹し、機械が結論を出さない(材料提供=機械/判断=LLM の役割分担を維持)。

**重要な前提(裏取り済み)**:
- `growth:existing` の実体は `summarizeExisting(input)`(`scripts/growth/existing.ts`)。CLI(`existing-cli.ts`)が Notion 3 DB(週次レポート/施策提案/記事ネタ案)を `queryDataSource` で読み、`ideas`(記事ネタ案 全行・`pageSize: 100`)等を渡す。**本書の集計はすべて `ideas` 配列(記事ネタ案 DB)から作れる**。
- 記事ネタ案 DB のプロパティ実名・型は `docs/operations/growth/40-notion-props.md` で確認済み: `タイトル案`(title)/ `検索意図`(rich_text)/ `記事タイプ`(select: 獲得/不安解消/資産/比較/イベント)/ `媒体`(select: コラム/ニュース)/ `ステータス`(select: 承認/生成中/下書き作成済み/却下/公開済み。加えて weekly が付ける `提案中`・運用上の `見送り`)/ `成績データ`(rich_text JSON)。
- `reviewLabels(metrics: ArticleMetrics, daysPublished: number | null)` は `metricsReview.ts` の純関数。`parseMetrics(成績データ)` が `ArticleMetrics`(`publishedAt?` を含む)を返し、`daysSincePublished(publishedAt, nowMs)` が経過日を返す。**改善6 に必要な材料はすべて `成績データ` JSON 内に揃う**(追加 Notion 読み込み不要)。

---

## 1. 背景と目的

グロースループの週次モードは「唯一のグラウンドトゥルースは `growth:existing` の出力」という制約で動く(headless では MCP で Notion 行を列挙できないため)。そのため weekly が学習に使える材料は `summarizeExisting` が Markdown に整形して出した分だけになる。

現状 `summarizeExisting` は次を出している(`existing.ts` の節順): 週次レポート作成済み判定 → オーナー手入力(実 KPI) → 施策提案既存 → 記事ネタ案既存(`ideaLines`) → 公開済み記事の**記事タイプ別**成績サマリ(`renderPerformanceSummary`)。

ここに2つの穴がある。

1. **改善6**: 成績は「記事タイプ別の集計」までは出るが、**記事1本ごとの「次の打ち手ラベル」**(`reviewLabels`)が出ていない。承認画面 UI は同じラベルを赤/黄バッジで出しているのに、headless の weekly はそれを読めず、「CTR弱い記事にタイトル改善ネタを当てる」といった記事単位の施策に繋げられない。
2. **改善9**: 新ネタを出すとき、weekly は「既存の記事ネタ案タイトルと同じテーマは避ける」(`ideaLines` の重複回避)しか材料を持たない。**検索意図の実質重複(カニバリ)**や、**記事タイプ×媒体のカバレッジの薄い箇所**は集計されていないため、LLM が俯瞰で判断する材料が無い。

いずれも新規データ源・外部 API を足さず、`ideas` 配列(既存プロパティ)からの純ロジック集計で閉じる。

---

## 2. 改善6: reviewLabels を weekly の既存行出力に結線

### 2.1 目的

`growth:existing` の**公開済み記事**について、記事1本ごとに `reviewLabels` を併記する。weekly が「この記事は CTR弱い/順位あと少し/読まれるがCTA弱い/要改稿」を記事単位で読み、次のように打ち手へ変換できるようにする(結線の指示は weekly.md 側=§2.5)。

- CTR弱い → タイトル/description 改善ネタ
- 順位あと少し → リライト/内部リンク強化施策
- 読まれるがCTA弱い → CTA/導線改善施策
- 要改稿 → 改稿提案

ラベルは**機械判定の参考値**であり最終判断は LLM+人。ラベルが施策を確定させるわけではない(材料提供に徹する)。

### 2.2 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `scripts/growth/existing.ts`(純ロジック) | `ideas` の公開済み行から**記事ごとの reviewLabels 行**を作る純関数を追加し、`summarizeExisting` の出力に1節足す。`nowMs` を注入可能にする(テスト決定性・§2.7)。 |
| `scripts/growth/existing-cli.ts`(カバレッジ除外) | `summarizeExisting` 呼び出しに `nowMs: Date.now()` を渡すだけ(薄い配線)。 |
| `src/lib/growth/existing.ts`(再エクスポート) | 既存の再エクスポート方針に合わせ、追加した公開シンボルがあれば通す(現状 `existing.ts` は再エクスポート未整備なら §10-4 参照。承認画面はこの節を読まないので必須ではない)。 |
| `scripts/growth/prompts/weekly.md` | 「ラベル→打ち手」の結線指示を手順2(伸ばす/避ける学習)に追記(§2.5)。 |

> `metricsReview.ts` の `reviewLabels`・`daysSincePublished`、`metrics.ts` の `parseMetrics` は**変更しない**(既に純ロジック・テスト済み)。改善6 はそれらを `existing.ts` の文脈で呼ぶ結線に徹する。

### 2.3 ラベル計算に必要なデータが `existing.ts` の文脈で揃うか(裏取り・確定)

**揃う。追加の Notion 読み込みは不要。**

- `reviewLabels` の第1引数 `ArticleMetrics` は `成績データ`(rich_text JSON)を `parseMetrics` に通せば得られる。`existing.ts` は既に `performanceSummary.ts` 経由で同じ `成績データ` を読んでいる(`summarizeArticlePerformance` → `parseMetrics(richTextValue(page, METRICS_PROPS.data))`)。
- `reviewLabels` の第2引数 `daysPublished` は `ArticleMetrics.publishedAt`(#計測強化 S3 で `成績データ` JSON に含まれる・`metrics.ts` 49行・schema 201行で optional)から `daysSincePublished(publishedAt, nowMs)` で算出できる。`publishedAt` 欠落時は `daysSincePublished` に渡す前に `null` を使い(要改稿判定だけがスキップされる=`metricsReview.ts` の設計どおり)、他ラベルは算出される。
- 対象は `ステータス`=`公開済み` の行のみ(`performanceSummary.ts` の `PUBLISHED_STATUS` と同基準)。公開前の行は成績が無い。

> **なぜ `existing.ts` に置くか(`performanceSummary.ts` に相乗りしない理由)**: `performanceSummary.ts` は「記事タイプ**別の集計**」が責務で、記事単位の行を出さない(戻り値は `ArticleTypePerformance[]`)。記事単位ラベルは別関心なので、`existing.ts` に新しい純関数(例 `articleLabelLines(ideas, nowMs)`)として足し、`summarizeExisting` から呼ぶ。`performanceSummary.ts` は無改修。

### 2.4 純関数の設計(`existing.ts` 内)

`summarizeExisting` に `nowMs` を追加(要改稿判定の経過日算出のため)。`existing.ts` は現在 `ExistingInput` に `period`/`reportsForWeek`/`proposals`/`ideas` を持つ。ここに `nowMs: number` を足す(必須。CLI が `Date.now()` を注入・テストは固定値)。

追加する純関数(名称は実装者裁量・下記は指針):

```ts
/** 記事タイトル案 title を読む(既存の titleText を流用)。 */
// title は "タイトル案"(40-notion-props.md 準拠)

/**
 * 公開済み記事1本ごとの reviewLabels 行を作る(純関数)。
 * - 対象: ステータス=公開済み の ideas 行のみ。
 * - metrics: parseMetrics(成績データ)。null(未計測/不正)なら ["未計測"] 相当の扱い。
 * - daysPublished: metrics.publishedAt から daysSincePublished(publishedAt, nowMs)。publishedAt 欠落は null。
 * - 出力: `- <タイトル案>: <ラベル1>・<ラベル2>`(ラベルが無ければラベル省略でタイトルのみ)。
 * 公開0本なら空配列(呼び出し側が「公開済みなし」の1行を出す)。
 */
export function articleReviewLabelLines(
  ideas: readonly NotionPage[],
  nowMs: number
): string[];
```

判定手順(1行 = 1公開記事):
1. `selectName(page, "ステータス") !== "公開済み"` はスキップ。
2. `metrics = parseMetrics(richTextValue(page, "成績データ"))`。
3. `metrics === null` → `成績データ` 未設定/不正。この記事は `reviewLabels` を呼べないので **`["未計測"]`** をラベルとして扱う(`reviewLabels` の未計測返却と同じ意味・沈黙落ちさせない)。
4. `metrics !== null` → `days = metrics.publishedAt ? daysSincePublished(metrics.publishedAt, nowMs) : null`。`labels = reviewLabels(metrics, days)`。
5. 行を組み立て: `- ${title}: ${labels.join("・")}`(`labels` が空配列のときはコロン以降を省いて `- ${title}` とし、空ラベルを `: ` だけ残さない)。`reviewLabels` は最低でも `["未計測"]` か何らかのラベルを返す設計だが、空配列にも耐える書き方にする(欠落耐性)。

`summarizeExisting` に節を追加(§2.6 の位置):

```
## 公開済み記事の判定ラベル(記事単位・次の打ち手の材料)
- <タイトルA>: CTR弱い・順位あと少し
- <タイトルB>: 読まれるがCTA弱い
- <タイトルC>: 未計測
(ラベルは機械判定の参考値。CTR弱い→タイトル/description、順位あと少し→リライト/内部リンク、
 読まれるがCTA弱い→CTA/導線、要改稿→改稿。最終判断は分析で行う)
```
公開0本のときは `(公開済み記事がまだ無いため記事単位ラベルは空)` の1行(沈黙落ちさせない)。

> 末尾の凡例1行(ラベル→打ち手の対応)を出力に含めるかは §10-1。**採用**: 含める(weekly.md 側の指示と二重化するが、grounding が出力自体に載る方が headless では堅い)。

### 2.5 `weekly.md` への結線指示(挿入位置・現行ツリーの手順番号)

現行 `weekly.md`(ワーキングツリー・84行)の `<workflow>` は次の番号:
- 手順2 = `growth:existing`(避ける学習/伸ばす学習#221/オーナー手入力)
- 手順3 = 学習ログ取得
- 手順5 = システム振り返り

改善6 の指示は**手順2**(伸ばす/避ける学習の直後)に追記する。手順2内の「伸ばす学習(#221・必須)」サブ項目の直後に、次の趣旨のサブ項目を1つ足す:

> **記事単位の打ち手(改善6・必須)**: `growth:existing` 出力の「公開済み記事の判定ラベル(記事単位)」節を読み、各ラベルを次の施策へ変換する材料にする——**CTR弱い→タイトル/description 改善ネタ、順位あと少し→リライト/内部リンク強化施策、読まれるがCTA弱い→CTA/導線改善施策、要改稿→改稿提案**。ラベルは機械判定の参考値であり、実際に施策化するかは勝ち筋(市場の空白×施設の強み)と成功指標で最終判断する。ラベルは記事ネタ案(リライト系はコンテンツ)または施策提案(内部リンク/CTA/description はサイト系カテゴリ)に振り分ける。

> **挿入は行番号ではなく一意アンカーで**: codex は編集前に `weekly.md` を再読し、「伸ばす学習(#221・必須)」で始まる行を探して**その直後**に挿入する(手順番号は 🔴 修正で既に動いており、今後もずれ得るため)。

### 2.6 データフロー(改善6)

```
weekly 実行
 └ growth:existing(= summarizeExisting)
     └ ideas(記事ネタ案 全行)
         ├ ideaLines(既存・却下理由/公開後判定=要改稿 併記)      … 避ける学習
         ├ renderPerformanceSummary(summarizeArticlePerformance)  … 伸ばす学習(記事タイプ別)
         └ articleReviewLabelLines(ideas, nowMs)                  ← 改善6(記事単位ラベル)
             └ 公開済み × parseMetrics(成績データ) × reviewLabels
 └ weekly.md 手順2: ラベル→打ち手へ変換(材料として)
```

### 2.7 欠落時挙動(改善6)

| 欠落条件 | 挙動 |
|---|---|
| `成績データ` 未設定/不正 JSON | その記事は `["未計測"]` として1行出す(黙って落とさない)。 |
| `publishedAt` 欠落(旧データ) | `daysPublished=null` で `reviewLabels` を呼ぶ→要改稿ラベルだけ算出されない(他ラベルは出る)。`metricsReview.ts` の既定挙動どおり。 |
| 公開済み0本 | 「公開済み記事がまだ無いため記事単位ラベルは空」の1行。 |
| `nowMs` の非決定性 | CLI が `Date.now()` を注入・純関数は引数で受ける(テストは固定値)。純関数内で `Date.now()` を直接呼ばない。 |

### 2.8 テスト計画(改善6)

`existing.ts` は純ロジック(100% カバレッジ対象)。`existing-cli.ts` はカバレッジ除外(既に vitest.config の exclude に登録済み)。TDD: 先に RED。

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `scripts/growth/existing.test.ts` | `公開済み記事に判定ラベルを記事単位で併記する` | CTR弱い条件の成績データを持つ公開済み記事1本 → 出力に `- <タイトル>: CTR弱い` を含む |
| 〃 | `複数ラベルは中黒で連結する` | CTR弱い+順位あと少しの成績 → `CTR弱い・順位あと少し` を含む |
| 〃 | `成績データが空/不正の公開済み記事は 未計測 と出す` | `成績データ` 無しの公開済み → `未計測` を含む・落とさない |
| 〃 | `publishedAt 欠落でも要改稿以外のラベルは出る` | `publishedAt` 無し・低調成績 → 要改稿は付かないが他ラベルは出る(nowMs 固定) |
| 〃 | `公開前(提案中/承認等)の記事はラベル節に出さない` | 非公開ステータス行 → ラベル節に当該タイトルが出ない |
| 〃 | `公開済み0本なら空である旨を出す` | ideas 全て非公開 → 「記事単位ラベルは空」を含む |
| 〃 | `nowMs 注入で要改稿判定が決定的` | 公開後28日超・低調 → `要改稿` を含む(固定 nowMs) |

- `ArticleMetrics` の生成は既存 `performanceSummary.test.ts` / `metricsReview.test.ts` の `metricsJson`/`base`/`search` ヘルパと同型のファクトリを流用してよい(既存テストの書式に合わせる)。
- **既存 `existing.test.ts` を壊さない**: `ExistingInput` に `nowMs` を必須追加するため、既存の全 `summarizeExisting({...})` 呼び出しに `nowMs` を足す必要がある(§10-2 で任意化案と比較の上、必須で確定)。既存テストの修正は同一コミットで行う。

---

## 3. 改善9: カニバリ照合 + ファネルカバレッジ(材料の機械集計)

### 3.1 目的と役割分担

外部キーワード API は導入しない。機械は**材料提供**(検索意図の一覧・カバレッジの本数表)に徹し、カニバリ判定・埋める枠の選定は LLM が行う。`ideas`(記事ネタ案 全行)だけから2つの集計を `summarizeExisting` 出力に足す。

- **(a) 検索意図インデックス**: 生きているネタ(提案中/承認/下書き作成済み/公開済み。**却下・見送りは除外**)の `タイトル案` と `検索意図` の一覧。weekly が新ネタの検索意図と突き合わせてカニバリ(実質同一の検索意図)を避ける材料。
- **(b) カバレッジ集計**: 公開済み+仕掛かり中(= 生きているネタと同じ集合)を `記事タイプ`×`媒体` でクロス集計した本数表。どの型・媒体が薄いかを俯瞰する材料。

### 3.2 プロパティ実名・型(裏取り・確定)

`docs/operations/growth/40-notion-props.md` および実コードで確認:

| プロパティ | 型 | 読み取り関数(existing.ts に既存) | 備考 |
|---|---|---|---|
| `タイトル案` | title | `titleText(page, "タイトル案")` | `ideaLines` が既に使用。 |
| `検索意図` | rich_text | `richText(page, "検索意図")` | `existing.ts` の `richText` ヘルパで読める(未使用だが実在。`src/lib/growth/approve.ts:246` が同名 rich_text を読む)。 |
| `記事タイプ` | select | `selectName(page, "記事タイプ")` | `performanceSummary.ts` が同名 select を使用。欠落=「タイプ未設定」。 |
| `媒体` | select | `selectName(page, "媒体")` | 値: `コラム`/`ニュース`。**欠落=コラム扱い**(`endpoint.ts` `growthMediaForRow`: 未追加/空/未知は column=コラム)。 |
| `ステータス` | select | `selectName(page, "ステータス")` | 生存判定に使用。 |

**「生きているネタ」の定義(確定)**: `却下`・`見送り` を除く全ステータス。実装は除外リスト方式にする(`ステータス ∉ {却下, 見送り}`)。理由: 記事ネタ案 DB の実ステータス値は将来増え得る(`提案中`/`承認`/`生成中`/`下書き作成済み`/`公開済み` 等)ため、**含めるリストのホワイトリストより、死んだ2値の除外の方が欠落耐性が高い**(新ステータスが増えても勝手に生存側に入る)。

> `媒体` は欠落=コラムに寄せる。カバレッジ表の軸ラベルは「コラム/ニュース」に統一(`endpoint.ts` の `growthMediaForRow` で正規化してから集計するのが単一ソース。`existing.ts` から `growthMediaForRow(selectName(page,"媒体"))` を呼び、返り値 `column`/`news` を表示名 `コラム`/`ニュース` に写す小さなマップを持つ)。

### 3.3 純関数の設計(検索意図インデックス)

```ts
/** 却下・見送りを除く「生きているネタ」判定。 */
const DEAD_STATUSES = new Set(["却下", "見送り"]);
function isLiveIdea(page: NotionPage): boolean {
  return !DEAD_STATUSES.has(selectName(page, "ステータス"));
}

/**
 * 生きているネタの (タイトル案, 検索意図) 一覧を Markdown 行にする(純関数)。
 * カニバリ回避の材料。検索意図が空の行も「(検索意図未記入)」で出す(黙って落とさない)。
 */
export function searchIntentIndexLines(ideas: readonly NotionPage[]): string[];
```
出力例:
```
## 検索意図インデックス(生きているネタ・カニバリ回避の材料)
- 本八幡でピックルボールを始める完全ガイド ｜ 検索意図: 本八幡 ピックルボール 始め方
- テニス経験者のための移行ガイド ｜ 検索意図: (検索意図未記入)
(新ネタの検索意図が上記と実質同一なら出さない=カニバリ回避。角度違いなら差分が勝ち筋に書けるときだけ可)
```
生きているネタが0件なら `(生きているネタが無いためインデックスは空)` の1行。

### 3.4 純関数の設計(カバレッジ集計)

```ts
/**
 * 生きているネタを 記事タイプ×媒体 でクロス集計した本数表を Markdown 行にする(純関数)。
 * どの型・媒体が薄いかを俯瞰する材料。0件のセルも 0 と明示する(薄い枠を可視化)。
 */
export function coverageCrossTabLines(ideas: readonly NotionPage[]): string[];
```
軸:
- 行 = `記事タイプ`(獲得/不安解消/資産/比較/イベント + 欠落は「タイプ未設定」)。集計に**実際に現れた型**のみ行にするか、既知5型を常に出すかは §10-3。**採用**: 既知5型を常に行に出す(薄い=0本の型を可視化するのが目的なので、現れない型こそ 0 と出す価値がある)。加えて未設定が1件でもあれば「タイプ未設定」行を足す。
- 列 = `媒体`(コラム/ニュース)。両列を常に出す。

出力例(Markdown テーブルまたは箇条書き。承認画面はこの節を読まないので**人が読める体裁**でよい):
```
## カバレッジ集計(生きているネタ・記事タイプ×媒体・薄い枠の材料)
| 記事タイプ | コラム | ニュース |
|---|---|---|
| 獲得 | 2 | 0 |
| 不安解消 | 1 | 0 |
| 資産 | 3 | 0 |
| 比較 | 0 | 0 |
| イベント | 0 | 1 |
(薄い型・媒体を埋める視点も本命/補欠の選定材料にする。ただし成功型を厚くする学習(#221)と両立させ、
 根拠なく薄い枠を量産しない)
```
生きているネタが0件なら `(生きているネタが無いためカバレッジは空)` の1行。

> テーブルの空白セルが目視しづらい問題を避けるため、0 を明示的に数字で出す(空欄にしない)。

### 3.5 `summarizeExisting` への節追加位置

現行 `summarizeExisting` の節順(§1 参照)に対し、**記事ネタ案既存(`ideaLines`)の直後・記事タイプ別成績サマリの前**に、改善9 の2節 → 改善6 の1節、の順で足すのが読み手(weekly)にとって自然:

```
## 記事ネタ案: 既存 N件            (既存 ideaLines)
## 検索意図インデックス …           (改善9-a)
## カバレッジ集計 …                 (改善9-b)
## 公開済み記事の判定ラベル(記事単位)  (改善6)
## 公開済み記事の成績サマリ(記事タイプ別)(既存 renderPerformanceSummary)
```

> 節の並び順は可読性の問題で、機能には影響しない。codex は上記順を推奨とし、`summarizeExisting` の該当 `lines.push` ブロックの間に挿入する。

### 3.6 性能(全行走査のページング上限・裏取り)

- `existing-cli.ts` は `queryDataSource(IDEA_DS, { pageSize: 100 }, opts)` で記事ネタ案を読む。**現状ページングは1ページ(最大100件)**で、`has_more` を辿っていない(既存挙動)。改善9 は既存の `ideas` 配列をそのまま走査するだけなので、**上限は現行と同じ100件**。
- 記事ネタ案が100件を超えると `ideaLines`(既存)・改善9 とも一部を取りこぼす。**これは既存の制約であり改善9 で新たに悪化させない**。ページング拡張(`has_more` 追従)は本タスクのスコープ外(§8)。純関数側は配列全件を O(n) で1パス集計するだけ(タイプ×媒体は定数個のバケット)なので、100件規模で性能問題は無い。

> **要確認 §10-5**: 100件上限を本タスクで引き上げるか。**採用**: 引き上げない(既存挙動維持・スコープ最小)。将来ネタが100件に近づいたら別タスクでページング追従(`existing-cli.ts` のみの薄い変更)。

### 3.7 `weekly.md` への結線指示(改善9)

手順7(施策登録)のコンテンツ提案、および手順8(本命1+補欠2)の選定材料として、**手順7の「記事の仮説」ブロックの直前**あたりに次2つの趣旨を追記する(一意アンカー: 「狙い目テーマ(市場の空白・優先的に提案)」の**直前**に置く):

> **(a) カニバリ回避(改善9・必須)**: `growth:existing` 出力の「検索意図インデックス」を読み、**実質同一の検索意図のネタは出さない**。似た意図でも角度違い(読者・状況・切り口が異なる)なら、その差分が勝ち筋(市場の空白×施設の強み)に書けるときだけ提案してよい。

> **(b) カバレッジで薄い枠を埋める(改善9)**: 「カバレッジ集計」で薄い型・媒体を確認し、埋める視点も本命/補欠の選定材料にする。**ただし成功型を厚くする学習(#221 伸ばす学習)と両立させ、根拠なく薄い枠を埋めるための量産はしない**(質が量に優先=手順8)。

### 3.8 データフロー(改善9)

```
growth:existing(= summarizeExisting)
 └ ideas(記事ネタ案 全行)
     ├ isLiveIdea で 却下/見送り を除外
     ├ searchIntentIndexLines(ideas)   … (タイトル案, 検索意図) 一覧
     └ coverageCrossTabLines(ideas)    … 記事タイプ×媒体 本数表
weekly.md 手順7:
 ├ 新ネタの検索意図 vs インデックス → カニバリ回避
 └ カバレッジの薄い枠 × #221 伸ばす学習 → 本命/補欠選定
```

### 3.9 欠落時挙動(改善9)

| 欠落条件 | 挙動 |
|---|---|
| `検索意図` 空 | `(検索意図未記入)` と出す(タイトルは出す・落とさない)。 |
| `記事タイプ` 欠落 | カバレッジは「タイプ未設定」行に計上(黙って落とさない)。 |
| `媒体` 欠落/未知値 | `growthMediaForRow` で `コラム` に正規化して計上(欠落耐性・endpoint.ts 単一ソース)。 |
| `ステータス` 欠落 | `DEAD_STATUSES` に無いので「生きているネタ」に含める(材料として出す方が安全)。 |
| 生きているネタ0件 | 各節「空」の1行を出す(沈黙落ちさせない)。 |

### 3.10 テスト計画(改善9)

`existing.ts`(純ロジック・100% カバレッジ)。TDD: 先に RED。

| テストファイル | ケース名(新規) | 期待値 |
|---|---|---|
| `scripts/growth/existing.test.ts` | `検索意図インデックスに生きているネタのタイトルと検索意図を出す` | 提案中/公開済みの行 → `タイトル ｜ 検索意図: …` を含む |
| 〃 | `却下・見送りのネタはインデックスに出さない` | 却下行・見送り行 → そのタイトルがインデックス節に出ない |
| 〃 | `検索意図が空なら (検索意図未記入) と出す` | 検索意図 rich_text 空 → `(検索意図未記入)` を含む |
| 〃 | `生きているネタ0件でインデックスは空` | 全て却下/見送り → 「インデックスは空」を含む |
| 〃 | `カバレッジ集計を記事タイプ×媒体で数える` | 獲得×コラム2本・イベント×ニュース1本 → 各セルの数字が一致 |
| 〃 | `媒体欠落はコラム列に計上する` | 媒体未設定の行 → コラム列に加算(ニュースに入らない) |
| 〃 | `記事タイプ欠落はタイプ未設定行に計上する` | 記事タイプ未設定 → 「タイプ未設定」行に加算 |
| 〃 | `既知5型は現れなくても0で出す` | 一部の型しか無い ideas → 比較0・不安解消0 等が表に出る |
| 〃 | `却下・見送りはカバレッジ本数に数えない` | 却下行 → どのセルにも計上されない |
| 〃 | `生きているネタ0件でカバレッジは空` | 全て却下 → 「カバレッジは空」を含む |

- `existing-cli.ts` はカバレッジ除外(既登録)。
- 既存 `existing.test.ts` の `ideaPage`/`text`/`select` 相当ヘルパを流用(改善9 は既存プロパティのみ読むので新ファクトリ不要)。

---

## 4. 影響範囲と後方互換

| 変更 | 後方互換 | env |
|---|---|---|
| 改善6(`existing.ts` に記事単位ラベル節 + `nowMs` 追加) | 出力に節が1つ増えるのみ。公開0本/成績欠落で空 or 未計測。`reviewLabels`/`parseMetrics` は無改修。`ExistingInput.nowMs` 必須追加で既存 `summarizeExisting` 呼び出し(CLI・テスト)の更新が要る(同一コミットで対応)。 | 追加なし |
| 改善9(`existing.ts` に2節追加) | 出力に節が2つ増えるのみ。既存プロパティのみ読む。生きているネタ0件で空。100件上限は現行と同じ。 | 追加なし |
| `weekly.md` 追記(改善6・9 の結線指示) | プロンプトの指示追加のみ。学習ログ空・成績空でも手順が破綻しない。 | 追加なし |

**env 追加なし**(両改善とも既存の Notion プロパティ・既存 CLI 経路のみ)。`.env.example` 変更不要。

**vitest.config.ts 変更なし**: `existing.ts` は純ロジックで既に 100% カバレッジ対象、`existing-cli.ts` は既に exclude 済み。新規ファイルを作らない設計(すべて `existing.ts` へ追加)なので exclude 追記も不要。

> **要確認 §10-4**: 改善6/9 のロジックを `existing.ts` に相乗りさせるか、新規純ロジックファイル(例 `articleLabels.ts`/`ideaCoverage.ts`)に切るか。**採用**: `existing.ts` に相乗り(`summarizeExisting` が唯一の集約点で、`ideaLines`/`renderPerformanceSummary` も同じ流儀。ファイル分割は行数が 800 行に近づいたら別途)。現状 `existing.ts` は 198 行で余裕がある。

---

## 5. スコープ外(明記)

- **外部キーワード API / 検索ボリューム取得**(改善9 の趣旨どおり機械は手元 Notion 行のみで集計。判断は LLM)。
- **記事ネタ案 DB のページング追従(100件超の全件取得)**(§3.6・§10-5)。既存挙動維持。改善9 で悪化させない。
- **カニバリの機械判定(検索意図の類似度スコアリング・自動除外)**。機械は一覧を出すだけ。実質同一かの判断は LLM。
- **承認画面 UI への記事単位ラベル/カバレッジ表示**(承認画面は既に `PerformanceBoard.tsx` で `reviewLabels` を表示済み。本タスクは weekly 向け headless 出力のみ)。
- **`reviewLabels` の閾値変更**(`metricsReview.ts` の CTR/順位/CTA/要改稿の定数は無改修)。
- **`成績データ` の取得ロジック変更**(#C4 計測ループは無改修。既存 JSON を読むだけ)。
- **`公開後判定` select の自動更新**(人が決める。無改修)。
- その他バックログ(`project_growth_loop_review_backlog.md` の未着手項目)。

---

## 6. 実装順序(依存関係)

改善6 と改善9 は**同じ `existing.ts` / `existing.test.ts` / `weekly.md` を触る**が、機能的に独立。競合を避けるため順に実装する。

1. **改善9(検索意図インデックス + カバレッジ集計)** — `existing.ts` に純関数2つ + `summarizeExisting` に2節。既存プロパティのみ読むので `ExistingInput` シグネチャ変更が不要(`nowMs` 不要)。先にこちらを GREEN にすると、改善6 の `nowMs` 追加が既存呼び出しに与える影響を後段に隔離できる。
   - TDD: `existing.test.ts` に §3.10 のケースを RED → 純関数実装 → GREEN。
   - `weekly.md` 手順7 に §3.7 の指示追記(一意アンカー)。
2. **改善6(記事単位 reviewLabels)** — `existing.ts` に純関数1つ + `summarizeExisting` に1節 + `ExistingInput.nowMs` 追加。`existing-cli.ts` に `nowMs: Date.now()` 注入。既存 `summarizeExisting` 呼び出し(CLI・全既存テスト)に `nowMs` を足す。
   - TDD: §2.8 のケースを RED → 実装 → GREEN。既存 `existing.test.ts` の全 `summarizeExisting({...})` 呼び出しに `nowMs`(固定値・例 `Date.parse("2026-07-06T00:00:00Z")`)を追加。
   - `weekly.md` 手順2 に §2.5 の指示追記(一意アンカー)。
3. **回帰確認** — `npm run test`(or `vitest run`)で `existing.test.ts` GREEN・カバレッジ 100%。`existing-cli.ts` は除外のまま。dry-run で weekly が壊れないこと(`GROWTH_DRYRUN=1` は run.mjs レベルで、`weekly.md` の追記はプロンプトのみなので実害なし)。

> **依存の要点**: `nowMs` は改善6 でのみ必要。改善9 を先にやれば `ExistingInput` を触らずに済み、改善6 の1コミットに `nowMs` 波及を閉じ込められる。

---

## 7. 受け入れ基準

**改善6**:
- `growth:existing` 出力に「公開済み記事の判定ラベル(記事単位)」節があり、公開済み記事1本ごとに `reviewLabels` が中黒連結で併記される。
- `成績データ` 欠落/不正の公開済み記事は「未計測」として出る(黙って落とさない)。`publishedAt` 欠落でも要改稿以外のラベルは出る。公開0本で空である旨が出る。
- `nowMs` 注入で要改稿判定が決定的(テスト固定値で GREEN)。
- `weekly.md` 手順2 に「CTR弱い→タイトル/description、順位あと少し→リライト/内部リンク、読まれるがCTA弱い→CTA/導線、要改稿→改稿」の結線指示があり、ラベルが機械参考値である旨が明記されている。
- `existing.ts` 純ロジック 100% カバレッジ。既存 `existing.test.ts` GREEN(`nowMs` 追加後)。

**改善9**:
- `growth:existing` 出力に「検索意図インデックス」節があり、却下/見送りを除く生きているネタの `タイトル案`＋`検索意図` が列挙される。検索意図空は `(検索意図未記入)`。
- `growth:existing` 出力に「カバレッジ集計」節があり、生きているネタを `記事タイプ`×`媒体` でクロス集計(既知5型は0でも表示・媒体欠落はコラム・却下/見送りは非計上)。
- `weekly.md` 手順7 に (a) カニバリ回避(実質同一の検索意図は出さない・角度違いは勝ち筋があるときのみ)と (b) 薄い枠を埋める視点(#221 と両立・量産しない)の指示がある。
- 生きているネタ0件で各節「空」の1行。`existing.ts` 純ロジック 100% カバレッジ。
- 記事ネタ案100件上限は現行と同じ(改善9 で悪化しない)。

**共通**:
- TDD(RED→GREEN)。純ロジック(`existing.ts` 追加関数)のテストが先。`existing-cli.ts`・`weekly.md` はカバレッジ除外/対象外。
- 外部 API 追加なし・env 追加なし・vitest.config 変更なし。
- 無人での commit/push なし(`run.mjs` DISALLOW 不変)。push 時のみ `ttmakhr1028ai-art`。

---

## 8. 要確認(設計判断とコードの接地・codex 着手前に確認)

> 確定済み設計判断は覆さない。以下は「判断を実コードへ接地させる際の解釈確定」。各項に採用案を付す。codex は基本このまま着手してよい。

**8-1. 改善6 出力にラベル→打ち手の凡例1行を含めるか**
weekly.md 側にも同じ対応表を書くため二重化する。**採用**: 出力にも凡例1行を含める。headless の grounding は「出力に載っている」方が堅く、プロンプトが将来書き換わっても対応が保たれる。二重化のコストは1行なので許容。

**8-2. `ExistingInput.nowMs` を必須にするか任意にするか**
改善6 は経過日算出に現在時刻が要る。**採用**: 必須追加。任意(既定 `Date.now()`)にすると純関数内で `Date.now()` を呼ぶことになりテスト非決定性を招く(純ロジック分離の趣旨に反する)。既存呼び出し(`existing-cli.ts` 1箇所 + `existing.test.ts` の全 `summarizeExisting` 呼び出し)を同一コミットで更新する。CLI は `Date.now()`、テストは固定 ISO を注入。

**8-3. カバレッジ表の行を「既知5型固定」か「出現した型のみ」か**
**採用**: 既知5型(獲得/不安解消/資産/比較/イベント)を常に行に出す + 未設定が1件でもあれば「タイプ未設定」行。理由: 「薄い型を可視化する」のが目的なので、0本の型こそ 0 と出す価値がある。既知5型のリストは `performanceSummary.ts` にハードコードが無い(実データ由来の集計)ため、改善9 側で 5 値の定数配列を1つ持つ(`facility-context` ではなく `existing.ts` 内の定数。将来型が増えたらここを直す・コメントで明示)。

**8-4. 改善6/9 を `existing.ts` 相乗りか新規ファイルか**
**採用**: `existing.ts` 相乗り。`summarizeExisting` が唯一の集約点で `ideaLines`/`renderPerformanceSummary` と同じ流儀。現状198行で 800 行制約に余裕。`src/lib/growth/existing.ts` の再エクスポートは、承認画面がこれらの節を読まないため必須ではない(§2.2)。ただし純ロジック規約上、`export` した関数は将来 src から使える形にしておく(named export で公開)。

**8-5. 記事ネタ案100件超のページング**
`existing-cli.ts` は現状 `pageSize: 100` の1ページのみ(`has_more` 非追従)。**採用**: 本タスクでは引き上げない(既存挙動維持・改善9 で悪化させない)。100件に近づいたら別タスクで `existing-cli.ts` にページング追従を足す(純ロジックは全件配列を受けるだけなので無改修で済む設計)。完了報告に「100件上限は据え置き」と明記する。

**8-6. 「生きているネタ」の除外リスト vs ホワイトリスト**
確定判断は「提案中/承認/下書き作成済み/公開済みを含め、却下・見送りを除外」。**採用**: 除外リスト(`ステータス ∉ {却下, 見送り}`)で実装。ホワイトリスト(4値を明示列挙)だと `生成中`(#108)等の中間ステータスや将来値を取りこぼす。死んだ2値の除外の方が欠落耐性が高く、確定判断の意図(生きているネタを漏れなく材料化)に合う。

---

## 9. 制約(プロジェクト規約・再掲)

- TDD 必須。純ロジック(`existing.ts` に追加する `articleReviewLabelLines`・`searchIntentIndexLines`・`coverageCrossTabLines` 等)は 100% カバレッジ。`existing-cli.ts`・`weekly.md` はカバレッジ除外/対象外。
- TS strict / `any` 禁止(外部入力は `unknown`＋型ガード。`成績データ` は `parseMetrics` の zod 経由で narrow 済み)/ `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- 純ロジック分離: ロジックは `scripts/growth/existing.ts`。I/O(Notion 照会・`Date.now()`)は `existing-cli.ts`。純関数に `Date.now()`/`process.env` を持ち込まない。
- pull 型・欠落耐性・失敗を沈黙させない(成績欠落は「未計測」、意図空は「(検索意図未記入)」、0件は「空」を明示。黙って行を落とさない)。
- 出力(spec/計画/コミット/説明)は日本語。無人での push/commit 禁止(`run.mjs` DISALLOW 継続)。push 時のみ `ttmakhr1028ai-art`。
