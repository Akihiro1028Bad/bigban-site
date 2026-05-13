# パドルEC (Shopify Basic 単独 + クレカ決済) 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shopify Basic を SKU マスタ・editorial データ・在庫・受注・決済の Source of Truth として導入し、Next.js + Shopify Storefront API で editorial premium な商品ページを完全自前構築する。チェックアウトはカスタムドメイン `checkout.thepicklebangtheory.com` で Shopify ホスト型を使用。決済は Shopify Payments のクレジットカード + Apple Pay + Google Pay でローンチし、KOMOJU 経由の日本独自決済は将来別仕様で追加する。

**Architecture:** Shopify Storefront API (GraphQL) + Cart API を Next.js 16 RSC から fetch、`'use cache'` + `cacheTag` + Webhook ベースの ISR。商品データは Shopify が単一の Source of Truth で、editorial 文体は `descriptionHtml` と metafields (rich_text 系) で表現。多言語は Shopify Markets の翻訳機能 + Storefront API の `@inContext` ディレクティブ。カートは Server Actions で操作し、Next.js 側で cart ID を Cookie に保存する。Shopify Checkout へは Cookie 共有ではなく `cart.checkoutUrl` への top-level navigation で遷移する。

**Tech Stack:** Next.js 16.2 / React 19.2 / next-intl 4.9 / TypeScript 5.9 / Tailwind CSS 4 / Vitest 4 / React Testing Library / Playwright (新規導入) / Zod / isomorphic-dompurify / MSW / Shopify Storefront API 2026-04

**Spec:** `docs/superpowers/specs/2026-05-06-shop-paddle-shopify-design.md`

**前提:** ニュースCMS化 (microCMS連携) で確立した実装パターン (Cache Components / Webhook / Zod 境界検証 / Server Component サニタイズ) を Shopify 層に適用する。microCMS は商品 EC では使わず、ニュース機能専用として既存維持。

---

## フェーズ 0: 設計確定・契約準備 (W0〜W1)

設計書レビューと外部サービス契約・法務準備。実装着手前に完了させる。

### Task 0-1: 設計書レビューと承認
- [ ] `docs/superpowers/specs/2026-05-06-shop-paddle-shopify-design.md` (v2) の最終確認
- [ ] 運営者 (オーナー) と決済方法・送料体系・返品ポリシーの認識合わせ
- [ ] 商品撮影方針 (dark cinematic / studio + dramatic lighting) の合意
- [ ] editorial 文体テンプレート (descriptionHtml + metafield) の入稿ルール合意

### Task 0-2: Shopify アカウント開設
- [ ] Shopify Basic ($39/月) 申込
- [ ] ストア URL: `thepicklebangtheory.myshopify.com` (管理画面用)
- [ ] Shopify Payments 申請 (即日〜2日)
- [ ] 法人口座情報・代表者本人確認・特商法ページ URL を提出

### Task 0-3: カスタムチェックアウトドメイン設定
- [ ] Shopify Admin → Settings → Domains で `checkout.thepicklebangtheory.com` 追加
- [ ] DNS (Vercel or 既存レジストラ) で CNAME を `shops.myshopify.com` に向ける
- [ ] SSL 自動発行確認 (48時間以内)
- [ ] テスト: `https://checkout.thepicklebangtheory.com/...` へのアクセスが Shopify チェックアウトを返すこと

### Task 0-4: 法務基盤
- [ ] 適格請求書発行事業者登録申請 (国税庁・T番号取得)
- [ ] 既存 `/tokushoho` の改訂案ドラフト
  - 事業者名 / 代表者氏名 / 所在地 / 電話番号 / メールアドレス
  - 販売価格 (税込) / 送料 / 支払時期と方法 / 引渡時期
  - 返品特約 (お客様都合 / 初期不良で送料負担を明記)
- [ ] プラポリ更新案ドラフト (Shopify カナダの決済データ取扱を追記)
- [ ] Cookie CMP 選定 (Shopify は管理画面に標準搭載、Next.js 側は別途検討)
- [ ] PL 保険見積 (輸入パドルの場合)
- [ ] 商標確認 (J-PlatPat で取扱予定ブランド名を調査)

### Task 0-5: 配送パートナー契約
- [ ] ヤマト運輸 法人契約 (掛売り) を申請
- [ ] Ship&co ($1,900/月) アカウント開設・無料トライアル開始
- [ ] ラケット用ダンボール 80サイズ (50枚〜) 発注
- [ ] 緩衝材 (プチプチ等) 発注

