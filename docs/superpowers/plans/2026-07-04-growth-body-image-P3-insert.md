# グロース本文画像 P3（新規挿入・プレースホルダ・競合ガード）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本計画の実装者は Codex CLI**（`codex exec`）。各タスクは自己完結のブリーフとして渡す。コードの完全転記の代わりに、正確なインターフェース・受け入れ挙動・テストケース一覧・参照イディオム（実在ファイル）を指定する。実装者は必ず参照ファイルの現物イディオムに合わせること。

**Goal:** 記事本文へ画像を**新規挿入**できるようにする — リッチエディタのツールバー「画像」ボタン（メディア即挿入＋AI生成プレースホルダ）と画像タブ「＋画像を追加」（挿入位置選択）の両動線、および編集とAI生成の**競合ガード**（spec §13 P3）。

**Architecture:** 挿入は既存2ルートの合成で実現する（§7.4: 挿入専用APIは作らない）。(1) プレースホルダ `<figure data-pending="img-…">` 入り本文を `/draft/edit` で保存 → (2) `/body-image/regen` に `placeholderId` で依頼 → (3) 既存 `regen-body` ループが同一キューで拾い、`done` が placeholder を実 figure に置換。エディタ内の**メディア差し替え/挿入はローカル置換**（APIを呼ばず TipTap ノードを更新し通常の保存フローに乗せる — 未保存編集との衝突を構造的に排除）。純ロジックは `scripts/growth/*.ts` ＋ `src/lib/growth/*` 再エクスポート。

**Tech Stack:** Next.js 16 App Router / TypeScript strict / React 19 + RTL / Vitest / TipTap（PreservedBlock atom node）/ DOMPurify hooks / Notion pull型キュー。

**specからの設計変更（2件・確定）:**
1. **§8.2 の `insert-body-image.md` は新設しない。** `run.mjs` はモードごとに固定1プロンプトを起動するため、同一キューで拾う挿入依頼は既存 `regen-body-image.md` に targetKind（src/placeholder）分岐を追記して両対応にする（§7.4 の「合成で実現」思想と整合。2つのほぼ同一mdの乖離リスクも回避）。
2. **§9b のエディタ内「差し替え」は同期API（/draft/body-image）を呼ばない。** 編集中の未保存本文と保存済み本文のロストアップデートを避けるため、メディア選択の結果をエディタ内ノードのローカル置換とし、通常保存に乗せる。画像タブ（非編集文脈）の差し替えは従来どおり同期API。

**調査済みの現状前提（2026-07-04 HEAD cf357fe）:**
- P1/P2 で実装済み・触らない: ImagesView 実データ配線 / deriveRegenKeys targetSrc索き / BodyImageRegenModal（6択＋textSpec）/ requestBodyImageRegen / 文字検証ループ（regen-body-image.md 手順4）。
- `useDraftPreview` は `draftRegenPending` を**外部公開していない**（L86-93 内部使用のみ）→ T6 で公開。
- `PreservedBlockView` は `{node, deleteNode}` のみ受け、`addOptions`/`editor.storage` はコードベース未使用 → T5 で addOptions 方式を新規導入。
- 本文HTMLの見出し抽出関数は存在しない → T1 で新設。
- `next`（CLI）はステータス「依頼中」だけでフィルタし target 形式を見ない → 挿入依頼は既存ループがそのまま拾える（新モード不要）。

## Global Constraints

