# コラム/ガイド CMS 分離設計 — グロース記事を news から `columns` へ

- 日付: 2026-07-02
- ステータス: ドラフト（レビュー待ち）
- 関連: `2026-04-19-news-cms-integration-design.md`（news CMS 基盤）/ `docs/operations/growth/50-publish-metrics.md`（公開キュー #H23/#H24・計測 #C4）

## §1 背景・課題

グロースループが生成する SEO 記事（記事タイプ: 獲得/不安解消/資産/比較/イベント）は、現在すべて microCMS の `news` エンドポイントへ公開される（`src/app/api/growth/publish/route.ts:28` ほか `scripts/growth/` 7 ファイルで `ENDPOINT = "news"` ハードコード）。

一方 news のカテゴリは `お知らせ/メディア掲載/イベント情報/キャンペーン`（`src/constants/news.ts`）で、**告知系の時系列コンテンツ**を想定した設計。エバーグリーンな検索流入記事が混在することで:

1. **SEO**: 鮮度型の `/news/` 階層に資産記事が埋まり、トピッククラスタ（サイロ）構造が作れない。
2. **UX**: 施設のお知らせを見たい来場者と、競技を調べる検索流入者が同じ一覧に混ざる。
3. **計測**: Notion の記事仮説（記事タイプ・成功指標）が CMS 側に載らず、公開後レビュー（#C4）と分断。

## §2 ゴール / 非ゴール

### ゴール
- microCMS に新 API `columns` を追加し、グロース記事の公開先を `news` → `columns` へ切り替える。
- フロントに `/[locale]/columns`（一覧）+ `/[locale]/columns/[slug]`（詳細）を追加。既存 news 基盤（レンダラ・サニタイズ・revalidate・draft preview）を最大限流用。
- `ENDPOINT = "news"` の散在を一本化し、切替を 1 箇所の変更で済むようにする。
- Notion の記事仮説のうち `記事タイプ` を CMS スキーマへ載せ、計測ループと一気通貫にする。

### 非ゴール
- コーナーストーン静的ページ（総合ガイド）— 別施策（本設計の「将来」§10 参照）。
- FAQ コンテンツタイプ — 別施策。
- news 側の既存カテゴリ・UI の変更（news は告知専用として現状維持）。
- 承認画面（/growth/approve）の UI 変更（公開先が変わるだけで操作は不変）。

## §3 アーキテクチャ決定（AD）

| # | 決定 | 理由 |
|---|---|---|
| AD1 | 新 API `columns` を **news とは別エンドポイント**として作る（news のカテゴリ追加ではない） | URL 階層 `/columns/` を分けないと SEO サイロの利点が出ない。news の運用（非エンジニアの告知投稿）を壊さない |
| AD2 | スキーマは news をベースに複製し、`articleType` を追加・告知専用フィールドを削る | zod スキーマ・レンダラ・下書きペイロード（`scripts/growth/draft-content.ts`）の流用コスト最小 |
| AD3 | エンドポイント名は growth 側で `GROWTH_MICROCMS_ENDPOINT`（env・既定 `"news"`）に一本化 | 8 ファイルのハードコード解消。dev で `columns` 先行検証→本番切替が env だけで済む。ロールバックも env 戻しのみ |
| AD4 | フロントは feature flag `USE_CMS_COLUMNS`（既定 false）で段階公開 | `USE_CMS_NEWS` と同じ運用パターン（`src/config/featureFlags.ts`） |
| AD5 | 既存の公開済みグロース記事は microCMS 上で `columns` へ複製し、`/news/[slug]` → `/columns/[slug]` を 301 | 本数が少ないうちに URL を確定させる。評価の引き継ぎ |
| AD6 | スキーマ(API)自体の作成は**管理画面から手動**（スキーマ JSON インポート利用）。コンテンツ移行・投入は MCP で自動化 | microCMS の API 作成/スキーマインポートは管理画面専用機能（§8）。MCP(Management API) にスキーマ作成ツールは存在しない |
| AD7 | 読者向けカテゴリは**別 API `column-categories`（マスタ）＋ columns からのコンテンツ参照**で持ち、編集者が管理画面で動的に増減できる | 「カテゴリを microCMS 側で動的に」の要件。セレクト（スキーマ固定）では非エンジニアがデプロイ無しに増やせない。公式の参照フィールド＋`depth` で展開（context7 裏取り済み） |
| AD8 | `category`（動的・読者向け）と `articleType`（固定セレクト・内部計測）は**別軸で共存** | category=読者の回遊/SEO サイロ用、articleType=Notion 仮説と #C4 計測用。役割が違うので統合しない |
| AD9 | カテゴリの色は `column-categories` の **`color` フィールド**に持たせ編集者管理 | news の色ハードコード（`constants/news.ts`）を踏襲しない。動的カテゴリなのでフロントに色を焼き込めない |
| AD10 | 正典カテゴリは**読者向けタクソノミ6件**を content ID 安定キー（`start`/`rules`/`improve`/`health`/`compare`/`event`）で seed し、growth の articleType→category は**多対一の既定マッピング**で解決 | AD8 の「別軸」を貫徹（articleType のクローンを読者に見せない）。国内外ピックルボールメディアの分類実態に基づく（§4.2）。動的カテゴリでも AI 自動付与を壊さない。追加カテゴリは手動付与用 |
| AD11 | 「地域（市川・本八幡）」は**カテゴリにしない** | ローカルは本サイトの前提であり、ほぼ全記事がローカル文脈を持つ。1記事1カテゴリ（単一参照）の軸としては直交しない。地域軸が要るなら将来タグ（複数参照）で追加 |

