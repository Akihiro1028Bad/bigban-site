# グロースループ 承認画面「AIに相談」UX拡張 実装計画(F1 全選択・F2 構成案全体指示・F3 本文全体コメント)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推奨)または superpowers:executing-plans でタスク単位に実装する。各ステップは checkbox(`- [ ]`)で進捗管理する。
> **本計画のタスクは全て [実装者: Codex]**(コード変更＝TDD・完全なテストコード同梱／プロンプト追記＝変更前後の確定テキストを転記済み)。各タスクは**自己完結ブリーフ**として切り出され、実装者は**そのタスク 1 つ分しか見ない**。だから正確なファイルパス・完全なインターフェース・完全なテストケース・実行コマンド・コミットメッセージまで含む。「〜と同様」「適切に」等のプレースホルダは禁止。
> **git commit は Codex にさせず、レビュー後に fable5 が代行する**(各タスク末尾のコミットメッセージ案は fable5 用)。**push しない**。

**Goal:** 承認画面「AIに相談」ドロワーの相談 UX を、既存3ループ(アドバイス反映 #165・構成案修正 #40・本文コメント #182)を壊さずに拡張する。(F1)アドバイス提示の反映可能 fix を一括採用/解除するトグルを足す。(F2)構成案 revise タブに「構成案全体への指示」欄を足し、予約語 `記事全体` の擬似コメントとして既存 revise ループへ流す。(F3)本文相談に「全体コメント」欄を足し、既存 comment-revise ループを拡張して全体コメント1件から最大10ブロックの before/after 案を提示させる。仕様 `docs/superpowers/specs/2026-07-06-growth-consult-ux-expansion-design.md` の F1(§3)・F2(§4)・F3(§5)を対象とする。

**Architecture:** 既存グロースループの設計思想を完全踏襲する。
- **F1(UI＋純ロジック)**: 全選択で採用する fix index を決定的に返す純関数 `selectableAdoptIndexes` を `scripts/growth/advise-apply.ts` に追加(既存 `src/lib/growth/adviseApply.ts` が再エクスポート済み)。`MAX_ADOPTED=20` を route の private 定数から純ロジックへ export 化し単一ソースにする。採用集合の一括操作 `setAdoptedBulk` を `useAdviceConsult.ts` に足し、`AdviceResultBody.tsx`(カバレッジ除外の薄い UI)にトグル行を足す。ループ・API 本体・スキーマは不変。
- **F2(UI＋プロンプト)**: 予約語定数 `OUTLINE_OVERALL_LINE = "記事全体"` を `scripts/growth/revise.ts` に追加(スキーマ・シリアライズ不変)。`useReviseEditing.ts` の `requestRevise` を「全体指示が非空なら全体擬似1件のみ・空ならセクション展開」に分岐。`ReviseCommentForm.tsx` に全体指示 textarea＋排他ガード＋ボタン活性条件。`revise-outline.md` に擬似コメント解釈＋予約語禁止を追記。
- **F3(スキーマ＋route＋CLI＋プロンプト＋UI)**: `scripts/growth/bodyComment.ts` に `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`OVERALL_COMMENT_MAX_BLOCKS` を追加し、`buildBodyCommentRequestProps` を「`BodyCommentRequest`(`{comments,overall}`)を受ける」形へ拡張(旧形＝配列 JSON 読み出し互換)。`body-comment/route.ts` を overall/comments 単独受理へ分岐。`comment-revise-cli.ts` の `next` を `parseBodyCommentRequest` で正規化。`comment-revise.md` に全体コメントモードを追記。`useBodyCommentConsult.ts` に `overallDraft`/`requestOverall`＋排他、`CommentableBody.tsx` に全体コメント欄。既存の行コメント安全機構(excerpt アンカー・before 照合)は不変。

**Tech Stack:** TypeScript strict / `import type` / `any` 禁止 / zod 検証 / Vitest(node 環境の純ロジック・route、jsdom 環境のフック renderHook)/ Next.js 16 App Router(route は `runtime="nodejs"`)/ React(state リセットは「描画中に是正」パターン。ただし `useReviseEditing` のみ既存が `useEffect([openId])` リセットなのでそれに合わせる)。

**前提条件(タスクにしない):**
- 新 Notion プロパティは追加しない。F3 の全体コメントは既存 `本文コメント指示`(`BODY_COMMENT_PROPS.request`)の JSON に相乗りさせる(オブジェクト JSON 化)。
- 在庫の旧形依頼行(配列 JSON)は `parseBodyCommentRequest` の読み替えで落とさない(欠落耐性)。**本計画のコードは新旧どちらの依頼形でも全テストが green になる**。
- `run.mjs` のループ(`comment-revise-loop`/`revise-loop`/`apply` 等)・present サブコマンド・反映(applyX)・SI1 学習ログ基盤は**触らない**(全機能とも既存経路に自然に乗る)。

**タスク分割の判断(1-2 行):** 影響範囲の小さい順に F1→F2→F3。各機能内は TDD で純ロジック→フック/route→UI 配線→プロンプトの順に固める。F3 はスキーマ(T4)を先に固め、それを消費する route(T5)・CLI/プロンプト(T6)・UI(T7)を積む。最後に全体検証(T8)。

## Global Constraints

- **TDD 必須**(Red → Green → Refactor)。実装より先に失敗するテストを書く。各コードタスクの Steps に Red→Green→コミットを明示する。
- **カバレッジ 100% ゲート**。純ロジック(`advise-apply.ts` の `selectableAdoptIndexes`/`MAX_ADOPTED`・`revise.ts` の `OUTLINE_OVERALL_LINE`・`bodyComment.ts` の `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`buildBodyCommentRequestProps`/`OVERALL_COMMENT_MAX_BLOCKS`)は 100%。**CLI・route 薄層・UI コンポーネント配線はカバレッジ除外(既存方針・現物確認済み)**:
  - `vitest.config.ts` の `coverage.exclude` に `scripts/growth/comment-revise-cli.ts`・`scripts/growth/advise-cli.ts`・`scripts/growth/revise-cli.ts` 等の CLI 群、および `src/app/growth/approve/consult/AdviceResultBody.tsx`・`SentenceFixBody.tsx`・`CommentableBody.tsx`・`ConsultComposer.tsx` が既に入っている(UI 薄結線)。
  - route(`src/app/api/growth/**/route.ts`)は exclude リストに無いが、既存の `route.test.ts` があり分岐は route test で担保する(F3 は新分岐の最小ケースを追加)。
  - フック(`useAdviceConsult.ts`/`useReviseEditing.ts`/`useBodyCommentConsult.ts`)は exclude リストに無い。既存テストがあり(`useReviseEditing.test.ts` のみ**新規作成**)、追加分岐は renderHook で担保する。