- TDD 必須（Red → Green → Refactor）。実装より先に失敗するテストを書く。
- カバレッジ 100% ゲート（CLI・`run.mjs`・`gen-*` は除外。薄い presentation は `vitest.config.ts` の `coverage.exclude` へ理由コメント付きで追記）。
- TS strict / `any` 禁止（`unknown`+narrowing）/ `React.FC` 禁止 / `import type` / boolean は is/has/should/can / handler は on/handle。
- 全書き込み API: `verifyToken` ＋ `articleEditGuard`（#H9）＋ サーバ側 `sanitizeNewsHtml(STRICT_HTML_CONFIG)` 再適用を維持。
- `placeholderId` の正規形: `^img-[A-Za-z0-9-]{6,64}$`（API・sanitize・CLI の全受理点で検証）。生成は `"img-" + crypto.randomUUID()`。
- Notion の対象プロパティ `本文画像再生成対象` は、差し替え=microCMS URL（現行）、挿入=`placeholder:<id>` 文字列（新プロパティは追加しない）。
- 純ロジックは `scripts/growth/*.ts` に置き `src/lib/growth/*` から `export *`。
- コミットは日本語 Conventional Commits。**push しない**。git add はタスク記載ファイルのみ。
- 失敗を沈黙させない（placeholder 消失時は `replaced=false`→失敗化＋LINE通知、既存パターン踏襲）。

---

## T1: 挿入の純ロジック（placeholder・見出し抽出・挿入合成）

**Files:**
- Modify: `scripts/growth/body-image-regen.ts`（`parseBodyRegenTarget`・`replaceBodyImagePlaceholder` を追加。既存 `replaceBodyImageBySrc` L320-335 の関数形式置換イディオムを踏襲）
- Create: `scripts/growth/body-image-insert.ts`（挿入系純ロジック新設 — body-image-regen.ts の肥大回避）
- Create: `src/lib/growth/bodyImageInsert.ts`（`export * from "../../../scripts/growth/body-image-insert";`）
- Test: `scripts/growth/body-image-regen.test.ts`（describe 追記）・`scripts/growth/body-image-insert.test.ts`（新規）

**Interfaces（Produces）:**
- `const PLACEHOLDER_ID_RE = /^img-[A-Za-z0-9-]{6,64}$/`（body-image-insert.ts で export・全受理点が共有）
- `function isPlaceholderId(value: unknown): value is string`
- `function buildPendingFigureHtml(placeholderId: string): string` — `<figure data-pending="<id>"><figcaption>AI画像を生成中…（完了すると自動で差し替わります）</figcaption></figure>` を返す。不正IDは throw ではなく空文字を返す（呼び出し側でガード済み前提の防御）
- `function bodyImageFigureHtml(src: string, alt: string): string` — done が placeholder を実画像に置換する際の `<figure><img src="…" alt="…">…</figure>`。既存 `substituteBodyImages` が使う figure 形と同一マークアップ（body-image.ts の figureHtml を参照し重複せず流用/exportを検討）
- `function extractBodyHeadings(html: string): { text: string; index: number }[]` — 本文HTML中の `<h2>`（h2のみ。h3/h4は挿入位置として細かすぎるため対象外）を出現順に返す。text はタグ除去済みプレーンテキスト
- `function insertHtmlAfterHeading(html: string, headingIndex: number | null, fragment: string): string` — `headingIndex` 番目の h2 セクションの**直後**（次の h2 の直前、無ければ末尾）に fragment を挿入。`null` は本文末尾に追加
- `function parseBodyRegenTarget(raw: string): { kind: "src"; src: string } | { kind: "placeholder"; placeholderId: string } | null`（body-image-regen.ts）— `placeholder:` プレフィクスで判別。src 側は `isMicrocmsAssetUrl`、placeholder 側は `PLACEHOLDER_ID_RE` で検証、どちらも不正は null
- `function replaceBodyImagePlaceholder(html: string, placeholderId: string, figureHtml: string): { html: string; replaced: boolean }`（body-image-regen.ts）— `<figure data-pending="<id>">…</figure>` の**先頭1件のみ**を figureHtml へ関数形式置換。対象無しは `{html, replaced:false}`

