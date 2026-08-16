---
name: news-create
description: ニュース記事 / お知らせ / 告知 / イベント情報 / キャンペーン / メディア掲載 / プレスリリースを microCMS に下書き作成・翻訳・公開する時に使用。「お知らせ作って」「記事下書きにして」「イベント告知書いて」「キャンペーン記事作って」など、microCMS という単語が含まれない依頼でも起動する。最初に必ずテスト環境(dev) / 本番環境(prod) を確認し、画像はユーザーから受け取った URL またはファイルパスから microCMS Media にアップロードし、Next.js 配信に最適化したパラメータ付き URL で本文に埋め込む。許可リスト準拠の HTML を生成し、microCMS MCP サーバ経由で下書きを作成する。Claude Code (Bash + ファイルシステム) でも Claude.ai チャット (URL ベースのみ) でも動作する。日英バイリンガル時は contentId に locale サフィックスを付ける。Suitable for non-engineer operators.
---

# News Create — microCMS ニュース投稿スキル

サイト運用者 (非エンジニア) が「ニュース記事を作って」「お知らせ下書きにして」と頼んだ時に、Claude が **microCMS の下書き** まで自動作成するためのスキル。
完成した下書きはユーザーが microCMS 管理画面の「画面プレビュー」→「公開」ボタンで仕上げる。

> **動作環境**: Claude Code (CLI/IDE) でも Claude.ai (Web/デスクトップアプリ) でも動作する。画像処理だけ環境差があるため Step 2 で分岐する。

## いつ使うか

以下のような依頼を受けた時 (microCMS という単語が無くても起動する):

- 「ニュース記事を作って」「お知らせを下書きにして」「告知書いて」
- 「キャンペーンの告知を入れて」「イベント情報を作って」
- 「メディア掲載のお知らせを作って」「プレスリリース下書きにして」
- 「英語版も作って」「日英両方で」
- 「先週の記事を一部修正したい」
- 「公開予約しておいて」

## Step 0: 接続確認 (依頼を受けたら最初に)

1. **microCMS MCP サーバが接続されているか**
   - 利用可能ツールに `mcp__microcms-dev__*` または `mcp__microcms-prod__*` があるかチェック
   - 無ければ「microCMS MCP の接続が切れているようです。MCP 設定を確認してください」と伝えて中断
2. **endpoint** はデフォルト `news` を想定。違う場合は最初にユーザーへ確認

> このスキルは特定プロジェクトに紐づかない。MCP の接続先 (service ID / API key) は MCP 側設定に従う。

## ワークフロー (6 ステップ)

### Step 1: ヒアリング

#### 1-a. 環境を確認する (最初に必ず聞く)

> テスト環境 (dev) と本番環境 (prod)、どちらに作成しますか?

回答に応じて以降のすべての MCP 呼び出しを `microcms-dev` か `microcms-prod` のどちらか一方で統一する。

#### 1-b. 記事の中身をヒアリング

| 項目 | 必須 | 説明 |
|------|------|------|
| **トピック** | ✅ | 何を伝える記事か (1〜2 行) |
| **盛り込みたい事実** | ✅ | 数値・日付・固有名詞などの箇条書き |
| **カテゴリ** | ✅ | お知らせ / メディア掲載 / イベント情報 / キャンペーン から複数可 |
| **公開時期** | - | 「下書き保存」(デフォルト) / 「○月○日 ○時公開予約」 / 「即時公開」 |
| **画像** | - | 画像 URL / ファイルパス (詳細 Step 2) |
| **言語** | - | 日本語のみ (デフォルト) / 日英両方 |
| **CTA ボタン** | - | 予約 / 申込 / 問い合わせ等のリンクと文言 |
| **スラッグ** | - | URL に使う英数字 (未指定なら topic から自動生成) |

#### 1-c. URL から情報を抽出する場合

ユーザーが「このイベントページから記事作って」と外部 URL を渡してきた場合:

- **WebFetch ツール** が利用可能 → URL を取得して情報を抽出 (複数 URL なら並列実行)
- **WebFetch が無い / 取得失敗** (Claude.ai のプラン制限・認証要・ブロック等)
  → 「ページの中身が取得できませんでした。タイトル・日付・場所・参加費などの情報をコピペで貼ってもらえますか?」と依頼

