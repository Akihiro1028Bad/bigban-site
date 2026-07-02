# 承認画面 proto 移植 P5b=公開キュー＋プロンプト＋グローバルUI 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開キュー(PublishQueue/SchedulePicker)・プロンプト管理(PromptsView)・グローバルUI(ConfirmActionDialog/ToastStack/MediaLibraryModal/CommandPalette) を proto デザインへ移植し、#167 デッドコードを整理する。データ・実APIは本物のまま。

**Architecture:** 公開キューは proto の 3サマリ＋3セクション構成へ再スキンし、**fetch 直叩き方式を維持**（proto のコールバック委譲へ寄せない）。SchedulePicker と MediaLibraryModal を新規移植し、後者は実メディアAPI（`/api/growth/media` GET/POST）＋実反映API（`POST /api/growth/draft/eyecatch {pageId, eyecatchUrl}`・SSRF防御済）へ結線＝**公開キュー「要対応（アイキャッチ未設定）」行が差し替えの受け皿**（#143 の後継導線）。プロンプト・パレット・ダイアログ・トーストは class 主体の再スキン。純ロジック（予約3分割・formatSchedule）は lib で 100%。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4(`--p-*`) / Framer Motion(mock済) / Vitest + RTL / istanbul 100%。

## Global Constraints

- 出力・コミットは日本語。**push 禁止・PR 禁止・ローカルコミットのみ。** `next-env.d.ts`/`node_modules` は絶対にステージしない。
- TS strict・`any` 禁止・`React.FC` 禁止（関数宣言＋`XxxProps`）・`import type`・boolean は is/has/should/can・handler は on/handle・`@ts-ignore` 禁止（最終手段 `@ts-expect-error`＋理由）。
- `"use client"` は対話/ブラウザAPI/framer-motion 時のみ。framer-motion 使用ファイルは `"use client"`。next/image。
- a11y: セマンティックHTML・`div`+`onClick` 禁止・role/aria 適切・選択状態に aria・コントラスト・prefers-reduced-motion。
- server-only 秘密の露出禁止。失敗を沈黙させない（エラーはトースト/alert で可視化）。
- Coverage 100%（istanbul・4指標・threshold 不変）。pure logic 除外禁止。exclude は薄い presentation のみ（理由コメント必須）。
- **クラス名**: `proto-*` クラスは本番で未定義（`.proto-root` スコープ）。必ず `approve-*`（`theme/approveTheme.css` 実在）or インライン `var(--p-*)` を使う。danger 系は `--p-red-weak`/`--p-red`（`--p-bg-danger` は不在）。モーダル/オーバーレイは `.approve-shell` 配下描画 or root に `approve-shell` 付与でトークン解決を担保（ConsultDrawer/DraftEditWorkspace 方式）。
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。
- ダミーデータ禁止（実データで出せないものは縮約）。

## 確定した設計判断（P5b・メイン fable5 裁定／ユーザー裁定 2026-07-02）

