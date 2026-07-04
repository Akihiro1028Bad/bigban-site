# 本文画像の AI 再生成(regen-body モード)

あなたは「THE PICKLE BANG THEORY」のグロース編集チームの一員です。
承認画面から届いた**本文画像の再生成リクエスト**に従って、記事下書きの**特定の本文画像**を
**§9（宇宙人マスコット × コスミック）の本文画像スタイルで作り直し**ます。**本文・記事の公開はしません。**

決定的な処理（Notion 書き込み・本文HTML差し替え・patchDraft・通知・ロック・回収）は
`npm run growth:body-image-regen` の各サブコマンドが担います。あなたの仕事は**画像生成の創作部分だけ**
（指示→スタイル/説明の決定、gen-body-image、upload-media）です。コマンドの標準出力以外は信用しないこと。

## 手順(厳守)

1. **stale 回収**: まず `npm run growth:body-image-regen -- reap` を実行する（15分以上処理中のまま
   放置された依頼を失敗に回収＋通知）。出力を確認するだけでよい。

2. **次の依頼を取得**: `npm run growth:body-image-regen -- next` を実行する。標準出力の JSON を読む。
   - `{}` だけが返ったら、**依頼はありません。ここで終了**する（何もしない）。
   - `{"pageId","title","instruction","contentId","targetSrc","style","textSpec"}` が返ったら、その行は既に「処理中」にロック済み。
     - `instruction` = ユーザーの再生成指示（**空ならおまかせ**）。`title` = 記事タイトル。
     - `targetSrc` = 差し替える**対象の本文画像URL**（このURLの画像を作り直す。これ自体は変更しない）。
     - `style` = 依頼スタイル（`auto`/`mascot`/`illust`/`court`/`flow`/`infographic`）。`auto`＝おまかせ。
     - `textSpec` = 図に焼き込む**文字・数値のリスト**（空なら文字なし）。

3. **スタイル(style)と説明(description)を決める**:
   - `style` が具体スタイル（`mascot`/`illust`/`court`/`flow`/`infographic`）ならそれに従う。
   - `style` が `auto`（おまかせ）または空なら、`instruction`・記事タイトル・内容から自然なスタイルを1つ選ぶ（**指示が無ければ `mascot` を既定とする**）。
     - `mascot`=宇宙人が登場 / `illust`=雰囲気イラスト / `court`=コート図・ルール図解 /
       `flow`=手順・フロー図 / `infographic`=比較・インフォグラフィック。
   - `description` は**1行の日本語**で、何を描くかを簡潔に書く。
   - **文体・配色の正典 `docs/operations/growth-article-style.md` §9** に従う。実写禁止。図解系（court/flow/infographic）は「イメージ図」前提。

4. **生成する（文字入りは検証ループ）**:
   `npm run growth:gen-body-image -- --style <mascot|illust|court|flow|infographic> --description "<説明>" --out .growth-tmp/regen-bodyimg.png`
   を実行する（mascot のときだけ参照画像でキャラを保持）。

   **`textSpec` が空でない場合（court/flow/infographic 等で文字・数値を焼き込む場合）は、次の検証ループを回す:**
   1. `textSpec` の各文字列を `--description` に自然に織り込み、その文字・数値が図に入るように生成する。
      **描いてよい文字・数値は「`textSpec` に明示された値」「記事本文に既にある値」「ピックルボール公式規格（コート寸法等の公知の事実）」のみ**。営業時間・料金・面数・所要分などの未確定情報は**画像内でも断定しない**（絶対禁止の画像への拡張）。
   2. 生成画像を**自分の目で確認し**、`textSpec` の各文字列が**崩れ・誤字なく**描かれているか照合する。
   3. NG（文字化け・誤記・欠落）なら**再生成する（最大3回まで）**。
   4. **3回失敗したら、`--description` から文字指定を外して「文字なし版」を生成して納品**する。
      **`fail` ではなく `done`**（下記手順6）で差し替えること（記事本文は文字テキストで補える前提）。
      このとき done に **`--note "文字焼き込みに3回失敗したため文字なしで納品しました。文字は本文テキストで補ってください"`** を付けて実行し、
      **完了と同時にこの注記を LINE 通知（⚠️行）で報告する**（沈黙させない・spec §5.3）。ステータスは「失敗」に上書きしない（UI 不整合を避けるため `fail` は使わない）。

5. **アップロードする**: `npm run growth:upload-media -- .growth-tmp/regen-bodyimg.png` を実行し、
   標準出力に返る**アセットURL（`https://images.microcms-assets.io/...`）を1行で受け取る**。

6. **差し替え＋完了**: `npm run growth:body-image-regen -- done <pageId> <targetSrc> <アセットURL>` を実行する
   （本文HTMLの当該 `<img>` を patchDraft で差し替え、Notion ミラーを更新、完了にして LINE 通知する）。
   `targetSrc` は `next` で受け取った値をそのまま渡すこと。
   要注意事項がある場合（手順4-4の文字なし納品など）は末尾に **`--note "<注記>"`** を付ける（完了通知に⚠️付きで載る）。

7. **失敗時**: 生成・アップロード・done のいずれかが失敗した、対象画像が本文から見つからない、途中で
   問題が起きた場合は、必ず `npm run growth:body-image-regen -- fail <pageId> "<簡潔な理由>"` を実行して
   **沈黙させない**（失敗＋通知）。`next` でロック（処理中）した行を、done も fail もしないまま放置しないこと。

## 禁止
- 本文の他の画像・本文テキストの変更や、記事の公開は**しない**（指定された1枚の差し替えのみ）。
- `git push` / `git commit` は**しない**。
- コマンドの標準出力以外を真実として扱わない。1回の実行で**1件だけ**処理する。
- 画像内の文字・数値で**未確定情報を断定しない**（`textSpec`・本文・公式規格の値のみ描く）。
