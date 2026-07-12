# グロース記事 本文画像の完全動線（挿入・差し替え・再生成・多スタイル生成）設計

> 作成: 2026-07-04 / ステータス: 承認済みドラフト / 対象: 承認画面 `/growth/approve`・リッチエディタ `DraftEditor`・本文画像 pull 型ループ（#156）
> 関連 Issue: #59（本文画像）/ #62（構成案の画像指示 persist）/ #142・#143（メディア差し替え）/ #144（アイキャッチ再生成）/ #145（本文画像差し替え）/ #156（本文画像 AI 再生成ループ）/ #165（apply）
> 関連文書: `docs/operations/growth/20-draft.md`・`docs/operations/growth/30-loops.md`・`docs/operations/growth/40-notion-props.md`・`docs/operations/growth-article-style.md` §9

## 1. 背景・目的

現状、記事本文に画像を入れる／差し替える動線が実質どこにも無い。

- **構成案の画像ディレクター UI は非表示**: 承認画面の画像指示 UI は `isImageDirectorEnabled()=false`（#62 未完のため）で常時 OFF。`ImageInstruction`（`src/app/growth/approve/imageIntentTypes.ts`）は per-section の `mode/action/isEyecatch/advancedNote` を持つが persist 経路が無く、下書き生成側も読まない。
- **リッチエディタに画像挿入手段が無い**: `DraftEditor`（`src/app/growth/approve/DraftEditor.tsx`）のツールバーに画像ボタンは無く、`PreservedBlockView`（同 L78-142）は保持ブロックの移動（ドラッグ）と削除のみ。
- **本文画像の差し替え UI は撤去済み**: `BodyImagePicker` と純ロジック `bodyImageEdit.ts` は approve-proto 全面移植（`docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md` AD5-8）で **削除済み**。#145 の差し替えは受け皿を失っている（本 spec で再建する）。
- **生成コードは 3 スタイル実装済みだが UI 層が宇宙人固定**: `scripts/growth/body-image.ts` は `mascot`/`minimal`/`diagram` の `PROMPT_BUILDERS`（同 L40-53）を持つが、UI 層の `ImageInstruction` に `style` フィールドが無く、`migrateImageHint`（`src/lib/growth/imageIntent.ts` L47-55）は旧スタイル指定（`mascot:` 等）を house style ロックとして**破棄**し `action` だけ残す。結果、本文画像は事実上マスコット固定。

**目的**: 本文画像の「差し替え」「AI 再生成」「新規挿入」を **承認画面（画像タブ）とリッチエディタの両方**から行えるようにし、スタイルを **6 択**へ拡張、文字・数値入りの図解も安全に生成できるようにする。

## 2. スコープ / 非スコープ

- **スコープ**: P1〜P3（第 13 節）＋ P4 は概要のみ（詳細は別 spec）。
- **非スコープ**:
  - SVG/HTML レンダラーによる図解生成（将来検討。今回は gpt-image-2 ＋文字検証ループで対応）。
  - メディア削除 API。
  - 本番公開フローの変更（本文画像は下書き `status=draft` の `patchDraft` のみ）。

## 3. 設計原則との整合（CLAUDE.md 正典に従う）

- **pull 型**: AI 生成はすべて常時稼働 PC ループが実行する。Vercel 側 API は Notion に依頼を書くだけ。同期でよい差し替え（既存アセット URL の付け替え）だけは API が直接 `patchDraft` する。
- **純ロジック分離**: 新規ロジックは `scripts/growth/*.ts` に置き、`src/lib/growth/*` から再エクスポートする（例: `src/lib/growth/bodyImageRegen.ts` が `scripts/growth/body-image-regen.ts` を `export *`）。CLI・`run.mjs`・`gen-*` はカバレッジ除外（既存方針）。
- **絶対禁止の遵守**: 未確定情報（料金・営業時間・面数・所要分）は **画像内の文字でも**断定しない（第 5 節）。失敗を沈黙させない（LINE 通知・冪等再開）。
- **段階ガード（#H9）・`articleEditGuard`** は既存どおり全書き込み経路に適用する。

