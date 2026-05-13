# パドルEC (Shopify Basic 単独 + クレカ決済) 設計書

**作成日**: 2026-05-06 (v2: microCMS 廃止、Shopify 単独構成へ刷新)
**ブランチ**: `feature/shop-paddle-shopify`
**対象**: `THE PICKLE BANG THEORY` ブランドサイト (Next.js 16 + next-intl + Vercel)

## 1. 背景と目的

施設開業 (2026-04-18) 後、ブランドの新規事業としてパドル (ラケット) のオンライン販売を開始する。今後パドル販売は継続事業として育て、SKU 拡張・カテゴリ拡張 (アクセサリー・アパレル等) の可能性もある。

将来的な拡大を見据え、最初から **Shopify Basic** を採用することで以下を実現する:
- 顧客データ・購入履歴を Day 1 から蓄積 (リピート購入施策の早期着手)
- 在庫・受注・配送・税の自動化により運用工数を最小化
- カテゴリ拡張時にプラットフォーム変更不要

決済は **Shopify Payments のクレジットカード + Apple Pay + Google Pay のみ** でローンチする。
PayPay / コンビニ / Paidy / Amazon Pay 等の日本独自決済は、KOMOJU 経由で **後日段階追加** する余地を残す (本仕様書のスコープ外)。

ブランド世界観 (editorial premium / dark cinematic) を維持するため、商品ページ (`/shop/...`) は Next.js + Shopify Storefront API で完全自前構築し、Shopify がカート・チェックアウト・在庫・受注・顧客 DB の役割も担う。

### 1.1 v2 改訂のポイント (microCMS 廃止)

v1 では商品 editorial データを microCMS で管理する案だったが、以下の理由で **Shopify 単独構成** に刷新する:

- **二重管理コスト**: Shopify と microCMS で `slug` キーで結合する運用負荷・データ整合性リスク
- **シングルソース化**: 商品データを Shopify に集約する方が運用が直感的
- **責任分離の明確化**: 「ニュース・コラム = microCMS」「商品 = Shopify」の綺麗な分離
- **開発工数削減**: `lib/microcms/paddles.ts` や `lib/shop/combine.ts` 等が不要

editorial 文体・縦長ナラティブは Shopify の `descriptionHtml` (HTML 直書き) と **metafields** (richtext / number / boolean / list 型) で十分組める。

## 2. 要件サマリ

| 要件 | 内容 |
|------|------|
| 取扱商品 | パドル (1〜3万円帯) |
| 初期 SKU 数 | 3〜10 想定 |
| 想定月商 | 〜300 万円 (1年目想定) |
| カテゴリ拡張 | アクセサリー / アパレル等を将来追加可能な構成 |
| 言語 | 日本語 / 英語 (既存 next-intl 構成踏襲、Shopify Markets で商品の翻訳管理) |
| 決済 (ローンチ時) | Shopify Payments のクレカ + Apple Pay + Google Pay |
| 決済 (将来追加) | KOMOJU 経由で PayPay / コンビニ / Paidy / Amazon Pay |
| 配送 | ヤマト宅急便 80サイズ中心、Ship&co でラベル発行自動化 |
| 在庫管理 | Shopify Admin で一元管理 (Source of Truth) |
| 商品ページ | `/shop`, `/shop/paddles/[handle]` を Next.js + Shopify Storefront API で完全自前 |
| カート / 決済画面 | Shopify ホスト (`checkout.thepicklebangtheory.com` カスタムドメイン) |
| ブランド世界観 | editorial premium / dark cinematic を商品ページで完全維持 |
| 法務 | 特商法表記 / プラポリ / 返品ポリシー / 適格請求書発行事業者登録 |

## 3. 技術選定

### 3.1 EC プラットフォーム: Shopify Basic 単独 + 自前 Next.js 商品ページ

4チームの再再調査 (Shopify 実装パターン / Japan reality check / 段階ロードマップ / 代替プラットフォーム) の結果、**長期継続事業 + 拡大可能性ある場合は最初から Shopify Basic** で確定。さらに v2 では商品データのシングルソース化のため microCMS を商品 EC では使わない方針に変更。

