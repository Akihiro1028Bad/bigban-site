# AI ニュース生成プロンプトガイド

**対象**: AI agent (ChatGPT / Claude 等) が `THE PICKLE BANG THEORY` のニュースを microCMS に登録する際に使用するシステムプロンプトとルール集
**関連設計書**: `docs/superpowers/specs/2026-04-19-news-cms-integration-design.md` §17 (AI 運用境界)
**関連スキル**: `news-create` (Claude Code グローバルスキル、サイト運用者向け。エンジニア向け詳細仕様は本書を正典とする)

---

## 1. 目的

AI が生成したニュース記事を microCMS Management API 経由で登録する際の **守るべき契約** を定義する。Web サイト側 (Next.js) は §3.2.1 のサニタイズマトリクスでこれらの契約から逸脱した出力を防御するが、契約に従えば「サニタイズで剥がされて見栄えが崩れる」事故を防げる。

---

## 2. 入力 → 出力スキーマ

AI に与える入力（人間からの指示）と、AI が生成する JSON 出力の構造。

### 入力 (人間オペレータから AI への指示)

```yaml
topic: "クラウドファンディング達成のお知らせ"  # 1〜2行で何を伝えるか
key_points:                                  # 箇条書きで盛り込みたい事実
  - "目標金額 1000万円を達成"
  - "支援者数 250名"
  - "次のマイルストーンは 2026-06-01"
category: ["notice"]                         # notice/media/event/campaign 複数選択可
publishedAt: "2026-04-19T10:00:00+09:00"    # ISO8601、予約投稿対応
eyecatch_url: "https://images.microcms-assets.io/assets/<service-id>/abc123.jpg"  # 任意
images:                                      # 本文に埋める画像 (microCMS にアップロード済み URL)
  - url: "https://images.microcms-assets.io/assets/<service-id>/inline1.jpg"
    alt: "メンバー集合写真"
locales: ["ja", "en"]                       # 生成する言語
```

### 出力 (AI が microCMS API に POST する JSON)

各 locale ごとに 1 レコードずつ生成し、Management API でアップサート。

```json
{
  "slug": "crowdfunding-goal-achieved",
  "locale": ["ja"],
  "title": "クラウドファンディング目標金額達成",
  "excerpt": "応援いただいた皆様のおかげで、開業準備のクラウドファンディングが目標の1000万円を達成しました。",
  "category": ["お知らせ"],
  "displayMode": ["html"],
  "bodyHtml": "<p class=\"lead\">...</p><h2>...</h2>...",
  "body": null,
  "eyecatch": { "url": "...", "width": 1920, "height": 1080 },
  "externalLink": { "label": "支援者向けページ", "url": "https://..." },
  "publishedAt": "2026-04-19T10:00:00+09:00"
}
```

> **重要 (microCMS 仕様)**:
> - `locale` / `displayMode` は **複数選択フィールド** で配列。単一値でも `["ja"]` のように配列で送信。
> - `category` も **配列**。**日本語ラベル** で送る (microCMS 管理画面が日本語運用のため)。サイト内部は英語ID (`notice`/`media`/`event`/`campaign`) に Zod transform で変換される。
> - 未入力フィールドは `null` で OK。Zod スキーマ側で `nullish` 対応済み。

### `slug` のルール

- `^[a-z0-9-]+$` (半角英数 + ハイフンのみ)
- 日英で同一 slug を使用 (URL パスで対応関係を取るため)
- 一意性は AI 側で担保 (重複時は microCMS が 422 を返す)

---

## 3. 許可/禁止 HTML タグ・属性 (`bodyHtml`)

実装ソース: `src/lib/news/sanitize.ts`

### 許可タグ (これら以外は DOMPurify で除去)

**ブロック / インライン / 装飾**
```
h2, h3, h4, p, ul, ol, li, a, img, blockquote,
strong, em, code, pre, figure, figcaption, br, hr,
span, aside, mark, time
```

**テーブル系** (モバイルでは横スクロール wrapper が自動付与)
```
table, thead, tbody, tfoot, tr, th, td, caption, colgroup, col
```

### 許可属性

- `<a>`: `href`, `title`, `class`
- `<img>`: `src`, `alt`, `width`, `height`, `class`, `loading`, `decoding`, `fetchpriority`
- `<blockquote>`: `cite`, `class`
- `<th>` / `<td>`: `scope`, `colspan`, `rowspan`
- `<time>`: `datetime` (ISO 8601 形式のみ)
- a11y 系: `tabindex`, `role`, `aria-label`, `aria-labelledby`, `aria-describedby`
- 全タグ共通: `class` (§3.4 ホワイトリスト下記参照)

### 禁止タグ (絶対に出力しない)