## 4. スタイル体系（6 択）

| key | 表示名 | 生成方式 | 参照画像 |
|---|---|---|---|
| `auto` | おまかせ | Claude が文脈で選択（既定 `mascot`） | - |
| `mascot` | 宇宙人マスコット | `/v1/images/edits` ＋ `assets/mascot-alien.png`（現行） | あり |
| `illust` | 雰囲気イラスト | text-to-image | なし |
| `court` | コート図・ルール図解 | text-to-image ＋文字/数値許可 | なし |
| `flow` | 手順・フロー図 | text-to-image ＋文字/数値許可 | なし |
| `infographic` | 比較・インフォグラフィック | text-to-image ＋文字/数値許可 | なし |

### 4.1 型・後方互換

- `BodyImageStyle`（`scripts/growth/body-image.ts` L12。現状 `"mascot" | "minimal" | "diagram"`）を新 5 キー（`mascot`/`illust`/`court`/`flow`/`infographic`）へ拡張する。`auto` は生成型には含めない（4.2 で定義）。
- **旧値の吸収**: 旧 `minimal` → `illust`、旧 `diagram` → `court`（既定）へマップする純関数 `normalizeBodyImageStyle(raw: string): BodyImageStyle` を追加し、Notion・CLI・API の受理側で必ず通す。旧値を受理しても内部表現は新キーに正規化する。`flow`/`infographic` は旧 `diagram` からの自動振り分けはせず、明示指定でのみ選ばれる（誤変換を避ける）。
- `PROMPT_BUILDERS`（`scripts/growth/body-image.ts` L40）に `illust`/`court`/`flow`/`infographic` のプロンプトビルダーを追加する。既存 `mascot` はそのまま。`minimal`/`diagram` キーは `PROMPT_BUILDERS` から**削除せず後方互換で残す**か、`normalizeBodyImageStyle` で入口正規化し内部は新 6 キーのみとするかは実装時に一方に統一する（本 spec は「入口で正規化し内部は新キーのみ・`minimal`/`diagram` は `PROMPT_BUILDERS` から除去」を採る）。

### 4.2 `auto` の扱い

- `auto` は **依頼値としてのみ存在**するスタイル（「Claude が選ぶ」の意）。生成時点では必ず具体スタイル（`mascot`/`illust`/`court`/`flow`/`infographic`）へ解決される。
- そのため `BodyImageStyle`（生成に渡す型）は 5 キー（`auto` を含まない）とし、依頼キューが運ぶ値の型 `RequestedBodyImageStyle = BodyImageStyle | "auto"` を別に定義する。PC ループの Claude が `auto`／空を文脈から具体スタイルへ落とす（既定 `mascot`）。

### 4.3 生成方式・参照画像・サイズ

- **参照画像付与は `style === "mascot"` のときのみ**（現行維持）。`gen-body-image.ts` L54（`refPath: style === "mascot" ? DEFAULT_REF : undefined`）と `publish-draft-cli.ts` L163（同条件）の分岐をそのまま活かす。`illust`/`court`/`flow`/`infographic` は参照なし text-to-image。
- 生成サイズは現行踏襲（`1536x1024`, `quality=high`）。
- 冪等キャッシュ `bodyImageFileStem`（`scripts/growth/body-image.ts` L230）は `spec.style` をキーに含む（同 L232）ため、スタイル拡張に伴う変更は不要。

### 4.4 スタイルガイド追記（文書更新もスコープ）

