# 予約ページ（/reserve）デザイン設計書

- 作成日: 2026-06-02
- 対象ブランチ: `feature/reservation-embed`
- ステータス: ドラフト（レビュー待ち）

## 1. 目的・背景

labola（外部予約システム）のコート予約カレンダーを自社サイト内に埋め込み、
ブランドの世界観を保ったプレミアムな予約ページ `/reserve` を提供する。

現状の `/reserve` はカレンダー iframe を貼っただけの「埋め込みテストページ」。
これを、ヒーロー・予約STEP・カレンダー・営業時間/注意事項を備えた
本格的な1ページ（案A: エディトリアル縦積み）として作り込む。

あわせて、サイト内の「RESERVE」導線を現在の外部URL（`https://reserva.be/tpbt`）から
内部 `/reserve` へ全面的に切り替える。

## 2. スコープ

### やること
- `/reserve` ページのデザイン実装（ja/en 両対応）
- labola 予約カレンダー（shop **3453**）の埋め込み
- サイト内 RESERVE 導線の内部 `/reserve` への切替
- 構造化データの予約 target 更新
- 関連テストの追加・更新

### やらないこと（YAGNI）
- 予約フロー自体の自社実装（labola に委譲）
- 問い合わせ導線の新設（今回は対象外）
- スティッキーサイドバー等の案B/C要素
- 6/30 以降のキャンペーン表示など無関係な変更

## 3. デザイン方針

既存のデザインシステムを踏襲する。

- 背景: `deep-black (#000)` / テキスト: `text-light (#E6E6E6)` / アクセント: `accent (#F6FF54)`
- 見出し: `font-serif`（Orbitron）/ 本文: `font-sans`（Inter / Noto Sans JP）
- アクセント罫線 `w-14 h-[3px] bg-accent` を見出し下に配置
- Framer Motion で各セクションを `whileInView`（`once: true`）でリビール、`prefers-reduced-motion` を尊重
- 最大幅 `max-w-7xl`、左右 `px-6 lg:px-12`

## 4. ページ構成（縦積み・1カラム）

`<main className="bg-deep-black min-h-screen">` 内に以下を配置：

1. `HomeNavigation`（プロモバナー + ナビ。既存共通）
2. **ヒーロー**
   - eyebrow: `RESERVATION`（uppercase, tracked, accent または gray）
   - H1: `RESERVE`（Orbitron, `text-5xl sm:text-7xl lg:text-8xl`）
   - 和文サブ: `コート予約`
   - アクセント罫線 + リード文1行
   - 上部余白: `pt-[calc(7rem+var(--promo-banner-h))]`（固定ナビ回避、about ページ準拠）
3. **予約STEP**（PC `grid-cols-3` / SP 縦積み、`staggerChildren`）
   - STEP 01 日時を選ぶ
   - STEP 02 コート・人数を選択
   - STEP 03 予約完了（決済）
   - 各: 大きな番号（Orbitron, accent） + タイトル + 短い説明
4. **カレンダー埋め込み**
   - 見出し: `BOOK A COURT` / 和文 `カレンダーから予約`
   - iframe: `w-full max-w-[1100px]` 中央配置、`border-t-2 border-t-accent` + 細枠 `border border-accent/20`、`bg-white rounded-sm`
   - 高さ: PC `h-[550px]`、モバイルはカレンダーが縦長のため `h-[640px]`（`h-[640px] md:h-[550px]`）
   - `title="予約カレンダー"`
5. **営業時間・アクセス / 注意事項**（PC `lg:grid-cols-2`）
   - 左 INFO:
     - 営業時間: `6:00 – 23:00（不定休）`
     - アクセス: `本八幡駅 徒歩1分` / `〒272-0021 千葉県市川市八幡2-16-6 八幡ハタビル 6階`
   - 右 注意事項・キャンセル規定（エディトリアル箇条書き、アクセントマーカー）
6. `HomeFooter`（既存共通）

## 5. 埋め込みURL

```
https://yoyaku.labola.jp/r/shop/3453/calendar/?embed=normal&tab_name=%E3%81%99%E3%81%B9%E3%81%A6
```

- `tab_name=すべて` は非ASCIIのため URL エンコード済み
- `&` を含むため JSX 式（`src={LABOLA_CALENDAR_SRC}`）で渡す
- 検証済み: shop 3453 は `embed=normal` で HTTP 200・`X-Frame-Options` なしで埋め込み可能

## 6. コンポーネント分割

`src/components/reserve/` に配置（各ファイル単一責務、motion 使用は `"use client"`）：