**テストケース（最低限・各関数）:**
- parseBodyRegenTarget: microCMS URL→src / `placeholder:img-abc123`→placeholder / `placeholder:bad!`→null / 外部URL→null / 空→null
- replaceBodyImagePlaceholder: 置換成功（前後のHTML不変・figcaption ごと消える）/ 同一IDが2つあっても先頭1件のみ / 対象なし replaced=false / figureHtml 内の `$&` `$1` が展開されない（関数形式置換の担保）
- buildPendingFigureHtml: 正規ID→figure文字列 / 不正ID→""
- extractBodyHeadings: h2複数の順序と text / h2なし空配列 / h2内の装飾タグ除去
- insertHtmlAfterHeading: 先頭h2の直後（=次h2の直前）/ 最後のh2の後（=末尾）/ null=末尾 / 範囲外indexは末尾へフォールバック
- isPlaceholderId: 正規/短すぎ/記号入り/非string

**Steps:** 失敗テスト→RED確認（`npx vitest run scripts/growth/body-image-insert.test.ts scripts/growth/body-image-regen.test.ts`）→実装→GREEN→コミット `feat(growth): 本文画像挿入の純ロジック(placeholder・見出し抽出・挿入合成)を追加`

---

## T2: sanitize の `data-pending` 対応

**Files:**
- Modify: `src/lib/news/sanitize.ts`（`COMMON_ALLOWED_ATTR` L60-61 付近に `"data-pending"` 追加、`PENDING_ID_REGEX` 定数を L144-152 付近に追加、`uponSanitizeAttribute` フック末尾 L231 付近に検証分岐追加 — `data-embed-id` の実装様式 L226-231 と完全に同じ流儀: `tag !== "FIGURE" || !PENDING_ID_REGEX.test(value)` なら `keepAttr=false`）
- Test: `src/lib/news/sanitize.test.ts`（既存に describe 追記）

**テストケース:** figure の正規 `data-pending` が STRICT_HTML_CONFIG を通過 / 不正形式（`x-1`・65文字超・記号）は属性除去 / figure 以外（div等）の data-pending は除去 / 中身の figcaption が保持される / RICH_EDITOR_CONFIG でも同挙動

**Steps:** TDD→コミット `feat(growth): sanitize に data-pending 属性(形式検証つき)を追加`

---

## T3: API 拡張（regen の discriminated target・draft/edit の 409 ガード）

**Files:**
- Modify: `src/app/api/growth/body-image/regen/route.ts`（L62-66 の target 検証を discriminated へ）
- Modify: `src/app/api/growth/draft/edit/route.ts`（`getPage` 直後 L90 付近に 409 ガード）
- Test: 両 route.test.ts に追記

**regen route の仕様:**
- body: `{ pageId, targetSrc?, placeholderId?, style?, textSpec?, instruction? }`。**targetSrc と placeholderId はちょうど一方**（両方/どちらも無しは 400「対象の指定が不正です。」）
- `targetSrc` は従来どおり `isMicrocmsAssetUrl`。`placeholderId` は `isPlaceholderId`（`@/lib/growth/bodyImageInsert`）
- Notion への書き込み: placeholder のとき `buildBodyRegenRequestProps` の target 引数に `` `placeholder:${placeholderId}` `` を渡す（ビルダー自体は変更不要 — target は不透明文字列）
- 既存の検証順序（全て getPage より前）・409・articleEditGuard・style/textSpec/instruction 検証は不変

**draft/edit route の仕様:**
- `getPage` 直後（追加I/Oなし）: `BODY_REGEN_BUSY_STATUSES.includes(bodyRegenRowFromPage(page).status)` なら **409** `{ success:false, error:"画像生成の処理中です。完了後にもう一度保存してください。" }`。import は `@/lib/growth/bodyImageRegen`（regen route L22-27 が実例）
- 既存の articleEditGuard・sanitize・ミラー→patchDraft→ロールバックは不変

**テストケース:** regen: placeholderId 正常（Notion書き込みが `placeholder:img-…` になる）/ 不正placeholderId 400 / 両方指定 400 / 両方なし 400 / targetSrc 経路の既存テスト無変更GREEN。edit: bodyRegen 依頼中/処理中で 409＋patchDraft未呼出 / なし・失敗では従来どおり保存成功

**Steps:** TDD→コミット `feat(growth): 画像挿入依頼(placeholderId)の受理と編集保存の409競合ガードを追加`

