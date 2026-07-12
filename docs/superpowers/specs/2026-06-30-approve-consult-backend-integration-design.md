# 承認画面 AI相談ドロワー 本番繋ぎこみ（差分B）設計書

- 日付: 2026-06-30
- 対象: 本番承認画面 `src/app/growth/approve/`（プロト `approve-proto/` ではない）
- 種別: 機能移植・本番結線（プロトで検証済みUXを稼働中フローへ加算）
- 由来: 「プロト→本番 繋ぎこみ」ロードマップのフェーズ1。設計チーム競作→リスク監査→統合を経て確定。
- 突合: プロト型とバックエンドzodスキーマの項目別突合は別紙 [`2026-06-30-proto-backend-reconciliation.md`](./2026-06-30-proto-backend-reconciliation.md)（全61項目）。本仕様の型整合（§4.1）はその差分B節 B1〜B11 を反映済み。**正典は `scripts/growth/*.ts` の zod スキーマ**（advise.ts / bodyComment.ts / revise.ts）であり、プロト型は全面的にこれへ寄せる。

## 0. 全体ロードマップにおける位置づけ（確定事項の記録）

本作業は白紙からのバックエンド接続ではない。本番 `/growth/approve` は既にフル稼働している（Notion=依頼キュー＋microCMS=下書き/公開＋Bearer認証＋自宅PC `run.mjs` ループ）。「繋ぎこみ」の実体は、プロトで検証した新規UX差分を稼働中フローへ壊さず加算移植すること。差分は3つ:

| 差分 | 内容 | 状態 |
|---|---|---|
| **C** | Advice / Decoration の本番UI結線 | **完了済み**（`DraftReadyView.tsx:81,89` でrender済み・裏取り済）→ 対象外 |
| **B** | AI相談ドロワー統合 | **本仕様**（フェーズ1・先行） |
| **A** | 施策多種別インボックス（article/site/event/other） | 後続サイクル（別仕様）。下記§9に確定事項を記録 |

**ユーザー確定事項（本仕様に効くもの）**:
1. 着手はフェーズ1＝差分B（AI相談統合）から。Notionプロパティ追加・run.mjsモード追加が不要でコードのみ完結し、差分Aの仕様検討と並行できるため。
2. 差分Bにおける既存 revise UI（`ReviseReady.tsx` / `useReviseEditing`）は **ConsultDrawer の revise タブに吸収し、旧UIは削除**。同一Notionプロパティへの二重書き込み口を排除する。

## 1. 目的

プロト `approve-proto` で検証した「AIに相談」ドロワー（全体見直し / 対象修正 / 文ごと指摘の3モードを1つのドロワー＋1エンジンに統合）を、本番承認画面に移植する。本番には既に裏側ループ（advise / revise / comment-revise）が pull型で稼働しているが、UIが `DraftReadyView` 内に分散している（AdviceCard、DecorationAssistant、ReviseReady が別個）。これを1ドロワーに統合し、承認者の「どこで何を依頼するか」の認知負荷をゼロにする。

## 2. スコープ / 非スコープ

### スコープ
- 本番 `src/app/growth/approve/` への ConsultDrawer 系コンポーネント移植・本番 `PendingItem` 型へのリワイヤ。
- `src/lib/growth/consult.ts`（新規・純ロジック・テスト100%）: board item の3ループ状態 → 統一相談ビューモデルへの正規化。
- `useConsult` の本番化: モックタイマー（1800ms）を、既存 `useReviseEditing` と同じ「POST→Notion依頼→React Queryポーリング反映」方式に置換。
- 既存 revise UI（ReviseReady / useReviseEditing）の ConsultDrawer revise タブへの吸収と旧UI削除。

### 非スコープ
- 差分A（施策多種別）。後続別仕様（§9に確定事項のみ記録）。
- 新規 run.mjs モード・新規 Notion プロパティ・新規 claude プロンプトの追加（本仕様は既存ループ資産の結線のみ）。
- advise/decorate/comment-revise の**ループ内ロジック改変**（CLI・プロンプト・段階ガードは現状維持）。
- 認証方式の変更（既存 `authHeaders` / `verifyToken` をそのまま使用）。