| ファイル | 責務 | 種別 |
|---|---|---|
| `ReserveHero.tsx` | ヒーロー見出し | client（motion） |
| `ReserveSteps.tsx` | 予約STEP 3項目 | client（motion/stagger） |
| `ReserveCalendar.tsx` | iframe ラッパ + 見出し | client（motion）/ iframe自体は静的 |
| `ReserveInfo.tsx` | 営業時間・アクセス + 注意事項 | client（motion） |

ページ `src/app/[locale]/reserve/page.tsx`（server）が：
- `params` から locale 解決、`parseLocale` で不正は `notFound()`
- `setRequestLocale(locale)`
- 上記コンポーネントをオーケストレーション
- `generateMetadata`（SEO title/description、canonical/alternates は他ページ準拠）

## 7. i18n

`messages/ja.json` / `messages/en.json` に新ネームスペース `Reserve` を追加。
ヒーロー、STEP（×3）、カレンダー見出し、INFO、注意事項の全文言を ja/en で定義。
`Metadata.reserve`（title/description）も追加し `generateMetadata` で使用。

## 8. 予約導線の切替（外部 → 内部 /reserve）

現在 `RESERVE_URL = "https://reserva.be/tpbt"` を外部リンク（`target=_blank`）で参照している箇所を、
`@/i18n/navigation` の `Link` による内部 `/reserve`（同一タブ）へ変更：

| 箇所 | 現状 | 変更後 |
|---|---|---|
| `HomeNavigation.tsx`（×2: PC/モバイル） | `<a href={RESERVE_URL} {...EXTERNAL_LINK_PROPS}>` | `<Link href="/reserve">` |
| `HomeHero.tsx` | 同上 | `<Link href="/reserve">` |
| `HomeServices.tsx`（service01 ctaUrl） | `RESERVE_URL` | 内部 `/reserve`（Link 化） |
| `PromoBanner.tsx` | `<a href={RESERVE_URL} {...EXTERNAL_LINK_PROPS}>` | `<Link href="/reserve">` |
| `sportsActivityLocation.ts`（構造化データ） | `target: RESERVE_URL` | `target: \`${SITE_URL}/reserve\`` |

- 内部遷移のため `target=_blank` / `rel=noopener` は除去。
- `RESERVE_URL` 定数は外部予約廃止に伴い整理（残置の必要があれば labola 関連定数に集約。最小変更を優先）。
- HomeServices の `ctaUrl` が外部/内部混在になるため、リンク描画箇所で内部/外部を出し分けるか、service01 を内部リンク前提に調整する（実装時に最小差分で対応）。

## 9. 注意事項・キャンセル規定（ドラフト文言：要確認）

> 確定文言が決まるまでの仮。レビューで調整。

- ご予約は予約開始時刻の前まで受付可能です。
- キャンセル・変更は予約システム上の規定に従います。詳細は予約時にご確認ください。
- 開始時刻に遅れた場合も、ご予約枠の時間内でのご利用となります。
- 室内シューズ・ラケット等の貸出は店舗・プランにより異なります。
- 営業時間: 6:00 – 23:00（不定休）

## 10. テスト方針（TDD・カバレッジ準拠）

### 追加
- `ReserveHero` / `ReserveSteps` / `ReserveCalendar` / `ReserveInfo`: `NextIntlClientProvider` で render し、主要文言・iframe src/title・アクセシブルな見出し（role/heading）を検証。
- ページの locale guard（不正 locale で `notFound`）。
- `ReserveCalendar`: iframe の `src` が shop 3453 の埋め込みURL、`title="予約カレンダー"` であること。

### 更新（既存テストが外部URLを検証しているため必須）
- `PromoBanner.test.tsx`: `href === "https://reserva.be/tpbt"` → 内部 `/reserve` 検証へ。
- `HomeHero` / `HomeServices` / `HomeNavigation` の予約リンクテスト: 内部 `/reserve` 検証へ。
- `sportsActivityLocation.test.ts`: 予約 target を `${SITE_URL}/reserve` 検証へ。

## 11. アクセシビリティ

- iframe に `title` 必須（設定済み）。
- 見出し階層: ページ h1（RESERVE）→ 各セクション h2。
- STEP は順序情報を持つため `ol`/`li` セマンティクスを検討。
- カラーコントラスト WCAG AA 準拠（既存トークンで担保）。
- `prefers-reduced-motion` 尊重。

## 12. リスク・留意点

- labola iframe は外部依存。shop 3453 が未公開化/ID変更されると表示不可（トップへリダイレクト→`X-Frame-Options: DENY`）。
- iframe 高さは固定。カレンダー内部スクロールに委ねる。モバイル高さは実機確認で微調整。
- 導線切替により、既存の外部予約計測（reserva.be）が途切れる点に留意。