---

## T4: PC ループの placeholder 対応（CLI 分岐・プロンプト両対応化）

**Files:**
- Modify: `scripts/growth/body-image-regen-cli.ts`（`next` L158-176: target を `parseBodyRegenTarget` で解釈し、src は従来検証・placeholder は形式検証。出力 JSON に `targetKind` と、placeholder時は `placeholderId` を追加（`targetSrc` は src 時のみ）。`done` L184-215: 引数の対象が `img-` 形式なら `replaceBodyImagePlaceholder`＋`bodyImageFigureHtml(newUrl, alt)`、URL なら従来 `replaceBodyImageBySrc`。`--alt "<説明>"` オプション（任意・既定 ""・200字切詰め）を追加し placeholder 置換の alt に使う）
- Modify: `scripts/growth/prompts/regen-body-image.md`（手順2の JSON 説明に targetKind/placeholderId を追記。手順4の対象説明に「`targetKind=placeholder` のときは新規挿入 — 目印 `<figure data-pending>` を実画像に置き換える」分岐を追記。手順6の done コマンドを `done <pageId> <targetSrc|placeholderId> <アセットURL> [--alt "<説明>"] [--note …]` に更新。文字検証ループ（手順4）は両対応のまま共通）
- Modify: `docs/operations/growth/30-loops.md`（#156 の節に「挿入依頼も同一キュー・同一ループで処理（target=`placeholder:<id>`）」を1-2行追記）
- Test: `scripts/growth/body-image-regen.test.ts`（done 相当の純ロジックは T1 でテスト済み。CLI はカバレッジ除外 — 追加テスト不要だが、`npx tsc --noEmit` 0 と既存テスト GREEN を確認）

**Steps:** 実装→検証（tsc 0・既存テストGREEN）→コミット `feat(growth): PCループを画像挿入(placeholder)両対応にし done に --alt を追加`

---

## T5: エディタ基盤（pending 種別・PreservedBlock コールバック注入・インラインボタン）

**Files:**
- Modify: `src/app/growth/approve/draftEditorContent.ts`（`PreservedBlockKind` に `"pending"` 追加、`detectPreservedKind` L88-91 の figure 分岐の**前**に `data-pending` 判定を追加、`PRESERVED_BLOCK_LABELS.pending = "AI画像を生成中…（完了すると自動で差し替わります）"`）
- Modify: `src/app/growth/approve/DraftEditor.tsx`（`PRESERVED_ICON` に pending エントリ（IconSparkles 等既存アイコン流用）。`PreservedBlock` Node に `addOptions()` を導入: `{ onPickImage: null as ((src: string) => void) | null, onRegenImage: null as ((src: string) => void) | null }`。`PreservedBlockView` はヘッダ帯（削除ボタン L124-131 の隣）に、kind が `image` のとき「差し替え」「AIで再生成」ボタンを表示（`extension.options` 経由でコールバック取得・`node.attrs.html` から `<img src>` を抽出して渡す）。kind が `pending` のときは削除ボタンのみ（差し替え/再生成は出さない）。`DraftEditor` の props に `onPickImage?`/`onRegenImage?` を追加し `PreservedBlock.configure({...})` で注入（useEditor の extensions 生成に反映）。ローカル差し替え用に `replacePreservedImageSrc(editor, oldSrc, newUrl)` 相当の更新関数（対象ノードの `html` 属性の src を書き換えて `updateAttributes` — 純ロジック部分は draftEditorContent.ts に `replaceImgSrcInHtml(html, newUrl): string` として切り出しテスト）
- Test: `src/app/growth/approve/draftEditorContent.test.ts`（pending 判定・ラベル・replaceImgSrcInHtml）。DraftEditor.tsx 自体のカバレッジ扱いは既存に従う（除外済みなら追記不要）

**テストケース:** detectPreservedKind: `data-pending` 付き figure→pending（img 有無に関わらず）/ 通常 figure+img→image（既存GREEN維持）。replaceImgSrcInHtml: src属性のみ差し替え・alt等不変・`$1`展開事故なし・img無しは原文返し