- `docs/operations/growth-article-style.md` §9 配下の「### 本文画像（任意…）」小節（現状 L125-135、`mascot`/`minimal`/`diagram` の 3 種表）を **6 スタイル表**へ更新する。旧値マップ（`minimal→illust`・`diagram→court`）と、文字/数値を焼き込んでよいスタイル（`court`/`flow`/`infographic`）を明記する。`PICKLEBALL_ANCHOR`/`NO_TABLE_TENNIS`（同 §9 の注記 L123）の付与対象も新スタイルへ整理する（スポーツシーンを描き得る `mascot`/`illust` に付与、概念図の `court`/`flow`/`infographic` には付与しない）。

## 5. 文字・数値の扱い（数値入り図解の安全設計）

`court`/`flow`/`infographic` は図中に文字・数値を焼き込む。捏造リスク（#58）を避けるため、次を厳守する。

### 5.1 出どころ確定ルール

画像内に描いてよい数値・固有情報は次の 3 種のみ:

1. `scripts/growth/facility-context.json` の確定値。
2. 記事本文（下書き HTML）に既に書かれている値。
3. ピックルボール公式規格（コート寸法など公知の事実）。

未確定項目（営業時間・料金・面数・所要分の断定など）は **画像内でも禁止**（正典の絶対禁止を画像に拡張）。

### 5.2 依頼の文字指定（`textSpec`）

- 依頼に `textSpec`（図に入れる文字・数値のリスト。自由入力）を追加する。UI・API・Notion・CLI・プロンプトへ通す（第 6〜8 節）。
- サーバ側で `textSpec` は **1000 字上限**（超過は 400）。

### 5.3 検証ループ（PC ループの Claude が実施）

`scripts/growth/prompts/regen-body-image.md`（および新設する挿入用プロンプト）の手順に次を追記する:

1. `textSpec` の各文字列をプロンプトに組み込んで生成する。
2. 生成画像を Claude 自身が目視検査し、指定文字列が崩れ・誤記なく描かれているか照合する。
3. NG なら再生成する（**最大 3 回**）。
4. 3 回失敗したら**文字なし版**を納品し、LINE 通知で「文字焼き込み失敗・文字なしで納品」と報告する（沈黙させない）。

## 6. データモデル拡張（Notion「記事ネタ案」DB）

既存 #156 の依頼キュー（`scripts/growth/body-image-regen.ts` の `BODY_REGEN_PROPS`）を拡張する。現行プロパティ（同 L20-29）:

- `本文画像再生成指示`（`instruction` / rich_text）
- `本文画像再生成ステータス`（`status` / select: なし/依頼中/処理中/失敗）
- `本文画像再生成依頼時刻`（`requestedAt` / date）
- `本文画像再生成対象`（`targetSrc` / rich_text）

### 6.1 追加プロパティ

- `本文画像スタイル`（select: `おまかせ`/`mascot`/`illust`/`court`/`flow`/`infographic`）。表示名 `おまかせ` は `auto` に対応。
- `本文画像文字指定`（rich_text。`textSpec`）。

### 6.2 挿入も同一キューに乗せる（discriminated target）

`本文画像再生成対象` の値で「差し替え」と「新規挿入」を判別する:

- **差し替え**: 現行どおり microCMS アセット URL（`isMicrocmsAssetUrl` 検証）。
- **挿入**: `placeholder:<id>` 形式（`id` は `img-<英数-ハイフン>`）。本文 HTML 中の `<figure data-pending="img-...">` を狙う目印。

CLI 側は対象文字列が `placeholder:` プレフィクスかどうかで `targetKind`（`src` | `placeholder`）を判定する純関数 `parseBodyRegenTarget(raw: string): { kind: "src"; src: string } | { kind: "placeholder"; placeholderId: string } | null` を追加する。

### 6.3 Props ビルダー拡張

`scripts/growth/body-image-regen.ts` の各ビルダーへ `style`・`textSpec` を通す:

