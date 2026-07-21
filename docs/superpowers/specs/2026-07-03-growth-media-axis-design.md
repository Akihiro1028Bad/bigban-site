# グロースループ 媒体軸(media axis)設計

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

**日付**: 2026-07-03 / **対象**: グロースループ Track 4 ①媒体軸
**土台**: `scratchpad/growth-review/05-methodology-review.md` の案A(記事ネタ案に媒体軸を追加)＋改善案#3(ルーティングを行の媒体で出し分け)

## 1. 決定(変更しない前提)

- グロース記事の媒体は **`column`(SEO 資産)/ `news`(告知)** の2軸。
- 媒体は Notion「記事ネタ案」DB の **任意 select プロパティ `媒体`**(値: `コラム` / `ニュース`)で表す。
  **欠落=コラム=完全後方互換**。オーナーが手動追加するまでは全行コラム扱いで従来どおり動く。
- 公開先ルーティングは**行の `媒体` に追従**する:
  - `ニュース` → 常に `news` エンドポイント(env に依らない=告知は必ず news に載る)。
  - `コラム` → 従来どおり `GROWTH_MICROCMS_ENDPOINT` 従属(columns 分離 #columns の切替対象)。
- `GROWTH_MICROCMS_ENDPOINT` は **「column の公開先」** として再定義。news はこの値を無視する。

## 2. 純ロジック(単一の真実源)

`scripts/growth/endpoint.ts`(`@/lib/growth/endpoint` で再エクスポート・カバレッジ対象):

| API | 役割 |
|---|---|
| `type GrowthMedia = "column" \| "news"` | 媒体軸の型。 |
| `growthMediaForRow(value?)` | Notion `媒体` select 値 → media。`"ニュース"`→`news`、それ以外/未追加/空/未知→`column`(欠落耐性)。 |
| `growthEndpoint(media="column", env=process.env)` | 公開先エンドポイント名。`news`→常に`"news"`、`column`→env 従属。 |
| `growthArticleSegment(media="column", env=process.env)` | URL セグメント(news/columns)。同上＋未知値は`"news"`に丸める。 |

**後方互換**: 第1引数 media は既定 `column`。既存の `growthEndpoint()` / `growthArticleSegment()` 呼び出しは
media 省略=column=挙動不変。テスト注入用に env は第2引数へ移動(全既存呼び出しは no-arg / column デフォルトで無傷)。

`src/lib/growth/approve.ts` の `mediaOf(page)` は Notion ページの `媒体` を読み `GrowthMedia` を返す(承認画面 API 用)。

## 3. 配線点(どの経路が媒体追従になったか)

| 経路 | 媒体追従 | どうやって |
|---|---|---|
| **下書き作成(主経路)** `publish-draft-cli.ts` | ✅ | spec に `media`(`ニュース`/`コラム`)を追加。`growthMediaForRow(spec.media)` で公開先を解決し、create / eyecatch patch / draftKey 取得すべてがその ENDPOINT を使う。 |
| **承認画面プレビュー API** `api/growth/draft/route.ts` | ✅ | `mediaOf(page)` で行の媒体を読み、壊れ内部リンク検査の公開 slug(news / columns)を `growthArticleSegment(media)` で解決。 |
| **計測ループ** `metrics-cli.ts` → `metrics.ts articlePagePath` | ✅ slug解決も媒体追従 | `mediaOf(page)` を `articlePagePath(slug, locale, media)` に渡し GA4/GSC の URL セグメントを解決。さらに(レビュー対応 HIGH-2)`fetchSlugLocale` の microCMS エンドポイントも `growthEndpoint(media)` で解決(news 固定を解消。columns 切替後も column 記事の成績が取れる)。 |
| **microCMS 外部プレビュー** `api/draft/enable/route.ts` | ⚠️ 部分 | ルートは既に `?endpoint=news\|columns` を受ける(request 単位で出し分け可)。ただし microCMS 管理画面のプレビュー URL テンプレートは静的1本で、行ごとに news/columns を自動切替できない。**制約**: news 記事を microCMS プレビューする場合は URL の `endpoint=news` を明示する(既定 news なので当面問題は出にくい)。 |
| **手動 create/patch** `draft-content.ts` | ⚠️ 未追従 | 薄い手動 CLI(引数に payload.json)。現状 env 従属のまま。必要になれば `--media news` 引数で拡張可(今回はスコープ外・手動運用は主経路 publish-draft を使う)。 |
| **再生成/編集/公開系** `eyecatch-regen` / `body-image-regen` / `self-heal` / `publish-due` / `draft/edit` / `draft/excerpt` / `publish` / `draft/eyecatch` | ⚠️ 未追従(env 従属) | いずれも既存 draft を contentId で操作。news 記事へこれらを使う段になったら `mediaOf` 相当で行の媒体を渡す拡張が必要。**現時点は column 既定=挙動不変**で、告知は「作成→承認プレビュー→計測」の3経路が媒体追従できていれば MVP を満たす。既知の未達として明示(下記5)。 |

## 4. プロンプト

- `weekly.md`: 記事ネタ案に**両媒体を提案**。`媒体=ニュース` は**告知版S4**(確定事実のみ・doNotWrite 厳守・**未確定日時の断定禁止**・本数別枠)。**日時の可否は正典 `facility-context.json` の例外宣言に従う**(公式に公表・確定済みの日時は doNotWrite 対象外=レビュー対応 HIGH-1)。コラムは従来ルール維持。
- `drafts.md`: spec に `media` を追加。`ニュース` なら `articleType`/column category を付けず、`category` を
  news の日本語ラベル配列(`src/constants/news.ts` の `お知らせ`/`メディア掲載`/`イベント情報`/`キャンペーン`)にする。
  `コラム`(既定)は従来どおり。

## 5. 既知の未達・保留(正直な明示)

- 再生成/編集/公開系 CLI・API は env 従属のまま(§3表)。news 記事にこれらを使うには行の媒体を渡す配線が追加で要る。
- **TODO(必須・レビュー対応)**: **news 告知の実運用開始前に、publish 系(`publish-due`・`api/growth/publish`・`self-heal` 等)の媒体追従が必須**。未対応のまま `媒体=ニュース` の記事を公開キューに載せると、columns 切替後は誤ったエンドポイントへ公開操作が飛ぶ。`review-due-cli.ts` の `fetchPublishedAt`(news 固定)も同時に媒体追従へ直すこと(metrics-cli と同型の残課題)。
- `draft-content.ts`(手動 create/patch)と microCMS 外部プレビュー URL テンプレートは行単位の媒体自動切替に非対応。
- 承認画面 UI(`ProposalView`/`DetailPanel` 等)の媒体バッジ表示は本コミットでは追加しない(API は `mediaOf` で媒体を解決可能な状態)。

## 6. オーナーの手動作業

- Notion「記事ネタ案」DB に select プロパティ `媒体`(値 `コラム` / `ニュース`)を追加。**未追加でも従来どおり**動く。
- microCMS news 側に告知カテゴリ(`お知らせ`/`メディア掲載`/`イベント情報`/`キャンペーン`)の日本語ラベル select が既にある前提(`src/constants/news.ts` 準拠)。