## §4 microCMS スキーマ設計（`columns` API・リスト形式）

news スキーマ（`src/lib/microcms/schema.ts`）をエクスポートした JSON を土台に、以下の差分で定義する:

| フィールド | 型 | news からの変更 |
|---|---|---|
| `title` | テキスト | そのまま |
| `slug` | テキスト（`/^[a-z0-9-]+$/`） | そのまま |
| `locale` | セレクト（ja/en・単一） | そのまま |
| `displayMode` | セレクト（html/rich・単一） | そのまま |
| `bodyHtml` / `body` | テキストエリア / リッチ | そのまま |
| `excerpt` | テキスト | そのまま（メタディスクリプション） |
| `eyecatch` | 画像 | そのまま |
| **`articleType`** | **セレクト（獲得/不安解消/資産/比較/イベント・単一）** | **新規**。Notion `記事タイプ` をミラー（内部計測軸・#C4） |
| **`category`** | **コンテンツ参照（`column-categories` を1件参照）** | **新規（動的）**。読者向けカテゴリ。編集者が microCMS で増減。AI は articleType から既定付与（§6.2） |
| `externalLink` | — | **削除**（告知用） |

- `articleType` の選択肢ラベルは news と同じく**日本語運用**。zod 側で日本語→ID transform（news の `categoryEnum` と同パターン）。
- `category` は参照フィールドのため、取得時に `depth=1` で展開（§5.2）。**単一参照**（1記事1カテゴリ）で開始。複数付けたくなったら複数コンテンツ参照へ拡張可。

### §4.1 カテゴリマスタ `column-categories` API（リスト形式・新規）

| フィールド | 型 | 用途 |
|---|---|---|
| （content ID） | 文字列（作成時に指定） | **安定キー**。正典6件は §4.2 参照。growth の解決キー |
| `name` | テキスト | 表示名（ja）。編集者が自由に変更可 |
| `nameEn` | テキスト | 表示名（en）。未設定は name フォールバック |
| `color` | テキスト（HEX） | チップ色。編集者管理（AD9） |
| `order` | 数値 | 一覧フィルタの並び順（任意） |

- **seed（正典6件・§4.2）**: 上記 content ID で MCP から投入（content ID 指定作成。MCP ツールが `id` 指定不可の場合は Content API `PUT /{endpoint}/{contentId}` を直叩き — 実装時確認）。表示名/色は §4.2 の初期値を入れ、以後は編集者が管理画面で調整。
- 編集者が正典以外のカテゴリを追加した場合、それは**手動付与専用**（AI は正典しか自動選択しない・§6.2）。
- zod: category は `depth=1` 展開後の `{ id, name, nameEn, color, order }` を検証。**参照先が下書き/削除済みだと null が来るため `nullish` 必須**。欠落耐性（color 未設定→フロント既定トーン、nameEn 未設定→name）。

### §4.2 デフォルトカテゴリ定義（正典6件・リサーチ根拠付き）

