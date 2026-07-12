# 承認画面プロトタイプ AI往復UI統合 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認画面プロトタイプ(`approve-proto`)の revise/advice/bodyComment の3往復を「AIに相談」1系統(`useConsult` エンジン＋`ConsultDrawer`＋共通 `ConsultCard`)へ統合する。

**Architecture:** ライフサイクル(`requested→presenting→failed`)・失敗・再依頼・apply/dismiss を純関数エンジン `consultEngine.ts`(テスト対象)に一元化し、タイマー/モック生成は薄い `useConsult` フックに包む。UIは右レール型 `ConsultDrawer`(本文は左に残りクリック可)＋共通 `ConsultCard`(待ち/失敗/提示の3分岐)。提示の中身(採点/diff/before-after)は既存ビューから本体だけ抽出して差し込む。入力の起点(本文＋・構成行コメント)は文脈に残し、結果はドロワーに合流する。

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Tailwind v4 / Framer Motion v12 / Vitest + RTL。

## Global Constraints

- 仕様書: `docs/superpowers/specs/2026-04-19...` ではなく `docs/superpowers/specs/2026-06-29-approve-proto-ai-consult-unification-design.md`。
- 対象は `src/app/growth/approve-proto/` のみ。本番ロジック(`scripts/growth/*`・`src/lib/growth/*`・`src/app/[locale]/news/*`)・プレビュールート(`approve-proto/preview/[id]`)には**一切触れない**。
- TypeScript strict。`any` 禁止(代わりに `unknown`＋ナローイング)。型専用 import は `import type`。`React.FC` 禁止(関数宣言＋`XxxProps` interface)。`@ts-ignore` 禁止。
- イミュータブル更新のみ(スプレッドで新オブジェクト。既存配列/オブジェクトを破壊しない)。
- **テスト方針(重要):** Vitest はカバレッジ100%ゲート。istanbul は `all:true` 未設定なので**テストが import したファイルだけ**が計測対象。プロトタイプは現状テスト0でゲート外。本計画で唯一テストするのは純関数 `consultEngine.ts`(import は型専用の `./types` のみ)で、これを100%にする。`useConsult.ts`/`ConsultDrawer.tsx`/`ConsultCard.tsx`/抽出ボディ/`page.tsx` 配線はテストが import しない薄い結線として無計測のまま据え置く(既存リポの「純ロジックは `.ts` でテスト、薄いDOM結線は除外」方針に一致)。`vitest.config.ts` は変更しない。
- `consultEngine.ts` は**型専用 import 以外を持ち込まない**(`reviseMock`/`bodyBlocks` を import するとそれらが計測対象に入り100%要求が波及する。HTML加工が要る処理は薄いフック側に置く)。
- コミットメッセージは Conventional Commits + 末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- `next-env.d.ts`(自動生成)・`node_modules`(symlink)は**絶対にステージしない**。各コミットは対象ファイルを明示 `git add` する。
- push しない(AI アカウント `ttmakhr1028ai-art` 不在のため。ローカルコミットのみ)。
- 検証コマンド: 型 `npx tsc --noEmit -p tsconfig.json`、lint `npx next lint --dir src/app/growth/approve-proto`、テスト `npx vitest run src/app/growth/approve-proto`。

---

## Phase 1 — 型 ＋ 純関数エンジン(TDD)

### Task 1: Consult 型を types.ts に追加

**Files:**
- Modify: `src/app/growth/approve-proto/types.ts`(末尾に追記。既存型は残す)

**Interfaces:**
- Produces: `ConsultKind`, `ConsultStatus`, `ConsultInput`, `ConsultResult`, `Consult`。既存 `Advice`/`ReviseProposal`/`BodyCommentFix`/`BodyComment`/`ReviseTarget`/`OutlineSection` を再利用。

- [ ] **Step 1: 型を追記**

`src/app/growth/approve-proto/types.ts` の末尾(`Toast` の後)に追加:

```ts
/** AI相談(#proto・往復統合)。revise/advice/sentence の3モードを1ライフサイクルへ束ねる。 */
export type ConsultKind = "overall" | "revise" | "sentence";

/** 相談の状態。requested=待ち, presenting=提示中, failed=失敗(再依頼可)。 */
export type ConsultStatus = "requested" | "presenting" | "failed";

/** モード別の入力。kind に対応する1キーだけ入る。 */
export interface ConsultInput {
  /** overall: 任意の「見てほしい点」。 */
  overall?: { focus: string };
  /** revise: 対象ごとの自由文指示(構成案は outline)。 */
  revise?: { title?: string; body?: string; outline?: string };
  /** sentence: 送信時にスナップショットした文ごと注釈。 */
  sentence?: BodyComment[];
}

/** モード別の提示結果。既存の提示型を再利用する。 */
export interface ConsultResult {
  overall?: Advice;
  revise?: ReviseProposal;
  sentence?: BodyCommentFix[];
}

/** 1件の相談(往復1単位)。並行相談を許すため Article は配列で保持する。 */
export interface Consult {
  id: string;
  kind: ConsultKind;
  status: ConsultStatus;
  input: ConsultInput;
  result?: ConsultResult;
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS(既存利用箇所は未変更なのでエラー無し)

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/types.ts
git commit -m "feat(growth): 承認プロト AI相談統合の Consult 型を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: consultEngine — 作成 / upsert / find / remove(TDD)

**Files:**
- Create: `src/app/growth/approve-proto/consultEngine.ts`
- Test: `src/app/growth/approve-proto/consultEngine.test.ts`

**Interfaces:**
- Consumes: `Consult`, `ConsultKind`, `ConsultInput` from `./types`。
- Produces:
  - `createConsult(id: string, kind: ConsultKind, input: ConsultInput): Consult`(status="requested")
  - `upsertConsult(list: Consult[], c: Consult): Consult[]`(同id置換 or 追加。イミュータブル)
  - `findConsult(list: Consult[], id: string): Consult | undefined`
  - `removeConsult(list: Consult[], id: string): Consult[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve-proto/consultEngine.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createConsult,
  findConsult,
  removeConsult,
  upsertConsult,
} from "./consultEngine";
import type { Consult } from "./types";

