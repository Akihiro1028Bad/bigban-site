# 記事の日次ウォッチ 設計書（2026-09-14）

> 目的: 公開済みのコラム・ニュースについて「流入の急変」「期限切れ表現」「ページの死活」の3種の異常を毎日検知し、既存の日次ウォッチ（クラウドルーチン・09:00 JST）の通知に合流させる。判定・改稿案・新規記事案は出さない（週次の記事レビューの担当）。
> 上位の設計: `docs/superpowers/specs/2026-08-05-growth-copilot-design.md` §6（日次ウォッチ）。週次側: `docs/superpowers/specs/2026-09-11-article-review-routine-design.md`。集計・判定の共通契約: `docs/growth/analysis-contract.md`。
> 背景の分析: `docs/reviews/2026-09-13-columns-analysis.md`。

## 1. 背景と決定事項

2026-09-13 の公開コラム分析で、日次で拾えていれば早く直せた問題が3つ見つかった。

- HYROX 入門記事に「9/4 確認・まもなく販売開始」が販売開始（9/10）後も3日間残っていた。
- 9/7 公開の2記事（始め方・オープンプレー）が、地域ガイド3本から6日間リンクされていなかった。
- HYROX 告知が週41→618、入門が週71→33 と動いていたが、月次の記事成績まで気づかなかった。

一方、記事の判定・改稿案・新規ネタは 2026-09-11 の設計で**週1（木曜）に決定済み**で、毎日フル判定は「同じ結論の繰り返し」として却下している。本書はその決定を変えず、日次ウォッチに「記事の異常検知だけ」を足す。

ブレインストーミング（2026-09-14）で決めたこと:

| 論点 | 決定 | 却下した案 |
|---|---|---|
| 何を毎日見るか | **流入急変（G）・期限切れ表現（H）・記事ページの死活（I）** | 受け皿のない新しい検索需要（GSC が2〜3日遅れで日次に向かない。週次へ）／新記事の被リンクなし（週次で十分） |
| 作り方 | **スクリプト1本 + 日次ウォッチのプロンプト追記**（案A） | プロンプトだけ（再現性なし。共通契約に反する）／週次スクリプト `reviewArticles.mjs` の `--daily` モード（未実装かつローカル前提で、日次がクラウドで動かせない） |
| 確認日の経年（「◯月◯日確認」が古い） | **日次に入れない**。週次の `stale_date_text`（28日超）に任せる | 日次で28日超を検知（参加費ガイドのように確認日を複数持つ記事で毎日鳴り続ける） |
| 通知の重複抑制 | **持たない**。H は直るまで毎日同じ1行で載る | 状態保存で初回だけ通知（クラウドルーチンは状態を持てない） |

## 2. 全体構成

```
09:00 daily-watch（既存・クラウド）
  1. 主要カウンタ（既存 A〜C）
  2. Labola 予約台帳（既存 D〜E）
  3. 本番トップの死活（既存 F）
  3b. 記事ウォッチ（新設）  node scripts/analytics/watchArticles.mjs --json
        → alerts が空なら何も書かない / あれば G・H・I として同じ1通に合流
  4. 判定案の48時間確定（既存・沈黙タスク）
```

- **分担**: スクリプトが取得・集計・判定を決定的に行い JSON を出す。プロンプト（AI）は `alerts` を通知文に整形するだけ。スクリプトは何にも書き込まない。
- **env**: 既存の5つ（`GROWTH_GOOGLE_*` 3つ・`GROWTH_GA4_PROPERTY_ID`・`GROWTH_GSC_SITE_URL`）だけ。microCMS は使わない（公開日・更新日は本番 HTML の JSON-LD から取る）。
- **クラウド側の変更はプロンプト差し替えのみ**（正本 `docs/growth/routines/daily-watch.md` へのポインタ方式のため、リポジトリ更新で次回実行から反映される）。

## 3. 検知条件と閾値

### 3.1 G. 記事の流入急変（GA4 入口セッション）

対象は `/columns/`・`/news/` の詳細ページ（一覧は除外）。`/en/` は別記事、`/ja/` 接頭辞は落として ja に正規化（`articleMetrics.mjs` の `normalizeArticlePath` を再利用）。