**創作・推測しない**。取得 / 提供された内容のみを根拠にする。

### Step 2: 画像処理 (環境別)

依頼に画像が必要なら、**ユーザーがどう画像を渡したか** で処理を分岐する。

#### パターン A: microCMS Media にアップロード済みの URL を提示された場合 (最強・両環境で動く)

ユーザー: 「画像はこれです → `https://images.microcms-assets.io/assets/.../photo.jpg`」

→ アップロード不要。そのまま `<img src>` と `eyecatch.url` に使う。
`width` / `height` がわからない場合はユーザーに聞くか、MCP の `microcms_get_media` で取得を試みる。

> **Claude.ai でも Claude Code でも完全に動く最適パス**。運用者にはこのパターンを推奨。

#### パターン B: 公開 URL を提示された場合 (両環境で動く)

ユーザー: 「画像は https://example.com/photo.jpg です」 (Imgur / Dropbox / 自社サイト等)

→ MCP に転送依頼:

```
mcp__microcms-{dev|prod}__microcms_upload_media
  externalUrl: "https://example.com/photo.jpg"
```

返り値の `url` / `width` / `height` を以降のステップで使う。

#### パターン C: ローカルファイルパスを提示された場合 (ローカルの Claude Code のみ)

> クラウドセッション (claude.ai/code・スマホ) は Bash が使えるが、VM 上にあるのはリポジトリのクローンだけで**利用者の手元ファイルは存在しない**。ファイルパスを言われても `ls` せず、パターン A / B に誘導する。

ユーザー: 「画像は `~/Desktop/eyecatch.jpg` です」

```bash
# 1. ファイル存在・形式・サイズ確認
file ~/Desktop/eyecatch.jpg

# 2. (macOS) 寸法取得
sips -g pixelWidth -g pixelHeight ~/Desktop/eyecatch.jpg

# 3. 5MB 超なら Bash で縮小 (sips / ImageMagick 等)
#    アイキャッチ候補: 長辺 1200px、本文中: 長辺 1600px

# 4. base64 化 (改行なし)
base64 -i ~/Desktop/eyecatch.jpg
```

そして MCP 呼び出し:

```
mcp__microcms-{dev|prod}__microcms_upload_media
  fileData: "<base64 文字列>"
  fileName: "eyecatch.jpg"
  mimeType: "image/jpeg"
```

> **Claude.ai では Bash がないためこのパターンは使えない**。Claude.ai でユーザーがファイルパスを言及してきたら「ファイルパスから直接アップロードはできません。microCMS 管理画面 → メディアから先にアップロードして URL を貼ってください (パターン A)、または公開 URL を教えてください (パターン B)」と案内する。

#### パターン D: チャットに画像を直接添付された場合

- **Claude Code**: 画像が MCP に渡せないため、ユーザーに「ファイルパスを教えてください」と聞き直す → パターン C へ
- **Claude.ai**: 画像が MCP に渡せないことを伝える → パターン A / B のいずれかに誘導

#### パターン E: 画像なし / 後で追加

下書き作成時に画像なしで進める。
ユーザーへ:
> 「画像は後で microCMS 管理画面のアイキャッチ欄から追加できます。ただしアイキャッチが無いと記事一覧カードでサムネが空欄になります」

#### サイズ・形式の目安

- **対応形式**: JPEG / PNG / WebP / AVIF / GIF
- **5MB 以下** → そのまま
- **5〜10MB** → 「重いのでリサイズします」と伝えて縮小 (Claude Code のパターン C のみ自動可)
- **10MB 超 / 非対応形式** → エラーで止めて別画像を依頼

#### 役割提案 + alt テキスト提案

複数画像があるときは、Claude が記事構成を踏まえて配置 (アイキャッチ / 本文中の図 / 末尾) を提案 → ユーザー確認 → 確定。
画像 1 枚ごとに記事のトピック・本文から alt 案を 1 つ提案 → ユーザー確認。
**画像から読み取れない事実は alt にもキャプションにも書かない**。

#### 配信用 URL の組み立て (Next.js 最適化)

microCMS Media は URL クエリで配信時最適化が可能。本文 `<img src>` には **必ず最適化パラメータ付き URL**:

| 用途 | URL パラメータ |
|------|----------------|
| 本文中の画像 | `?w=1200&fm=webp&q=75` |