## 3. 設計方針（核）

**ドロワーは新しい状態ストアではなく、board item が既に持つ3つのループ状態（advise / revise / comment-revise）を統一表示するビュー＋依頼を投げるコンポーザである。**

プロトは相談を `Article.consults[]` というローカル配列に持ち、1800msタイマーで即結果を差し込むモックだった。本番では「相談状態」の真実は **Notion 側のループプロパティ**（例: `修正ステータス` = 依頼中/提示中、`アドバイスステータス`、コメント系ステータス）にあり、それは既に `GET /api/growth/approve` → board → `PendingItem` 経由で UI に届いている。

したがって本番の正しい設計は:
- **状態を二重に持たない**。consult ビューモデルは `PendingItem` の既存ループプロパティから**導出**する（純ロジック `consult.ts`）。
- **コンポーザは依頼を投げるだけ**（既存 POST エンドポイント）。結果は board ポーリングで自然に `presenting` に変わる。
- プロトが温存した相談3状態 `requested → presenting → failed` は、この pull型非同期フロー（依頼中 → 提示中 → 失敗）に**そのまま1:1対応**する。失敗/再依頼の表示・型はプロトで温存済みのものを活かす。

## 3.1 実装方針（Option Y: プロト見た目を移植・既存結線は再利用）

突合の結果、本番には3モードの**結線済みUIが既に存在**することが判明した（revise=`ReviseReady`+`useReviseEditing`、overall=`AdviceCard`(5エンドポイント内蔵)、sentence=`InlineCommentReview`+bodyComment配線）。ユーザー決定（2026-06-30）は **「プロトの見た目を移植して結線し直す」**。ただし二重保守を避けるため、次を厳守する:

- **presentation は移植、wiring は再利用**: プロトの提示本体（`AdviceResultBody` / `SentenceFixBody` / `ReviseProposalBody` / `CommentableBody`）の**見た目だけ**を本番へ移植する。各モードの依頼/ポーリング/採用/破棄の**ロジックは新規実装せず**、既存の結線を**フックに抽出して再利用**する（`AdviceCard.tsx` 内蔵の advise 5エンドポイント処理は `useAdviceConsult` 等へ抽出、revise は `useReviseEditing` を流用、bodyComment は既存配線を抽出）。`AdviceCard` の5エンドポイント分を ConsultDrawer 側に**再実装してはならない**。
- **データソースは2系統**（突合で確定）: revise の状態は `PendingItem`（reviseStatus/reviseProposal/reviseTitleProposal/reviseInstructions）に在る。overall/sentence の結果は `DraftPreview`（`advice: AdviceView` / `bodyComment: BodyCommentView`、`GET /api/growth/draft`・`useDraftPreview`）に在る。consult.ts はこの2系統を統一ビューに正規化する。
- **旧サーフェスは撤去**: ConsultDrawer 統合後、`DraftReadyView` から `AdviceCard`・`InlineCommentReview` の個別 render と `ReviseReady` を外し、ドロワーに集約（重複表示の排除）。`AdviceCard.tsx` は wiring 抽出後、presentation を `AdviceResultBody`(移植) に置換 or 撤去。

## 4. モード ↔ 既存ループの対応

| ConsultKind（proto） | 入力 | 本番エンドポイント | 既存run.mjsモード | 結果型 | 既存UI（吸収/置換元） |
|---|---|---|---|---|---|
| `overall`（全体見直し） | instruction（着眼点・任意） | `POST /api/growth/advise` → 結果は `GET /api/growth/draft` の `draft.advice`（AdviceView） | `advise`（read-only） | `AdviceSchema`＝`{summary, scores[], strengths[], fixes[]}`（§4.1 B1〜B3） | AdviceCard |
| `revise`（対象修正） | 構成案への**行コメント配列** `{line, comment}[]`（＋タイトル指示）。**本文targetは存在しない**（§4.1 B6/B7） | `POST /api/growth/revise` → `/revise/apply` | `revise` | 修正案（構成案/タイトルの before/after） | **ReviseReady（吸収・削除）** |
| `sentence`（文ごと指摘） | `{blockIndex, excerpt(完全文), comment}[]`（§4.1 B4） | `POST /api/growth/body-comment` → `comment-revise` | `comment-revise` | `{commentIndex, before, after}[]`（§4.1 B5） | （本番未統合の行コメント） |