- `buildBodyRegenRequestProps(instruction, target, style, textSpec, nowIso)`（現状 L52 は `instruction, targetSrc, nowIso`）: `本文画像スタイル`（select）と `本文画像文字指定`（rich_text）を追加書き込み。`target` は差し替え URL か `placeholder:<id>`。
- `buildBodyRegenProcessingProps`（L67）: 変更なし（status のみ）。
- `buildBodyRegenDoneProps`（L73）: `status=なし`・`instruction=[]`・`targetSrc=[]` に加え、`本文画像スタイル` を「おまかせ」へ・`本文画像文字指定=[]` へ**クリア**する。
- `buildBodyRegenFailProps`（L83）: 変更なし（status のみ。指示・対象・スタイル・文字指定は残し再依頼できる）。

### 6.4 読み取り・ビュー拡張

- `BodyRegenRow`（L116）に `requestedStyle: RequestedBodyImageStyle`・`textSpec: string`・`targetKind` 由来情報を追加。
- `bodyRegenRowFromPage`（L132）で `本文画像スタイル`（select）・`本文画像文字指定`（rich_text）を読み、`本文画像再生成対象` を `parseBodyRegenTarget` で解釈する。
- `BodyRegenView`（L150）・`bodyRegenViewOf`（L162）に `requestedStyle`・`textSpec` を追加（承認画面のバッジ／再依頼プリフィル用）。

### 6.5 欠落耐性・文書

- プロパティ未追加でも沈黙落ちさせず、`growthApiError`（既存）でプロパティ名つきに可視化する（#177 方針踏襲）。
- `docs/operations/growth/40-notion-props.md`（現状 L53 に本文画像再生成 4 プロパティを列挙）へ `本文画像スタイル`・`本文画像文字指定` と `placeholder:<id>` 対象形式を追記する。

## 7. API 変更

すべて `verifyToken`（`Authorization: Bearer`・`authHeaders`）・`articleEditGuard`・サーバ側 `sanitizeNewsHtml(STRICT_HTML_CONFIG)` 再適用を維持する。

### 7.1 `/api/growth/body-image/regen`（既存 POST を拡張）

`src/app/api/growth/body-image/regen/route.ts` を拡張する:

- **body**: `{ pageId, target, style?, textSpec?, instruction? }`。
  - `target`: `targetSrc`（microCMS URL・`isMicrocmsAssetUrl` 検証）**または** `placeholderId`（`^img-[A-Za-z0-9-]{6,64}$` 検証）のどちらか一方（discriminated）。差し替えか挿入かはこの形で判別する。
  - `style?`: 6 表示値（`おまかせ`/5 スタイル）を enum 検証し内部キーへ正規化。省略時は `auto`。
  - `textSpec?`: 1000 字上限（超過は 400）。
  - `instruction?`: **500 字上限**（現行 `MAX_INSTRUCTION_LEN=500`・同 L31 維持）。
- **維持**: `verifyToken`（同 L44）・`articleEditGuard`（同 L72）・`row.contentId` 無ければ 400（同 L75）・`BODY_REGEN_BUSY_STATUSES` で 409（同 L78-83）。
- 書き込みは `buildBodyRegenRequestProps`（6.3 拡張版）を 1 PATCH で。

### 7.2 `/api/growth/draft/body-image`（新設 POST・同期差し替え）

新規ルート。既存 `/api/growth/draft/eyecatch/route.ts` と同型パターン:

- **body**: `{ pageId, targetSrc, newUrl }`。両 URL とも `isMicrocmsAssetUrl`（`@/lib/growth/media`）で検証。
- 本文 HTML の該当 `<img src>` を差し替える。差し替えは `replaceBodyImageBySrc`（`scripts/growth/body-image-regen.ts` L250。src 一致の**先頭 1 枚のみ**・関数形式置換で `$1`/`$2` 展開事故を防止済み）を流用する。
- 差し替え後 `sanitizeNewsHtml(STRICT_HTML_CONFIG)`（`@/lib/news/sanitize`）を再適用。
- Notion ミラー（`BODY_MIRROR_PROP`・#95）更新 ＋ microCMS `patchDraft`（`@/lib/growth/content`。eyecatch ルートと同じく **content API キー**を使い、管理キーは使わない）。いずれか失敗時はロールバック（書き込み前の状態へ戻す）。
- 成功で承認画面が盤再取得できるレスポンス（`{ success: true }`）を返す。

