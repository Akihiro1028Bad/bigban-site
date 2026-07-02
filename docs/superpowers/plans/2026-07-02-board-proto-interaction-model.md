# 承認画面 一覧(Board)を proto 対話モデルへ一本化する実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 左カラムの記事一覧カードから決定操作(承認/却下/編集/取消/詳細)を全撤去し、一覧は「開く/選ぶだけ」の proto 対話モデルへ一本化する(GitHub issue #213)。同時にカードの見た目を proto に寄せる(#211)。

**Architecture:** 決定操作は既に詳細パネルフッター(承認/却下/承認待ちに戻す)・パネルヘッダ(下書きを編集)・`ProposalView` フッター(施策トリアージ)・`shell/BulkBar`(一括)で完全に代替可能(調査 `board-proto-gap.md` で確認済み)。よってこの計画は主に **`BoardCard.tsx` の作り替え + テスト移設 + 決定失敗のトースト化 + 決定後フォーカスの付け替え** であり、新規の決定導線プラミングは追加しない。

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Tailwind v4(`--p-*` トークン)/ Framer Motion(mock)/ Vitest + RTL(istanbul 100% ゲート)。

## Global Constraints(全タスク共通・spec より逐語)

- **正典プロト:** `src/app/growth/approve-proto/Board.tsx:70-179` が一覧行の見た目・対話の正典。行は `motion.button`(クリックで開く)＋ hover 表示の 18px 控えめチェック(選択)のみ。**承認/却下/編集/取消/詳細ボタンは持たない。**
- **決定操作の置き場所(一本化後):** 単体=詳細パネル(フッター 承認/却下/承認待ちに戻す・ヘッダ 下書きを編集)/施策=`ProposalView` フッター/複数=`shell/BulkBar`。カードには一切の決定操作を置かない。
- **失敗を沈黙させない(プロジェクト絶対禁止):** カードの失敗アラート(再試行)を撤去する代わりに、**決定/取消の失敗は必ずトーストで可視化**し再試行手段を残す。`decideFromPanel` はパネルを即閉じるため、失敗はトーストでしか見えなくなる点に注意。
- **データが無いバッジは出さない:** 一覧行に `文体N`(styleHint)・`更新時刻`・`提示中` の裏付けデータは無い(`board-proto-gap.md` Q5)。**この3つは出さない**。出すのは `滞留`(stuck 派生)・`修正中`(`isReviseBusy(reviseStatus)`)・`ScoreBar`(`score`)。
- **アクセシビリティ:** 行はキーボード到達可能・`aria-current`(BoardList 側で付与済み)。選択チェックの `aria-label` は既存の `一括選択: ${title}` を維持(一括テストの互換)。`div+onClick` 禁止。
- **TDD 必須・カバレッジ 100% 維持。** 型 `any` 禁止・`import type` 使用・`React.FC` 禁止。

## 対象ファイル

- 作り替え: `src/app/growth/approve/BoardCard.tsx`(+ `BoardCard.test.tsx`)
- 変更: `src/app/growth/approve/ApproveClient.tsx`(renderItem のプロップ整理・決定後フォーカス)
- 変更: `src/app/growth/approve/hooks/useApproveDecisions.ts`(失敗トースト・フォーカス対象)(+ 既存 hook テストがあれば)
- テスト移設: `src/app/growth/approve/ApproveClient.test.tsx`
- 参照(不変): `approve-proto/Board.tsx`、`shell/BulkBar.tsx`、`DetailPanel.tsx`(フッター)、`ProposalView.tsx`、`ui/primitives.tsx`(StageChip/ScoreBar/AwaitingDot)、`ui/eyecatchThumb.tsx`、`boardCardView.ts`、`ui/boardStage.ts`、`ToastList.tsx`

---

## Task 1: ApproveClient.test.tsx の詳細オープン起点を「行/タイトルクリック」へ付け替え(非破壊・グリーン維持)

**目的:** Task 3 で「詳細」ボタンを撤去したときに大量の詳細パネルテストが壊れないよう、先に**オープン起点を行/タイトルクリックへ移す**。この時点ではカードのボタンは残っているので両方の起点が機能し、スイートはグリーンのまま。

**Files:**
- Modify/Test: `src/app/growth/approve/ApproveClient.test.tsx`

**Interfaces:**
- Consumes: 既存の `getByRole("button", { name: "詳細: <title>" })` でパネルを開くテスト群(約40箇所)。
- Produces: 同テスト群が「行(タイトルボタン `getByRole("button", { name: <title> })` またはその行要素)クリック」でパネルを開くように変更されたもの。決定の assertion は Task 3 まで変更しない。