| 記号 | 条件 | 深刻度 |
|---|---|---|
| G1 | 直近7日 vs 前7日が ±40% 超、かつ前7日が **30 セッション以上** | 中 |
| G2 | 昨日 vs 前週同曜日が ±60% 超、かつ前週同曜日が **20 以上** | 中（祝日と重なる週は「祝日ずれの可能性」を1行添える。既存Bと同じ） |
| G3 | 前7日が30以上あった記事の直近7日が **0** | 高（I の結果と突き合わせて書く） |

- 公開14日未満の記事は G の対象外（立ち上がりの急増は正常）。`publishedAt` が取れない記事は除外を適用せず対象に残す。
- 下限（30 / 20）を置く理由: 週13前後の記事（市川ガイド）は1日の揺れで ±60% を超えるため。2026-09-13 の実測では G1 に当たるのは告知（41→618）、参加費（380→653）、入門（71→33）の3件で、いずれも説明が必要な変動だった。
- 窓の終端は JST の前日（`query.mjs` の `ranges()` と同じ基準）。

### 3.2 H. 期限切れの表現（本番 HTML）

対象は sitemap から拾った記事 URL（上限50本）。本文は `<main>`（無ければ `<article>`）の中のテキストだけを見る（レイアウトのバナー文言を拾わないため。9/11 設計 §3.5 と同じ理由）。

| 記号 | 条件 | 深刻度 |
|---|---|---|
| H1 | `/news/` の本文に「募集中」「受付中」「開催します」「開催予定」のいずれかがあり、本文中で最も遅い開催日（「YYYY年M月D日」形）が**昨日以前** | 中。開催済みイベントが受付中のまま |
| H2 | 本文に「まもなく」「近日公開」「近日中」「追って」のいずれかがあり、JSON-LD の `dateModified` が**14日超前** | 低。「まもなく販売開始」「プログラム詳細は近日公開」がこの型 |

- H1 の「開催日」は「YYYY年M月D日」形の日付をすべて拾い、その最大値を使う。年のない「M月D日」は使わない（過去記事の「8月23日」を今年と誤読するため）。日付が1つも無ければ H1 は判定しない。
- H2 で `dateModified` が取れない記事は判定しない（`null` を「古い」と読まない）。
- 「◯月◯日確認」の経年は対象外（§1）。「未発表」「販売開始前」も対象外（名古屋2027 のように長期間正しく残る表現のため）。
- H は状態を持たないため、直るまで毎日同じ1行で載る。うるさければプロンプト側で「木曜だけ載せる」に落とせるよう、スクリプトの出力は毎日出す。

### 3.3 I. 記事ページの死活

| 記号 | 条件 | 深刻度 |
|---|---|---|
| I | sitemap の記事 URL のうち、HTTP 200 以外が **30秒後の再試行でも続く** | 最優先。既存 F と同じ扱い |

- `000`（接続不能）は既存 F と同じく「観測不能」として区別し、死活と断定しない。
- 既存 F（トップの死活）が発火した日は、I を「トップと同じ原因の可能性」として1行に畳む（プロンプト側）。

## 4. スクリプトの仕様

既存の作法（純関数モジュール + CLI。`monitoring.mjs` と `query.mjs --monitor-only --json` の関係）を踏襲する。

### 4.1 ファイル

