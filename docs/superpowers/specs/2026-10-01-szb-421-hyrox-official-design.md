# /hyrox に公式トレーニングクラブ認定と体験会の申込導線を足す(設計書)

- issue: #421(トラッカー #513 の T7)
- ブランチ: `feature/szb-421-hyrox-official`(origin/feature/site-zero-base から)
- 起票: 2026-10-01

> **2026-10-02 変更(オーナー決定)**: 開催日は /hyrox に出さない。固定ページには日付を書かない運用(2026-09-17 の A案)に揃えるため。日付の定数(`HYROX_TRIAL_DATES`)と判定関数(`hyroxTrialSchedule.ts`)は作らず、カードには「開催日は、お知らせとLaBOLAでご案内しています。」と、体験会の告知ニュース `/news/hyrox-morning-trial-class-2026` へのリンク(日本語のみ・`content_click` の location は `hyrox_trial_schedule`)を置く。以下の本文のうち日程の表示・自動消去・毎月の更新に関する記述は、この変更で置き換える。範囲(アクセス・FAQ・料金表は別 PR)は変えない。

## 1. 目的と範囲

「HYROX 練習 ジム」「本八幡 HYROX」で /hyrox に着いた人が、(1) ここが HYROX 公式のトレーニングクラブだと分かり、(2) 体験会の料金・所要時間・次回の日程を見て、(3) そのまま申し込める状態にする。

### やる
- Hero 直下に新セクション `HyroxTrial`(認定 + 体験会)を1つ足す。
- 体験会の料金・所要時間は `HYROX_LESSON_PRICES.trial` を単一ソースにする。
- 次回の開催日は定数に確定分だけ持ち、過ぎた日は自動で消す。0件なら「お知らせ・LaBOLA でご確認ください」に切り替える。
- 申込は LaBOLA のクラス・スクール一覧(`LABOLA_SCHOOL_URL`)へ直リンク。