describe("consultEngine: 基本ライフサイクル", () => {
  it("createConsult は requested 状態の相談を作る", () => {
    const c = createConsult("c1", "overall", { overall: { focus: "導入" } });
    expect(c).toEqual({
      id: "c1",
      kind: "overall",
      status: "requested",
      input: { overall: { focus: "導入" } },
    });
  });

  it("upsertConsult は新規を追加し、既存idは置換する(イミュータブル)", () => {
    const a = createConsult("c1", "overall", {});
    const list1 = upsertConsult([], a);
    expect(list1).toHaveLength(1);

    const a2: Consult = { ...a, status: "presenting" };
    const list2 = upsertConsult(list1, a2);
    expect(list2).toHaveLength(1);
    expect(list2[0].status).toBe("presenting");
    expect(list1[0].status).toBe("requested"); // 元配列は不変
  });

  it("findConsult は id 一致を返し、無ければ undefined", () => {
    const a = createConsult("c1", "revise", {});
    expect(findConsult([a], "c1")).toBe(a);
    expect(findConsult([a], "zzz")).toBeUndefined();
  });

  it("removeConsult は id を除いた新配列を返す", () => {
    const a = createConsult("c1", "revise", {});
    const b = createConsult("c2", "sentence", {});
    const out = removeConsult([a, b], "c1");
    expect(out.map((c) => c.id)).toEqual(["c2"]);
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: FAIL("Cannot find module './consultEngine'")

- [ ] **Step 3: 最小実装**

`src/app/growth/approve-proto/consultEngine.ts`:

```ts
/**
 * AI相談(#proto・往復統合)の純関数エンジン。
 *
 * ライフサイクル(requested→presenting→failed)と提示の反映を、Reactやタイマー無しの
 * 純関数として持つ。型専用 import のみ(HTML加工は薄い useConsult 側に置く)。
 */
import type { Consult, ConsultInput, ConsultKind } from "./types";

export function createConsult(
  id: string,
  kind: ConsultKind,
  input: ConsultInput,
): Consult {
  return { id, kind, status: "requested", input };
}

export function upsertConsult(list: Consult[], c: Consult): Consult[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c];
  return list.map((x) => (x.id === c.id ? c : x));
}

export function findConsult(list: Consult[], id: string): Consult | undefined {
  return list.find((x) => x.id === id);
}

export function removeConsult(list: Consult[], id: string): Consult[] {
  return list.filter((x) => x.id !== id);
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve-proto/consultEngine.ts src/app/growth/approve-proto/consultEngine.test.ts
git commit -m "feat(growth): consultEngine の基本ライフサイクル(create/upsert/find/remove)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: consultEngine — resolve / fail(TDD)

**Files:**
- Modify: `src/app/growth/approve-proto/consultEngine.ts`
- Modify: `src/app/growth/approve-proto/consultEngine.test.ts`

**Interfaces:**
- Produces:
  - `resolveConsult(c: Consult, result: ConsultResult): Consult`(status="presenting"＋result付与)
  - `failConsult(c: Consult): Consult`(status="failed"。result は落とす)

- [ ] **Step 1: 失敗するテストを追記**

`consultEngine.test.ts` に追記:

```ts
import { failConsult, resolveConsult } from "./consultEngine";

describe("consultEngine: resolve/fail", () => {
  it("resolveConsult は presenting にして result を載せる", () => {
    const c = createConsult("c1", "overall", {});
    const out = resolveConsult(c, { overall: { overall: 80, scores: [], strengths: [], fixes: [] } });
    expect(out.status).toBe("presenting");
    expect(out.result?.overall?.overall).toBe(80);
    expect(c.status).toBe("requested"); // 元は不変
  });

  it("failConsult は failed にして result を落とす", () => {
    const c = resolveConsult(createConsult("c1", "revise", {}), { revise: {} });
    const out = failConsult(c);
    expect(out.status).toBe("failed");
    expect(out.result).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: FAIL("resolveConsult is not a function")

- [ ] **Step 3: 実装を追記**

`consultEngine.ts` に追記(`ConsultResult` を import 追加):

```ts
import type { Consult, ConsultInput, ConsultKind, ConsultResult } from "./types";

export function resolveConsult(c: Consult, result: ConsultResult): Consult {
  return { ...c, status: "presenting", result };
}

export function failConsult(c: Consult): Consult {
  return { ...c, status: "failed", result: undefined };
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve-proto/consultEngine.ts src/app/growth/approve-proto/consultEngine.test.ts
git commit -m "feat(growth): consultEngine の resolve/fail 遷移

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: consultEngine — revise の対象反映 / 残り判定(TDD)

**Files:**
- Modify: `src/app/growth/approve-proto/consultEngine.ts`
- Modify: `src/app/growth/approve-proto/consultEngine.test.ts`

**Interfaces:**
- Consumes: `Article`, `ReviseTarget` from `./types`。
- Produces:
  - `applyReviseTarget(article: Article, c: Consult, target: ReviseTarget): Article`
    — `c.result.revise[target].to` を Article の title/body/outline へ反映(イミュータブル)。
  - `settleReviseTarget(c: Consult, target: ReviseTarget): Consult | null`
    — result.revise から target を除く。残り0なら null(=相談終了)。

これは既存 `settleRevise`(page.tsx:393-423)の純粋版。`reviseProposal[target]` の `to` を反映し、対象を消し、空なら相談を畳む挙動を保つ。

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { applyReviseTarget, settleReviseTarget } from "./consultEngine";
import type { Article } from "./types";

function stubArticle(over: Partial<Article> = {}): Article {
  return {
    id: "a1", title: "元タイトル", stage: "draft_review", score: 50, awaitingYou: true,
    updatedLabel: "", excerpt: "", keyword: "", hue: 0, wordCount: 0, readMinutes: 0,
    outline: [{ heading: "元見出し", summary: "" }], prompt: "", refs: [],
    bodyHtml: "<p>元本文</p>", hasEyecatch: false, bodyImages: 0, decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] }, checklist: [],
    ...over,
  };
}

describe("consultEngine: revise の反映/残り", () => {
  const c = resolveConsult(createConsult("c1", "revise", {}), {
    revise: {
      title: { from: "元タイトル", to: "新タイトル" },
      body: { from: "<p>元本文</p>", to: "<p>新本文</p>" },
    },
  });

  it("applyReviseTarget(title) はタイトルだけ差し替える", () => {
    const out = applyReviseTarget(stubArticle(), c, "title");
    expect(out.title).toBe("新タイトル");
    expect(out.bodyHtml).toBe("<p>元本文</p>");
  });

  it("applyReviseTarget(body) は本文だけ差し替える", () => {
    const out = applyReviseTarget(stubArticle(), c, "body");
    expect(out.bodyHtml).toBe("<p>新本文</p>");
    expect(out.title).toBe("元タイトル");
  });

  it("applyReviseTarget(outline) は outline を差し替える", () => {
    const co = resolveConsult(createConsult("c2", "revise", {}), {
      revise: { outline: { from: [{ heading: "元見出し", summary: "" }], to: [{ heading: "新見出し", summary: "x" }] } },
    });
    const out = applyReviseTarget(stubArticle(), co, "outline");
    expect(out.outline).toEqual([{ heading: "新見出し", summary: "x" }]);
  });

  it("settleReviseTarget は対象を除き、残りがあれば presenting のまま", () => {
    const out = settleReviseTarget(c, "title");
    expect(out).not.toBeNull();
    expect(out?.result?.revise?.title).toBeUndefined();
    expect(out?.result?.revise?.body).toBeDefined();
    expect(out?.status).toBe("presenting");
  });

  it("settleReviseTarget は最後の対象を除くと null(相談終了)", () => {
    const only = resolveConsult(createConsult("c3", "revise", {}), {
      revise: { title: { from: "a", to: "b" } },
    });
    expect(settleReviseTarget(only, "title")).toBeNull();
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: FAIL("applyReviseTarget is not a function")

- [ ] **Step 3: 実装を追記**

`consultEngine.ts`(import に `Article`, `ReviseProposal`, `ReviseTarget` を追加):

```ts
import type {
  Article,
  Consult,
  ConsultInput,
  ConsultKind,
  ConsultResult,
  ReviseProposal,
  ReviseTarget,
} from "./types";

/** revise の対象 1つを Article 本体へ反映する(イミュータブル)。result 不在/対象不在なら素通し。 */
export function applyReviseTarget(
  article: Article,
  c: Consult,
  target: ReviseTarget,
): Article {
  const p = c.result?.revise;
  if (!p) return article;
  if (target === "title" && p.title) return { ...article, title: p.title.to };
  if (target === "body" && p.body) return { ...article, bodyHtml: p.body.to };
  if (target === "outline" && p.outline) return { ...article, outline: p.outline.to };
  return article;
}

/** revise result から対象を除く。残り0なら null(相談を畳む合図)。 */
export function settleReviseTarget(c: Consult, target: ReviseTarget): Consult | null {
  const p = c.result?.revise;
  if (!p) return c;
  const next: ReviseProposal = { ...p };
  delete next[target];
  if (Object.keys(next).length === 0) return null;
  return { ...c, result: { ...c.result, revise: next } };
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve-proto/consultEngine.ts src/app/growth/approve-proto/consultEngine.test.ts
git commit -m "feat(growth): consultEngine の revise 反映/残り判定

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: consultEngine — sentence fix の残り判定 / advice 採用(TDD)

**Files:**
- Modify: `src/app/growth/approve-proto/consultEngine.ts`
- Modify: `src/app/growth/approve-proto/consultEngine.test.ts`

**Interfaces:**
- Produces:
  - `settleSentenceFix(c: Consult, block: number): Consult | null`
    — result.sentence(BodyCommentFix[])から block を除く。残り0なら null。
  - `adoptAdviceFix(article: Article, c: Consult, index: number): Article`
    — `c.result.overall.fixes[index].suggestion` を本文末尾に `<p class="proto-changed">…</p>` で追記(既存 adoptAdvice の純粋版)。

sentence の**本文への反映**(`applyBlockImprovement`)は HTML 加工で `bodyBlocks` に依存するため**エンジンには置かず**、薄いフック側(Task 13)で行う。エンジンは「残りの fix」管理のみ持つ。

- [ ] **Step 1: 失敗するテストを追記**

```ts
import { adoptAdviceFix, settleSentenceFix } from "./consultEngine";

describe("consultEngine: sentence/advice", () => {
  it("settleSentenceFix は block を除き、残りがあれば presenting", () => {
    const c = resolveConsult(createConsult("c1", "sentence", {}), {
      sentence: [
        { block: 0, from: "A", to: "A 改", sentence: "改" },
        { block: 2, from: "B", to: "B 改", sentence: "改" },
      ],
    });
    const out = settleSentenceFix(c, 0);
    expect(out?.result?.sentence?.map((f) => f.block)).toEqual([2]);
  });

  it("settleSentenceFix は最後の fix を除くと null", () => {
    const c = resolveConsult(createConsult("c1", "sentence", {}), {
      sentence: [{ block: 0, from: "A", to: "A 改", sentence: "改" }],
    });
    expect(settleSentenceFix(c, 0)).toBeNull();
  });

  it("adoptAdviceFix は提案を proto-changed 段落として本文末尾に足す", () => {
    const c = resolveConsult(createConsult("c1", "overall", {}), {
      overall: { overall: 80, scores: [], strengths: [], fixes: [{ quote: "q", reason: "r", suggestion: "内部リンクを足す" }] },
    });
    const out = adoptAdviceFix(stubArticle({ bodyHtml: "<p>本文</p>" }), c, 0);
    expect(out.bodyHtml).toBe('<p>本文</p><p class="proto-changed">内部リンクを足す</p>');
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: FAIL("settleSentenceFix is not a function")

- [ ] **Step 3: 実装を追記**

`consultEngine.ts` に追記:

```ts
/** sentence result から block を除く。残り0なら null。 */
export function settleSentenceFix(c: Consult, block: number): Consult | null {
  const fixes = c.result?.sentence;
  if (!fixes) return c;
  const next = fixes.filter((f) => f.block !== block);
  if (next.length === 0) return null;
  return { ...c, result: { ...c.result, sentence: next } };
}

/** advice の直すべき点(index)を本文末尾へ反映する(イミュータブル)。 */
export function adoptAdviceFix(article: Article, c: Consult, index: number): Article {
  const fix = c.result?.overall?.fixes[index];
  if (!fix) return article;
  return { ...article, bodyHtml: `${article.bodyHtml}<p class="proto-changed">${fix.suggestion}</p>` };
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts`
Expected: PASS(全テスト緑)

- [ ] **Step 5: エンジン100%カバレッジ確認**

Run: `npx vitest run src/app/growth/approve-proto/consultEngine.test.ts --coverage`
Expected: `consultEngine.ts` の statements/branches/functions/lines が 100%。未到達分岐があればテストを足す。

- [ ] **Step 6: Commit**

```bash
git add src/app/growth/approve-proto/consultEngine.ts src/app/growth/approve-proto/consultEngine.test.ts
git commit -m "feat(growth): consultEngine の sentence 残り判定と advice 採用

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — 提示ボディの抽出(挙動不変)

> 既存3ビューから「提示の中身」だけを、`result` を受け取る純表示コンポーネントへ切り出す。
> 既存タブ(ReviseCompareView/AdviceView/BodyCommentView)は Phase 5 で退役するまで**そのまま動かしておく**(段階的移行)。
> これらは無計測の薄い表示結線。テストは型チェック＋lint＋手動確認(ユーザーがブラウザ確認)。

### Task 6: ReviseProposalBody を抽出

**Files:**
- Create: `src/app/growth/approve-proto/ReviseProposalBody.tsx`

**Interfaces:**
- Consumes: `ReviseProposal` from `./types`。`segDiff` from `./reviseMock`。
- Produces: `ReviseProposalBody({ proposal, onApply, onDismiss }: { proposal: ReviseProposal; onApply: (t: ReviseTarget) => void; onDismiss: (t: ReviseTarget) => void })`
  — 既存 `ReviseCompareView`(`ReviseCompareView.tsx:120-163`)の「presenting 本体」と、その下位の `TitleDiff`/`OutlineDiff`/`BodyColumn`/`ApplyRow`(同 47-67, 166-257)を移植。`article`/`InstructionRecap`/status分岐は持たない(枠は ConsultCard が担当)。

- [ ] **Step 1: 抽出ファイルを作る**

`ReviseProposalBody.tsx` を新規作成。`ReviseCompareView.tsx` の `ApplyRow`/`TitleDiff`/`OutlineDiff`/`BodyColumn`(47-67, 166-257)を**そのままコピー**し、本体を以下にする(`IconCheck`等の import も移植):

```tsx
/**
 * revise 提示ボディ(#proto・往復統合): 元 vs 新を対象ごとに反映/却下する。
 * ConsultCard から presenting 時に描画される。枠/指示リキャップ/status は ConsultCard 側。
 */
"use client";

import { IconCheck, IconWand, IconX } from "./icons";
import { segDiff } from "./reviseMock";
import type { OutlineSection, ReviseProposal, ReviseTarget } from "./types";

interface ReviseProposalBodyProps {
  proposal: ReviseProposal;
  onApply: (target: ReviseTarget) => void;
  onDismiss: (target: ReviseTarget) => void;
}

export function ReviseProposalBody({ proposal, onApply, onDismiss }: ReviseProposalBodyProps) {
  return (
    <div className="flex flex-col gap-5">
      {proposal.outline && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            構成案の修正案
          </div>
          <OutlineDiff from={proposal.outline.from} to={proposal.outline.to} />
          <ApplyRow onApply={() => onApply("outline")} onDismiss={() => onDismiss("outline")} />
        </section>
      )}
      {proposal.title && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            タイトルの修正案
          </div>
          <TitleDiff from={proposal.title.from} to={proposal.title.to} />
          <ApplyRow onApply={() => onApply("title")} onDismiss={() => onDismiss("title")} />
        </section>
      )}
      {proposal.body && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              本文の修正案
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: "var(--p-text-3)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--p-green-weak)", boxShadow: "inset 2px 0 0 var(--p-green)" }} />
              追加・変更箇所
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BodyColumn label="元" html={proposal.body.from} muted />
            <BodyColumn label="新（提案）" html={proposal.body.to} />
          </div>
          <ApplyRow onApply={() => onApply("body")} onDismiss={() => onDismiss("body")} />
        </section>
      )}
    </div>
  );
}

// 以下 ApplyRow / TitleDiff / OutlineDiff / BodyColumn は ReviseCompareView.tsx から移植。
// （ReviseCompareView.tsx の 47-67, 166-257 をそのまま貼り、OutlineSection import を上の行に統合する）
```

`ApplyRow`/`TitleDiff`/`OutlineDiff`/`BodyColumn` の関数定義(`ReviseCompareView.tsx:47-67` と `166-257`)を末尾にコピーする。`IconWand` は `ApplyRow` では未使用なら import から外す(lint対応)。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS(未使用 import があれば削る)

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/ReviseProposalBody.tsx
git commit -m "refactor(growth): revise 提示ボディを ReviseProposalBody に抽出

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: AdviceResultBody を抽出

**Files:**
- Create: `src/app/growth/approve-proto/AdviceResultBody.tsx`

**Interfaces:**
- Consumes: `Advice` from `./types`。`RingScore` from `./ui`。
- Produces: `AdviceResultBody({ advice, articleId, adoptedFixes, onAdopt }: { advice: Advice; articleId: string; adoptedFixes: Set<string>; onAdopt: (index: number) => void })`
  — `DetailViews.tsx` の `AdviceBody`(384-495 の presenting 本体: RingScore/scores/strengths/fixes)を移植。`status` 分岐・依頼フォーム・「閉じる」ボタンは持たない(枠は ConsultCard)。`adopted` 判定は `adoptedFixes.has(\`${articleId}:${i}\`)` のまま。

- [ ] **Step 1: 抽出ファイルを作る**

`AdviceResultBody.tsx` を新規作成。`DetailViews.tsx:384-495`(`const a = article.advice;` 以降の `return (...)`)を移植し、`a` を props の `advice` に、`article.id` を `articleId` に置換:

```tsx
/**
 * advice 提示ボディ(#proto・往復統合): 採点・強み・直すべき点。
 * ConsultCard から presenting 時に描画される。status/依頼フォームは持たない。
 */
"use client";

import { IconArrowDown, IconArrowUp, IconChart, IconCheck } from "./icons";
import type { Advice } from "./types";
import { RingScore } from "./ui";

interface AdviceResultBodyProps {
  advice: Advice;
  articleId: string;
  adoptedFixes: Set<string>;
  onAdopt: (index: number) => void;
}

export function AdviceResultBody({ advice: a, articleId, adoptedFixes, onAdopt }: AdviceResultBodyProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* DetailViews.tsx の AdviceBody presenting 本体(総評カード/scores/strengths/fixes)を移植。
          a.* はそのまま、adoptedFixes.has(`${articleId}:${i}`) に置換。先頭の「閉じる」行は除外。 */}
    </div>
  );
}
```

`DetailViews.tsx` の `<RingScore .../>` の総評カード(395-408)、scores グリッド(410-432)、強み(434-445)、fixes(447-493)をこの中へコピーする。冒頭の `スタイリング・アドバイス`＋閉じるボタン行(387-394)は**含めない**。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/AdviceResultBody.tsx
git commit -m "refactor(growth): advice 提示ボディを AdviceResultBody に抽出

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: SentenceFixBody ＋ CommentableBody を抽出

**Files:**
- Create: `src/app/growth/approve-proto/SentenceFixBody.tsx`
- Create: `src/app/growth/approve-proto/CommentableBody.tsx`

**Interfaces:**
- Produces:
  - `SentenceFixBody({ fixes, onApplyFix, onDismissFix, onApplyAll }: { fixes: BodyCommentFix[]; onApplyFix: (block: number) => void; onDismissFix: (block: number) => void; onApplyAll: () => void })`
    — `BodyCommentView.tsx:110-152`(presenting の fixes セクション)を移植。
  - `CommentableBody({ bodyHtml, comments, onAddComment, onRemoveComment }: { bodyHtml: string; comments: BodyComment[]; onAddComment: (block: number, unit: string, text: string) => void; onRemoveComment: (index: number) => void })`
    — `BodyCommentView.tsx:154-241`(本文を文ごとに描画し ＋ で注釈)を移植。ヘッダ/依頼ボタン/status は持たない。
- Consumes: `splitBlocks`/`blockRows`/`isCommentableTag`/`stripTags` from `./bodyBlocks`。

- [ ] **Step 1: SentenceFixBody を作る**

`SentenceFixBody.tsx`:

```tsx
/**
 * sentence 提示ボディ(#proto・往復統合): 指摘への修正案(元→新)を個別/一括反映。
 * ConsultCard から presenting 時に描画される。
 */
"use client";

import { IconCheck } from "./icons";
import type { BodyCommentFix } from "./types";

interface SentenceFixBodyProps {
  fixes: BodyCommentFix[];
  onApplyFix: (block: number) => void;
  onDismissFix: (block: number) => void;
  onApplyAll: () => void;
}

export function SentenceFixBody({ fixes, onApplyFix, onDismissFix, onApplyAll }: SentenceFixBodyProps) {
  return (
    <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      {/* BodyCommentView.tsx:110-152 の中身(ヘッダ「指摘への修正案」＋すべて反映＋fixes.map)を移植 */}
    </section>
  );
}
```

`BodyCommentView.tsx:111-151` の `<div className="mb-3 ...">`〜`fixes.map(...)` をこの section 内へコピー。`onApplyAll`/`onApplyFix(f.block)`/`onDismissFix(f.block)` に結線。

- [ ] **Step 2: CommentableBody を作る**

`CommentableBody.tsx`:

```tsx
/**
 * 注釈可能な本文(#proto・往復統合): 本文を文/項目単位で描画し、＋で注釈を足す。
 * 「この文」モードで詳細メイン(左)に出し、注釈は相談ドロワーへ流す。
 */
"use client";

import { useState } from "react";

import { blockRows, isCommentableTag, splitBlocks, stripTags } from "./bodyBlocks";
import { IconMessage, IconPlus, IconX } from "./icons";
import type { BodyComment } from "./types";

interface CommentableBodyProps {
  bodyHtml: string;
  comments: BodyComment[];
  onAddComment: (block: number, unit: string, text: string) => void;
  onRemoveComment: (index: number) => void;
}

export function CommentableBody({ bodyHtml, comments, onAddComment, onRemoveComment }: CommentableBodyProps) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [text, setText] = useState("");
  const blocks = splitBlocks(bodyHtml);
  const submit = (block: number, unit: string) => {
    if (!text.trim()) return;
    onAddComment(block, unit, text.trim());
    setText("");
    setOpenRow(null);
  };
  return (
    <div className="proto-article" style={{ fontSize: 13.5 }}>
      {/* BodyCommentView.tsx:155-240 の blocks.map(...) をそのまま移植 */}
    </div>
  );
}
```

`BodyCommentView.tsx:155-240` の `blocks.map(...)` 全体をこの中へコピー(`comments`/`openRow`/`text`/`submit`/`onRemoveComment` はローカル/props を参照)。

- [ ] **Step 3: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve-proto/SentenceFixBody.tsx src/app/growth/approve-proto/CommentableBody.tsx
git commit -m "refactor(growth): sentence 提示ボディと注釈可能本文を抽出

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — 統合UI(ConsultCard / Composer / Drawer)

### Task 9: ConsultCard(共通枠＋status分岐)

**Files:**
- Create: `src/app/growth/approve-proto/ConsultCard.tsx`

**Interfaces:**
- Consumes: `Consult`, `ReviseTarget` from `./types`。`ReviseProposalBody`/`AdviceResultBody`/`SentenceFixBody`。
- Produces: `ConsultCard({ consult, articleId, adoptedFixes, onRetry, onDismiss, onApplyRevise, onDismissRevise, onAdoptAdvice, onApplyFix, onDismissFix, onApplyAll }: ConsultCardProps)`
  — ヘッダ(モードバッジ＋入力リキャップ)＋status枠(requested=シマー / failed=再依頼 / presenting=モード別ボディ)。

- [ ] **Step 1: 作成**

```tsx
/**
 * 相談カード(#proto・往復統合): 1相談の枠とステータス(待ち/失敗/提示)を共通化。
 * presenting 時のみモード別ボディ(revise/advice/sentence)を差し込む。
 */
"use client";

import { AdviceResultBody } from "./AdviceResultBody";
import { IconWand, IconX } from "./icons";
import { ReviseProposalBody } from "./ReviseProposalBody";
import { SentenceFixBody } from "./SentenceFixBody";
import type { Consult, ReviseTarget } from "./types";

const KIND_LABEL: Record<Consult["kind"], string> = {
  overall: "全体",
  revise: "修正",
  sentence: "この文",
};

interface ConsultCardProps {
  consult: Consult;
  articleId: string;
  adoptedFixes: Set<string>;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onApplyRevise: (id: string, target: ReviseTarget) => void;
  onDismissRevise: (id: string, target: ReviseTarget) => void;
  onAdoptAdvice: (id: string, index: number) => void;
  onApplyFix: (id: string, block: number) => void;
  onDismissFix: (id: string, block: number) => void;
  onApplyAll: (id: string) => void;
}

function recap(consult: Consult): string {
  const { kind, input } = consult;
  if (kind === "overall") return input.overall?.focus?.trim() || "全体を見てもらう";
  if (kind === "sentence") return `本文への指摘 ${input.sentence?.length ?? 0}件`;
  const parts: string[] = [];
  if (input.revise?.outline) parts.push("構成案");
  if (input.revise?.title) parts.push("タイトル");
  if (input.revise?.body) parts.push("本文");
  return parts.length ? `${parts.join(" / ")}を直す` : "修正を依頼";
}

export function ConsultCard(props: ConsultCardProps) {
  const { consult, articleId, adoptedFixes, onRetry, onDismiss } = props;
  return (
    <section className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full px-2 py-[2px] text-[11px] font-medium" style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}>
          {KIND_LABEL[consult.kind]}
        </span>
        <span className="truncate text-[12px]" style={{ color: "var(--p-text-3)" }}>{recap(consult)}</span>
        {consult.status === "presenting" && (
          <button onClick={() => onDismiss(consult.id)} className="proto-btn-ghost ml-auto" style={{ padding: "3px 8px" }} aria-label="この相談を閉じる">
            <IconX size={13} />
          </button>
        )}
      </div>

      {consult.status === "requested" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
            <IconWand size={15} className="proto-pulse" /> AIが考えています…
          </div>
          {[88, 72, 94, 60].map((w, i) => (
            <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {consult.status === "failed" && (
        <div className="flex flex-col items-start gap-3 rounded-[12px] p-4" style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)" }}>
          <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--p-red)" }}>
            <IconX size={15} /> 生成に失敗しました
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>外部処理が応答しませんでした。同じ内容で再依頼できます。</div>
          <button onClick={() => onRetry(consult.id)} className="proto-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--p-accent)", color: "#0a0c10" }}>
            <IconWand size={14} /> 再依頼する
          </button>
        </div>
      )}

      {consult.status === "presenting" && consult.result?.revise && (
        <ReviseProposalBody
          proposal={consult.result.revise}
          onApply={(t) => props.onApplyRevise(consult.id, t)}
          onDismiss={(t) => props.onDismissRevise(consult.id, t)}
        />
      )}
      {consult.status === "presenting" && consult.result?.overall && (
        <AdviceResultBody
          advice={consult.result.overall}
          articleId={articleId}
          adoptedFixes={adoptedFixes}
          onAdopt={(i) => props.onAdoptAdvice(consult.id, i)}
        />
      )}
      {consult.status === "presenting" && consult.result?.sentence && (
        <SentenceFixBody
          fixes={consult.result.sentence}
          onApplyFix={(b) => props.onApplyFix(consult.id, b)}
          onDismissFix={(b) => props.onDismissFix(consult.id, b)}
          onApplyAll={() => props.onApplyAll(consult.id)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/ConsultCard.tsx
git commit -m "feat(growth): 相談カード(共通枠＋status分岐)を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: ConsultComposer(3モード入力)

**Files:**
- Create: `src/app/growth/approve-proto/ConsultComposer.tsx`

**Interfaces:**
- Produces: `ConsultComposer({ mode, sentenceCount, onSubmitOverall, onSubmitRevise, onSubmitSentence }: ConsultComposerProps)`
  - `mode: ConsultKind`。
  - overall: textarea(任意)→`onSubmitOverall(focus: string)`。
  - revise: タイトル/本文トグル＋指示欄(`ReviseRequestModal` の `RevisePart` を流用)→`onSubmitRevise({ title?, body? })`。
  - sentence: 「本文の＋で指摘を追加」案内＋件数表示→`onSubmitSentence()`(件数0なら disabled)。

- [ ] **Step 1: 作成**

```tsx
/**
 * 相談コンポーザ(#proto・往復統合): モード別の入力。送信は相談ドロワーが受ける。
 */
"use client";

import { useState } from "react";

import { IconWand } from "./icons";
import type { ConsultKind } from "./types";

interface ConsultComposerProps {
  mode: ConsultKind;
  sentenceCount: number;
  onSubmitOverall: (focus: string) => void;
  onSubmitRevise: (instruction: { title?: string; body?: string }) => void;
  onSubmitSentence: () => void;
}

export function ConsultComposer({ mode, sentenceCount, onSubmitOverall, onSubmitRevise, onSubmitSentence }: ConsultComposerProps) {
  if (mode === "overall") return <OverallComposer onSubmit={onSubmitOverall} />;
  if (mode === "revise") return <ReviseComposer onSubmit={onSubmitRevise} />;
  return <SentenceComposer count={sentenceCount} onSubmit={onSubmitSentence} />;
}

function SubmitButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="proto-btn-primary flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: "var(--p-accent)", color: "#0a0c10" }}
    >
      <IconWand size={15} /> 相談する
    </button>
  );
}

function OverallComposer({ onSubmit }: { onSubmit: (focus: string) => void }) {
  const [focus, setFocus] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        文体・構成・具体性・内部リンク導線の観点で、下書き全体をAIに見てもらえます。
      </div>
      <textarea
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        placeholder="特に見てほしい点（任意・例：導入の説得力）"
        rows={2}
        className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
        style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
      />
      <SubmitButton onClick={() => onSubmit(focus.trim())} />
    </div>
  );
}

function ReviseComposer({ onSubmit }: { onSubmit: (i: { title?: string; body?: string }) => void }) {
  const [titleOn, setTitleOn] = useState(false);
  const [bodyOn, setBodyOn] = useState(true);
  const [titleText, setTitleText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const canSend = (titleOn && titleText.trim()) || (bodyOn && bodyText.trim());
  return (
    <div className="flex flex-col gap-3">
      {/* ReviseRequestModal.tsx:108-163 の RevisePart をこのファイル末尾にコピーして使う */}
      <RevisePart label="タイトル" on={titleOn} onToggle={() => setTitleOn((v) => !v)} value={titleText} onChange={setTitleText} placeholder="例）もう少し短く、すっきりさせたい" />
      <RevisePart label="本文" on={bodyOn} onToggle={() => setBodyOn((v) => !v)} value={bodyText} onChange={setBodyText} placeholder="例）結びに体験予約への内部リンク導線を一つ足してほしい" />
      <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>指示を出した対象だけが、案になって戻ってきます。</p>
      <SubmitButton
        disabled={!canSend}
        onClick={() => onSubmit({ title: titleOn && titleText.trim() ? titleText.trim() : undefined, body: bodyOn && bodyText.trim() ? bodyText.trim() : undefined })}
      />
    </div>
  );
}

function SentenceComposer({ count, onSubmit }: { count: number; onSubmit: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        左の本文の各文に <strong style={{ color: "var(--p-text)" }}>＋</strong> で指摘を足し、まとめてAIに相談できます。
      </div>
      <div className="rounded-[9px] px-3 py-2 text-[12.5px]" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", color: "var(--p-text-2)" }}>
        {count > 0 ? `${count}件の指摘` : "まだ指摘がありません"}
      </div>
      <SubmitButton disabled={count === 0} onClick={onSubmit} />
    </div>
  );
}

// RevisePart は ReviseRequestModal.tsx:108-163 を移植する(同一実装)。
```

`ReviseRequestModal.tsx:108-163` の `RevisePart` 関数をこのファイル末尾にコピーする。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/ConsultComposer.tsx
git commit -m "feat(growth): 相談コンポーザ(全体/修正/この文の3モード入力)を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: ConsultDrawer(殻＋モード切替＋結果ストリーム)

**Files:**
- Create: `src/app/growth/approve-proto/ConsultDrawer.tsx`

**Interfaces:**
- Consumes: `Consult`, `ConsultKind`, `ReviseTarget` from `./types`。`useDialog` from `./useDialog`。`ConsultComposer`、`ConsultCard`。`AnimatePresence`/`motion` from `framer-motion`。
- Produces: `ConsultDrawer({ open, mode, consults, articleId, adoptedFixes, sentenceCount, onModeChange, onClose, onSubmitOverall, onSubmitRevise, onSubmitSentence, ...cardHandlers }: ConsultDrawerProps)`
  — 右レール型ドロワー。ヘッダ(タイトル＋esc)、モードセグメント([全体を見てもらう][ここを直す][この文])、`ConsultComposer`、結果ストリーム(`consults` を新しい順に `ConsultCard`)。

- [ ] **Step 1: 作成**

```tsx
/**
 * 相談ドロワー(#proto・往復統合): 右レール型。3モードの入力・待ち・提示・反映を1か所へ集約。
 * 本文は左に残りクリック可(全画面モーダルにしない)。モバイルはフルレ幅＋scrim。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import { ConsultCard } from "./ConsultCard";
import { ConsultComposer } from "./ConsultComposer";
import { IconX } from "./icons";
import type { Consult, ConsultKind, ReviseTarget } from "./types";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";

const MODES: { key: ConsultKind; label: string }[] = [
  { key: "overall", label: "全体を見てもらう" },
  { key: "revise", label: "ここを直す" },
  { key: "sentence", label: "この文" },
];

interface ConsultDrawerProps {
  open: boolean;
  mode: ConsultKind;
  consults: Consult[];
  articleId: string;
  adoptedFixes: Set<string>;
  sentenceCount: number;
  onModeChange: (mode: ConsultKind) => void;
  onClose: () => void;
  onSubmitOverall: (focus: string) => void;
  onSubmitRevise: (i: { title?: string; body?: string }) => void;
  onSubmitSentence: () => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onApplyRevise: (id: string, target: ReviseTarget) => void;
  onDismissRevise: (id: string, target: ReviseTarget) => void;
  onAdoptAdvice: (id: string, index: number) => void;
  onApplyFix: (id: string, block: number) => void;
  onDismissFix: (id: string, block: number) => void;
  onApplyAll: (id: string) => void;
}

export function ConsultDrawer(props: ConsultDrawerProps) {
  const dialogRef = useDialog();
  const { open, mode, consults } = props;
  // 新しい順(末尾追加なので逆順表示)。
  const stream = [...consults].reverse();
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* モバイルのみ scrim(lg 以上は本文操作を妨げない) */}
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: "rgba(4,6,9,0.5)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={props.onClose}
          />
          <motion.aside
            ref={dialogRef}
            role="dialog"
            aria-modal={false}
            aria-label="AIに相談"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col"
            style={{ background: "var(--p-bg-elevated)", borderLeft: "1px solid var(--p-border-strong)", boxShadow: "-18px 0 50px rgba(0,0,0,0.4)" }}
          >
            <div className="flex shrink-0 items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
              <span className="text-[14px] font-semibold">AIに相談</span>
              <button onClick={props.onClose} className="ml-auto" aria-label="閉じる"><Kbd>esc</Kbd></button>
            </div>

            <div className="flex shrink-0 items-center gap-1 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }} role="tablist" aria-label="相談モード">
              {MODES.map((m) => {
                const active = m.key === mode;
                return (
                  <button
                    key={m.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => props.onModeChange(m.key)}
                    className="rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                    style={{ background: active ? "var(--p-bg-active)" : "transparent", color: active ? "var(--p-text)" : "var(--p-text-3)" }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ConsultComposer
                mode={mode}
                sentenceCount={props.sentenceCount}
                onSubmitOverall={props.onSubmitOverall}
                onSubmitRevise={props.onSubmitRevise}
                onSubmitSentence={props.onSubmitSentence}
              />
              {stream.length > 0 && (
                <>
                  <div className="my-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
                    相談の結果
                  </div>
                  <div className="flex flex-col gap-3">
                    {stream.map((c) => (
                      <ConsultCard
                        key={c.id}
                        consult={c}
                        articleId={props.articleId}
                        adoptedFixes={props.adoptedFixes}
                        onRetry={props.onRetry}
                        onDismiss={props.onDismiss}
                        onApplyRevise={props.onApplyRevise}
                        onDismissRevise={props.onDismissRevise}
                        onAdoptAdvice={props.onAdoptAdvice}
                        onApplyFix={props.onApplyFix}
                        onDismissFix={props.onDismissFix}
                        onApplyAll={props.onApplyAll}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

備考: `IconX` を未使用なら import から外す(lint)。`useDialog` は esc/フォーカストラップを既存実装で踏襲(esc は親の `onClose` キーハンドラでも処理するため二重でも可)。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/ConsultDrawer.tsx
git commit -m "feat(growth): 相談ドロワー(殻＋モード切替＋結果ストリーム)を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — エンジンフック

### Task 12: useConsult フック(タイマー＋モック生成＋エンジン)

**Files:**
- Create: `src/app/growth/approve-proto/useConsult.ts`

**Interfaces:**
- Consumes: `consultEngine` 全関数。`proposeTitle`/`proposeBody`/`proposeOutline` from `./reviseMock`。`splitBlocks`/`stripTags`/`improvementSentence`/`applyBlockImprovement` from `./bodyBlocks`。`Article`/`Consult`/`ConsultInput`/`ConsultKind` from `./types`。
- Produces: `useConsult({ activeArticle, setArticles, pushToast }: UseConsultArgs): UseConsultApi`
  - `request(kind, input)` / `retry(id)` / `dismiss(id)`
  - `applyRevise(id, target)` / `dismissRevise(id, target)`
  - `adoptAdvice(id, index)` / `applyFix(id, block)` / `dismissFix(id, block)` / `applyAll(id)`
  - 相談は `activeArticle.consults` に保持(Article 上)。タイマーは ref で管理しアンマウントで掃除。
  - 失敗注入: `kind==="overall"` 以外は確率失敗を踏襲(or 既存通り一定成功)。既存挙動に合わせ**成功のみ**(failed は手動再現用に型・UIを温存)。

> 既存3ハンドラ(page.tsx)の挙動を移植する。`requestRevise`(355-383)/`requestOutlineRevise`(601-630)/`requestAdvice`(520-540)/`requestBodyComment`(656-687)の result 生成ロジックをここへ集約する。

- [ ] **Step 1: 作成**

```ts
/**
 * AI相談(#proto・往復統合)の薄いフック。
 * 純エンジン(consultEngine)＋タイマー＋モック結果生成を束ね、Article.consults を更新する。
 * HTML加工(reviseMock/bodyBlocks)はここに置き、エンジンは型専用に保つ。
 */
"use client";

import { useCallback, useEffect, useRef } from "react";

import { applyBlockImprovement, improvementSentence, splitBlocks, stripTags } from "./bodyBlocks";
import {
  adoptAdviceFix,
  applyReviseTarget,
  createConsult,
  failConsult, // 失敗再現用に温存(現状は未使用なら eslint-disable で保持)
  findConsult,
  removeConsult,
  resolveConsult,
  settleReviseTarget,
  settleSentenceFix,
  upsertConsult,
} from "./consultEngine";
import { proposeBody, proposeOutline, proposeTitle } from "./reviseMock";
import type { Article, Consult, ConsultInput, ConsultKind, ConsultResult, ReviseTarget, Toast } from "./types";

interface UseConsultArgs {
  activeArticle: Article | null;
  setArticles: (updater: (prev: Article[]) => Article[]) => void;
  pushToast: (tone: Toast["tone"], text: string) => void;
}

const DEFAULT_ADVICE = {
  overall: 82,
  scores: [
    { label: "文体の自然さ", score: 86 },
    { label: "構成の流れ", score: 80 },
    { label: "具体性・根拠", score: 74 },
    { label: "内部リンク導線", score: 68 },
  ],
  strengths: ["一文が短く、翻訳調を避けた自然な日本語", "確定事実に沿っていて誇張がない"],
  fixes: [{ quote: "まず一度コートに立ってみてください。", reason: "締めは良いが、次アクションへの内部導線がない。", suggestion: "体験予約 or 施設紹介ページへの内部リンクを添える。" }],
};

/** input から提示結果を決定的に生成する(外部I/Oなし)。 */
function computeResult(a: Article, c: Consult): ConsultResult {
  if (c.kind === "overall") {
    return { overall: a.advice.overall > 0 ? a.advice : DEFAULT_ADVICE };
  }
  if (c.kind === "revise") {
    const ins = c.input.revise ?? {};
    const revise: ConsultResult["revise"] = {};
    if (ins.outline) revise.outline = { from: a.outline, to: proposeOutline(a.outline) };
    if (ins.title) revise.title = proposeTitle(a.title, ins.title);
    if (ins.body) revise.body = proposeBody(a.bodyHtml, ins.body);
    return { revise };
  }
  // sentence
  const blocks = splitBlocks(a.bodyHtml);
  const firstByBlock = new Map<number, string>();
  for (const cm of c.input.sentence ?? []) if (!firstByBlock.has(cm.block)) firstByBlock.set(cm.block, cm.text);
  const fixes = [...firstByBlock.entries()]
    .map(([block, firstText]) => {
      const b = blocks[block];
      const sentence = improvementSentence(firstText);
      const from = b ? stripTags(b.inner) : "";
      return { block, from, to: `${from} ${sentence}`, sentence };
    })
    .filter((f) => f.from)
    .sort((p, q) => p.block - q.block);
  return { sentence: fixes };
}

let consultSeq = 0;

export function useConsult({ activeArticle, setArticles, pushToast }: UseConsultArgs) {
  const timers = useRef<number[]>([]);
  const activeId = activeArticle?.id ?? null;

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const updateConsults = useCallback(
    (id: string, updater: (list: Consult[]) => Consult[]) => {
      setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, consults: updater(a.consults ?? []) } : a)));
    },
    [setArticles],
  );

  const startTimer = useCallback(
    (articleId: string, consultId: string) => {
      const t = window.setTimeout(() => {
        setArticles((prev) =>
          prev.map((a) => {
            if (a.id !== articleId) return a;
            const c = findConsult(a.consults ?? [], consultId);
            if (!c) return a;
            return { ...a, consults: upsertConsult(a.consults ?? [], resolveConsult(c, computeResult(a, c))) };
          }),
        );
        pushToast("success", "AIから案が届きました");
      }, 1800);
      timers.current.push(t);
    },
    [setArticles, pushToast],
  );

  const request = useCallback(
    (kind: ConsultKind, input: ConsultInput) => {
      if (!activeId) return;
      consultSeq += 1;
      const c = createConsult(`consult-${consultSeq}`, kind, input);
      updateConsults(activeId, (list) => upsertConsult(list, c));
      pushToast("info", "AIに相談しました — 案を作成します");
      startTimer(activeId, c.id);
    },
    [activeId, updateConsults, pushToast, startTimer],
  );

  const retry = useCallback(
    (id: string) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        return c ? upsertConsult(list, { ...c, status: "requested", result: undefined }) : list;
      });
      startTimer(activeId, id);
    },
    [activeId, updateConsults, startTimer],
  );

  const dismiss = useCallback(
    (id: string) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => removeConsult(list, id));
    },
    [activeId, updateConsults],
  );

  const applyRevise = useCallback(
    (id: string, target: ReviseTarget) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          if (!c) return a;
          const applied = applyReviseTarget(a, c, target);
          const settled = settleReviseTarget(c, target);
          const consults = settled ? upsertConsult(a.consults ?? [], settled) : removeConsult(a.consults ?? [], id);
          return { ...applied, consults };
        }),
      );
      const label = target === "title" ? "タイトル" : target === "body" ? "本文" : "構成案";
      pushToast("success", `${label}を反映しました`);
    },
    [activeId, setArticles, pushToast],
  );

  const dismissRevise = useCallback(
    (id: string, target: ReviseTarget) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        if (!c) return list;
        const settled = settleReviseTarget(c, target);
        return settled ? upsertConsult(list, settled) : removeConsult(list, id);
      });
      pushToast("info", "提案を却下しました");
    },
    [activeId, updateConsults, pushToast],
  );

  const adoptAdvice = useCallback(
    (id: string, index: number) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          return c ? adoptAdviceFix(a, c, index) : a;
        }),
      );
      pushToast("success", "アドバイスを本文に反映しました");
    },
    [activeId, setArticles, pushToast],
  );

  const applyFix = useCallback(
    (id: string, block: number) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          const fix = c?.result?.sentence?.find((f) => f.block === block);
          if (!fix) return a;
          const blocks = splitBlocks(a.bodyHtml);
          const currentText = blocks[block] ? stripTags(blocks[block].inner) : "";
          if (currentText !== fix.from) {
            pushToast("danger", "対象の段落が変わっています（要確認）— 再依頼してください");
            return a;
          }
          const settled = settleSentenceFix(c!, block);
          const consults = settled ? upsertConsult(a.consults ?? [], settled) : removeConsult(a.consults ?? [], id);
          return { ...a, bodyHtml: applyBlockImprovement(a.bodyHtml, block, fix.sentence), consults };
        }),
      );
      pushToast("success", "本文に反映しました");
    },
    [activeId, setArticles, pushToast],
  );

  const dismissFix = useCallback(
    (id: string, block: number) => {
      if (!activeId) return;
      updateConsults(activeId, (list) => {
        const c = findConsult(list, id);
        if (!c) return list;
        const settled = settleSentenceFix(c, block);
        return settled ? upsertConsult(list, settled) : removeConsult(list, id);
      });
      pushToast("info", "提案を却下しました");
    },
    [activeId, updateConsults, pushToast],
  );

  const applyAll = useCallback(
    (id: string) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const c = findConsult(a.consults ?? [], id);
          if (!c?.result?.sentence) return a;
          let html = a.bodyHtml;
          for (const f of c.result.sentence) html = applyBlockImprovement(html, f.block, f.sentence);
          return { ...a, bodyHtml: html, consults: removeConsult(a.consults ?? [], id) };
        }),
      );
      pushToast("success", "本文にすべて反映しました");
    },
    [activeId, setArticles, pushToast],
  );

  return { request, retry, dismiss, applyRevise, dismissRevise, adoptAdvice, applyFix, dismissFix, applyAll };
}
```

注: `failConsult` は失敗状態の再現用に温存。本フローで未使用なら import せず、Task 5 のテストでのみ参照(エンジン側に残す)。lint の未使用 import を避けるため、上の import から `failConsult` は外す。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto`
Expected: PASS。`Article.consults` 未定義エラーが出たら Task 13 で型追加するため、ここで `types.ts` の `Article` に `consults?: Consult[];` を先行追加してよい(下記)。

- [ ] **Step 3: Article に consults を追加**

`types.ts` の `Article` interface に追記:

```ts
  /** AI相談(#proto・往復統合)の進行中リスト。並行相談を許容。 */
  consults?: Consult[];
```

- [ ] **Step 4: 型チェック再確認**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve-proto/useConsult.ts src/app/growth/approve-proto/types.ts
git commit -m "feat(growth): useConsult フック(タイマー＋モック生成＋エンジン結線)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5 — page.tsx への配線 ＋ 旧UIの退役

### Task 13: page.tsx に useConsult ＋ ドロワーを結線(旧フローは温存したまま並走)

**Files:**
- Modify: `src/app/growth/approve-proto/page.tsx`

**Interfaces:**
- Consumes: `useConsult`、`ConsultDrawer`、`ConsultKind`。
- Produces: ドロワー開閉 state、フッター「AIに相談」起点、`sentence` モード用の本文注釈ハンドラ(既存 `addBodyComment`/`removeBodyComment` を流用)。

- [ ] **Step 1: state とフックを追加**

`page.tsx` の state 群(175 付近)に追加:

```ts
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultMode, setConsultMode] = useState<ConsultKind>("revise");
```

`import type` に `ConsultKind` を追加。`pushToast` 定義の後に:

```ts
  const consult = useConsult({ activeArticle, setArticles, pushToast });
```

(注: `activeArticle`/`setArticles`/`pushToast` は既存。`useConsult` の import を追加。)

- [ ] **Step 2: ドロワーを開くハンドラ**

`revise`(344-352)の中身を、モーダルではなくドロワーを開くよう差し替え:

```ts
  const openConsult = useCallback(
    (mode: ConsultKind) => {
      const a = activeArticle;
      const reason = editBlockReason(a ?? undefined);
      if (reason) return pushToast("danger", reason);
      if (!a) return;
      setConsultMode(mode);
      setConsultOpen(true);
    },
    [activeArticle, editBlockReason, pushToast],
  );
```

フッターの「修正を依頼」(DetailPanel 経由 `onRevise`)は `() => openConsult("revise")` を渡す。`onRequestAdvice` 等の旧導線は Task 14 まで温存。

- [ ] **Step 3: 送信ハンドラを consult に接続**

```ts
  const submitOverall = useCallback((focus: string) => consult.request("overall", { overall: { focus } }), [consult]);
  const submitRevise = useCallback((i: { title?: string; body?: string }) => consult.request("revise", { revise: i }), [consult]);
  const submitSentence = useCallback(() => {
    const list = activeArticle?.bodyComments ?? [];
    if (list.length === 0) return;
    consult.request("sentence", { sentence: list });
  }, [consult, activeArticle]);
```

- [ ] **Step 4: ドロワーをマウント**

`return` 内、`{reviseModalFor && (...)}` の近くに追加:

```tsx
      <ConsultDrawer
        open={consultOpen}
        mode={consultMode}
        consults={activeArticle?.consults ?? []}
        articleId={activeArticle?.id ?? ""}
        adoptedFixes={adoptedFixes}
        sentenceCount={activeArticle?.bodyComments?.length ?? 0}
        onModeChange={setConsultMode}
        onClose={() => setConsultOpen(false)}
        onSubmitOverall={submitOverall}
        onSubmitRevise={submitRevise}
        onSubmitSentence={submitSentence}
        onRetry={consult.retry}
        onDismiss={consult.dismiss}
        onApplyRevise={consult.applyRevise}
        onDismissRevise={consult.dismissRevise}
        onAdoptAdvice={consult.adoptAdvice}
        onApplyFix={consult.applyFix}
        onDismissFix={consult.dismissFix}
        onApplyAll={consult.applyAll}
      />
```

esc ハンドラ(1119-1127)に `if (consultOpen) return setConsultOpen(false);` を `reviseModalFor` の前へ追加。キーボード無効化条件(1130)に `consultOpen` を追加。

- [ ] **Step 5: DetailPanel フッターを「AIに相談」に**

`detail`(1214-1254)の `onRevise` を `() => openConsult("revise")` に差し替え。DetailPanel フッターのボタン文言は Task 14 で「AIに相談」に変更。

- [ ] **Step 6: 型チェック ＋ lint ＋ 既存テスト**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto && npx vitest run src/app/growth/approve-proto`
Expected: PASS（エンジンテスト緑、型/lint緑）

- [ ] **Step 7: 手動確認(ユーザー)**

dev サーバ(`npx next dev --webpack`)で `http://localhost:3000/growth/approve-proto` → 記事選択 → フッター「修正を依頼」でドロワーが開き、各モードで相談→待ち→提示→反映できることを確認(ユーザーがブラウザ確認)。

- [ ] **Step 8: Commit**

```bash
git add src/app/growth/approve-proto/page.tsx
git commit -m "feat(growth): 相談ドロワーを page に結線(旧タブと並走)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: 「この文」モードで本文注釈を左ペインに出す ＋ 構成行コメントを相談へ

**Files:**
- Modify: `src/app/growth/approve-proto/DetailPanel.tsx`
- Modify: `src/app/growth/approve-proto/OutlineView.tsx`(構成行コメント→ revise consult)
- Modify: `src/app/growth/approve-proto/page.tsx`

**Interfaces:**
- DetailPanel: `consultOpen && consultMode==="sentence"` のとき、本文プレビュー領域に `CommentableBody` を出す(props は既存 `onAddBodyComment`/`onRemoveBodyComment`)。
- OutlineView: 「構成案の修正を依頼」を `consult.request("revise", { revise: { outline } })` 経由にする。
- page.tsx: `requestOutlineRevise` を consult ベースに置換。

- [ ] **Step 1: 構成行コメント → 相談**

`page.tsx` の `requestOutlineRevise`(601-630)を置換:

```ts
  const requestOutlineRevise = useCallback(() => {
    const a = activeArticle;
    if (!a) return;
    const comments = a.outline.flatMap((s) => s.comments ?? []);
    if (comments.length === 0) return;
    const summary = comments.map((c) => `・${c}`).join("\n");
    setConsultMode("revise");
    setConsultOpen(true);
    consult.request("revise", { revise: { outline: summary } });
  }, [activeArticle, consult]);
```

- [ ] **Step 2: DetailPanel に CommentableBody 分岐**

`DetailPanel` に props `consultSentenceMode?: boolean`、`onAddBodyComment`/`onRemoveBodyComment` は既存。`safeTab === "preview"` 描画(425)の前に:

```tsx
{props.consultSentenceMode && article.bodyHtml ? (
  <CommentableBody
    bodyHtml={article.bodyHtml}
    comments={article.bodyComments ?? []}
    onAddComment={onAddBodyComment}
    onRemoveComment={onRemoveBodyComment}
  />
) : ( /* 既存のタブ分岐 */ )}
```

(最小実装としては、`consultSentenceMode` のとき本文プレビューの上に `CommentableBody` を差し込む方式でも可。実装者は既存レイアウトを壊さない形を選ぶ。)

page.tsx から `consultSentenceMode={consultOpen && consultMode === "sentence"}` を渡す。

- [ ] **Step 3: 型チェック ＋ lint ＋ テスト**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto && npx vitest run src/app/growth/approve-proto`
Expected: PASS

- [ ] **Step 4: 手動確認(ユーザー)**

「この文」モードで本文に＋→注釈→ドロワーで相談→提示→反映。構成案の行コメント→相談ドロワーに revise 案が出ることを確認。

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve-proto/DetailPanel.tsx src/app/growth/approve-proto/OutlineView.tsx src/app/growth/approve-proto/page.tsx
git commit -m "feat(growth): この文モードの本文注釈と構成行コメントを相談へ合流

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: 旧3タブ・モーダル・旧 state を退役

**Files:**
- Modify: `src/app/growth/approve-proto/DetailPanel.tsx`(校正クラスタの bodyComment/revise/advice リーフを削除、フッター文言「AIに相談」)
- Modify: `src/app/growth/approve-proto/page.tsx`(旧ハンドラ・旧 state・ReviseRequestModal を削除)
- Modify: `src/app/growth/approve-proto/types.ts`(`DetailTab` から `bodyComment`/`revise` を削除、旧 Article フィールドを削除)
- Delete: `src/app/growth/approve-proto/ReviseRequestModal.tsx`、`src/app/growth/approve-proto/ReviseCompareView.tsx`、`src/app/growth/approve-proto/BodyCommentView.tsx`
- Modify: `src/app/growth/approve-proto/DetailViews.tsx`(`AdviceView` を削除)

> 段階移行の最終段。新フローが動作確認できてから実施する。退役対象を一気に消し、型と配線を整える。

- [ ] **Step 1: DetailPanel から旧リーフを除去**

`tabsFor`(51-98)の `bodyComment`/`revise` 追加分と `advice` リーフを削除。`clustersFromLeaves`(120-131)の `proof` クラスタは `advice` を含めず、`material`/`preview`/`outline` のみ残す(または「校正」クラスタ自体を削除)。`ReviseCompareView`/`BodyCommentView`/`AdviceView` の import と描画分岐(426-465)を削除。フッターの「修正を依頼」ボタン(511-513)文言を「AIに相談」に、`onRevise` はそのまま(page で `openConsult("revise")` に結線済み)。ヘッダの「修正案が届いています/修正中…」chip(254-270)は、`activeArticle.consults` に presenting/requested があるかに基づく表示へ置換 or 削除。

- [ ] **Step 2: page.tsx から旧ハンドラ・state を削除**

削除対象: `reviseModalFor` state＋`ReviseRequestModal` マウント(1370-1376)＋esc分岐、`requestRevise`/`retryRevise`/`settleRevise`/`applyRevise`/`dismissRevise`(355-436)、`requestAdvice`/`retryAdvice`/`dismissAdvice`/`adoptAdvice`(502-549)、`requestBodyComment`/`applyBodyFix`/`dismissBodyFix`/`applyAllBodyFixes`(656-751)。`addBodyComment`/`removeBodyComment` は CommentableBody 用に**残す**。`reviseMock`/`bodyBlocks` の不要 import を整理。`DEFAULT_ADVICE`(112-128)は useConsult へ移したので削除。`reviseTimers` は画像再生成/refresh でまだ使用しているため**残す**(用途を確認し、AI往復専用なら useConsult のタイマーへ寄せる)。

DetailPanel へ渡す旧 props(`onApplyRevise`/`onDismissRevise`/`onAdoptAdvice`/`onRequestBodyComment`/`onApplyBodyFix`/`onDismissBodyFix`/`onApplyAllBodyFixes`/`onRequestAdvice`/`onRetryAdvice`/`onDismissAdvice`/`onRetryRevise`/`onRetryBodyComment`)を削除。

- [ ] **Step 3: types.ts を整理**

`DetailTab`(211-218)から `"bodyComment"` `"revise"` を削除(`advice` も。残すのは `outline`/`prompt`/`preview`/`images`)。`Article` から削除: `bodyCommentStatus`/`bodyCommentFixes`/`adviceStatus`/`adviceInstruction`/`reviseStatus`/`reviseInstruction`/`reviseProposal`。`bodyComments`(注釈下書き)・`advice`(初期スコア源)・`BodyComment`/`BodyCommentFix`/`ReviseProposal`/`ReviseField`/`OutlineReviseField`/`Advice` 型は**残す**(consult が再利用)。`ReviseStatus` 型が他で未使用になれば削除。

- [ ] **Step 4: 旧ファイルを削除**

```bash
git rm src/app/growth/approve-proto/ReviseRequestModal.tsx src/app/growth/approve-proto/ReviseCompareView.tsx src/app/growth/approve-proto/BodyCommentView.tsx
```

`DetailViews.tsx` から `AdviceView`/`AdviceBody`(299-496)を削除(`AdviceResultBody` へ移行済み)。`mockData.ts` に `reviseStatus` 等の初期値があれば削除。キーボードショートカット(1173-1184)の `"3"`(bodyComment へ移動)を「ドロワーを開く」等へ変更 or 削除。

- [ ] **Step 5: 型チェック ＋ lint ＋ テスト(全削除の波及を解消)**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint --dir src/app/growth/approve-proto && npx vitest run src/app/growth/approve-proto`
Expected: PASS。型エラーは削除した識別子の参照残り。すべて新フローに置換 or 削除する。

- [ ] **Step 6: 手動確認(ユーザー)**

校正タブが消え、フッター「AIに相談」→ドロワーで全モードが完結すること、旧タブの痕跡が無いことを確認。

- [ ] **Step 7: Commit**

```bash
git add -A src/app/growth/approve-proto
git commit -m "refactor(growth): 旧3タブ/モーダル/旧stateを退役し相談ドロワーへ一本化

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: 全体検証 ＋ ドキュメント追記

**Files:**
- Modify: `docs/operations/growth/` 該当(必要なら #proto の往復統合メモ)。任意。

- [ ] **Step 1: フル検証**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
npx next lint --dir src/app/growth/approve-proto
npx vitest run
```
Expected: 型/lint/全テスト緑、カバレッジ100%維持(`consultEngine.ts` が計測対象に入り100%、他proto無計測)。

- [ ] **Step 2: 退役確認(grep)**

Run:
```bash
grep -rn "reviseStatus\|adviceStatus\|bodyCommentStatus\|ReviseRequestModal\|ReviseCompareView\|BodyCommentView\b" src/app/growth/approve-proto
```
Expected: ヒット0(完全退役)。残れば対応。

- [ ] **Step 3: 手動受け入れ確認(ユーザー)**

3モード(全体/ここを直す/この文)＋構成行コメントが、すべて1ドロワーで 相談→待ち→提示→反映 でき、並行相談・dismiss・(手動再現での)failed/再依頼が機能することを確認。

- [ ] **Step 4: Commit(ドキュメント追記時のみ)**

```bash
git add docs
git commit -m "docs(growth): #proto AI往復統合の運用メモを追記

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review(計画↔仕様の突合)

- **仕様 §4①(エンジン統合)** → Task 1–5(types + consultEngine)、Task 12(useConsult)。✅
- **仕様 §4②(ドロワーUI)** → Task 9–11(Card/Composer/Drawer)、Task 13–14(配線)。✅
- **仕様 §3「入力の起点は文脈に残す」** → Task 14(CommentableBody＋構成行コメント)。✅
- **仕様 §3「本文は左に1つ」** → Task 14(CommentableBody を左ペインに、本文再描画なし)。✅
- **仕様 §4③ 退役(ReviseRequestModal/3タブ殻)** → Task 15。✅
- **仕様 §6 failed/再依頼の温存** → ConsultCard failed分岐＋`failConsult`(エンジン温存)、`retry`(useConsult)。✅
- **仕様 §5「履歴を持たない/並行許容」** → apply/dismiss で `removeConsult`、`consults` 配列で並行。✅
- **仕様 §7 テスト** → consultEngine を TDD(Task 2–5)。UI/フックは無計測の薄い結線(Global Constraints に明記)。✅
- **型整合** → `applyReviseTarget`/`settleReviseTarget`/`settleSentenceFix`/`adoptAdviceFix`/`createConsult`/`resolveConsult`/`failConsult`/`upsert`/`find`/`remove` の名前は Task 2–5 と Task 12 で一致。`ConsultDrawer`/`ConsultCard`/`ConsultComposer` の props 名は Task 9–11、13 で一致。✅

**未解決の注意点(実装者向け)**:
- `reviseTimers`(page.tsx)は画像再生成・refreshBoard でも使用。Task 15 で AI往復分だけ useConsult へ移し、画像/refresh 用途は残す(誤って全削除しない)。
- `DetailPanel` の「校正」クラスタ削除でクラスタが3つになる。`clusterTargetLeaf`/`aggregateDot` は残リーフで破綻しないことを型チェックで確認。
- `useDialog` の esc と page の esc ハンドラが二重に効く可能性。どちらか一方に寄せる(機能的には無害)。
