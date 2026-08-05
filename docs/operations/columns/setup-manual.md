# コラム CMS(columns / column-categories)microCMS 管理画面セットアップ手順

- 対象: microCMS 管理画面を操作する運用担当者(非エンジニア向け)
- 関連設計: 旧設計書は削除済み(git履歴: docs/superpowers/specs/2026-07-02-columns-cms-separation-design.md)
- この手順で使う JSON:
  - `docs/operations/columns/column-categories-api-schema.json`(カテゴリマスタ)
  - `docs/operations/columns/columns-api-schema.json`(コラム本体)

## 0. 前提と全体像

グロース記事を、告知用の `news` とは別の新しい API `columns`(コラム)へ分離します。読者向けのカテゴリ(はじめ方・ルール等)は、編集者が管理画面で自由に増減できるよう `column-categories`(カテゴリマスタ)という別 API で管理し、`columns` から参照します。

作成順は次のとおりです。**参照される側(カテゴリマスタ)を先に作る**ため、順番を守ってください。

1. `column-categories` API を作成(スキーマ JSON 読込)
2. `columns` API を作成(スキーマ JSON 読込)
3. `columns` に `category`(コンテンツ参照)フィールドを**手動で追加**(参照先 = `column-categories`)
4. Webhook(revalidate URL)を両 API に設定
5. カテゴリの中身(正典6件)は**手動で作らない**(後工程でエンジニアが MCP から投入)

**実施環境の順序**: まず**テスト環境(dev)**で 1〜4 を通し、動作確認できてから**本番環境(prod)**でも同じ 1〜4 を実施します。dev と prod は別サービスなので、それぞれで作成が必要です。

> ⚠️ 重要な制約(なぜ手動ステップがあるか)
> microCMS の「API スキーマのインポート」は、**コンテンツ参照(relation)フィールドを引き継ぎません**(参照先の指定はインポート時に無視される公式仕様)。そのため `category`(参照フィールド)は JSON に含めておらず、API 作成後に管理画面から手動で追加します(手順③)。API そのものの作成や Webhook 設定も管理画面専用機能です。

---

## 1. `column-categories` API を作成(カテゴリマスタ)

1. 管理画面 左メニュー →「API」→「API を作成」。
2. 作成方法で「**インポート**(API スキーマを読み込んで作成)」を選ぶ。
   - もしインポート入口が見当たらない場合は、先に空の API を「自分で決める」で作り、後述「スキーマのインポート」から JSON を読み込む方式でも可。
3. 基本情報を入力:
   - **API 名**: `コラムカテゴリ`
   - **エンドポイント**: `column-categories`(半角・この文字列で固定。変更しないこと)
   - **型**: **リスト形式**
4. スキーマ JSON に `docs/operations/columns/column-categories-api-schema.json` の中身を貼り付け(またはファイル選択)して読み込む。
5. 読み込まれるフィールドを確認:
   - `name`(表示名(ja)・必須)/ `nameEn`(表示名(en))/ `color`(チップ色(HEX))/ `order`(並び順・数値)
6. 作成を確定。

---

## 2. `columns` API を作成(コラム本体)

1. 再度「API を作成」→「インポート」。
2. 基本情報:
   - **API 名**: `コラム`
   - **エンドポイント**: `columns`(半角・固定)
   - **型**: **リスト形式**
3. スキーマ JSON に `docs/operations/columns/columns-api-schema.json` を読み込む。
4. 読み込まれるフィールドを確認:
   - `title`(必須)/ `slug`(必須・`^[a-z0-9-]+$`)/ `locale`(ja・en)/ `articleType`(記事タイプ: 獲得/不安解消/資産/比較/イベント)/ `excerpt`(要約)/ `displayMode`(html・rich)/ `bodyHtml` / `body`(リッチ)/ `eyecatch`(画像)
   - この JSON には `category`(参照)は**含まれていません**。次の手順③で手動追加します。
5. 作成を確定。

---

## 3. `columns` に `category`(コンテンツ参照)フィールドを手動追加

1. `columns` API →「API 設定」→「スキーマ」を開く。
2. 「フィールドを追加」。
   - **フィールド ID**: `category`
   - **表示名**: `カテゴリ`
   - **種類**: **コンテンツ参照**(1件参照 / relation)
     - ※ 複数選択(relationList)ではなく、**単一参照**で開始します(1記事1カテゴリ)。
   - **参照先の API**: `column-categories`(手順1で作成したもの)を選択。
   - 必須: **オフ**(欠落を許容。AI が付与し損ねても記事は保存できる)。