1. **#167 デッドコード（確定）**: `api.ts:75 postPublish`（＋`api.test.ts` 該当）削除。`ConfirmActionDialog` の kind `"publish"|"close"` 削除し **`revert` 専用**へ（proto の `reject` kind は導入しない＝本番の却下はインラインフロー維持）。useConsult.test の幽霊プロパティは存在せず対応不要。
2. **公開キューの結線方式**: 本番の **fetch 直叩き維持**（`/api/growth/publish`・`/api/growth/publish/schedule`・テスト済）。proto の見た目（3サマリカード＋公開OK/予約済み/要対応の3セクション）だけ寄せる。
3. **MediaLibraryModal＝実結線**（ユーザー裁定）: proto デザインで移植し、一覧=`fetchMediaList`/アップロード=`uploadMediaBlob`（`src/lib/growth/media.ts`・100%済）→ 選択 URL を **`POST /api/growth/draft/eyecatch {pageId, eyecatchUrl}`** で記事アイキャッチへ反映。**起点は公開キュー「要対応（アイキャッチ未設定）」行**（#143 撤去の後継導線・design.md AD5 更新）。
4. **ToastStack**: tone は本番 **success/error 2値維持**・**dismiss ボタン維持**。位置とアニメのみ proto（右下 `fixed bottom-5 right-5`＋`AnimatePresence`）へ。
5. **PromptsView**: class 主体の再スキン（データ源=実API `fetchPrompts` 不変・全文＋コピー維持・proto `truncated` 不採用）。モバイル 1/2ペイン state（`showDetailMobile`）は proto に合わせ追加。既存 8ケーステスト維持＋切替分岐のテスト追加（非 exclude 維持）。
6. **CommandPalette**: proto に対応物が無い本番独自機能として**残す**。`--p-*` へ再スキンのみ（exclude 済維持）。
7. **onFix(id, tab)**（要対応→修正導線）: 本文が空→詳細パネル該当タブへ遷移（ApproveClient の activeId/view/detailTab 既存 state を使用）。アイキャッチ未設定→**MediaLibraryModal を直接開く**（判断3）。

## クラス名 読み替え表（proto→本番）

| proto | 本番 |
|---|---|
| `proto-btn-primary` / `proto-btn-ghost` | `approve-btn-primary` / `approve-btn-ghost` |
| `proto-tool` | `approve-tool` |
| `proto-shimmer` / `proto-pulse` | `approve-shimmer` / `approve-pulse` |
| `proto-article` | `approve-article` |

## 参照ファイル（視覚仕様＝proto ソースが正）

- proto: `approve-proto/{PublishQueue,SchedulePicker,ConfirmActionDialog,ToastStack,MediaLibraryModal,PromptRegistryView}.tsx`・`approve-proto/page.tsx:1156-1176`（配線例）。
- 本番: `src/app/growth/approve/{PublishQueue,ConfirmActionDialog,ToastList,PromptsView,CommandPalette,ApproveClient}.tsx`・`api.ts`・`src/lib/growth/{publishQueue,media,promptRegistry,articleMetricsView}.ts`・`hooks/{useToasts,useDialog}.ts`・`ui/{primitives,icons}.tsx`。
- 実API: `/api/growth/publish`・`/api/growth/publish/schedule`・`/api/growth/media`(GET/POST)・`/api/growth/draft/eyecatch`(POST {pageId,eyecatchUrl})・`/api/growth/prompts`。

---

### Task 1: #167 デッドコード整理（postPublish 削除＋ConfirmActionDialog revert 専用化＋ダーク再スキン）

**Files:**
- Modify: `src/app/growth/approve/api.ts`（`postPublish` 削除）・`src/app/growth/approve/api.test.ts`（該当テスト削除）
- Modify: `src/app/growth/approve/ConfirmActionDialog.tsx`（kind `"publish"|"close"` 削除→`"revert"` 専用・proto ダーク再スキン）・`ConfirmActionDialog.test.tsx`（追随・検証強度維持）

**Interfaces:** `ConfirmActionState{kind:"revert", id, title}`（narrow 化。ApproveClient は revert のみ使用済＝呼び出し側変更なし想定・要 Step1 確認）。

- [ ] **Step 1**: `grep -rn "postPublish" src/` で参照が api.test.ts のみであること・ApproveClient の ConfirmActionDialog 使用が revert のみであることを確認。
- [ ] **Step 2**: `postPublish`＋該当テスト削除。`ConfirmActionDialog` から publish/close 分岐を削除し kind を `"revert"` リテラルへ。`DIALOG_CONFIG`→revert 単一設定に簡約。class を proto `approve-proto/ConfirmActionDialog.tsx` のダーク見た目（`--p-*`・`role="dialog" aria-modal aria-label` は不変）へ再スキン。`useDialog` 付与（proto 同様）。root が fixed overlay のため `approve-shell` をクラスに含めトークン解決を担保。
- [ ] **Step 3**: `ConfirmActionDialog.test.tsx` を revert 専用に追随（publish/close ケース削除・revert の確認/キャンセル/aria は維持）。
- [ ] **Step 4: ゲート** — `npx tsc --noEmit`（0）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・グローバル100%）。
- [ ] **Step 5: Commit** — `refactor(growth): #167 デッドコード整理（postPublish 削除・確認ダイアログを revert 専用化し proto ダークへ再スキン）`