**採用理由**
- 受注・在庫・配送・税・顧客 DB が Day 1 から自動化される
- 顧客データ蓄積が初日から始まる (リピート施策の早期立ち上げ)
- KOMOJU を後から追加できるアーキテクチャ
- 月商 800 万到達時に Shopify Headless 化が同一プラットフォーム上でスムーズ
- ブランド世界観は「商品ページ (Next.js + Storefront API)」と「カート・決済 (Shopify)」を分離するハイブリッドで維持
- 商品データは Shopify 1箇所に集約、二重管理ゼロ

**Shopify Basic の月額**
- $39 (約 ¥5,600) / 月
- 決済手数料: 国内クレカ 3.4〜3.55%、JCB 4.15% (Shopify Payments 経由)

**ローンチ時に諦めること (後で追加)**
- KOMOJU 経由の日本独自決済 (PayPay / コンビニ / Paidy / Amazon Pay)
- 影響: CVR が 20〜35% 程度低い状態でスタート
- 緩和: クレカ + Apple Pay + Google Pay で日本のオンライン決済シェア約 65〜75% はカバー

### 3.2 アーキテクチャ概要

```
ブランドサイト (Next.js)
  thepicklebangtheory.com
  ├─ /                   既存 (Home)
  ├─ /facility, /services, /news  既存 (microCMS - ニュース専用)
  └─ /shop                       新規・自前
     ├─ /shop                    ショップトップ (editorial)
     ├─ /shop/paddles            一覧
     └─ /shop/paddles/[handle]   PDP (商品詳細)
            │
            │ "Add to Cart" ボタン
            │ Shopify Cart API (Server Actions)
            ↓
Shopify Cart → checkout.thepicklebangtheory.com (Shopify ホスト)
            │
            ↓
Shopify Admin (注文・在庫・顧客・配送・商品マスタ)
            │
            ↓
Ship&co → ヤマト B2クラウド → 配送ラベル発行
```

**役割分担**
- Next.js: 「見せる側」(商品 PDP / 一覧 / ストーリー描画)
- Shopify: 「データの正準源 + 売る・捌く側」(SKU マスタ / editorial 内容 / 在庫 / カート / 決済 / 受注 / 顧客 / 税)
- microCMS: ニュース機能専用 (商品 EC では使わない)

**ブランド世界観の維持戦略**
- 商品ページは Next.js で完全自前 (dark cinematic / Framer Motion / editorial 文体)
- レイアウト構造 (Hero / Spec Bar / Triangle / Story / Specs / Reviews / Related) はコード側に固定
- データだけ Shopify から取得し、コンポーネントが Shopify の `descriptionHtml` や metafield 値を整形して描画
- Shopify Cart UI は最小スタイル (商品数・価格・チェックアウトボタンのみ)
- Shopify チェックアウトはカスタムドメイン `checkout.thepicklebangtheory.com` でロゴ・配色を最低限ブランドに合わせる
- Shopify テーマ (`Dawn` / `Prestige` 等) は触らない (アプリ依存地獄を回避)

### 3.3 Shopify 商品データモデル (Source of Truth)

| 項目 | Shopify 標準フィールド | 補足 |
|------|----------------------|------|
| 商品名 | `title` | Shopify Markets で ja/en 翻訳 |
| URL slug | `handle` | URL に使用 (`/shop/paddles/[handle]`) |
| 商品説明 (基本) | `descriptionHtml` | editorial 文体の縦長ナラティブを HTML で記述 |
| 販売用画像 + editorial 画像 | `images` | studio + dramatic lighting で撮影し、全画像をここに |
| 価格 | `priceRange.minVariantPrice` | バリエーション価格は variant 側 |
| 在庫 | `availableForSale` / `quantityAvailable` | 自動でデクリメント |
| バリエーション | `variants` | グリップサイズ / カラー / 重量違い |
| 重量 / 寸法 | `variant.weight` / `variant.dimensions` | 配送計算用 |

**カスタム metafields** (Shopify Admin → Settings → Custom data → Products で定義):