**Steps:** TDD（純ロジック）→UI実装→既存エディタテストGREEN→コミット `feat(growth): エディタに生成中プレースホルダ種別と画像インライン操作(差し替え/再生成)を追加`

---

## T6: エディタ結線（ツールバー画像ボタン・挿入/差し替えモーダル・競合ガードUI）

**Files:**
- Modify: `src/app/growth/approve/MediaLibraryModal.tsx`（**select モード追加**: 新 prop `onSelect?: (url: string) => void`。指定時は API を呼ばず選択/アップロード完了URLを onSelect で返して閉じる。ボタン文言「この画像を挿入」。既存 eyecatch/body-image モードは不変）
- Modify: `src/app/growth/approve/hooks/useDraftPreview.ts`（return に `draftRegenPending: boolean` を追加）
- Modify: `src/app/growth/approve/hooks/useDraftEditing.ts`（`saveDraft` の 409 応答を「画像生成の処理中です。完了後にもう一度保存してください。」のエラーメッセージ表示に写す）
- Modify: `src/app/growth/approve/DraftEditWorkspace.tsx`（props に `isRegenPending?: boolean` と挿入/差し替え系コールバックを追加。ツールバー: DraftEditor に「画像」ボタン（`tbBtn` 様式・リンクボタン L530 の直後）— 押下で選択ポップオーバー（DecorationMenu L329-389 と同型）「メディアから挿入 / AIで生成」。保存バー: `isRegenPending` のとき保存ボタン disabled＋バナー「画像生成の完了を待っています…（完了すると自動で反映されます）」）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（結線: (a) メディア挿入 → MediaLibraryModal(select) → `editor.chain().focus().insertContent(figureHtml).run()`（figureHtml は `bodyImageFigureHtml(url, "")`）。(b) AIで生成 → BodyImageRegenModal（既存流用・heading 変更）→ 確定で `placeholderId = "img-"+crypto.randomUUID()` 生成 → カーソル位置に `buildPendingFigureHtml(id)` を insertContent → **自動保存**（`saveDraft` 相当を await・失敗時は依頼せずトースト＋プレースホルダはエディタ内に残る旨表示）→ `requestBodyImageRegen` を placeholderId で呼ぶ（`buildBodyRegenBody` を `{ targetSrc } | { placeholderId }` の discriminated に拡張 — `bodyRegenRequest.ts`）。(c) エディタ内インライン「差し替え」→ MediaLibraryModal(select) → T5 のローカル置換（API を呼ばない）。(d) エディタ内「AIで再生成」→ 既存 BodyImageRegenModal → 既存 `requestBodyImageRegen(targetSrc)`（保存不要 — 対象は保存済み src。ただし未保存変更がある場合は「先に保存してください」トーストで依頼をブロック）。(e) `draftRegenPending` を DraftEditWorkspace へ伝搬）
- Modify: `src/app/growth/approve/bodyRegenRequest.ts`（`buildBodyRegenBody` の target を discriminated union へ: `{ kind:"src", targetSrc } | { kind:"placeholder", placeholderId }`。既存呼び出しは src 側に写す）
- Test: `bodyRegenRequest.test.ts`（discriminated 両形の body）・`MediaLibraryModal.test.tsx`（select モードが API を呼ばず onSelect に URL を返す）・`ApproveClient.test.tsx`（AI挿入: モーダル確定→保存POST（placeholder入りHTML）→regen POST（placeholderId）の順序 / 409時のエラーメッセージ / regen pending 中の保存ボタン disabled）・`useDraftPreview` のテストがあれば draftRegenPending 公開を追認

**受け入れ挙動（曖昧さ排除）:**
- AI挿入の順序は必ず「プレースホルダ挿入 → 保存成功 → 依頼POST」。保存失敗時は依頼しない。
- z-index: モーダル（z-[80]）がエディタ全画面オーバーレイより手前に出ることを実装時に確認（必要なら z 調整。既存 MediaLibraryModal が編集画面から開けることを RTL で担保）。
- アイキャッチ動線・画像タブの既存動線は無変更で GREEN。

