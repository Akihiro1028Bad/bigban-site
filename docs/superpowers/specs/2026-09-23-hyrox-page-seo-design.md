# /hyrox ページ SEO 改善 設計書

- 日付: 2026-09-23
- 根拠: `docs/reviews/2026-09-23-hyrox-page-seo.md`(分析・競合比較。1本目の PR に含める — §11)
- 対象: `src/app/[locale]/hyrox/**`、`src/components/hyrox/**`、`src/lib/structured-data/**`、`messages/{ja,en}.json`
- 目的: 「千葉 × HYROX ジム」系クエリ(平均 2.7〜4.0 位)を 2 位以内へ。「hyrox 千葉」を /hyrox で受ける。体験会の申込につなげる。

## 1. 方針

- **見た目は大きく変えない**。英語の大見出し(FACILITY など)のデザインは残し、検索エンジンが読む見出しの中身に日本語の検索語を入れる。
- **書くのは確認済みの事実だけ**。公開済み記事・LaBOLA・ニュースで確認できた内容に限る(§10 に出典)。所要分数・認定日など未確認の値は書かない。
- 新しいセクションは既存の見た目(英語の大見出し+日本語の小見出し、黒背景、アクセント色)に合わせる。

## 2. メタデータ(`messages/*.json` の `Metadata.hyrox`)

| 項目 | 変更後(ja) |
|---|---|
| title | `HYROX（ハイロックス）公式トレーニングジム｜千葉・本八幡駅徒歩1分`(テンプレートで末尾に「 \| THE PICKLE BANG THEORY」が付く) |
| description | `HYROX公式トレーニングクラブに認定された、千葉・本八幡駅徒歩1分(JR総武線・都営新宿線)のトレーニングジム。公式8種目対応の器具を常設し、現HYROX日本代表・関吉大亮コーチのクラスも開催。初めての方は体験会(50分・3,000円)から。6:00〜23:00営業。` |

meta keywords は変更しない(Google は順位付けに使わないため)。description の料金・営業時間は §12 の定数から差し込む。

en は同じ内容を英語で(title 例: `HYROX Official Training Club in Chiba | 1 min from Motoyawata Station`)。

## 3. 見出し

- **h1**(`HyroxHero`): 現在の「HYROX」+「ハイロックス」の下に、小さな 1 行 `千葉・本八幡のHYROX公式トレーニングジム` を足し、3 つを 1 つの h1 にまとめる(大きな「HYROX」の見た目は維持。日本語 2 行は span)。
- **h2**: 各セクションの英語見出しと、その下の日本語小見出しを 1 つの h2 に入れる(日本語側は既存の小見出しのスタイルのまま span にする)。日本語側の文言:

| セクション | 英語(維持) | 日本語(h2 に含める) |
|---|---|---|
| 新: 公式認定 | OFFICIAL | HYROX公式トレーニングクラブ |
| Facility | FACILITY | 設備・器具｜HYROX公式8種目に対応 |
| Services | SERVICES | 体験会・クラス・時間貸し |
| What is | WHAT IS HYROX | ハイロックスとは |
| Coach | CREW | コーチ｜現HYROX日本代表 関吉大亮 |
| Program | PROGRAM | 料金｜エリア利用料・体験会・クラス |
| 新: Access | ACCESS | アクセス｜本八幡駅徒歩1分 |
| 新: FAQ | FAQ | よくある質問 |
| PicklePromo | PICKLEBALL | ピックルボール(変更なし) |

## 4. セクションの追加・変更

並び順: Hero → **Official(新)** → Facility → Services → Intro(What is) → Film → Coach → Program → **Access(新)** → **FAQ(新)** → PicklePromo。

### 4.1 Official(新・`HyroxOfficial.tsx`)

短い帯。本文:

> THE PICKLE BANG THEORY は、HYROX公式トレーニングクラブ(HYROX Training Club)に認定されたトレーニングジムです。HYROX公式8種目に対応した器具を常設し、レースと同じ動線でトレーニングできます。

リンク: 「認定のお知らせを読む」→ `/news/hyrox-official-training-gym`(内部・計測 `contentClick` location `hyrox_official_news`)。

