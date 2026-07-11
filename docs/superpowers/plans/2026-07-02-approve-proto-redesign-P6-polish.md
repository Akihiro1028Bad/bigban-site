# 承認画面 proto 移植 P6=仕上げ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** proto 移植の最終仕上げ — dead code 総撤去・フルキーボード（X/1-3/?/Esc 統一・モーダルガード）・`<main>`/段階フィルタの aria 是正・密度トグル復活・#143 実結線・コントラスト格上げ・axe 監査導入。

**Architecture:** キーボードは既存 `shortcuts.ts` 純ロジックの拡張（action 追加＋モーダルガード純関数）＋ ApproveClient の薄い結線。Esc は「focus-trap 済み fixed モーダルは自前 Esc＋キー漏れ stopPropagation（CommandPalette 前例）／ApproveClient 所有状態は中央 escape 分岐」の二層。aria は段階フィルタを tab→group へ是正。全て純ロジック分離で 100% 維持。

**Tech Stack:** 既存スタック＋`vitest-axe`（新規 devDependency・jsdom 制約下の axe ユニット監査）。

## Global Constraints

- 出力・コミットは日本語。**push 禁止・PR 禁止・ローカルコミットのみ。** `next-env.d.ts`/`node_modules` は絶対にステージしない。
- TS strict・`any` 禁止・`React.FC` 禁止・`import type`・`@ts-ignore` 禁止。`"use client"` は必要時のみ。
- Coverage 100%（4指標・threshold 不変）。pure logic 除外禁止。keydown 分岐・トグル等は `shortcuts.ts`/`boardPrefs.ts` へ寄せてテスト。
- `proto-*` クラス禁止。fixed overlay は `approve-shell`＋`fixed inset-0` を落とさない。
- 失敗を沈黙させない。ダミーデータ禁止。
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。

## 確定した設計判断（メイン fable5 裁定・研究 `.superpowers/sdd/p6-research.md` §7 の解）

1. **キーボード採用**: `x`(選択トグル)・`1/2/3`(タブ)・`?`(ヘルプ) を追加。**数字はクラスタにマップ**: 1=構成案(outline)・2=プレビュー(preview)・3=素材(material→`clusterTargetLeaf` の既定リーフ)。ShortcutOverlay の表記「1構成案/2プレビュー/3校正/4素材」は**「1構成案/2プレビュー/3素材」へ修正**（「校正」は存在しないタブ・4 は廃止）。
2. **Esc 二層設計**: (i) focus-trap 済み fixed モーダル（ShortcutOverlay/ConfirmActionDialog/ProposalFormModal/MediaLibraryModal/SchedulePicker）は **root `onKeyDown` で Escape→onClose・その他の単一キーは `stopPropagation()`**（モーダル内のキーを盤へ漏らさない・CommandPalette.tsx:37-42 と同 idiom）。(ii) 中央 `dispatchRef` の escape 分岐を **consult.open→closeDrawer を詳細クローズより先に** 拡張。
3. **モーダル開放中ガード**: `shouldBlockSingleKeys(flags: {…}): boolean` を `shortcuts.ts` に純関数で追加し、ApproveClient keydown で ApproveClient 所有 state（shortcutsOpen/confirmAction/proposalFormOpen/consult.open/editingDraft/paletteOpen）を渡して単一キーを抑止（palette/escape は除外＝proto page.tsx:908 相当）。
4. **`<main>` aria = 案C**: 段階フィルタ（TopBar）を `role="tablist"/tab` → **`role="group" aria-label="段階フィルタ"`＋各ボタン `aria-pressed`** へ是正（絞り込みでありパネル切替でない）。`<main>` は `role="tabpanel"`/`aria-labelledby`/`id` を外し **`aria-label={viewPanelLabel[activeView]}` のみ**。TopBar.test/ApproveClient.test の a11y セクション追随。
5. **密度トグル復活**: TopBar 右側（更新ボタン近傍）に `approve-tool` ボタン。`onClick` → `setDensity(nextDensity(density))`＋`localStorage.setItem(DENSITY_KEY, next)`。`aria-pressed={density==="compact"}`・`aria-label="表示密度を切り替え"`。`nextDensity` は既存テスト済み・結線分岐のテスト追加。
6. **#143 実結線**: `ApproveClient.tsx:819-821` のプレースホルダ pushToast を撤去し、`onPickEyecatch` → **MediaLibraryModal 起動**（P5b 実装再利用: `{token, pageId, onClose, onApplied}`）。`onApplied` → 下書き再取得＋盤 poll＋成功トースト。
7. **dead code**: `AdviceCard.tsx(+test)/ReviseFailed.tsx/RevisePending.tsx/MetricChips.tsx(+test)/StyleHints.tsx(+test)` を削除→ **その後** `StaleNotice.tsx` の孤立を確認して削除（transitive 順）。`mediaLibrary.ts` の `MOCK_MEDIA` export 削除・**`mediaSvgUrl` は使用中＝残置**（MediaLibraryModal.tsx:2 の「mediaSvgUrl 不使用」コメント誤記を修正）。`approveStyles.ts`/`AddProposalForm` は使用中＝残置。`shortcuts.ts` の `clampIndex` はテストが直接叩いていなければ file-private 化。
8. **コントラスト**: 本文用途の `--p-text-3` 6箇所（`InlineCommentReview.tsx:78,119,174`・`PublishQueue.tsx:321`・`OutlineView.tsx:180`・`CommandPalette.tsx:119`）を `--p-text-2` へ格上げ。トークン定義自体は不変（装飾用途は据え置き）。
9. **axe = vitest-axe（ユニット）**: 新規 devDependency。主要状態（ログイン/盤+詳細/施策/成績/公開キュー/プロンプト）を axe にかけるテストを追加。jsdom 制約（コントラスト等は検査不可）を明記し、Playwright+axe の E2E は将来項目として ledger へ記録。
10. reduced-motion は対応済み（MotionConfig+CSS）・記事タイポは proto と完全一致＝**追加作業なし**（最終目視のみ）。

