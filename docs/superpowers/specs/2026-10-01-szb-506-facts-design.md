# 施設の事実を正本にそろえる(szb-506)設計書

- 起票: 2026-10-01 / issue #506 / ブランチ `feature/szb-506-facts`
- ゴール: 予約直前の迷いと来場時のトラブルを減らす。サイト・特商法・構造化データの記述を、オーナー確認済みの正本に一致させる。

## 正本(オーナー確認済み)

| 項目 | 正本 |
|---|---|
| 定休日 | 年中無休 |
| 駐車場 | 専用なし。近隣コインパーキング(案内形式で書く) |
| シャワー | なし |
| パドル貸出 | 1コートにつき6本まで |
| 電話番号 | 特商法(法定表示)以外には載せない。問い合わせはフォーム・LINE |
| キャンセル規定 | LaBOLA の規定が正 |
| 支払い | LaBOLA での事前 Web 決済(カード・PayPay)。「現地で」は誤り |

方針: サイトにネガティブ情報は書かない(2026-10-01 オーナー指示)。駐車場は「近隣のコインパーキングをご利用ください」の案内形式を維持する。

## 範囲

### A. サイト文言(`messages/ja.json` / `messages/en.json`。該当行だけ編集し、他は整形しない)

| # | 場所 | 現在 | 変更後 |
|---|---|---|---|
| A1 | ja `Reserve.info.hoursValue`(L209) | `6:00 – 23:00（不定休）` | `6:00 – 23:00（年中無休）` |
| A2 | ja `HomeAccess.hours`(L443) | `営業時間：6:00 – 23:00（不定休）` | `営業時間：6:00 – 23:00（年中無休）` |
| A3 | en `Reserve.info.hoursValue`(L195) | `6:00 – 23:00 (irregular holidays)` | `6:00 – 23:00 (open every day)` |
| A4 | en `HomeAccess.hours`(L429) | `Hours: 6:00 AM – 11:00 PM (Irregular holidays)` | `Hours: 6:00 AM – 11:00 PM (Open every day)` |
| A5 | ja FAQ 支払い方法(L250) | `現地でのお支払いは、クレジットカード・PayPay がご利用いただけます。` | `お支払いは、ご予約時にオンラインで事前決済となります（クレジットカード・PayPay がご利用いただけます）。` |
| A6 | en FAQ 支払い方法(L236) | `On-site payments can be made by credit card or PayPay.` | `Payment is made online in advance when you book (credit card or PayPay).` |
| A7 | ja `Tokushoho.returnsValue`(L658) | `不良品以外不可` | `不良品以外不可。ただし、コート・イベントのご予約のキャンセル・変更は、予約システム（LaBOLA）に定める規定に従います。詳細は予約時にご確認ください。` |
| A8 | en `Tokushoho.returnsValue` | `Not accepted except for defective products` | `Not accepted except for defective products. Cancellations and changes to court and event bookings follow the rules set by the booking system (LaBOLA); please check the details when you book.` |
| A9 | 利用案内 `notes.items`(ja/en)※任意 | (シャワーの記載なし) | 末尾に「シャワー設備はございません。」/ `Shower facilities are not available.` を1行追加 |

- A7/A8 はオーナー回答どおり**置き換えでなく追記**。既存の返品文言・対応期限・返品送料の行は残す。「ただし」は、物販の「不可」とコート予約のキャンセルが矛盾して読めないようにするための接続語(不要なら削る)。
- A9 は「書いて可」とのことなので提案。来場前に分かる方がトラブルが減るため入れる想定。司令塔判断で外してよい。
- 駐車場は `HomeAccess.parkingNote`(ja L461 / en L447)で既に案内形式。変更なし。
- パドル6本は `notes` / `rental` / `rentalPaddleNote` で既に「1コートにつき6本まで」。変更なし(LaBOLA 予約フォームの8本は手順書へ)。

### B. 構造化データ(電話番号を外す)

- `src/lib/structured-data/facilityLocation.ts` の `FACILITY_TELEPHONE` を削除。
- `sportsActivityLocation.ts` / `exerciseGym.ts` の `telephone` フィールドと型定義を削除。
- 特商法ページの電話表示・`tel:` リンク(`TokushohoContent.tsx`)は法定表示なので**残す**。
- 他に `telephone` を出している箇所は無いことを grep で確認済み(上記3ファイルのみ)。

### C. コメント

- `src/constants/site.ts` L76 のコメント「毎日・不定休」→「年中無休」。

### D. 手順書(コード外。オーナーが実施)

`docs/operations/szb-506-fact-alignment.md` に以下をまとめる。コードは触らない。

1. LaBOLA 店舗ページの設備欄: 「駐車場」「シャワー室(男女)」を外す
2. LaBOLA 予約フォーム: パドル貸出の上限を8本→6本
3. LaBOLA 店舗ページの文面: 「将来24時間営業予定」(未確定情報。ポータルが転載)を外す
4. LaBOLA の最新のキャンセル規定を確認(サイト特商法は規定を参照する形なので文面の同期は不要)
5. GBP の所在階を「1階」→「6F」に修正
6. 修正後の突き合わせチェックリスト(サイト・LaBOLA・GBP・特商法・構造化データを並べて確認)

### E. 変更案リスト(今回は触らない・司令塔へ提示のみ)

- `messages/ja.json` L87 ティザー用 `keywords` の「24時間」: 未確定情報の疑い。オーナー未回答のため今回は変更しない。回答が出れば1行削除するだけ。
- `/teaser` ページ自体が現在も公開されているかの確認(関連する別 issue があれば連携)。

## テスト(TDD: 先に Red)

| 対象 | 変更 |
|---|---|
| `ReserveInfo.test.tsx`(L20) | 期待値を `6:00 – 23:00（年中無休）` に更新 → Red → A1 で Green |
| `HomeAccess.test.tsx` | 営業時間表示が「年中無休」であることを追加/更新 |
| FAQ(Reserve)テスト | 「現地で」を含まない・「事前決済」を含むことを検証(ja/en) |
| `TokushohoPage.test.tsx` | returns 行に LaBOLA 規定の追記があること(ja/en)、`tel:` リンクは残ること |
| `sportsActivityLocation.test.ts` / `exerciseGym.test.ts` | `telephone` が**存在しない**ことを検証(旧アサーションは削除) |
| messages の整合 | ja/en のキー対称性テストが既存にあれば継続して通ることを確認 |

カバレッジ100%を維持する。`FACILITY_TELEPHONE` 削除でデッドコードは出ない。

## 非目標

- LaBOLA・GBP の設定変更(手順書まで)
- 特商法の対応期限・返品送料の削除(オーナー回答により残す)
- 料金・日時・所要時間の追記
- 他 issue の範囲(#508 鮮度・#509 LaBOLA 導線・#511 英語版の行き止まり)

## 検証

- `npm run test:coverage` / `npm run lint` / `npx tsc --noEmit`
- dev サーバー(ポート 3202)で `/reserve`・`/`(HomeAccess)・`/tokushoho`・`/en/reserve`・`/en`・`/en/tokushoho` を 375px / 1440px で撮影 → `.superpowers/evidence/szb-506/`
- JSON-LD は dev サーバーの HTML から `telephone` が消えていることを `curl | grep` で確認
