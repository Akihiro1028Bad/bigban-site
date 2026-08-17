# ニュース原稿: PPT クロブルドン 開催告知

出典: テニスベアのイベントページ（オーナー提供テキスト）。

**投入先: 本番環境 (prod / service ID `thepicklebang`)**
作成後の管理画面 URL: https://thepicklebang.microcms.io/apis/news/ppt-kuroburudon

microCMS MCP 未接続のセッションで作成したため、**本ファイルの内容をそのまま microCMS の各フィールドに貼り付ける**か、`microcms-prod` MCP 接続済みのローカルセッションで投入する。

## 未確定 / 要差し込み項目

投入前に以下を確定させること。確定するまで公開しない。

| 項目 | 状態 |
| --- | --- |
| 開催日・開始終了時刻 | 未提供（本文に未記載） |
| 参加費 | 未提供（本文に未記載） |
| エントリーページ URL（カテゴリー別 3 本） | 未提供（`{{ENTRY_URL_STARTER}}` 等のプレースホルダ） |
| 賞金・賞品の具体額 | 未提供（「賞金」「賞品」とだけ記載） |
| アイキャッチ画像 | 未設定 |

## microCMS フィールド

| フィールド | 値 |
| --- | --- |
| `contentId` | `ppt-kuroburudon` |
| `slug` | `ppt-kuroburudon` |
| `locale` | `["ja"]` |
| `displayMode` | `["html"]` |
| `category` | `["イベント情報"]` |

### title

```
全身ブラックで戦う「PPT クロブルドン」を THE PICKLE BANG THEORY で開催します
```

### excerpt

```
THE PICKLE BANG THEORY で、全身ブラックのドレスコードで戦うオープントーナメント「PPT クロブルドン」を開催します。スターター・チャレンジ・オープンの3カテゴリー、各12ペア限定。最低3試合保証で、ペアがいない方の単独エントリーも歓迎です。
```

### bodyHtml

```html
<p class="lead">THE PICKLE BANG THEORY で、ピックルボールのオープントーナメント「PPT（Pickleball Players' Tournament）」を開催します。今回は全身ブラックのドレスコードで戦う <mark>クロブルドン</mark> として実施します。本八幡駅から徒歩1分、全天候型・空調完備のインドアコートでお待ちしています。</p>

<h2>クロブルドンとは</h2>
<p>毎年恒例の、全身白のウェアでプレーするトーナメント「シロブルドン」。今年は趣向を変え、ドレスコードを全身ブラックにした「クロブルドン」として開催します。できる限り黒でコーディネートしてご参加ください。黒で統一されたコートは、いつもと違う雰囲気になります。</p>

<h2>カテゴリー</h2>
<table>
  <caption>カテゴリーと対象レベル</caption>
  <thead>
    <tr>
      <th scope="col">カテゴリー</th>
      <th scope="col">対象</th>
      <th scope="col">定員</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">スターター</th>
      <td>初級者向け／ラケットスポーツ経験が少ない方</td>
      <td>12ペア</td>
    </tr>
    <tr>
      <th scope="row">チャレンジ</th>
      <td>中級者向け／DUPR 3-3.5未満</td>
      <td>12ペア</td>
    </tr>
    <tr>
      <th scope="row">オープン</th>
      <td>中上級者向け／DUPR 3.5-</td>
      <td>12ペア</td>
    </tr>
  </tbody>
</table>
<aside class="note">DUPR はあくまで目安です。運営で足切りなどは行いません。なお、本大会は DUPR のレート更新対象外です。エントリーページはカテゴリー別に分かれています。</aside>

<h2>試合形式</h2>
<ul>
  <li>リーグ戦のあと、決勝トーナメントとコンソレーション</li>
  <li>原則11点1ゲーム制（デュースあり）</li>
  <li>決勝は15点1ゲームマッチを予定</li>
</ul>
<aside class="caution">試合進行により、形式の一部を変更する場合があります。</aside>

<h2>賞金・副賞</h2>
<ul>
  <li>優勝ペア：賞金</li>
  <li>準優勝ペア：賞品</li>
</ul>

<h2>参加にあたって</h2>
<ul>
  <li>最低3試合を保証します</li>
  <li>ペアがいない方の単独エントリーも歓迎です</li>
  <li>カジュアルな雰囲気のなかで、本気のラリーを楽しみましょう</li>
</ul>

<h2>PPT とは</h2>
<p>PPT は、ピックルボールのレベルアップを目的としたオープントーナメントです。男子ダブルス・女子ダブルス・ミックスダブルスが同じトーナメントで競い合う、通称「ジャングル形式」（ハンデあり）が名物。毎回かならず景品と選手同士の交流会があり、ピックルボールをより楽しめるトーナメントとして定期的に開催されています。</p>

<h2>関連リンク</h2>
<ul>
  <li><a href="https://www.youtube.com/@racketsportstokyorst9547/videos">PPT の試合動画（YouTube）</a></li>
  <li><a href="https://line.me/ti/g/9gEd8NewGQ">PPT 専用 LINE グループ</a></li>
  <li>主催 Racket Sports Tokyo（RST）の Instagram：<a href="https://www.instagram.com/racketsportstokyo">@racketsportstokyo</a></li>
</ul>

<h2>エントリー</h2>
<p>参加カテゴリーのページからお申し込みください。開催日時・参加費などの詳細は、エントリーページの最新情報をご確認ください。</p>
<p>
  <a class="cta" href="{{ENTRY_URL_STARTER}}">スターターにエントリー</a>
  <a class="cta cta--ghost" href="{{ENTRY_URL_CHALLENGE}}">チャレンジにエントリー</a>
  <a class="cta cta--ghost" href="{{ENTRY_URL_OPEN}}">オープンにエントリー</a>
</p>
```

## 制作メモ

- テニスベア原文の絵文字（🪐✨🎆💥）は、通常記事に絵文字を使わないハウススタイルに合わせて外した。
- 原文にあった「西村昭彦の」という表記は、サイト上の既存表記に合わせて外した。
- YouTube リンクはチャンネルの動画一覧 URL で単一動画 ID ではないため、埋め込みトークンではなく通常リンクにしている。
- Instagram はプロフィール URL のため埋め込み不可。通常リンクで掲載。
- 「本八幡駅徒歩1分」「全天候型・空調完備」は公表済みの確定事実として使用。