### 7.3 `/api/growth/draft/edit`（既存に競合ガード追加）

`src/app/api/growth/draft/edit/route.ts` は既に `articleEditGuard`（同 L24 import・L90 適用）と `sanitizeNewsHtml(STRICT_HTML_CONFIG)`（同 L25 import）を持つ。ここへ**本文画像再生成の競合ガード**を追加する:

- 対象記事の本文画像再生成ステータスが `依頼中`/`処理中`（`BODY_REGEN_BUSY_STATUSES`）のとき **409** を返す。判定は `bodyRegenRowFromPage(page).status` を `BODY_REGEN_BUSY_STATUSES.includes(...)` に通す（regen ルートと同じ集合を再利用）。
- 目的: PC ループの `patchDraft` とエディタ保存の相互上書きを防ぐ。UI 側 409 ハンドリング（第 9 節の保存ブロック）と両輪。

### 7.4 挿入専用ルートは作らない

`/api/growth/draft/insert-image` は**作らない**。新規挿入は「エディタ／画像タブがプレースホルダ入り本文を `/draft/edit` で保存 → `/body-image/regen` に `placeholderId` で依頼」の合成で実現する（既存 2 ルートの再利用）。

## 8. PC ループ変更

### 8.1 `body-image-regen-cli.ts`

`scripts/growth/body-image-regen-cli.ts`:

- `next` の JSON 出力（現状 `{ pageId, title, instruction, contentId, targetSrc }`・同 L167-173）に `style`（解決前の要求値。おまかせ含む）・`textSpec`・`targetKind`（`src` | `placeholder`）を追加する。挿入依頼のときは `targetSrc` の代わりに `placeholderId` を出す。
- `done` は `targetKind` で分岐する:
  - `src`: 現行どおり `replaceBodyImageBySrc`（L250）。
  - `placeholder`: 新設 `replaceBodyImagePlaceholder(html, placeholderId, imageHtml): { html, replaced }`（純関数・`scripts/growth/body-image-regen.ts`）で、本文 HTML 中の `<figure data-pending="img-xxx">…</figure>` を実 `<figure><img …></figure>` へ置換する。`replaceBodyImageBySrc` と同じく **関数形式置換**（`$1` 展開事故防止）・対象が無ければ `replaced=false`。
- どちらも `replaced=false`（依頼後にユーザーが対象を削除等）なら**失敗化＋通知**（現行パターン踏襲）。

### 8.2 プロンプト

`scripts/growth/prompts/regen-body-image.md`:

- 手順 3 を「`style` 指定があればそれを使う。おまかせ／空なら文脈から選択（既定 `mascot`）」へ変更する。
- 第 5 節の文字検証ループ手順（生成→目視照合→最大 3 回→文字なし納品＋通知）を追記する。

新設する**挿入用プロンプト**（例: `scripts/growth/prompts/insert-body-image.md`）も同じ検証ループ手順を含める。挿入は `placeholder:<id>` 目印を狙う点だけ差し替えプロンプトと異なる。

### 8.3 `gen-body-image.ts`

`scripts/growth/gen-body-image.ts`:

- `STYLES`（同 L24。現状 `["mascot","minimal","diagram"]`）を新 5 スタイルへ拡張し、`--style` の許容値を広げる。旧値（`minimal`/`diagram`）は `normalizeBodyImageStyle` で受理してマップする。
- 参照画像分岐（L54）は `style === "mascot"` を維持。

### 8.4 既存維持

