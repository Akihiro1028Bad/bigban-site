# szb-508 情報の鮮度: 終了イベントの自動「終了」表示 設計書

- 起票: 2026-10-01 / issue: #508 / ブランチ: `feature/szb-508-freshness`
- オーナー回答(2026-10-01、司令塔経由): 日付は microCMS の任意フィールド(A案)、終了後の見せ方はバッジ+お知らせ帯+予約先リンクの無効化(B案)

## 1. 目的と範囲

「手入れされていない施設」という印象と、終わった枠への無駄クリックをなくす。開催日を過ぎたニュース記事を、手作業なしで「終了」表示にする。

**範囲内**
- ニュース(`news` API)の終了判定と表示(一覧カード・ホームの最新ニュース・about のニュース・詳細)
- 運用手順書(microCMS に項目を足す手順・日付の入れ方)
- 変更案リスト(既存記事の日付入力・題名の手直し・コラムの期限つき記述)

**範囲外**
- コラム(`columns`)のコード変更。期限つきコラム(船橋・千葉・夏の季節記事)は変更案リストにまとめるだけ
- ニュース一覧の並び替え・非表示(オーナー判断で不採用)
- microCMS 本番への書き込み・公開(オーナーが管理画面で行う)
- 他 issue の領域(英語版の言語切替404=#511、事実の正本=#506 など)

## 2. データ: `eventEndAt`

- microCMS `news` に任意フィールド **`eventEndAt`**(種類=日時、必須ではない)を足す。スキーマ追加はオーナーが管理画面で行う
- コード側 `newsItemSchema` に `eventEndAt: optionalString` を追加(空・null・未存在は `undefined`)。**空なら現状と完全に同じ表示**(後方互換)
- 判定は `src/lib/news/ended.ts` の純関数 `isNewsEnded(eventEndAt, now)`:
  - `eventEndAt` が無い・日時として読めない → `false`(誤って「終了」にしない側へ倒す)
  - `now` が `eventEndAt` を**過ぎたら** `true`(同時刻は終了にしない)
  - 日時は UTC の ISO で来るので、そのまま時刻比較(日本時間への換算は不要)
- 運用ルール(手順書に明記): 終日イベントは**最終日の 23:59(日本時間)**を入れる。複数日・期間告知(お盆・シルバーウィーク等)も最終日 23:59

## 3. 表示(B案)

| 場所 | 変更 |
|---|---|
| 一覧カード `NewsCard`(ホーム最新ニュース `HomeLatestNews`・ホーム `HomeNews`・about のニュースも同じバッジ部品を使う) | カテゴリ表示の隣に「終了」バッジ(英語は "Ended")。灰色の枠で、カテゴリ色と区別する |
| 詳細 `news/[slug]` | カテゴリ行にバッジ+本文冒頭に帯「このイベントは終了しました。最新の開催情報は〔ニュース一覧〕〔予約ページ〕へ」(英語: "This event has ended. Check the latest information on the [News] or [Reserve] page.")。リンクは言語別(`/news` `/reserve` ・ `/en/news` `/en/reserve`) |
| 詳細の本文 | 予約先ドメインの `<a>` はテキストだけ残して**リンクを外す**(取り消し線なし)。対象は `labola.jp`(サブドメイン含む)と `tennisbear.net`。サイト内リンク・その他の外部リンク・SNS埋め込みは触らない |
| 詳細の `externalLink`(末尾ボタン) | 終了済みかつ URL が予約先ドメインなら**ボタンごと非表示**。予約先以外ならそのまま |

文言は既存の詳細ページが採っている「ロケール三項(ja/en)」流儀に合わせ、`src/lib/news/endedLabels.ts` に集約する(`messages/*.json` は他セッションと衝突しやすいので触らない)。

## 4. 部品構成(1つ1責務)

| ファイル | 役割 |
|---|---|
| `src/lib/news/ended.ts` | `isNewsEnded`(終了判定) |
| `src/lib/news/unlinkBookingLinks.ts` | `unlinkBookingLinks(html)`・`isBookingUrl(url)`。サニタイズ済み HTML から予約先リンクを外す |
| `src/lib/news/endedLabels.ts` | 「終了」「Ended」・帯の文言・行き先パス |
| `src/components/news/NewsEndedBadge.tsx` | バッジ(カード・詳細で共用) |
| `src/components/news/NewsEndedNotice.tsx` | 詳細の帯 |
| 既存の変更 | `schema.ts`(1項目)、`NewsCard`・`HomeLatestNews`・`HomeNews`・about(バッジ)、`news/[slug]/page.tsx`(バッジ・帯・externalLink)、`NewsBodyRenderer`(`shouldUnlinkBookingLinks` を渡す) |

## 5. 構造化データ・キャッシュ・プレビュー

- **JSON-LD**: 変更なし。ニュースは `NewsArticle` で `Event` ではないため、終了しても記事としての構造化データは有効なまま(終了イベントを `Event` として出していないので、ステータスの更新は不要)
- **キャッシュ**: ホーム・ニュース一覧・ニュース詳細はすべて `force-dynamic`。microCMS の取得結果はタグでキャッシュされるが、「終了か」は**描画のたびに現在時刻と比べる**ので、日付をまたいで再描画の仕組み(revalidate・cron)は不要
- **プレビュー**(`?draftKey=`): 同じ判定が働く。下書きに `eventEndAt` を入れれば終了後の見え方を事前確認できる
- **OG画像・sitemap**: 変更なし(終了記事も URL は残す)

## 6. エラー・エッジケース

- `eventEndAt` が不正な文字列 → 終了扱いにしない(記事は表示される)
- 本文に予約先リンクが複数・入れ子の装飾(`<strong>` など)があっても、`<a>` の開閉だけ除去して中身は保持
- 埋め込みトークン(`data-embed-provider` 付き `<a>`)は予約先ドメインではないので対象外
- 英語版は日本語版とは別レコードなので、**それぞれに** `eventEndAt` を入れる(変更案リストに明記)

## 7. テスト(TDD、カバレッジ100%)

- `ended.ts`: 未設定・null・不正値・過去・未来・同時刻
- `unlinkBookingLinks.ts`: labola・tennisbear の除去、サイト内リンク・SNS・他外部リンクは保持、装飾入りの中身保持、複数リンク、`mailto:` 等
- `schema.ts`: `eventEndAt` あり・なし・null
- `NewsCard`・`HomeLatestNews`・`HomeNews`: 終了でバッジが出る/未終了で出ない/日英
- 詳細ページ: 終了で帯・バッジ・リンク無効化・externalLink 非表示、予約先以外の externalLink は残る、未設定は現状と同一
- 既存テストが通ること(後方互換の回帰)

## 8. 運用成果物(コード外)

1. `docs/operations/news-admin-manual.md` に「終了日(eventEndAt)の入れ方」を追記: 項目の追加手順(管理画面 API スキーマ → フィールド追加 → 日時 → 必須にしない)と、終日イベントは最終日 23:59 を入れるルール
2. `docs/operations/szb-508-change-list.md`(変更案リスト。本番には書かない):
   - 終了6本(日英8件)に入れる `eventEndAt` の値(開催日は microCMS で再確認する前提)
   - 手打ちの【終了】がある題名(3本)から、`eventEndAt` 設定後に外す案
   - 終わった申込枠へのリンクを持つ3本(picklerox・ppt-vol4・ppt-vol3告知)は、コードで自動的にリンクが外れる旨
   - silver-week の本文リンク食い違い(10月版に書き換わった体験会記事を指す)の直し案
   - 期限つきコラムの改稿案(船橋・千葉の「10月下旬開業予定」=TAROKO 下総中山の開業後に更新、期限は10月下旬。夏の季節記事は季節を問わない題への改稿または秋冬向けへの置き換え)。公開前の書き直しは `growth:body-diff` を通す

## 9. 見込み規模・依存

- 新しい依存の追加: **なし**
- コード diff は 400 行未満の見込み(テスト込みで超えそうなら分割を司令塔に相談)
- 検証: `npm run test:coverage`・`npm run lint`・`npx tsc --noEmit`・dev サーバー(ポート 3203)で 375px / 1440px のスクリーンショット(終了あり・なしの両方。本番に書けないため、ローカルでは microCMS の取得結果を差し替えた状態で確認する)