```
script, iframe, style, base, link, object, embed, form, input, button,
h1 (タイトルが既にあるため),
section/article/header/footer (構造はサイト側で付与),
svg, math, details, video, audio (RICH モードでも明示的に拒否)
```

### 禁止属性

- インライン `style="..."` ← **絶対禁止**
- `onclick`, `onload`, `onerror` 等 `on*` 系 ← **絶対禁止**
- `formaction` ← **絶対禁止**
- `<a target>` ← **不要**（サイト側で `_blank` を自動付与）
- `<a rel>` ← **不要**（サイト側で `noopener noreferrer` を自動付与）

### URL Scheme

- `<a href>`: `https:` / `mailto:` / `tel:` / `#` のみ。`http:` / `javascript:` / `data:` は禁止
- `<img src>`: `https://images.microcms-assets.io/assets/<service-id>/...` 配下のみ

### 3.4 許可クラス (allowlist)

**段落・装飾**
- `lead` — 導入文段落 (大きめ・薄め)
- `caption` — `<figcaption>` キャプション
- `badge` — インラインバッジ (`<span class="badge">NEW</span>`)
- `highlight` — 強調装飾
- `mark` タグそのものはハイライト (黄色背景) として CSS 適用済み

**コールアウト**
- `note` — `<aside class="note">…</aside>` 補足ボックス
- `caution` — `<aside class="caution">…</aside>` 注意喚起ボックス

**CTA ボタン**
- `cta` — 一次 CTA (背景塗り)
  ```html
  <a href="https://www.thepicklebang.com/reserve" class="cta">今すぐ予約する</a>
  ```
- `cta--ghost` — 二次 CTA (枠線のみ)
  ```html
  <a href="/contact" class="cta cta--ghost">お問い合わせ</a>
  ```

**スケジュール timeline (Magazine Two-Column)**
- `schedule` — `<ol>` 全体
- `schedule-item` — `<li>` 各日付ブロック
  ```html
  <ol class="schedule">
    <li class="schedule-item">
      <time datetime="2026-04-29">04/29</time>
      <h3>OPEN DAY</h3>
      <p>体験会 10:00 - 18:00</p>
    </li>
  </ol>
  ```

**テーブル**
- `news-table-scroll` — 横スクロール wrapper (サイト側で `<table>` を自動ラップするため AI 側で付与不要)

> **クラスは大文字小文字区別**。リスト外のクラス名は **黙って削除** されるので、見栄えが崩れた時はまずクラス名を疑う。

---

## 4. 文体・トーンガイド

### 共通

- ですます調 (ja) / 中立な英語 (en)
- 1段落 2〜4文を目安、長文化を避ける
- **絵文字は通常記事では使わない** (ブランドトーン)。キャンペーン等で例外的に使う場合のみ許可
- 数値・固有名詞は **必ず入力 `key_points` に基づく**。**創作・推測禁止**

### 構成テンプレート (推奨)

```
1. <p class="lead">導入 (1〜2文、結論先出し)</p>
2. <h2>背景</h2><p>...</p>
3. <h2>詳細</h2><p>...</p>  または  <ul><li>...</li></ul>
   ※ 日付・時間が複数並ぶ場合 → <ol class="schedule"> で表現
   ※ 重要な注意事項 → <aside class="caution">…</aside>
   ※ 補足情報 → <aside class="note">…</aside>
4. <h2>今後について</h2><p>次のステップ</p>
5. (画像があれば) <figure><img …><figcaption class="caption">…</figcaption></figure>
6. (CTA があれば) <p><a class="cta" href="…">予約する</a></p>
```

### excerpt

- HTML タグ・改行を含めない (プレーンテキスト)
- 記事全体を 1〜2 文で要約、結論を先頭に
- description / OGP / JSON-LD で使用されるため SEO 観点で重要 (長すぎると検索結果で末尾が省略される目安: 120〜160 字程度)

### title

- 結論先出し、内容が一目で分かる
- 「お知らせ」「速報」等の煽り言葉は避ける
- (参考) JSON-LD `headline` の慣例上 110 字程度に収まると検索結果で省略されにくい

---

## 5. 多言語生成テンプレート

### 一括生成プロンプト例 (Claude/ChatGPT 向け)

```
あなたは THE PICKLE BANG THEORY のニュース記者です。
以下の入力をもとに、日本語版と英語版のニュース記事を JSON 配列で生成してください。

【入力】
{ topic, key_points, category, eyecatch_url, images[], publishedAt }

【出力ルール】
- JSON 配列で 2 要素を返す: [ja版, en版]
- 各要素のスキーマ: §2 出力スキーマに従う (locale/displayMode/category は配列)
- slug は日英で同一、^[a-z0-9-]+$ 形式
- title: ja はですます調、en は中立な英語
- excerpt: プレーンテキスト、結論先出し
- bodyHtml: §3 のタグ・属性ホワイトリストのみ使用、§4 の構成テンプレートに従う
- body は null
- displayMode は ["html"] 固定 (リッチエディタ未使用)
- 創作・推測禁止、key_points にない事実は書かない
- 翻訳ではなく、それぞれの言語のネイティブ向けに自然な記事として書く
- 日付/時間/価格などの数値は半角、単位は前後にスペースなし (例: 1,000円, 10:00, 50%)
```