| Namespace.Key | 型 | 説明 |
|---|---|---|
| `paddle.tagline` | single_line_text_field | 1行キャッチコピー |
| `paddle.power` | number_integer | Performance Triangle 用 (1-10) |
| `paddle.control` | number_integer | 同上 |
| `paddle.spin` | number_integer | 同上 |
| `paddle.core_material` | single_line_text_field | コア素材 |
| `paddle.face_material` | single_line_text_field | フェース素材 |
| `paddle.weight_grams` | number_integer | 重量 (g) |
| `paddle.core_thickness_mm` | number_integer | コア厚 (mm) |
| `paddle.grip_circumference_mm` | number_integer | グリップ周長 (mm) |
| `paddle.development_story` | rich_text_field | 開発背景 |
| `paddle.ambassador_review` | rich_text_field | アンバサダー長文レビュー |
| `paddle.fitting_guide` | rich_text_field | グリップサイズ計測法 |
| `paddle.usapa_certified` | boolean | USAPA 公認フラグ |
| `paddle.related_handles` | list.single_line_text_field | 関連商品 handle 配列 |

→ Storefront API の `metafields(identifiers: [...])` で一括取得可能。

### 3.4 多言語対応 (Shopify Markets)

- Shopify Markets の翻訳機能で `title`, `descriptionHtml`, metafield (rich_text 系) を ja/en 双方で管理
- Storefront API で `@inContext(country: $c, language: $l)` ディレクティブを毎クエリに付与 → 自動で翻訳済みデータ取得
- next-intl の locale (`ja`/`en`) を Shopify の `LanguageCode` (`JA`/`EN`) にマップする `localeToContext()` を 1 関数用意

### 3.5 技術スタック

| レイヤ | 採用技術 | 補足 |
|--------|---------|------|
| 商品マスタ + editorial データ | Shopify Basic | $39/月、Storefront API でデータ取得 |
| 決済 | Shopify Payments (クレカ / Apple Pay / Google Pay) | KOMOJU は別仕様で後日追加 |
| Shopify データ取得 | 自前 fetch ラッパ (Storefront API GraphQL) | 公式 `@shopify/storefront-api-client` ではなく素 fetch + Next.js 16 `next.tags` に揃える |
| キャッシュ戦略 | `'use cache'` + `cacheTag()` + `cacheLife()` | 既存 microCMS パターンと同じ思想を Shopify 層に適用 |
| カート | Shopify Cart API (GraphQL Mutations) + Server Actions | 商品ページから "Add to Cart" → Shopify Cart に追加 → checkoutUrl で遷移 |
| チェックアウト | Shopify ホスト型 (`checkout.thepicklebangtheory.com`) | カスタムチェックアウトドメイン設定 (Basic で利用可) |
| 配送ラベル | Ship&co | $1,900/月、ヤマト B2クラウド連携 |
| 配送業者 | ヤマト運輸 (法人契約) | 80サイズ中心 |
| バリデーション | Zod | Storefront API レスポンスの境界で `parse` |
| HTML サニタイズ | `isomorphic-dompurify` | Shopify `descriptionHtml` / metafield rich_text を Server Component でサニタイズ |
| 国際化 | next-intl 4.9 (既存) | `localePrefix: 'as-needed'` + Storefront `@inContext` 連携 |
| ISR 更新 | `revalidateTag('shopify-products')` + Shopify Webhook (`products/update`, `inventory_levels/update`) | eventual consistency 30〜60秒の遅延を考慮 |
| Feature Flag | サーバ専用環境変数 `USE_SHOP=true` | 段階的に公開 |
| メール通知 | Shopify 標準メール | 領収書・確認メール・出荷通知は Shopify が自動送信 |

### 3.6 ルーティング

```
src/app/[locale]/shop/
  page.tsx                       /shop                   ショップトップ
  paddles/page.tsx               /shop/paddles           パドル一覧
  paddles/[handle]/page.tsx      /shop/paddles/[handle]  PDP

src/app/api/revalidate/shopify/
  route.ts                       POST /api/revalidate/shopify  Shopify Webhook (HMAC 検証 + revalidateTag)
```

→ microCMS Webhook (`/api/revalidate`) は既存ニュース機能専用で改変なし。

### 3.7 コンポーネント構成