例:
```
元 URL : https://images.microcms-assets.io/assets/abc/photo.jpg
本文 src: https://images.microcms-assets.io/assets/abc/photo.jpg?w=1200&fm=webp&q=75
```

`<img width height>` は **元画像の比率を保ったピクセル値** (CLS 防止)。
例: 元が 4000×3000 (4:3) なら本文中 `width="1200" height="900"`。

`loading` / `decoding` / `fetchpriority` は **書かない** (サニタイザが自動付与: `loading="lazy"` `decoding="async"`、1 枚目は LCP 最適化で `eager` + `fetchpriority="high"` に自動上書き)。

例外: 本文中の特定画像を意図的に eager にしたい時のみ `loading="eager"` を明記。

### Step 3: HTML 本文を組み立てる

下記の **許可リスト内** だけを使って `bodyHtml` を組み立てる。リスト外のタグやクラスは表示時に自動削除される。

#### 構成テンプレート

```html
<!-- 1. 導入 (結論先出し) -->
<p class="lead">本日 <mark>限定</mark> でキャンペーンを開催します。</p>

<!-- 2. 見出し + 本文 -->
<h2>背景</h2>
<p>本文…</p>

<!-- 3. スケジュール (日付・時間が並ぶ場合) -->
<ol class="schedule">
  <li class="schedule-item">
    <time datetime="2026-04-29">04/29 (水祝)</time>
    <h3>OPEN DAY</h3>
    <p>10:00 - 18:00 体験会<br>
    <a class="cta--ghost" href="https://example.com/apply">申し込む</a></p>
  </li>
</ol>

<!-- 4. コールアウト -->
<aside class="note">補足情報 (青系背景)</aside>
<aside class="caution">注意喚起 (赤系背景)</aside>

<!-- 5. インライン強調 -->
<p>本日 <mark>限定</mark> で <span class="badge">NEW</span></p>

<!-- 6. テーブル (モバイル横スクロール wrapper 自動付与) -->
<table>
  <caption>料金表</caption>
  <thead><tr><th scope="col">プラン</th><th scope="col">料金</th></tr></thead>
  <tbody><tr><td>体験</td><td>無料</td></tr></tbody>
</table>

<!-- 7. 画像 (Step 2 でアップロード済み URL に最適化パラメータ付与) -->
<figure>
  <img src="https://images.microcms-assets.io/assets/.../photo.jpg?w=1200&fm=webp&q=75"
       alt="メンバー集合写真" width="1200" height="675">
  <figcaption class="caption">2026 年 1 月、施設視察時</figcaption>
</figure>

<!-- 8. CTA ボタン (一次/二次) -->
<p>
  <a class="cta" href="https://reserva.be/example">今すぐ予約する</a>
  <a class="cta cta--ghost" href="/contact">お問い合わせ</a>
</p>
```

#### 許可タグ

**ブロック・インライン・装飾**
```
h2, h3, h4, p, ul, ol, li, a, img, blockquote,
strong, em, code, pre, figure, figcaption, br, hr,
span, aside, mark, time
```

**テーブル**
```
table, thead, tbody, tfoot, tr, th, td, caption, colgroup, col
```

#### 許可クラス

| クラス | 用途 | 適用先 |
|--------|------|--------|
| `lead` | 導入文段落 | `<p>` |
| `caption` | 画像キャプション | `<figcaption>` |
| `badge` | インラインバッジ | `<span>` |
| `highlight` | 強調装飾 | 任意 |
| `note` | 補足コールアウト (青系) | `<aside>` |
| `caution` | 注意喚起コールアウト (赤系) | `<aside>` |
| `cta` | 一次 CTA ボタン (背景塗り) | `<a>` |
| `cta--ghost` | 二次 CTA ボタン (枠線のみ) | `<a>` |
| `schedule` | スケジュール全体 | `<ol>` |
| `schedule-item` | スケジュール各項目 | `<li>` |

> `<mark>` タグは黄色ハイライト (クラス不要)

#### 必ず守ること