国内ピックルボール専門メディア（ピックルボールワン=基本/コラム/道具、ピクラ、ピックルタイムス=基礎知識ほか）と英語圏（USA Pickleball / Pickleheads 等: Beginners / Rules / Strategy / Gear / Fitness）の分類、および growth の狙い目テーマ（weekly.md: ローカル一次体験・屋内体験価値・継続と仲間づくり・他競技からの移行・シニア健康・不安解消）を突き合わせて定義:

| content ID | name（ja・初期値） | nameEn（初期値） | color（初期値） | 収容する記事 | 対応する狙い目テーマ |
|---|---|---|---|---|---|
| `start` | はじめ方・体験 | Getting Started | `#C8FF00` | 始め方・体験の流れ・一人参加・持ち物・不安解消 | ①ローカル一次体験 ⑥一人参加の不安解消 |
| `rules` | ルール・基礎知識 | Rules & Basics | `#8AB4FF` | ルール・用語・キッチン・スコア・コート知識 | （資産の土台・全メディア共通の主要分類） |
| `improve` | 上達・楽しみ方 | Skills & Play | `#FFB020` | 練習法・戦術・上達・仲間づくり・他競技経験者の移行 | ③継続・上達・仲間づくり ④移行ガイド |
| `health` | 健康・カラダ | Health & Fitness | `#6EE7B7` | 運動効果・シニア・ケガ予防（効果は断定しない=§5 文体規範） | ⑤シニアの健康 |
| `compare` | 比較・選び方 | Compare & Choose | `#C9A6FF` | 他競技比較・屋内/屋外比較・施設/コートの選び方 | ②屋内施設の体験価値（比較切り口） |
| `event` | イベント・大会 | Events | `#FF6A3D` | 大会・体験会・イベントレポート | （news の「イベント情報」チップ色と統一） |

- **道具（Gear）カテゴリは初期に置かない**: 海外メディアの定番だが、facility-context の未確定情報（レンタル品・販売）を断定できないため AI 生成と相性が悪い。編集者が必要になったら管理画面で追加（動的カテゴリの利点）。
- **地域カテゴリは置かない**（AD11）。
- 色はブランドパレット系統（accent `#C8FF00` を主役の `start` に、news の event 色 `#FF6A3D` を `event` に流用して横断一貫性）。すべて暫定値＝編集者変更可。

## §5 フロントエンド設計

### 5.1 ルート
```
src/app/[locale]/columns/page.tsx        # 一覧（category フィルタタブ・動的）
src/app/[locale]/columns/[slug]/page.tsx # 詳細
```
- 詳細は news 詳細の構成（`NewsBodyRenderer` + sanitize + `generateMetadata`）を流用。
- 一覧の見た目は news カード流用から開始（デザイン刷新は後続）。
- **フィルタタブは `column-categories` を取得して動的生成**（固定配列にしない）。チップ色は各カテゴリの `color`（AD9）。未設定は既定トーン。
- カード/詳細のカテゴリチップも `category.color` を使う（`CategoryChips` の news 実装を参照しつつ色ソースを master 由来へ）。
- `loading.tsx` を各セグメントに配置（規約）。

### 5.2 クエリ・キャッシュタグ
`src/lib/microcms/queries.ts` に columns 版を追加。タグ体系は news と対称:
- `columns`（全体）/ `columns-${slug}-${locale}` / `columns-slugs-${locale}`
- `column-categories`（マスタ一覧）
- columns 取得は **`depth=1`** を付け、参照 `category` を展開（`{id,name,nameEn,color,order}`）。
- カテゴリ絞り込みは microCMS の `filters`（`category[equals]{contentId}`）を利用可。
- カテゴリ編集で一覧の色/名が変わるため、`column-categories` の revalidate（§5.3）で `columns` タグも連鎖 expire する。

### 5.3 revalidate webhook
`src/app/api/revalidate/route.ts` は現在 `api !== "news"` を弾く（`route.ts:73`）。`"news" | "columns" | "column-categories"` の許可リストにし、api 値に応じたタグを expire する。**`column-categories` の更新は `columns` タグも連鎖 expire**（カテゴリ名/色の変更を一覧へ反映）。Webhook は microCMS 管理画面で `columns` / `column-categories` 両 API に同じ URL を設定（HMAC secret 共通）。