## 参照

研究: `.superpowers/sdd/p6-research.md`（§1 キーボード・§2 密度・§3 aria・§4 dead code・§5 a11y・付録に全 path:line）。proto: `approve-proto/page.tsx:895-968`（keydown）・`approve-proto/ShortcutOverlay.tsx`。

---

### Task 1: dead code 総撤去

**Files:**
- Delete: `src/app/growth/approve/{AdviceCard,ReviseFailed,RevisePending,MetricChips,StyleHints}.tsx`＋`{AdviceCard,MetricChips,StyleHints}.test.tsx` → 孤立確認後 `StaleNotice.tsx`
- Modify: `src/app/growth/approve/mediaLibrary.ts`（`MOCK_MEDIA` export 削除・該当テスト調整）・`MediaLibraryModal.tsx`（コメント誤記修正: mediaSvgUrl は使用中）・`shortcuts.ts`（`clampIndex` の file-private 化＝テスト直叩きが無ければ）
- 場合により: `vitest.config.ts`（削除ファイルが exclude に載っていれば行を除去）

- [ ] **Step 1**: 各削除対象の非テスト import ゼロを `grep -rn` で再確認（研究 §4(i) の根拠を再現）。`AdviceCard.test.tsx` が共有ロジックを間接検証していないか確認（ConsultCard は別実装のはず・違えば BLOCKED 報告）。`clampIndex` をテストが直接 import しているか確認。
- [ ] **Step 2**: AdviceCard/RevisePending → StaleNotice の transitive 順で削除。MOCK_MEDIA 削除・コメント修正・clampIndex private 化。exclude 残骸掃除。
- [ ] **Step 3: ゲート** — `npx tsc --noEmit`（0）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `chore(growth): 旧ライト版 orphan 6ファイル+モック export を撤去（非テスト参照ゼロ確認・transitive 順）`

---

### Task 2: キーボード拡張（X/1-3/?＋モーダルガード）

**Files:**
- Modify: `src/app/growth/approve/shortcuts.ts`＋`shortcuts.test.ts`（action 追加: `"select-toggle"`(x)・`"tab-outline"`(1)・`"tab-preview"`(2)・`"tab-material"`(3)・`"help"`(?)。＋`shouldBlockSingleKeys(flags)` 純関数）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（keydown にガード結線・`dispatchRef` に新 action 分岐: x=フォーカス行の選択トグル[既存 bulk 選択ハンドラ]・1/2/3=`setDetailTab`（3 は素材クラスタの既定リーフ＝DetailPanel の `clusterTargetLeaf` と同じ値）・?=ShortcutOverlay 開）
- Modify: `src/app/growth/approve/shell/ShortcutOverlay.tsx`（表記を「1構成案/2プレビュー/3素材」へ・「校正」「4」削除）＋テスト追随
- Test: `ApproveClient.test.tsx` に新キーの実挙動テスト（x で選択トグル・1/2/3 でタブ切替・? でヘルプ・モーダル開放中に a/j が漏れない）

