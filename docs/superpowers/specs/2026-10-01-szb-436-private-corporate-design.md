# 貸切・法人ページ + 問い合わせ種別「貸切・法人」追加 設計書

- 起票: 2026-10-01 / issue: Akihiro1028Bad/bigban-site#436(トラッカー #513 第3群 T10)
- ブランチ: `feature/szb-436-private-corporate`(origin/feature/site-zero-base から)
- 期限: 忘年会シーズン前(11月)
- 根拠: `docs/research/2026-10-site-zero-base/` の R2 P4(法人幹事)、R4 P12 / I8

## 1. 課題

- 貸切・法人の記述はトップ料金表下の注記1行のみ(`HomePricing.privateFacilityNote` → `/about#contact`)。専用ページ・人数・できること・流れがなく、幹事は稟議に必要な材料を得られない。
- 問い合わせフォームの種別は `court / lesson / press / other` の4つで、貸切・法人の種別がない。
- 検索「社内イベント ピックルボール 貸切」は圏外。受け皿となるページがない。

## 2. オーナー決定(2026-10-01、司令塔経由)

| 項目 | 決定 |
|---|---|
| 料金 | **載せない**。「料金はお問い合わせください」のみ |
| 実績 | **非表示**(一次情報がない。「準備中」も出さない) |
| 電話番号 | 載せない(フォームで受ける) |
| ページの形 | 専用ページ `/private`(ja/en)を新設 |
| CTA | `/about?category=private#contact`(種別「貸切・法人」をプリセレクト) |
| 導線 | トップ料金表下の注記リンク + フッター。**ヘッダーメニューには足さない** |
| 付随 | sitemap、パンくず構造化データを追加 |

## 3. 設計

### 3.1 問い合わせ種別 `private`(貸切・法人)

種別の値が3箇所に重複している(`api/contact/route.ts` の `VALID_CATEGORIES` / `CATEGORY_LABELS`、`AboutContent.tsx` の `useCategories`、`messages` の `About.contact.category*`)。追加ついでに値の一覧だけを `src/constants/contact.ts`(`CONTACT_CATEGORY_VALUES`, `isContactCategory`)へ集約し、API・about ページ・フォームが共有する。ラベル文言は従来どおり API 側 `CATEGORY_LABELS`(管理者宛メール・自動返信用、日本語固定)とフォーム側 messages(ja/en)で持つ。

- API: `private` を有効化。ラベルは「貸切・法人」。管理者宛件名は `【貸切・法人】○○様からのお問い合わせ`(既存の組み立てのまま)。
- フォーム: 選択肢に「貸切・法人」(en: "Private / Corporate")を `other` の前に追加。
- 計測: 送信時の `contact_submit` はすでに `label=category` を送るため、`label=private` で自動的に分離できる。**GA4 側の設定変更は不要**。

### 3.2 プリセレクト

`/about` は `force-dynamic` のサーバーコンポーネントなので、`page.tsx` が `searchParams.category` を受け取り、`isContactCategory` で検証した値だけを `AboutContent` の新 prop `initialCategory` に渡し、`<select defaultValue>` に使う。不正値・未指定は従来どおり未選択(`""`)。クライアント側で URL を読まないため、ハイドレーション不整合もない。`#contact` は既存の追従スクロールがそのまま効く。

### 3.3 専用ページ `/private`

`src/app/[locale]/private/page.tsx`(サーバー)+ `src/components/private/*`。構成は reserve / hyrox と同じ(HomeNavigation + セクション + HomeFooter)。小さな案内ページとして、セクションは4つ:

1. **Hero** — 見出し「貸切・法人利用」(PRIVATE & CORPORATE)と1〜2文のリード(結論先出し)。
2. **できること** — 確定済みの事実だけ:
   - 3面のコート(デコターフ)を、コート単位でも施設全体でも貸切できる
   - 施設全体の貸切にはトレーニングエリア(HYROX 8種目対応)とラウンジスペースも含められる
   - レイアウト変更で1面のショーコート形式にもできる(サイトの施設紹介に既出)
   - 更衣室(男女別)・自動販売機あり(施設紹介に既出)
