# szb-508 変更案リスト(microCMS 本番は人間が反映する)

起票: 2026-10-01 / issue #508 / 設計: `docs/superpowers/specs/2026-10-01-szb-508-freshness-design.md`

> 前提: microCMS の news に `eventEndAt`(日時・必須にしない)を追加し、コードが本番に出たあとに入力する。開催日は反映前に各記事の本文で再確認する(下表は 2026-09-30 の調査 `docs/research/2026-10-site-zero-base/R7-content-ia.md` に基づく)。日英は別レコードなので両方に入れる。手順は `docs/operations/news-admin-manual.md` の「終了日(eventEndAt)を入れる」。

## A. eventEndAt に入れる値(終了6本・日英で8件)

| slug | 言語 | 入れる値(JST) | 備考 |
|---|---|---|---|
| silver-week-2026 | ja | 2026-09-23 23:59 | 期間(9/19〜23)の最終日 |
| picklerox-2026 | ja・en | 2026-08-23 23:59 | 終わった申込枠(テニスベア/LaBOLA)のリンクが自動で外れる |
| ppt-vol4-kuroburudon-2026 | ja・en | 2026-08-22 23:59 | 終わった申込枠(テニスベア)のリンクが自動で外れる |
| obon-2026 | ja | 2026-08-16 23:59 | 期間(8/11〜16)の最終日 |
| ppt-vol3-natsumatsuri-2026 | ja | 2026-07-19 23:59 | 終わった申込枠(テニスベア)のリンクが自動で外れる。同じ大会の開催報告記事(ppt-vol3-summer-festival-report)は告知ではないので空のまま |
| medalist-morning-free-campaign | ja | 2026-08-31 23:59 | 対象の木曜6:00練習会自体も終了済み |

手打ちの【終了】が題名にある記事にも入れておく(入力後、題名の【終了】は外してよい):

| slug | 言語 | 入れる値(JST) |
|---|---|---|
| hyrox-osaka-early-access-simulation | ja | 2026-09-26 23:59 |
| early-morning-pickleball-dupr35 | ja | 本文で最終開催日を確認して入力 |

## B. 本文の手直し案(公開は人間のみ。書き直しは `npm run growth:body-diff` を通す)

1. **silver-week-2026**: 本文リンク「体験会…9月19日・22日・27日」が、10月版に書き換わった体験会記事(hyrox-morning-trial-class-2026)を指していて食い違う。リンク文言を現在の記事に合う表現にするか、終了済みなのでリンクを削除する
2. **hyrox-official-training-gym(英語版)**: `/en/columns/hyrox-beginners-guide`(404)へのリンクを外すか、日本語記事へ張り替える(#511 の範囲と重なるため調整する)
3. **pbt-club-membership(英語版)**: 題が「8月1日開始」のまま(日本語版は9/17改稿済み)。日本語版に合わせて更新する

## C. 期限つきコラム(コードは変更しない。microCMS で改稿)

| 記事 | 内容 | 期限・タイミング |
|---|---|---|
| pickleball-funabashi-guide | 「2026年10月下旬に開業予定」の他施設(TAROKO 下総中山)を軸にした構成 | **10月下旬の開業後に更新**。開業の事実を確認してから書き直す |
| pickleball-chiba-guide | 同じ「開業予定(10月下旬)」の記述 | 同上 |
| summer-indoor-pickleball-motoyawata | 夏の季節記事(今は秋) | 季節を問わない題への改稿、または秋冬向けへの置き換え |

改稿の進め方: 既存記事との検索意図の重なり(カニバリ)と、消えた要素(リンク・見出し・表)のチェックを必ず通す。未確定の日時・料金は断定せず「最新情報をご確認ください」と促す。営業時間に触れる場合は 2026-10 以降の値(6:00-25:00、23:00-25:00 は深夜料金帯)を使う。