- [ ] **Step 1:** `ApproveClient.test.tsx` 内で `name: "詳細: ` を起点にパネルを開いている箇所を洗い出す(grep）。各箇所を、当該記事の**タイトルボタン**クリック(`fireEvent.click(screen.getByRole("button", { name: <title> }))`、タイトルは `onOpen` を呼ぶ既存実装 `BoardCard.tsx:113-120`)へ置換する。タイトルが一意でないテストは行 `data-row-id` から辿る。**決定ボタン(承認:/却下:/取消:/編集:)を押すテストは今は触らない。**
- [ ] **Step 2:** Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`
  Expected: PASS（全緑。ボタンは未撤去なので既存 assertion も生きている）。
- [ ] **Step 3:** Commit
  ```bash
  git add src/app/growth/approve/ApproveClient.test.tsx
  git commit -m "test(growth): 承認画面テストの詳細オープンを行クリック起点へ付け替え(#213 前段)"
  ```

---

## Task 2: 決定/取消の失敗をトーストで可視化(加算・グリーン維持)

**目的:** カードの失敗アラート撤去(Task 3)に先立ち、**決定失敗のトースト表示**を追加する。この時点ではカードの失敗アラートも残る(一時的に二重でも無害)。`失敗を沈黙させない` を満たす。

**Files:**
- Modify: `src/app/growth/approve/hooks/useApproveDecisions.ts`
- Test: `src/app/growth/approve/hooks/useApproveDecisions.test.ts`(無ければ新規)

**Interfaces:**
- Consumes: 既存 `useApproveDecisions({ token, onFocus, onClosePanel })`。トースト投入関数を新パラメータ `onError: (message: string) => void`(または既存の toast push)で受け取る。ApproveClient のトースト push 関数(`ToastList` 用)を渡す。
- Produces: `decide`/`undo` の catch 節で `failures` 設定に**加えて** `onError(text)` を呼ぶ。戻り値・既存挙動は不変。

- [ ] **Step 1(RED):** `useApproveDecisions.test.ts` に「`postDecision` が reject したとき `onError` がエラーメッセージ付きで呼ばれる」テストを追加(承認失敗・取消失敗の2ケース)。`onError` は `vi.fn()`。
- [ ] **Step 2:** Run: `npx vitest run src/app/growth/approve/hooks/useApproveDecisions.test.ts` → FAIL(`onError` 未実装)。
- [ ] **Step 3(GREEN):** `UseApproveDecisionsParams` に `onError: (message: string) => void` を追加。`decide` の catch(52-56付近)と `undo` の catch(69-73付近)で、`setFailures(...)` の直後に `onError(text)` を呼ぶ。`ApproveClient.tsx` の `useApproveDecisions({...})` 呼び出しに `onError`(既存トースト push、例 `pushToast` / `addToast`)を配線する。ApproveClient にトースト push が無ければ `ToastList` の既存 push 経路を用いる(要確認・純追加)。
- [ ] **Step 4:** Run: `npx vitest run src/app/growth/approve/hooks/useApproveDecisions.test.ts src/app/growth/approve/ApproveClient.test.tsx` → PASS。
- [ ] **Step 5:** Commit
  ```bash
  git add src/app/growth/approve/hooks/useApproveDecisions.ts src/app/growth/approve/hooks/useApproveDecisions.test.ts src/app/growth/approve/ApproveClient.tsx
  git commit -m "feat(growth): 承認/取消の失敗をトースト可視化(カード撤去に先行・#213)"
  ```

---

## Task 3: BoardCard を proto 対話モデルへ作り替え(決定操作全撤去・見た目 proto 化・フォーカス付け替え・テスト移設)

**目的:** #213 本体 + #211。カードから 5 操作(承認/却下/編集/取消/詳細)と失敗アラート・ラベル付きチェック・冗長ブロックを撤去し、proto 行(開く/選ぶだけ + 控えめチェック + 見た目・バッジ)へ寄せる。決定後フォーカスを行へ付け替える。関連テストを移設する。

**Files:**
- Rewrite: `src/app/growth/approve/BoardCard.tsx`
- Rewrite: `src/app/growth/approve/BoardCard.test.tsx`
- Modify: `src/app/growth/approve/ApproveClient.tsx`(renderItem のプロップ整理・`onFocus` 対象・未使用化した `openCardEditor` 導線の掃除)
- Modify: `src/app/growth/approve/hooks/useApproveDecisions.ts`(`onFocus` 対象を行 id へ)
- Test 移設: `src/app/growth/approve/ApproveClient.test.tsx`

**Interfaces:**
- Consumes: proto 行の正典 `approve-proto/Board.tsx:70-179`。データ対応表 `board-proto-gap.md` Q5。決定導線の代替先 `DetailPanel.tsx` フッター(承認 540-555 / 却下 519-526 / 承認待ちに戻す 494)・ヘッダ(下書きを編集 286-290)。
- Produces: `BoardCard` の新 props（表示専用 + `onOpen` + `onToggleSelect` + `selected` + `bulkSelectable` のみ。`onApprove`/`onReject`/`onEdit`/`onUndo`/`failure`/`isBusy`/`lockedForRevise` は撤去）。

### 新 `BoardCard` の仕様(proto 準拠 + 本番データ適応)

- ルート: 既存どおり `as` で `<li>`/`<div>` 切替(BoardList 配下は `div`)。`data-decision`・focus ring・`data-row-id` 連携は維持。
- **選択チェック:** proto `Board.tsx:101-117` の 18px 控えめチェック(`opacity-0 group-hover:opacity-100`、選択時 accent 塗り + `IconCheck`)。`aria-label` は **`一括選択: ${item.title}` を維持**(一括テスト互換)。`onClick` は `e.stopPropagation()` 後に `onToggleSelect`。`bulkSelectable` が false の行はチェックを描画しない。
- **アイキャッチ:** `EyecatchThumb`(`cardHue(item.id)` / `cardHasEyecatch(item)` / `item.eyecatchUrl || undefined` / `size={38}` / `alt=""`)。現状維持。
- **タイトル:** proto 準拠に変更 → `truncate text-[13.5px] font-medium leading-snug`、色 `var(--p-text)`(決定済みは `--p-text-2`)。**タイトルはボタンで `onOpen`**(既存の open 起点を維持)。`awaitingYou` の `AwaitingDot` は先頭に維持。
- **抜粋:** proto 準拠に変更 → 常に2行目として表示(`cardExcerpt(item)` が空なら空文字で行だけ確保 or 省略。proto は常時表示なので、空でも `truncate` の空行にせず、空なら非表示で可。実装者判断で proto の見た目に最も近い方を採用)。`text-[12px] leading-snug` 色 `--p-text-3`。
- **メタ行(proto `Board.tsx:139-177` を本番データで):**
  - `StageChip stage={deriveBoardStage(item)} small`(現状維持)。
  - `滞留`: `stuck`(既存 prop・派生)が true のとき proto の amber バッジ(`proto-pulse`/`approve-pulse` は本番トークンに合わせる)。
  - `修正中`: `isReviseBusy(item.reviseStatus)` が true のとき purple バッジ(`import { isReviseBusy } from ...` 現在 ApproveClient が使う経路と同一)。
  - `ScoreBar score={item.score}`(`score != null` のとき)。
  - **出さない:** `文体N`・`更新時刻(IconClock)`・`提示中`(データ無し)。
- **状態チップ(本番固有・情報のみ・非操作):** 4状態を **決定操作ではなく情報チップ**として最小表示する。
  - 決定済み(`choice`): メタ行に控えめチップ `✓${choice}`(例 `✓承認`)。色 `--p-text-2`。**取り消しボタンは置かない**(取消は詳細フッター)。
  - 下書き完了(`item.isDraftReady`): 特別チップ不要(StageChip が示す)。**編集ボタンは置かない**(編集は詳細ヘッダ)。
  - 下流待ち(`awaitingDownstream`): チップ `生成中`(`item.stage==="generating"` は pulse)/`生成待ち`/施策は `承認済み`。**冗長な「🖊自宅PCで執筆中…stepN」テキストと滞留警告パラグラフは行から撤去**(滞留は上記バッジで表現。詳細は詳細パネルへ)。
- **撤去するもの:** `詳細`/`取り消す`/`編集`/`承認`/`却下` の全ボタン、ラベル付き `選択` チェック、失敗アラート(`failure` の赤帯 + `再試行`)、`generatingStepsText` の詳細テキスト、`stuck` 警告パラグラフ、`kindLabel` の未決定チップ(actionable 状態は StageChip + 承認/却下がフッターへ移るため行はタイトル+メタのみ)。
- **props 掃除:** 撤去に伴い `onApprove/onReject/onEdit/onUndo/failure/isBusy/lockedForRevise/step/scoreBarWidth/kindLabel/generatingStepsText` のうち未使用になったものを props から削除。`onOpen/onToggleSelect/selected/bulkSelectable/item/choice/isFocused/stuck/awaitingDownstream/rowClassName/stageAccentClass/as` を残す(実装者は最終的な使用箇所に合わせて厳密化)。

### ApproveClient / useApproveDecisions の付随変更

- `useApproveDecisions`: `onFocus("undo-${id}")` / `onFocus("approve-${id}")`(撤去されたカードボタン id)を、**行要素へのフォーカス**へ変更。行は `data-row-id={item.id}` を既に持つ(`BoardList.tsx:75`)。`onFocus` に行 id セレクタ(例 `row-${id}` を BoardList/BoardCard 側に付与、または `[data-row-id="${id}"]`)を渡し、ApproveClient の `focusById`(既存のフォーカス移動ヘルパ)を行対応に調整。決定後は当該行(または次の actionable 行)へフォーカス。
- `renderItem`(ApproveClient.tsx:760-795): 新 `BoardCard` props に合わせて整理。`onApprove/onReject/onEdit/onUndo/failure/...` の受け渡しを削除。`openCardEditor` がカード専用で他から未使用なら、参照撤去(編集はパネルヘッダ `startEditDraft` に一本化)。`toggleSelect`/`setActiveId` は維持。
- `bulkDecide` / `shell/BulkBar`(1074-1079)は不変(既に proto 一致)。

### テスト移設

- [ ] **Step 1(RED — BoardCard):** `BoardCard.test.tsx` を新仕様へ書き換え。撤去する「承認/却下/取消/編集/詳細ボタン」テスト(調査 Q6: L84,L92,L98,L104,L128,L141,L146,L179 相当)を削除し、代わりに：(a) 行/タイトルクリックで `onOpen`、(b) 控えめチェック(`一括選択: X`)で `onToggleSelect`・選択時 accent、(c) `滞留`/`修正中` バッジの出し分け、(d) 決定済みチップ `✓承認`、(e) 下流待ちチップ `生成中`/`生成待ち`、(f) 決定ボタン・失敗アラートが**存在しない**ことの negative assertion、を追加。まず新テストが FAIL することを確認。
- [ ] **Step 2(GREEN — BoardCard):** `BoardCard.tsx` を上記仕様へ作り替え。Run: `npx vitest run src/app/growth/approve/BoardCard.test.tsx` → PASS。
- [ ] **Step 3(ApproveClient 配線):** `renderItem` と `useApproveDecisions` の `onFocus`、`openCardEditor` 掃除を実施。
- [ ] **Step 4(ApproveClient テスト移設):** `ApproveClient.test.tsx` の**カード決定ボタンを押していた ~18 テスト**(調査 Q6: L351,L378,L397,L419,L439,L457,L470,L483,L505,L532,L550,L631,L645,L801,L848,L1222/L1229,L1837/L1845,L1988,L2628,L3151/L3166/L3172/L3188 相当)を「対象記事を開く → 詳細フッター/ヘッダで承認・却下・承認待ちに戻す・下書きを編集」経由へ書き換え。失敗系(L439,L457,L470,L483,L532,L550)は**トースト可視化**(Task 2)を assert する形へ。フォーカス系(L631,L645)は**行フォーカス**へ。生成待ち/下書き行の negative(L801,L1222,L1837)は「行に承認/却下が無い」を assert。一括(L2679/L2704/L2717)は `一括選択:` チェック維持のため原則そのまま。
- [ ] **Step 5:** Run: `npx vitest run src/app/growth/approve/` → PASS(全緑)。
- [ ] **Step 6(全体ゲート):** Run: `npx tsc --noEmit && npx eslint src/app/growth/approve && npx vitest run --coverage`
  Expected: 型/lint クリーン・全緑・グローバル 100%。
- [ ] **Step 7:** Commit
  ```bash
  git add src/app/growth/approve/BoardCard.tsx src/app/growth/approve/BoardCard.test.tsx src/app/growth/approve/ApproveClient.tsx src/app/growth/approve/hooks/useApproveDecisions.ts src/app/growth/approve/ApproveClient.test.tsx
  git commit -m "feat(growth): 一覧カードを proto 対話モデルへ一本化(決定操作撤去・見た目 proto 化) (#213, #211)"
  ```

---

## Self-Review(計画完成後・spec 突き合わせ)

- **#213 カバレッジ:** カードから 5 操作撤去(Task 3)+ 代替先(既存フッター/ヘッダ/ProposalView/BulkBar)確認済み + 失敗トースト(Task 2)+ フォーカス付け替え(Task 3)。✓
- **#211 カバレッジ:** タイトル書体(13.5 medium truncate)・控えめチェック・`滞留`/`修正中`/ScoreBar バッジ復帰(Task 3)。データ無しの `文体N`/`更新時刻`/`提示中` は Global Constraints に基づき明示的に非表示。✓(部分対応・理由明記)
- **プレースホルダ走査:** proto 行は正典ファイル参照 + データ対応表で具体化済み。曖昧な「適切に」等は無し。✓
- **型整合:** 撤去 props は Task 3 で厳密に削除。`onError` は Task 2 で型追加。✓
- **緑維持:** Task 1(テスト付け替え・非破壊)→ Task 2(トースト加算)→ Task 3(フリップ)。各タスク末で緑。✓

## 未対応(今回スコープ外・別 issue)

- **#210** アイキャッチがプレビューに出ない(データ=Notion ミラー起因の可能性大・要ランタイム確認)。
- **#212** プロンプト Markdown 整形表示(MD パーサ未導入・要ライブラリ追加)。