### 5.4 draft preview
`src/app/api/draft/enable/route.ts` はパス組み立てが `/news/` 固定（`route.ts:53`）。`endpoint` クエリ（`news`|`columns` 許可リスト）を追加し、リダイレクト先とデータ取得（`getNewsDetail` / `getColumnDetail`）を出し分ける。既定は `news`（後方互換）。

**フラグとの関係**: `USE_CMS_COLUMNS=false` の期間（P4〜P6 前）も microCMS のプレビューボタンは `/columns/[slug]` に飛ぶため、columns ルートは **draftMode 有効時はフラグを無視して描画**する（news 側の `USE_CMS_NEWS` とプレビューの既存挙動を実装時に確認し、同じ規約に揃える）。

### 5.5 sitemap / 内部リンク
- `src/app/sitemap.ts` に columns の URL を追加。
- **注意**: news の slug 取得は `DETAIL_PAGE_STATIC_LIMIT=100` 件で頭打ち（`queries.ts:135` に警告実装あり）。columns は記事が増え続ける前提なので、**最初から offset 反復取得**で全件列挙する（news の既知課題を持ち込まない）。
- 各コラム記事末尾の CTA（予約/アクセス/LINE）は本文生成側（growth プロンプト）の責務で変更なし。

### 5.6 グローバルナビ導線（案A 採用）
ヘッダーナビの「NEWS」の**隣に「COLUMN（コラム）」を追加**する。

- 実装箇所: `src/components/home/HomeNavigation.tsx:16-24` のリンク配列。`news`（`{ id: "news", kind: "page", href: "/news" }`, line 21）の直後に `{ id: "columns", kind: "page", href: "/columns" }` を追加。
- ラベルは i18n（既存の nav ラベルと同機構）に `columns` の ja/en キーを追加（ja: `コラム` / en: `COLUMN`）。
- PC ナビ（`HomeNavigation.tsx:118-122`）とモバイルメニュー（`:196-205`）は同じ配列を描画するため、配列追加のみで両対応。
- `USE_CMS_COLUMNS` は server-only env のため、`"use client"` の `HomeNavigation` からは直接読めない。**リンク配列の追加コミット自体を P6 に含める**のを既定とする（フラグ分岐をクライアントへ渡す配管より単純）。
- news 側からの相互リンク（news 一覧上部に「コラムを読む」）は**任意・後続**。まずはナビ導線を優先。

## §6 グロースループ改修

### 6.1 エンドポイント一本化（先行リファクタ・挙動不変）
`scripts/growth/endpoint.ts`（新規・純ロジック）:
```ts
/** growth 記事の公開先 microCMS エンドポイント。env 未設定は news(現行互換)。 */
export const GROWTH_ENDPOINT = process.env.GROWTH_MICROCMS_ENDPOINT?.trim() || "news";
```
`src/lib/growth/` から再エクスポート（プロジェクト規約: 純ロジック分離・scripts/growth + src/lib/growth 再エクスポート）。

差し替え対象（現在 `const ENDPOINT = "news"`）:
- `scripts/growth/draft-content.ts` / `notify-drafts.ts` / `publish-draft-cli.ts` / `publish-due-cli.ts` / `self-heal-cli.ts` / `eyecatch-regen-cli.ts` / `body-image-regen-cli.ts`
- `src/app/api/growth/publish/route.ts` / `src/app/api/growth/draft/eyecatch/route.ts` ほか `src/app/api/growth/` 内の `"news"` 参照（実装時に grep で全数確認）

### 6.2 ペイロード拡張（articleType ＋ category 既定付与）
`draft-content.ts` の payload に:
- `articleType`: Notion `記事タイプ` から転記（欠落時は省略＝欠落耐性）。
- `category`: **articleType から既定マッピングで正典カテゴリの content ID を解決**して参照をセット。

既定マッピング（**多対一**・純ロジック `scripts/growth/columnCategory.ts` 新規・`src/lib/growth/` 再エクスポート）:

| Notion 記事タイプ | category content ID | 備考 |
|---|---|---|
| 獲得 | `start` | 来店直結＝入口記事 |
| 不安解消 | `start` | 不安解消も読者導線上は「はじめ方・体験」（獲得と同カテゴリへ多対一） |
| 資産 | `rules` | **既定**。上達系/健康系の資産記事は編集で `improve`/`health` へ振替可 |
| 比較 | `compare` | |
| イベント | `event` | |