stale 回収（15 分・`selectStaleBodyRegenIds`／`BODY_REGEN_TIMEOUT_MS`・L168/174）・lock・1 日上限・LINE Flex 通知（`buildBodyRegenDoneFlex`／`buildBodyRegenFailMessage`）は既存のまま。

## 9. UI 設計

### 9a. 画像タブ（ImagesView）— ハブ

`src/app/growth/approve/DetailViews.tsx` の `ImagesView`（同 L311）を本文画像操作のハブにする。

- **本文画像を実データ化**: `DetailPanel.tsx` の `bodyImages={0}`（同 L458 のハードコード）を実データへ置換する。本文 HTML から `<figure>`/`<img>` を抽出し URL 列（`bodyImageUrls`）と枚数（`bodyImages`）を供給する純関数を追加する（`ImagesView` は既に `bodyImageUrls`/`bodyImageHues` props と本文画像ボタン `onPickBodyImage(i)`/`onRegenBodyImage(i)` を実装済み・同 L365-393。未配線なのは供給元と `deriveRegenKeys`）。
- **`deriveRegenKeys` を複数対応に**: `ApproveClient.tsx` の `deriveRegenKeys`（同 L822）は現状 `${item.id}:body:0` 固定（同 L828）。`bodyRegen.targetSrc`／`targetKind` から「どの本文画像が生成中か」を索き、対象画像のインデックス（本文抽出順）へ `${item.id}:body:<index>` を立てる。索けない（並び変化等）ときは全本文画像を保守的に生成中扱いにするフォールバックを持つ。
- **既存ボタンの結線**: `ApproveClient` に `requestBodyImageRegen(pageId, { targetSrc | placeholderId, style, textSpec, instruction })` を追加する（`requestEyecatchRegen`・同 L803 が雛形。`fetch('/api/growth/body-image/regen', …)` ＋ `authHeaders(token, …)` ＋ トースト）。「差し替え」（`onPickBodyImage`）は `MediaLibraryModal` を**本文画像モード**で開き、選択 URL を `/api/growth/draft/body-image` へ POST（7.2）。「AI で再生成」（`onRegenBodyImage`）は生成モーダル（下記）→ `requestBodyImageRegen`。
- **`MediaLibraryModal` 本文画像モード**: 適用先 API を `/api/growth/draft/eyecatch` から `/api/growth/draft/body-image` へ切り替える。一覧／アップロードは `GET|POST /api/growth/media`（`authHeaders`・管理キーは server-only のため API ルート経由）を流用。クライアント事前検証は `validateUpload`（`@/lib/growth/media` L55）を再利用し重複実装しない。
- **「＋ 画像を追加」ボタン新設**: 挿入位置セレクタ（本文の見出しリストから「◯◯の直後」を選ぶ）→ (a) メディアから即挿入、または (b) AI 生成依頼（プレースホルダ方式）。(b) は本文へ `<figure data-pending="img-<uuid>">` を挿入し `/draft/edit` で保存 → `/body-image/regen` に `placeholderId` で依頼。
- **AI 再生成／生成モーダル（共通コンポーネント）**: スタイル 6 択チップ ＋ 自由指示（500 字）＋ 文字・数値入力欄（`textSpec`）＋ 期待値表示「AI 生成は数分かかります。完了すると自動反映され LINE に通知されます」。画像タブとエディタで共用する。
- **生成中表示**: 依頼中／処理中は既存 `useDraftPreview` の 5 秒ポーリング＋処理中バッジ（`regenKeys` → `ImageFrame regenerating`）をそのまま流用。

### 9b. リッチエディタ（DraftEditor）

`src/app/growth/approve/DraftEditor.tsx`:

- **ツールバーに「画像」ボタン追加**: `role="toolbar"` 帯（同 L462-464）へ画像ボタンを足す。押下で 9a と同じ共通モーダルを開く。
  - **メディア即挿入**: 選択アセットをカーソル位置へ `<figure>` **保持ブロック**として即挿入（同期・エディタ内完結・API 不要）。
  - **AI 生成**: (1) 本文を自動保存、(2) カーソル位置へ `<figure data-pending="img-<uuid>">` プレースホルダを挿入して保存、(3) `/body-image/regen` に `placeholderId` で依頼。
- **プレースホルダの表示**: 保持ブロックとして「🛸 AI 画像を生成中…（完了すると自動で差し替わります）」カードを出す。`data-pending` を `classifyPreservedBlock` が判別し専用ラベルを表示する。
- **sanitize 許可属性**: `STRICT_HTML_CONFIG`（`src/lib/news/sanitize.ts` L127）の `<figure>` 許可属性に `data-pending` を追加し、**値の形式検証**（`^img-[A-Za-z0-9-]{6,64}$`）を課す（既存 `data-embed-id` の形式検証・同 L226 と同じ流儀）。形式外は属性除去。
- **`PreservedBlockView` のインライン操作**: `PreservedBlockView`（同 L78-142）のヘッダ帯（削除ボタン・同 L124-131 の隣）に、`info.kind` が `image`/`figure` のとき「差し替え」「AI で再生成」ボタンを追加する。コールバックは TipTap の editor storage / Node `addOptions` 経由で注入する。対象 URL は保持ブロックの `outerHTML`（`node.attrs.html`）から `<img src>` を抽出し `targetSrc` に渡す。
- **競合ガード（UI 側）**: この記事の画像生成が依頼中／処理中の間、エディタの**保存をブロック**し「画像生成の完了を待っています…」バナーを表示する（API 側 7.3 の 409 と両輪）。**メディア即挿入はガード対象外**（同期・生成待ちと無関係）。

## 10. セキュリティ

- 全 API `verifyToken`（`Authorization: Bearer`・`src/lib/growth/apiAuth.ts` 経由）。`APPROVE_AUTH_ENABLED` を**本番公開前に必ず ON**（既存注意事項の再掲）。
- URL allowlist: 差し替え両 URL（`targetSrc`・`newUrl`）と再生成 `targetSrc` は `isMicrocmsAssetUrl`（`https`・`images.microcms-assets.io`・`@/lib/growth/media` L88 / `scripts/growth/body-image-regen.ts` L223）で検証。任意 URL を対象にできないようにする。
- `placeholderId` は `^img-[A-Za-z0-9-]{6,64}$` で形式検証（API・sanitize の両方）。
- `textSpec` 1000 字上限・`instruction` 500 字上限。サーバ側 `sanitizeNewsHtml(STRICT_HTML_CONFIG)` 再適用は**全書き込み経路**（`/draft/body-image`・`/draft/edit`・PC ループの `done`）で維持。
- `MICROCMS_MANAGEMENT_API_KEY` は server-only 維持（`NEXT_PUBLIC_` 禁止）。メディア一覧／アップロードは API ルート経由のみ。

## 11. エラー・通知

- 失敗は沈黙させない: fail 時 LINE 通知（reason 200 字切詰め・`buildBodyRegenFailMessage` 既存）。第 5 節の検証ループ 3 回失敗時の「文字なし納品」も通知する。
- stale 15 分回収（`selectStaleBodyRegenIds`／`BODY_REGEN_TIMEOUT_MS`・既存）。
- `placeholder` が本文から消えていた場合（依頼後にユーザーが削除等）は `replaceBodyImagePlaceholder` の `replaced=false` → 失敗化＋通知（既存の `replaced=false` パターン踏襲）。

## 12. テスト方針