| ファイル | 役割 | 状態 |
|---|---|---|
| `scripts/analytics/articleWatch.mjs` | 純関数のみ。sitemap 解析、GA4 日次行→記事別4窓集計、G/H 判定、JSON-LD からの `datePublished`/`dateModified` 抽出、本文テキスト抽出。fetch を含まない | 新規 |
| `scripts/analytics/articleWatch.test.ts` | fixtures で全分岐。カバレッジ100% | 新規 |
| `scripts/analytics/watchArticles.mjs` | CLI。認証・取得・再試行・JSON 出力だけ。`node scripts/analytics/watchArticles.mjs --json`（`--json` なしは人が読む1行/記事の要約） | 新規 |
| `scripts/analytics/watchArticles.test.ts` | CLI のテスト（MSW） | 新規 |
| `scripts/analytics/fixtures/article-watch/` | sitemap・HTML・GA4 応答の fixtures | 新規 |
| `scripts/analytics/articleMetrics.mjs` | `normalizeArticlePath`・`isArticlePath`・`formatDelta` を再利用 | 既存・変更なし |
| `scripts/analytics/query.mjs` | 変更しない。`.env.local`→`process.env` フォールバックと OAuth 取得は `watchArticles.mjs` に同じ形で持つ（共通化は範囲外。9/11 設計と同じ判断） | 既存・変更なし |

### 4.2 取得（すべて読み取り）

| ソース | 取るもの | 備考 |
|---|---|---|
| GA4 | `landingPagePlusQueryString` × `date` の `sessions`、直近15日（昨日・前週同曜日・直近7日・前7日をすべて含む）、`/columns/`・`/news/` を含む入口のみ | 1回の呼び出し（limit 10000）。クエリ文字列と `/ja/` は正規化で落とす |
| 本番 sitemap | `https://www.thepicklebang.com/sitemap.xml` から `/columns/<slug>`・`/news/<slug>`・`/en/columns/<slug>`・`/en/news/<slug>` の詳細 URL | 一覧ページ（`/columns`・`/news`）は除外。上限50本。超えたら打ち切らず `sources.sitemap.error` に記録し、超過分は取得しない |
| 各記事 HTML | HTTP ステータス、JSON-LD（`Article`/`NewsArticle`）の `datePublished`・`dateModified`、`<main>` 内テキスト | 並列5本・15秒タイムアウト。200 以外は30秒後に1回だけ再試行（待ちは CLI が持つ。プロンプト側の「待って再実行」を不要にする） |

サイトの URL は定数 `https://www.thepicklebang.com` を既定とし、`--site <origin>` で上書きできる（テストと将来のステージング用）。

### 4.3 出力 JSON

```
{
  today: "2026-09-14",                                   // JST
  windows: { yesterday: {startDate,endDate}, sameWeekdayLastWeek: {...}, last7: {...}, prev7: {...} },
  sources: {
    ga4:     { ok: true|false, error: null|string },
    sitemap: { ok, count, error },
    html:    { ok, fetched, error }                       // 1本でも取得失敗（観測不能含む）なら ok:false
  },
  articles: [{
    path: "/columns/hyrox-beginners-guide", locale: "ja"|"en",
    publishedAt: "2026-08-10"|null, dateModified: "2026-09-13"|null,
    entry: { yesterday, sameWeekdayLastWeek, last7, prev7 },   // GA4 失敗時はすべて null
    http:  { status: 200|number|null, retried: boolean, observed: "ok"|"error"|"unreachable" },
    flags: [{ code: "G1", severity: "中", detail: { last7, prev7, deltaPercent } }, ...]
  }],
  alerts: [{ code, path, severity, detail }]              // flags の平坦化。プロンプトはこれだけ読む
}
```

- 取得に失敗した値は `null` にし、0 で埋めない。条件に使う値が `null` の判定は**その判定だけを飛ばす**。
- `sources` のどれかが `ok:false` なら、JSON は出したうえで終了コード1（共通契約「失敗を 0 にしない」。プロンプトは終了コードで出力を捨てず `sources` を読む）。
- `alerts` は `severity` の順（最優先 → 高 → 中 → 低）、同順位はパス順に並べる。
- 実行時間の目安は1分以内（GA4 1回・sitemap 1回・HTML 約25本）。再試行が発生した場合は +30秒/本。

### 4.4 判定の入力（純関数の契約）

```
buildArticleWindows(rows, windows)             → Map<path, {yesterday, sameWeekdayLastWeek, last7, prev7}>
detectEntryFlags(entry, publishedAt, today)    → G1/G2/G3 の flags（除外条件を含む）
extractArticleUrls(sitemapXml, origin)         → path[]（上限50、超過は {paths, overflow} で返す）
parseArticleHtml(html)                         → { datePublished, dateModified, mainText }
detectTextFlags(path, parsed, today)           → H1/H2 の flags
```

