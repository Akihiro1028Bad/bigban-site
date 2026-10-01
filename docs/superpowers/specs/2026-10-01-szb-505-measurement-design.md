# 計測の修理 設計書(szb-505 / issue #505)

- 起票: 2026-10-01 / ブランチ: `feature/szb-505-measurement`
- 目的: 第2群の施策(はじめての方へ・LaBOLA への渡し方など)の前後比較に使える計測の土台を直す。
- 承認済みの方針(司令塔・オーナー回答 2026-10-01):
  - 表示速度は **Speed Insights(A)+ PSI API の CrUX 定点取得(B)の併用**。新しい依存は `@vercel/speed-insights` の1つだけ。
  - PSI API キーは未発行。**キーが無いときは何もせず、スキップしたことをログに出す**。
  - 週次の集計結果は**画面に出すだけ**。記録は司令塔が分析のときに行う(Notion に書かない)。
  - GA4 管理画面の設定は**手順書のみ**(コードでは触らない)。

## 範囲

| issue の項目 | この PR | 手順書のみ |
|---|---|---|
| 自動アクセス(800x600・Linux)の GA4 除外 | 集計スクリプトで除外して数える | GA4 のデータフィルタ設定 |
| 決済代行2ドメインの参照元除外 | — | GA4 の「参照の除外」設定 |
| ChatGPT を AI チャネルに | — | GA4 のカスタムチャネル定義 |
| `labola_reserve_complete` をキーイベントに | — | GA4 のキーイベント指定 |
| 集計スクリプトのホスト分離 | `query.mjs` を直す | — |
| テニスベア申込の成否を週次で記帳 | 件数を自動取得して画面に出す | — |
| 実ユーザー表示速度の定点取得 | Speed Insights + CrUX 取得 | Vercel プラン確認・PSI キー発行・env 登録 |
| GA4 完了と予約台帳の週次突合 | 週次の件数を並べて差を出す | — |

## 構成(4つの部品)

### 1. Speed Insights(サイト側・コード)

- `package.json` に `@vercel/speed-insights` を追加。
- `src/app/[locale]/layout.tsx` の `<Analytics />` の隣に `<SpeedInsights />` を1行足す。
- `layout.test.tsx` で `<SpeedInsights />` が描画されることを確認する(外部モジュールはモック)。
- Vercel のプランで使えるかはオーナー確認事項。使えない場合も、`<SpeedInsights />` はデータが送られないだけで画面は壊れない。

### 2. `query.mjs` のホスト分離

GA4 は自社サイト(`www.thepicklebang.com`)と LaBOLA(`yoyaku.labola.jp`)を同じプロパティで計測している。今の `query.mjs` はホストを分けずに集計するため、ページ別 PV の上位に LaBOLA のページが並び、チャネル別セッションは自動アクセスで水増しされる。

- 新モジュール `scripts/analytics/hosts.mjs`(定数と GA4 フィルタ組み立て)を足し、`query.mjs` から使う。
  - `SITE_HOST` / `LABOLA_HOST`
  - `hostFilter(host)`: `hostName` の完全一致フィルタ
  - `excludeAutomatedAccess`: 画面 800x600 かつ OS Linux の組み合わせを除く `notExpression`
- 既存の「ページ別 PV」「チャネル別セッション」は **サイトのホストだけ**に絞る。見出しに `(サイト)` と書く。
- 新セクション「LaBOLA 段別(自動アクセス除外)」を足す。週カレンダー → 予約情報 → 顧客情報 → 支払い → 最終確認 → 完了の各ページのユーザー数を、自動アクセスを除いた値と除かない値の両方で出す。ページパスの判定は実装時に GA4 を読み取り専用で引いて確認する(V は `unifiedPagePathScreen` で段を定義していた)。
- 既存の監視(`monitoring.mjs`)の `PAGE_PATHS` は自社サイトのパス名だけなので、ホストを足すだけで足りる。ここは変えない。

### 3. 週次ヘルスチェック `npm run analytics:weekly`(新規・ローカル実行)

出力は**件数だけ**。個人名・連絡先は読まない・出さない。`.env.local` の `NOTION_TOKEN` と `GROWTH_*` を使う(既存の `early:sync` と同じ作法)。

1. **GA4 完了 vs 台帳**
   - GA4: `labola_reserve_complete`(通常)と `labola_reserve_complete_program`(スクール)の日別回数を、JST の月曜始まりの週にまとめる。LaBOLA ホストのみ。
   - 台帳: Notion「Labora 予約台帳」から**受付日時・ステータス・予約番号・予約種別の4列だけ**を読み、受付日時の週にまとめる。キャンセル済みも「受付」として数える(GA4 の完了は取消前に発火するため)。キャンセルの件数は別に出す。テスト予約(`EXCLUDED_RESERVATION_NOS`)は除く。
   - 出力: 週ごとに `GA4完了 / 台帳受付 / 差 / (うちキャンセル)`。差の符号と大きさの読み方を1行で添える(例: GA4 > 台帳なら重複発火の疑い、GA4 < 台帳なら計測漏れ・別経路の疑い)。