```
src/components/shop/
  ShopHero.tsx                   editorial hero (dark cinematic)
  PaddleCard.tsx                 一覧カード
  PaddleHero.tsx                 PDP の上部 (画像カルーセル + 価格 + AddToCart sticky)
  PaddleSpecBar.tsx              重量 / コア厚 / グリップ / シェイプ の4カラム
  PaddleTriangle.tsx             Power / Control / Spin の3軸 SVG (Framer Motion)
  PaddleStory.tsx                editorial 縦長ナラティブ (Shopify descriptionHtml をサニタイズ描画)
  PaddleSpecs.tsx                詳細仕様アコーディオン
  PaddleFitting.tsx              グリップサイズ計測法 (metafield fitting_guide)
  PaddleAmbassadorReview.tsx     アンバサダーレビュー (metafield ambassador_review)
  PaddleRelated.tsx              関連商品 (metafield related_handles)
  AddToCartButton.tsx            "use client" 最小、Shopify Cart API ミューテーション
  CartDrawer.tsx                 "use client"、サイドドロワーで現在のカート表示 + Checkout ボタン
  StockBadge.tsx                 Shopify の在庫データ (在庫切れ / 残りわずか)
  PriceLabel.tsx                 価格表示 (税込総額 / 二重価格対応)

src/lib/shopify/
  client.ts                      Storefront API GraphQL fetch ラッパ (~30行)
  queries.ts                     getProducts, getProductByHandle, getCart (~80行)
  mutations.ts                   cartCreate, cartLinesAdd, cartLinesUpdate, cartLinesRemove (~50行)
  fragments.ts                   ProductFragment, CartFragment, MetafieldFragment (~60行)
  types.ts                       手書き型定義 (~100行)
  cart.ts                        Cookie 読み書き + getOrCreateCart() (~70行)
  locale.ts                      next-intl ↔ Shopify @inContext (~20行)
  metafields.ts                  metafield 識別子定数 + 取得ヘルパ (~30行)
  sanitize.ts                    Shopify HTML 用サニタイズ設定 (既存 news/sanitize.ts を流用 + 拡張)
```

→ 旧 v1 で予定していた `lib/microcms/paddles.ts` および `lib/shop/combine.ts` は **不要**。

### 3.8 環境変数

```
# 既存
MICROCMS_SERVICE_DOMAIN=...
MICROCMS_API_KEY=...
MICROCMS_WEBHOOK_SECRET=...
RESEND_API_KEY=...
NEXT_PUBLIC_SITE_URL=https://thepicklebangtheory.com

# 新規 (Shopify)
USE_SHOP=true                                          # Feature Flag
SHOPIFY_STORE_DOMAIN=thepicklebangtheory.myshopify.com # Shopify ストアドメイン
SHOPIFY_STOREFRONT_ACCESS_TOKEN=...                    # Storefront API public token
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=...                   # Server-only, レート上限が高い
SHOPIFY_WEBHOOK_SECRET=...                             # Webhook 署名検証
SHOPIFY_CHECKOUT_DOMAIN=checkout.thepicklebangtheory.com # カスタムチェックアウトドメイン
```

### 3.9 ドメイン構成

```
thepicklebangtheory.com              Next.js (Vercel) - ブランドサイト本体
checkout.thepicklebangtheory.com     Shopify - チェックアウトのみ
thepicklebangtheory.myshopify.com   Shopify - 管理画面アクセス (運営用)
```

**サブドメインを `checkout.` で揃える理由**:
- 決済画面の URL もブランドドメイン配下に見せられるため、ユーザーが外部サイトへ飛ばされた印象を受けにくい
- Shopify Checkout は `cart.checkoutUrl` でカート状態を引き継ぐ。Next.js 側の cart ID Cookie を checkout サブドメインと共有する前提にはしない
- GA4 は Cookie 共有だけに頼らず、GA4 のクロスドメイン計測設定と referral exclusion を併用する
- SSL 証明書は Shopify が自動発行
- Custom Checkout Domain は Shopify Admin → Settings → Domains からサブドメイン追加 → CNAME を `shops.myshopify.com` に向けて設定する

## 4. 法務・運用整備 (実装と並行)

### 4.1 法務 (必須)