---

### Task 2: ToastStack 再スキン（右下 fixed＋AnimatePresence・2値/dismiss 維持）

**Files:**
- Modify: `src/app/growth/approve/ToastList.tsx`・`ToastList.test.tsx`（追随）
- 参照: `approve-proto/ToastStack.tsx`・`hooks/useToasts.ts`（**不変**）

**不変契約:** `ApproveToast{id,message,tone:"success"|"error"}`・`{toasts,onDismiss}` props・`aria-label="お知らせ"`・`role="status"`・dismiss ボタン・useToasts は一切変更しない。

- [ ] **Step 1**: 本番 ToastList と proto ToastStack を見比べ。位置を `fixed bottom-5 right-5 z-[60]`＋`AnimatePresence`/`motion.div` へ、tone 配色を `--p-green-weak`（success）/`--p-red-weak`（error）＋`IconCheckCircle`/`IconX` へ。**fixed 化に伴い ApproveClient 内の描画位置調整が要るか確認**（インライン前提のレイアウト残骸を除去・`.approve-shell` 配下描画を担保）。
- [ ] **Step 2**: 実装＋`ToastList.test.tsx` 追随（tone/dismiss/role の実挙動維持・空アサート禁止）。framer-motion 使用のため `"use client"` 確認。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `refactor(growth): トーストを proto の右下スタック＋アニメへ再スキン（tone2値・dismiss・useToasts 不変）`

---

### Task 3: 公開キュー純ロジック（3分割拡張＋formatSchedule）

**Files:**
- Create: `src/lib/growth/publishQueueView.ts` ＋ Test `publishQueueView.test.ts`
- 参照: `src/lib/growth/publishQueue.ts`（既存 `partitionPublishQueue`/`publishBlockReason`・**変更しない**）・proto `SchedulePicker.tsx:16`（`formatSchedule`）・`:50-58`（プリセット）

**Interfaces（Produces）:**
- `splitPublishQueue(items: readonly PendingItem[], )`→`{ ready: PendingItem[]; scheduled: PendingItem[]; blocked: { item: PendingItem; reason: string }[] }` — 既存 `partitionPublishQueue` の ready/blocked を基に、`scheduledAtMs != null` を scheduled として ready から切り出す（proto の 3セクション対応）。既存純ロジックを**呼んで**拡張（重複実装禁止）。
- `formatSchedule(date: Date): string` — proto 逐語（「1/25(木) 09:00」形式）。
- `schedulePresets(nowMs: number): { label: string; atMs: number }[]` — proto のプリセット（今夜21:00/明日09:00/明日12:00/来週月曜09:00）を決定的な純関数に（`nowMs` 注入でテスト可能に）。

- [ ] **Step 1: 失敗テスト** — `splitPublishQueue`（ready/scheduled/blocked 各分類・scheduledAtMs 境界）・`formatSchedule`（曜日/ゼロ埋め）・`schedulePresets`（各プリセットの時刻計算・週跨ぎ）を網羅。**既存 `publishQueue.test.ts` の重複を作らない**（partition 自体の再テスト不要）。
- [ ] **Step 2**: 失敗確認 → 実装 → `npx vitest run src/lib/growth/publishQueueView.test.ts` PASS・100%。tsc/eslint 0。
- [ ] **Step 3: Commit** — `feat(growth): 公開キューの3分割/予約プリセット/formatSchedule を純ロジック化（100%）`