- 参照値は **content ID（安定キー）で書けば十分**（`column-categories` を同 ID で seed 済み・AD10）。表示名/色変更に影響されない。
- articleType→category は**あくまで既定値**。読者向けの最終分類は人が承認時 or microCMS で調整できる（動的カテゴリの利点）。
- articleType 欠落/未知 → category も省略（人が後付け）。
- 編集者が増やした追加カテゴリは AI 自動付与の対象外（手動のみ）。
- **将来改善（スコープ外）**: Notion「記事ネタ案」に `コラムカテゴリ` プロパティを追加し、週次モードの AI が提案時に正典6件から直接選ぶ（資産→rules の丸めをなくす）。

### 6.3 切替手順
1. dev サービスに `columns` API 作成 → `GROWTH_MICROCMS_ENDPOINT=columns` + `GROWTH_DRYRUN=1` で下書き生成〜公開キューまで検証。
2. 本番サービスに `columns` API 作成 → 自宅 PC の env を切替。
3. 以降の新規記事は columns へ。news に残る既存記事は §7 で移行。

## §7 既存記事の移行

**順序が重要**: 301 リダイレクトと news 非公開化は、`USE_CMS_COLUMNS=true`（columns ルートが実際に見える状態）**と同時またはその後**に行う。フラグ OFF のまま 301 を先に出すと `/news/x` → `/columns/x`（404）の期間が生じ、検索評価を毀損する。

### P5（準備・フラグ OFF のまま）
1. 対象抽出: news 内のグロース生成記事（少数想定。microCMS MCP `get_list` で棚卸し→リダイレクト表としてレビュー）。
2. MCP で `columns` に同 slug で複製（`create_content_published`）。eyecatch はアセット URL 再利用（同一サービス内）。フラグ OFF のため公開サイトには出ない＝重複コンテンツも発生しない。
3. `next.config.ts` の `redirects()` に `/news/:slug` → `/columns/:slug` の**個別 301**を列挙した変更を**用意**（ワイルドカード不可: 告知記事は news に残る。en 側 `/en/news/:slug` も同様）。**マージは P6**。

### P6（切替と同時）
4. `USE_CMS_COLUMNS=true` + 301 リダイレクトを**同一デプロイ**で有効化。
5. 直後に news 側の旧記事を非公開化（`patch_content_status`）。
6. Search Console で 301 の反映を確認（成功指標: 検索順位の維持）。

## §8 microCMS 改修の実施手段（MCP 可否）

| 作業 | MCP | 備考 |
|---|---|---|
| `columns` API（スキーマ）の新規作成 | ❌ 不可 | Management API/MCP にスキーマ作成ツールが無い。公式手順は**管理画面**「API作成」→「APIスキーマを定義」で JSON インポート（context7 で公式ドキュメント確認済み） |
| `column-categories` API（マスタ）の新規作成 | ❌ 不可 | 同上（管理画面で作成） |
| **参照フィールド `category` の紐付け** | ❌ 不可 | **参照はスキーマ JSON インポートで引き継がれない**（context7 確認済み）。`columns` API 作成後、管理画面で `category` 参照フィールドを追加し `column-categories` を参照先に指定する手動ステップが必要 |
| スキーマ JSON の用意 | ✅（生成のみ） | news スキーマ＋§4 差分の JSON を Claude が生成。参照フィールド分は手動追加前提で注記付き |
| カテゴリ正典5件の seed（安定 content ID 付き） | ✅ 可 | MCP `create_content_published` で `id` 指定（`acquisition` 等）。表示名/色の暫定値を投入 |
| コンテンツ移行（news→columns 複製・非公開化） | ✅ 可 | `microcms-dev` / `microcms-prod` MCP の `get_list` / `create_content_published` / `patch_content_status` |
| メディア | ✅ 可 | 同一サービス内はアセット URL 再利用。必要なら `upload_media` |
| Webhook 設定（revalidate URL 登録） | ❌ 不可 | 管理画面で `columns` / `column-categories` に設定（news 導入時と同手順） |
| API キー権限の確認 | 一部 | `get_api_list` / `get_api_info` で確認可。キー発行・権限変更は管理画面 |