`today` は JST の日付文字列で CLI から渡す（純関数は `Date.now()` を読まない）。

## 5. 日次ウォッチへの組み込みと通知文

### 5.1 手順の追加

`docs/growth/routines/daily-watch.md` の「3. 本番トップの死活」の直後に「3b. 記事ウォッチ」を追加する。

```bash
node scripts/analytics/watchArticles.mjs --json
```

- `alerts` が空 → 記事については何も書かない（沈黙のまま）。
- `sources` のいずれかが `ok:false` → その項目は「取得不可」と明記し、当該判定を保留する（0 と読まない）。GA4 だけ失敗なら H/I は通常どおり判定する。
- スクリプト自体が起動できない → 既存のフォールバックと同じ扱い（他の異常があればその通知の末尾に「記事ウォッチが実行できなかった（理由）」を1行、なければ3営業日続いた場合だけ1通）。
- 既存 F が発火した日は、I を「トップと同じ原因の可能性」として1行に畳む。

### 5.2 通知文

既存の見出し構成（検知・数字・考えられる原因・今すぐ確認してほしいこと）をそのまま使い、記事の項目は「■ 検知」に記号付きで並べる。記事1本につき1行。パスは `columns/hyrox-beginners-guide` の形。

```
⚠ 日次ウォッチ (9/14) — 記事2件の期限切れ表現

■ 検知
H1) news/picklerox-2026: 開催日 8/23 が過ぎているが「受付中」が残っている
H2) news/hyrox-osaka-early-access-simulation: 「近日公開」が残ったまま最終更新から16日

■ 数字
（G のときだけ: 直近7日 / 前7日 / 変化率 を記事ごとに1行）

■ 考えられる原因
（H は省略してよい。G は「記事公開・SNS投稿・大会の販売開始・計測変更」から最大3つ。断定しない）

■ 今すぐ確認してほしいこと
H) 該当記事の文言を更新するか、対話で「〇〇の期限切れ表現を直して」と依頼
G) 急減なら記事 URL を開いて表示を確認。急増なら要因を一次情報で確かめる
I) 記事 URL を開いて表示を確認
```

### 5.3 原則の追加（「やってはいけないこと」に2行）

- 記事ウォッチの結果から改稿案・新規記事案を書かない（週次の記事レビューの担当）。日次は「何が起きたか」と「確認先」まで。
- H の同じ記事が連日載る場合も、文面を変えたり深刻度を上げたりしない（直るまで同じ1行）。

### 5.4 ドキュメントの更新箇所

| ファイル | 変更 |
|---|---|
| `docs/growth/routines/daily-watch.md` | 手順 3b・判定表 G/H/I・通知例・原則2行 |
| `docs/growth/README.md` | 日次ウォッチの説明に「記事の急変・期限切れ・死活」を追記 |
| `docs/growth/analysis-contract.md` | 「記事の日次監視」を1段落追加（G の下限値・H の判定は本書を正典とする旨） |
| `docs/superpowers/specs/2026-09-11-article-review-routine-design.md` | §3.5 `stale_date_text` の横に「期限切れ表現（H1/H2）は日次ウォッチが担当」と1行、二重検知を防ぐ |

## 6. テストと並走

### 6.1 テスト

| 対象 | 方法 | ケース |
|---|---|---|
| 純関数 | Vitest + fixtures | G1〜G3 の発火/非発火、下限未満の除外、公開14日未満の除外、`publishedAt` null なら除外しない、GA4 null で G を飛ばす、H1（開催日が昨日以前/今日以降/日付なし/年なし日付は無視/`/columns/` は対象外）、H2（更新から14日以内/超/`dateModified` なし）、sitemap 解析（ja/en・一覧除外・50本超）、JSON-LD 抽出（Article/NewsArticle/無し）、`<main>` 無しで `<article>` に落ちる |
| CLI | Vitest + MSW（実 API は叩かない。`.env.local` は読まず一時ファイル。`query.test.ts` と同じ方式） | 正常 / GA4 失敗で部分出力+終了コード1 / sitemap 失敗 / 記事 500 が再試行でも続く / `000` を観測不能として区別 / 再試行で復帰したら `retried:true` かつ alert なし / `--site` 上書き |
| 既存テストとの整合 | `articleMetrics.test.ts` は変更なし | – |