2. **テニスベア申込**
   - GA4: `reservation_click` のうち `location=reserve_choice_pickle_event`(/reserve のイベントカード)の週次クリック数。
   - テニスベア: サークル 36659 の開催回(未来・過去)を取得し、各回の参加申込の `applyDateTime` を週にまとめて件数にする。既存の `extractCircleEvents` / `extractEventDetail` を再利用し、別の取得関数を足す(早朝イベントだけに絞る既存関数は変えない)。取得の範囲は「今週を含む直近8週に申込があり得る回」(開催日が8週前〜今日の60日後)。
   - 出力: 週ごとに `クリック / 申込 / 申込÷クリック`。
3. **CrUX(実ユーザー速度)**
   - `PSI_API_KEY` が環境変数にあるときだけ、PSI API(`pagespeedonline/v5/runPagespeed`)を主要4ページ(`/`・`/reserve`・`/hyrox`・`/en`)× モバイルで呼び、`loadingExperience`(ページ単位)と `originLoadingExperience`(オリジン単位)の LCP・INP・CLS・FCP・TTFB の p75 を出す。
   - キーが無いときは、`PSI_API_KEY が未設定のため CrUX の取得をスキップしました` と出して続行する。ページ単位で件数不足のときは `ページ単位は件数不足(オリジン単位のみ)` と出す。
4. **失敗の扱い**: 1〜3 は独立して実行し、1つが失敗しても他の結果は出す。失敗した節は `取得不可: <理由>` と出し、終了コードは非ゼロにする(ゼロ件と区別する)。

### 4. 手順書(オーナーが行う設定)

`docs/operations/measurement-repair-checklist.md` に次を書く。冒頭に確認事項(Vercel プランで Speed Insights が使えるか)を置く。

- GA4: 自動アクセスの除外(データフィルタ、または内部トラフィック定義)。決済代行2ドメイン(`api3.veritrans.co.jp`・`fep.sps-system.com`)の参照元除外。ChatGPT を AI チャネルとして扱うカスタムチャネル定義。`labola_reserve_complete`(と `_program`)のキーイベント指定。
- PSI API キーの発行と env 登録の手順。
- 設定後の確認方法と、設定前後でスクリプトの出力がどう変わるか(Direct の減少、決済戻りの Referral の減少など)。
- 基準値(修理前の参考): LaBOLA 週カレンダー閲覧→予約情報 約23%(自動アクセス除外後)、ホーム閲覧→予約案内クリック 52%。

`docs/operations/interactive-analysis-runbook.md` には、週次の手順に `npm run analytics:weekly` を足す追記だけを入れる(既存の記述は変えない)。

## ファイル一覧(予定)

| 種別 | パス |
|---|---|
| 変更 | `package.json`(依存1つ・スクリプト1つ)、`package-lock.json` |
| 変更 | `src/app/[locale]/layout.tsx`、`src/app/[locale]/layout.test.tsx` |
| 変更 | `scripts/analytics/query.mjs`、`scripts/analytics/query.test.ts`、`scripts/analytics/fixtures/mockGoogle.mjs` |
| 新規 | `scripts/analytics/hosts.mjs`(+ テスト) |
| 新規 | `scripts/analytics/weekly/`(週集計・突合・テニスベア・CrUX の純ロジックと実行入口、各テスト) |
| 新規 | `docs/operations/measurement-repair-checklist.md` |
| 変更(追記のみ) | `docs/operations/interactive-analysis-runbook.md` |

## テスト方針

- すべて TDD(先にテストを書いて落とす)。カバレッジ 100% を保つ。
- 外部通信は MSW(Google・Notion・テニスベア・PSI)。fetch の直接モックはしない。
- 週の境界(JST・月曜始まり・年またぎ)、台帳の個人情報列を読まないこと(取得する列の指定をテストで固定)、キー無しスキップ、1節の失敗が他に波及しないことをテストで固定する。
- 実行入口は薄い I/O にして、ロジックは関数に分けて注入でテストする。

## 実装中に確認すること

- LaBOLA 各段のページパスの形(GA4 を読み取り専用で引く)。
- テニスベアの申込に `applyDateTime` が入っていない回の扱い(入っていない申込は件数から除き、除いた数を出力に添える)。
- `vitest.config.ts` の除外リストは増やさない。入口ファイルが 100% を保てない場合は司令塔に相談する。