**まとめ**: 手動が必要なのは ①`columns`/`column-categories` の API 作成（スキーマ JSON 読込）②`category` 参照フィールドの紐付け ③Webhook 登録 の3種。カテゴリ seed・記事移行・コード変更は MCP + 実装で完結する。

## §9 実装計画（各 PR < 400 行）

| Phase | 内容 | 依存 |
|---|---|---|
| P1 | growth エンドポイント一本化（`endpoint.ts` + 8 ファイル差替・挙動不変・テスト更新） | なし |
| P2 | microCMS `column-categories`＋`columns` API 作成（**手動**: スキーマ JSON 受け渡し＋`category` 参照フィールド紐付け）→ カテゴリ正典5件を MCP で seed → dev で DRYRUN 検証 | P1 |
| P3 | zod スキーマ（`columnsSchema`＋`columnCategorySchema`・depth1 展開）・クエリ・タグ（`getColumnsList` / `getColumnCategories` 等）+ revalidate（連鎖 expire）/draft-preview の endpoint 対応 | P2 |
| P3.5 | growth の articleType→category 既定マッピング（`columnCategory.ts`）＋ `draft-content.ts` payload に category 付与 | P2 |
| P4 | フロントルート（一覧/詳細/loading/sitemap）+ **動的カテゴリフィルタ・色付きチップ**（master 由来）+ `USE_CMS_COLUMNS` | P3 |
| P5 | 移行**準備**: 対象棚卸し・columns へ複製（MCP）・301 リダイレクト表の用意（**マージしない**） | P4 |
| P6 | 本番切替（同一デプロイ）: `column-categories`/`columns` 作成・seed → `USE_CMS_COLUMNS=true` **+ 301 マージ** + `GROWTH_MICROCMS_ENDPOINT=columns` + Webhook 登録 → 直後に news 旧記事の非公開化 | P5 |

TDD 必須（規約）: P1 は既存テストの ENDPOINT 参照を env 注入可能にする所から。P3/P3.5/P4 は news 側テストのパターン踏襲（category マッピングと depth 展開の zod は純ロジックとして単体テスト）。

## §10 将来（本設計のスコープ外）

- コーナーストーン静的ページ（「市川・本八幡ピックルボール完全ガイド」）→ columns からのハブリンク先。
- FAQ API（`FAQPage` 構造化データ）。
- 計測ループ #C4 に `articleType` 別の集計軸を追加。

## §11 リスク・対策

| リスク | 対策 |
|---|---|
| 切替期間中に news/columns 両方へ記事が散る | env 切替は一斉に実施（P6 で growth・フロント同時）。DRYRUN で事前検証 |
| 301 漏れで検索評価を失う | 移行対象を MCP の全数リストで機械的に抽出し、リダイレクト表をレビュー |
| スキーマインポートの手作業ミス | dev で先に読み込み、`get_api_info` で意図どおりか MCP 検証してから prod へ |
| `articleType` 欠落した旧記事 | スキーマ上任意。フロントは未設定を「その他」表示（欠落耐性の原則） |
| 編集者が正典カテゴリを**削除**し AI 参照 ID が宙に浮く | 正典5件は「削除しない」運用注記＋ growth は書き込み前に存在チェック（欠落時は category 省略でフォールバック）。dev/prod の seed は復元可能に手順化 |
| dev と prod で正典カテゴリの content ID がズレる | seed を MCP スクリプト化し**両環境で同一 ID**（`acquisition` 等）を保証。ID は表示名と独立なので env 差異が出ない |
| 動的カテゴリで色/名が未設定 | zod は欠落耐性（color 未設定→フロント既定トーン、nameEn 未設定→name フォールバック） |
| MCP ツールが content ID 指定作成に未対応 | 実装時に確認。不可なら Content API `PUT /{endpoint}/{contentId}` 直叩き（seed スクリプト側で吸収・§4.1） |
| `資産` 記事が一律 `rules` に丸められ誤カテゴリ表示 | 既定値と割り切り、承認時/microCMS で人が振替（§6.2）。恒久策は Notion `コラムカテゴリ` プロパティ追加（将来改善） |
| フラグ OFF 期間に microCMS プレビューが 404 | columns ルートは draftMode 時フラグ無視で描画（§5.4） |