TDD で純関数から書く。カバレッジは CI の閾値（100%）を満たす。再試行の30秒待ちはテストで注入可能にする（`--retry-wait-ms`、既定 30000）。

### 6.2 並走（初回2週間）

- 初日は対話で `node scripts/analytics/watchArticles.mjs` を手動実行し、その時点の `alerts` を目視で確認する。想定される初期発火は H1 の開催済みイベント告知（ピックルロックス・PPT vol.4・早朝ピックル等）と H2 の「近日公開」（9/26 告知）。**初期発火は既知の実態なので、最初の1回で直すか対象外にするかを決めてから本番に載せる**（載せた初日から毎日鳴るのを避ける）。
- 2週間は、ルーチンの通知と対話での確認を突き合わせ、誤検知（祝日・SNS 投稿由来の急増など）があれば閾値か除外条件を直す。
- 終了条件: 2週連続で誤検知ゼロ、かつ見逃しなし（対話で気づいた記事異常がすべて通知に含まれていた）。

## 7. 前提

| # | 前提 | 確認 | 外れたときの扱い |
|---|---|---|---|
| ① | クラウドルーチンで `node` と `curl`（外向き HTTPS）が使える | 既存の日次ウォッチが `query.mjs` と `curl` を使っている | 使えない場合は既存フォールバックと同じ（3営業日続いたら1通） |
| ② | 本番の記事ページに JSON-LD（columns: Article、news: NewsArticle）があり `datePublished`/`dateModified` を持つ | 2026-09-13 に `src/app/[locale]/columns/[slug]/page.tsx` と `NewsArticleJsonLd.tsx` で実装を確認。値の有無は実装時に本番 HTML で確認する | 取れない記事は G の除外と H2 を判定しない（§3） |
| ③ | sitemap に記事の詳細 URL が ja/en とも載っている | 実装時に本番 sitemap で確認 | 載っていない記事は監視対象外。GA4 に現れてサイトマップに無い記事は `sources.sitemap.error` に列挙 |
| ④ | 記事本文が `<main>` の中にある | 実装時に確認 | 無ければ `<article>`、それも無ければ `<body>`（バナー混入のリスクを `sources.html.error` に注記） |

## 8. 成功条件（8週後に判定）

- 期限切れ表現（H）が本番に **7日以上残らない**（2026-09-13 時点では「まもなく販売開始」が販売開始後3日、9/7 公開の2記事へのリンク欠落が6日残った）。
- 記事の急変（G）を、週次レビューより先に検知できた件数 ≥ 1（大阪2027 の販売サイクル中に少なくとも1回は起きる想定）。
- 記事由来の通知は **週2通以下**。超える場合は閾値が緩すぎる（runbook「読まれない通知は害」）。

## 9. 作らないもの

- 日次からの改稿案・新規案の生成、Notion への書き込み、microCMS の読み書き。
- 確認日の経年チェック（週次の `stale_date_text`）、受け皿のない新規需要の検知（週次）、被リンクなしの検知（週次）。
- 通知の重複抑制のための状態保存。
- `query.mjs` との共通化リファクタ。

## 10. 実装範囲（この設計書1本で1つの実装計画にする）

1. `articleWatch.mjs` + テスト（純関数、TDD）
2. `watchArticles.mjs` + テスト（CLI、MSW）
3. `daily-watch.md` の追記（3b・G/H/I・通知例・原則）、`README.md`・`analysis-contract.md`・9/11 設計書への1行追記
4. 対話での初回手動実行 → 初期発火の処置 → 2週間の並走

完了の定義: 1〜3 がマージされ、4 の初回実行で `alerts` が期待どおりに出て、テストが全件成功してカバレッジ閾値を満たし、§6.2 の並走終了条件を満たしていること。