- **TDD 必須**（Red → Green → Refactor）。カバレッジ 100% 目標（CLI・`run.mjs`・`gen-*` は既存方針どおり除外）。
- **純ロジック（ユニット）**: Props ビルダー拡張（`buildBodyRegenRequestProps`/`...DoneProps`）・`replaceBodyImagePlaceholder`・`normalizeBodyImageStyle`・`parseBodyRegenTarget`・`placeholderId` 形式検証・本文からの `<figure>`/`<img>` 抽出。
- **API ルート**（`route.test.ts`）: `body-image/regen` 拡張（style/textSpec/target 分岐・上限・409）・`draft/body-image` 新設（両 URL 検証・差し替え・ロールバック）・`draft/edit` の 409（busy 時）。
- **UI**（React Testing Library・MSW で API モック）: 共通生成モーダル・`ImagesView` 結線（実データ化・差し替え・再生成）・エディタ挿入（メディア即挿入・AI プレースホルダ）・`PreservedBlockView` インライン操作・競合バナー。薄い presentation は既存様式で `vitest.config.ts` の `coverage.exclude` に追記。

## 13. フェーズ分け

### P1: 差し替え＋再生成の結線

- `ImagesView` 配線: `bodyImages` 実データ化（`DetailPanel.tsx` L458 のハードコード撤去）・`requestBodyImageRegen` 追加・`deriveRegenKeys` 複数対応（`ApproveClient.tsx` L828 の `:body:0` 固定を解消）。
- `/api/growth/draft/body-image` 新設（7.2）。
- `MediaLibraryModal` 本文画像モード。
- **受け入れ基準**: 画像タブから本文画像の差し替え（即時）と再生成（おまかせ・現行 `mascot` 相当）が動く。

### P2: 多スタイル＋文字検証

- `style`／`textSpec` を Notion プロパティ・API・CLI `next`・プロンプトへ通す（第 6〜8 節）。
- 6 スタイルの `PROMPT_BUILDERS`（`illust`/`court`/`flow`/`infographic` 追加）。
- 文字検証ループ（第 5 節）。
- 生成モーダルにスタイル 6 択チップ ＋ `textSpec` 欄。
- **受け入れ基準**: 6 スタイル指定つき再生成が動き、文字入り図解の検証ループが LINE 報告まで含めて動く。

### P3: 新規挿入

- エディタツールバー「画像」ボタン（メディア即挿入＋ AI 生成プレースホルダ）。
- 画像タブ「＋ 画像を追加」。
- `PreservedBlockView` ヘッダのインラインボタン。
- 競合ガード（UI 保存ブロック＋ `/draft/edit` 409・7.3）。
- `replaceBodyImagePlaceholder`・`data-pending` sanitize・`insert-body-image.md`。
- **受け入れ基準**: エディタと画像タブの両方から新規画像を挿入できる。

### P4: 構成案の画像指示 UI 復活（概要のみ・詳細別 spec）

- #62（画像指示の保存先＋下書き生成側の読み込み）を実装し、`ImageInstruction`（`src/app/growth/approve/imageIntentTypes.ts`）に `style` を追加、`imageDirectorFlag`（`isImageDirectorEnabled()`）を ON にする。
- 本 spec では方向性のみ記載する。per-section 画像指示 persist・`migrateImageHint`（`src/lib/growth/imageIntent.ts` L47）の旧スタイル破棄の見直しを含む詳細は別 spec で定義する。

## 14. 制約（プロジェクト規約・再掲）

- TDD 必須・カバレッジ 100% ゲート（純ロジックは除外せずテスト・薄い presentation は `coverage.exclude` 追記）。
- TS strict / `any` 禁止 / `React.FC` 禁止 / `import type` / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- App Router（Server Component 既定・`"use client"` 最小・`next/image`・framer-motion 使用ファイルは `"use client"`）。
- グロースループ禁止事項（`run.mjs` から公開/commit/push しない・未確定情報を断定しない・**画像内の文字でも**断定しない・失敗を沈黙させない）維持。
- 出力（仕様/計画/コミット/説明）は日本語。push 禁止（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。push 時のみ `ttmakhr1028ai-art`。