| 項目 | 期限 | 内容 |
|------|------|------|
| 適格請求書発行事業者登録 | 公開前 | T 番号取得 (国税庁)、Shopify 設定で領収書に T 番号自動印字 |
| `/tokushoho` 改訂 | 公開前 | 既存 `/tokushoho` を販売実態に合わせ全面改訂 |
| 注文確認画面 (Shopify Checkout) の確認 | 公開前 | 特商法 2022改正準拠 (総額・支払時期・引渡時期・解除条件) |
| プラポリ更新 | 公開前 | Shopify (カナダ) の決済データ取扱を追記、海外サーバー開示 |
| 返品ポリシー新設 | 公開前 | お客様都合 / 初期不良で送料負担を明確化 |
| Cookie CMP 導入 | 公開前 | Shopify Payments / GA4 等の第三者 Cookie 同意取得 |
| PL 保険 | 公開前 | 輸入パドルの場合は付保 (年 10〜50 万円) |
| 商標確認 | 仕入決定時 | J-PlatPat で日本商標調査 |

### 4.2 配送オペレーション

**業者**: ヤマト宅急便 (法人契約 = 掛売り) を W-2 までに締結。

**サイズ**: 80サイズ標準 (パドル 40cm + 緩衝材)。

**送料設定** (Shopify 配送ゾーンで設定):
- 全国一律 ¥1,000 (本州・四国・九州・北海道)
- 沖縄・離島 +¥500
- ¥10,000 以上送料無料

**ラベル発行**:
- Ship&co ($1,900/月) で Shopify 受注 → ヤマト B2クラウド → ラベル一括印刷
- 追跡番号は Shopify に自動書き戻し → 顧客に自動メール通知

**梱包資材**:
- ラケット用ダンボール 80サイズ (¥100〜200/枚) を 50〜枚単位で発注
- 緩衝材まとめ買い

### 4.3 在庫管理

- Shopify Admin が Source of Truth
- 在庫数は Shopify 注文確定時に自動デクリメント
- 在庫切れ時の Shopify 標準動作 ("売り切れ表示" or "予約販売") を SKU 単位で設定

## 5. テスト戦略

| レイヤ | ツール | カバレッジ |
|--------|--------|------------|
| 単体 | Vitest + RTL (既存) | 100% (既存基準を踏襲) |
| 統合 | Vitest + MSW | Shopify Storefront API のモック |
| E2E | Playwright (新規導入) | 一覧 → 詳細 → カート → Shopify チェックアウト遷移 |

**重要 E2E ケース**:
1. パドル一覧ページが Shopify データでレンダリングされる
2. PDP に必要な情報 (画像 / 価格 / スペック / Add to Cart) が表示される
3. Add to Cart クリックで Shopify Cart に商品が追加される
4. Cart Drawer から Checkout ボタン → `checkout.thepicklebangtheory.com` に遷移する
5. 在庫切れ商品は Add to Cart が無効化される
6. ja / en 切替で商品名・本文・価格表記が切り替わる (Shopify Markets 翻訳)
7. アクセシビリティ (axe-core) 違反がない
8. レスポンシブ (375 / 768 / 1440) で崩れない

## 6. リスクと緩和策

| リスク | 緩和策 |
|--------|--------|
| Shopify Webhook と Storefront API の eventual consistency (30〜60秒の遅延) | Webhook 受信 → `revalidateTag` を 60秒遅延発火 or 二段階 revalidate |
| クレカのみで日本決済シェアの 25〜35% を取り逃がす | Phase 2 で KOMOJU 申請・追加 (別仕様書) |
| Shopify テーマカスタムのアプリ依存地獄 | テーマは触らない、商品ページは Next.js で完全自前 |
| Cart Cookie の扱いを誤る | Cart Cookie は Next.js 側で cart ID を再利用するためのもの。Shopify Checkout との共有は前提にしない。request host の allowlist で host-only Cookie を基本にし、`SameSite=Lax`, `HttpOnly`, `Secure` を付与する |
| Shopify ロックイン | 商品 / 受注 / 顧客は Admin API でいつでもエクスポート可能、URL 構造は Next.js 側に保持 |
| ブランド毀損 (Shopify Cart UI の世界観崩れ) | Cart は最小スタイル (Drawer 形式)、Checkout のロゴ・配色を最低限ブランドに合わせる |
| 月商伸び悩み時の固定費 (¥7,500/月) | 月商 30万を 3ヶ月連続で下回ったら撤退検討、Phase 2 (KOMOJU) は無理に進めない |
| editorial 文体を Shopify Admin で書く負担 | metafield 構造を最初に確定、運営マニュアルでテンプレート化、入稿は Markdown 風ルール |

