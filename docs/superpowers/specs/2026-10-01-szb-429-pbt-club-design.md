# PBT CLUB 専用ページ新設(szb-429)設計書

- 起票: 2026-10-01 / issue: #429 / ブランチ: `feature/szb-429-pbt-club` / dev ポート: 3209
- 親トラッカー: #513 第2群 T5 / 調査: R3(I10 損益分岐)・R7(恒常情報がニュースにしかない)
- ゴール: 「通う人が会員になる」「比べている人が会員の損得を自分で判断できる」ことで、予約・来場回数を増やす

## 決定済み(オーナー回答 2026-10-01)

1. 新規 `/pbt-club`(英語 `/en/pbt-club` も)を作る。ニュース記事 `/news/pbt-club-membership` は告知として残す
2. 内部リンク(料金表・バナー・HYROX・予約FAQ)のうち、**実コードで付け替え対象なのは `PromoBanner.tsx` と `CourtPriceTable.tsx`(ホーム・HYROX 共用)の定数1行ずつだけ**。予約FAQ は PBT CLUB へのリンク自体が無い(文言のみ)ので対象外
3. 損益分岐は**静的な表**(Server Component)。計算機は作らない
4. 入会ボタンは既存の LaBOLA 入会ページ `https://yoyaku.labola.jp/r/shop/3473/member-types/`(公開ニュース記事の入会ボタンと同一)
5. 他セッション(#428・#421/#431・#509)と接するファイルは**該当行だけの最小差分**

## 載せてよい事実(すべて公開済み記事・既存定数の確定値のみ)

| 項目 | 値 | 出典 |
|---|---|---|
| 月会費 | ¥10,000(税込) | ニュース pbt-club-membership |
| 会員料金の適用上限 | 月20時間まで | 同上 |
| 対象 | ピックルボールコート/HYROXエリア共通・1時間あたり・税込 | 同上 |
| 特典① | コート利用料金 約30%OFF(1時間あたり¥1,480〜¥2,380安い) | 同上 |
| 特典② | 一般予約は14日前から、会員は30日前から(枠の確保を保証するものではない) | 同上 |
| 特典③ | PBTポイント2倍=利用料金の2%還元。ポイントは施設利用などに使える | 同上 |
| 料金 | `COURT_PRICES`(通常/会員 × 平日3時間帯・土日祝) | `src/constants/pricing.ts` |

**書かない**(未確認): 退会・解約の条件、支払日・自動更新、ポイントの有効期限、会員証の発行方法。FAQ では「最新の条件・お手続きは LaBOLA の入会ページでご確認ください」と案内するにとどめる。

## ページ構成(上から)

1. **ヒーロー**: 見出し「PBT CLUB」、月額¥10,000(税込)・会員料金 ¥3,500〜¥5,600、入会ボタン(LaBOLA)
2. **3つの特典**: 約30%OFF / 30日前から先行予約 / ポイント2倍(2%還元)
3. **損益分岐**: 時間帯ごとに「月○時間以上使うなら会員がお得」を確定料金から自動計算して表示
4. **会員料金表**: 通常料金・会員料金・1時間あたりの差額(`COURT_PRICES` を流用)
5. **月の支払額の比較例**: 平日17時以降・土日祝で 4時間/5時間/8時間(記事と同じ前提・同じ数字)
6. **向いている人・向かない人**
7. **入会ボタン**(下部)
8. **FAQ**(月20時間上限・予約開始日・適用範囲・ポイント・入会方法)。FAQPage 構造化データ付き

## 損益分岐の計算

`損益分岐時間 = 月会費 ÷ (通常料金 − 会員料金)`(レンタル用品・ポイント還元は含めない。記事と同じ前提)

| 時間帯 | 通常 | 会員 | 差額/時 | 損益分岐(正確) | 表示「月○時間以上で会員がお得」 |
|---|---|---|---|---|---|
| 平日 17:00-23:00・土日祝終日 | ¥7,980 | ¥5,600 | ¥2,380 | 約4.2時間 | 5時間以上 |
| 平日 9:00-17:00 | ¥5,980 | ¥4,200 | ¥1,780 | 約5.6時間 | 6時間以上 |
| 平日 6:00-9:00 | ¥4,980 | ¥3,500 | ¥1,480 | 約6.8時間 | 7時間以上 |

- 「以上」は**整数時間に切り上げ**た値(4時間は通常の方が¥480安く、5時間で会員が¥1,900安い、という記事の表と矛盾させないため)。「約4.2時間」は補足として小さく併記する
- 土日祝終日は¥7,980/¥5,600で平日夜と同額なので1行にまとめる(行ラベルは「平日 17:00〜23:00 / 土日祝 終日」)
- 注記: 時間帯をまたいで使う場合はそれぞれの料金で計算してください(記事と同じ文言)。会員料金の適用は月20時間まで

## 設計

### ルーティング・メタデータ
- `src/app/[locale]/pbt-club/page.tsx`: Server Component。`generateMetadata`(title/description/canonical/alternates ja・en・x-default、`buildPageOpenGraph`)、`StructuredData`(`buildBreadcrumb`)、`setRequestLocale`、`notFound()` は reserve/hyrox と同じ型
- `HomeNavigation` / `HomeFooter` で囲む(reserve ページと同じ)
- `src/constants/routes.ts` の `SITEMAP_ROUTES` に `/pbt-club`(priority 0.7・monthly)を追加。**`sitemap.test.ts` の件数(14)が 16 になる**。他セッションも同じ箇所を触るため、rebase で衝突したら件数だけ合わせる
- ナビ・フッターへの項目追加は**行わない**(他セッションと衝突しやすい。入口の置き方は司令塔・#428 と調整)

### 純ロジック(テストで担保)
- `src/constants/pbtClub.ts`(新規): `PBT_CLUB_PATH = "/pbt-club"`、`PBT_CLUB_MONTHLY_FEE_YEN = 10000`、`PBT_CLUB_MONTHLY_HOUR_CAP = 20`、`PBT_CLUB_ADVANCE_BOOKING_DAYS = { general: 14, member: 30 }`、`PBT_CLUB_POINT_RATE_PERCENT = 2`、`LABOLA_MEMBER_TYPES_URL`
- `src/lib/pbtClub/breakeven.ts`(新規): `parseYen("¥4,980") → 4980`、`buildBreakEvenRows(COURT_PRICES, fee)`(行の統合・差額・正確な損益分岐・切り上げ時間)、`buildMonthlyComparison(hours, normalYen, memberYen, fee)`(4/5/8時間の表)。料金は `pricing.ts` の文字列から**パース**して、定数を二重に持たない(料金が変われば自動で追従)
- 不正入力(差額0以下・パース不能)は例外を投げてビルドで気づけるようにする

### コンポーネント(`src/components/pbt-club/`)
- `PbtClubHero` / `PbtClubBenefits` / `PbtClubBreakEven` / `PbtClubRates` / `PbtClubComparison` / `PbtClubFit` / `PbtClubJoinCta` / `PbtClubFaq`
- データを描く部分は **Server Component**。出現アニメーション(既存の `whileInView` + `once`、`prefers-reduced-motion` 対応)は葉の小さな client wrapper `PbtClubReveal` だけに閉じ込める
- 見た目: 既存ページ(reserve/hyrox)の語彙に合わせる(deep-black・accent=#C8FF00・`text-xs tracking-[0.3em] text-accent` の見出し・`max-w-7xl`・`pt-[calc(7rem+var(--promo-banner-h))]`)。表はスマホで横スクロール可
- 入会ボタンは `<a>` の外部リンク(`rel="noopener noreferrer"`・`target="_blank"`)。計測は既存の `trackCtaClick("externalLink", "pbt_club_join_hero" | "pbt_club_join_bottom", ...)`。**新しい GA4 イベント名は作らない**(#505 の範囲)
- 料金を確認した人向けに、ヒーロー下かページ末尾に「まずはコートを予約する」(`RESERVE_PATH`、`trackCtaClick("reserveEntry", ...)`)の副導線を1つ置く

### 文言(messages)
- `messages/ja.json` / `en.json` に新規トップレベル `PbtClub`(ページ本文)と `Metadata.pbtClub`(title/description)を**追加のみ**(既存キーの整形・並べ替えはしない)。ほかに `PromoBanner.ariaLabelPbtClub` の文言を「ニュース記事へ移動」→「PBT CLUB のページへ移動」に変更(1行ずつ)
- 英語版は同じ事実の直訳。金額表示は日英とも `¥` 表記で統一(`CourtPriceTable` と同じ)

### 内部リンクの付け替え(最小差分)
- `PromoBanner.tsx`・`CourtPriceTable.tsx`: `const PBT_CLUB_NEWS_PATH = "/news/pbt-club-membership"` と古いコメントを、`PBT_CLUB_PATH` の import に置き換える(各2〜3行)
- 付け替えに合わせて `PromoBanner.test.tsx` / `HomePricing.test.tsx` / `HyroxProgram.test.tsx` / `CourtPriceTable.test.tsx` の `href` の期待値(`/pbt-club`)だけを更新

### 変更案リスト(microCMS 本番・外部。**このブランチでは触らない**)
- ニュース記事 `pbt-club-membership`(日英): 冒頭か末尾に「最新の料金・特典は専用ページ /pbt-club をご覧ください」のリンクを足す。英語版は題が「8月1日開始」のままなので、日本語版(9/17改稿)に合わせる(#511 とも関係)
- ホーム販促バナーの行き先は今回のコード変更で /pbt-club になる(microCMS 側の対応は不要)

## テスト方針(TDD・カバレッジ100%)
- `breakeven.test.ts`: パース、行の統合(平日夜と土日祝が1行になる)、切り上げ(4.2→5、5.6→6、6.8→7)、記事の比較例(4h: 31,920/32,400、5h: 39,900/38,000、8h: 63,840/54,800)との一致、差額0以下・パース不能で例外
- 各コンポーネント: 見出し・表の行・入会リンクの `href`/`rel`/`target`・計測呼び出し・FAQ の `details`・日英の文言(`getByRole`)
- `page.test.tsx`: reserve と同じく `generateMetadata`(canonical/alternates/OG)・不正 locale で `notFound`・構造化データ
- 既存: `pageOpenGraphContract.test.ts`(新ページも自動で対象)・`sitemap.test.ts`(件数更新)

## 範囲外(やらない)
- 損益計算機(JS)、会員数・実績の数字帯(#429 の範囲外)、ナビ・フッターへの項目追加、#428「はじめての方へ」への導線(入口の置き方は司令塔と調整のうえ、別途)
- LaBOLA 側の入会ページの文言変更・GA4 の設定(オーナー作業)

## 未確定・司令塔へ確認したい点
1. 損益分岐の表示を「**5時間以上**(補足: 約4.2時間)」の形にする案でよいか(調査 R3 の「約4.2時間」と整数切り上げの併記)
2. ナビ・フッターへの追加は、#428 の入口確定後に司令塔が別途決める扱いでよいか
