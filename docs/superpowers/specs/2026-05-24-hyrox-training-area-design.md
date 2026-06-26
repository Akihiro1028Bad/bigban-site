# HYROX トレーニングエリア 設計書

**作成日**: 2026-05-24
**ブランチ**: `feature/hyrox-training-area`
**対象**: `THE PICKLE BANG THEORY` ブランドサイト（Next.js 16 + next-intl + Vercel）

## 1. 背景と目的

施設に HYROX（ランニング8km＋8種目のファンクショナルワークアウトで構成される世界的フィットネスレース）のトレーニングエリアを新設する。これをサイト上で **ピックルボールと並ぶ「第二の柱」** として打ち出す。

現状、`src/components/home/HomeFacility.tsx` の機能リストに `trainingArea`（「準備中」注記つき）が存在するのみで、HYROX 専用の訴求面は無い。本施策はこの実体化にあたる。

> **重要な前提**: コンテンツ（コピー・写真・動画・プログラム・料金）は**未確定**。本設計は「プレースホルダ／Coming Soon を許容し、後から構造を変えずに値だけ差し替えられる」ことを必須要件とする。

## 2. 要件サマリ

| 要件 | 内容 |
|------|------|
| 位置づけ | ピックルボールと並列の「第二の柱」 |
| レイアウト方向 | HYROX 独立専用ページ `/hyrox` ＋ ホームに誘導カード（ブレスト Demo B 採用） |
| 言語 | 日本語（デフォルト）/ 英語（`/en` 配下） |
| コンテンツ格納 | next-intl 静的（microCMS 化しない） |
| 公開状態 | index 維持（noindex 不要）。料金・写真のみ Coming Soon プレースホルダ |
| 世界観 | 既存のダーク・シネマティック＋ライム差し色を完全踏襲（HYROX 独自色は持ち込まない） |
| 既存ページ影響 | ナビ・フッター・sitemap への導線追加、`HomeFacility` の `trainingArea` を相互リンク化、ホームに誘導カード挿入 |

## 3. 情報設計（IA）

### 3.1 ルーティング

- **`src/app/[locale]/hyrox/page.tsx`** を既存 `about` ページと同型で新設。
  - Server Component（`page.tsx`）＋ クライアント描画用コンポーネント分離。
  - `parseLocale(rawLocale)` で絞り込み → 不正なら `notFound()`、`setRequestLocale(locale)`。
  - 外部データ依存が無いため `force-dynamic` は不要（`about` の `force-dynamic` は microCMS 起因）。静的レンダリング。
  - `loading.tsx` / `error.tsx` を併置。
- URL: ja=`${SITE_URL}/hyrox`、en=`${SITE_URL}/en/hyrox`。

### 3.2 グローバルナビ

- `src/components/home/HomeNavigation.tsx` の `NAV_ITEMS` に `services` の直後で追加:
  `{ id: "hyrox", kind: "page", href: "/hyrox" }`
- アンカー追跡用 `SECTION_IDS` には**追加しない**（別ページのため active 判定対象外）。
- 予約 CTA（`RESERVE_URL`）は現状維持。HYROX ページ内 CTA は Coming Soon 期間は予約 CTA 流用または「お問い合わせ」。
- `messages/{ja,en}.json` の `Navigation` に `hyrox` ラベルを追加。

### 3.3 ホーム誘導カードの設置位置

- `src/app/[locale]/page.tsx` のセクションフロー `HomeServices → HomePricing` の**間**に `HomeHyroxPromo` を挿入。
- サービス紹介の流れを受けて第二の柱を強調し、料金へ自然に接続する。

### 3.4 既存 `HomeFacility` との整合（重複回避）

- `HomeFacility.tsx` の `trainingArea` 項目は施設設備の事実列挙として残す。
- 「準備中」注記を `/hyrox` への相互リンクに置換。役割を「施設＝設備の列挙／カード＝専用ページ導線」と分離して重複感を回避。

### 3.5 回遊・その他

- パンくず: `buildBreadcrumb(locale, [{ name: "HYROX", path: "/hyrox" }])` を付与（`about` と同様）。
- フッター: `HomeFooter` の既存 `NAV_KEYS` はアンカー前提のため混在不可。`tokushoho` と同じ `next-intl` の `Link href="/hyrox"` で**別枠リンク**として追加。
- sitemap: `src/constants/routes.ts` の `SITEMAP_ROUTES` に `/hyrox`（priority 0.8, changeFrequency monthly 目安）を1行追加。`sitemap.ts` が ja/en/x-default を自動生成。

## 4. UX / ビジュアル設計