- 採用/破棄は既存の `/advise/apply`・`/advise/dismiss`・`/revise/apply`・`/decorate/dismiss` 等のエンドポイントを流用（新設しない）。
- decorate（装飾）は差分C（完了済み・DecorationAssistant）として別枠。本ドロワーに含めるか否かは実装時に判断（含めるなら `overall` 群の隣に第4タブ。YAGNI観点では初版は3モードに絞ってよい）。
- **実装時に必ず `docs/operations/growth/40-notion-props.md` と `30-loops.md` で各ループの正確なプロパティ名（指示/ステータス/結果/依頼時刻）と comment-revise の依頼・結果プロパティを確認すること**。本表はモード対応の設計であり、プロパティ名の正典はドキュメント側。

## 4.1 突合で確定した型整合（zodスキーマが正典・proto型を全面的に寄せる）

突合（別紙§差分B）で、プロトの相談系型はバックエンドの zod スキーマと構造が食い違うことが判明した。`src/lib/growth/consult.ts` と移植コンポーネントは**プロト型を捨て、以下のバックエンド型に合わせる**。バックエンド拡張は不要。

| # | プロト（捨てる） | バックエンド（正典） | 対応 |
|---|---|---|---|
| B1 | `Advice.overall:number`(0-100) | `AdviceSchema.summary:string`（advise.ts:73） | `overall` 廃止、`summary` を見出し表示 |
| B2 | `AdviceScore{label, score 0-100}` | `{axis, score:0-5整数, note?}`（advise.ts:53） | `label→axis`、スコア表示を0-5に、`note?`追加 |
| B3 | `AdviceFix{quote必須, reason, suggestion}` | `{area必須, severity:'高'\|'中'\|'低'必須, quote?, reason, suggestion}`（advise.ts:61） | `area`/`severity`追加・`quote`をoptionalに・severityラベル表示 |
| B4 | `BodyComment{block, unit, text}` | `{blockIndex, excerpt, comment}`（bodyComment.ts:111） | 全改名。`excerpt`は文の**完全テキスト**（サーバ `selectAnchoredComments` が一致で再アンカー） |
| B5 | `BodyCommentFix{block, from, to, sentence}` | `{commentIndex, before, after}`（bodyComment.ts:151） | 置換。反映は `applyBodyCommentItem`（before一意一致でブロック特定）。proto の index 直参照は捨てる |
| B6 | `revise.outline:string`（自由文1テキストエリア） | `instructions=ReviseComment[]{line, comment}`（revise.ts:46） | revise入力UIを**行コメントフォーム**に再設計（1テキストエリアは繋ぎ込み不可） |
| B7 | `ReviseTarget='outline'\|'title'\|'body'` | body修正ルート**無し**（revise.ts:14） | `ReviseTarget` を `'outline'\|'title'` に限定。本文修正は sentence(comment-revise) へ誘導 |
| B8 | `ConsultStatus` 3値 | Notion select 5値 `なし/依頼中/処理中/提示中/失敗`（advise.ts:36） | 写像: なし=初期 / 依頼中=`requested` / 処理中=`processing` / 提示中=`presenting` / 失敗=`failed`。**`処理中`はPC lock済（BUSY_STATUSES）で再依頼禁止**＝`requested` と必ず区別 |

> `ConsultStatus` は3値→**4値**（requested / processing / presenting / failed）に拡張する。`processing` の導入が pull型の安全装置（多重依頼防止）。プロトが温存した failed/再依頼の表示はそのまま活きる。

## 5. ファイル構成

### 新規
- `src/lib/growth/consult.ts` — 純ロジック。`PendingItem`（の各ループ状態）→ 統一相談ビューモデル `ConsultView[]` への正規化、状態マッピング（依頼中→requested / 提示中→presenting / 失敗→failed）、欠落耐性（プロパティ欠落時は当該モードを「未依頼」として安全に省く）。型は `import type` のみ・他の重いファイルを巻き込まない（カバレッジ100%ゲートを波及で壊さない）。
- `src/lib/growth/consult.test.ts` — 上記の100%ユニットテスト。