---

### Task 4: SchedulePicker 新規移植

**Files:**
- Create: `src/app/growth/approve/SchedulePicker.tsx`
- Modify: `vitest.config.ts`（exclude 追記・理由コメント）
- 参照: `approve-proto/SchedulePicker.tsx`・Task3 の `formatSchedule`/`schedulePresets`

**Interfaces:** `SchedulePickerProps{count:number, onClose:()=>void, onConfirm:(label:string, atMs:number)=>void}`（proto 準拠）。プリセット＝`schedulePresets(Date.now())`・表示＝`formatSchedule`。`datetime-local` 入力・framer-motion＋`useDialog`＋`Kbd`。fixed overlay のため root に `approve-shell` 含めトークン解決。`"use client"`。日時計算は Task3 純関数を使い**コンポーネント内で日時ロジックを書かない**。

- [ ] **Step 1**: proto を読み、Task3 の純関数で置換しつつ移植。`proto-*`→`approve-*` 読み替え。
- [ ] **Step 2**: tsc/eslint 0（未結線で単体コンパイル通過）。exclude 追記（薄い presentation・日時ロジックは lib で 100%）。
- [ ] **Step 3: Commit** — `feat(growth): 予約ピッカー SchedulePicker を proto から移植（日時計算は純ロジック・presentation は exclude）`

---

### Task 5: PublishQueue 再スキン（3サマリ＋3セクション・直叩き維持・SchedulePicker 結線）

**Files:**
- Modify: `src/app/growth/approve/PublishQueue.tsx`・`PublishQueue.test.tsx`（追随・fetch 検証維持）
- 参照: `approve-proto/PublishQueue.tsx`・Task3 `splitPublishQueue`・Task4 `SchedulePicker`・`ui/primitives`（EyecatchThumb）

**不変契約:** props `{items, token, onChanged}`・自前 `post()` による実API直叩き（公開=`/api/growth/publish` 順次・予約=`/api/growth/publish/schedule`・解除=`scheduledAt:null`）・`authHeaders`・エラー可視化は**不変**。見た目と構成のみ proto（トップ3サマリカード green/teal/amber・公開OK/予約済み/要対応 3セクション・Row=EyecatchThumb 36px＋title＋action）へ。

**新規結線:**
- 予約ボタン → `SchedulePicker` を開き `onConfirm(label, atMs)` → 既存 schedule POST（ISO変換）。
- `onFix`: 要対応行の理由が「本文が空」系 → 詳細パネルへ遷移（ApproveClient から遷移コールバックを受ける。ApproveClient 側は既存の activeId/view/detailTab state を設定するハンドラを渡す）。アイキャッチ未設定 → **Task 6 で MediaLibraryModal に置換するため、本タスクでは遷移コールバックのまま**（プレースホルダ実装禁止＝現行どおり詳細遷移でよい）。
- 折りたたみ `<section aria-label="公開キュー">` の aria は維持（proto 構成に合わせ `aria-expanded` が不要になるなら削除可・テスト追随）。

- [ ] **Step 1**: 本番 PublishQueue の post/handle 系と proto の構成を精読。ApproveClient の描画（`:1020`）と遷移 state を確認し onFix コールバック設計を確定。
- [ ] **Step 2**: 再スキン＋SchedulePicker 結線＋onFix 結線。`splitPublishQueue` で3分割。
- [ ] **Step 3**: `PublishQueue.test.tsx` 追随（一括公開/予約[ピッカー経由]/予約解除の fetch 検証維持・3セクション表示・検証強度維持）。**PublishQueue は非 exclude 維持**（グルー：API 結線フロー）。
- [ ] **Step 4: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 5: Commit** — `refactor(growth): 公開キューを proto 3サマリ+3セクションへ再スキン（実API直叩き維持・SchedulePicker 結線）`

---

