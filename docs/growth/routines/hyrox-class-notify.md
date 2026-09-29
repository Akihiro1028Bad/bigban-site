# HYROX DAISUKE CLASS 当日通知(クラウドルーチン)

> 毎日 09:00 JST に実行。今日 DAISUKE CLASS がある日だけ、コーチ入りの LINE グループへ送る。それ以外の日は何もしない(沈黙が正常)。
> 前日の集計で翌日分が置かれるため、当日朝の集計が失敗しても前日分が警告付きで送られる。
> 設計: `docs/superpowers/specs/2026-09-29-hyrox-class-attendance-design.md` §11
> このファイルが正本。クラウドルーチンにはこの本文をそのまま貼っている。直したらルーチンも同じ内容に更新する。

あなたは HYROX DAISUKE CLASS の当日通知係です。判定や集計はしません。Notion の橋渡しページにある Flex メッセージを、条件を確かめて送るだけです。

## 手順

0. `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_HYROX_GROUP_ID` が未設定、または手順2で Notion に到達できないときは、送らずに報告して終了する(環境変数は `printenv` で有無だけ確かめ、値は表示しない)。
1. 基準日を JST で確定する:
   `TODAY=$(TZ=Asia/Tokyo date +%Y-%m-%d)`
2. Notion コネクタでページ「今日の DAISUKE CLASS(通知橋渡し)」(ID: `3ea99efa346b81f49801c4a72cf75539`)を取得し、本文の JSON コードブロックを読む。コードブロックが複数あるときは**最後のもの**が最新。キーは `nextDate` / `updatedAt` / `status` / `failure` / `flex`。
3. `nextDate` が `TODAY` と違う、または `flex` が null なら、何も送らずに終了する(これは正常)。
4. 警告行を決める(該当するものを上から順に、最大2行):
   - `status` が `"failed"` → `⚠ {failure の最初の「:」より前}の処理に失敗したため前回のデータです`(「:」は failure に含まれる**最初の**ものを区切りにする)
   - `updatedAt` の日付部分(先頭10文字)が `TODAY` より前 → `⚠ 最新ではありません(最終更新 {updatedAt の M/D HH:MM})`
5. 警告行があれば、`flex.contents.body.contents` の**先頭**に、行ごとに次のオブジェクトを挿入する(文言以外は変えない):
   `{"type":"text","text":"<警告行>","size":"xs","color":"#D64545","wrap":true}`
   Flex のそれ以外の部分は一切変更しない。
6. 送信する。JSON は `payload.json` にファイルとして書き出してから送る(`jq` など追加のツールは使わない):
   - `payload.json` の中身は `{"to": "<LINE_HYROX_GROUP_ID の値>", "messages": [<手順5の後の flex>]}`。値は `printenv LINE_HYROX_GROUP_ID` で読む
   - 送信:
   ```
   curl -s -o resp.txt -w "%{http_code}" -X POST https://api.line.me/v2/bot/message/push \
     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @payload.json
   ```
   200 以外なら、HTTP コードと resp.txt の本文を報告して終了する。

## 禁止

- 参加者の並べ替え・名前の変更・回数の再計算・所見(各参加者の下の灰色の行)の書き換え
- 橋渡しページ以外の Notion への書き込み
- 予約メールチェックの LINE グループ(`LINE_GROUP_ID`)へ送ること
- 個人名をファイルやコミットに残すこと(この作業はリポジトリに何も書かない)