### 移植（proto → 本番、PendingItem型にリワイヤ）
- `ConsultDrawer.tsx` / `ConsultComposer.tsx` / `ConsultCard.tsx`
- 提示本体: `ReviseProposalBody.tsx` / `AdviceResultBody.tsx` / `SentenceFixBody.tsx` / `CommentableBody.tsx`
- これらは本番 `src/app/growth/approve/` 配下へ置く。proto版はそのまま残置（捨て駒なので削除不要・参照断ち切りのみ）。

### 改修
- `src/app/growth/approve/hooks/useConsult.ts`（新規 or useReviseEditing を発展）— モックタイマー撤去。各モードの request を既存 POST に結線し、結果は `useApproveBoard` のポーリングに委ねる。retry/dismiss/apply は既存エンドポイント呼び出し。
- `ApproveClient.tsx` / `DraftReadyView.tsx` — 分散していた AdviceCard / ReviseReady の起点を「AIに相談」ボタン → ConsultDrawer に集約。AdviceCard は提示本体としてドロワー内へ。
- 削除: `ReviseReady.tsx` と、ConsultDrawer に吸収後に不要となる `useReviseEditing` の重複経路（書き込み口の一本化）。

## 6. データフロー（pull型・非同期）

```
[相談する] ConsultComposer（overall=instruction / revise=行コメント配列 / sentence=コメント配列）
  → useConsult.request(kind, input)
    → authHeaders() + POST /api/growth/{advise|revise|body-comment}
      → サーバ: verifyToken → Notion updatePageProps（指示＋ステータス=依頼中＋依頼時刻）
  → board の当該ループステータスが「依頼中」に → ConsultCard status=requested
    ※ ステータスが「処理中」(=PCがロック実行中)の間は再依頼ボタンを無効化（BUSY_STATUSES・多重依頼防止）

[自宅PC] cron 5分 → node run.mjs {advise|revise|comment-revise}
  → CLI が1件ロック（ステータス=処理中）→claude実行→結果をNotionに書く（ステータス=提示中＋結果JSON）
  ※ 応答は即時ではない（数分〜15分）。即時前提のドロワーUIは作らない

[承認画面] useApproveBoard の条件付きポーリングが状態遷移を取得（依頼中→処理中→提示中/失敗）
  → consult.ts が状態を ConsultStatus に写像（依頼中=requested/処理中=processing/提示中=presenting/失敗=failed）
  → 結果の取得元はループ別:
      overall  : GET /api/growth/draft の draft.advice（AdviceView{status, advice, raw}）
      revise   : board/draft の修正案プロパティ
      sentence : board/draft の comment-revise 提案（{commentIndex, before, after}[]）
  → ConsultCard が提示本体（AdviceResultBody / ReviseProposalBody / SentenceFixBody）を表示

[採用] applyXxx → POST /api/growth/{advise/apply|revise/apply|body-comment 反映}（既存ロジック・microCMS/Notion確定）
[破棄] dismissXxx → POST /api/growth/{advise/dismiss|decorate/dismiss 等}（既存）
[失敗] ループがステータス=失敗を書く → status=failed → 再依頼ボタンで再 request
```

## 7. 認証・セキュリティ

- 既存方式を踏襲: クライアントは `authHeaders()` で `Authorization: Bearer <token>`、サーバは `verifyToken`（`safeEqual` 定時間比較）。新しい認証経路は作らない。
- 本ドロワーが叩くのは既存の advise/revise/body-comment 系のみ（いずれも `verifyToken` 済み）。publish 等の強権限エンドポイントには触れない。
- `APPROVE_AUTH_ENABLED` は本番ON前提（既定ON）。`MICROCMS_MANAGEMENT_API_KEY` は server-only を維持（本仕様で新たに公開しない）。

## 8. テスト方針