世界観統一の鍵は**既存トークンの再利用**（`bg-deep-black` / `text-text-light` / `bg-accent`（ライム） / `EASE = [0.25,0.46,0.45,0.94]` / serif `font-black tracking-[0.15em]` 見出し＋英字ラベル＋`w-14 h-[3px] bg-accent` 下線バー）。HYROX の差別化は配色ではなく「数字・反復・8 という競技性のモチーフ」で表現し、ライムアクセントは維持する（ブランド分裂防止）。

### 4.1 `/hyrox` ページのセクション構成

1. **Hero**（`HomeHero.tsx` 流用）— 16:9 背景（当面 `/images/comingsoon.jpg`）＋オーバーレイ＋ブルーアンビエントグロー。serif 大見出しを行マスクで順次リビール。英字タグライン「RUN. WORKOUT. REPEAT.」。ピックルボール Hero と「同じ型・別コピー」で姉妹ページ感。
2. **What is HYROX**（`HomeFacility` の Key Numbers 大数字グリッド＋ DecoTurf 説明を合成）— 「8km RUN / 8 WORKOUTS / 1 RACE」を大数字で提示。HYROX の「数字で語る競技」性と噛み合う。
3. **8 Stations**（ページの華）— `primarySpecs` のグロー上線カードを 8 枚グリッドに展開（mobile 1列 / tablet 2列 / desktop 4×2）。`01`–`08` の serif 連番（`HomeServices` の番号スタイル流用）、種目名 EN/JA＋一言。スタッガーリビール。
4. **Program / Pricing**（`HomePricing.tsx` 流用）— コンテンツ未確定のため当面「Coming Soon」プラン枠＋CTA。

### 4.2 ホーム誘導カード `HomeHyroxPromo`

- `HomeServices` のサービス行（画像＋テキスト、serif 番号、ライム CTA）を1枚流用。
- 上線グロー＋ comingsoon 画像。CTA 文言型: 英字 uppercase「DISCOVER HYROX →」/ 和文補助「第二の柱、始動」。

### 4.3 レスポンシブ

- 共通: `mx-auto max-w-7xl px-6 lg:px-12`、画像は mobile で `-mx-6 w-[calc(100%+3rem)]` の edge-to-edge（既存踏襲）。
- 1440: 8 stations 4列 / Key Numbers 横3。768: stations 2列。375: 全1列、`border-t border-text-gray/10` で縦区切り。

### 4.4 アニメーション（Framer Motion）

- Hero: 行マスクの順次リビール（既存 `0.3 + i*0.15` 同等の delay 設計）。
- リビール: 全 `whileInView` ＋ `viewport={{ once: true, margin: "-150px" }}`、`opacity`/`y` のみ。
- Stations スタッガー: `delay: 0.1 + i*0.06`。
- `prefers-reduced-motion` 尊重、transform/opacity のみで安全。

### 4.5 Coming Soon を「ダサくなく」見せる

- プレースホルダ画像に `bg-black/50` オーバーレイ＋ブルーグロー＋ライム細字ラベル「COMING SOON / 準備中」（既存 `features.preparing` の `text-accent/60 tracking-wider` 流用）。
- 写真の生っぽさをグレーディングで隠し、エディトリアルな"予告"として演出。
- 画像配列・コピーは定数化して差し替え容易にする。

## 5. コンテンツ設計 & SEO

### 5.1 格納先の判断

**next-intl 静的（`messages/*.json`）を採用。microCMS 化しない。**

理由: 既存方針が「静的文言は next-intl、頻繁更新の時系列コンテンツ（ニュース）のみ CMS」。HYROX のコピー・8種目・料金は構造が固定でほぼ不変、ja/en 厳密対訳が必須、ビルド時バンドル配信が最速。8種目は文言というより設計仕様であり、定数配列＋メッセージ参照が既存（`buildServices()`）に整合。CMS 化は料金/プログラムの頻繁な差し替え運用が確定した段階の将来拡張で十分。

### 5.2 messages 追加名前空間

既存の二層構造を踏襲（ja/en で**同一キー構造**を厳守。next-intl の欠損キー検出のため）:

- **`Metadata.hyrox`**: `title` / `description` / `keywords[]`（`Metadata.home` と同型）。
- **`HyroxPage`**: `hero`（title/subtitle/tagline/cta/statusBadge）/ `whatIs`（heading/lead＋`keyNumbers`: `value`/`labelEn`/`labelJa`）/ `stations.station01..08`（`name`/`nameJa`/`description`）/ `programs.programNN`（`titleJa`/`titleEn`/`description`）/ `pricing`（`HomePricing` 同型、未確定は `preparing: "準備中"`）。
- ホーム誘導カード用に `hyrox` 系キーを追加。
- 未確定値は `"Coming Soon"` / `"準備中"` プレースホルダで埋める。

### 5.3 メタデータ戦略

`generateMetadata` パターン（`page.tsx` / `about/page.tsx`）を流用。canonical = ja `${SITE_URL}/hyrox` / en `${SITE_URL}/en/hyrox`、`alternates.languages` に ja/en/x-default、OG locale 切替。