### Task 6: MediaLibraryModal 移植＋実結線（要対応→アイキャッチ反映）

**Files:**
- Create: `src/app/growth/approve/MediaLibraryModal.tsx`
- Modify: `src/app/growth/approve/PublishQueue.tsx`（要対応「アイキャッチ未設定」行の action を modal 起動へ）＋`PublishQueue.test.tsx`（結線テスト追加）
- Modify: `vitest.config.ts`（MediaLibraryModal exclude 追記）
- Modify: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD5: #143 差し替えの受け皿＝公開キュー要対応→MediaLibraryModal 実結線 を追記）
- 参照: `approve-proto/MediaLibraryModal.tsx`・`src/lib/growth/media.ts`（`fetchMediaList` は**サーバ用**の可能性あり→Step1 で確認）・`/api/growth/media/route.ts`・`/api/growth/draft/eyecatch/route.ts`

**結線仕様:**
- 一覧: クライアントから `GET /api/growth/media?limit=…`（`authHeaders(token)`）→ サムネグリッド（`next/image`）。proto の `MOCK_MEDIA`/`mediaSvgUrl`/種別フィルタ（mascot/minimal/…）は**モック用のため不使用**＝実データにフィルタ軸が無ければフィルタ chip は縮約（非表示）。
- アップロード: `POST /api/growth/media`（multipart `file`）→ 返却 URL を一覧へ反映/即選択。クライアント側の事前検証（5MB/MIME）は `media.ts` の `validateUpload` 系純関数を再利用（重複実装禁止）。
- 選択確定: `POST /api/growth/draft/eyecatch { pageId, eyecatchUrl }`（`authHeaders`）→ 成功で `onChanged()`（board 再取得）＋成功トースト／失敗はエラートースト（沈黙禁止）。
- モーダル: framer-motion＋`useDialog`＋`Kbd`・root に `approve-shell`・`role="dialog" aria-modal aria-label`。

- [ ] **Step 1**: `/api/growth/media` の GET レスポンス形と `media.ts` のクライアント利用可否（server-only import が無いか）を確認。server-only なら fetch はコンポーネント内の薄い fetch（`authHeaders`）で行い、検証純関数のみ import。`/api/growth/draft/eyecatch` の要求形（pageId=Notion page id? contentId?）をテストから確認。
- [ ] **Step 2**: MediaLibraryModal 実装（一覧/アップロード/選択→eyecatch 反映）。PublishQueue の「アイキャッチ未設定」行 action を modal 起動へ差し替え。
- [ ] **Step 3**: テスト — PublishQueue.test に「要対応行→modal 開く→選択→`/api/growth/draft/eyecatch` POST→onChanged」の実挙動テストを追加（fetch モックで検証・検証強度確保）。modal 自体は exclude（presentation）だが結線フローは PublishQueue 側テストで担保。
- [ ] **Step 4**: design.md AD5 更新。
- [ ] **Step 5: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 6: Commit** — `feat(growth): メディアライブラリを proto から移植し実結線（一覧/アップロード=実API・公開キュー要対応→アイキャッチ反映 #143後継）`

---

### Task 7: PromptsView 再スキン

**Files:**
- Modify: `src/app/growth/approve/PromptsView.tsx`・`PromptsView.test.tsx`（追随＋モバイル切替分岐の追加テスト）
- 参照: `approve-proto/PromptRegistryView.tsx`

**不変契約:** props `{token}`・`fetchPrompts`（React Query）・`PromptPhase`/`assemblePromptGroups` データ源・`aria-label="プロンプト一覧"`/「プロンプト本文」・`role="status"`/`role="alert"`・全文表示＋コピーは**不変**。proto `truncated`/静的 `promptData.ts`/`FACILITY_CONTEXT` 定数は不使用。