3. **ご利用の目安(人数・時間帯)** — 営業時間(毎日。develop #515 で 6:00–25:00 に変更済み)の範囲で日時を相談。時刻は手書きせず `BUSINESS_HOURS_DISPLAY`(ja/en)を ICU の `{open}`/`{close}` に差し込む(`/hyrox` の `buildHyroxDescriptionValues` と同じ方式)。メタ description も同様。人数は**数字を載せず**「人数に応じてコート面数・利用範囲をご提案します。まずはご人数をお知らせください」とする(数字の確定は §6 の未確定事項)。料金は「お問い合わせください」。
4. **ご利用の流れ** — ① フォームから日時・人数・目的を送る → ② 担当者からメールで折り返し → ③ 内容と条件を確認 → ④ ご利用。条件(お見積もり・お支払い・キャンセル)は「お問い合わせ時にご案内します」とし、LaBOLA の通常予約の規定を貸切に当てはめない。

下部に CTA ボタン「お問い合わせフォームへ」→ `/about?category=private#contact`(ボタン下に「ご希望の日時・ご人数・ご利用目的をご記入ください」)。ページ全体で電話番号・料金・実績・所要日数などの未確定情報は出さない。

- メタデータ: `Metadata.private.{title,description}`、canonical と ja/en/x-default の alternates、OG は `buildPageOpenGraph`(既存の規約テストに合わせる)。
- 構造化データ: `buildBreadcrumb(locale, [{ name: "貸切・法人" | "Private & Corporate", path: "/private" }])` のみ。
- ファイル: `loading.tsx` は不要(データ取得なし)。アニメーションは既存パターン(`whileInView` + `once: true`、`prefers-reduced-motion` 尊重)。

### 3.4 導線

- **トップ料金注記**: `HomePricing` の注記を「…貸切・法人利用をご希望の場合は[貸切・法人のご案内]をご覧ください。」に改め、リンク先を `/private` に変更(`next-intl` の `Link`)。クリック計測は既存の `trackCtaClick("price", "home_pricing")` を維持。ja/en とも文言を更新。
- **フッター**: 下段リンク列(特商法・CONTRIBUTORS の隣)に「貸切・法人」を追加。ヘッダー・モバイルメニュー(`NAV_ITEMS`)は変更しない。
- **sitemap**: `SITEMAP_ROUTES` に `{ path: "/private", priority: 0.6, changeFrequency: "monthly" }`(en は既存の展開ロジックで自動)。

### 3.5 CTA 計測

ページ内 CTA は既存の `trackCtaClick("contentClick", "private_cta", "contact")` を流用(新イベント・GA4 設定変更なし)。

## 4. 変更ファイル(見込み)

| 区分 | ファイル |
|---|---|
| 新規 | `src/constants/contact.ts`(+test)、`src/app/[locale]/private/page.tsx`(+test)、`src/components/private/*.tsx`(+test) |
| 変更 | `src/app/api/contact/route.ts`(+test)、`src/app/[locale]/about/{page,AboutContent}.tsx`(+test)、`src/components/home/{HomePricing,HomeFooter}.tsx`(+test)、`src/constants/routes.ts`、`src/app/sitemap.test.ts`、`messages/{ja,en}.json` |

`messages/ja.json`・`en.json` は他 issue と衝突しやすいため、追加は新規名前空間 `Private`、`Metadata.private`、`About.contact.categoryPrivate`、`HomeFooter.private`、`HomePricing` の2〜3キー更新に限り、既存箇所の整形はしない。**新しい依存の追加なし。**

## 5. テスト方針(TDD・カバレッジ100%)

- `contact.ts`: 有効値・無効値・配列/未定義の判定。
- API: `private` を受理し件名・本文に「貸切・法人」が入る / 不正値は400(既存ケース維持)。
- about: `initialCategory="private"` で select が「貸切・法人」になる / 不正値・未指定は未選択 / page.tsx が検証済み値だけ渡す。
- `/private`: 見出し・各セクション・CTA の href(`/about?category=private#contact`)・en 表示・メタデータ・パンくず・禁止事項(電話番号・料金・実績の語が出ないこと)の回帰テスト。
- HomePricing: リンク先が `/private`。HomeFooter: 「貸切・法人」リンクがあり、ヘッダーのナビ項目は増えていない。sitemap: `/private` が ja/en alternates 付きで入る。
- E2E は既存の axe 監査対象ページ一覧に `/private` を足す必要があるか確認し、あれば追加する。

## 6. 未確定事項(司令塔・オーナーへ)

1. **人数の数字**: 「コート1面あたり・施設全体で何名まで」の確定値があれば載せたい。なければ本設計どおり数字は載せない(既定)。
2. 「企業イベント」「大会利用」の語は LaBOLA 側の説明にのみ根拠がある。サイトの文言に使ってよいか(既定: 使わない。できることは §3.3 の確定事実に限り、用途の例示も書かない)。
3. 折り返しの目安(「◯営業日以内」)は載せない(既定)。

## 7. やらないこと(YAGNI)

- ヘッダーメニュー項目、FAQ、実績、料金表、電話・LINE 導線、貸切専用フォーム(人数・希望日の専用入力欄)。
- LaBOLA・GBP 側の変更(必要なら手順書)。
