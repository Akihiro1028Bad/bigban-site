# 承認画面 AI相談ドロワー 本番繋ぎこみ（差分B）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (推奨) または superpowers:executing-plans でタスク単位に実装する。各 Step は checkbox（`- [ ]`）で進捗管理する。

**Goal:** プロト `approve-proto` で検証した「AIに相談」ドロワー（overall=全体見直し / revise=対象修正 / sentence=文ごと指摘 の3モードを1ドロワーに統合）を本番 `src/app/growth/approve/` へ移植する。**見た目（presentation）はプロトから移植し、結線（wiring）は既存の本番実装を再利用**する（二重保守の回避）。新規純ロジック `src/lib/growth/consult.ts` が本番の2系統データソース（`PendingItem` の revise 状態 / `DraftPreview` の advice・bodyComment）を統一相談ビューモデル `ConsultView` へ正規化し、状態を4値 `ConsultStatus`（requested/processing/presenting/failed）へ写像し、段階（構成案段階=revise / 下書き段階=overall+sentence）を出し分ける。

**Architecture:** 状態の真実は Notion 側ループプロパティにあり、それは既に `GET /api/growth/approve`→`PendingItem` と `GET /api/growth/draft`→`DraftPreview` 経由で UI に届いている。ドロワーは新しい状態ストアを持たず、この2系統から導出した `ConsultView[]` を表示し、依頼を既存 POST（`/api/growth/advise|revise|body-comment` と各 apply/dismiss）へ投げるだけ。結果は既存ポーリング（`useApproveBoard` / `useDraftPreview`）が `提示中` を取りに行く。advise の5エンドポイント結線は `AdviceCard.tsx` から `useAdviceConsult` へ抽出、bodyComment 結線は `InlineCommentReview.tsx` から `useBodyCommentConsult` へ抽出、revise は既存 `useReviseEditing` を流用する。`useConsult` オーケストレータがこの3フック＋`consult.ts`＋ドロワー開閉状態を束ねる。

**Tech Stack:** Next.js 16（App Router）/ React 19 / TypeScript strict / Tailwind CSS v4 / Framer Motion v12 / Vitest + React Testing Library / @tanstack/react-query。

## Global Constraints

- **正本仕様書:** `docs/superpowers/specs/2026-06-30-approve-consult-backend-integration-design.md`。突合表: `docs/superpowers/specs/2026-06-30-proto-backend-reconciliation.md`。型の正典は `scripts/growth/{advise,bodyComment,revise}.ts` の zod スキーマ（プロト型は捨てて寄せる）。
- TypeScript strict。`any` 禁止（`unknown`＋ナローイング）。型専用 import は必ず `import type`。`React.FC` 禁止（関数宣言＋`XxxProps` interface）。`@ts-ignore` 禁止（最後の手段は `@ts-expect-error`＋説明）。Boolean props は `is`/`has`/`should`/`can` 接頭。イベント props は `on`、ハンドラ関数は `handle` 接頭。
- イミュータブル更新のみ（スプレッドで新オブジェクト。既存配列/オブジェクトを破壊しない）。
- **テスト方針（重要・カバレッジ100%ゲート）:** Vitest の istanbul は `all:true` 未設定 → **テストが import したファイルだけ**が計測対象。新規純ロジック `src/lib/growth/consult.ts` は `consult.test.ts` で**100%カバレッジ**（statements/branches/functions/lines）。`consult.ts` は**型専用 import 以外を持ち込まない**（重いファイルを巻き込むと100%要求が波及する）。ドロワー/コンポーザ/フック等の薄い結線UIは本番 approve の既存方針どおり**無計測**（テストが import しない）。`vitest.config.ts` は変更しない。
- pull型非同期: 承認画面（Vercel）は Notion に依頼を書くだけ。重い処理は常駐PCループが拾う。即時応答前提のUIを作らない。`処理中`（=PCロック実行中・`*_BUSY_STATUSES`）の間は再依頼を無効化（多重依頼防止）。
- セキュリティ: クライアントは `authHeaders(token, ...)` で `Authorization: Bearer`、サーバは `verifyToken`。新しい認証経路を作らない。`APPROVE_AUTH_ENABLED` は本番ON前提。`MICROCMS_MANAGEMENT_API_KEY` は server-only（`NEXT_PUBLIC_` 禁止・本計画で新たに公開しない）。本ドロワーは既存の advise/revise/body-comment 系のみを叩き、publish 等の強権限には触れない。
- コミットメッセージは日本語・Conventional Commits + 末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- `next-env.d.ts`（自動生成）・`node_modules`（symlink）は**絶対にステージしない**。各コミットは対象ファイルを明示 `git add` する。
- **push しない・PR作らない**（ローカルコミットのみ）。
- 検証コマンド: 型 `npx tsc --noEmit -p tsconfig.json`、lint `npx eslint .`（`next lint` は Next16 で廃止）、テスト `npx vitest run`、開発サーバ `npx next dev --webpack`。

## 確定済み事実（コード調査で裏取り済み・実装時の前提）

- **advise 結線（抽出元）:** `src/app/growth/approve/AdviceCard.tsx`。叩く先は `/api/growth/advise`(依頼) / `/advise/dismiss` / `/advise/apply`(採用→反映依頼) / `/advise/apply/dismiss` / `/draft/edit`(本文反映保存)。入力は `{ pageId, instruction }`。結果は `DraftPreview.advice: AdviceView` と `DraftPreview.adviceApply: AdviceApplyView`。
- **bodyComment 結線（抽出元・新規実装は不要）:** `src/app/growth/approve/InlineCommentReview.tsx` に**完全に存在**。composer state（`comments: Record<string,string[]>` / `openFor` / `draft`）・`buildPayload(): BodyComment[]`・`POST /api/growth/body-comment {pageId, comments}`・`/body-comment/dismiss`・`applyNow()`（`applyBodyCommentProposal`→`/draft/edit`→dismiss）。アンカーは `extractReviewLines(bodyHtml)` の `excerpt`（完全文）。結果は `DraftPreview.bodyComment: BodyCommentView`（`status` / `proposal: BodyCommentProposalItem[]{commentIndex,before,after}`）。
- **revise 結線（流用）:** `src/app/growth/approve/hooks/useReviseEditing.ts`。`requestRevise(item)` が構成案セクションコメントを `{line: heading, comment}` へ展開し `POST /api/growth/revise {pageId, comments, titleInstruction?}`。`applyRevise(item, "apply"|"discard")` が `/revise/apply`。状態は `PendingItem.{reviseStatus, reviseProposal, reviseTitleProposal, reviseInstructions, reviseRequestedAtMs}`。`revisePhase(status)` が `idle/pending/ready/failed` を返す。
- **View 型のソース:** `AdviceView`=`@/lib/growth/advise`、`AdviceApplyView`=`@/lib/growth/adviseApply`、`BodyCommentView`=`@/lib/growth/bodyComment`。すべて `DraftPreview`（`src/app/growth/approve/draftTypes.ts`）が optional で保持。
- **状態写像:** Notion select 5値 `なし/依頼中/処理中/提示中/失敗`。`ConsultStatus` 4値へ → `なし`=（ビュー省略・初期） / `依頼中`=`requested` / `処理中`=`processing` / `提示中`=`presenting` / `失敗`=`failed`。`処理中` は `ADVISE_BUSY_STATUSES`/`BODY_COMMENT_BUSY_STATUSES`/`REVISE_BUSY_STATUSES` に含まれ再依頼禁止。
- **統合先:** `DraftReadyView.tsx`（`AdviceCard`=L81-88 / `InlineCommentReview`=L96-102 を個別 render）と `DetailPanelView.tsx`（`ReviseSectionView`=L267 経由で `ReviseReady` を render）。`ApproveClient.tsx`（`revise = useReviseEditing(...)` を L180 で生成し L797 で `DetailPanelView` へ渡す）。