- [ ] **Step 1**: proto のダーク master-detail（アクティブ左バー・`--p-bg-raised`・pre=`--p-bg-input`+`--p-mono`）へ class 再スキン。モバイル 1/2ペイン `showDetailMobile` state＋戻るボタン（`approve-btn-ghost`＋`IconArrowLeft`・icons.tsx に実在確認済）を追加。
- [ ] **Step 2**: テスト追随＋モバイル切替の分岐テスト追加（非 exclude 維持・100%）。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `refactor(growth): プロンプト管理を proto ダーク master-detail へ再スキン（データ源/コピー/aria 不変・モバイル切替追加）`

---

### Task 8: CommandPalette 再スキン

**Files:**
- Modify: `src/app/growth/approve/CommandPalette.tsx`
- 参照: 既存 approve ダーク部品の idiom（proto に対応物なし）

**不変契約:** props・`filterByQuery`・⌘K 結線・exclude 済は**不変**。class をライト→`--p-*`/`approve-*` ダークへ整えるのみ（`.approve-shell` スコープ内描画を確認）。

- [ ] **Step 1**: 再スキン（`--p-bg-elevated`/`--p-border-strong`/選択行 `--p-bg-active` 等・既存モーダル idiom に合わせる）。
- [ ] **Step 2: ゲート** — tsc/eslint/`npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（緑）。
- [ ] **Step 3: Commit** — `refactor(growth): コマンドパレットを approve ダークトークンへ再スキン（機能・exclude 不変）`

---

### Task 9: P5b フェーズ末ゲート＋ブラウザ確認観点

**Files:** なし（コントローラ実測）。

- [ ] **Step 1**: `npx tsc --noEmit`（出力なし）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・グローバル100%）。
- [ ] **Step 2**: `git status --short` が next-env/node_modules のみ・未push。`grep -rnE "proto-(btn|tool|changed|article|shimmer|pulse|root)" src/app/growth/approve/ | grep -v approve-proto` → ゼロ。
- [ ] **Step 3**: ledger 更新＋ブラウザ確認観点提示（公開キュー3セクション・予約ピッカー・メディアライブラリ→アイキャッチ反映・プロンプトダーク化・トースト右下・確認ダイアログ・⌘K）→**停止**。

---

## Self-Review

**1. Spec coverage（設計書 line 86 のうち P5b 分）:** PublishQueue/SchedulePicker→T3/T4/T5 ✅・PromptRegistryView→T7 ✅・ConfirmActionDialog→T1 ✅・ToastStack→T2 ✅・MediaLibraryModal→T6（実結線・ユーザー裁定）✅・CommandPalette→T8 ✅・#167 デッドコード→T1 ✅。AD5 更新→T6 ✅。
**2. Placeholder scan:** 各タスクに proto 参照＋不変契約＋結線仕様を明記。T3 は Interfaces に完全なシグネチャ。「適宜」なし。Step1（現状/API 形確認）で実ファイル読解により細部確定。
**3. Type consistency:** `splitPublishQueue`/`formatSchedule`/`schedulePresets`（T3）→T4/T5 で消費 ✅。`SchedulePickerProps{count,onClose,onConfirm(label,atMs)}`（T4）→T5 の結線と一致 ✅。MediaLibraryModal の反映 API `POST /api/growth/draft/eyecatch {pageId,eyecatchUrl}` は実在確認済（route.ts:4,54,66・isMicrocmsAssetUrl 検証あり）✅。`ConfirmActionState.kind` narrow 化は ApproveClient が revert のみ使用のため波及なし（T1 Step1 で確認）✅。

**懸念（実行時に解消）:** (a) `media.ts` の `fetchMediaList` が server-only（Management API key 使用）の場合、クライアントは `/api/growth/media` を fetch する（T6 Step1 で確認・鍵の露出禁止）。(b) proto PublishQueue の `aria-expanded` 折りたたみを撤去するか維持するかは T5 Step1 で proto 構成に合わせ判断（テスト追随）。(c) メディア一覧のフィルタ chip は実データに軸が無ければ縮約。