---

## 6. 画像の取り扱い

### 事前準備 (AI agent 側)

1. 必要な画像（ヒーロー + 本文中）を用意（Midjourney/DALL-E/撮影等）
2. **microCMS Management API でメディアにアップロード** (`mcp__microcms-prod__microcms_upload_media`)
3. アップロード結果の URL を取得 (`https://images.microcms-assets.io/assets/<service-id>/...`)
4. その URL を `eyecatch.url` または `<img src>` に埋める

### サイズ・フォーマット推奨

- ヒーロー画像 (eyecatch): 16:9 比率、1920×1080 以上、JPEG または PNG
- 本文中画像: 1200px 幅以上、縦横比は内容に合わせる
- 画像配信時にサイト側で `?w=1200&fm=webp&q=80` を自動付与 (microCMS imgix)

### `<img>` のマークアップ

- `width` / `height` 属性必須 (CLS 防止) — 欠如時は 1200×675 がデフォルト適用 (warn ログ)
- `alt` 属性必須 (a11y / SEO)
- `loading` / `decoding` 属性は不要 (サイト側で `lazy` / `async` を自動付与)
- 1枚目の画像は LCP として `fetchpriority="high"` が自動付与

```html
<figure>
  <img src="https://images.microcms-assets.io/assets/abc/photo.jpg"
       alt="メンバー集合写真" width="1200" height="675">
  <figcaption class="caption">2026年1月、施設視察時の集合写真</figcaption>
</figure>
```

---

## 7. やってはいけないこと (チェックリスト)

実装側 DOMPurify で防御するが、契約として**そもそも出力しない**:

- [ ] インライン `style` 属性
- [ ] `<script>`, `<iframe>`, `<style>`, `<base>`, `<link>`, `<form>` タグ
- [ ] `on*` イベントハンドラ
- [ ] `javascript:` / `data:` スキームの URL
- [ ] microCMS アセット以外のホストの `<img src>`
- [ ] §3.4 にない class 名
- [ ] `<a target>` / `<a rel>` の手動指定 (サイト側で自動付与)
- [ ] 創作・推測した事実
- [ ] HTML タグや改行を含む `excerpt` (excerpt は必ずプレーンテキスト)
- [ ] **`<img>` の `width`/`height` 属性欠如** (CLS 0.15-0.3 悪化、CWV 目標逸脱の原因)
- [ ] `locale` / `displayMode` / `category` を非配列で送信
- [ ] `category` を英語ID で送信 (運用は日本語ラベル)

---

## 8. サンプル: 完全な生成例

```json
{
  "slug": "gw-event-2026",
  "locale": ["ja"],
  "title": "ゴールデンウィーク特別イベントのお知らせ",
  "excerpt": "GW期間中 (4/29-5/6) に体験会・大会・トークイベントを開催します。事前予約制、参加費無料の枠もあります。",
  "category": ["イベント情報", "キャンペーン"],
  "displayMode": ["html"],
  "bodyHtml": "<p class=\"lead\">2026年GW期間 (4/29-5/6) に <mark>連日</mark> 特別イベントを開催します。</p><h2>スケジュール</h2><ol class=\"schedule\"><li class=\"schedule-item\"><time datetime=\"2026-04-29\">04/29</time><h3>OPEN DAY</h3><p>無料体験会 10:00-18:00</p></li><li class=\"schedule-item\"><time datetime=\"2026-05-03\">05/03</time><h3>初心者カップ</h3><p>定員 32名 (先着順)</p></li></ol><aside class=\"note\">予約は前日 18:00 まで受付。</aside><aside class=\"caution\">満員時はキャンセル待ちとなります。</aside><p><a class=\"cta\" href=\"https://www.thepicklebang.com/reserve\">今すぐ予約する</a></p>",
  "body": null,
  "publishedAt": "2026-04-26T00:00:00+09:00"
}
```

---

## 9. 変更履歴

- 2026-04-25: 初版作成 (設計書 §17 から分離)
- 2026-04-26: タグ・クラスを最新化 (table / mark / aside / time / span 追加、CTA / schedule / note / caution / badge / highlight クラス追加)。microCMS 配列フィールド (locale/displayMode/category) と日本語ラベル運用を明記。Claude Code skill との連携を追記。
- 2026-04-26: title / excerpt / slug の文字数制限を撤廃 (運用上の柔軟性を優先)。SEO 観点の参考目安は §4 に注記として残す。