---

## Phase 1 — 純ロジック `consult.ts`（TDD・100%カバレッジ）

> Phase 1 は型専用 import のみで完結し、本番UIに触れない。`consult.test.ts` で全分岐を固定する。`consult.ts` が import してよいのは `@/lib/growth/advise`・`@/lib/growth/adviseApply`・`@/lib/growth/bodyComment` の**型専用**と、本ファイル内型のみ。

### Task 1: ConsultStatus 写像 ＋ 段階判定（TDD）

**Files:**
- Create: `src/lib/growth/consult.ts`
- Create: `src/lib/growth/consult.test.ts`

**Interfaces:**
- Consumes: `type AdviceStatus`（=`"なし"|"依頼中"|"処理中"|"提示中"|"失敗"`、`@/lib/growth/advise`）。`BodyCommentStatus`・`ReviseStatus` は同一文字列ユニオンのため `AdviceStatus` を共通の `LoopStatus` 別名として再利用する。
- Produces:
  - `export type ConsultKind = "overall" | "revise" | "sentence";`
  - `export type ConsultStatus = "requested" | "processing" | "presenting" | "failed";`
  - `export type ConsultStage = "outline" | "draft";`（構成案段階=outline は revise のみ / 下書き段階=draft は overall+sentence）
  - `export function mapLoopStatus(status: string | undefined): ConsultStatus | null;`（`なし`/未知=null＝ビューに出さない）
  - `export function isConsultBusy(status: ConsultStatus | null): boolean;`（`requested`/`processing`/`presenting`=true＝再依頼不可。`failed`/null=false）
  - `export const STAGE_KINDS: Record<ConsultStage, readonly ConsultKind[]>;`（`outline:["revise"]` / `draft:["overall","sentence"]`）

- [ ] **Step 1: Red — 写像と busy 判定のテスト**

`src/lib/growth/consult.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";

import { isConsultBusy, mapLoopStatus, STAGE_KINDS } from "./consult";

describe("mapLoopStatus", () => {
  it("依頼中→requested / 処理中→processing / 提示中→presenting / 失敗→failed", () => {
    expect(mapLoopStatus("依頼中")).toBe("requested");
    expect(mapLoopStatus("処理中")).toBe("processing");
    expect(mapLoopStatus("提示中")).toBe("presenting");
    expect(mapLoopStatus("失敗")).toBe("failed");
  });

  it("なし/undefined/未知 は null（ビューに出さない）", () => {
    expect(mapLoopStatus("なし")).toBeNull();
    expect(mapLoopStatus(undefined)).toBeNull();
    expect(mapLoopStatus("謎")).toBeNull();
  });
});

describe("isConsultBusy", () => {
  it("requested/processing/presenting は再依頼不可（busy=true）", () => {
    expect(isConsultBusy("requested")).toBe(true);
    expect(isConsultBusy("processing")).toBe(true);
    expect(isConsultBusy("presenting")).toBe(true);
  });

  it("failed/null は再依頼可（busy=false）", () => {
    expect(isConsultBusy("failed")).toBe(false);
    expect(isConsultBusy(null)).toBe(false);
  });
});

describe("STAGE_KINDS", () => {
  it("構成案段階=revise のみ / 下書き段階=overall+sentence", () => {
    expect(STAGE_KINDS.outline).toEqual(["revise"]);
    expect(STAGE_KINDS.draft).toEqual(["overall", "sentence"]);
  });
});
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: FAIL（`consult.ts` 未作成）。

- [ ] **Step 2: Green — consult.ts に写像・busy・段階定数を実装**

`src/lib/growth/consult.ts` を新規作成:

```ts
/**
 * AI相談ドロワー（差分B）の純ロジック。
 * 本番の2系統（PendingItem の revise 状態 / DraftPreview の advice・bodyComment）を
 * 統一相談ビュー ConsultView へ正規化し、Notion ループステータスを4値 ConsultStatus へ写像し、
 * 段階（構成案=outline / 下書き=draft）を出し分ける。型専用 import のみ（カバレッジ100%ゲートを波及で壊さない）。
 */

import type { AdviceStatus } from "@/lib/growth/advise";

/** ループ共通のステータス文字列（advise/bodyComment/revise で同一の5値ユニオン）。 */
type LoopStatus = AdviceStatus;

/** 相談の3モード。 */
export type ConsultKind = "overall" | "revise" | "sentence";

/** 相談の状態（pull型4値）。requested=依頼中 / processing=PC処理中 / presenting=提示中 / failed=失敗。 */
export type ConsultStatus = "requested" | "processing" | "presenting" | "failed";

/** 段階。outline=構成案段階（revise）/ draft=下書き段階（overall+sentence）。 */
export type ConsultStage = "outline" | "draft";

const STATUS_MAP: Record<LoopStatus, ConsultStatus | null> = {
  なし: null,
  依頼中: "requested",
  処理中: "processing",
  提示中: "presenting",
  失敗: "failed",
};

/** Notion ループステータス→ConsultStatus。なし/未知は null（ビューに出さない）。 */
export function mapLoopStatus(status: string | undefined): ConsultStatus | null {
  if (status === undefined) return null;
  return STATUS_MAP[status as LoopStatus] ?? null;
}

/** 処理中/依頼中/提示中は再依頼不可。failed/null（未依頼）は再依頼可。 */
export function isConsultBusy(status: ConsultStatus | null): boolean {
  return status === "requested" || status === "processing" || status === "presenting";
}

/** 段階ごとに表示する相談モード。 */
export const STAGE_KINDS: Record<ConsultStage, readonly ConsultKind[]> = {
  outline: ["revise"],
  draft: ["overall", "sentence"],
};
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: PASS。

- [ ] **Step 3: Refactor — カバレッジ確認**