### Task 0-6: Shopify Partners アカウント開設 (開発環境用)
- [ ] [Shopify Partners](https://partners.shopify.com/) で無料アカウント作成
- [ ] Partners ダッシュボードから **Development Store** を作成
  - Store name: `thepicklebangtheory-dev`
  - Purpose: **「For a client」を選択** (将来の本番ストア譲渡を可能にするため)
  - Country: Japan
- [ ] 開発ストア URL: `thepicklebangtheory-dev.myshopify.com`
- [ ] **重要な制約の認識共有**:
  - 開発ストアは **テスト注文 50 件まで** 受注可能 (超過すると新規注文ブロック)
  - 商用販売不可 (テスト目的のみ)
  - パスワード保護でしか公開できない
  - 機能は本番と同等 (Shopify Plus 専用 API も含めフル解放)

### Task 0-7: 開発環境の役割分担を確定
- [ ] **開発ストア** (`thepicklebangtheory-dev.myshopify.com`):
  - 全ての実装作業・テストを行う
  - metafield 定義・商品データ・Webhook 設定を試行錯誤
  - Bogus Gateway / Shopify Payments テストモードで決済検証
- [ ] **本番ストア** (`thepicklebangtheory.myshopify.com`):
  - 開発ストアで確立した設定を移植して構築
  - 本番リリース直前まで触らない
  - 商用販売・Shopify Payments 本番モード
- [ ] **Vercel 環境分離**:
  - Development / Preview: 開発ストアのトークンを使用
  - Production: 本番ストアのトークンを使用

---

## フェーズ 1: Shopify ストア初期設定 (W1〜W2、運営者作業中心)

> **注意**: 本フェーズは **開発ストア (`thepicklebangtheory-dev.myshopify.com`) で先に実施** する。設定が固まった後、本フェーズの内容を本番ストアに移植する (フェーズ 7 で実施)。

### Task 1-1: Shopify Markets と多言語設定
- [ ] Shopify Admin → Markets で `Japan` (デフォルト) と `International` を有効化
- [ ] Languages で `日本語` (主) + `English` を追加
- [ ] Shopify Translate & Adapt アプリで翻訳管理を有効化

### Task 1-2: カスタム Metafield 定義
- [ ] Shopify Admin → Settings → Custom data → Products で以下の metafield を定義:
  - `paddle.tagline` (single_line_text_field)
  - `paddle.power` (number_integer, min=1, max=10)
  - `paddle.control` (number_integer, min=1, max=10)
  - `paddle.spin` (number_integer, min=1, max=10)
  - `paddle.core_material` (single_line_text_field)
  - `paddle.face_material` (single_line_text_field)
  - `paddle.weight_grams` (number_integer)
  - `paddle.core_thickness_mm` (number_integer)
  - `paddle.grip_circumference_mm` (number_integer)
  - `paddle.development_story` (rich_text_field)
  - `paddle.ambassador_review` (rich_text_field)
  - `paddle.fitting_guide` (rich_text_field)
  - `paddle.usapa_certified` (boolean)
  - `paddle.related_handles` (list.single_line_text_field)
- [ ] 各 metafield に「Storefront API で公開する」フラグを ON

### Task 1-3: 配送ゾーン設定
- [ ] Shopify Admin → Settings → Shipping and delivery
  - 全国一律 ¥1,000 (本州・四国・九州・北海道)
  - 沖縄・離島 +¥500
  - ¥10,000 以上送料無料
- [ ] 配送業者連携 (Ship&co + ヤマト B2クラウド)

### Task 1-4: 税設定
- [ ] 消費税 10% 設定
- [ ] 税込総額表示モード ON
- [ ] T番号取得後、領収書フォーマットに自動印字

### Task 1-5: チェックアウトカスタマイズ
- [ ] ロゴアップロード (ブランドロゴ)
- [ ] アクセントカラー `#C8FF00` 設定
- [ ] Background `#0A0A0A` 設定
- [ ] フォント設定 (Shopify Checkout の制約内で最寄せ)
- [ ] 規約・返品ポリシー・プラポリへのリンク追加

### Task 1-6: Storefront API トークン発行 (Headless チャネル経由)
2024 年以降、Shopify は Storefront API 利用には **Headless チャネル** (Sales channels → Headless) を推奨。Custom App (Develop apps) より UI が洗練されており、Public + Private トークン自動発行・許可ドメイン UI 管理が可能。

- [ ] **開発ストアで実施**:
  - Shopify Admin → Sales channels → **Headless → Add storefront**
  - Storefront 名: `bigban-web`
  - Storefront permissions タブで scope を許可:
    - `unauthenticated_read_product_listings`
    - `unauthenticated_read_product_inventory`
    - `unauthenticated_write_checkouts`
    - `unauthenticated_read_checkouts`
    - `unauthenticated_read_selected_payment_methods`
    - `unauthenticated_read_metaobjects`
  - **Allowed domains** に以下を登録:
    - `http://localhost:3000` (ローカル開発)
    - `https://*.vercel.app` (Vercel preview)
    - `https://thepicklebangtheory.com` (本番、Production tag のため事前登録)
  - **Public access token** (ブラウザ用) と **Private access token** (サーバー用) をコピー
- [ ] Vercel 環境変数 (Development / Preview) に開発ストアのトークンを登録
- [ ] **本番ストアの Headless チャネル設定はフェーズ 7 で実施**

### Task 1-7: 初期商品登録
- [ ] Shopify Admin で初期 SKU (3〜10件) 登録
  - title (handle が URL になることを考慮)
  - descriptionHtml (editorial 縦長ナラティブ)
  - 価格 (税込)
  - 在庫数
  - 重量 / 寸法 (配送計算用)
  - バリエーション (グリップサイズ / カラー / 重量違い)
  - 全 metafield 入力
  - 商品画像 (販売用 + editorial 画像、5〜8枚)
- [ ] Shopify Markets の翻訳機能で英語版を入力

---

## フェーズ 2: 基盤実装 (W2)

Shopify 連携・ルーティング骨組み・Feature Flag。

### Task 2-1: Feature Flag と環境変数
- [ ] `.env.example` に以下を追記 (3 環境分離前提):
  ```
  # Feature Flag (サーバ専用)
  USE_SHOP=false

  # Shopify ストア (Development / Preview = 開発ストア、Production = 本番ストア)
  SHOPIFY_STORE_DOMAIN=thepicklebangtheory-dev.myshopify.com
  SHOPIFY_STOREFRONT_API_VERSION=2026-04
  NEXT_PUBLIC_SHOPIFY_STOREFRONT_PUBLIC_TOKEN=...   # ブラウザ可、Cart 操作用
  SHOPIFY_STOREFRONT_PRIVATE_TOKEN=...               # サーバー専用、漏洩 NG
  SHOPIFY_WEBHOOK_SECRET=...

  # カスタムチェックアウトドメイン
  SHOPIFY_CHECKOUT_DOMAIN=checkout.thepicklebangtheory.com
  ```
- [ ] `src/config/featureFlags.ts` に `USE_SHOP` を追加 (サーバ専用、`NEXT_PUBLIC_*` 禁止)
- [ ] **Vercel 環境変数を環境別に登録**:
  - `vercel env add SHOPIFY_STORE_DOMAIN production` → 本番ストア値
  - `vercel env add SHOPIFY_STORE_DOMAIN preview` → 開発ストア値
  - `vercel env add SHOPIFY_STORE_DOMAIN development` → 開発ストア値
  - 同様にトークン類も Production / Preview / Development を分けて登録
- [ ] `vercel env pull .env.local --environment=development` でローカル同期

### Task 2-2: Shopify Storefront API クライアント (TDD)
- [ ] テスト: `src/lib/shopify/client.test.ts`
  - GraphQL fetch ラッパが Storefront API エンドポイントへ POST すること
  - Private Token 利用時は `Shopify-Storefront-Buyer-IP` ヘッダを付与すること
  - エラー時に Zod バリデーションで詳細メッセージを返すこと
  - GraphQL errors のハンドリング (data + errors 両立時の挙動)
- [ ] 実装: `src/lib/shopify/client.ts` (~30行)
  - 素 fetch (`@shopify/storefront-api-client` は使わない、Next.js 16 `next.tags` 完全制御のため)
  - `next: { tags: [...], revalidate: 60 }` を尊重
  - `cache: 'no-store'` をミューテーションで強制

### Task 2-3: locale → @inContext マッパ (TDD)
- [ ] テスト: `src/lib/shopify/locale.test.ts`
  - `localeToContext('ja')` が `{ country: 'JP', language: 'JA' }` を返すこと
  - `localeToContext('en')` が `{ country: 'JP', language: 'EN' }` を返すこと
  - 不正な locale で例外
- [ ] 実装: `src/lib/shopify/locale.ts` (~20行)

### Task 2-4: GraphQL Fragments (TDD)
- [ ] テスト: `src/lib/shopify/fragments.test.ts` (型レベル + サニティ)
  - ProductFragment が必要なフィールドを全て含むこと
  - MetafieldFragment が `paddle.*` 全 namespace.key を取得すること
  - CartFragment が checkoutUrl を含むこと
- [ ] 実装: `src/lib/shopify/fragments.ts` (~60行)
  - `ProductFragment`: handle / title / descriptionHtml / priceRange / availableForSale / variants / images / metafields(identifiers: [...])
  - `MetafieldFragment`: namespace / key / value / type
  - `CartFragment`: id / checkoutUrl / totalQuantity / cost / lines

### Task 2-5: 商品データ取得クエリ (TDD)
- [ ] テスト: `src/lib/shopify/queries.test.ts`
  - `getProducts({ first, after, locale })` でページネーションが動くこと
  - `getProductByHandle(handle, locale)` で1件取得 + metafields も同時取得
  - `next.tags = ['shopify-products', 'product:'+handle]` が付くこと
  - locale が `@inContext` に正しく渡ること
  - Zod バリデーション失敗時に明示的にスロー
- [ ] 実装: `src/lib/shopify/queries.ts` (~80行)
  - `getProducts`, `getProductByHandle`, `getCollectionByHandle`

### Task 2-5b: TypeScript 型生成 (codegen)
Shopify Storefront API は四半期ごとにバージョンが上がるため、手書き型は破綻しやすい。**`@shopify/api-codegen-preset` で自動生成**を採用。

- [ ] `npm install -D @shopify/api-codegen-preset @graphql-codegen/cli`
- [ ] `codegen.ts` 設定ファイル作成:
  ```ts
  import { shopifyApiTypes } from '@shopify/api-codegen-preset';
  export default {
    schema: 'https://shopify.dev/storefront-graphql-direct-proxy/2026-04',
    documents: ['src/**/*.{ts,tsx}'],
    generates: {
      'src/lib/shopify/types.ts': shopifyApiTypes({
        apiType: 'storefront',
        apiVersion: '2026-04',
        documents: ['src/**/*.{ts,tsx}'],
      }),
    },
  };
  ```
- [ ] `package.json` に `"shopify:codegen": "graphql-codegen"` を追加
- [ ] クエリは `#graphql` テンプレートタグで記述 (codegen が拾う)
- [ ] CI で型生成が最新であることをチェック (`graphql-codegen --check`)

### Task 2-6: Metafield ヘルパ (TDD)
- [ ] テスト: `src/lib/shopify/metafields.test.ts`
  - `getMetafield(product, 'paddle', 'power')` で値が取れる
  - rich_text_field 型は JSON パース後に HTML 文字列を返す
  - boolean 型は真偽値変換
  - list.single_line_text_field 型は配列変換
  - 値が無い時は undefined / null を返す
- [ ] 実装: `src/lib/shopify/metafields.ts` (~30行)
  - 識別子定数 + 型変換ヘルパ

### Task 2-7: HTML サニタイズ拡張 (TDD)
- [ ] テスト: `src/lib/shopify/sanitize.test.ts`
  - Shopify の `descriptionHtml` 由来 HTML を安全にサニタイズ
  - 既存 `src/lib/news/sanitize.ts` の `RICH_EDITOR_CONFIG` をベースに拡張
  - Shopify CDN 画像ホスト (`cdn.shopify.com`) を許可
  - `addHook` で `<a>` に `target="_blank"` + `rel="noopener noreferrer"` 強制
- [ ] 実装: `src/lib/shopify/sanitize.ts`
  - 既存 `news/sanitize.ts` パターン踏襲

---

## フェーズ 3: 商品ページ実装 (W2〜W3)

`/shop`, `/shop/paddles`, `/shop/paddles/[handle]` の Next.js 完全自前構築。TDD 必須。

### Task 3-1: ルーティング骨組み
- [ ] `src/app/[locale]/shop/page.tsx` (ショップトップ、Server Component)
- [ ] `src/app/[locale]/shop/paddles/page.tsx` (一覧、Server Component)
- [ ] `src/app/[locale]/shop/paddles/[handle]/page.tsx` (PDP、Server Component + `generateStaticParams`)
- [ ] `src/app/[locale]/shop/loading.tsx`
- [ ] `src/app/[locale]/shop/paddles/loading.tsx`
- [ ] `src/app/[locale]/shop/paddles/[handle]/loading.tsx`
- [ ] `src/app/[locale]/shop/error.tsx`
- [ ] Feature Flag `USE_SHOP=false` 時は `notFound()`

### Task 3-2: ShopHero コンポーネント (TDD)
- [ ] テスト: `src/components/shop/ShopHero.test.tsx`
  - editorial hero テキストとビジュアルが描画されること
  - dark cinematic スタイルが適用されること
  - axe-core で違反がないこと
- [ ] 実装: `src/components/shop/ShopHero.tsx`
  - Framer Motion `motion.section` + `whileInView`
  - `prefers-reduced-motion` 対応

### Task 3-3: PaddleCard コンポーネント (TDD)
- [ ] テスト: `src/components/shop/PaddleCard.test.tsx`
  - 商品名 / 画像 / 価格 / 在庫ステータスが描画されること
  - ホバーアニメーションが reduced-motion で抑制されること
  - リンク先が `/shop/paddles/[handle]` であること
- [ ] 実装: `src/components/shop/PaddleCard.tsx`
  - Shopify product images の最初の1枚を `next/image` で表示

### Task 3-4: PaddleHero (PDP 上部) コンポーネント (TDD)
- [ ] テスト: `src/components/shop/PaddleHero.test.tsx`
  - 画像カルーセル (5〜8枚) がスワイプ可能
  - sticky な価格・バリエーション・Add to Cart が表示されること
  - 在庫切れ時に Add to Cart が無効化されること
  - tagline (metafield) が表示されること
- [ ] 実装: `src/components/shop/PaddleHero.tsx`
  - Shopify product images を `next/image` で表示
  - sticky bar はスマホで底部固定、デスクトップで右側固定

### Task 3-5: PaddleSpecBar コンポーネント (TDD)
- [ ] テスト: `src/components/shop/PaddleSpecBar.test.tsx`
  - 重量 / コア厚 / グリップ周長 / シェイプの 4 カラムが等幅で描画されること
  - metafield 値が undefined の場合のフォールバック
- [ ] 実装: `src/components/shop/PaddleSpecBar.tsx`
  - JetBrains Mono で計測値感を演出
  - metafield (`paddle.weight_grams` 等) を読み取り

### Task 3-6: PaddleTriangle (Performance Triangle) コンポーネント (TDD)
- [ ] テスト: `src/components/shop/PaddleTriangle.test.tsx`
  - Power / Control / Spin の 3 軸が SVG で描画されること
  - 値が変化するとシェイプがアニメーションすること
  - reduced-motion で静的描画になること
- [ ] 実装: `src/components/shop/PaddleTriangle.tsx`
  - Framer Motion `useTransform` で値変化アニメーション
  - SVG `polygon` + `motion.polygon`
  - metafield (`paddle.power`, `paddle.control`, `paddle.spin`) を読み取り

### Task 3-7: PaddleStory コンポーネント (TDD)
- [ ] テスト: `src/components/shop/PaddleStory.test.tsx`
  - Shopify `descriptionHtml` がサニタイズ済みで描画されること
  - metafield `development_story` (rich_text) が併記されること
  - HTML 内のスクリプトタグ等が除去されること
- [ ] 実装: `src/components/shop/PaddleStory.tsx`
  - Server Component (サニタイズはサーバ側のみ)
  - `lib/shopify/sanitize.ts` を使用

### Task 3-8: PaddleSpecs / PaddleFitting / PaddleAmbassadorReview / PaddleRelated コンポーネント (TDD)
- [ ] PaddleSpecs: アコーディオン (`<details>` ベース、JS 不要)、metafield + variant 詳細
- [ ] PaddleFitting: metafield `fitting_guide` を表示
- [ ] PaddleAmbassadorReview: metafield `ambassador_review` を editorial 文体で表示
- [ ] PaddleRelated: metafield `related_handles` から関連商品を Storefront API で並列取得 → カード表示

### Task 3-9: 一覧ページのフィルタ (TDD)
- [ ] テスト: `src/app/[locale]/shop/paddles/page.test.tsx`
  - 重量帯 (軽量 / 標準 / 重量級) でフィルタできること
  - スタイル (Power / Control / All-court) でフィルタできること
  - URL クエリパラメータ (`?weight=light&style=power`) と同期すること
- [ ] 実装: フィルタは Server Component で URL search params を読み取り
- [ ] フィルタ UI は `"use client"` 最小、`<form>` ベースで JS 無効でも動く

### Task 3-10: メタデータと SEO
- [ ] PDP の `generateMetadata` で OGP / Twitter Card / structured data (Product JSON-LD) を出力
  - JSON-LD は Shopify product data + metafield から組成
- [ ] 一覧ページの `metadata` 定義
- [ ] sitemap.xml に `/shop`, `/shop/paddles`, `/shop/paddles/[handle]` を追加
- [ ] hreflang 設定 (ja/en)

---

## フェーズ 4: カート実装 (W3)

Cart API + Server Actions + Cookie 管理 + Cart Drawer UI。

### Task 4-1: Shopify Cart Mutations (TDD)
- [ ] テスト: `src/lib/shopify/mutations.test.ts`
  - `cartCreate({ lines })` で新規カート作成 + checkoutUrl 取得
  - `cartLinesAdd(cartId, lines)` で行追加
  - `cartLinesUpdate(cartId, lines)` で数量変更
  - `cartLinesRemove(cartId, lineIds)` で削除
  - 全ミューテーションで `cache: 'no-store'`
- [ ] 実装: `src/lib/shopify/mutations.ts` (~50行)

### Task 4-2: Cart Cookie ヘルパ (TDD)
- [ ] テスト: `src/lib/shopify/cart.test.ts`
  - `getOrCreateCart()` が初回は `cartCreate` を呼ぶこと
  - 2回目以降は Cookie の cart ID を再利用
  - Cookie は Next.js storefront 側で cart ID を再利用するためのもの
  - `thepicklebangtheory.com` は host-only Cookie を基本にする
  - preview 環境 (`*.vercel.app`) も host-only Cookie
  - Cookie domain は `NODE_ENV` ではなく request host の allowlist で判定する
  - `SameSite=Lax`, `HttpOnly`, `Secure`, `maxAge: 14日`
- [ ] 実装: `src/lib/shopify/cart.ts` (~70行)
  - `cookies().set()` (Next.js 16 Server Actions API)

### Task 4-3: AddToCartButton コンポーネント (TDD)
- [ ] テスト: `src/components/shop/AddToCartButton.test.tsx`
  - クリックで Server Action が呼ばれること
  - 在庫切れ時は `disabled` になること
  - `useOptimistic` で楽観的 UI 更新
  - エラー時に Toast / Alert で通知
- [ ] 実装: `src/components/shop/AddToCartButton.tsx`
  - `"use client"` 最小、Server Action は `actions/cart.ts` から import

### Task 4-4: Cart Server Actions (TDD)
- [ ] テスト: `src/app/actions/cart.test.ts`
  - `addToCart(variantId, quantity)` が cart に行追加すること
  - `updateCartLine(lineId, quantity)` が動くこと
  - `removeCartLine(lineId)` が動くこと
  - 各アクション後に `revalidatePath('/shop')` が走ること
- [ ] 実装: `src/app/actions/cart.ts`
  - `'use server'`
  - エラー時は `{ success: false, error }` を返却 (例外スローしない)

### Task 4-5: CartDrawer コンポーネント (TDD)
- [ ] テスト: `src/components/shop/CartDrawer.test.tsx`
  - 右側ドロワーで現在のカート内容が表示されること
  - 数量変更 / 削除ができること
  - "Checkout" ボタンクリックで `cart.checkoutUrl` へ遷移すること (`window.location.href`)
  - 空カート時の表示
  - reduced-motion で開閉アニメ抑制
- [ ] 実装: `src/components/shop/CartDrawer.tsx`
  - `"use client"`、ヘッダーのカートアイコンクリックで開く
  - editorial premium のミニマルデザイン (黒地 + アクセント `#C8FF00`)

### Task 4-6: ヘッダーへのカートアイコン追加 (TDD)
- [ ] テスト: 既存 `Navigation.test.tsx` 拡張
  - Feature Flag `USE_SHOP=true` 時のみカートアイコンが表示されること
  - カート内商品数バッジ
- [ ] 実装: `src/components/Navigation.tsx` 改修

---

## フェーズ 5: Webhook & ISR (W3)

Shopify Webhook で商品・在庫変更時の on-demand 再検証。

### Task 5-1: Shopify Webhook エンドポイント (TDD)
- [ ] テスト: `src/app/api/revalidate/shopify/route.test.ts`
  - HMAC-SHA256 署名検証 (`crypto.timingSafeEqual` で定長比較)
  - `products/update` トピックで `revalidateTag('shopify-products')` + `revalidateTag('product:'+handle)` 発火
  - `inventory_levels/update` トピックで在庫タグ無効化
  - 認証失敗時は 401、汎用メッセージのみ返却
  - 初期リリースでは外部DBを使った冪等性チェックは入れない。Shopify の webhook ID / topic をログに残し、同じ通知が複数回来ても `revalidateTag` が複数回走るだけで壊れない設計にする
- [ ] 実装: `src/app/api/revalidate/shopify/route.ts`
  - bodyは `await request.text()` で raw 取得 (HMAC計算用)
  - eventual consistency 対策で 60秒遅延 revalidate も併走 (二段階発火)

### Task 5-2: Shopify Webhook 設定 (3 環境分離)

開発フェーズで Webhook を継続的にテストするため、**ローカル開発と Preview / Production で別の Webhook 登録先**を用意する。

**ローカル開発 (Cloudflare Tunnel 推奨)**:
- [ ] `cloudflared` インストール (`brew install cloudflared`)
- [ ] Cloudflare アカウントでドメイン認証 (`cloudflared tunnel login`)
- [ ] Named tunnel 作成 (固定 URL):
  ```bash
  cloudflared tunnel create bigban-dev
  cloudflared tunnel route dns bigban-dev dev-webhook.thepicklebangtheory.com
  cloudflared tunnel run --url http://localhost:3000 bigban-dev
  ```
- [ ] 開発ストアの Webhook 登録: `https://dev-webhook.thepicklebangtheory.com/api/revalidate/shopify`
- [ ] **代替**: ngrok の static domain (無料枠) を使う場合は `ngrok http 3000 --domain=stable-name.ngrok-free.app`

**Vercel Preview** (チーム/長期 QA 用):
- [ ] `staging` ブランチを立てて Vercel Alias URL を固定 (例: `bigban-staging.vercel.app`)
- [ ] 開発ストアの Webhook 登録: `https://bigban-staging.vercel.app/api/revalidate/shopify`

**Production** (フェーズ 7 で実施):
- [ ] 本番ストアの Webhook 登録: `https://thepicklebangtheory.com/api/revalidate/shopify`

**共通 (各環境で実施)**:
- [ ] Shopify Admin → Settings → Notifications → Webhooks で以下を登録:
  - `products/update`
  - `products/delete`
  - `inventory_levels/update`
- [ ] HMAC secret を Vercel 環境変数 `SHOPIFY_WEBHOOK_SECRET` に環境別登録 (本番 secret は別値)
- [ ] Shopify CLI の `shopify webhook trigger` で手動再現テスト可能 (任意)

---

## フェーズ 6: E2E テスト導入 (W3)

Playwright を新規導入し、決済フロー含めた重要パスを検証。

### Task 6-1: Playwright セットアップ
- [ ] `npm install -D @playwright/test`
- [ ] `playwright.config.ts` を作成 (Chromium + Firefox + WebKit)
- [ ] `tests/e2e/` ディレクトリ作成
- [ ] `.gitignore` に `test-results/`, `playwright-report/` 追加
- [ ] CI (Vercel preview) で実行する設定

### Task 6-2: E2E ケース実装
- [ ] `tests/e2e/shop-listing.spec.ts`: パドル一覧が Shopify データで描画される
- [ ] `tests/e2e/shop-pdp.spec.ts`: PDP に必要情報が全て表示される
- [ ] `tests/e2e/shop-add-to-cart.spec.ts`: Add to Cart で Shopify Cart に追加される
- [ ] `tests/e2e/shop-cart-drawer.spec.ts`: CartDrawer で数量変更・削除ができる
- [ ] `tests/e2e/shop-checkout.spec.ts`: Checkout ボタンで `checkout.thepicklebangtheory.com` に遷移する
- [ ] `tests/e2e/shop-out-of-stock.spec.ts`: 在庫切れ商品で Add to Cart が無効化される
- [ ] `tests/e2e/shop-i18n.spec.ts`: ja/en 切替で商品名・本文・価格が切り替わる (Shopify Markets 翻訳)
- [ ] `tests/e2e/shop-a11y.spec.ts`: axe-core で全ページ違反ゼロ
- [ ] `tests/e2e/shop-responsive.spec.ts`: 375 / 768 / 1440 px で崩れない

### Task 6-3: GA4 / Analytics 統合
- [ ] GA4 Admin → Data Streams → Configure your domains に両ドメイン追加
- [ ] Referral exclusion list に `checkout.thepicklebangtheory.com` 追加
- [ ] Shopify Admin → Sales channels → Online Store → Preferences に GA4 measurement ID 設定 (Shopify ホストのチェックアウトでも計測される)

---

## フェーズ 7: 内部テスト・本番リリース (W3〜W4)

実テスト注文を行い、配送・受領まで通しで検証。

### Task 7-1: テスト注文 (内部)
- [ ] Shopify Admin で「テストモード」を有効化
- [ ] 全決済方法 (クレカ / Apple Pay / Google Pay) でテスト購入
- [ ] 注文確認メールが届くこと
- [ ] 領収書に T 番号が記載されること
- [ ] 配送ラベルが Ship&co 経由で発行できること
- [ ] 追跡番号が顧客にメール送信されること

### Task 7-2: 法務最終確認
- [ ] `/tokushoho` の本番公開
- [ ] プラポリ更新の本番公開
- [ ] 返品ポリシーの公開
- [ ] Shopify 注文確認画面が特商法 2022 改正準拠であることを最終確認 (総額・支払時期・引渡時期・解除条件)

### Task 7-3: ドメイン・SSL 最終確認
- [ ] `checkout.thepicklebangtheory.com` で SSL 証明書が有効
- [ ] Apple Pay 検証が Shopify 側で完了している (Shopify Admin → Settings → Payments → Apple Pay)
- [ ] DNS 伝播完了

### Task 7-4: パフォーマンステスト
- [ ] Lighthouse (`/shop`, `/shop/paddles/[handle]`) で Performance 90+
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1
- [ ] バンドルサイズ確認 (`/shop` ルートで初期 JS < 200KB gzip)

### Task 7-0: 開発ストア → 本番ストアへの設定移植 ⭐ 重要
開発ストアで確立した設定・データを本番ストアに移植する。Shopify ネイティブ機能で 100% 自動移行はできないため、**3 段階構成** で実施。

**1. Metafield Definitions (型定義) を本番ストアに先に作成**
- [ ] 本番ストア Admin → Settings → Custom data → Products で開発ストアと **同じ namespace.key で全 metafield を再定義**
- [ ] 値があっても定義が無いと CSV インポートで無視されるため、定義作成が **必須の先行ステップ**

**2. 商品データ移行 (CSV)**
- [ ] 開発ストア Admin → Products → Export → All products (CSV ダウンロード)
- [ ] 本番ストア Admin → Products → Import → CSV アップロード
- [ ] 商品 handle / variant / 画像 URL は維持される
- [ ] **Product metafield の値は CSV インポートで対応可能**
- [ ] Variant / Customer / Order metafield や Metaobject は CSV 非対応 → **Matrixify アプリ** または **Accentuate Custom Fields** で個別移行

**3. その他の設定移植 (手動再設定)**
- [ ] 配送ゾーン / 送料設定
- [ ] 税設定 (消費税 10% / 税込総額表示)
- [ ] チェックアウトカスタマイズ (ロゴ / アクセントカラー / フォント)
- [ ] Shopify Markets と多言語設定
- [ ] 翻訳 (Translate & Adapt) は Matrixify で移行可能、または手動再入力
- [ ] Webhook 登録 (本番 URL)
- [ ] Headless チャネル (Sales channels → Headless) を本番ストアでも作成、本番トークン発行

**4. URL handle の維持確認**
- [ ] 移行後、商品 URL (`/products/[handle]`) が開発ストアと同じであること
- [ ] SEO リダイレクトは Admin → Online Store → Navigation → URL Redirects で別途設定 (必要時)

### Task 7-5: 本番リリース
- [ ] Vercel Production 環境変数で `USE_SHOP=true`
- [ ] Vercel Production 環境変数を **本番ストアのトークン・ドメイン** に切り替え
  - `SHOPIFY_STORE_DOMAIN=thepicklebangtheory.myshopify.com`
  - `SHOPIFY_STOREFRONT_PRIVATE_TOKEN=<本番値>`
  - `NEXT_PUBLIC_SHOPIFY_STOREFRONT_PUBLIC_TOKEN=<本番値>`
  - `SHOPIFY_WEBHOOK_SECRET=<本番値>`
- [ ] 本番ストアの Webhook URL を `https://thepicklebangtheory.com/api/revalidate/shopify` に登録
- [ ] グローバルナビに "Shop" 追加 (既存 `Navigation.tsx`)
- [ ] sitemap.xml 再生成
- [ ] アナウンス用ニュース記事を microCMS で公開 (既存ニュース機能)

---

## フェーズ 8: 公開後の運用 (継続)

### Task 8-1: KPI 計測
- [ ] 月次レビュー: 月商 / 受注件数 / CVR / 平均客単価 / リピート率 / カゴ落ち率 / 決済方法別選択率
- [ ] Shopify Analytics + GA4 でダッシュボード確認

### Task 8-2: 撤退判定
- [ ] 3ヶ月連続 月商 30万未満で撤退検討
- [ ] CVR < 0.5% が続く場合は商品ページ改善 (写真・コピー)

### Task 8-3: KOMOJU 追加判定 (将来)
- [ ] 月商 100万到達 / 受注 50件/月 でトリガー
- [ ] 決済方法別の選択率データから日本決済追加の効果を試算
- [ ] 別仕様書 `docs/superpowers/specs/yyyy-mm-dd-shop-paddle-komoju-design.md` を起票

### Task 8-4: カテゴリ拡張 (将来)
- [ ] アクセサリー (グリップテープ / ボール / バッグ) や アパレル (Tシャツ / ウェア) 追加時:
  - Shopify でコレクション追加
  - 必要に応じて metafield スキーマ拡張
  - Next.js 側にカテゴリ別レイアウト (`/shop/accessories/[handle]` 等) 追加

### Task 8-5: Headless 完全化 (将来)
- [ ] 月商 800〜1000万到達でトリガー
- [ ] 現アーキテクチャをそのまま発展 (Cart 自前 UI 化等)
- [ ] 別仕様書を起票

---

## ドキュメント

### Task D-1: 運営マニュアル
- [ ] `docs/operations/shop-admin-manual.md` を作成
  - Shopify Admin の使い方 (商品登録 / metafield 入力 / 在庫更新 / 受注確認 / ラベル発行)
  - editorial 文体の入稿テンプレート (descriptionHtml + metafield rich_text)
  - Shopify Markets での翻訳手順
  - 注文〜発送のフロー
  - 返品・キャンセル対応手順

### Task D-2: 開発者向けドキュメント
- [ ] `README.md` の Project Structure セクションに `/shop` を追記
- [ ] `CLAUDE.md` にパドルEC関連のコーディング規約・テスト方針を追記
  - Shopify Storefront API 使用ルール (素 fetch + `next.tags`)
  - Cart Cookie は Next.js 側の cart ID 保存用であり、Shopify Checkout との共有を前提にしないこと
  - Server Component / Client Component の使い分け
  - サニタイズ (`lib/shopify/sanitize.ts`) は Server 限定

---

## リスク・落とし穴チェックリスト

設計書 §6 リスクと緩和策の各項目を実装中に必ずレビューする:

- [ ] Shopify Webhook と Storefront API の eventual consistency: 60秒遅延 revalidate を入れたか
- [ ] Cart Cookie の Vercel preview 動作: host-only Cookie で cart ID を再利用できるか
- [ ] Shopify テーマ書換型アプリは導入していないか (アプリ依存ガード)
- [ ] PDP の Add to Cart sticky bar がモバイル/デスクトップ両対応
- [ ] reduced-motion で全アニメーションが抑制される
- [ ] axe-core 違反ゼロ
- [ ] テスト coverage 100% 維持
- [ ] サニタイズが Server Component 限定 (クライアントバンドル汚染なし)
- [ ] **開発ストアの 50 件テスト注文制限を超えていないか** (超過時は Bogus Gateway で消費を抑える)
- [ ] **Vercel 環境変数が Production / Preview / Development で正しく分離されているか** (本番ストアトークンが Preview に漏れていないか)
- [ ] **codegen の型定義が最新か** (`shopify:codegen` を実行、CI でチェック)
- [ ] **Headless チャネルの Allowed domains が網羅されているか** (`localhost:3000` / `*.vercel.app` / 本番ドメイン)
- [ ] **Cloudflare Tunnel / ngrok のドメインが Shopify 開発ストアの Webhook 登録と一致しているか**

---

## 開発環境クイックリファレンス

### 環境マトリクス

| 環境 | Shopify ストア | Vercel 環境 | URL | 決済モード |
|------|--------------|------------|-----|-----------|
| ローカル | 開発ストア | development | `localhost:3000` | Bogus Gateway / テストモード |
| ステージング | 開発ストア | preview | `bigban-staging.vercel.app` | Bogus Gateway / テストモード |
| 本番 | 本番ストア | production | `thepicklebangtheory.com` | Shopify Payments 本番 |

### 決済テストカード番号 (Shopify Payments テストモード)

| シナリオ | カード番号 |
|---------|----------|
| 成功 | `4242 4242 4242 4242` |
| 拒否 (decline) | `4000 0000 0000 0002` |
| 3D Secure 認証 | `4000 0000 0000 3220` |
| 資金不足 | `4000 0000 0000 9995` |
| チャージバック | `4000 0000 0000 0259` |

CVV: 任意の 3 桁、有効期限: 未来の任意の月。

### Bogus Gateway (Shopify Payments を介さないテスト)

- カード番号 `1` → 成功
- カード番号 `2` → 拒否
- カード番号 `3` → 例外