- `<a href>` は `https:` / `mailto:` / `tel:` / `#` のみ
- `<img src>` は **microCMS Media URL + 配信最適化パラメータ** (`?w=1200&fm=webp&q=75` 等) のみ
- `<img>` には **必ず `width` `height` `alt`**
- `<img>` の `loading` / `decoding` / `fetchpriority` は **書かない** (例外: 意図的 eager のみ)
- `<a target>` / `<a rel>` は **書かない** (サイト側自動付与)
- `<th scope>` は `row` / `col` / `rowgroup` / `colgroup`
- `<time datetime>` は ISO 8601
- `<th colspan|rowspan>` は 1〜99
- インライン `style` / `on*` ハンドラ / `<script>` `<iframe>` `<style>` `<form>` は **絶対禁止**

#### 文体ガイド

- 日本語: ですます調、1 段落 2〜4 文
- 英語: 中立な英語、ネイティブ向けに自然に書く (機械翻訳調を避ける)
- 数値・固有名詞は **ヒアリングで聞いた事実のみ**。**創作禁止**
- 通常記事に絵文字は使わない (キャンペーン例外で許可)
- title: 結論先出し、煽り言葉避ける
- excerpt: HTML タグ・改行を含めないプレーンテキスト、結論先頭

### Step 4: microCMS フィールドを整形

```json
{
  "slug": "gw-event-2026",
  "locale": ["ja"],
  "title": "ゴールデンウィーク特別イベントのお知らせ",
  "excerpt": "GW 期間中 (4/29-5/6) に体験会・大会・トークイベントを開催します。事前予約制、参加費無料の枠もあります。",
  "category": ["イベント情報", "キャンペーン"],
  "displayMode": ["html"],
  "bodyHtml": "<p class=\"lead\">…</p>…"
}
```

#### microCMS フィールドの注意点

- **`locale` / `displayMode` / `category`** は **必ず配列で送る** (microCMS の select フィールドは単一/複数選択どちらも配列受付)
  - `locale` / `displayMode` は **単一選択** だが、配列で囲む: `locale: ["ja"]` / `displayMode: ["html"]`
  - `category` は **複数選択**: `category: ["イベント情報", "キャンペーン"]`
  - 文字列単体 (例: `locale: "ja"`) は **400 エラー**: `'<field>' has unexpected data type.`
- **❌ select フィールドに `selectItems[].id` (例: `"6fq18N279T"` のようなランダム英数字) を絶対に送らない**
  - 必ず **`value` 文字列** (例: `"ja"` / `"html"` / `"お知らせ"`) を送る
  - id を送ると API は **200 OK を返すが、内部の値マッチに失敗して空配列 `[]` で保存される (無音失敗)** → 管理画面では「未設定」と表示される
  - `microcms_get_api_info` のスキーマには `selectInitialValue: ["6fq18N279T"]` のような id 配列が含まれるが、これは **内部表現であり送信値ではない**。送信値は同じスキーマの `selectItems[].value` を使う
- **`category`** は **日本語ラベル** で送る (`お知らせ` / `メディア掲載` / `イベント情報` / `キャンペーン`)
- **`displayMode`** は基本 `["html"]` 固定 (`bodyHtml` を使うため)
- **slug** は半角英数 + ハイフンのみ (`^[a-z0-9-]+$`)、日英両言語で同じ slug
- **任意フィールドは値が無い時、`null` を送らず キー自体を省略する** (microCMS は `null` を送ると 400 `'<key>' is unexpected key.` を返す)
  - 例: 画像なしなら `eyecatch` キーごと書かない
  - 例: 外部リンクなしなら `externalLink` キーごと書かない
- **`eyecatch`** を入れる場合: Step 2 のアップロード結果から `{ "url": "...", "width": 1920, "height": 1080 }` の形。`url` は **クエリパラメータを付けない素の URL** (Next.js `<Image>` 側で最適化)
- **`externalLink`** を入れる場合: `{ "label": "詳細を見る", "url": "https://..." }`

### Step 5: MCP 経由で投稿

#### 5-a. 単一言語の場合

```
mcp__microcms-{dev|prod}__microcms_create_content_draft
  endpoint: news
  contentId: <slug>          ← 任意。指定すると ID = slug、未指定なら自動生成
  content: { …Step 4 の JSON }
```

#### 5-b. 多言語 (日英両方) の場合

slug は両言語で同じだが、microCMS の **contentId は一意** でなければならない。
**locale サフィックスを付けて区別**:

```
日本語版:
  contentId: gw-event-2026-ja
  content: { slug: "gw-event-2026", locale: ["ja"], … }

英語版:
  contentId: gw-event-2026-en
  content: { slug: "gw-event-2026", locale: ["en"], … }
```

両言語を **並列実行** (1 メッセージで 2 つの MCP tool call) で送ると速い。

#### 5-c. 公開予約 / 即時公開

```
mcp__microcms-{dev|prod}__microcms_create_content_published
  ※ status と publishedAt を適切に設定
```

> **環境を後から切り替えたい場合**: ユーザーから「prod にも同じ内容を作って」など明示依頼があった時のみ対応。スキル側からは提案しない。

### Step 6: ユーザーへの案内

下書き作成後、以下のように伝える:

> 下書きを作成しました ✅ (環境: `<dev | prod>`)
>
> microCMS 管理画面 → ニュース → `<記事タイトル>` を開いて、画面右上の **「画面プレビュー」ボタン** で表示確認してください。
> 画像配置を変えたい場合は、本文の `<figure>` 移動を依頼してください (こちらで下書き更新します)。
> 問題なければ画面右上の **「公開」ボタン** で本番公開できます。

多言語の場合は両言語の contentId を伝える:

> 日本語版: `gw-event-2026-ja`
> 英語版: `gw-event-2026-en`

エンジニア向け補足 (聞かれた場合のみ):

- 公開すると Webhook 経由でサイトのキャッシュが自動再検証される
- プレビュー URL は microCMS 管理画面の「画面プレビュー設定」を参照

## チェックリスト (記事作成完了前)

- [ ] **環境** (dev / prod) を最初に確認している
- [ ] **MCP 接続** が生きている (`mcp__microcms-*__*` ツール利用可能)
- [ ] excerpt にタグ・改行が含まれていない (プレーンテキスト)
- [ ] slug が `^[a-z0-9-]+$` を満たす
- [ ] bodyHtml が許可リスト内のタグ・クラスのみ
- [ ] `<img>` に `width` / `height` / `alt` あり
- [ ] `<img src>` に **配信最適化パラメータ** (`?w=1200&fm=webp&q=75` 等) を付けている
- [ ] `<img>` に `loading` / `decoding` / `fetchpriority` を **書いていない** (eager 明示の例外を除く)
- [ ] `eyecatch.url` には **クエリパラメータを付けない素の URL** を入れている
- [ ] `<a target>` / `<a rel>` を書いていない
- [ ] インライン `style` / `on*` ハンドラを書いていない
- [ ] `locale` / `displayMode` / `category` を **配列** で送っている (単一選択でも `["ja"]` の形)
- [ ] select フィールドの値は **`selectItems[].value` の文字列** (例: `"ja"` / `"html"` / `"お知らせ"`) を送っており、**`selectItems[].id` (ランダム英数字) は送っていない**
- [ ] `category` を **日本語ラベル** で送っている
- [ ] **任意フィールドに `null` を送っていない** (キー自体を省略)
- [ ] 多言語の場合、両言語で **slug が同一**、**contentId は `-ja` / `-en` サフィックスで区別**
- [ ] 創作・推測の事実が含まれていない

## トラブルシューティング

### Q. `'<fieldName>' is unexpected key.` という 400 エラーが返る

任意フィールドに `null` を送っている。microCMS は `null` を「未知のキー」と解釈する。
→ そのキー自体を JSON から **削除** して再送。

例:
```json
// ❌ NG
{ "title": "...", "eyecatch": null, "externalLink": null }

// ✅ OK
{ "title": "..." }
```

### Q. `contentId already exists` エラー

同じ contentId のレコードがすでに存在する。
- 多言語投稿で contentId 衝突 → `-ja` / `-en` サフィックスを付ける
- 既存記事を更新したいなら `microcms_update_content_draft` を使う

### Q. 管理画面で `locale` / `displayMode` / `category` が「未設定」と表示される

select フィールドに **`selectItems[].id` (例: `"6fq18N279T"` のようなランダム英数字)** を送っている可能性が高い。
microCMS の select フィールドは送信時に **`value` 文字列** (例: `"ja"` / `"html"` / `"お知らせ"`) を期待する。
id を送ると API は **200 OK を返すが、内部の値マッチに失敗して空配列 `[]` で保存される (無音失敗)**。