**Interfaces:** `resolveShortcut` の戻り値 union に新 action を追加（既存 8種＋5種）。`shouldBlockSingleKeys({hasOpenModal: boolean}): boolean` 相当（シグネチャは実装で自然に・純関数・100%）。

- [ ] **Step 1**: `shortcuts.test.ts` に新 action・ガードの失敗テスト → 実装（純ロジック 100%）。
- [ ] **Step 2**: ApproveClient 結線（ガードは shortcutsOpen/confirmAction/proposalFormOpen/consult.open/editingDraft/paletteOpen を渡す・palette/escape は抑止対象外）。x/1/2/3/? の分岐。ShortcutOverlay 表記修正。
- [ ] **Step 3**: ApproveClient.test に実挙動テスト追加（空アサート禁止）。
- [ ] **Step 4: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 5: Commit** — `feat(growth): フルキーボード対応（x選択/1-3タブ/?ヘルプ・モーダル開放中の単一キー抑止・表記を現行タブへ整合）`

---

### Task 3: Esc 統一（モーダル自前 Esc＋中央優先順）

**Files:**
- Modify: `shell/ShortcutOverlay.tsx`・`ConfirmActionDialog.tsx`・`ProposalFormModal.tsx`・`MediaLibraryModal.tsx`・`SchedulePicker.tsx` — 各 dialog root に `onKeyDown`: Escape→`onClose`（＋`stopPropagation`）・その他の修飾なし単一キー→`stopPropagation()`（CommandPalette.tsx:37-42 と同 idiom・共通化できる薄いヘルパを作ってよいが over-abstraction は不要）
- Modify: `ApproveClient.tsx` の `dispatchRef` escape 分岐 — **consult.open なら closeDrawer を最優先**、次いで既存（パレット閉→詳細閉）
- Test: 各モーダルのテスト（あるもの）＋ApproveClient.test に「Esc でドロワー/モーダルが閉じる」「モーダル内で押した a が盤に漏れない」実挙動テスト

- [ ] **Step 1**: 5モーダルに Esc＋stopPropagation。SchedulePicker/MediaLibraryModal は exclude 済のため挙動テストは結線元（PublishQueue.test）or ApproveClient.test で担保。
- [ ] **Step 2**: 中央 escape 優先順拡張＋テスト。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `feat(growth): Esc でモーダル/ドロワーを閉じる（各モーダル自前 Esc＋キー漏れ防止・中央 escape は相談→詳細の優先順）`

---

### Task 4: `<main>` aria 是正（案C）＋密度トグル復活

**Files:**
- Modify: `ApproveClient.tsx`（`<main>` から `role="tabpanel"`/`id`/`aria-labelledby` を外し `aria-label={viewPanelLabel[activeView]}` のみ）
- Modify: `shell/TopBar.tsx`（段階フィルタ: `role="tablist"/tab/aria-selected/aria-controls` → `role="group" aria-label="段階フィルタ"`＋各ボタン `aria-pressed`。＋**密度トグルボタン追加**: `approve-tool`・`aria-pressed={density==="compact"}`・`aria-label="表示密度を切り替え"`・props で `density`/`onToggleDensity` を受ける）
- Modify: `ApproveClient.tsx`（`onToggleDensity`: `const next = nextDensity(density); setDensity(next); localStorage.setItem(DENSITY_KEY, next)`）
- Test: `TopBar.test.tsx`（group/aria-pressed・密度トグル）・`ApproveClient.test.tsx`（a11y セクション追随・密度: クリックで densityClass が変わり localStorage に書かれる実挙動）

- [ ] **Step 1**: aria 是正＋テスト追随（検証強度維持: tab→group の付替えでなく「segment 切替で絞り込みが機能する」実挙動は既存維持）。
- [ ] **Step 2**: 密度トグル（TopBar 配置・ApproveClient 結線・localStorage 書込・テスト）。`nextDensity` の未使用 export 状態解消。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `fix(growth): 段階フィルタを group+aria-pressed へ是正し main の aria を単一化＋密度トグルを TopBar に復活（localStorage 保存）`

---

### Task 5: #143 実結線（詳細パネル→メディアライブラリ）

**Files:**
- Modify: `ApproveClient.tsx`（`onPickEyecatch` のプレースホルダ pushToast（:819-821）を撤去 → `mediaFor: PendingItem | null` state を追加し MediaLibraryModal を描画。`onApplied` → 下書き再取得（既存 reload）＋`pollBoard()`＋成功トースト）
- Test: `ApproveClient.test.tsx`（詳細パネル素材タブ「メディアから選ぶ」→ modal 開く→選択→`/api/growth/draft/eyecatch` POST→下書き再取得＋トースト の実挙動。PublishQueue.test の既存 modal テストと重複しない範囲）