公式ジム検索(HYROX Training Finder)のプロフィールへのリンクは**今回は張らない**。2026-09-23 時点のプロフィールは写真が仮画像で説明・営業時間・設備が空のため、飛んだ人に空のページを見せることになる。プロフィールの記入(issue #420)が済んだ後に別 PR で追加する。

### 4.2 Services(`HyroxServices`)

- trial の説明文に料金と所要時間を足す: `初めての方向けの体験会(50分・3,000円)。HYROXの種目と器具の使い方を、スタッフが一通りご案内します。毎月開催しています。ランニングシューズとトレーニングウェアをご持参ください(レンタルはありません)。`
- trial カードに「開催日を見る」リンクを追加 → `/news/hyrox-morning-trial-class-2026`(内部・計測 `contentClick` location `hyrox_services_trial_news`)。既存の「予約する」はそのまま。
- group の説明文の末尾に `関吉大亮コーチの「HYROX TRAINING @ DAISUKE CLASS」は平日夜に開催(1回4,500円)。` を足す。

### 4.3 Program(`HyroxProgram`)

エリア利用料の表の下に「レッスン・クラス(1回あたり・税込)」の小表を足す:

| プログラム | 時間 | 料金 |
|---|---|---|
| HYROX体験会(初めての方) | 50分 | 3,000円 |
| モーニングクラス(器具の基本操作が分かる方) | 60分 | 3,000円 |
| HYROX TRAINING @ DAISUKE CLASS | 60分 | 4,500円 |

注記: `開催日は予約ページのレッスン・クラス一覧でご確認ください。`(リンク → LaBOLA `event/school/`、計測 `reservation` location `hyrox_program_school`)

### 4.4 Access(新・`HyroxAccess.tsx`)

- 住所: 千葉県市川市八幡2-16-6 八幡ハタビル6F
- 電車: JR総武線「本八幡駅」北口から徒歩1分/都営新宿線「本八幡駅」から徒歩3分。都営新宿線なら新宿・市ヶ谷・神保町方面から乗り換えなし。
- 営業時間: 6:00〜23:00(不定休)
- 車: 専用駐車場はありません。近隣のコインパーキングをご利用ください。
- 地図へのリンク: 既存の `GOOGLE_BUSINESS_PROFILE_URL`(施設自身の Google ビジネスプロフィール)を使う。hasMap の座標 URL は §9 のとおり座標に約 500m のずれの疑いがあるため使わない。

### 4.5 FAQ(新・`HyroxFaq.tsx`)

`ReserveFaq` と同じ見た目・同じ仕組み(details/summary、`buildFaqPage` で FAQPage 構造化データ)。質問と回答(ja):

1. **HYROX公式トレーニングクラブとは何ですか?** — HYROXの公式トレーニングプログラムを提供できると認定されたジムです。THE PICKLE BANG THEORY は認定を受け、SkiErg・RowErg・スレッド・ケトルベル・ウォールボール・サンドバッグなど公式8種目に対応した器具を常設しています。
2. **初心者や運動経験が少なくても参加できますか?** — 参加できます。初めての方は、種目の内容と器具の使い方をスタッフが案内する体験会(50分・3,000円)からお申し込みください。器具の基本操作が分かる方はモーニングクラスへどうぞ。
3. **料金はいくらですか?** — エリアの時間貸しは1時間4,980円〜7,980円(4名まで・時間帯により異なる)です。体験会・モーニングクラスは各3,000円、HYROX TRAINING @ DAISUKE CLASSは4,500円です。月額会員「PBT CLUB」なら時間貸しを会員料金で利用できます。
4. **持ち物は何が必要ですか?** — ランニングシューズとトレーニングウェアをご持参ください。シューズとウェアのレンタルはありません。館内には男女別の更衣室があります。
5. **予約はどうすればいいですか?** — オンラインで予約できます。体験会・クラスは予約ページのレッスン・クラス一覧から、時間貸しはHYROXエリアの空き状況からお選びください。
6. **大会に出る予定がなくても利用できますか?** — 利用できます。ランと筋力を組み合わせたトレーニングとして、大会に出ない方も体験会・クラス・時間貸しをご利用いただけます。
7. **駐車場はありますか?** — 専用駐車場はありません。近隣のコインパーキングをご利用ください。本八幡駅から徒歩1分です。

en は同じ内容を英語で。

### 4.6 Facility のウォールボール(2026-09-23 追加)

ターゲットが公式品になったため、設置器具の記載を `メディシンボール 4 / 6 / 9kg・公式ターゲット（HYROX全クラス対応）` に改め、数量を他の器具と同じ「一式」にする。「非公式」の記載はなくす。全器具が数量を持つため、器具データの「数量なし(null)」は型から外す。

## 5. 構造化データ

- `buildExerciseGym` に追加: `address`(SportsActivityLocation と同じ値)、`geo`(同じ定数を再利用。座標のずれは別途確認するため値は変えない)、`telephone`、`openingHoursSpecification`(毎日 06:00〜23:00。§12 の営業時間の定数から作る)、`image`(`/images/hyrox/promo-card.jpg`)、`priceRange`(§12 の料金定数の最小〜最大から作る。現状値で `¥3000-¥7980`)、`description`(ja/en)、`employee: { "@id": "#person-sekiyoshi" }`。住所・座標・電話・営業時間は SportsActivityLocation と**同じ定数を参照**し、二重管理しない(必要なら定数を共通化)。
- 新規 `buildPersonSekiyoshi(locale)`: `@id ${SITE_URL}/#person-sekiyoshi`、name 関吉大亮、alternateName(Daisuke Sekiyoshi、せきよしだいすけ)、jobTitle「HYROX日本代表 / THE PICKLE BANG THEORY メインコーチ」、sameAs instagram tac_monk、knowsAbout HYROX 等。/hyrox ページだけで出力する。
- FAQPage: §4.5 の Q&A を `HyroxFaq` が出力(ReserveFaq と同じ方式)。注: Google の FAQ リッチリザルトは 2023 年以降、政府・医療系サイトに限定されている。構造化データ自体は正しいので入れるが、検索結果に Q&A が表示されることは期待しない。

## 6. 表示速度(LCP)

`HyroxHero` の h1(HYROX/ハイロックス/新しい日本語行)、3 つの動詞、宣言文(「すべてを出し切るための舞台が…」)は、framer-motion の `initial={{ opacity: 0 }}` をやめ、**最初から表示された状態で描画**する(アニメーションなし)。CTA と画像の切替のモーションは維持。実測(2026-09-23、ローカルの本番ビルド・モバイル・CPU 4 倍・Fast 4G)では、モバイルの LCP 要素は宣言文だった。h1 と動詞だけを直した段階では LCP 3,065ms のまま、宣言文も直して 736ms。目標: LCP 3.1 秒 → 2.5 秒未満(モバイル・CPU 4 倍・Fast 4G のトレース)。

## 7. 内部リンク

- /hyrox から出るリンク: 体験会ニュース(§4.2)、認定ニュース(§4.1)、LaBOLA レッスン一覧(§4.3)を追加。What is の段落の既存コラムリンクに加え、参加費ガイド `/columns/hyrox-cost-guide` へのリンク(`大会の参加費と準備の費用を見る`)を足す。
- 記事から /hyrox へのリンクの文言変更は microCMS 側の作業なので本 PR の対象外(別途)。

## 8. テスト

- 既存方針どおり TDD・Vitest + RTL・カバレッジ 100%。
- メタデータ: title/description に指定語が含まれること(ja/en)。keywords は変わらないこと。
- 見出し: h1 のテキストに「HYROX」「ハイロックス」「本八幡」「公式トレーニングジム」、各 h2 に §3 の日本語が含まれること(`getByRole("heading", { level: 2, name: /…/ })`)。
- 新セクション: 文言・リンク先・外部リンク属性・計測 location。
- FAQ: 7 問の表示と FAQPage の mainEntity 件数・内容一致。
- 構造化データ: ExerciseGym の追加フィールドと employee、Person 関吉。SportsActivityLocation と住所・座標・電話が一致すること。
- Hero: h1 と動詞が `opacity: 0` の初期スタイルを持たないこと。
- `page.test.tsx`: StructuredData が Breadcrumb・ExerciseGym・Person を出すこと。

## 9. やらないこと

- 英語見出しのデザイン変更、写真の差し替え、バナー、/reserve の変更。
- 座標の修正(現地確認後に別途)。
- 記事側のアンカー文言(microCMS)。
- 公式ジム検索のプロフィールへのリンク(issue #420 の記入後に別途)。
- meta keywords の変更。

## 10. 出典(書く事実の確認元)

| 事実 | 確認元 |
|---|---|
| 公式トレーニングクラブ認定 | news/hyrox-official-training-gym、HYROX Training Finder の掲載(2026-09-23 確認) |
| 公式トレーニングクラブの定義(公式のトレーニングプログラムを提供できるライセンス制度。器具の有無とは別) | columns/hyrox-cost-guide「練習環境の選択肢」節 |
| 体験会・クラスを毎月開催 | オーナー確認(2026-09-17) |
| DAISUKE CLASS は 60 分・平日夜(水・金の 19:00〜20:00 ビギナーの部/20:00〜21:00 CLASS) | LaBOLA レッスン・クラス一覧(2026-09-23) |
| 本八幡駅北口徒歩1分・都営新宿線徒歩3分・都営新宿線で新宿方面から乗り換えなし | columns/summer-indoor-pickleball-motoyawata、columns/hyrox-cost-guide |
| 営業 6:00〜23:00・不定休、専用駐車場なし、男女別更衣室 | columns/pickleball-ichikawa-guide、columns/pickleball-funabashi-guide |
| 体験会 50分 3,000円、モーニングクラス 60分 3,000円、定員 6 | news/hyrox-morning-trial-class-2026、LaBOLA(2026-09-23) |
| DAISUKE CLASS 平日夜 4,500円 | news/hyrox-morning-trial-class-2026、予約台帳の料金プラン |
| エリア料金 4,980〜7,980円・4名まで・PBT CLUB 会員料金 | 現行 /hyrox の料金表 |
| ウォールボールのターゲットが公式品になった | オーナー連絡(2026-09-23) |

## 11. PR の分け方

リポジトリの決まり(PR の差分は 400 行未満)に合わせ、2 本に分ける。どちらも develop 向け・TDD・オーナーの目視確認後にコミットする。

| PR | 内容 | 設計書の節 |
|---|---|---|
| 1 本目 | 料金・営業時間の定数化(§12)、メタデータ(§2)、見出し(§3)、構造化データ(§5 の ExerciseGym と Person)、表示速度(§6)、ウォールボールの記載修正(§4.6)、分析メモ `docs/reviews/2026-09-23-hyrox-page-seo.md` の追加 | §2・§3・§5・§6・§12 |
| 2 本目 | 新セクション Official・Access・FAQ(§4.1・§4.4・§4.5、FAQPage を含む)、Services と Program の変更(§4.2・§4.3)、内部リンク(§7) | §4・§7 |

2 本目は 1 本目のマージ後に develop から切る。§3 の見出しのうち新セクションのもの(OFFICIAL・ACCESS・FAQ)と、クラス料金表を前提にした Program の日本語見出し(料金｜エリア利用料・体験会・クラス)は 2 本目で入る。1 本目の Program の日本語見出しは `料金｜エリア利用料` とする。

計測の書き方: 本書の計測は `CtaKey`(`src/lib/analytics/events.ts` の `contentClick` / `reservation` / `externalLink` など)と location で書く。GA4 上のイベント名はそれぞれ `content_click` / `reservation_click` / `external_link_click`。

## 12. 料金と営業時間の単一ソース

料金と営業時間は、ページ内の複数箇所(説明文・Services・Program・FAQ・構造化データ・英語版)に出る。**値は定数 1 か所に置き、各所はそこを参照する**。

- HYROX のクラス料金: 既存の `src/constants/pricing.ts`(エリア料金の定数がある)に、体験会・モーニングクラス・DAISUKE CLASS の料金と所要時間を追加する。
- 営業時間(06:00〜23:00): `src/constants/site.ts` に定数を置き、SportsActivityLocation と ExerciseGym の両方から参照する。
- 文言(`messages/*.json`)に金額や時刻を直接書かない。ICU の差し込み(例: `体験会({trialMinutes}分・{trialPrice})`)にして、コンポーネントやメタデータ生成が定数を渡す。
- 構造化データの `priceRange` は定数の最小〜最大から組み立てる。
- テスト: 定数を変えると説明文・FAQ・料金表・構造化データの表示がすべて追従することを 1 本で確かめる。

## 13. 採らなかった案

| 案 | 採らなかった理由 |
|---|---|
| HYROX 専用の新しいページ(例: `/hyrox/gym-chiba`)を作る | /hyrox がすでに「本八幡 × HYROX」で 1 位・表示が伸びている。同じ検索意図の 2 ページ目は評価が割れる(カニバリ)。既存ページを強くする方が早い |
| 英語の大見出しをやめ、日本語の大見出しに置き換える | ブランドの見た目が大きく変わる。英語の見た目は残し、見出しの中身に日本語を含めれば検索エンジンには伝わる |
| FAQPage 構造化データを入れない | Google の FAQ リッチリザルトは表示されないが、構造化データ自体は正しく、他の検索エンジンや AI 検索が質問と回答を読みやすくなる。既存の ReserveFaq の仕組みを流用でき、追加の手間が小さい |
| meta keywords に語を足す | Google は順位付けに使わない。効果のない変更になる |
| 公式ジム検索のプロフィールへ今リンクする | プロフィールが空に近く逆効果になりうる(§4.1) |

## 14. 受け入れ条件

1 本ごとに、次をすべて満たしたら完了とする。

1. `npx vitest run` が全件成功し、変更したファイルのカバレッジが 100%。`npx tsc --noEmit` と lint が通る。
2. 開発サーバーで /hyrox と /en/hyrox を、幅 320・375・768・1440px で表示し、見出し・新セクション・料金表が崩れていない(特に 320〜413px の既知の見出し切れ #411 を悪化させていない)。
3. 公開 HTML で title・description・h1・h2 が §2・§3 のとおり。構造化データを schema.org の検証ツール(validator.schema.org)と Google のリッチリザルトテストで確認し、エラーがない。
4. (1 本目)モバイル・CPU 4 倍・Fast 4G のパフォーマンストレースで LCP が 2.5 秒未満。
5. オーナーが目視で確認し、OK を出してからコミット・PR 作成する。
6. 公開 4 週間後に、「千葉 × HYROX ジム」系クエリの /hyrox のクリック数と平均順位(基準: 直近 28 日で約 40 クリック・平均 2.7〜4.0 位)、「hyrox 千葉」で /hyrox が表示されるか、体験会・クラスの申込数を確認して効果を判定する。