確認方法:
```
mcp__microcms-{dev|prod}__microcms_get_content
  endpoint: news
  contentId: <該当記事 ID>
  draftKey: <下書きの場合は draftKey>
```

レスポンスの `locale: []` のように空配列なら id 送信が原因。修正は `microcms_update_content_draft` で正しい value で上書き:

```
content: { locale: ["ja"], displayMode: ["html"] }
```

> **根本予防**: `microcms_get_api_info` のレスポンスに含まれる `selectInitialValue: ["6fq18N279T"]` のような id 配列を **送信値として流用しない**。送信には必ず同じスキーマの `selectItems[].value` を使う。

### Q. プレビューを開いたら `{"ok":false}` (401)

下記いずれか:
- microCMS の draftKey 期限切れ → microCMS 管理画面で再生成
- contentId に不正な文字 (日本語等) が含まれる → 半角英数 + ハイフンに修正
- スキーマ検証エラー (バックエンドの Zod 等の制約違反) → エンジニアに連絡

### Q. プレビューが 404 で表示される / 古い内容が出る

Next.js / CDN がキャッシュしている可能性。
- ブラウザでスーパーリロード (Cmd+Shift+R / Ctrl+Shift+R)
- それでもダメなら開発者に連絡

### Q. 記事を投稿したのに見た目が崩れる

ほぼ確実に **タグかクラスが許可リスト外** で削除されている。
→ Step 3 の許可タグ・許可クラスを見直し、リスト内のものだけで再構築。

### Q. 既存の下書きを更新したい

```
mcp__microcms-{dev|prod}__microcms_update_content_draft
  endpoint: news
  contentId: <既存の ID>
  content: { 更新したいフィールドのみ }
```

### Q. category に新しいカテゴリを使いたい

microCMS 管理画面側で定義された固定値のみ使用可能。新カテゴリは管理画面で先に追加が必要。

### Q. 画像をアップロードする環境を間違えた (dev に上げるべきだったのに prod に上げた等)

microCMS Media は環境ごとに独立。もう一方の環境に上げ直す必要がある。
記事側の `<img src>` と `eyecatch.url` も新 URL に書き換える。

### Q. アップロードした画像が重い / 表示崩れする

- `<img src>` に **配信最適化パラメータ** (`?w=1200&fm=webp&q=75`) が付いているか
- `<img width height>` が元画像のアスペクト比と合っているか
- 画像本体が極端に大きい場合は再アップロード検討 (Step 2 のサイズ目安)

### Q. URL から記事内容を取得したいが WebFetch が無い / 認証ブロックでエラー

ユーザーに「ページの中身をコピペで貼ってください」と依頼する。創作・推測しない。

### Q. (Claude.ai) チャットに画像を添付したのにアップロードされない

Claude.ai のチャットでは添付画像のバイナリを MCP ツールに渡せない。
以下のいずれかをユーザーに依頼:
1. **microCMS 管理画面 → メディア → アップロード** → 表示された URL を貼り付け (推奨)
2. 画像を **公開 URL** (Imgur / Dropbox 公開リンク / 自社サイト等) に置き、URL を貼り付け
3. 一旦画像なしで下書き作成 → 後で管理画面のアイキャッチ欄から追加

## 環境ごとの推奨フロー (運用者向け早見表)

| 環境 | 画像の渡し方 | 備考 |
|------|--------------|------|
| **Claude Code (ローカル)** | ローカルファイルパス (`~/Desktop/...`) | Bash で base64 化して自動アップロード |
| **Claude Code (ローカル)** | 公開 URL | externalUrl で MCP に転送 |
| **クラウドセッション (claude.ai/code・スマホ)** | microCMS Media / 公開 URL | Bash はあるが**利用者の手元ファイルは VM に存在しない**。パターン C は使わずパターン A / B に誘導する |
| **Claude.ai (Web/Desktop)** | microCMS Media にあらかじめアップロードした URL | **推奨**。完全に動く |
| **Claude.ai (Web/Desktop)** | 公開 URL (Imgur 等) | externalUrl で MCP に転送 |
| 両環境 | チャットに画像を直接添付 | ❌ 不可。上記いずれかに誘導 |
| 両環境 | 画像なしで作成 → 後で管理画面から追加 | OK (記事一覧サムネが空欄になる旨を案内) |
