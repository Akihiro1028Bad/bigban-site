# /hyrox「NEXT RACE」セクション 設計書(issue #431)

- 起票: 2026-10-01 / ブランチ: `feature/szb-431-hyrox-next-race` / dev ポート 3211
- ゴール: 大会前の練習需要を /hyrox の時間貸し料金・予約へつなぐ(予約完了の増加)

## 決定済み(オーナー回答 2026-10-01)

- 表示するのは「次の大会」**1つ**: 大会名・開催地・日付・残り日数 + **ボタン1つ**で同ページの料金・予約(`HyroxProgram`)へ。
- 大会が終わったら自動で次の大会に切り替わり、全大会が終わったらセクションごと非表示。
- 大会日程は HYROX 公式で突き合わせてから載せる。
- 置き場所: `HyroxProgram` の直前(#421 は Hero 直下に `HyroxTrial` を作るため衝突しない)。

## 大会データ(HYROX 公式イベントページで確認済み、2026-10-01)

| id | 大会名 | 日程 | 会場 | 出典 |
|---|---|---|---|---|
| osaka-2027 | BYD HYROX Osaka | 2027-01-21〜25 | INTEX Osaka(大阪市住之江区) | https://hyrox.com/event/byd-hyrox-osaka/ |
| nagoya-2027 | HYROX Nagoya | 2027-04-16〜18 | Port Messe Nagoya(名古屋市港区) | https://hyrox.com/event/hyrox-nagoya/ |

ROXNOW の大会カレンダー(2026-09-02 更新)とも日程が一致。

**載せないもの**: チケットの販売状況(公式ページは大阪を「購入可」と表示するが、実態は完売との記録があり食い違う。名古屋は販売開始日が TBC)・参加費・所要時間。日程・会場・公式ページへのリンクだけ。

## アーキテクチャ

| 単位 | 役割 | 依存 |
|---|---|---|
| `src/constants/hyroxRaces.ts` | 大会の一覧(`id` / `startDate` / `endDate` を JST の `YYYY-MM-DD`、公式 URL)。大会を足す・直すのはここだけ | なし |
| `src/lib/hyroxRaces.ts` | 純関数。`getNextHyroxRace(now)`(最終日の JST 終わりまでが「次」。過ぎたら次の大会、無ければ `null`)、`getRaceStatus(race, now)`(`upcoming` + 残り日数 / `ongoing`)、`formatRaceDates(race, locale)`(固定の語彙で自前に組み立てる。`Intl` は ICU の版でブラウザとサーバーの出力が揺れ、ハイドレーション不一致の原因になるため)、`currentTimeMs()` / `currentJstDayStartMs()` | constants |
| `src/components/hyrox/HyroxNextRace.tsx` | 表示。`"use client"`(framer-motion・`useTranslations`)。props は `initialNowMs: number` のみ | lib, messages |
| `HyroxContent.tsx` | `HyroxProgram` の直前に差し込む。`initialNowMs` は Server Component 側の `Date.now()` | — |
| `HyroxProgram.tsx` | ルート `<section>` に `id="program"` を追加(ボタンのアンカー先)。これ以外は触らない | — |
| `messages/{ja,en}.json` | `HyroxPage.nextRace.*` を末尾に追加(既存キーは整形しない) | — |

### 日付の境界(`promoSchedule.ts` と同じ流儀)

- すべて JST の暦日で比較する(閲覧者のローカル TZ に依存しない)。`now` に +9h して UTC の年月日として扱う。
- 「開催まで あと N 日」= 開始日 − 今日(暦日差)。開始日当日〜最終日は「開催中」。最終日の翌日 JST 0:00 に次の大会へ。

### 静的 HTML が古くなる問題への対処

`/hyrox` は静的生成のため、`Date.now()` をレンダリング中に使うと HTML が固定される(既存の `HyroxCampaign` も同じ前提)。

- Server Component が渡す `initialNowMs` を `useSyncExternalStore` の **server snapshot** にして、サーバー描画とハイドレーションを決定的にする(不一致なし)。
- ブラウザ側の snapshot は `currentJstDayStartMs()`(現在の JST 暦日の始まり。1日のあいだ値が変わらない)。ハイドレーション後に残り日数・大会の切り替えが正しくなる。`useEffect` + `setState` や描画中の `Date.now()` は React の lint(`set-state-in-effect` / `purity`)に反するため使わない。
- クローラが見る HTML も古くなりすぎないよう、`page.tsx` に `export const revalidate = 3600` を足す(1行)。**司令塔に確認したい点**。

## 表示内容(ja)

- 見出し: `NEXT RACE` / `次のHYROX大会`(`HyroxSectionTitle` を再利用)。
- カード: 大会名(固有名詞なので en も同じ)/ 開催地・会場 / 日付 / 「開催まで あと N 日」または「開催中」。
- 本文1行: 「HYROX公式8種目に対応したトレーニングエリアで、大会に向けた練習ができます。」(`HyroxProgram` の既存の注記と同じ事実のみ)。
- ボタン: 「練習エリアの料金を見る」→ `#program`。クリックで `trackCtaClick("contentClick", "hyrox_next_race", "program")`。
- 小さなテキストリンク: 「大会の公式ページ(HYROX)」→ 公式イベントページ(外部、`rel="noopener noreferrer"`)。**ボタン1つの原則の例外なので司令塔に確認したい点**。
- 注記: 「日程・販売状況は HYROX 公式サイトの発表をご確認ください。」(販売状況は断定しない)。
- en: 同じ構成の英訳。日付は `Jan 21–25, 2027` 形式。

## アクセシビリティ・動き

- `section` + `h2`(`HyroxSectionTitle`)。ボタンは `<a href="#program">`(ページ内リンク)。
- 動きは既存セクションと同じ `whileInView` の fade-up(`once: true`)。`prefers-reduced-motion` は既存の MotionConfig に従う(他の hyrox セクションと同じ扱い)。
- 配色は /hyrox の既存トークン(`text-light` / `text-gray` / `accent`)。新しい色は足さない。

## テスト(TDD、カバレッジ100%)

- `hyroxRaces.test.ts`: 境界(最終日 JST 23:59:59 はまだ「次」/ 翌日 0:00 で切り替わる)、残り日数(前日=1・当日=開催中)、全大会終了で `null`、データの整合(日付形式・開始≦終了・昇順・id 重複なし)、`formatRaceDates` の ja/en。
- `HyroxNextRace.test.tsx`: 見出し、大会名・日付・残り日数、開催中表示、全終了で何も描画しない、ボタンが `#program`、クリックで計測呼び出し、公式リンク属性、マウント後の時刻更新、en 表示。
- `HyroxContent.test.tsx`: `HyroxProgram` の直前に並ぶこと。`HyroxProgram.test.tsx`: `id="program"`。
- E2E は既存の /hyrox の範囲(新規なし)。

## やらないこと(YAGNI)

- 複数大会の一覧・チケット状況・参加費・練習プラン・カウントダウンの秒表示・Event の構造化データ。
- 新しい依存の追加なし。`messages` の既存キーの整形なし。

## 運用メモ

大会日程が公式で変わった場合は `src/constants/hyroxRaces.ts` を直す。2027年4月の名古屋終了後は、大会を追加しない限りセクションは自動で消える。
