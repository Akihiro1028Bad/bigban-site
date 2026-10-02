# /hyrox によくある質問(FAQPage)とアクセスを足す(設計書)

- 出典: docs/reviews/2026-09-23-hyrox-page-seo.md §6-A-3(2本目の残り)。認定と体験会は #527 で反映済み
- ブランチ: `feature/szb-hyrox-faq-access`(origin/feature/site-zero-base から)
- 起票: 2026-10-02

## 1. 目的と範囲

「HYROX 千葉 ジム」「本八幡 HYROX」などで着いた人が、費用・初心者可否・持ち物・予約方法・行き方をページ内で解決できるようにする。上位の競合ページに共通する「FAQ と FAQPage」「駅と徒歩分数」を揃える。

### やる
- `HyroxFaq`(よくある質問 7問 + FAQPage 構造化データ)を PROGRAM(料金)の直後に置く。
- `HyroxAccess`(住所・3路線の徒歩分数・営業時間・Google マップへのリンク)を FAQ の直後、PICKLEBALL の前に置く。

### やらない
- 地図の埋め込み(iframe)。重さに対して効果が小さい。Google マップへのリンクで足りる。
- クラス(HYROX SATURDAY/SUNDAY・DAISUKE CLASS)の料金と日程。ニュースでも料金を書かない運用なので LaBOLA の各回ページへ誘導する。
- 開催日(固定ページに日付を書かない運用)。
- 他ジムとの比較。
- 内部リンクのアンカー整理(別 PR)。

## 2. 値の出どころ(文言に直書きしない)

| 値 | 出どころ |
|---|---|
| 体験会の分数・料金 | `buildHyroxDescriptionValues(locale)` の `trialMinutes` / `trialPrice` |
| 営業時間 | 同 `open` / `close` |
| エリア時間貸しの料金幅 | `COURT_PRICES` の `weekday` / `weekend`(非会員)の最小〜最大 |
| 住所・路線・徒歩分数 | `HomeAccess` の messages(postalCode / address / routes / parkingNote / openInMaps)を共有する |
| Google マップ | `GOOGLE_BUSINESS_PROFILE_URL` |

## 3. よくある質問(ja)

1. ここはHYROX公式のトレーニングジムですか？ — はい。THE PICKLE BANG THEORY は、2026年8月にHYROX公式トレーニングクラブ（HYROX Training Club）に認定されました。HYROX公式8種目に対応した器具を常設しています。
2. HYROX（ハイロックス）とはどんな競技ですか？ — 1kmのランニングと8種目のワークアウトを交互に8回ずつ行う、屋内のフィットネスレースです。世界各地で大会が開かれています。
3. 初めてでも参加できますか？ — はい。初めての方向けの体験会（{trialMinutes}分・{trialPrice}）で、HYROXの種目と器具の使い方をスタッフが一通りご案内します。
4. 料金はいくらですか？ — 体験会は{trialMinutes}分・{trialPrice}です。HYROXエリアの時間貸しは1時間あたり{rentalMin}〜{rentalMax}です（4名まで。5名目以降は1名につき+¥1,000）。クラスの料金は、LaBOLAの各回のページでご確認ください。
5. 持ち物は何が必要ですか？ — ランニングシューズとトレーニングウェアをご持参ください（レンタルはありません）。飲み物とタオルもお持ちください。
6. 予約方法を教えてください — 体験会・クラスは、LaBOLAのクラス・スクール一覧からお申し込みください。HYROXエリアの時間貸しは、LaBOLAのHYROXエリアの予約ページから予約できます。お支払いはオンラインの事前決済（クレジットカード・PayPay）です。
7. アクセスと営業時間は？ — JR総武線「本八幡駅」北口から徒歩1分、都営新宿線「本八幡駅」から徒歩3分、京成本線「京成八幡駅」から徒歩5分です。営業時間は{open}〜{close}です。

英語版は同じ7問を同じ値で書く。表示と FAQPage の文面は完全に一致させる(差し込み後の文字列から JSON-LD を作る)。

## 4. テスト

- `HyroxFaq.test.tsx`: 見出し、7問の表示、料金が定数と一致、FAQPage の JSON-LD が表示文面と一致、英語表示。
- `HyroxAccess.test.tsx`: 住所・3路線・営業時間、Google マップのリンク(別タブ・計測 `trackCtaClick("access","hyrox_access")`)、英語表示。
- `HyroxContent.test.tsx`: PROGRAM → FAQ → ACCESS → PICKLEBALL の順。
- `hyroxMessages.test.ts`: `HyroxPage.faq` / `HyroxPage.access` の ja/en キー一致。