3. 保存。

> これで `columns` の記事から `column-categories` の1件を選べるようになります。

---

## 4. Webhook(revalidate)を設定

`columns` と `column-categories` の両方に、サイト側のキャッシュ更新用 Webhook を設定します(news 導入時と同じ URL・HMAC secret)。

各 API →「API 設定」→「Webhook」→「追加」:

- 種別: microCMS 標準の Webhook(カスタム通知)
- 通知 URL: `${SITE_URL}/api/revalidate`
  - dev / prod でそれぞれの `SITE_URL` を使う。
- シークレット: news の Webhook と**同じ HMAC secret** を設定。
- 通知タイミング: 「公開時」「公開の取り消し」「削除」など、コンテンツ変更を含むイベントを有効化(news の Webhook と同じ設定に合わせる)。

> `column-categories` のカテゴリ名や色を変更したときも一覧へ反映させるため、`column-categories` にも Webhook を必ず設定してください(サイト側でカテゴリ更新→コラム一覧のキャッシュも連鎖更新します)。

---

## 5. カテゴリの中身(正典6件)は手動で作らない

`column-categories` の初期カテゴリ(下表の6件)は、**エンジニアが後工程で MCP から安定した content ID 付きで投入**します。ここで手動作成すると content ID がずれてしまい、AI の自動カテゴリ付与が壊れるため、**空のまま**にしておいてください。

投入される正典6件(初期値。以後は編集者が管理画面で表示名・色・並び順を自由に変更可):

| content ID | 表示名(name・ja) | 表示名(nameEn) | 色(color) |
|---|---|---|---|
| `start` | はじめ方・体験 | Getting Started | `#C8FF00` |
| `rules` | ルール・基礎知識 | Rules & Basics | `#8AB4FF` |
| `improve` | 上達・楽しみ方 | Skills & Play | `#FFB020` |
| `health` | 健康・カラダ | Health & Fitness | `#6EE7B7` |
| `compare` | 比較・選び方 | Compare & Choose | `#C9A6FF` |
| `event` | イベント・大会 | Events | `#FF6A3D` |

- **正典6件は削除しないでください**(AI が content ID を参照するため)。表示名・色・並び順の変更は自由です。
- 正典以外に独自カテゴリを追加するのは自由ですが、その場合 AI は自動付与しません(記事ごとに手動で付与してください)。

---

## 6. dev で確認できたら prod へ

- dev で手順 1〜4 が完了したら、エンジニアが `GROWTH_MICROCMS_ENDPOINT=columns` + DRYRUN で下書き生成〜公開キューまで検証します。
- 問題なければ、**本番(prod)でも手順 1〜4 を同じ手順で実施**してください。
- 本番切替(フラグ ON・301 リダイレクト・env 切替・既存記事の移行)は、設計書 §7 / §9 の P6 でエンジニアがまとめて行います。

---

## 付録: スキーマ JSON と管理画面の差異について(エンジニア向けメモ)

- 本手順の JSON は microCMS の **API スキーマ取得 API の返す形式**(`{ apiFields, customFields }`)を土台にしています。公式ドキュメントによれば、この形式は「API スキーマのエクスポート機能で書き出す JSON と同等」であり、インポートにそのまま利用できます。
- ただし以下はインポートで引き継がれない/管理画面での確認が必要です:
  - **コンテンツ参照(relation / relationList)**: `referencedApiEndpoint` はインポート時に無視される公式仕様。→ `category` を手順③で手動追加。
  - **select フィールドの選択肢 ID**: 本 JSON では読みやすい仮の ID(例 `atype-acquire`)を入れています。microCMS 側で自動採番され直す場合があります。運用上は選択肢の**表示値**(獲得/不安解消 等)が正典と一致していれば問題ありません(zod 側は日本語ラベル→内部 ID 変換で吸収)。
  - 読み込み後、フィールドの必須・初期値・パターンが JSON どおりか、管理画面で目視確認してください。
- 参照フィールド追加後、エンジニアは MCP `get_api_info` で dev のスキーマが意図どおりか検証してから prod へ進めます(設計書 §11 リスク表)。
