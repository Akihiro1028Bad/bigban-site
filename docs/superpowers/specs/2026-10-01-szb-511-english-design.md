# 英語版の行き止まりを塞ぐ(szb-511 / issue #511)

- 日付: 2026-10-01
- ブランチ: `feature/szb-511-english`(`origin/feature/site-zero-base` から)
- 目的: 英語話者が途中で行き止まりにならず、予約の入口まで進めるようにする
- 司令塔経由のオーナー回答(2026-10-01)で確定済み: 言語切替は案A、最新ニュースは案A(30日に確定)、404リンクは変更案リスト

## 範囲と非範囲

| やる(コード) | やらない |
|---|---|
| 言語切替の404 | microCMS 本番の記事本文の修正(変更案リストで渡す) |
| 空の `/en/columns` を noindex・ナビ・sitemap から外す | 英語コラムの新規執筆 |
| 英語ページの和文ラベルの訳(`messages/en.json` の該当行のみ) | `messages/*.json` の整形・他 issue の行 |
| 英語ホームの最新ニュース帯の出し分け | LaBOLA・テニスベア側の英語化(できない) |
| `/en/reserve` の「日本語のみ」明記と英語ミニ手順 | 料金・営業時間表記の変更(#506 の範囲) |

## 1. 言語切替(案A)

現状: `HomeNavigation.handleSwitchLocale` は `router.push(pathname, { locale })` で同じパスのまま言語だけ変える。日本語だけの詳細記事22本のうち英語版のない18本で `/en/...` が404になる。

設計:
- 新しい純関数 `resolveLocaleSwitchPath`(`src/lib/i18n/localeSwitch.ts`)。引数: セクション(`"news" | "columns"`)、相手言語版が存在するか、相手言語でコラムを出すか。戻り値: 相手版が存在すれば `undefined`(従来どおり同じパス)、なければ相手言語の一覧パス(`/news`)。コラム詳細で相手言語にコラムが無い場合は `/news`(空の一覧に飛ばさない)。
- `HomeNavigation` に任意の `localeSwitchPath?: string` を追加。指定時だけ `router.push(localeSwitchPath, { locale })`。未指定は従来どおり。
- `news/[slug]/page.tsx` と `columns/[slug]/page.tsx` は、すでに相手言語版の有無を `generateMetadata` で調べている。同じ問い合わせ(microCMS タグキャッシュ済み)をページ本体でも行い、結果を渡す。

## 2. 空の `/en/columns`

- `shouldShowColumns(locale)`(`src/lib/columns/visibility.ts`): `isCmsColumnsEnabled()` かつ(`ja`、または英語コラムが1本以上)。英語コラムが入れば自動で復活する。
- ナビ・フッターの `showColumns` を、各ページで `isCmsColumnsEnabled()` から `await shouldShowColumns(locale)` に差し替える(約12か所)。
- `/en/columns` 一覧: 英語0件なら `robots: { index: false, follow: true }`。日本語 `/columns` の hreflang(`languages`)からは英語の URL を外す。
- `sitemap.ts`: 英語コラムが0件のとき `/en/columns` を載せず、日本語一覧は hreflang なしの単独エントリにする。

## 3. 英語ニュースの404リンク

なお、英語の HYROX ページにある入門コラムへの内部リンク(`/en/columns/hyrox-beginners-guide` = 404)は、`HyroxIntro` の `showColumnLink` を `shouldShowColumns(locale)` に揃えることでコード側で消える(2章の差し替えに含む)。

`hyrox-official-training-gym`(英語版)の本文が `/en/columns/hyrox-beginners-guide`(404)へリンクしている。本文は microCMS なのでコードでは直さず、変更案リスト(司令塔へ渡す)に載せる。案: 英語版から該当リンクを外す、または日本語コラム `/columns/hyrox-beginners-guide` を指す。

## 4. 英語ページの和文ラベル

`messages/en.json` の該当行だけを訳す(`ja.json` の英語側ミラーは触らない)。

| キー | いま | 変更後 |
|---|---|---|
| `Navigation.reserveJa` | 予約 | 空(英語では副題を出さない)。コンポーネントは空文字なら出さない(既存の `conceptJa: ""` と同じ規約) |
| `HomeFooter.brandJa` | THE PICKLE BANG THEORY ／ ザ ピックルバン セオリー | 空にして出さない |
| `Reserve.calendar.tabs.pickleball` | ピックルボールコート | Pickleball Court(表示ラベルのみ。LaBOLA の `tab_name` は `site.ts` の定数で別管理) |
| `HyroxPage.facility.equipment.*.nameJa` | スキーエルゴ ほか6件 | SkiErg / Rowing machine / Sled / Kettlebell / Wall ball / Sandbag |
| `HyroxPage.services.items[].titleJa` | 時間制レンタル ほか3件 | Hourly rental / Trial session / Group session |
| `HyroxPage.coach.nameKana`・`nameEn` | 関吉大亮(2行とも) | 空にして出さない(`name` が DAISUKE SEKIYOSHI) |
| `HyroxPage.coach.achievements[].disciplineJa` | ハイロックス ほか2件 | HYROX / Spartan Race / Triathlon |
| `HyroxPage.picklePromo.kickerJa`・`titleJa` | メイン施設・ピックルボール | Main facility / Pickleball |

- 日本語ページの表示は変えない。コンポーネントは「空文字なら出さない」だけを足す。
- 回帰防止: `src/i18n/enLeak.test.ts` が `en.json` の全文字列を走査し、日本語文字が1つでもあれば失敗する(許可は `Reserve.englishGuide.` 配下のみ。LaBOLA の日本語ボタン名「ビジターで予約」などを英語ページで引用するため)。調査 R2 にあった「pleasecontact us」の語間欠落は現在の `messages/en.json` に見当たらない(描画側で連結されている可能性があるため、実装時に `/en/reserve` を目視して確認する)。

## 5. 英語ホームの最新ニュース(案A)

- 定数 `LATEST_NEWS_FRESH_DAYS = 30`(`src/constants/news.ts`)。
- `HomeLatestNews`: 英語で、取得した記事のうち公開から30日以内のものが1本もなければ `null`(帯ごと非表示)。日本語の挙動は変えない。現在時刻は引数で注入してテストする。
- 注意: 英語の最新記事は2026-08-17(45日前)なので、30日では実装した時点で帯が非表示になる。英語記事を CMS に足せば自動で復活する。

## 6. `/en/reserve` の英語案内

新コンポーネント `ReserveEnglishGuide`(英語のときだけ描画。予約カードの直下)。

- 見出し: 「Booking in English」。冒頭に「LaBOLA(court / HYROX / lessons)と Tennis Bear(events)の画面は日本語のみです」。
- LaBOLA の手順(2026-09-30 の画面確認で見えた語だけ使う。日本語ボタン名は「」付きで併記):
  1. 新しいタブで LaBOLA のカレンダーが開く(日本語)。空き枠(〇)をタップ。
  2. 最初に出るのはログイン画面。アカウントは不要。画面の一番下までスクロールして「ビジターで予約」(Reserve as a visitor)をタップ。
  3. STEP1「予約内容」: 終了時刻の選択、オプション(パドルのレンタル、HYROX エリアの人数追加)、料金の確認。
  4. 以降の入力・支払い・確認(STEP2〜4)。支払いは「online prepayment (credit card or PayPay)」。入力項目の細部は未確認のため書かない。
- Tennis Bear(イベント): 「ページは日本語のみ。イベント名・日付・料金の欄を見て申し込む」程度に留め、画面の細部は書かない(未確認)。
- 困ったとき: サイトの問い合わせフォーム+Instagram DM を併記(電話番号は載せない方針)。
- 数字(料金・パドル6本・営業時間)は既存の確定値のみ。キャンセルは「LaBOLA の規定が正」。
- 英語の文面は `messages/en.json` の `Reserve.englishGuide` に追加(該当ブロックだけ。他の行は整形しない)。

## 7. テスト(TDD・カバレッジ100%)

追加・変更の単体テスト: `resolveLocaleSwitchPath` の全分岐、`shouldShowColumns`、`HomeNavigation`(`localeSwitchPath` 指定時と未指定時)、`HomeLatestNews`(30日境界・英語のみ・日本語不変)、`columns` 一覧の noindex・hreflang、`sitemap`(英語0件・1件以上)、`ReserveEnglishGuide` の描画、各コンポーネントの空文字非表示、`enLeak`。E2E は新設せず、dev サーバーでの目視(375px・1440px)を証跡にする。

## 8. 変更案リスト(司令塔へ渡す・コードではやらない)

- 英語ニュース `hyrox-official-training-gym` の404リンクの付け替え(microCMS 本番。公開は人間)。
- 英語版 PBT CLUB の記事題が「8月1日開始」のまま(日本語は9/17改稿済み)。
- 参考: LaBOLA 公開ページの設備欄に「シャワー室」「駐車場」が載っている(確定事実は「シャワーなし・専用駐車場なし」)。`/en/reserve` の営業時間表記「irregular holidays」も確定事実(年中無休)と食い違う。いずれも #506 の範囲なので、このブランチでは触らない。