- [ ] **Step 1**: MediaLibraryModal の props（P5b 実装）と DetailPanel の `onPickEyecatch` 経路を確認し結線。旧コメント（:745-747 の P5 前縮約注記）を現状へ更新。
- [ ] **Step 2**: 実挙動テスト追加。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `feat(growth): 詳細パネルのアイキャッチ差し替えをメディアライブラリへ実結線（#143 プレースホルダ撤去）`

---

### Task 6: コントラスト格上げ＋vitest-axe 監査

**Files:**
- Modify: `InlineCommentReview.tsx:78,119,174`・`PublishQueue.tsx:321`・`OutlineView.tsx:180`・`CommandPalette.tsx:119` — 本文用途の `var(--p-text-3)` → `var(--p-text-2)`（装飾用途は変更しない）
- Add devDependency: `vitest-axe`（`npm i -D vitest-axe`・lockfile 更新は node_modules 非ステージで package.json/package-lock.json のみ）
- Create: `src/app/growth/approve/a11y.axe.test.tsx` — 主要状態（ログイン画面／盤＋詳細パネル／施策 view／成績 view／公開キュー／プロンプト view）を render し `expect(await axe(container)).toHaveNoViolations()`。既存のテストセットアップ（MSW/モック）idiom を ApproveClient.test.tsx から流用。jsdom 制約（color-contrast 等は無効）をファイル頭のコメントに明記。
- [ ] **Step 1**: 6箇所の格上げ（見た目のみ・テスト影響ないはず）。
- [ ] **Step 2**: vitest-axe 導入＋axe テスト（違反が出たら**修正してから**通す＝ルール無効化での回避は禁止。どうしても正当な例外は理由コメント付き rule 除外）。
- [ ] **Step 3: ゲート** — tsc/eslint/`npx vitest run --coverage`（全緑・100%）。
- [ ] **Step 4: Commit** — `feat(growth): 本文コントラスト格上げ(text-3→text-2)と vitest-axe による a11y 監査を導入`

---

### Task 7: P6 フェーズ末ゲート＋ブラウザ確認観点（コントローラ実測）

- [ ] tsc/eslint/`vitest run --coverage` 全緑・100%・作業ツリークリーン・未push・proto- 残存ゼロ。
- [ ] ledger 更新＋ブラウザ確認観点（キーボード一式・Esc・密度トグル・詳細からのメディア差し替え・段階フィルタの挙動不変）提示 → **停止**。
- [ ] ユーザー OK 後: **最終全体レビュー**（P0〜P6 whole-branch・opus・read-only）→ 所見対応 → プロジェクト完了報告。

---

## Self-Review

**1. Spec coverage（設計書 line 87 P6）:** a11y キーボード→T2/T3 ✅・axe→T6 ✅・コントラスト→T6 ✅・reduced-motion→対応済み確認のみ ✅・記事タイポ→差分なし確認済み ✅・orphaned 撤去→T1 ✅・全体カバレッジ→各ゲート＋T7 ✅・最終全体レビュー→T7 後段 ✅。backlog (a)→T4・(b)→T4・(c)→T2/T3・(e)→T5 ✅。
**2. Placeholder scan:** 各タスクに対象 path:line（研究由来）・設計判断・テスト観点を明記。「適宜」なし。
**3. Type consistency:** `resolveShortcut` union 拡張（T2）は dispatchRef 分岐（T2 内）で消費・`shouldBlockSingleKeys` は同タスク内で完結 ✅。`nextDensity`/`DENSITY_KEY`/`parseDensity` は実在（boardPrefs.ts:8-22・ApproveClient.tsx:95-96）✅。MediaLibraryModal props は P5b 実装（token/pageId/onClose/onApplied）✅。clusterTargetLeaf は DetailPanel.tsx 実在（P3b）— T2 Step2 で実値確認 ✅。

**懸念（実行時解消）:** (a) T2 の x（選択トグル）は bulk 選択がフォーカス行に対して動く既存ハンドラの有無に依存 — 無ければ「一括モード中のみ有効」等 proto の意味論に合わせ Step1 で確認。(b) T6 の axe が既存マークアップの違反を掘る可能性 — 修正コストは違反内容次第（原則修正・正当な例外のみ理由付き除外）。(c) T4 の tab→group 変更で ApproveClient.test の段階フィルタ関連クエリ（getByRole("tab")）の追随箇所数は Step1 で把握。