Run: `npx vitest run src/lib/growth/consult.test.ts --coverage`
Expected: `consult.ts` が 100%（statements/branches/functions/lines）。未到達分岐があれば Step 1 にテストを追加してから進む。

- [ ] **Step 4: Commit**

```bash
git add src/lib/growth/consult.ts src/lib/growth/consult.test.ts
git commit -m "feat(growth): 相談ドロワーの状態写像・段階判定の純ロジックを追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: advice 正規化（DraftPreview.advice → ConsultView）（TDD）

**Files:**
- Modify: `src/lib/growth/consult.ts`
- Modify: `src/lib/growth/consult.test.ts`

**Interfaces:**
- Consumes: `type AdviceView`（`@/lib/growth/advise`、`{status, advice: Advice|null, raw, requestedAtMs?}`）, `type AdviceApplyView`（`@/lib/growth/adviseApply`）。
- Produces:
  - `export interface ConsultView { kind: ConsultKind; status: ConsultStatus; }`（基底。各モードが結果型を足す判別ユニオン）
  - `export interface OverallConsultView { kind: "overall"; status: ConsultStatus; advice: Advice | null; raw: string; requestedAtMs: number | null; apply: AdviceApplyView | null; }`
  - `export function overallViewFrom(advice: AdviceView | undefined, apply: AdviceApplyView | undefined): OverallConsultView | null;`（status が null＝未依頼なら null）

- [ ] **Step 1: Red — advice 正規化テスト**

`consult.test.ts` に追記:

```ts
import { overallViewFrom } from "./consult";
import type { AdviceView } from "@/lib/growth/advise";