キーワード軸（日本市場の実検索語方向性）: 「HYROX」「ハイロックス」「HYROX 千葉/市川/本八幡」「HYROX ジム/トレーニング/体験」「ファンクショナルフィットネス」「機能性トレーニング」。既存ブランド語も併載しブランド集約。

### 5.4 構造化データ

- `buildServices()` に HYROX を `Service`（serviceType: "HYROXトレーニング"、provider `#facility`）として追加（最小変更で整合）。
- HYROX ページに `ExerciseGym`（`@id: ${SITE_URL}/#hyrox`、または既存 `SportsActivityLocation` の `sport` を `["Pickleball","HYROX","Functional Fitness"]` に拡張）＋ `buildBreadcrumb` を付与。
- 8種目は `amenityFeature` 等まで踏み込まず、まずは `Service` + breadcrumb で十分。

### 5.5 Coming Soon の SEO 扱い

**公開（index）し、薄くしすぎない。noindex は不要。**

理由: 開業前から「HYROX 千葉/本八幡」の指名・準指名検索を獲得しブランド権威を蓄積したい。What is HYROX 解説＋8 stations＋開業日（2026-04-18）＋「料金は準備中」明示で実体あるページにする。料金/写真のみ `準備中`/`Coming Soon` プレースホルダにし、開業後は値だけ差し替え（構造変更なし）。

## 6. 新規 / 変更ファイル

### 新規

| ファイル | 役割 | 目安 |
|---------|------|------|
| `src/app/[locale]/hyrox/page.tsx` | Server Component。メタデータ＋セクション組み立て | — |
| `src/app/[locale]/hyrox/loading.tsx` / `error.tsx` | ローディング / エラー境界 | — |
| `src/components/hyrox/HyroxHero.tsx` | ヒーロー（`HomeHero` 流用） | ~150行 |
| `src/components/hyrox/HyroxIntro.tsx` | What is HYROX ＋ Key Numbers | ~200行 |
| `src/components/hyrox/HyroxStations.tsx` | 8種目グロー上線カードグリッド | ~250行 |
| `src/components/hyrox/HyroxProgram.tsx` | program/pricing（`HomePricing` 流用） | ~200行 |
| `src/components/hyrox/stations.ts` | 8 stations 定数（差し替え用） | — |
| `src/components/home/HomeHyroxPromo.tsx` | ホーム誘導カード（`HomeServices` 流用） | ~150行 |
| 各 `.test.tsx` | コンポーネント併置テスト（TDD・100%カバレッジ方針） | — |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/app/[locale]/page.tsx` | `HomeServices` と `HomePricing` の間に `HomeHyroxPromo` を挿入 |
| `src/components/home/HomeNavigation.tsx` | `NAV_ITEMS` に `hyrox`（`kind:"page"`）を `services` 直後に追加 |
| `src/components/home/HomeFacility.tsx` | `trainingArea` の「準備中」注記を `/hyrox` 相互リンクに置換 |
| `src/components/home/HomeFooter.tsx` | `tokushoho` 同様の `Link href="/hyrox"` を別枠で追加 |
| `src/constants/routes.ts` | `SITEMAP_ROUTES` に `/hyrox` を追加 |
| `src/lib/structured-data/*` | `buildServices()` に HYROX Service 追加、`ExerciseGym`/`sport` 拡張 |
| `messages/ja.json` / `messages/en.json` | `Metadata.hyrox`・`HyroxPage`・`Navigation.hyrox`・誘導カード文言を追加 |

## 7. 開発方針

- **TDD（Red → Green → Refactor）必須**。各コンポーネントはレンダリング/インタラクションのテストを先に書く。
- アクセシビリティ: セマンティック HTML、`alt`、`label`、キーボード操作、WCAG 2.1 AA、`prefers-reduced-motion`。
- next/image・next/font 利用。クライアント境界は最小（Framer Motion 利用箇所のみ `"use client"`）。
- テストカバレッジ 100% 方針を維持。

## 8. スコープ外（YAGNI）

- HYROX コンテンツの microCMS 化（将来、料金/プログラムの頻繁な差し替え運用が確定した段階で検討）。
- 実コピー・写真・動画・料金の制作（コンテンツ確定後に値を差し替え）。
- 予約システムの新設（既存 `RESERVE_URL` を流用）。

## 9. 未決事項（コンテンツ確定待ち）

- HYROX の正式キャッチコピー / 本文（ja/en）。
- 8種目の表記ゆれ確認（公式種目名）と各説明文。
- 料金・プログラムの有無と内容（初期から出すか Coming Soon のままか）。
- 実写真・動画の用意時期。
- HYROX 公式アフィリエイト（認定ジム等）の有無 → 表記・ロゴ利用可否。