- **TS strict / `any` 禁止**(外部入力は `unknown`+narrowing)/ `import type` で型のみ import / boolean は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止(最後の手段のみ `@ts-expect-error`+理由)。
- **純ロジック分離を維持する**。全選択 index 導出(F1)・予約語(F2)・スキーマと正規化(F3)は `scripts/growth/*.ts` に集約し、`src/lib/growth/*` の既存再エクスポート(`export * from "../../../scripts/growth/…"`)経由で Web 層が使う。UI/route/CLI はそれを呼ぶだけ(重複実装しない)。
- **pull 型・present 方式不変**: AI は案まで(採用候補・構成案案・before/after 案)。反映は必ず人間(承認画面の「反映」)。3機能とも自動反映しない。
- **単独依頼(併用不可)**: 全体指示/コメントは個別指示と同時に submit しない(F2 全体 XOR セクション・F3 全体 XOR 行)。UI 排他＋送信/サーバ側の二重防御。データ構造(F3 `{comments,overall}`)は将来の併用を妨げない形にするが、併用 UI/挙動は本計画非スコープ。
- **書き込み API のガード維持**: `verifyToken`(`APPROVE_AUTH_ENABLED` gate)＋`articleEditGuard`(#H9)＋busy 409＋`growthApiError` 経路を全機能で維持。強権キー(`MICROCMS_MANAGEMENT_API_KEY`)は使わない(書き込み先は Notion のみ)。
- **欠落耐性・沈黙させない**: 旧形依頼(F3 配列 JSON)も落とさず読む。失敗は既存の fail＋LINE 通知で可視化。
- **正典・facility-context 不可侵**: 記事内容ルール・確定事実は触らない。F2/F3 のプロンプト追記は「入力(全体スコープ)の解釈」の1〜2文に限る。
- **無人 push/commit 禁止**。push 時のみ `ttmakhr1028ai-art`(本計画は push しない)。コミット・説明・ドキュメントは日本語。Conventional Commits。

---

## T1: F1 純ロジック — `MAX_ADOPTED` の export 化 + `selectableAdoptIndexes`(TDD)+ route 置換

**[実装者: Codex]**

**Files:**
- Modify: `scripts/growth/advise-apply.ts`(`export const MAX_ADOPTED = 20;` 新設・`selectableAdoptIndexes` 追加)
- Modify: `scripts/growth/advise-apply.test.ts`(`selectableAdoptIndexes` の純ロジックテストを追加・100%)
- Modify: `src/app/api/growth/advise/apply/route.ts`(private `const MAX_ADOPTED = 20;` を新 export の import に置換)

**Interfaces(Produces):**

```ts
// scripts/growth/advise-apply.ts に追加
/** 一度に採用できる fix の上限(濫用・巨大ペイロード防止)。route と UI で共有する単一ソース。 */
export const MAX_ADOPTED = 20;

/** 全選択で採用する fix index を決定的に返す。classifications と同順。
 *  applicable な index を出現順に集め、max 件でクランプする(超過は先頭優先で切る)。 */
export function selectableAdoptIndexes(
  classifications: readonly { applicable: boolean }[],
  max: number
): number[];
```

**Consumes(現物確認済み):**
- `scripts/growth/advise-apply.ts` 既存: `classifyFix`/`selectApplicableFixes`/`FixClassification`(`{ applicable: true; quote; blockIndex } | { applicable: false; reason }`)。`MAX_APPLY_ITEMS = 20`(L143・**反映案の zod 上限**。採用件数の `MAX_ADOPTED` とは意味が別=統合しない・両方残す)。
- `src/app/api/growth/advise/apply/route.ts` L31: `const MAX_ADOPTED = 20;`(route 内 private)。使用箇所は `parseAdoptedIndexes`(L44-54)の `if (out.length === 0 || out.length > MAX_ADOPTED) return null;`(L52)のみ。
- `src/lib/growth/adviseApply.ts` は `export * from "../../../scripts/growth/advise-apply";`(1行・既存)。UI は `@/lib/growth/adviseApply` から `MAX_ADOPTED`/`selectableAdoptIndexes` を import できる。

**実装詳細(§3.4/§3.5・決定的純ロジック・LLM 非依存):**

`selectableAdoptIndexes(classifications, max)`:
1. `if (max <= 0) return [];`。
2. `classifications` を `forEach` で走査し、`c.applicable === true` の index を**出現順**に集める。
3. 集めた配列を `slice(0, max)` で**先頭から max 件**に切って返す(超過時のみ切れる)。
4. immutable(新しい配列を返す・入力を変更しない)。

`MAX_ADOPTED`:
- `advise-apply.ts` に `export const MAX_ADOPTED = 20;` を新設(値は route の現行 private 定数と同一)。
- route は `import { …, MAX_ADOPTED, … } from "@/lib/growth/adviseApply";` を足し、L31 の private 定数を削除する。`parseAdoptedIndexes` 内の `MAX_ADOPTED` 参照はそのまま(import 名が同一なので挙動不変)。

**受け入れ挙動(§3.6):**
- `selectableAdoptIndexes` は applicable が飛び飛びに並ぶとき applicable な index だけを出現順に返す。
- applicable が `max` を超えるとき先頭から `max` 件に切る。
- applicable が0件なら空配列。`max<=0` なら空配列。
- ちょうど `max` 件のときはクランプが起きない(全件返る)。
- route は `MAX_ADOPTED` を純ロジックから import しても既存の 400 判定(採用件数超過で `parseAdoptedIndexes` が null)が不変。

**テストケース一覧(`advise-apply.test.ts` に `describe("selectableAdoptIndexes")` を追加):**
- applicable が飛び飛び(`[{applicable:true},{applicable:false},{applicable:true},{applicable:false},{applicable:true}]`・`max=20`)→ `[0,2,4]`。
- 全件 applicable が `max` 超過(`applicable:true` を 25 件・`max=20`)→ 先頭 20 件 `[0,1,…,19]`(`length===20`・末尾が 19)。
- 全件 non-applicable → `[]`。
- 空配列 → `[]`。
- `max=0`(applicable が2件あっても)→ `[]`。負数 `max=-1` → `[]`。
- ちょうど境界(applicable ちょうど 20 件・`max=20`)→ 20 件そのまま(クランプ無し・`length===20`)。
- `MAX_ADOPTED === 20` を1ケースで固定(回帰)。

**参照イディオム:** `advise-apply.test.ts` の既存 `describe`(ファイル冒頭に `// @vitest-environment node` 既存=そのまま)。既存 `selectApplicableFixes` のテストに倣った配列アサーション(`expect(...).toEqual([...])`)。

**Steps:**
- [ ] `advise-apply.test.ts` に `selectableAdoptIndexes` の7ケース＋`MAX_ADOPTED` 固定を書く → RED(`npx vitest run scripts/growth/advise-apply.test.ts`)
- [ ] `advise-apply.ts` に `export const MAX_ADOPTED = 20;`＋`selectableAdoptIndexes` を実装 → GREEN
- [ ] `advise/apply/route.ts` の private `MAX_ADOPTED`(L31)を削除し、import 群に `MAX_ADOPTED` を足す → `npx tsc --noEmit` 0・`npx vitest run src/app/api/growth/advise/apply/route.test.ts` GREEN(既存回帰)
- [ ] コミット案 `feat(growth): 全選択採用の純ロジック selectableAdoptIndexes を追加し MAX_ADOPTED を単一ソース化`

---

## T2: F1 フック+UI — `setAdoptedBulk`(TDD)+ `AdviceResultBody` の全選択トグル行

**[実装者: Codex]**

**Files:**
- Modify: `src/app/growth/approve/hooks/useAdviceConsult.ts`(`setAdoptedBulk` を追加・返り値に足す)
- Modify: `src/app/growth/approve/hooks/useAdviceConsult.test.ts`(`setAdoptedBulk` の分岐を追加)
- Modify: `src/app/growth/approve/consult/AdviceResultBody.tsx`(全選択/全解除トグル行＋クランプ補足・カバレッジ除外の薄い UI)

**Interfaces(Produces):**

```ts
// useAdviceConsult の返り値に追加
setAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;
```

**Consumes(現物確認済み):**
- `useAdviceConsult.ts` L50: `const [adopted, setAdopted] = useState<ReadonlySet<number>>(new Set());`。L90-97 `toggleAdopt`(1件トグル・不変)。L56-60 記事切替リセット(`if (pageId !== prevPageId) { …; setAdopted(new Set()); }`=描画中是正パターン)。返り値オブジェクト L148-160。
- `AdviceResultBody.tsx`: props に `advice`/`adopted: ReadonlySet<number>`/`selectable: boolean`/`classifications: { applicable: boolean; reason?: string }[]`/`onToggleAdopt`。L206-213「直すべき点」見出し行。L214-232 で `advice.fixes.map` を描画。
- `useConsult.ts`(AdviceResultBody の親配線): L154-155 `classifications = adviceFixes.map(f => bodyHtml ? classifyFix(f, bodyHtml) : {applicable:false, reason:FIX_REASON_NO_QUOTE})`。L159-160 `selectable = applyStatus === "なし" && bodyHtml !== "" && classifications.some(c => c.applicable)`。`ConsultCard.tsx` L306-310 が `AdviceResultBody` に `adopted`/`selectable`/`classifications`/`onToggleAdopt` を渡す。

**実装詳細(§3.3・§3.2):**

`setAdoptedBulk(indexes, adopt)`(`useAdviceConsult.ts`・`toggleAdopt` の隣):
```ts
function setAdoptedBulk(indexes: readonly number[], adopt: boolean): void {
  setAdopted((prev) => {
    const next = new Set(prev);
    if (adopt) {
      for (const i of indexes) {
        if (next.size >= MAX_ADOPTED && !next.has(i)) break; // 先頭優先で MAX_ADOPTED にクランプ
        next.add(i);
      }
    } else {
      for (const i of indexes) next.delete(i);
    }
    return next;
  });
}
```
- `import { applyAdviceItems, MAX_ADOPTED, type AdviceApplyView } from "@/lib/growth/adviseApply";`(既存 import 行に `MAX_ADOPTED` を足す)。
- immutable(`new Set(prev)` を作って足し引き・`prev` は変更しない)。`adopt=true` は和集合(既存採用を保持)＋`MAX_ADOPTED` 超過を先頭優先で打ち切り。`adopt=false` は差集合。
- 返り値オブジェクト(L148-160)に `setAdoptedBulk` を足す。`UseAdviceConsultReturn` 型(L20-32)にも `setAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;` を足す。
- 記事切替リセット(L56-60)は不変(全選択状態も `setAdopted(new Set())` で消える)。

`AdviceResultBody.tsx`(§3.2・カバレッジ除外の薄い UI):
- props に `onSetAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;` を足す(handler は on 接頭辞)。
- 内部で `import { selectableAdoptIndexes, MAX_ADOPTED } from "@/lib/growth/adviseApply";`。`const selected = selectableAdoptIndexes(classifications, MAX_ADOPTED);`(自身が持つ `classifications` から算出)。`const allSelected = selected.length > 0 && selected.every((i) => adopted.has(i));`。
- 「直すべき点」見出し行(L206-213)の直下に操作行を追加:
  - **表示条件**: `selectable && selected.length > 0`(反映可能 fix が1件以上)。
  - **要素**: `<button type="button">`。ラベルは `allSelected ? "選択を全て外す" : "反映可能なfixを全て選択"`。`onClick={() => onSetAdoptedBulk(selected, !allSelected)}`。
  - **クランプ補足**: `selectableAdoptIndexes(classifications, Infinity)` 相当の applicable 総数(=`classifications.filter(c => c.applicable).length`)が `MAX_ADOPTED` を超えるときだけ、操作行の右に `<span aria-live="polite">20件まで選択しました</span>`(`MAX_ADOPTED` を埋め込む=`{MAX_ADOPTED}件まで選択しました`)を、`allSelected` かつ超過時に表示する。20件以下なら出さない。
  - `type="button"`。追加の `aria-label` 不要(テキストで自己説明)。既存の個別チェックボックス(`aria-label={修正案N を採用}`・L74-79)は不変。
- `ConsultCard.tsx` L306-310 の `<AdviceResultBody …>` に `onSetAdoptedBulk={onSetAdoptedBulk}` を足し、その値を `useConsult`→`ConsultCard` の props チェーンで `setAdoptedBulk` から流す(`onToggleAdopt` と同じ配線経路)。**この配線はカバレッジ除外の UI 層**。

**受け入れ挙動:**
- `setAdoptedBulk(indexes, true)` は既存採用を保持しつつ和集合で足し、`MAX_ADOPTED` 超過は先頭優先で打ち切る。
- `setAdoptedBulk(indexes, false)` は差集合で除く。
- 記事切替(pageId 変化)で全選択状態も消える。
- 全て採用済みでボタンが「選択を全て外す」表示になり、押下で該当 index が外れる(=`onSetAdoptedBulk(selected, false)`)。
- 選択可能 fix が `MAX_ADOPTED` 超のとき全選択で先頭20件が入り、補足「20件まで選択しました」が出る。

**テストケース一覧(`useAdviceConsult.test.ts` に `describe("setAdoptedBulk")` を追加):**
- 和集合(既存採用を保持): 先に `toggleAdopt(1)`→`setAdoptedBulk([0,2], true)` → `[...adopted]` が `[1,0,2]` を**集合として**含む(順序非依存で `expect(new Set([...adopted])).toEqual(new Set([0,1,2]))`)。
- 差集合: `setAdoptedBulk([0,1,2,3], true)` の後 `setAdoptedBulk([1,3], false)` → 残りが `{0,2}`。
- `MAX_ADOPTED` 超過クランプ: `setAdoptedBulk(Array.from({length: 25}, (_, i) => i), true)` → `adopted.size === 20`(先頭 0..19)。
- 記事切替リセット: `setAdoptedBulk([0,1], true)` の後 `rerender({ pageId: "page-B" })` → `adopted` が空集合(既存の pageId リセットテストに準じた `renderHook` initialProps 形)。
- **UI 配線(カバレッジ除外)**: `AdviceResultBody` のトグル行描画・ラベル切替・クランプ補足はテスト最小(RTL で「全選択ボタン押下 → `onSetAdoptedBulk` が `selected` と `true` で呼ばれる」「全選択済みで『選択を全て外す』表示になり `false` で呼ばれる」の1〜2ケースを `AdviceResultBody` 用に**新規作成する co-located テストは作らない**=既存方針どおり UI は最小確認とし、フック側で挙動を固定する。UI の目視確認はレビュー時に行う)。

**参照イディオム:** `useAdviceConsult.test.ts` の既存 `describe("toggleAdopt")`(L125-133)・`describe("pageId 変化での state リセット")`(L135-166・`renderHook` initialProps 形)・`act(() => view.result.current.xxx())`。

**Steps:**
- [ ] `useAdviceConsult.test.ts` に `setAdoptedBulk` の4ケースを書く → RED(`npx vitest run src/app/growth/approve/hooks/useAdviceConsult.test.ts`)
- [ ] `useAdviceConsult.ts` に `setAdoptedBulk`＋型＋返り値を実装 → GREEN
- [ ] `AdviceResultBody.tsx` に `onSetAdoptedBulk` prop＋トグル行＋クランプ補足、`ConsultCard.tsx` へ配線 → `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): アドバイス提示に反映可能fixの一括採用/解除トグルを追加`

---

## T3: F2 構成案の全体指示(`OUTLINE_OVERALL_LINE` + フック + UI + プロンプト)

**[実装者: Codex]**

**Files:**
- Modify: `scripts/growth/revise.ts`(`export const OUTLINE_OVERALL_LINE = "記事全体";` を新設)
- Modify: `scripts/growth/revise.test.ts`(予約語擬似コメントの serialize/parse 回帰＋定数固定)
- Modify: `src/app/growth/approve/hooks/useReviseEditing.ts`(`outlineOverallPrompt` state＋`requestRevise` 合成分岐＋リセット)
- Create: `src/app/growth/approve/hooks/useReviseEditing.test.ts`(**新規**・requestRevise 合成/リセットを renderHook で固定)
- Modify: `src/app/growth/approve/ReviseCommentForm.tsx`(全体指示 textarea＋排他ガード＋ボタン活性条件)
- Modify: `src/app/growth/approve/consult/ConsultComposer.tsx`(`ReviseComposer` から全体指示 state/handler を配線)
- Modify: `scripts/growth/prompts/revise-outline.md`(擬似コメント解釈＋予約語禁止の追記)

**Interfaces(Produces):**

```ts
// scripts/growth/revise.ts に追加
/** 構成案全体への指示を表す予約 line。UI と revise-outline.md が単一ソースとして参照する。 */
export const OUTLINE_OVERALL_LINE = "記事全体";
```

**Consumes(現物確認済み):**
- `scripts/growth/revise.ts`: `ReviseComment { line: string; comment: string }`(L47-50)。`serializeReviseInstructions`(L60-73)・`parseReviseInstructions`(L79-97)は `line` を「非空文字列」でのみ検証(`isNonEmptyString`・L52-54)。予約語 `記事全体` はこの制約を満たすので**スキーマ変更なしで通る**。`src/lib/growth/revise.ts` は `export * from "../../../scripts/growth/revise";`(既存)。
- `useReviseEditing.ts`: L29 `draftComments: Record<number, string[]>`。L42 `titleRevisePrompt`(タイトル指示・別レーン)。L67-77 `useEffect([openId])` で全 state をリセット(**このフックはリセットに `useEffect` を使う**=`useAdviceConsult` の描画中是正とは別。追加 state も `useEffect` リセットに足す)。L80-106 `requestRevise`(L82-84 でセクション展開 `sections.flatMap((section,i) => (draftComments[i] ?? []).map(c => ({ line: section.heading, comment: c })))`・L85 `titleInstruction`・L90-94 `reviseMutation.mutateAsync({ pageId, comments, ...(titleInstruction ? { titleInstruction } : {}) })`・L99-100 成功時 `setDraftComments({})`/`setTitleRevisePrompt("")`)。返り値 L227-254。
- `ReviseCommentForm.tsx`: props `titlePrompt`/`onTitlePromptChange`/`busy`/`sectionCount`/`commentTotal`/`renderSection`/`onRequestRevise`。L34 `hasTitlePrompt = titlePrompt.trim() !== ""`。L40-53 タイトル指示欄。L54-56 セクション一覧(`renderSection`)。L57-64 依頼ボタン(L60 `disabled={busy || (commentTotal === 0 && !hasTitlePrompt)}`・L63 `修正を依頼{commentTotal > 0 ? \`（コメント${commentTotal}件）\` : ""}`)。
- `ConsultComposer.tsx` `ReviseComposer`(L104-220): `revise` から state/handler を分割代入(L105-128)し `ReviseCommentForm`(L208-217)へ渡す。`total = Object.values(draftComments).reduce(...)`(L187)がセクションコメント合計。

**実装詳細:**

### T3-a. `revise.ts` 予約語定数(§4.2)
- `REVISE_PROPS`/`OUTLINE_PROP` 定義群の近くに `export const OUTLINE_OVERALL_LINE = "記事全体";` を追加。スキーマ・`serializeReviseInstructions`・`parseReviseInstructions`・`buildReviseRequestProps`・PC 読み取りは**一切変えない**。

### T3-b. `useReviseEditing.ts` 合成分岐(§4.4)
- state 追加: `const [outlineOverallPrompt, setOutlineOverallPrompt] = useState("");`(`titleRevisePrompt` の隣)。
- リセット追加: L67-77 の `useEffect([openId])` 内に `setOutlineOverallPrompt("");` を足す。
- `import { OUTLINE_OVERALL_LINE } from "@/lib/growth/revise";`(既存の `../outline` import 群とは別。third-party/internal 順に従い `@/` グループへ)。
- `requestRevise`(L80-106)の `comments` 合成を差し替え:
  ```ts
  const sections = outlineSections(item.outline);
  const overall = outlineOverallPrompt.trim();
  const comments = overall
    ? [{ line: OUTLINE_OVERALL_LINE, comment: overall }]                       // 全体指示 → 全体擬似1件のみ(併用不可)
    : sections.flatMap((section, i) =>
        (draftComments[i] ?? []).map((comment) => ({ line: section.heading, comment })));
  ```
- タイトル指示(`titleInstruction`)の合成・楽観更新(`reviseStatus: "依頼中"`)は不変。成功時クリアに `setOutlineOverallPrompt("");` を足す(L99-100 の隣)。
- 返り値(L227-254)に `outlineOverallPrompt`/`setOutlineOverallPrompt` を足す。

### T3-c. `ReviseCommentForm.tsx` 全体指示欄＋排他(§4.3)
- props 追加: `outlineOverallPrompt: string;`・`onOutlineOverallPromptChange: (value: string) => void;`。
- `const hasOutlineOverallPrompt = outlineOverallPrompt.trim() !== "";`。
- 位置: タイトル指示欄(L40-53)とセクション一覧(L54-56)の**間**に「構成案全体への指示」ブロックを置く:
  - `<label>`「構成案全体への指示（任意）」＋ `<textarea rows={2} maxLength={500}>`。`value={outlineOverallPrompt}`・`onChange`・`disabled={busy || commentTotal > 0}`(セクションコメントが1件でもあるとき無効=排他)。placeholder「導入と結論を対応させ、2章と3章の順序を入れ替えたい」。文字数カウンタ `{outlineOverallPrompt.length} / 500`。
  - `commentTotal > 0` のとき textarea 直下に補足「構成案全体への指示中は、セクション別コメントは送れません（どちらか一方）」…は**逆**(セクションコメントがあるとき全体欄が無効)。正しくは: `commentTotal > 0` なら全体 textarea を `disabled` にし補足「セクション別コメントを送る場合は、構成案全体への指示は使えません（どちらか一方）」を出す。
- セクション別「＋ コメント」の無効化: `hasOutlineOverallPrompt` が true のとき、`renderSection` に渡すセクションが「＋ コメント」を無効化する必要がある。**実装方針(過剰配線を避ける)**: `ReviseCommentForm` は `hasOutlineOverallPrompt` を親(`ReviseComposer`)へ状態として持たせず、`ReviseComposer` 側で `outlineOverallPrompt.trim() !== ""` を算出し、`renderSection`→`Section` の `busy`(または新 prop `commentDisabled`)へ流して「＋ コメント」を無効化する。**Section に新 prop を足さず、既存 `busy` を `reviseBusy || hasOutlineOverallPrompt` で合成して渡す**(コメント追加系ボタンは `busy` で無効化される既存挙動を流用・最小改修)。補足文「構成案全体への指示中は、セクション別コメントは送れません（どちらか一方）」は `ReviseCommentForm` 内で `hasOutlineOverallPrompt` のとき全体欄の下に1行出す。
- ボタン活性条件(L60): `disabled={busy || (commentTotal === 0 && !hasTitlePrompt && !hasOutlineOverallPrompt)}`(全体指示だけでも依頼可能)。ボタン内カウント表示(L63)は不変(`commentTotal > 0` のときだけ `（コメント${commentTotal}件）`・全体指示のみのときはカウント無し)。
- **タイトル指示との併走可**: `hasTitlePrompt` と `hasOutlineOverallPrompt` は排他にしない(タイトルは構成案本文ではないため衝突しない・既存の並走設計を踏襲)。タイトル欄の `disabled` は既存の `busy` のみ(変更しない)。

### T3-d. `ConsultComposer.tsx` `ReviseComposer` 配線
- `revise` の分割代入(L105-128)に `outlineOverallPrompt`/`setOutlineOverallPrompt` を足す。
- `renderSection` に渡す `busy` を `reviseBusy || outlineOverallPrompt.trim() !== ""` で合成する(セクション「＋ コメント」を全体指示中は無効化)。
- `<ReviseCommentForm …>`(L208-217)に `outlineOverallPrompt={outlineOverallPrompt}`・`onOutlineOverallPromptChange={setOutlineOverallPrompt}` を足す。
- **この配線はカバレッジ除外の UI 層**(`ConsultComposer.tsx` は exclude 済み)。

### T3-e. `revise-outline.md` 追記(§4.6・確定文)
- 手順3「構成案」(L28-30)の `- **構成案**:` 行の直後に1文追加(変更後・確定):
  > `instructions` のうち、**`line` が `記事全体` のコメントは特定セクションではなく構成案全体への指示**として扱う(順序の入れ替え・章立ての再構成・導入と結論の対応づけ 等)。それ以外の `line` は該当見出しへのコメントとして扱う。全体指示は単独で届く(セクション別コメントとは同時に来ない)。
- 「禁止」節(L43-46)に1行追加(変更後・確定):
  > - 構成案の見出しに予約語 `記事全体` を使わない(全体指示コメントと区別できなくなるため)。
- これ以外の手順(stale 回収・next・タイトル・present/fail・出力は見出しアウトラインのみ)は不変。

**受け入れ挙動(§4.7):**
- 全体指示のみで依頼でき、送信 comments が `[{ line: "記事全体", comment }]` 1件(セクションコメントを含めない)。
- 全体指示が空 → 従来どおりセクション展開。
- 全体指示のみでも `requestRevise` が発火する(ボタン活性)。
- `openId` 変化で `outlineOverallPrompt` がリセットされる。
- 全体指示入力中はセクション「＋ コメント」無効／セクションコメントありのとき全体指示 textarea 無効(先入力優先)。タイトル指示とは併走可。
- `serializeReviseInstructions([{line:"記事全体", comment}])`/`parseReviseInstructions` が予約語で素通り(スキーマ不変の回帰固定)。

**テストケース一覧:**
- **`revise.test.ts`(既存に追加)**:
  - `OUTLINE_OVERALL_LINE === "記事全体"`(定数固定)。
  - `serializeReviseInstructions([{ line: OUTLINE_OVERALL_LINE, comment: "順序を入れ替えたい" }])` が `JSON.stringify([{ line: "記事全体", comment: "順序を入れ替えたい" }])` に等しい。
  - `parseReviseInstructions(その JSON)` が `[{ line: "記事全体", comment: "順序を入れ替えたい" }]` に復元される(予約語で throw しない回帰固定)。
- **`useReviseEditing.test.ts`(新規作成)**: `renderHook` で `useReviseEditing({ token, openId, setBoardData })` を回す。`reviseMutation` の POST は `postRevise` を `vi.mock("../api")` でモックし、送信 body を捕捉する。`item: PendingItem`(最小: `{ id, outline: "## 見出しA\n説明A\n## 見出しB\n説明B", reviseStatus: "なし", … }`。`outlineSections` が2セクションを返す形)。QueryClientProvider が必要なら `@tanstack/react-query` の `QueryClientProvider` を wrapper で包む(既存フックテストの作法に合わせる。無ければ最小 `QueryClient` を new して wrapper 化)。
  - 全体指示が非空 → `setOutlineOverallPrompt("全体を直す")`→`requestRevise(item)` → `postRevise` の第2引数の `comments` が `[{ line: "記事全体", comment: "全体を直す" }]` 1件のみ(セクションコメントを含まない)。
  - 全体指示が空・セクションコメントあり → 従来どおりセクション展開(`draftComments` を `saveComment` 等で1件入れてから `requestRevise` → `comments` が `[{ line: 見出し, comment }]`)。
  - 全体指示のみでも `requestRevise` が `postRevise` を呼ぶ(ボタン活性=フックが到達する)。
  - `openId` 変化(`rerender({ openId: "other" })`)で `outlineOverallPrompt` が `""` にリセットされる。
  - 成功時に `outlineOverallPrompt` が `""` にクリアされる。
- **UI 排他(`ReviseCommentForm`)**: カバレッジ除外の薄い UI のため最小(全体指示入力中はセクション「＋コメント」無効・セクションコメントありのとき全体指示 textarea 無効、の1〜2ケースを RTL で確認するのは任意=レビュー目視で足りる。フック側で送信の正しさは担保済み)。

**参照イディオム:** `revise.test.ts`(node 環境・既存 `serializeReviseInstructions`/`parseReviseInstructions` テスト L42-97)。`useAdviceConsult.test.ts`(renderHook・`vi.stubGlobal("fetch")`・`act`)を `useReviseEditing.test.ts` の下敷きにする(ただし `useReviseEditing` は `useMutation` を使うので `postRevise` の `vi.mock("../api", …)` でモックし、`QueryClientProvider` wrapper が要る)。

**Steps:**
- [ ] `revise.test.ts` に予約語 serialize/parse＋定数固定を書く → RED(`npx vitest run scripts/growth/revise.test.ts`)
- [ ] `revise.ts` に `OUTLINE_OVERALL_LINE` を実装 → GREEN
- [ ] `useReviseEditing.test.ts`(新規)を書く → RED(`npx vitest run src/app/growth/approve/hooks/useReviseEditing.test.ts`)
- [ ] `useReviseEditing.ts` に `outlineOverallPrompt` state＋合成分岐＋リセット＋返り値 → GREEN
- [ ] `ReviseCommentForm.tsx` に全体指示欄＋排他＋活性条件、`ConsultComposer.tsx` へ配線 → `npx tsc --noEmit` 0
- [ ] `revise-outline.md` に擬似コメント解釈＋予約語禁止を追記
- [ ] コミット案 `feat(growth): 構成案revise相談に全体指示欄を追加（予約語 記事全体 の擬似コメントで既存ループへ）`

---

## T4: F3 純ロジック — `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`OVERALL_COMMENT_MAX_BLOCKS` + `buildBodyCommentRequestProps` 拡張(TDD・旧形互換)

**[実装者: Codex]**

**Files:**
- Modify: `scripts/growth/bodyComment.ts`(スキーマ・正規化・定数の追加＋`buildBodyCommentRequestProps` の新スキーマ対応)
- Modify: `scripts/growth/bodyComment.test.ts`(新スキーマ・正規化・旧形互換・定数固定を追加・100%)
- Modify: `src/app/api/growth/body-comment/route.ts`(L76 の引数だけ `{ comments: anchored }` へ即時追従して tsc を通す。overall 分岐は T5)
- Modify: `src/app/api/growth/body-comment/route.ts`(L76 の引数だけ `{ comments: anchored }` へ即時追従・overall 分岐は T5)

**Interfaces(Produces):**

```ts
// scripts/growth/bodyComment.ts に追加
export const BodyCommentRequestSchema: z.ZodType<{ comments: BodyComment[]; overall?: string }>;
export type BodyCommentRequest = z.infer<typeof BodyCommentRequestSchema>;

/** 依頼プロパティの生 JSON を BodyCommentRequest へ正規化する(旧形＝配列 JSON 互換)。
 *  壊れていれば {comments:[], overall:undefined}(安全側)。 */
export function parseBodyCommentRequest(raw: string): BodyCommentRequest;

/** 全体コメント1件から提示するブロックの上限(プロンプト参照の単一ソース)。 */
export const OVERALL_COMMENT_MAX_BLOCKS = 10;
```

**Consumes(現物確認済み):**
- `bodyComment.ts`: `BodyCommentSchema`(L111-116・`{ blockIndex, excerpt, comment }`)。`BodyComment` 型(L116)。`MAX_BODY_COMMENTS = 50`(L119)。`BodyCommentsSchema = z.array(BodyCommentSchema).min(1).max(MAX_BODY_COMMENTS)`(L121)。`chunkRichText`(from `./notion`)。既存 `buildBodyCommentRequestProps(comments: readonly BodyComment[], nowIso: string)`(L257-268・内部で `serializeBodyComments(comments)` を `本文コメント指示` に書く)。`BODY_COMMENT_PROPS`(L232-241・`request`/`status`/`result`/`requestedAt`)。
- 既存呼び出し: `body-comment/route.ts` L76 `buildBodyCommentRequestProps(anchored, new Date().toISOString())`。`bodyComment.test.ts` L165 `buildBodyCommentRequestProps([c], "2026-06-25T00:00:00.000Z")`。**この2箇所が呼び出し元**=T4 で `buildBodyCommentRequestProps` の引数形を変えるなら route(T5)とテストを同時に追従させる。**方針(後方互換で改修を最小化)**: `buildBodyCommentRequestProps` を**オーバーロードにせず、引数を `BodyCommentRequest`(`{ comments?, overall? }`)を受ける形に変える**。ただし route(T5)は `{ comments: anchored }` か `{ overall }` を渡すので、既存の `[c]`(配列直渡し)呼び出しは T4 のテスト更新で `{ comments: [c] }` へ書き換える。

**実装詳細(§5.2/§5.6):**

### スキーマ
```ts
export const BodyCommentRequestSchema = z.object({
  comments: z.array(BodyCommentSchema).max(MAX_BODY_COMMENTS).default([]),
  overall: z.string().min(1).max(2000).optional(),
});
export type BodyCommentRequest = z.infer<typeof BodyCommentRequestSchema>;

export const OVERALL_COMMENT_MAX_BLOCKS = 10;
```
- **不変**: `BodyComment`/`BodyCommentSchema`/`BodyCommentsSchema`/`anchorExists`/`selectAnchoredComments`/`BodyCommentProposalItemSchema`/`applyBodyCommentProposal`/`MAX_BODY_COMMENTS` は変えない(行コメントの安全機構を維持)。

### `parseBodyCommentRequest`(旧形互換・§5.2)
```ts
export function parseBodyCommentRequest(raw: string): BodyCommentRequest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { comments: [], overall: undefined };
  }
  if (Array.isArray(data)) {
    // 旧形: BodyComment[] が直に入っている → {comments: 配列(検証済み), overall: undefined}
    const arr = z.array(BodyCommentSchema).max(MAX_BODY_COMMENTS).safeParse(data);
    return { comments: arr.success ? arr.data : [], overall: undefined };
  }
  const obj = BodyCommentRequestSchema.safeParse(data);
  return obj.success ? obj.data : { comments: [], overall: undefined };
}
```
- 旧形の配列 JSON → `{comments: 配列, overall: undefined}` に読み替え(在庫の旧依頼行を落とさない=移行耐性)。
- オブジェクト JSON → `BodyCommentRequestSchema.safeParse`。
- 壊れた JSON / スキーマ不一致 → `{comments: [], overall: undefined}`(安全側)。

### `buildBodyCommentRequestProps` 拡張(§5.4)
```ts
export function buildBodyCommentRequestProps(
  request: BodyCommentRequest,
  nowIso: string
): Record<string, unknown> {
  const requested: BodyCommentStatus = "依頼中";
  const normalized = BodyCommentRequestSchema.parse(request); // 不正は throw(沈黙させない)
  const json = JSON.stringify({
    comments: normalized.comments,
    ...(normalized.overall ? { overall: normalized.overall } : {}),
  });
  return {
    [BODY_COMMENT_PROPS.request]: { rich_text: chunkRichText(json) },
    [BODY_COMMENT_PROPS.result]: { rich_text: [] },
    [BODY_COMMENT_PROPS.status]: { select: { name: requested } },
    [BODY_COMMENT_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}
```
- 単独依頼なので `{ comments: [...] }` か `{ overall: "..." }` のどちらかを受ける(両方同時は route が 400 で防ぐ・§5.3)。`本文コメント指示` にオブジェクト JSON を書く。ステータス=依頼中・依頼時刻は同一 PATCH。

**受け入れ挙動(§5.9):**
- `BodyCommentRequestSchema`: `{comments:[...]}` のみ・`{overall:"..."}` のみ・両方・`overall` 空文字(min1 で reject)・`comments` 50件超過(reject)を正しく判定。
- `parseBodyCommentRequest`: 旧形(配列 JSON)→ `{comments:配列, overall:undefined}`・オブジェクト JSON → そのまま・壊れた JSON → `{comments:[], overall:undefined}`・overall のみ。
- `buildBodyCommentRequestProps({overall})`/`({comments})`: `本文コメント指示` にオブジェクト JSON・ステータス=依頼中・依頼時刻が同一 props。
- `OVERALL_COMMENT_MAX_BLOCKS === 10`。

**テストケース一覧(`bodyComment.test.ts` に追加):**
- `describe("BodyCommentRequestSchema")`:
  - `{ comments: [有効なBodyComment] }` → success。
  - `{ overall: "全体にヘッジが多い" }` → success(`comments` は default `[]`)。
  - `{ comments: [...], overall: "..." }`(両方)→ success(スキーマは併用を妨げない=将来の併用余地)。
  - `{ overall: "" }` → reject(min1)。
  - `{ comments: 51件 }` → reject(max)。
- `describe("parseBodyCommentRequest")`:
  - 旧形配列 JSON `JSON.stringify([{blockIndex:0,excerpt:"x。",comment:"y"}])` → `{ comments: [その1件], overall: undefined }`。
  - オブジェクト JSON `JSON.stringify({comments:[…],overall:"z"})` → そのまま復元。
  - overall のみ `JSON.stringify({overall:"z"})` → `{ comments: [], overall: "z" }`。
  - 壊れた JSON `"{壊"` → `{ comments: [], overall: undefined }`。
  - スキーマ不一致(`JSON.stringify({comments:[{blockIndex:-1}]})`)→ `{ comments: [], overall: undefined }`。
- `describe("buildBodyCommentRequestProps")`:
  - `{ overall: "全体コメント" }` → `本文コメント指示` の rich_text plain が `{"comments":[],"overall":"全体コメント"}` を含む・`本文コメントステータス` select が「依頼中」・`本文コメント依頼時刻` date.start が渡した iso。
  - `{ comments: [c] }` → `本文コメント指示` が `{"comments":[…]}` を含み `overall` キーを持たない。ステータス=依頼中。
  - **旧テスト L165 の書き換え**: `buildBodyCommentRequestProps([c], iso)` → `buildBodyCommentRequestProps({ comments: [c] }, iso)` に更新し、既存アサーションが green(依頼中・依頼時刻・request にコメント JSON)。
- `it("OVERALL_COMMENT_MAX_BLOCKS は 10")` → `expect(OVERALL_COMMENT_MAX_BLOCKS).toBe(10)`。

**参照イディオム:** `bodyComment.test.ts`(node 環境・`page()` ヘルパ・既存 `buildBodyCommentRequestProps` テスト L163-… の rich_text 検証)。既存 `parseBodyComments`(L124-131)の safeParse＋空配列フォールバック。

**Steps:**
- [ ] `bodyComment.test.ts` にスキーマ・正規化・build・定数の各ケースを書き、旧 L165 呼び出しを `{comments:[c]}` へ更新 → RED(`npx vitest run scripts/growth/bodyComment.test.ts`)
- [ ] `bodyComment.ts` に `BodyCommentRequestSchema`/`parseBodyCommentRequest`/`OVERALL_COMMENT_MAX_BLOCKS`＋`buildBodyCommentRequestProps` 拡張を実装 → GREEN
- [ ] `npx tsc --noEmit` 0(route T5 未改修だと `buildBodyCommentRequestProps(anchored, …)` が型エラー → T5 と同一ブランチで直すか、本タスクで route L76 を `{ comments: anchored }` へ即時追従。**推奨: 本タスクで route L76 の引数だけ `{ comments: anchored }` に直し tsc を通す**。route の overall 分岐は T5 で足す)
- [ ] コミット案 `feat(growth): 本文コメント依頼にoverallスキーマと旧形互換の正規化を追加`

---

## T5: F3 route 分岐 — `body-comment/route.ts`(overall/comments 単独・両方400・両方空400)

**[実装者: Codex]**

**Files:**
- Modify: `src/app/api/growth/body-comment/route.ts`(overall/comments のモード分岐)
- Modify: `src/app/api/growth/body-comment/route.test.ts`(overall 単独200・comments 単独200・両方400・両方空400 を追加)

**Consumes(現物確認済み):**
- `body-comment/route.ts`: L51-52 `BodyCommentsSchema.safeParse((body as {comments?}).comments)` → 失敗で 400。L60-62 `articleEditGuard(page)`(#H9)。L63-68 busy 409。L69-73 `selectAnchoredComments`→0件で 400。L74-78 `buildBodyCommentRequestProps(anchored, iso)`。L79-86 `growthApiError`。500(NOTION_TOKEN 欠落・L54-57)。
- `route.test.ts`: `@vitest-environment node`。`vi.mock("@/lib/growth/notion", …)` で `getPage`/`updatePageProps`/`defaultFetch` をモック。`page({ commentStatus?, body? })` ヘルパ。`postReq(token, body, raw?)`。`APPROVE_AUTH_ENABLED` は `flags.authEnabled` で false。`COMMENT = { blockIndex: 0, excerpt: "一文目です。", comment: "やわらかく" }`・`BODY = "<p>一文目です。二文目です。</p>"`。
- T4 の `BodyCommentRequest`・`buildBodyCommentRequestProps({comments}|{overall}, iso)`・`z.string().min(1).max(2000)`(overall の検証は route 内で直接 `z` を使わず、下記のように文字列検証)。

**実装詳細(§5.3):**

`POST` 内、`pageId` 検証(L50)の後を分岐化:
```ts
const rawComments = (body as { comments?: unknown })?.comments;
const rawOverall = (body as { overall?: unknown })?.overall;
const overall = typeof rawOverall === "string" ? rawOverall.trim() : "";
const hasComments = Array.isArray(rawComments) && rawComments.length > 0;

// 併用不可(単独依頼)の二重防御。両方非空は明示 400。
if (overall && hasComments) {
  return badRequest("全体コメントと個別コメントは同時に送れません（どちらか一方）。");
}
if (!overall && !hasComments) {
  return badRequest("コメントを入力してください。");
}
```
その後、既存の `notionOptions()`/`getPage`/`articleEditGuard`/busy 409 を通したうえで:
```ts
if (overall) {
  // 全体コメントモード: アンカー検証は不要(ブロックに紐づかない)。長さは 1..2000。
  if (overall.length > 2000) return badRequest("全体コメントが長すぎます。");
  await updatePageProps(
    pageId,
    buildBodyCommentRequestProps({ comments: [], overall }, new Date().toISOString()),
    options
  );
} else {
  // 行コメントモード(現状のまま): zod → アンカー再検証 → 0件400。
  const parsed = BodyCommentsSchema.safeParse(rawComments);
  if (!parsed.success) return badRequest("コメントを入力してください。");
  const anchored = selectAnchoredComments(parsed.data, draftBodyOf(page));
  if (anchored.length === 0) {
    return badRequest("本文に一致するコメントがありません（本文が変わった可能性・要確認）。");
  }
  await updatePageProps(
    pageId,
    buildBodyCommentRequestProps({ comments: anchored }, new Date().toISOString()),
    options
  );
}
```
- import に `buildBodyCommentRequestProps`(既存)・T4 の型は不要(route はオブジェクトリテラルを渡すだけ)。`BodyCommentsSchema`/`selectAnchoredComments`/`bodyCommentStatusOf`/`BODY_COMMENT_BUSY_STATUSES` は既存 import のまま。
- **併用不可・両方空の 400 は `getPage` 前**(入力検証の fail-fast)。busy 409・articleEditGuard は `getPage` 後(既存位置)。overall のときも `articleEditGuard`・busy を必ず通す(§9)。
- 500(NOTION_TOKEN 欠落)・`growthApiError` 経路は不変。

**受け入れ挙動:**
- overall 単独 → 200＋`buildBodyCommentRequestProps({comments:[],overall})` が `updatePageProps` に渡る(アンカー検証を経ない)。
- comments 単独 → 従来どおり(アンカー検証→依頼中)。
- overall と comments 両方非空 → 400「全体コメントと個別コメントは同時に送れません（どちらか一方）。」。
- 両方空/未指定 → 400「コメントを入力してください。」。
- busy(依頼中/処理中/提示中)→ 409(overall でも)。生成中 → articleEditGuard で 409(#H9・既存)。

**テストケース一覧(`route.test.ts` に追加):**
- overall 単独: `postReq(SECRET, { pageId: PAGE_ID, overall: "全体にヘッジが多い" })`＋`getPage` が `page({ body: BODY })` → 200・`updatePageProps` の第2引数の `本文コメント指示` rich_text plain が `"overall":"全体にヘッジが多い"` を含む・`selectAnchoredComments` を経ない(=body にアンカーしない overall でも 200)。
- comments 単独: 既存の成功テスト(200・アンカー済み)を回帰確認(このタスクで壊れないこと)。
- 両方非空: `postReq(SECRET, { pageId: PAGE_ID, overall: "x", comments: [COMMENT] })` → 400・error に「同時に送れません」を含む・`updatePageProps` 未呼出。
- 両方空: `postReq(SECRET, { pageId: PAGE_ID })`(comments/overall なし)→ 400「コメントを入力してください。」・`updatePageProps` 未呼出。
- overall 単独＋busy: `page({ commentStatus: "提示中", body: BODY })` → 409(overall でも busy を通す)。
- 既存の authGuard(未認証 401)・生成中 409(#H9)・500 は回帰(変更しない)。

**参照イディオム:** `route.test.ts` の既存 `describe("POST /api/growth/body-comment")`・`page()`・`postReq()`・`vi.mocked(getPage).mockResolvedValue(...)`・`vi.mocked(updatePageProps)` のアサーション。

**Steps:**
- [ ] `route.test.ts` に overall 単独/両方400/両方空400/overall+busy を書く → RED(`npx vitest run src/app/api/growth/body-comment/route.test.ts`)
- [ ] `route.ts` に overall/comments 分岐を実装 → GREEN(既存 comments テストも回帰 green)
- [ ] `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): 本文コメントAPIを全体コメント単独受理へ分岐（併用不可の二重防御）`

---

## T6: F3 CLI `next` 正規化 + `comment-revise.md` 全体コメントモード追記

**[実装者: Codex]**

**Files:**
- Modify: `scripts/growth/comment-revise-cli.ts`(`next` を `parseBodyCommentRequest` で正規化し `{pageId,comments,overall,bodyHtml}` を出力)
- Modify: `scripts/growth/prompts/comment-revise.md`(手順2の JSON 説明＋手順3の全体コメントモード追記)

**Consumes(現物確認済み):**
- `comment-revise-cli.ts` `next`(L137-155): `rowsByStatus("依頼中")` → `row = rows[0]`。L144-149 `bodyHtml`/`request` 欠落で fail。L150 `buildBodyCommentProcessingProps()` でロック。L152-154 `process.stdout.write(JSON.stringify({ pageId: row.id, comments: row.request, bodyHtml: row.bodyHtml }))`(現状は `row.request`=生 JSON 文字列を `comments` キーに直入れ)。
- `bodyCommentRowFromPage`(`bodyComment.ts` L365-373)は `request: string`(生 plain)を返す(**変えない**=行の生データはそのまま持ち、解釈は CLI/純ロジックが行う)。
- T4 の `parseBodyCommentRequest(raw): BodyCommentRequest`(`{comments, overall}`)。CLI の import 群(L18-29 `from "./bodyComment"`)に `parseBodyCommentRequest` を足す。
- `comment-revise-cli.ts` は `vitest.config.ts` の `coverage.exclude` に既に入っている(**薄い配線=専用ユニットテスト不要**)。正規化の純ロジック(`parseBodyCommentRequest`)は T4 で 100%。

**実装詳細(§5.4):**

`next` の出力行(L152-154)を差し替え:
```ts
const parsed = parseBodyCommentRequest(row.request);
const payload: { pageId: string; comments: BodyComment[]; overall?: string; bodyHtml: string } = {
  pageId: row.id,
  comments: parsed.comments,
  bodyHtml: row.bodyHtml,
};
if (parsed.overall) payload.overall = parsed.overall;
process.stdout.write(`${JSON.stringify(payload)}\n`);
```
- `import type { BodyComment } from "./bodyComment";`(型のみ・既存の import 群に `import type` で)。`parseBodyCommentRequest` を値 import に足す。
- 欠落判定(L144-149)は `!row.bodyHtml || !row.request` のまま。ただし旧形/新形どちらでも `parseBodyCommentRequest` は落ちない(comments 空・overall 無しでも `{comments:[],overall:undefined}` を返す)。**行が全体コメント単独のとき `comments` は空配列になる**が、`overall` が非空なので claude は全体モードで処理できる。`row.request` 自体は非空(オブジェクト JSON)なので L144 の欠落 fail には掛からない。
- present サブコマンド(L157-…)・fail・reap は**不変**(proposal JSON を受けるだけ・全体由来か行由来かを区別しない)。

`comment-revise.md` 追記(§5.7・確定文):
- **手順2 の JSON 説明**(L16-20)を差し替え(変更後):
  > - `{"pageId","comments","overall","bodyHtml"}` が返ったら、その行は既に「処理中」にロック済み。
  >   - `comments` = 投稿コメントの JSON 配列(`{blockIndex, excerpt, comment}` の配列。**空のこともある**)。`excerpt` = コメント対象の文、`comment` = その文への指摘。
  >   - `overall` = **本文全体へのコメント**(空/無いこともある)。**`overall` が非空のときは全体コメントモード**(行コメントは来ない=単独依頼)。
  >   - `bodyHtml` = 現在の下書き本文HTML。
- **手順3 に全体コメントモードの節を追加**(手順3の行コメント節の後・確定文):
  > - **全体コメントモード(`overall` が非空のとき)**: 本文全体を読み、その指摘に**最も影響の大きいブロックから最大10ブロック**を選んで書き換える。各ブロックは行コメントと同じ `{ "commentIndex", "before", "after" }` 形式で出す。
  >   - `commentIndex` は **0 から始まる提示項目の連番**を入れる(全体コメントは配列 index を持たないため)。
  >   - `before` は対象ブロックの現在 HTML を**完全一致**で入れる(照合に使う)。**11 ブロック以上は出さない**(多くても効く 10 に絞る)。
  >   - 事実・数値・固有名詞・確定情報は変えない/未確定情報を足さない(既存の禁止と同じ)。翻訳調・AI 臭(§14)を避ける。
- 手順4(present)・手順5(fail)・禁止節(L44-48)は**不変**(全体でも行でも present/fail は同じコマンド)。

**受け入れ挙動:**
- CLI `next` が `{pageId, comments, overall?, bodyHtml}` を claude に渡す(旧形依頼は `comments` に配列・`overall` 無し。新形の overall 依頼は `comments:[]`＋`overall` 非空)。
- 旧形(配列 JSON)の在庫依頼行も `parseBodyCommentRequest` で `comments` に正しく載る(移行耐性)。
- `comment-revise.md` が overall→最大10ブロック・`commentIndex` 連番を明記。

**テスト方針(カバレッジ除外):**
- `comment-revise-cli.ts` は exclude 済み(専用ユニットテスト不要)。正規化ロジック `parseBodyCommentRequest` は T4 で 100%。
- 動作確認は Steps の `GROWTH_DRYRUN` 相当ではなく、T4 のユニットテストで正規化の正しさを担保する(CLI は薄い配線)。

**Steps:**
- [ ] `comment-revise-cli.ts` の `next` を `parseBodyCommentRequest` 正規化に差し替え → `npx tsc --noEmit` 0
- [ ] `comment-revise.md` の手順2 JSON 説明＋手順3 全体コメントモードを追記
- [ ] コミット案 `feat(growth): comment-revise CLIのnextをoverall正規化し、プロンプトに全体コメントモードを追記`

---

## T7: F3 UI — `useBodyCommentConsult` の overall + `CommentableBody` 全体コメント欄(排他)

**[実装者: Codex]**

**Files:**
- Modify: `src/app/growth/approve/hooks/useBodyCommentConsult.ts`(`overallDraft`/`setOverallDraft`/`requestOverall`＋リセット)
- Modify: `src/app/growth/approve/hooks/useBodyCommentConsult.test.ts`(`requestOverall`＋排他＋リセットを追加)
- Modify: `src/app/growth/approve/consult/CommentableBody.tsx`(全体コメント欄＋排他ガード＋advise 導線注記・カバレッジ除外の薄い UI)

**Interfaces(Produces):**

```ts
// useBodyCommentConsult の返り値に追加
overallDraft: string;
setOverallDraft: (v: string) => void;
requestOverall: () => Promise<void>;
```

**Consumes(現物確認済み):**
- `useBodyCommentConsult.ts`: L58-62 state(`comments`/`openFor`/`draft`/`busy`/`error`)。L67-73 pageId 変化リセット(描画中是正パターン=`if (pageId !== prevPageId) { …; setComments({}); setOpenFor(null); setDraft(""); }`)。L102-111 `buildPayload()`。L113-132 `post(path, payload, fallback): Promise<boolean>`。L134-140 `requestAi`(`{ pageId, comments: payload }`)。返り値 L181-197。
- `CommentableBody.tsx`: L27 `lines = extractReviewLines(bodyHtml)`。L28 `ic = bodyCommentConsult`。L29 `total = ic.buildPayload().length`(行コメント有無判定)。L37-131 行リスト(`lines.map`)。行の「＋」ボタン L49-59(`ic.openComposer(key)`)。L144-154 依頼ボタン(`ic.requestAi()`・`disabled={ic.busy || total === 0}`)。`ConsultComposer.tsx` `SentenceComposer`(L229-231)が `<CommentableBody bodyHtml bodyCommentConsult>` を描画(カバレッジ除外)。
- overall タブ(advise=助言のみ)のラベルは「全体を見てもらう」相当(既存)。全体コメントは「修正案」を作る=区別が要る(§5.8)。

**実装詳細(§5.8):**

### `useBodyCommentConsult.ts`
- state 追加: `const [overallDraft, setOverallDraft] = useState("");`(`draft` の隣)。
- pageId 変化リセット(L68-73)に `setOverallDraft("");` を足す。
- 関数追加:
  ```ts
  async function requestOverall(): Promise<void> {
    const overall = overallDraft.trim();
    if (!overall) return; // 空は no-op
    if (await post("/api/growth/body-comment", { pageId, overall }, "依頼に失敗しました。")) {
      setOverallDraft("");
    }
  }
  ```
- 既存 `requestAi`(行コメント・`{ pageId, comments: payload }`)は不変。route(T5)がモード判定する。
- 返り値(L181-197)に `overallDraft`/`setOverallDraft`/`requestOverall` を足す。型 `UseBodyCommentConsultReturn`(L33-48)にも足す。

### `CommentableBody.tsx`(§5.8・カバレッジ除外の薄い UI)
- 行リスト(L31-132 の外側 `<div>` 内、`lines.map` の**上**)に「本文全体へのコメント」ブロックを置く:
  - `<label>`「本文全体へのコメント」＋ `<textarea rows={2} maxLength={2000}>`。`value={ic.overallDraft}`・`onChange={(e) => ic.setOverallDraft(e.target.value)}`・`disabled={ic.busy || total > 0}`(行コメントが1件でもあるとき無効=排他)。placeholder「例：全体にヘッジが多い。言い切る文体に寄せたい」。文字数カウンタ `{ic.overallDraft.length} / 2000`。
  - 送信ボタン: `<button type="button" onClick={() => void ic.requestOverall()} disabled={ic.busy || ic.overallDraft.trim() === ""}>`「全体コメントで修正を依頼」。
  - **ラベル衝突回避(§5.8 確定)**: 全体コメント欄の直下に補足1行「※採点や助言だけが欲しいときは『全体を見てもらう』タブへ」(advise=助言のみ・本文は書き換えない、との違いを導線で示す)。「見てもらう」という語は全体コメント欄には使わない。
  - **排他補足**: `total > 0` のとき textarea 直下に「本文全体へのコメント中は、行コメントは送れません（どちらか一方）」…は**逆**。正しくは: `total > 0`(行コメントあり)のとき全体 textarea を `disabled` にし補足「行コメントを送る場合は、本文全体へのコメントは使えません（どちらか一方）」を出す。
- 行コメント側の排他: 全体コメント欄が非空(`ic.overallDraft.trim() !== ""`)のとき、各行の「＋」ボタン(L49-59)を無効化し(`disabled={ic.overallDraft.trim() !== ""}` を button に足す)、リスト上部に補足「本文全体へのコメント中は、行コメントは送れません（どちらか一方）」を出す。先に入力した方が優先(両方空のときだけ両方入力可)。
- 既存の行コメント UI(行ごと `openComposer`・行 thread・行依頼ボタン L144-154)は不変。

**受け入れ挙動:**
- `requestOverall` が `overall` を `/api/growth/body-comment` に送る・空で no-op・成功で `overallDraft` クリア。
- `pageId` 変化で `overallDraft` がリセットされる。
- 全体コメント欄が非空のとき行「＋」無効／行コメントありのとき全体 textarea 無効(先入力優先)。
- 提示中(`bodyComment.status === "提示中"`)は既存 `SentenceFixBody`＋`applyNow`(`applyBodyCommentProposal`)で表示・反映(不変)。全体由来でも `BodyCommentProposalItem[]` なので同じ UI が動く。

**テストケース一覧(`useBodyCommentConsult.test.ts` に追加):**
- `requestOverall` が overall を送る: `mockFetch(jsonResponse({ success: true }))`→`act(() => view.result.current.setOverallDraft("全体にヘッジ"))`→`await act(async () => { await view.result.current.requestOverall(); })` → `fetch` が `/api/growth/body-comment` を `{ pageId, overall: "全体にヘッジ" }` で叩き `onChanged` が呼ばれ、`overallDraft` が `""`。
- 空で no-op: `overallDraft` 空のまま `requestOverall()` → `fetch` 未呼出。
- 成功でクリア: 上記1で `overallDraft === ""` を確認。
- `pageId` 変化でリセット: `setOverallDraft("x")`→`rerender({ pageId: "page-B" })` → `overallDraft === ""`(既存の pageId リセットテスト形に準拠)。
- 排他(送信の単独性): 全体と行の同時 submit をしないことは UI 側(disabled)＋route(両方400)で担保。フックでは `requestOverall` が `comments` を送らない/`requestAi` が `overall` を送らないことを、送信 body の形で固定(`requestOverall` の body に `comments` キーが無い・`requestAi` の body に `overall` キーが無い)。
- **UI 排他(`CommentableBody`)**: カバレッジ除外の薄い UI のため最小(レビュー目視で足りる。フック側で送信の単独性は担保済み)。

**参照イディオム:** `useBodyCommentConsult.test.ts`(既存・`renderHook`・`vi.stubGlobal("fetch")`・`mockFetch`/`jsonResponse` ヘルパ・`setup(pageId)`・pageId リセットテスト)。

**Steps:**
- [ ] `useBodyCommentConsult.test.ts` に `requestOverall`＋排他＋リセットの各ケースを書く → RED(`npx vitest run src/app/growth/approve/hooks/useBodyCommentConsult.test.ts`)
- [ ] `useBodyCommentConsult.ts` に `overallDraft`/`setOverallDraft`/`requestOverall`＋リセット＋返り値 → GREEN
- [ ] `CommentableBody.tsx` に全体コメント欄＋排他ガード＋advise 導線注記 → `npx tsc --noEmit` 0
- [ ] コミット案 `feat(growth): 本文相談に全体コメント欄を追加（行コメントと排他・advise導線注記）`

---

## T8: 最終検証(全テスト + カバレッジ + tsc + lint)

**[実装者: Codex]**

**Files:** なし(検証のみ・必要なら T1〜T7 の軽微な追従修正)

**検証内容:**
- **全テスト green**: `npx vitest run`(node/jsdom 双方)。
- **カバレッジ 100%(純ロジック)**: `npx vitest run --coverage` で `scripts/growth/advise-apply.ts`(`selectableAdoptIndexes`/`MAX_ADOPTED`)・`scripts/growth/revise.ts`(`OUTLINE_OVERALL_LINE`)・`scripts/growth/bodyComment.ts`(`BodyCommentRequestSchema`/`parseBodyCommentRequest`/`buildBodyCommentRequestProps`/`OVERALL_COMMENT_MAX_BLOCKS`)が 100%(statements/branches/functions/lines)。CLI・route 薄層・UI 配線は `coverage.exclude`/route.test で担保。
- **型**: `npx tsc --noEmit` 0(strict・`any` 無し・`import type`)。
- **lint**: `npm run lint`(ESLint)0(import 順・命名規約・no-console)。
- **回帰**: 既存の advise-apply/revise/bodyComment/route/フックの全既存テストが green(既存挙動の不変を確認)。
- **プロンプト検証観点(ユニットで測れない・次回相談実行での確認事項として記録)**:
  - F2: `line:記事全体` の全体指示で AI が構成全体(順序・章立て)を直す・見出しに `記事全体` を使わない注記が守られる。
  - F3: overall 1件で AI が影響の大きい最大10ブロックの before/after を提示・全体由来の提示が `SentenceFixBody`＋一括反映で正しく本文へ入る(commentIndex 連番でキー衝突しない)。

**Steps:**
- [ ] `npx vitest run --coverage`(全 green・純ロジック 100%)
- [ ] `npx tsc --noEmit`(0)
- [ ] `npm run lint`(0)
- [ ] プロンプト検証観点を運用メモに残す(次回相談実行で確認)
- [ ] コミット案(必要時のみ) `test(growth): consult-ux拡張の最終検証と軽微な追従修正`

---

## 付録: 予約語・規約の転記(実装者が参照する確定事項)

- **F2 予約語衝突(§4.5)**: `line: "記事全体"` は「セクション見出し名前空間」と「予約語」を共有する。**送信側の規約**: 全体指示は `comments` の先頭1件のみ(§4.2)・セクションコメントは「全体指示欄が空のときだけ」送る(§4.4)→ 送信 comments に `記事全体` が2件以上現れない。**PC 側の規約**(revise-outline.md・T3-e): `line` が `記事全体` のコメントを全体指示として扱う・それ以外は見出しアンカー。**残る境界ケース**(見出し名が実在の `記事全体`): 低頻度・実害小。コード側バリデーションは追加せず(過剰防御回避)、`revise-outline.md` の禁止節に「見出しに予約語 `記事全体` を使わない」を1行足すだけで塞ぐ。
- **F3 commentIndex 規約(§5.5)**: 全体コメントモードでは各 `BodyCommentProposalItem.commentIndex` は `comments` 配列の index ではなく**その依頼内での提示項目の連番(0,1,2,…)**。反映は `before` 照合で決まり `commentIndex` に依存しない(`applyBodyCommentProposal`)ので連番で安全。`commentIndex` の zod 上限は `max(MAX_BODY_COMMENTS)=50`・全体由来の連番は最大10なので上限内(スキーマ変更不要)。`SentenceFixBody` は `key={item.commentIndex}`(L60)で描画するだけ(変更不要)。
- **F3 10件制限(§5.6)**: `OVERALL_COMMENT_MAX_BLOCKS=10` は**プロンプトの上限指示のみ**で担保(コードの10クランプは入れない=過剰防御回避)。present の既存 zod 上限(`max(MAX_BODY_COMMENTS)=50`)がハードガードとして残る。定数はプロンプト文言と将来のコードガード導入時の単一ソースとして新設のみ。
- **SI1 学習ログ(§9)**: F1/F2/F3 の反映は既存 `/api/growth/draft/edit`(`source: "advise-apply"`/`"comment-revise"`・`adoptedAspects`)を通る。全体コメント由来も同じ `source` で保存されるため SI1 の `編集` イベント記録に自然に乗る(新経路・新記録は不要)。