describe("overallViewFrom", () => {
  const advice = { summary: "良い", scores: [{ axis: "構成", score: 4 }], strengths: ["短文"], fixes: [] };

  it("提示中: status=presenting・advice/raw/requestedAtMs を透過し apply も載せる", () => {
    const view: AdviceView = { status: "提示中", advice, raw: "{...}", requestedAtMs: 1000 };
    const apply = { status: "なし" as const, proposal: [], raw: "" };
    const r = overallViewFrom(view, apply);
    expect(r).toEqual({ kind: "overall", status: "presenting", advice, raw: "{...}", requestedAtMs: 1000, apply });
  });

  it("依頼中: status=requested・advice=null", () => {
    const view: AdviceView = { status: "依頼中", advice: null, raw: "" };
    const r = overallViewFrom(view, undefined);
    expect(r?.status).toBe("requested");
    expect(r?.advice).toBeNull();
    expect(r?.requestedAtMs).toBeNull();
    expect(r?.apply).toBeNull();
  });

  it("なし/undefined は null（未依頼）", () => {
    expect(overallViewFrom({ status: "なし", advice: null, raw: "" }, undefined)).toBeNull();
    expect(overallViewFrom(undefined, undefined)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: FAIL。

- [ ] **Step 2: Green — overallViewFrom を実装**

`consult.ts` に追記（先頭 import に型を追加）:

```ts
import type { Advice, AdviceStatus, AdviceView } from "@/lib/growth/advise";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";
```

```ts
/** overall モードの相談ビュー（DraftPreview.advice/adviceApply 由来）。 */
export interface OverallConsultView {
  kind: "overall";
  status: ConsultStatus;
  /** 提示中で JSON 妥当時のみ非 null。 */
  advice: Advice | null;
  /** 失敗理由などの生テキスト。 */
  raw: string;
  /** 依頼時刻（ms）。滞留警告表示用。 */
  requestedAtMs: number | null;
  /** #165 採用→反映ビュー。未取得は null。 */
  apply: AdviceApplyView | null;
}

/** DraftPreview.advice/adviceApply → OverallConsultView。未依頼（なし）は null。 */
export function overallViewFrom(
  advice: AdviceView | undefined,
  apply: AdviceApplyView | undefined,
): OverallConsultView | null {
  const status = mapLoopStatus(advice?.status);
  if (status === null) return null;
  return {
    kind: "overall",
    status,
    advice: advice?.advice ?? null,
    raw: advice?.raw ?? "",
    requestedAtMs: advice?.requestedAtMs ?? null,
    apply: apply ?? null,
  };
}
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: PASS。

- [ ] **Step 3: Refactor — カバレッジ100%確認**

Run: `npx vitest run src/lib/growth/consult.test.ts --coverage`
Expected: `consult.ts` 100%。

- [ ] **Step 4: Commit**

```bash
git add src/lib/growth/consult.ts src/lib/growth/consult.test.ts
git commit -m "feat(growth): overall 相談の正規化（DraftPreview.advice→ConsultView）を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: revise 正規化（PendingItem → ConsultView）（TDD）

**Files:**
- Modify: `src/lib/growth/consult.ts`
- Modify: `src/lib/growth/consult.test.ts`

**Interfaces:**
- Consumes: `PendingItem` の revise 部分のみ（重い `@/lib/growth/approve` を import せず、必要フィールドだけの**ローカル型**で受ける）:
  `interface ReviseSource { reviseStatus?: string; reviseProposal?: string; reviseTitleProposal?: string; outline?: string; reviseRequestedAtMs?: number | null; }`
- Produces:
  - `export interface ReviseConsultView { kind: "revise"; status: ConsultStatus; currentOutline: string; outlineProposal: string; titleProposal: string; requestedAtMs: number | null; }`
  - `export function reviseViewFrom(src: ReviseSource): ReviseConsultView | null;`（status null＝未依頼は null）

> 失敗時 `reviseProposal` には理由文字列が入る（既存 `ReviseFailed` の `reason=item.reviseProposal` を踏襲）。ビューでは `status==="failed"` のとき `outlineProposal` を理由として扱う（コンポーネント側で分岐）。

- [ ] **Step 1: Red — revise 正規化テスト**

`consult.test.ts` に追記:

```ts
import { reviseViewFrom } from "./consult";

describe("reviseViewFrom", () => {
  it("提示中: presenting・現構成/構成案/タイトル案を透過", () => {
    const r = reviseViewFrom({
      reviseStatus: "提示中",
      outline: "現構成",
      reviseProposal: "新構成",
      reviseTitleProposal: "新タイトル",
      reviseRequestedAtMs: 2000,
    });
    expect(r).toEqual({
      kind: "revise",
      status: "presenting",
      currentOutline: "現構成",
      outlineProposal: "新構成",
      titleProposal: "新タイトル",
      requestedAtMs: 2000,
    });
  });

  it("依頼中: requested・欠落フィールドは空文字/null", () => {
    const r = reviseViewFrom({ reviseStatus: "依頼中" });
    expect(r?.status).toBe("requested");
    expect(r?.currentOutline).toBe("");
    expect(r?.outlineProposal).toBe("");
    expect(r?.titleProposal).toBe("");
    expect(r?.requestedAtMs).toBeNull();
  });

  it("なし/undefined は null（未依頼）", () => {
    expect(reviseViewFrom({ reviseStatus: "なし" })).toBeNull();
    expect(reviseViewFrom({})).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: FAIL。

- [ ] **Step 2: Green — reviseViewFrom を実装**

`consult.ts` に追記:

```ts
/** PendingItem の revise 関連フィールド（重い型を避けるための最小サブセット）。 */
export interface ReviseSource {
  reviseStatus?: string;
  reviseProposal?: string;
  reviseTitleProposal?: string;
  outline?: string;
  reviseRequestedAtMs?: number | null;
}

/** revise モードの相談ビュー（PendingItem 由来）。 */
export interface ReviseConsultView {
  kind: "revise";
  status: ConsultStatus;
  currentOutline: string;
  /** 提示中=新構成案 / 失敗時=理由文字列。 */
  outlineProposal: string;
  titleProposal: string;
  requestedAtMs: number | null;
}

/** PendingItem の revise 状態 → ReviseConsultView。未依頼（なし）は null。 */
export function reviseViewFrom(src: ReviseSource): ReviseConsultView | null {
  const status = mapLoopStatus(src.reviseStatus);
  if (status === null) return null;
  return {
    kind: "revise",
    status,
    currentOutline: src.outline ?? "",
    outlineProposal: src.reviseProposal ?? "",
    titleProposal: src.reviseTitleProposal ?? "",
    requestedAtMs: src.reviseRequestedAtMs ?? null,
  };
}
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: PASS。

- [ ] **Step 3: Refactor — カバレッジ100%確認**

Run: `npx vitest run src/lib/growth/consult.test.ts --coverage`
Expected: `consult.ts` 100%。

- [ ] **Step 4: Commit**

```bash
git add src/lib/growth/consult.ts src/lib/growth/consult.test.ts
git commit -m "feat(growth): revise 相談の正規化（PendingItem→ConsultView）を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: bodyComment 正規化（DraftPreview.bodyComment → ConsultView）（TDD）

**Files:**
- Modify: `src/lib/growth/consult.ts`
- Modify: `src/lib/growth/consult.test.ts`

**Interfaces:**
- Consumes: `type BodyCommentView`（`@/lib/growth/bodyComment`、`{status, comments, proposal: BodyCommentProposalItem[], raw}`）。
- Produces:
  - `export interface SentenceConsultView { kind: "sentence"; status: ConsultStatus; proposal: BodyCommentProposalItem[]; raw: string; }`
  - `export function sentenceViewFrom(bodyComment: BodyCommentView | undefined): SentenceConsultView | null;`（status null＝未依頼は null）

- [ ] **Step 1: Red — sentence 正規化テスト**

`consult.test.ts` に追記:

```ts
import { sentenceViewFrom } from "./consult";

describe("sentenceViewFrom", () => {
  const proposal = [{ commentIndex: 0, before: "古い文", after: "新しい文" }];

  it("提示中: presenting・proposal/raw を透過", () => {
    const r = sentenceViewFrom({ status: "提示中", comments: [], proposal, raw: "" });
    expect(r).toEqual({ kind: "sentence", status: "presenting", proposal, raw: "" });
  });

  it("失敗: failed・raw に理由", () => {
    const r = sentenceViewFrom({ status: "失敗", comments: [], proposal: [], raw: "解釈失敗" });
    expect(r?.status).toBe("failed");
    expect(r?.raw).toBe("解釈失敗");
  });

  it("なし/undefined は null（未依頼）", () => {
    expect(sentenceViewFrom({ status: "なし", comments: [], proposal: [], raw: "" })).toBeNull();
    expect(sentenceViewFrom(undefined)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: FAIL。

- [ ] **Step 2: Green — sentenceViewFrom を実装**

`consult.ts` に追記（import に型追加）:

```ts
import type { BodyCommentProposalItem, BodyCommentView } from "@/lib/growth/bodyComment";
```

```ts
/** sentence モードの相談ビュー（DraftPreview.bodyComment 由来）。 */
export interface SentenceConsultView {
  kind: "sentence";
  status: ConsultStatus;
  /** 提示中の before/after 案。 */
  proposal: BodyCommentProposalItem[];
  /** 失敗理由などの生テキスト。 */
  raw: string;
}

/** DraftPreview.bodyComment → SentenceConsultView。未依頼（なし）は null。 */
export function sentenceViewFrom(
  bodyComment: BodyCommentView | undefined,
): SentenceConsultView | null {
  const status = mapLoopStatus(bodyComment?.status);
  if (status === null) return null;
  return {
    kind: "sentence",
    status,
    proposal: bodyComment?.proposal ?? [],
    raw: bodyComment?.raw ?? "",
  };
}
```

Run: `npx vitest run src/lib/growth/consult.test.ts`
Expected: PASS。

- [ ] **Step 3: Refactor — カバレッジ100%確認**

Run: `npx vitest run src/lib/growth/consult.test.ts --coverage`
Expected: `consult.ts` 100%。

- [ ] **Step 4: Commit**

```bash
git add src/lib/growth/consult.ts src/lib/growth/consult.test.ts
git commit -m "feat(growth): sentence 相談の正規化（DraftPreview.bodyComment→ConsultView）を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — 既存結線の抽出（挙動不変・既存テスト緑）

> 各モードの依頼/ポーリング/採用/破棄ロジックを**新規実装せず**、本番の既存実装をフックへ抽出する。抽出は純リファクタ（挙動不変）。抽出フック・移植コンポーネントは無計測（テストが import しない薄い結線）。

### Task 5: AdviceCard の advise 5エンドポイント結線を `useAdviceConsult` へ抽出

**Files:**
- Create: `src/app/growth/approve/hooks/useAdviceConsult.ts`
- Modify: `src/app/growth/approve/AdviceCard.tsx`

**Interfaces:**
- Consumes: `{ pageId: string; token: string; advice?: AdviceView; adviceApply?: AdviceApplyView; bodyHtml?: string; onChanged: () => void }`
- Produces（`AdviceCard.tsx` の現ロジックをそのまま移す）:
  ```ts
  return {
    instruction: string,
    setInstruction: (v: string) => void,
    busy: boolean,
    error: string,
    adopted: ReadonlySet<number>,
    toggleAdopt: (index: number) => void,
    requestAdvice: () => void,        // POST /api/growth/advise
    dismiss: () => void,              // POST /api/growth/advise/dismiss
    submitApply: () => void,          // POST /api/growth/advise/apply
    dismissApply: () => void,         // POST /api/growth/advise/apply/dismiss
    applyNow: () => Promise<void>,    // applyAdviceItems → /draft/edit → /advise/apply/dismiss
  }
  ```

- [ ] **Step 1: useAdviceConsult.ts を新規作成（AdviceCard から state/関数を移植）**

`AdviceCard.tsx` の以下を**逐語移設**: `instruction`/`busy`/`error`/`adopted` state、`postJson`・`requestAdvice`・`dismiss`・`toggleAdopt`・`submitApply`・`dismissApply`・`applyNow`（L56-148）。import は `applyAdviceItems`(`@/lib/growth/adviseApply`)・`readJsonObject`(`@/lib/growth/safeJson`)・`authHeaders`(`../authHeaders`)。引数 `UseAdviceConsultParams` で `pageId/token/advice/adviceApply/bodyHtml/onChanged` を受け、上記オブジェクトを返す。

- [ ] **Step 2: AdviceCard.tsx を抽出フック利用へ書き換え**

`AdviceCard.tsx` の上記ロジックを削除し、`const { instruction, setInstruction, busy, error, adopted, toggleAdopt, requestAdvice, dismiss, submitApply, dismissApply, applyNow } = useAdviceConsult({ pageId, token, advice, adviceApply, bodyHtml, onChanged });` に置換。render（`renderFix`/`renderAdvice`/`renderApplySection`/`renderBody`）は**未変更**（同じローカル変数名で参照できるよう保つ）。

- [ ] **Step 3: 型チェック ＋ 既存テスト**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx vitest run src/app/growth/approve`
Expected: 既存 AdviceCard 関連テストが緑（挙動不変）。失敗時は抽出の取りこぼし（依存配列・初期値）を修正。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/hooks/useAdviceConsult.ts src/app/growth/approve/AdviceCard.tsx
git commit -m "refactor(growth): AdviceCard の advise 結線を useAdviceConsult へ抽出（挙動不変）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: InlineCommentReview の bodyComment 結線を `useBodyCommentConsult` へ抽出

> 本文コメント入力配線は**新規実装不要**。`InlineCommentReview.tsx` に完全に存在する。これをフックへ抽出する。

**Files:**
- Create: `src/app/growth/approve/hooks/useBodyCommentConsult.ts`
- Modify: `src/app/growth/approve/InlineCommentReview.tsx`

**Interfaces:**
- Consumes: `{ pageId: string; token: string; bodyHtml: string; bodyComment?: BodyCommentView; onChanged: () => void }`
- Produces（`InlineCommentReview.tsx` の現ロジックをそのまま移す）:
  ```ts
  return {
    comments: Record<string, string[]>,
    openFor: string | null,
    draft: string,
    setDraft: (v: string) => void,
    busy: boolean,
    error: string,
    openComposer: (key: string) => void,
    addComment: (key: string) => void,
    removeComment: (key: string, idx: number) => void,
    closeComposer: () => void,            // setOpenFor(null) を関数化
    buildPayload: () => BodyComment[],    // lines は引数で受ける（後述）
    requestAi: () => Promise<void>,       // POST /api/growth/body-comment
    dismiss: () => Promise<void>,         // POST /api/growth/body-comment/dismiss
    applyNow: () => Promise<void>,        // applyBodyCommentProposal → /draft/edit → dismiss
  }
  ```
  > `buildPayload`・`requestAi` は `extractReviewLines(bodyHtml)` の結果に依存する。フックは `bodyHtml` を受け取り内部で `extractReviewLines` を呼ぶ（純関数なので再計算してよい）。`lineKey` ヘルパもフックへ移す。

- [ ] **Step 1: useBodyCommentConsult.ts を新規作成（InlineCommentReview から state/関数を移植）**

`InlineCommentReview.tsx` の以下を**逐語移設**: `comments`/`openFor`/`draft`/`busy`/`error` state、`lineKey`・`openComposer`・`addComment`・`removeComment`・`buildPayload`・`post`・`requestAi`・`dismiss`・`applyNow`（L59-164）。import は `applyBodyCommentProposal`・`extractReviewLines`・型 `BodyComment`(`@/lib/growth/bodyComment`)・`readJsonObject`・`authHeaders`。`requestAi` 成功後の `setComments({})` も保持。

- [ ] **Step 2: InlineCommentReview.tsx を抽出フック利用へ書き換え**

`InlineCommentReview.tsx` の上記ロジックを削除し、`const ic = useBodyCommentConsult({ pageId, token, bodyHtml, bodyComment, onChanged });` に置換。render は `lines`・`status`・`proposal`・`canComment` を保ちつつ、入力系を `ic.*` に差し替える（`closeComposer`＝`setOpenFor(null)` の置換含む）。render 構造は未変更。

- [ ] **Step 3: 型チェック ＋ 既存テスト**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx vitest run src/app/growth/approve`
Expected: 既存 InlineCommentReview 関連テストが緑（挙動不変）。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/hooks/useBodyCommentConsult.ts src/app/growth/approve/InlineCommentReview.tsx
git commit -m "refactor(growth): InlineCommentReview の本文コメント結線を useBodyCommentConsult へ抽出（挙動不変）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — プロト presentation 移植（backend 型へ adapt）

> プロトの提示本体を本番 `src/app/growth/approve/consult/` へ移植する。**プロト型を捨てて backend 型へ寄せる**（§4.1 B1〜B8）。proto 版はそのまま残置（参照断ち切りのみ）。これらは無計測の薄い表示UI。

### Task 7: AdviceResultBody 移植（backend Advice 型）

**Files:**
- Create: `src/app/growth/approve/consult/AdviceResultBody.tsx`

**移植元:** `src/app/growth/approve-proto/AdviceResultBody.tsx`（見た目のみ）

**適用する型変更（プロト→backend・§4.1 B1〜B3）:**

| プロト（捨てる） | backend（採用） | 表示の対応 |
|---|---|---|
| `advice.overall: number`（0-100, RingScore） | `advice.summary: string` | 総評見出しを `summary` テキストに置換（RingScore は撤去） |
| `score.label` / `score: number`(0-100) | `score.axis` / `score: number`(0-5) / `note?` | `axis` ラベル・`score/5` 表示・`note` を括弧書き |
| `fix.quote`(必須) / `reason` / `suggestion` | `fix.area`(必須) / `severity`("高"\|"中"\|"低") / `quote?` / `reason` / `suggestion` | severity バッジ＋area ラベル追加・quote を optional 表示 |

**Interfaces:**
- Consumes（本番版 props）: `{ advice: Advice; adopted: ReadonlySet<number>; selectable: boolean; classifications: { applicable: boolean; reason?: string }[]; onToggleAdopt: (index: number) => void }`
  > 採用チェックの可否判定（`classifyFix`/`FIX_REASON_NO_QUOTE`、`@/lib/growth/adviseApply`）は本番 `AdviceCard.renderAdvice` の既存ロジックを踏襲。SEVERITY バッジ配色は `AdviceCard` の `SEVERITY_CLASS`（高=red/中=amber/低=gray）を再利用。
- Produces: 総評(summary) + スコア grid（axis n/5・note）+ 強み bullet + 直すべき点（severity バッジ＋area＋quote?＋reason＋suggestion＋採用チェック）。

- [ ] **Step 1: AdviceResultBody.tsx を新規作成（プロト見た目＋backend 型）**

プロト `AdviceResultBody` のレイアウトを基に、上表の型へ adapt。`Advice` 型は `@/lib/growth/advise` から `import type`。severity/area/scores(0-5)/note は本番 `AdviceCard.renderFix`/`renderAdvice`（L158-256）の表示と整合させる。

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve/consult/AdviceResultBody.tsx
git commit -m "feat(growth): 相談ドロワーの AdviceResultBody を backend Advice 型で移植

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: SentenceFixBody ＋ ReviseProposalBody 移植（backend 型へ adapt）

**Files:**
- Create: `src/app/growth/approve/consult/SentenceFixBody.tsx`
- Create: `src/app/growth/approve/consult/ReviseProposalBody.tsx`

**移植元:** `approve-proto/SentenceFixBody.tsx` / `approve-proto/ReviseProposalBody.tsx`

**適用する型変更（§4.1 B5/B6/B7）:**

| 対象 | プロト（捨てる） | backend（採用） |
|---|---|---|
| SentenceFix | `BodyCommentFix{block, from, to, sentence}` | `BodyCommentProposalItem{commentIndex, before, after}`（`@/lib/growth/bodyComment`） |
| ReviseProposal | `ReviseProposal{outline?, title?, body?}`（body あり） | `{ currentOutline, outlineProposal, titleProposal }`（body ルート無し・タイトル/構成のみ） |

**Interfaces:**
- SentenceFixBody Consumes: `{ proposal: BodyCommentProposalItem[]; busy: boolean; onApplyAll: () => void }`。表示は本番 `InlineCommentReview` の提示中ブロック（L197-225・`before`/`after` のタグ除去＋`structureNote`）を踏襲。**反映は決定的一括**（`applyBodyCommentProposal`）のため個別 apply/dismiss ボタンは置かず「本文へ反映（n）」1本（既存挙動）。
- ReviseProposalBody Consumes: `{ currentOutline: string; outlineProposal: string; titleProposal: string; busy: boolean; onApply: () => void; onDiscard: () => void }`。表示は本番 `ReviseReady.tsx`（title案/outline案の元→新 grid＋`WordDiffView`）を踏襲。`onApply`/`onDiscard` は revise 全体に対する1操作（`applyRevise(item,"apply"|"discard")`）。

- [ ] **Step 1: SentenceFixBody.tsx を新規作成**

`InlineCommentReview` の提示UI（`structureNote` 含む）を切り出し、`proposal: BodyCommentProposalItem[]` を受けて before/after を描画。`onApplyAll` で「本文へ反映」。

- [ ] **Step 2: ReviseProposalBody.tsx を新規作成**

`ReviseReady` のレイアウトを基に `currentOutline/outlineProposal/titleProposal` を受ける。`WordDiffView`（既存 `@/app/growth/approve` 内）を流用。`status==="failed"` 時の理由表示は呼び出し側（ConsultCard）が `outlineProposal` を理由として渡す分岐で扱う。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/SentenceFixBody.tsx src/app/growth/approve/consult/ReviseProposalBody.tsx
git commit -m "feat(growth): 相談ドロワーの SentenceFixBody/ReviseProposalBody を backend 型で移植

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: CommentableBody ＋ ConsultComposer 移植（revise=行コメントフォーム）

**Files:**
- Create: `src/app/growth/approve/consult/CommentableBody.tsx`
- Create: `src/app/growth/approve/consult/ConsultComposer.tsx`

**移植元:** `approve-proto/CommentableBody.tsx` / `approve-proto/ConsultComposer.tsx`

**適用する型変更（§4.1 B4/B6/B7）:**
- CommentableBody（sentence 入力）: プロト `onAddComment(block, unit, text)` → 本番は `extractReviewLines(bodyHtml)` の行（`blockIndex`/`excerpt`(完全文)）に対し `useBodyCommentConsult` の `openComposer/addComment/removeComment`（key=`${blockIndex}::${excerpt}`）を使う。これは Task 6 で抽出済みの `InlineCommentReview` 行レンダリングそのもの → **CommentableBody は `InlineCommentReview` の行リスト部分の再利用/薄いラップ**でよい（重複実装を避ける）。
- ConsultComposer（モード別フォーム）:
  - overall: `instruction`（任意・MAX 500）テキストエリア → `onSubmitOverall(focus)`。
  - revise: **1テキストエリアではなく行コメントフォーム**（§4.1 B6）。構成案セクション（`outlineSections(item.outline)`）ごとのコメント＋タイトル指示。**既存 `ReviseCommentForm`/`Section` を流用**（`useReviseEditing` の `draftComments`/`startAddComment`/`saveComment`/`titleRevisePrompt`/`requestRevise`）。ReviseTarget は `outline`/`title` のみ（body ルート無し・本文修正は sentence へ誘導）。
  - sentence: CommentableBody の「AIに指摘を依頼（n）」→ `onSubmitSentence`。

**Interfaces:**
- ConsultComposer Consumes: `{ mode: ConsultKind; item: PendingItem; bodyHtml: string; advice: ReturnType<typeof useAdviceConsult>; bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>; revise: ReturnType<typeof useReviseEditing> }`。各モードで対応フックの入力UIを描画。
- CommentableBody Consumes: `{ bodyHtml: string; bodyCommentConsult: ReturnType<typeof useBodyCommentConsult> }`。

- [ ] **Step 1: CommentableBody.tsx を新規作成**

`InlineCommentReview` の行リスト（`lines.map` 部分・L227-306）を抽出して `bodyCommentConsult` を受けるコンポーネントにする（`InlineCommentReview` 自体も後で ConsultDrawer 統合時に撤去するため、行リストはここへ集約）。

- [ ] **Step 2: ConsultComposer.tsx を新規作成（モード別フォーム）**

`mode` で overall（advice 入力）/ revise（`ReviseCommentForm` 流用）/ sentence（`CommentableBody`）を出し分ける。revise フォームは `ReviseSectionView.renderReviseCommentForm` の構造を踏襲。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/CommentableBody.tsx src/app/growth/approve/consult/ConsultComposer.tsx
git commit -m "feat(growth): 相談ドロワーの CommentableBody/ConsultComposer を移植（revise=行コメント）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: ConsultCard ＋ ConsultDrawer 移植（段階タブ・backend 型コールバック）

**Files:**
- Create: `src/app/growth/approve/consult/ConsultCard.tsx`
- Create: `src/app/growth/approve/consult/ConsultDrawer.tsx`

**移植元:** `approve-proto/ConsultCard.tsx` / `approve-proto/ConsultDrawer.tsx`

**Interfaces:**
- ConsultCard Consumes: `{ view: OverallConsultView | ReviseConsultView | SentenceConsultView; busy: boolean; onReload: () => void; onAdviceDismiss: () => void; onAdviceSubmitApply: () => void; onAdviceDismissApply: () => void; onAdviceApplyNow: () => void; onReviseApply: () => void; onReviseDiscard: () => void; onSentenceApplyAll: () => void; onRetry: () => void; ...AdviceResultBody に必要な adopted/selectable/classifications/onToggleAdopt }`。`view.status`（requested/processing/presenting/failed）で出し分け: requested/processing=待ち（再読み込みボタン）/ presenting=各 `*Body` / failed=理由＋再依頼。`view.kind` で `AdviceResultBody`/`ReviseProposalBody`/`SentenceFixBody` を選ぶ（判別ユニオン）。
- ConsultDrawer Consumes: `{ open: boolean; stage: ConsultStage; mode: ConsultKind; views: (OverallConsultView|ReviseConsultView|SentenceConsultView)[]; composer: ReactNode; onModeChange: (mode: ConsultKind) => void; onClose: () => void }`。タブは `STAGE_KINDS[stage]`（outline=revise のみ / draft=overall+sentence）で出す（段階出し分け）。右レール `motion.aside`（プロトのレイアウト流用）。配色は本番 approve のクラス（Tailwind ユーティリティ）に合わせ、proto の `var(--p-*)` カスタムプロパティは本番トークン or 既存クラスへ置換。

- [ ] **Step 1: ConsultCard.tsx を新規作成（status×kind 出し分け）**

`view.status` で待ち/提示/失敗、`view.kind` で本体コンポーネントを選ぶ。busy（`isConsultBusy` 由来）中の再依頼ボタン無効化を反映。

- [ ] **Step 2: ConsultDrawer.tsx を新規作成（段階タブ）**

`STAGE_KINDS[stage]` でタブを生成。`views` を `ConsultCard` リストへ。`composer` は親（useConsult 経由の ConsultComposer）を slot で受ける。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve/consult/ConsultCard.tsx src/app/growth/approve/consult/ConsultDrawer.tsx
git commit -m "feat(growth): 相談ドロワーの ConsultCard/ConsultDrawer を移植（段階タブ・backend型）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — オーケストレータ ＋ 統合 ＋ 旧サーフェス撤去

### Task 11: `useConsult` オーケストレータ（consult.ts ＋ 抽出フック ＋ ドロワー状態）

**Files:**
- Create: `src/app/growth/approve/hooks/useConsult.ts`

**Interfaces:**
- Consumes: `{ item: PendingItem; token: string; draft: DraftPreview | null; onReloadDraft: () => void; revise: ReturnType<typeof useReviseEditing> }`
- Produces:
  ```ts
  return {
    open: boolean,
    stage: ConsultStage,                 // draft があるなら "draft" / なければ "outline"
    mode: ConsultKind,
    setMode: (mode: ConsultKind) => void,
    openDrawer: () => void,
    closeDrawer: () => void,
    views: (OverallConsultView | ReviseConsultView | SentenceConsultView)[],  // 正規化結果（null を除く）
    advice: ReturnType<typeof useAdviceConsult>,
    bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>,
    revise: ReturnType<typeof useReviseEditing>,  // 透過
  }
  ```
- 実装: `open`/`mode` を `useState`。`stage` は `draft ? "draft" : "outline"`。`mode` 初期値は `STAGE_KINDS[stage][0]`。`views` は `[overallViewFrom(draft?.advice, draft?.adviceApply), reviseViewFrom(item), sentenceViewFrom(draft?.bodyComment)].filter((v): v is NonNullable<typeof v> => v !== null)`。`useAdviceConsult`/`useBodyCommentConsult` を `bodyHtml=draft?.bodyHtml ?? ""`・`onChanged=onReloadDraft` で生成。revise は引数透過。

- [ ] **Step 1: useConsult.ts を新規作成**

上記シグネチャで実装。`overallViewFrom`/`reviseViewFrom`/`sentenceViewFrom`/`STAGE_KINDS`/型は `@/lib/growth/consult` から import。`useAdviceConsult`/`useBodyCommentConsult` を結線。

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve/hooks/useConsult.ts
git commit -m "feat(growth): 相談ドロワーのオーケストレータ useConsult を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: DraftReadyView / DetailPanelView / ApproveClient 統合・旧 render 撤去・ReviseReady 削除

**Files:**
- Modify: `src/app/growth/approve/DraftReadyView.tsx`
- Modify: `src/app/growth/approve/DetailPanelView.tsx`
- Modify: `src/app/growth/approve/ReviseSectionView.tsx`
- Modify: `src/app/growth/approve/ApproveClient.tsx`
- Delete: `src/app/growth/approve/ReviseReady.tsx`
- Modify（既存テスト移設）: `src/app/growth/approve/ApproveClient.test.tsx` 他、撤去サーフェスを参照するテスト

**統合方針:**
- 「AIに相談」起点ボタンを詳細パネルに配置 → `ConsultDrawer` を開く。`useConsult` は `DetailPanelView`（item/draft が揃う層）で生成し、`ConsultDrawer`＋`ConsultComposer` を render。
- `DraftReadyView.tsx`: `AdviceCard`（L81-88）と `InlineCommentReview`（L96-102）の個別 render を**撤去**（相談はドロワーへ集約）。`DecorationAssistant`（装飾=差分C・別枠）は**残す**。
- `DetailPanelView.tsx`: `ReviseSectionView`（L267）の revise 提示/依頼をドロワーへ移すため、`reviseSection` の提示/依頼フォーム分岐をドロワー経由に変更。`ReviseSectionView` 内の `renderReviseReady`/`renderReviseFailed`/`renderRevisePending`/`renderReviseCommentForm` はドロワーの ConsultCard/ConsultComposer に置換。タイトル直接編集（`ReviseSection` の `editingTitle`）は revise 相談とは独立した直接保存なので**残してよい**（YAGNI: 初版はタイトル直接編集を ReviseSection に残置）。
- `ReviseReady.tsx` を**削除**（提示は `ReviseProposalBody` に一本化）。`WordDiffView` を `ReviseReady` だけが使っていた場合は移植先（`ReviseProposalBody`）へ参照を移す（`WordDiffView` 自体は残す）。
- `ApproveClient.tsx`: `revise = useReviseEditing(...)`（L180）は維持し `DetailPanelView` へ渡す（useConsult が透過利用）。撤去なし。

- [ ] **Step 1: DraftReadyView から AdviceCard/InlineCommentReview の個別 render と import を撤去**

L81-88（AdviceCard）と L96-102（InlineCommentReview）を削除。import（L11 `AdviceCard`・L18 `InlineCommentReview`）も削除。`DecorationAssistant`・`DraftPreviewPane`・`PublishCloseActions` は残す。

- [ ] **Step 2: DetailPanelView に useConsult ＋「AIに相談」ボタン ＋ ConsultDrawer を統合**

`useConsult({ item, token, draft: draftState.status==="ready" ? draftState.draft : null, onReloadDraft: () => onReloadDraft(item.id), revise })` を呼ぶ。詳細パネルに「AIに相談」ボタン（`openDrawer`）を追加。`ConsultDrawer`（`composer={<ConsultComposer ... />}`）を render。**確定方針: revise の「AI修正の依頼フォーム＋提示/失敗/処理中」はすべてドロワー（ConsultComposer/ConsultCard）へ移し、`ReviseSectionView` からは撤去する。`ReviseSectionView` には手動編集（タイトル直接編集・構成案セクションの手動編集・画像指示）のみを残す**（これらはプロトの相談ドロワーに無い独立機能のため分離する＝YAGNI）。

- [ ] **Step 3: ReviseSectionView から ReviseReady 依存を撤去**

**確定: AI修正系の render をすべて ReviseSectionView から撤去する。** `renderReviseReady`（L165-177）・`renderReviseFailed`・`renderRevisePending`・`renderReviseCommentForm`（AI修正の依頼フォーム）と `import { ReviseReady }`（L11）を削除（提示=ConsultCard、依頼=ConsultComposer がドロワーで担う）。`ReviseSectionView` に**残すのは手動編集のみ**: タイトル直接編集（`editingTitle`/`saveTitle`）・構成案セクションの手動編集（`startEditSection`/`saveSection`）・画像指示（`startAddImage`/`saveImage`）。`useReviseEditing` の AI修正系メソッド（`requestRevise`/`applyRevise`）は `useConsult`→ドロワー側が呼ぶ（フック自体は共有のまま）。

- [ ] **Step 4: ReviseReady.tsx を削除**

```bash
git rm src/app/growth/approve/ReviseReady.tsx
```
`WordDiffView` import が宙に浮かないことを確認（`ReviseProposalBody` へ移管済み）。

- [ ] **Step 5: 壊れた既存テストの移設・更新**

`ApproveClient.test.tsx` 他で `ReviseReady`・`AdviceCard`・`InlineCommentReview` の DraftReadyView 内 render を前提にするケースを、ドロワー経由の起点（「AIに相談」ボタン→ドロワー内表示）へ更新する。revise 提示の検証は ConsultDrawer 経由に移設。削除コンポーネントを参照するテストは削除/移設。

- [ ] **Step 6: 型チェック ＋ lint ＋ 全テスト**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx eslint .`
Run: `npx vitest run`
Expected: すべて緑。カバレッジ100%維持（`consult.ts` は Phase 1 で100%・薄い結線は無計測）。

- [ ] **Step 7: Commit**

```bash
git add src/app/growth/approve/DraftReadyView.tsx src/app/growth/approve/DetailPanelView.tsx src/app/growth/approve/ReviseSectionView.tsx src/app/growth/approve/ApproveClient.tsx src/app/growth/approve/ApproveClient.test.tsx
git commit -m "feat(growth): AI相談ドロワーを承認画面へ統合し旧サーフェス（AdviceCard/InlineCommentReview/ReviseReady）を撤去

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: 最終検証

**Files:** （変更なし・検証のみ）

- [ ] **Step 1: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS（`any`/`@ts-ignore` 無し・`import type` 徹底）。

- [ ] **Step 2: lint**

Run: `npx eslint .`
Expected: 0 errors（`React.FC` 無し・命名規約・import 順）。

- [ ] **Step 3: 全テスト ＋ カバレッジ**

Run: `npx vitest run --coverage`
Expected: 全 PASS。`src/lib/growth/consult.ts` が 100%（statements/branches/functions/lines）。他ファイルのカバレッジゲートを下げていない（薄い結線UIは無計測のまま）。

- [ ] **Step 4: 残存参照チェック（旧サーフェス撤去の取りこぼし防止）**

Run: `grep -rn "ReviseReady" src/app/growth/approve/`（`ReviseReady.tsx` 削除後の宙吊り import が無いこと）
Run: `grep -rn "AdviceCard\|InlineCommentReview" src/app/growth/approve/DraftReadyView.tsx`（DraftReadyView から撤去済みであること＝ヒット0）
Expected: 宙吊り参照なし。

- [ ] **Step 5: 手動確認の引き継ぎ**

ブラウザ動作確認はユーザーが実施（`npx next dev --webpack` → `/growth/approve`）。確認観点を最終報告に記す: 構成案段階で revise タブのみ・下書き段階で overall+sentence タブ・処理中の再依頼無効化・提示→反映・失敗→再依頼。

---

## Self-Review（writing-plans）

### Spec coverage（設計書の各節 → タスク対応）

- §3.1 Option Y（presentation 移植・wiring 再利用）→ Task 5/6（抽出）・Task 7-10（移植）。
- §4.1 B1-B3（Advice 型）→ Task 7。B4/B5（bodyComment 型）→ Task 4・Task 8/9。B6/B7（revise=行コメント・body ルート無し）→ Task 9。B8（4値写像・処理中=再依頼禁止）→ Task 1（`mapLoopStatus`/`isConsultBusy`）。
- §3 状態を二重に持たない（PendingItem/DraftPreview から導出）→ Task 2/3/4（正規化）・Task 11（views 合成）。
- §5 新規ファイル（consult.ts/test）→ Phase 1。移植コンポーネント→ Phase 3。改修（useConsult・ApproveClient・DraftReadyView・ReviseReady 削除）→ Phase 4。
- §8 テスト（consult.ts 100%・薄い結線無計測・既存テスト移設）→ Task 1-4（100%）・Task 5/6（既存緑）・Task 12 Step 5（移設）。
- §7 認証（authHeaders/verifyToken 流用・新経路なし）→ 抽出フックは既存 `authHeaders` をそのまま移送（Task 5/6）。

### Placeholder scan

「TBD」「適切にエラー処理」等のプレースホルダ無し。`consult.ts` とテストは完全コード。移植タスクは移植元ファイル＋型変更表（具体）＋結線先フック＋統合 file:line を明示。

### Type consistency（タスク間の型・関数名の一貫性）

- `ConsultKind`/`ConsultStatus`/`ConsultStage`/`mapLoopStatus`/`isConsultBusy`/`STAGE_KINDS`（Task 1）→ Task 7-11 で一貫使用。
- `OverallConsultView`/`ReviseConsultView`/`SentenceConsultView` ＋ `overallViewFrom`/`reviseViewFrom`/`sentenceViewFrom`（Task 2/3/4）→ Task 10/11 の判別ユニオンで一貫使用。
- `useAdviceConsult`/`useBodyCommentConsult`（Task 5/6）→ Task 9/11 で参照。
- backend 型: `Advice`/`AdviceView`/`AdviceApplyView`/`BodyCommentView`/`BodyCommentProposalItem`/`ReviseSource` のソースを各タスクで明示（`@/lib/growth/advise`・`adviseApply`・`bodyComment`・ローカル）。