- `consult.ts` を純関数としてユニットテスト100%（全モードの正規化、状態マッピング4値＝依頼中/処理中/提示中/失敗＋初期「なし」、**処理中=再依頼禁止の判定**、プロパティ欠落フォールバック、複数ループ同時提示）。`import type` 厳守で他ファイル非依存。
- `consult.ts` の型は **§4.1 のとおり `scripts/growth/{advise,bodyComment,revise}.ts` の zod 型に一致**させる（proto型は使わない）。テストはこの整合（summary/scores(0-5)/fixes(area,severity)/blockIndex/excerpt/commentIndex 等）を固定する。
- ドロワー/コンポーザ/フックの薄い結線UIは無計測（本番approveの既存方針＝thin wiringはカバレッジ除外を踏襲）。検証は `tsc` + `eslint .`（`next lint` はNext16で廃止）+ 手動（ユーザーがブラウザ確認）。
- 既存テスト（useReviseEditing 周辺等）が削除/吸収で壊れないこと。revise吸収に伴う既存テストの移設・更新を含める。

## 9. 後続：差分A（施策多種別）確定事項の記録 ※本仕様では実装しない

別サイクル（別仕様＋別プラン）で詳細化する。リスク監査で判明した地雷と、ユーザー確定事項を失わないため記録:

> 2026-06-30 のユーザーとの突合対話で確定。当初の「自動生成しない・手動クローズ」案は**撤回**し、稼働中の `initiatives` 自動生成を活かす方針に変更（下記）。

- **種別は6種**（4→6に拡張）: `記事 / サイト / イベント / MEO / SEO / その他`。新「種別」プロパティは足さず、**所属DB＋既存`カテゴリ`から導出**する純関数 `categoryToKind()` で表現:
  | 出所 | → 種別 |
  |---|---|
  | 記事ネタ案DB（カテゴリ=コンテンツ） | 記事 |
  | 施策提案DB / MEO | MEO |
  | 施策提案DB / SEO（**新設**） | SEO |
  | 施策提案DB / サイトデザイン | サイト |
  | 施策提案DB / サイト表示内容 | サイト |
  | 施策提案DB / 追加機能 | その他 |
  | 施策提案DB / イベント | イベント |
- **SEOカテゴリを新設**: 週次AIは既に「SEO/MEO/CRO/ブランド」4視点で分析済み（weekly.md:27）だが出力カテゴリにSEOが無い。`PROPOSAL_CATEGORIES`（proposals.ts:10）に `"SEO"` を追加＋weekly.mdに一文。これで内部リンク/メタ改善/構造化データ等が SEO 施策として上がる。
- **承認後アウトカム＝既存 `initiatives` を活かす**（地雷の解消）: 施策を**承認**すると `initiatives` ループが文案/仕様書をNotion本文に自動生成（MEO→GBP文案、サイト表示内容→文言案Before/After、サイトデザイン/追加機能→仕様書）。人がそれを見て実作業し、**「対応済み」で一覧から非表示**。「承認した瞬間 initiatives が動く」のは事故ではなく**意図した仕様**になった。
  - article（記事）は従来どおり: 承認→記事生成パイプライン（drafts）→下書きレビュー→公開。
  - 施策（site/MEO/SEO/サイト/その他/event）: 承認→initiatives生成→**対応済み**（公開の概念が無い施策の終端状態）。
- **initiatives に生成分岐を追加**: 現状 initiatives.md は MEO/サイト表示内容/サイトデザイン/追加機能 を扱う。**event（企画書）と SEO（内部リンク/メタ/構造化データ仕様）の分岐を追加**する。
- **「対応済み」状態を新設**: 現 `ProposalStage`(untouched/approved/rejected) に終端状態（対応済み/完了）を1つ追加（Notion select 値＋導出）。
- 含意: 差分Aは「種別バッジ（6種）＋追加フォームの種別選択＋施策の終端『対応済み』アクション＋SEOカテゴリ＋initiativesのevent/SEO分岐」が中心。バックエンド拡張は **SEOカテゴリ1語・initiatives分岐2つ・対応済み状態1つ** に限定（いずれも加算的）。
</parameter>
</invoke>