### やらない(オーナー・司令塔確認済み)
- HYROX Gym Finder へのリンク(#420 のプロフィール記入が済むまで張らない)。
- アクセス・FAQ・料金表(別 issue)。
- Hero の tagline など既存文言の変更(他 issue と衝突させない)。
- Services の体験カード(「予約する」→ /reserve?tab=hyrox)。#431・#510 との境界のため触らない。
- 英語版の日程以外の独自文言づくり(英語は日本語と同じ構造で併記する)。

## 2. 確定事実(設計に使う値)

| 項目 | 値 | 出典 |
|---|---|---|
| 認定の呼び方 | 「HYROX公式トレーニングクラブ(HYROX Training Club)に認定」、本文中に「公式トレーニングジム」を1回併記 | オーナー回答 2026-10-01 |
| 認定時期 | 2026年8月(月まで) | オーナー回答 / ニュース 2026-08-03 |
| 体験会 | 50分・3,000円(`HYROX_LESSON_PRICES.trial`) | `src/constants/pricing.ts` |
| 持ち物 | ランニングシューズ・トレーニングウェア。貸出なし | /hyrox の既存文言・ニュース |
| 確定開催日 | 10/4(日)・17(土)・18(日)・24(土) | ニュース hyrox-morning-trial-class-2026 |
| 申込先 | LaBOLA クラス・スクール一覧 | `LABOLA_SCHOOL_URL` |
| 認定ニュース | `/news/hyrox-official-training-gym` | 公開済み |

定員・開始時刻・受付開始日は月ごとに変わりうるので、サイトには書かない(ニュースと LaBOLA に任せる)。

## 3. 構成

```
src/
  constants/hyroxTrial.ts            // HYROX_TRIAL_DATES(確定開催日。JST の暦日 "YYYY-MM-DD")
  lib/hyroxTrialSchedule.ts          // getUpcomingTrialDates(now, dates): JST で今日以降の日だけ返す純関数
  components/hyrox/HyroxTrial.tsx    // "use client"。見出し・認定の一文・体験会カード・日程・CTA
  app/[locale]/hyrox/HyroxContent.tsx// <HyroxTrial upcomingDates=.../> を Hero の直後に1行足す
messages/ja.json, en.json            // HyroxPage.trial(新規キー。他のキーは触らない)
```

### 3.1 `hyroxTrial.ts` / `hyroxTrialSchedule.ts`
- `HYROX_TRIAL_DATES` は昇順・重複なしの `"YYYY-MM-DD"` の `readonly string[]`。毎月の更新はここ1か所(コード変更)。
- `getUpcomingTrialDates(now = new Date(), dates = HYROX_TRIAL_DATES)`: JST の「今日」を求め、その日以降(当日を含む)の日付だけ返す。当日分はその日の終わりまで残す(同日の締め切りは LaBOLA が正)。
- 日付は暦日文字列で扱い、タイムゾーンは Asia/Tokyo 固定(`promoSchedule.ts` と同じく閲覧者のローカル TZ に左右されない)。

### 3.2 サーバー側で日程を決める
`HyroxContent`(サーバーコンポーネント)で `getUpcomingTrialDates()` を呼び、`string[]` を `HyroxTrial` に props で渡す。クライアント側で `Date.now()` を見ないので、ISR のキャッシュ HTML との水和ずれが起きない(`HyroxCampaign` はクライアントで時刻を見ているが、同じ作りは避ける)。#431 が `page.tsx` に足す `revalidate = 3600` により、日付の切り替わりは最大1時間遅れで反映される。

### 3.3 `HyroxTrial` の表示
上から:
1. 見出し(`HyroxSectionTitle`): 英 `OFFICIAL` / 日 `HYROX公式トレーニングクラブ認定・体験会`
2. 認定の一文: 「THE PICKLE BANG THEORY は、2026年8月に HYROX公式トレーニングクラブ(HYROX Training Club)に認定されました。HYROX公式トレーニングジムとして、公式8種目に対応した器具を常設しています。」
3. 体験会カード: 「体験会」・「{minutes}分・{price}」・説明1文(種目と器具の使い方をスタッフが案内)・持ち物の注記。
4. 次回の開催日(2状態):
   - 日程あり: 「次回の開催日」+ `10月4日(日)・10月17日(土)…`(`<time dateTime>` で囲む)。日付の整形は UTC 固定の `Intl.DateTimeFormat`(暦日だけなので TZ ずれなし)。
   - 0件: 「次回の日程はお知らせ・LaBOLA でご確認ください」。
5. CTA: 主「体験会を予約する」(LaBOLA クラス・スクール一覧、別タブ、`sr-only` で新しいタブの旨)、副「認定のお知らせを読む」(`/news/hyrox-official-training-gym`)。

計測は `ReserveChoice` の LaBOLA クラス導線と同じ作法: 主 CTA は `trackCtaClick("reservation", "hyrox_trial", ラベル)` + `trackLabolaEntry("program")`、副 CTA は `TrackedLink`(`contentClick`, `hyrox_trial_news`)。

モーションは他セクションと同じ `whileInView` + `once: true` を、見出し・カードなどのブロック単位でかける。`revealInitial` で reduced-motion のときは動かさず最初から表示する。Hero(`min-h-screen`)の直下なので LCP 要素にはならない。

### 3.4 文言(`HyroxPage.trial`)
金額・分数は ICU の差し込み(`{minutes}`・`{price}`)で、値は既存の `buildHyroxDescriptionValues(locale)`(`trialMinutes`・`trialPrice`)から渡す。ja・en で同じキー構造にし、既存の i18n 整合テスト(`hyroxMessages.test.ts`)に乗せる。他セクションのキーは触らない。

## 4. 他 issue との境界

- #431(NEXT RACE): `HyroxProgram` の直前に置く。こちらは Hero 直後なので位置は競合しない。`HyroxContent.tsx` の差分は「import 1行 + props 計算1行 + JSX 1行」に抑える。`page.tsx` は触らない。
- #510(未経験者向けピックル体験会): HYROX の体験会とは別。このセクションにピックルの体験は載せない。
- #428・#509: LaBOLA の URL 組み立てを変える場合は `LABOLA_SCHOOL_URL` の定義側で行われるので、こちらは定数参照のまま追従する。
- #420(Finder プロフィール): 完了後に副リンクを1つ足す(別 PR)。

## 5. テスト(TDD、Red → Green)

- `hyroxTrialSchedule.test.ts`: JST 境界(前日 23:59 / 当日 00:00 / 当日 23:59 / 翌日 00:00)、全件過去で空、順序の保持、`now` 省略時の動作。
- `hyroxTrial.test.ts`(定数): 日付が `YYYY-MM-DD` として実在し、昇順・重複なし。
- `HyroxTrial.test.tsx`: h2 の名前、認定の文言(「トレーニングクラブ」「2026年8月」「公式トレーニングジム」)、料金・分数が `HYROX_LESSON_PRICES` と一致、日程あり/なしの2状態、主 CTA の href(`LABOLA_SCHOOL_URL`)・別タブ属性・計測の呼び出し、副 CTA の href と計測、en ロケールの描画。
- `HyroxContent.test.tsx`: `HyroxTrial` が Hero の直後(Facility の前)に並ぶ。日程が過ぎた日付でも壊れない。
- 既存の `hyroxMessages.test.ts` が ja/en のキー構造一致を担保。
- カバレッジ 100%、`vitest.config.ts` の除外追加・`istanbul ignore`・`.only/.skip` は使わない。

## 6. 検証・証跡

`npm run test:coverage` / `npm run lint` / `npx tsc --noEmit` / 必要なら `npm run build`。ポート 3210 の dev サーバーで /hyrox を 375px と 1440px でスクリーンショット(日程あり状態と、日付を一時的に過ぎた状態の両方)。保存先は `.superpowers/evidence/szb-421/`。

## 7. 変更案リスト(司令塔・オーナー向け、コード外)

- 毎月、体験会の日程が確定したら `src/constants/hyroxTrial.ts` の日付を更新する(ニュースの開催概要と一致させる)。
- Gym Finder のプロフィール記入(#420)後に、Finder へのリンクを足す。
- 英語の日程表記は日本語と同じ日付を使う。

## 8. リスクと未確定

- 日程の更新を忘れても、過ぎた日は自動で消えて「お知らせ・LaBOLA」の案内に落ちるので、誤情報は残らない(古い情報が出続けない)。ただし新しい日程は出ないので、毎月の更新が運用に入る。
- 新しい依存の追加なし。