## 7. 公開フェーズ

| フェーズ | 期間 | 内容 |
|----------|------|------|
| 設計確定 | W0 | 本仕様書レビュー |
| Shopify 契約 | W1 | Shopify Basic 申込・Shopify Payments 申請 (即日〜2日) |
| 法務 | W1 | T番号申請、特商法・プラポリ・返品ポリシー文面確定 |
| 商品撮影 | W1〜W2 | dark cinematic で 1 SKU あたり 5〜8 枚 |
| Shopify 設定 | W2 | 商品登録・metafield 定義・配送ゾーン・カスタムチェックアウトドメイン・Webhook |
| 実装 | W2〜W3 | TDD で `/shop`, `/shop/paddles/[handle]`, components, Storefront API クライアント |
| Ship&co 契約 | W3 | ヤマト B2クラウド連携設定 |
| E2E テスト | W3 | Playwright 導入 + ケース実装 |
| 内部テスト | W3 | 実テスト注文 → 配送 → 受領フロー検証 |
| 本番リリース | W3 末 | Feature Flag `USE_SHOP=true` で段階公開 |

**並行: KOMOJU 申請 (将来追加用)**
- 本仕様ではスコープ外
- 後日 W3〜W4 あたりで運営者が単独で申請開始可能 (開発工数ほぼゼロ)
- 承認後に別 PR で日本決済追加

## 8. 公開後の運用 KPI

毎月レビュー:
- 月商
- 受注件数
- CVR (商品ページ訪問 → Add to Cart → 決済完了)
- 平均客単価
- リピート率
- カゴ落ち率 (Shopify Analytics)
- 決済方法別の選択率 (KOMOJU 追加判断材料)

KPI ダッシュボードは Shopify Analytics + GA4 を併用。

## 9. 撤退条件

- 3ヶ月連続で月商 30 万円未満 → パドル販売撤退、施設レンタル / レッスンに集中
- CVR < 0.5% が続く → 商品ページ (写真・コピー・スペック表記) の改善に集中

## 10. 将来の拡張パス

| トリガー | 次のアクション |
|---------|---------------|
| 月商 100万到達 / 受注 50件/月 | KOMOJU 申請・PayPay/コンビニ追加 (CVR 改善) |
| カテゴリ拡張 (アクセサリー・アパレル) | Shopify でコレクション追加 + metafield 拡張で対応可、Next.js 側にカテゴリ別レイアウト追加 |
| 月商 800〜1000万到達 | Headless 完全化検討 (現アーキテクチャをそのまま発展、Cart 自前 UI 化等) |
| 越境 EC | Shopify Markets を有効化、多通貨・多言語チェックアウト |
| 卸売 / B2B | Shopify Plus 検討 ($2,300/月〜) |

## 11. v1 → v2 改訂サマリ

| 項目 | v1 (microCMS 併用) | v2 (Shopify 単独) |
|------|-------------------|------------------|
| 商品データの正準源 | Shopify (SKU/価格/在庫) + microCMS (editorial) を slug で結合 | Shopify 単独 (descriptionHtml + metafields) |
| 編集UI | microCMS richEditorV2 | Shopify Admin |
| データ整合性 | slug ミスマッチで PDP 壊れるリスク | 単一ソース、リスクゼロ |
| 実装ファイル数 | + `lib/microcms/paddles.ts`, `lib/shop/combine.ts` | 不要、Shopify 層に集約 |
| Webhook | Shopify + microCMS 両方 | Shopify のみ |
| 運営工数 | 商品登録は2画面 (Shopify + microCMS) | Shopify Admin 1画面で完結 |
| editorial 表現力 | microCMS richEditorV2 で柔軟 | Shopify descriptionHtml + metafield rich_text で代替 (実用上十分) |
| 多言語 | microCMS で ja/en 個別管理 | Shopify Markets で翻訳一元管理 |

→ **v2 を採用**。シングルソース・運用シンプル・整合性リスクゼロのメリットが、editorial UX の僅かな差を上回る。