**Steps:** TDD（純ロジック→UI）→回帰（`npx vitest run src/app/growth/approve/`）→コミット `feat(growth): エディタから画像のメディア挿入とAI生成挿入(プレースホルダ)を結線し競合ガードを追加`

---

## T7: 画像タブ「＋画像を追加」（挿入位置セレクタ）

**Files:**
- Create: `src/app/growth/approve/BodyImageInsertModal.tsx`（薄い presentation・coverage.exclude 追記対象: 挿入位置セレクタ（`extractBodyHeadings` の h2 リスト＋「本文の末尾」・既定は末尾）＋「メディアから挿入 / AIで生成」の2択。確定で `{ headingIndex: number | null, method: "media" | "ai" }` を親へ）
- Modify: `src/app/growth/approve/DetailViews.tsx`（ImagesView 本文画像セクション L354-397 に「＋ 画像を追加」ボタン。0枚時分岐 L358-362 にも表示。`onAddBodyImage()` prop 追加）
- Modify: `src/app/growth/approve/DetailPanel.tsx`（prop 素通し）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（結線: media → MediaLibraryModal(select) → `insertHtmlAfterHeading(bodyHtml, headingIndex, bodyImageFigureHtml(url, ""))` → `/draft/edit` へ保存POST → loadDraft＋トースト。ai → BodyImageRegenModal → placeholderId 生成 → `insertHtmlAfterHeading(..., buildPendingFigureHtml(id))` → `/draft/edit` 保存 → `requestBodyImageRegen(placeholderId)`。編集中（editingDraft）は「編集画面から挿入してください」トーストでブロック（二重管理回避））
- Test: `ApproveClient.test.tsx`（media挿入: 位置選択→editへ挿入済みHTMLがPOSTされる / ai挿入: edit→regenの順序とplaceholderId整合）・`vitest.config.ts` に BodyImageInsertModal.tsx を理由コメント付き追記

**Steps:** TDD→回帰→コミット `feat(growth): 画像タブに「＋画像を追加」(挿入位置選択・メディア/AI生成)を追加`

---

## T8: 仕上げ（文書・型・lint・全テスト・カバレッジ）

**Files:**
- Modify: `docs/operations/growth/40-notion-props.md`（`本文画像再生成対象` に `placeholder:<id>` 形式を追記）
- Modify（必要時のみ）: `vitest.config.ts`
- 検証: `npx tsc --noEmit` 0 / `npm run lint`（`.growth-tmp/` 既知12件以外 0）/ `npx vitest run --coverage` 全GREEN・対象新規/変更ファイル 100%（body-image-insert.ts / body-image-regen.ts / sanitize.ts / 両route / bodyRegenRequest.ts / draftEditorContent.ts）
- コミット（変更があれば）`test(growth): 本文画像 P3 のカバレッジを 100% に揃える`

---

## 受け入れ基準（spec §13 P3・現状に合わせ再定義)

- エディタのツールバー「画像」から、メディア即挿入（カーソル位置・同期）と AI 生成挿入（プレースホルダ→自動保存→依頼→PCループ→自動差し替え）ができる。
- エディタ内の画像保持ブロックから「差し替え（ローカル置換）」「AIで再生成（保存済みsrc対象）」ができる。
- 画像タブ「＋画像を追加」から、h2見出しベースの挿入位置を選んで メディア/AI の両方式で挿入できる。
- 競合ガード: 画像生成の依頼中/処理中はエディタ保存が UI（disabled＋バナー）と API（409）の両輪でブロックされる。
- プレースホルダが本文から消えていた場合、PCループは失敗化＋LINE通知（沈黙しない）。
- P1/P2 の全既存動線（差し替えAPI・再生成モーダル・アイキャッチ）が無変更で GREEN。
