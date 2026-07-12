# 承認画面 proto 移植 P1: シェル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 承認画面ルートを `.approve-shell` でダーク化し、proto のシェルクロム（TopBar / LeftRail / ShortcutBar / ShortcutOverlay / BulkBar）と 5 view ナビ（施策 / 記事 / プロンプト / 成績 / 公開キュー）へ作り替える。**各 view の中身（ボードカード・詳細パネル・PublishQueue・PerformanceBoard・ProposalsView・PromptsView）の見た目は P1 では変えない**（P2〜P5 で再スキン）。実データ（盤ポーリング・統計・同期ラベル）へ結線する。

**Architecture:**
- P0 成果（`theme/approveTheme.css` の `.approve-shell` スコープ・`--p-*` トークン・`approve-*` 演出/ボタン/タイポ、`ui/icons.tsx`・`ui/primitives.tsx`・`ui/boardStage.ts`・`ui/scales.ts`）を土台にシェルを組む。
- proto の `position:fixed; inset:0`（`.approve-shell`）固定シェルへ ApproveClient のレイアウトを組み替える。骨格は `<MotionConfig reducedMotion="user"> > .approve-shell > TopBar / (LeftRail + main[view]) / ShortcutBar / BulkBar(fixed) / ShortcutOverlay / 既存モーダル群`。
- ナビは proto モデル：LeftRail 5 view（`proposal`/`approve`/`prompt`/`performance`/`queue`）＋ TopBar 段階セグメント（`all`/`awaiting`/`generating`/`published`）。**URL `?view=` ルーティングは維持**し 3 値→5 値へ拡張（`viewRouting.ts`）。`performance`/`queue` を articles タブ内同居から独立 view へ昇格。
- approve view の内部は現行維持：現行 `ArticlesView` ＋ 現行モーダル詳細 `DetailPanelView` をそのまま新シェル内に置く（proto の Board+DetailPanel 2 ペインは P2/P3 の担当）。
- 新規純ロジックは `.ts` に分離し **100% テスト（除外しない）**：`boardShellStats.ts`（`deriveShellCounts`・`syncAgoLabel`）。
- シェルコンポーネント（LeftRail/TopBar/ShortcutBar/ShortcutOverlay/BulkBar）は RTL で操作（onClick/onChange）を実検証し **100%（除外しない）**。proto から移植時 `proto-`→`approve-` rename・アイコンは `@/app/growth/approve/ui/icons`・Kbd は `@/app/growth/approve/ui/primitives`・`useDialog` は `./hooks` へ移植。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4 / Framer Motion（`__mocks__/framer-motion.tsx` でモック）/ Vitest + RTL / istanbul。

## Global Constraints
- 設計書: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD1〜AD5・特に AD4 の写像と AD5 の縮約方針）。
- カバレッジ 100%（istanbul・閾値変更禁止）。**純ロジック（`boardShellStats.ts`）とシェル操作系コンポーネントは除外せず 100% テスト**。`useDialog`/`ShortcutOverlay` の focus-trap 薄結線で jsdom 到達不可分岐が出る場合のみ `istanbul ignore next -- @preserve` を行内付与（exclude には足さない）。CSS は非計測。
- TS strict / `any` 禁止 / `React.FC` 禁止（関数宣言＋`XxxProps`）/ `import type` / boolean prop は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止（最終手段は `@ts-expect-error`＋理由）。
- `"use client"` は対話/ブラウザAPI が要る時のみ。framer-motion 使用ファイルは `"use client"`。`--p-*` トークン名は維持・class prefix は `approve-`。`next/image`/`next/font`。
- a11y：セマンティック HTML・`prefers-reduced-motion`（CSS ＋ `<MotionConfig reducedMotion="user">`）・キーボード・コントラスト・axe。
- **キーバインドは P6**: proto のフル keyboard system（`?`／J/K/A/R/E/X/1-4）は **P6 a11y へ送る**。P1 では ShortcutBar/ShortcutOverlay の UI を**ボタン到達のみ**で出し、**新規キーバインドは追加しない**。既存の本番キーハンドラ（`/`→TopBar 検索フォーカス・⌘K→CommandPalette・既存ショートカット）は維持する。
- **中身がライトのままの過渡状態は許容**（各 view の内側は後続フェーズで再スキン）。
- 出力・コミットは日本語。push 禁止（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。`next-env.d.ts`/`node_modules` ステージ禁止。
- 各タスク末に `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run` 緑を確認（最終タスクで `--coverage` 100%）。
- コミットメッセージ末尾に必ず `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。

---

### Task 1: シェル統計の純ロジック（boardShellStats.ts）

**Files:**
- Create: `src/app/growth/approve/boardShellStats.ts`
- Test: `src/app/growth/approve/boardShellStats.test.ts`

**Interfaces:**
- Consumes: `PendingItem`（`./types`）・`isActionable`（`./board`）・`Stage`（`@/lib/growth/stage`）。
- Produces:
  - `type ShellSegmentKey = "all" | "awaiting" | "generating" | "published"`
  - `interface ShellCounts { awaiting: number; publishedTotal: number; proposalPending: number; queueReady: number; segmentCounts: Record<ShellSegmentKey, number> }`
  - `deriveShellCounts(items: readonly PendingItem[], decided: Record<string, string | undefined>): ShellCounts`
  - `interface SyncAgo { label: string | null; stale: boolean }`
  - `syncAgoLabel(nowMs: number, updatedAtMs: number | null): SyncAgo`（2 分以上で `stale`）
- 結線先: Task 6 ApproveClient が `deriveShellCounts` で TopBar の `segments[].count`/`awaitingCount`/`publishedTotal` と LeftRail の `proposalCount`/`queueReadyCount` を、`syncAgoLabel` で TopBar の `syncLabel`/`syncStale` を作る。TopBar の 2 つ目の統計ピルは**ラベルを「公開済み」（published 総数）**とする（proto の「今週公開」は publishedAt 境界が必要なため AD5 縮約として正確側を採用）。

**設計判断（AD4/AD5 写像）:**
- proto の `SEGMENTS` は `Article.awaitingYou`/`stage` ベース。本番は `PendingItem.stage`（`@/lib/growth/stage` の `Stage`）と `isActionable(item, decided)` で表現する：
  - `all`: 全 `items`。
  - `awaiting`: `items.filter((i) => isActionable(i, decided))`（proto の `awaitingYou` 相当＝あなたのアクション待ち。施策・記事横断）。
  - `generating`: `items.filter((i) => i.stage === "generating")`。
  - `published`: `items.filter((i) => i.stage === "published")`。
- `awaiting` = `segmentCounts.awaiting`。`publishedTotal` は本番に「今週」フィルタが無いため**`stage==="published"` の総数**とし、TopBar のピルラベルも proto の「今週公開」ではなく**「公開済み」**にする（AD5 縮約・正確側を採用）。published セグメント数＝`publishedTotal`（同義）。
- `proposalPending`: `items.filter((i) => i.kind === "proposal" && isActionable(i, decided)).length`（LeftRail 施策バッジ）。
- `queueReady`: `items.filter((i) => i.stage === "drafted" && i.isDraftReady === true).length`（LeftRail 公開キューバッジ。`partitionPublishQueue` の `ready` 条件＝`stage==="drafted"` かつ公開可と整合する縮約。`partitionPublishQueue` は eyecatch/body 等の追加条件を持つが、LeftRail バッジは「下書き準備済み件数」の近似で十分・実描画は PublishQueue 側が `partitionPublishQueue` で厳密に振り分ける。**この近似採用理由をコメントに明記**）。
- `syncAgoLabel`: proto の `minutesAgo` 計算（`Math.floor((nowMs - updatedAtMs)/60000)`）を純化。`updatedAtMs` が `null`（未取得）→ `{label:null, stale:false}`。`<1` 分→`"たった今"`、それ以外→`"N分前"`。`stale` は `minutesAgo >= 2`。負値（時計巻き戻し）は `0` 扱いで `"たった今"`。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/boardShellStats.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { deriveShellCounts, syncAgoLabel } from "./boardShellStats";
import type { PendingItem } from "./types";

function item(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("deriveShellCounts", () => {
  const items: PendingItem[] = [
    item({ id: "p1", kind: "proposal", stage: "proposed" }), // 施策・未処理
    item({ id: "p2", kind: "proposal", stage: "proposed" }), // 施策・決定済み
    item({ id: "i1", kind: "idea", stage: "proposed" }),     // 記事・未処理
    item({ id: "g1", kind: "idea", stage: "generating" }),   // 生成中
    item({ id: "d1", kind: "idea", stage: "drafted", isDraftReady: true }),  // 公開キュー ready
    item({ id: "pub1", kind: "idea", stage: "published" }),  // 公開済み
  ];
  const decided = { p2: "承認" };

  it("セグメント件数を stage / isActionable で算出する", () => {
    const c = deriveShellCounts(items, decided);
    expect(c.segmentCounts.all).toBe(6);
    expect(c.segmentCounts.generating).toBe(1);
    expect(c.segmentCounts.published).toBe(1);
    // awaiting=未決定で actionable(p1,i1)。p2 は決定済み・d1 は isDraftReady・g1 は下流待ち・pub1 は published。
    expect(c.segmentCounts.awaiting).toBe(2);
    expect(c.awaiting).toBe(2);
  });

  it("施策の未処理 / 公開キュー ready / 公開済み(縮約=総数) を算出する", () => {
    const c = deriveShellCounts(items, decided);
    expect(c.proposalPending).toBe(1); // p1 のみ(p2 は決定済み)
    expect(c.queueReady).toBe(1);      // d1
    expect(c.publishedTotal).toBe(1);  // pub1
  });

  it("空配列でも 0 を返す", () => {
    const c = deriveShellCounts([], {});
    expect(c.awaiting).toBe(0);
    expect(c.segmentCounts.all).toBe(0);
  });
});

describe("syncAgoLabel", () => {
  it("未取得(null)は label=null stale=false", () => {
    expect(syncAgoLabel(1_000_000, null)).toEqual({ label: null, stale: false });
  });

  it("1分未満は『たった今』", () => {
    expect(syncAgoLabel(1_030_000, 1_000_000)).toEqual({ label: "たった今", stale: false });
  });

  it("1分以上2分未満は『N分前』stale=false", () => {
    expect(syncAgoLabel(1_090_000, 1_000_000)).toEqual({ label: "1分前", stale: false });
  });

  it("2分以上は stale=true", () => {
    expect(syncAgoLabel(1_200_000, 1_000_000)).toEqual({ label: "3分前", stale: true });
  });

  it("時計巻き戻し(負経過)は『たった今』に丸める", () => {
    expect(syncAgoLabel(900_000, 1_000_000)).toEqual({ label: "たった今", stale: false });
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/boardShellStats.test.ts` → FAIL（モジュール未作成）

- [ ] **Step 3: boardShellStats.ts を実装**
```ts
/**
 * シェル(TopBar/LeftRail)の統計と同期ラベルの純ロジック(#proto P1)。DOM/IO 非依存。
 *
 * proto の SEGMENTS / 統計ピル / 同期ラベルを本番 PendingItem + isActionable へ写像する(AD4)。
 * 当面の縮約(AD5): publishedTotal は proto の「今週公開」相当だが publishedAt 境界が surface
 * できないため stage==="published" の総数(ラベルも「公開済み」)。境界が surface できれば差し替え。
 * queueReady は partitionPublishQueue の ready 近似(stage==="drafted" && isDraftReady)。厳密な
 * 振り分け・到来判定は PublishQueue 側が publishQueue.ts で行う。
 */

import { isActionable } from "./board";
import type { PendingItem } from "./types";

export type ShellSegmentKey = "all" | "awaiting" | "generating" | "published";

export interface ShellCounts {
  awaiting: number;
  publishedTotal: number;
  proposalPending: number;
  queueReady: number;
  segmentCounts: Record<ShellSegmentKey, number>;
}

/** TopBar 段階セグメント / 統計ピル / LeftRail バッジの件数を一括算出する。 */
export function deriveShellCounts(
  items: readonly PendingItem[],
  decided: Record<string, string | undefined>,
): ShellCounts {
  let awaiting = 0;
  let generating = 0;
  let published = 0;
  let proposalPending = 0;
  let queueReady = 0;
  for (const it of items) {
    const actionable = isActionable(it, decided);
    if (actionable) awaiting += 1;
    if (it.stage === "generating") generating += 1;
    if (it.stage === "published") published += 1;
    if (it.kind === "proposal" && actionable) proposalPending += 1;
    if (it.stage === "drafted" && it.isDraftReady === true) queueReady += 1;
  }
  return {
    awaiting,
    publishedTotal: published,
    proposalPending,
    queueReady,
    segmentCounts: {
      all: items.length,
      awaiting,
      generating,
      published,
    },
  };
}

export interface SyncAgo {
  label: string | null;
  stale: boolean;
}

/** 盤の最終取得時刻からの経過ラベル。null=未取得。2分以上で stale。負経過は 0 に丸める。 */
export function syncAgoLabel(nowMs: number, updatedAtMs: number | null): SyncAgo {
  if (updatedAtMs === null) return { label: null, stale: false };
  const minutesAgo = Math.max(0, Math.floor((nowMs - updatedAtMs) / 60_000));
  const label = minutesAgo < 1 ? "たった今" : `${minutesAgo}分前`;
  return { label, stale: minutesAgo >= 2 };
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/boardShellStats.test.ts` → PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/boardShellStats.ts src/app/growth/approve/boardShellStats.test.ts
git commit -m "feat(growth): シェル統計の純ロジック boardShellStats を追加（件数写像/同期ラベル・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: シェルナビ型と view ルーティング拡張（viewRouting.ts・shellNav.ts）

**Files:**
- Modify: `src/app/growth/approve/viewRouting.ts`
- Modify: `src/app/growth/approve/viewRouting.test.ts`
- Create: `src/app/growth/approve/shellNav.ts`
- Test: `src/app/growth/approve/shellNav.test.ts`

**Interfaces:**
- `viewRouting.ts`（拡張）:
  - `type ApproveView = "proposal" | "approve" | "prompt" | "performance" | "queue"`（proto `MainView` と同名語彙へ統一）。
  - `APPROVE_VIEWS: readonly ApproveView[] = ["proposal", "approve", "prompt", "performance", "queue"]`。
  - `parseView(raw)`：5 値を正規化、未知/欠落は `null`。
  - `decideInitialView(param, counts)`：`counts: { proposalPending: number; awaiting: number }`。URL > 施策未処理>0 → `proposal` > あなた待ち>0 → `approve` > 既定 `performance`（proto 既定着地と一致）。
- `shellNav.ts`（新規）:
  - `interface ShellSegment { key: ShellSegmentKey; label: string }`
  - `SHELL_SEGMENTS: readonly ShellSegment[]`（`all`=すべて/`awaiting`=あなた待ち/`generating`=生成中/`published`=公開済み）。
  - `matchesSegment(item: PendingItem, segment: ShellSegmentKey, decided): boolean`（approve view のカード絞り込み用。P2 まではカード見た目据え置きだが、TopBar セグメントを effective にするため絞り込み関数を用意。`all`=true / `awaiting`=`isActionable` / `generating`=`stage==="generating"` / `published`=`stage==="published"`）。

**設計判断（URL 値の破壊的変更）:**
- 旧 `?view=proposals|articles|prompts` → 新 `?view=proposal|approve|prompt|performance|queue`。**旧値は廃止**（proto 語彙へ統一・移植先は新規ナビ）。互換マッピングは持たない（承認画面は内部運用ツールでブックマーク互換要件が無い／surface map もタブ置換を前提）。**`viewRouting.test.ts` の既存テスト（旧 3 値前提）も本タスクで移設対象**として 5 値・新 `decideInitialView` シグネチャへ全面書き換える（下記 Step 1）。ApproveClient.test.tsx 側の `?view=articles` 等は Task 7 の test 移設で対応。

- [ ] **Step 1: 失敗するテストを書く（viewRouting.test.ts を 5 値へ書き換え）**

`viewRouting.test.ts`（既存を置換）:
```ts
import { describe, expect, it } from "vitest";

import { APPROVE_VIEWS, decideInitialView, parseView } from "./viewRouting";

describe("parseView", () => {
  it("5 view を正規化し、未知/欠落は null", () => {
    expect(APPROVE_VIEWS).toEqual(["proposal", "approve", "prompt", "performance", "queue"]);
    for (const v of APPROVE_VIEWS) expect(parseView(v)).toBe(v);
    expect(parseView("articles")).toBeNull(); // 旧値は廃止
    expect(parseView(null)).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("decideInitialView", () => {
  it("URL 指定を最優先", () => {
    expect(decideInitialView("queue", { proposalPending: 5, awaiting: 5 })).toBe("queue");
  });
  it("施策未処理>0 で proposal", () => {
    expect(decideInitialView(null, { proposalPending: 1, awaiting: 3 })).toBe("proposal");
  });
  it("施策0・あなた待ち>0 で approve", () => {
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 2 })).toBe("approve");
  });
  it("どちらも0で既定 performance", () => {
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 0 })).toBe("performance");
  });
});
```

`shellNav.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { SHELL_SEGMENTS, matchesSegment } from "./shellNav";
import type { PendingItem } from "./types";

function item(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("shellNav", () => {
  it("4 セグメントを label 付きで持つ", () => {
    expect(SHELL_SEGMENTS.map((s) => s.key)).toEqual(["all", "awaiting", "generating", "published"]);
    expect(SHELL_SEGMENTS[0].label).toBe("すべて");
  });

  it("matchesSegment は stage / isActionable で判定する", () => {
    const idea = item({ id: "i1", kind: "idea", stage: "proposed" });
    const gen = item({ id: "g1", kind: "idea", stage: "generating" });
    const pub = item({ id: "p1", kind: "idea", stage: "published" });
    expect(matchesSegment(idea, "all", {})).toBe(true);
    expect(matchesSegment(idea, "awaiting", {})).toBe(true);
    expect(matchesSegment(idea, "awaiting", { i1: "承認" })).toBe(false);
    expect(matchesSegment(gen, "generating", {})).toBe(true);
    expect(matchesSegment(idea, "generating", {})).toBe(false);
    expect(matchesSegment(pub, "published", {})).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/viewRouting.test.ts src/app/growth/approve/shellNav.test.ts` → FAIL

- [ ] **Step 3: viewRouting.ts を 5 値へ拡張・shellNav.ts を実装**

`viewRouting.ts`（全面置換）:
```ts
/**
 * 承認画面のナビ(5 view)ルーティングの純ロジック(#proto P1)。DOM/IO 非依存。
 * proto MainView 語彙へ統一(施策/記事/プロンプト/成績/公開キュー)。旧 proposals|articles|prompts は廃止。
 */

export type ApproveView = "proposal" | "approve" | "prompt" | "performance" | "queue";

export const APPROVE_VIEWS: readonly ApproveView[] = [
  "proposal",
  "approve",
  "prompt",
  "performance",
  "queue",
];

/** `?view` の生値を ApproveView に正規化する。未知/欠落は null。 */
export function parseView(raw: string | null | undefined): ApproveView | null {
  return APPROVE_VIEWS.includes(raw as ApproveView) ? (raw as ApproveView) : null;
}

/**
 * 初期表示 view を決める(proto 既定着地)。
 * 1. URL の view が妥当ならそれを使う。
 * 2. 施策に未処理があれば施策。
 * 3. あなた待ち(記事 actionable)があれば記事。
 * 4. どちらも無ければ成績。
 */
export function decideInitialView(
  param: string | null | undefined,
  counts: { proposalPending: number; awaiting: number },
): ApproveView {
  const parsed = parseView(param);
  if (parsed) return parsed;
  if (counts.proposalPending > 0) return "proposal";
  if (counts.awaiting > 0) return "approve";
  return "performance";
}
```

`shellNav.ts`:
```ts
/**
 * TopBar 段階セグメント定義と approve view のカード絞り込み(#proto P1)。DOM 非依存。
 */

import { isActionable } from "./board";
import type { ShellSegmentKey } from "./boardShellStats";
import type { PendingItem } from "./types";

export interface ShellSegment {
  key: ShellSegmentKey;
  label: string;
}

export const SHELL_SEGMENTS: readonly ShellSegment[] = [
  { key: "all", label: "すべて" },
  { key: "awaiting", label: "あなた待ち" },
  { key: "generating", label: "生成中" },
  { key: "published", label: "公開済み" },
];

/** approve view のカードが現在のセグメントに合致するか。 */
export function matchesSegment(
  item: PendingItem,
  segment: ShellSegmentKey,
  decided: Record<string, string | undefined>,
): boolean {
  if (segment === "all") return true;
  if (segment === "awaiting") return isActionable(item, decided);
  if (segment === "generating") return item.stage === "generating";
  return item.stage === "published";
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/viewRouting.test.ts src/app/growth/approve/shellNav.test.ts` → PASS（型エラーは Task 6 で BoardTabs 撤去まで残るため、ここでは `tsc` は赤を許容。`vitest run` の当該 2 ファイルのみ緑で良い）

> **注意:** `viewRouting.ts` の値変更により `BoardTabs.tsx`/`ApproveClient.tsx` が一時的に型不整合となる。本タスクのコミットは純ロジック差し替えに留め、`tsc` 全体緑は Task 6 完了時に回復する。コミット粒度を保つため、ここでは「該当テスト緑＋差分が viewRouting/shellNav に閉じる」ことを確認してコミットする。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/viewRouting.ts src/app/growth/approve/viewRouting.test.ts src/app/growth/approve/shellNav.ts src/app/growth/approve/shellNav.test.ts
git commit -m "feat(growth): view ルーティングを proto 5 view 語彙へ拡張しシェルナビ純ロジックを追加（100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: useDialog フック移植（hooks/useDialog.ts）

**Files:**
- Create: `src/app/growth/approve/hooks/useDialog.ts`
- Test: `src/app/growth/approve/hooks/useDialog.test.tsx`

**Interfaces:**
- Produces: `useDialog<T extends HTMLElement = HTMLDivElement>(): RefObject<T | null>`。マウント時に最初のフォーカス可能要素へフォーカス・Tab/Shift+Tab トラップ・アンマウントで元要素へ復帰。ShortcutOverlay（Task 5）が参照。

**設計判断:** proto の `useDialog.ts` を逐語移植。focus-trap は RTL（`@testing-library/react` の `renderHook`＋実 DOM）でテスト可能なため**除外しない**。`document.activeElement === el` の防御分岐など jsdom で到達不可な行は `istanbul ignore next -- @preserve` を行内付与（exclude には足さない）。

- [ ] **Step 1: 失敗するテストを書く**

`hooks/useDialog.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useDialog } from "./useDialog";

function Dialog({ withButtons = true }: { withButtons?: boolean }) {
  const ref = useDialog<HTMLDivElement>();
  return (
    <div ref={ref} role="dialog" aria-label="d">
      {withButtons ? (
        <>
          <button>first</button>
          <button>last</button>
        </>
      ) : null}
    </div>
  );
}

describe("useDialog", () => {
  it("マウント時に最初のボタンへフォーカスする", () => {
    render(<Dialog />);
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("最後の要素から Tab で先頭へ巻き戻す", async () => {
    render(<Dialog />);
    const last = screen.getByRole("button", { name: "last" });
    last.focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("先頭で Shift+Tab すると末尾へ回る", async () => {
    render(<Dialog />);
    const first = screen.getByRole("button", { name: "first" });
    first.focus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus();
  });

  it("フォーカス可能要素が無いときパネル本体へフォーカスする", () => {
    render(<Dialog withButtons={false} />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/hooks/useDialog.test.tsx` → FAIL

- [ ] **Step 3: useDialog.ts を移植**

`src/app/growth/approve-proto/useDialog.ts` を `src/app/growth/approve/hooks/useDialog.ts` へ逐語移植（冒頭コメントを「承認画面モーダル共通の a11y フック。proto(#proto) からの本番移植。」に更新）。`focusables()` の `el === document.activeElement` 分岐など jsdom 非到達行があれば該当行に `/* istanbul ignore next -- @preserve jsdom では到達不可 */` を付与。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/hooks/useDialog.test.tsx` → PASS（カバレッジ 100%・到達不可分岐は ignore 行内）

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/hooks/useDialog.ts src/app/growth/approve/hooks/useDialog.test.tsx
git commit -m "feat(growth): モーダル a11y フック useDialog を proto から移植（focus-trap・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: シェル上下バー移植（TopBar / LeftRail / ShortcutBar）

**Files:**
- Create: `src/app/growth/approve/shell/TopBar.tsx`
- Create: `src/app/growth/approve/shell/LeftRail.tsx`
- Create: `src/app/growth/approve/shell/ShortcutBar.tsx`
- Test: `src/app/growth/approve/shell/TopBar.test.tsx`
- Test: `src/app/growth/approve/shell/LeftRail.test.tsx`
- Test: `src/app/growth/approve/shell/ShortcutBar.test.tsx`

**Interfaces:**
- `TopBar`（props は proto 同型・`publishedThisWeek`→`publishedTotal` rename）: `{ segment: ShellSegmentKey; segments: { key: ShellSegmentKey; label: string; count: number }[]; query: string; awaitingCount: number; publishedTotal: number; onSegmentChange: (key: ShellSegmentKey) => void; onQueryChange: (q: string) => void; searchRef: RefObject<HTMLInputElement | null>; syncLabel: string | null; syncStale: boolean; syncing: boolean; onRefresh: () => void; onOpenProposal: () => void }`。`role="tablist" aria-label="段階フィルタ"`・各セグメント `role="tab" aria-selected`。2 つ目の統計ピルは `title="公開済みの記事数"`・ラベル「公開済み」（proto の「今週公開」から rename）。
- `LeftRail`: `{ view: ApproveView; awaitingCount: number; proposalCount: number; queueReadyCount: number; onChange: (view: ApproveView) => void }`。**`role` 設計（確定）: `<nav aria-label="情報源"> + <button aria-current>`。tablist にしない**（後述）。
- `ShortcutBar`: `{ onOpenShortcuts: () => void }`。

**設計判断（LeftRail の role・確定）:**
- LeftRail は**`<nav aria-label="情報源">` ＋ 各項目 `<button aria-label aria-current={active ? "page" : undefined}>`** とする（proto は `<nav>`＋`<button>`・aria-current なし。本番はアクティブ可視化のため `aria-current="page"` を追加）。
- 一方 **TopBar 段階セグメントは `role="tablist"`／各 `role="tab"`**（proto 準拠）。**WAI-ARIA tab 規約上 tabpanel が必要なため、approve view の `<main>` を `role="tabpanel"` とし TopBar セグメントの選択中タブと `aria-controls`/`aria-labelledby` で紐付ける**（段階セグメントは approve view のカード絞り込みであり、tab/tabpanel 関係が自然）。これにより既存テストの `role="tablist"`/`role="tab"`/`role="tabpanel"` の概念は**「ナビ（LeftRail）＝nav/button」「段階フィルタ（TopBar）＝tablist/tab/tabpanel」へ役割分割**される。テスト移設（Task 6）で `selectTab(/記事/)` を「LeftRail の記事ボタン click」へ、`role="tablist" aria-label="表示切替"` を「`aria-label="段階フィルタ"` の TopBar tablist」へ書き換える。
- 理由：5 つの主 view（施策/記事/プロンプト/成績/公開キュー）は**ページ的なセクション切替**でありタブの「同一パネルの表示切替」とは意味が異なるため nav/button（`aria-current`）が a11y 的に正確。段階フィルタ（all/awaiting/generating/published）は approve view 内のカードフィルタでありタブが適切。

- [ ] **Step 1: 失敗するテストを書く（3 ファイル）**

`shell/TopBar.test.tsx`（要点）:
```tsx
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TopBar } from "./TopBar";

function setup(over: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const onSegmentChange = vi.fn();
  const onQueryChange = vi.fn();
  const onRefresh = vi.fn();
  const onOpenProposal = vi.fn();
  render(
    <TopBar
      segment="all"
      segments={[
        { key: "all", label: "すべて", count: 3 },
        { key: "awaiting", label: "あなた待ち", count: 1 },
      ]}
      query=""
      awaitingCount={1}
      publishedTotal={2}
      onSegmentChange={onSegmentChange}
      onQueryChange={onQueryChange}
      searchRef={createRef<HTMLInputElement>()}
      syncLabel="3分前"
      syncStale
      syncing={false}
      onRefresh={onRefresh}
      onOpenProposal={onOpenProposal}
      {...over}
    />,
  );
  return { onSegmentChange, onQueryChange, onRefresh, onOpenProposal };
}

describe("TopBar", () => {
  it("段階セグメントを tablist/tab で出し、クリックで onSegmentChange", async () => {
    const { onSegmentChange } = setup();
    expect(screen.getByRole("tablist", { name: "段階フィルタ" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /あなた待ち/ }));
    expect(onSegmentChange).toHaveBeenCalledWith("awaiting");
  });

  it("検索入力で onQueryChange を呼ぶ", async () => {
    const { onQueryChange } = setup();
    await userEvent.type(screen.getByPlaceholderText("記事を検索…"), "x");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("統計ピル(あなた待ち/公開済み)を表示する", () => {
    setup();
    expect(screen.getByTitle("あなたのアクション待ち")).toHaveTextContent("1");
    expect(screen.getByTitle("公開済みの記事数")).toHaveTextContent("2");
  });

  it("施策追加ボタンで onOpenProposal", async () => {
    const { onOpenProposal } = setup();
    await userEvent.click(screen.getByRole("button", { name: /施策/ }));
    expect(onOpenProposal).toHaveBeenCalled();
  });

  it("更新ボタンで onRefresh・syncing 中は disabled で更新中表示", async () => {
    const { onRefresh } = setup();
    await userEvent.click(screen.getByRole("button", { name: /データを更新/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("syncing 中は更新ボタンが disabled", () => {
    setup({ syncing: true });
    expect(screen.getByRole("button", { name: /データを更新/ })).toBeDisabled();
  });
});
```

`shell/LeftRail.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeftRail } from "./LeftRail";

describe("LeftRail", () => {
  it("5 view を nav/button で出し、アクティブに aria-current=page", () => {
    render(<LeftRail view="approve" awaitingCount={2} proposalCount={1} queueReadyCount={3} onChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "情報源" })).toBeInTheDocument();
    const article = screen.getByRole("button", { name: "記事" });
    expect(article).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "施策" })).not.toHaveAttribute("aria-current");
  });

  it("各 view のバッジ(施策/記事/公開キュー)を出す", () => {
    render(<LeftRail view="approve" awaitingCount={2} proposalCount={1} queueReadyCount={3} onChange={vi.fn()} />);
    expect(within(screen.getByRole("button", { name: "施策" })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "記事" })).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "公開キュー" })).getByText("3")).toBeInTheDocument();
  });

  it("クリックで onChange(該当 view)", async () => {
    const onChange = vi.fn();
    render(<LeftRail view="approve" awaitingCount={0} proposalCount={0} queueReadyCount={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "成績" }));
    expect(onChange).toHaveBeenCalledWith("performance");
  });

  it("バッジ 0 のときはバッジを描画しない", () => {
    render(<LeftRail view="approve" awaitingCount={0} proposalCount={0} queueReadyCount={0} onChange={vi.fn()} />);
    expect(within(screen.getByRole("button", { name: "プロンプト" })).queryByText("0")).not.toBeInTheDocument();
  });
});
```
（`within` を import に追加）

`shell/ShortcutBar.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShortcutBar } from "./ShortcutBar";

describe("ShortcutBar", () => {
  it("キーヒントを表示し、ヘルプボタンで onOpenShortcuts", async () => {
    const onOpenShortcuts = vi.fn();
    render(<ShortcutBar onOpenShortcuts={onOpenShortcuts} />);
    expect(screen.getByText("移動")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(onOpenShortcuts).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/shell/` → FAIL

- [ ] **Step 3: 3 コンポーネントを移植**

共通: 先頭 `"use client";`、冒頭コメントを「…proto(#proto) からの本番移植。」に更新。import を本番へ:
- アイコン: `import { ... } from "@/app/growth/approve/ui/icons";`
- Kbd: `import { Kbd } from "@/app/growth/approve/ui/primitives";`
- 型: `import type { ApproveView } from "@/app/growth/approve/viewRouting";`・`import type { ShellSegmentKey } from "@/app/growth/approve/boardShellStats";`
- class の `proto-spin` → `approve-spin`（TopBar 更新ボタン）。

`TopBar.tsx`: `src/app/growth/approve-proto/TopBar.tsx` を逐語移植し、
- `SegmentKey` を `ShellSegmentKey` に置換（`Segment.key` 型）。
- **`publishedThisWeek` prop を `publishedTotal` に rename**。2 つ目の統計ピルのラベルを「今週公開」→**「公開済み」**・`title="今週公開した記事数"`→**`title="公開済みの記事数"`** に変更（AD5 縮約。それ以外のピル＝あなた待ちは逐語）。
- 更新ボタンの `className={syncing ? "proto-spin" : undefined}` → `"approve-spin"`。
- 更新ボタンに **アクセシブル名のため `title="データを更新"` 維持**（テストの `name: /データを更新/`）。施策追加ボタンの `title="施策を追加"` 維持。
- 検索 `<input>` は `searchRef` を受けたまま逐語移植（ApproveClient 側で `/` キー→`searchRef.current?.focus()` に結線するため・proto 忠実）。
- それ以外（レイアウト・style の `var(--p-*)`・ロゴ・あなた待ちピル）は逐語。

`LeftRail.tsx`: `src/app/growth/approve-proto/LeftRail.tsx` を移植し、
- `MainView` → `ApproveView`。`items` の key/label は proto 同一（proposal/approve/prompt/performance/queue）。
- 各 `<button>` に **`aria-current={active ? "page" : undefined}` を追加**（proto には無い）。`<nav>` に `aria-label="情報源"` を追加。
- アクティブの左 accent バー・bg-active・アイコン色・バッジ（施策/記事=amber・公開キュー=raised）は逐語。`it.badge ? ... : null` の分岐は維持（バッジ 0 で非描画）。

`ShortcutBar.tsx`: `src/app/growth/approve-proto/ShortcutBar.tsx` を逐語移植（J/K 移動・A 承認・R 修正・X 選択・E 編集・右端 IconKeyboard＋Kbd ?）。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/shell/` → PASS（3 コンポーネント 100%）

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/shell/TopBar.tsx src/app/growth/approve/shell/LeftRail.tsx src/app/growth/approve/shell/ShortcutBar.tsx src/app/growth/approve/shell/TopBar.test.tsx src/app/growth/approve/shell/LeftRail.test.tsx src/app/growth/approve/shell/ShortcutBar.test.tsx
git commit -m "feat(growth): シェル上下バー TopBar/LeftRail/ShortcutBar を proto から移植（5view nav・段階tablist・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: ShortcutOverlay / BulkBar 移植

**Files:**
- Create: `src/app/growth/approve/shell/ShortcutOverlay.tsx`
- Create: `src/app/growth/approve/shell/BulkBar.tsx`
- Test: `src/app/growth/approve/shell/ShortcutOverlay.test.tsx`
- Test: `src/app/growth/approve/shell/BulkBar.test.tsx`

**Interfaces:**
- `ShortcutOverlay`: `{ onClose: () => void }`。`role="dialog" aria-modal aria-label="キーボードショートカット"`・`useDialog`（Task 3）・背景 mousedown で onClose。
- `BulkBar`: `{ count: number; onApproveAll: () => void; onRejectAll: () => void; onClear: () => void }`。`count>0` のみ `AnimatePresence`・`fixed bottom-9` 中央。

**設計判断:** framer-motion は `__mocks__/framer-motion.tsx` でモック済み（`AnimatePresence`/`motion.div` が素通りで描画）。`"use client"` 付与。

- [ ] **Step 1: 失敗するテストを書く（2 ファイル）**

`shell/ShortcutOverlay.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShortcutOverlay } from "./ShortcutOverlay";

describe("ShortcutOverlay", () => {
  it("ダイアログとショートカット一覧を表示する", () => {
    render(<ShortcutOverlay onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "キーボードショートカット" })).toBeInTheDocument();
    expect(screen.getByText("次の記事")).toBeInTheDocument();
    expect(screen.getByText("承認")).toBeInTheDocument();
  });

  it("esc ボタンで onClose", async () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    // ヘッダ右の閉じるボタン(Kbd esc を内包する button)
    await userEvent.click(screen.getAllByRole("button").find((b) => b.textContent === "esc")!);
    expect(onClose).toHaveBeenCalled();
  });
});
```

`shell/BulkBar.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BulkBar } from "./BulkBar";

describe("BulkBar", () => {
  it("count=0 では何も描画しない", () => {
    const { container } = render(<BulkBar count={0} onApproveAll={vi.fn()} onRejectAll={vi.fn()} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("count>0 で件数・各操作ボタンを出す", async () => {
    const onApproveAll = vi.fn();
    const onRejectAll = vi.fn();
    const onClear = vi.fn();
    render(<BulkBar count={2} onApproveAll={onApproveAll} onRejectAll={onRejectAll} onClear={onClear} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /まとめて承認/ }));
    expect(onApproveAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /まとめて却下/ }));
    expect(onRejectAll).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "選択解除" }));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/shell/ShortcutOverlay.test.tsx src/app/growth/approve/shell/BulkBar.test.tsx` → FAIL

- [ ] **Step 3: 2 コンポーネントを移植**

`ShortcutOverlay.tsx`: `src/app/growth/approve-proto/ShortcutOverlay.tsx` を移植。
- import: `import { Kbd } from "@/app/growth/approve/ui/primitives"; import { useDialog } from "@/app/growth/approve/hooks/useDialog";`
- `GROUPS`（移動/操作/表示）・motion.div の scale+blur・背景 mousedown で onClose・`onMouseDown(e)=>e.stopPropagation()` は逐語。`"use client"` 維持。

`BulkBar.tsx`: `src/app/growth/approve-proto/BulkBar.tsx` を移植。
- import: アイコンは `@/app/growth/approve/ui/icons`・`Kbd` は `@/app/growth/approve/ui/primitives`。
- class `proto-btn-ghost` → `approve-btn-ghost`（却下/承認ボタン）。`fixed bottom-9` 中央・`AnimatePresence`・`count>0` ガードは逐語。「選択解除」ボタンの `aria-label="選択解除"` 維持。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/shell/` → PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/shell/ShortcutOverlay.tsx src/app/growth/approve/shell/BulkBar.tsx src/app/growth/approve/shell/ShortcutOverlay.test.tsx src/app/growth/approve/shell/BulkBar.test.tsx
git commit -m "feat(growth): ShortcutOverlay/BulkBar を proto から移植（focus-trap/フローティング一括バー・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: ApproveClient シェル骨格差し替え（view 拡張・実データ結線）

> 本タスクは大きいため Task 6（シェル骨格＋view 描画＋実データ結線）／Task 7（旧サーフェス撤去＋テスト移設）に分割する。Task 6 では新シェルを組み、**旧 BoardTabs/BoardToolbar/BulkActionBar の描画を新シェルへ置換**するが、ApproveClient.test.tsx の旧 describe 群の書き換えは Task 7 で行う（Task 6 末で `tsc`/`eslint`/該当外テストは緑、ApproveClient.test.tsx の移設対象 describe は一時赤を許容）。

**Files:**
- Modify: `src/app/growth/approve/ApproveClient.tsx`

**Interfaces:**
- Consumes: `deriveShellCounts`/`syncAgoLabel`（`./boardShellStats`）・`SHELL_SEGMENTS`/`matchesSegment`（`./shellNav`）・`parseView`/`decideInitialView`/`APPROVE_VIEWS`/`ApproveView`（`./viewRouting`）・`TopBar`/`LeftRail`/`ShortcutBar`/`ShortcutOverlay`/`BulkBar`（`./shell/*`）・`MotionConfig`（framer-motion）。
- Produces: ダーク化された固定シェル DOM。view ごとに `ProposalsView`/(ArticlesView+DetailPanelView)/`PromptsView`/`PerformanceBoard`/`PublishQueue` を出し分け。

**設計判断（骨格組み替え・確定）:**
- 最上位 `<main className="mx-auto ...">` を **`<MotionConfig reducedMotion="user"><div className="approve-shell">…</div></MotionConfig>`** へ置換。`.approve-shell` は `position:fixed; inset:0` のため、内側は flex 縦並び（TopBar / 行(LeftRail+main) / ShortcutBar）。BulkBar・ShortcutOverlay・既存モーダル（ConfirmActionDialog/DetailPanelView/DraftEditWorkspace/CommandPalette/ToastList/PollStaleBanner）はシェル内に配置（fixed 要素は祖先の transform に閉じ込められないよう、proto 同様トップレベル直下に置く。**DraftEditWorkspace は現状どおり `.approve-shell` の外＝`<MotionConfig>` 直下のトップレベルで描画**して全画面オーバーレイ崩れを防ぐ）。
- **view state を 5 値へ拡張**: `view: ApproveView | null`。`initialViewFromUrl`/`writeViewParam`/`changeView` は維持しつつ `ApproveView` 新型に追従。初期 view 決定 effect は `decideInitialView(null, { proposalPending, awaiting })` を使う（`deriveShellCounts` の結果を渡す）。
- **TopBar セグメント state を追加（クロス view 遷移・確定#2）**: `const [segment, setSegment] = useState<ShellSegmentKey>("all")`。`onSegmentChange` は**「非 approve view で段階セグメントを選んだら approve view へ遷移＋そのフィルタを適用」**する（proto 忠実・段階セグメントは常時表示）:
  ```ts
  const handleSegmentChange = useCallback((next: ShellSegmentKey): void => {
    setSegment(next);
    if (view !== "approve") changeView("approve");
  }, [view, changeView]);
  ```
  `onSegmentChange={handleSegmentChange}`。段階セグメント tablist は常時表示し、選択中タブは approve view のボード領域（`role="tabpanel"`）を `aria-controls` で制御する。
- **検索 state を追加（`/`→検索フォーカス・確定#1）**: `const [query, setQuery] = useState("")`＋`searchRef`（TopBar 検索欄。approve view のカード絞り込みに使う。絞り込みは `matchesSegment`＋query で `ideas`/`proposals` をフィルタしてから既存 `ArticlesView`/`ProposalsView` に渡す）。**`/` キーは TopBar 検索欄へフォーカスを移す**（proto 忠実）。`shortcuts.ts` の `resolveShortcut` は既に `/`→`"search"`・⌘K/Ctrl+K→`"palette"` と**別アクションに分離済み**（変更不要）。現状 `dispatchRef` は `search`/`palette` を**両方 `setPaletteOpen(true)`** にしているため、**`search`（`/`）分岐を `searchRef.current?.focus()` に分離**し、`palette`（⌘K）のみ `setPaletteOpen(true)` を残す:
  ```ts
  if (action === "search") { searchRef.current?.focus(); return; }
  if (action === "palette") { setPaletteOpen(true); return; }
  ```
  （入力欄での `search`/`palette` 抑止条件は現行の `editable && action !== "palette" && action !== "escape"` を `action !== "search"` も許可するよう調整＝`/` は入力欄外からのフォーカス移動として通す。TopBar 検索欄自身にフォーカス中の `/` は文字入力を優先するため、`isEditableTag` で抑止される現行挙動を維持）。**⌘K は CommandPalette 起動のまま**。
- **統計結線**: `const counts = deriveShellCounts(items, decided)`。TopBar に `segments={SHELL_SEGMENTS.map((s) => ({ ...s, count: counts.segmentCounts[s.key] }))}`・`awaitingCount={counts.awaiting}`・`publishedTotal={counts.publishedTotal}`。LeftRail に `proposalCount={counts.proposalPending}`・`awaitingCount={counts.awaiting}`・`queueReadyCount={counts.queueReady}`。
- **同期結線**: `const sync = syncAgoLabel(nowTick, boardQuery.dataUpdatedAt || null)`（`dataUpdatedAt` は ms epoch。未取得時 0 → `|| null`）。`syncLabel={sync.label}`・`syncStale={sync.stale}`・`syncing={boardQuery.isRefetching || boardQuery.isFetching}`・`onRefresh={() => void pollBoard()}`。`nowTick` は既存（取得成功 effect で更新）を流用。
- **view 描画（出し分け）**:
  - `proposal`: `<ProposalsView proposals={...} .../>` ＋ `<AddProposalForm .../>`（現行のまま・region `aria-label="施策レーン"` 維持）。
  - `approve`: `<ArticlesView columns={articleColumns} .../>` ＋ `openItem` のとき `<DetailPanelView .../>`（現行モーダル詳細をそのまま・region `aria-label="記事パイプライン"` 維持）。**段階セグメント/検索の絞り込みを `ideas` に適用**してから `groupArticlesByStage` する。`<main>` を `role="tabpanel"` とし TopBar 選択中タブに `aria-controls`/`aria-labelledby` で紐付ける（Task 4 の段階セグメント tab/tabpanel）。
  - `prompt`: `<PromptsView token={token} />`（現行のまま）。
  - `performance`: `<PerformanceBoard items={ideas} />`（**articles タブ内同居から独立 view へ移設・再スキンしない**）。
  - `queue`: `<PublishQueue items={ideas} token={token} onChanged={() => void pollBoard()} />`（**独立 view へ移設・再スキンしない**）。
- **一括バー置換**: `selected.size > 0` の `BulkActionBar` を **`BulkBar`（fixed フローティング）へ置換**。`count={selected.size}`・`onApproveAll={() => bulkDecide("承認")}`・`onRejectAll={() => bulkDecide("却下")}`・`onClear={() => setSelected(new Set())}`。`BulkBar` は常時描画し内部の `count>0` ガードで出し入れ（`AnimatePresence`）。
- **ShortcutOverlay 結線（ボタン到達のみ・確定#4）**: `const [shortcutsOpen, setShortcutsOpen] = useState(false)`。ShortcutBar の `onOpenShortcuts={() => setShortcutsOpen(true)}`・`shortcutsOpen && <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />`。**`?` キーバインドは追加しない**（P1 はボタン到達のみ。`?`／J/K/A/R/E/X/1-4 のフル keyboard system は P6 a11y へ送る）。ShortcutOverlay 内の `Kbd ?` 等は**表示用ラベルであり機能キーバインドではない**（押下しても overlay は開かない・ボタン経由のみ）。
- **撤去対象（描画から外す。ファイル削除と test 移設は Task 7）**: `BoardTabs`・`BoardToolbar`・旧上部見出し（`<h1>今週の提案</h1>` ブロック・青/緑の案内テキスト・キーボードヒント `<p>`）・旧 `BulkActionBar` 呼び出し。`navItems`/`paletteSource` 等のキーボード/パレット連動は維持（`activeView` の語彙が `proposals/articles` → `proposal/approve` に変わる点だけ追従）。
- **`jumpTo`/`changeView`/`bulkDecide`/`dispatchRef` の view 語彙追従**: `"articles"`→`"approve"`、`"proposals"`→`"proposal"`。`pendingByView`（BoardTabs 用）は撤去。

- [ ] **Step 1: ApproveClient.test.tsx の「影響しない」テストが緑のまま通る前提を確認**

Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx -t "認証"`（認証系など移設対象外が緑であることを実装前に確認・基準作り）。

- [ ] **Step 2: ApproveClient.tsx を組み替える**

上記「設計判断」に従って実装:
1. import 追加（shell/* ・ boardShellStats ・ shellNav ・ MotionConfig）。BoardTabs/BoardToolbar/BulkActionBar の import を削除。
2. `ApproveView` 新型に追従（`view`/`activeView`/`changeView`/`jumpTo`/`dispatchRef`/`navItems`）。`segment`/`query`/`shortcutsOpen` state 追加。
3. 初期 view effect を `decideInitialView(null, { proposalPending: counts.proposalPending, awaiting: counts.awaiting })` に変更。
4. `return` ブロックを `<MotionConfig reducedMotion="user">` → `.approve-shell` 固定シェル → TopBar / (LeftRail + `<main role="tabpanel">`) / ShortcutBar / BulkBar / ShortcutOverlay / 既存モーダル群 へ全面置換。view 出し分けを実装。
5. approve view で `ideas` に `matchesSegment(item, segment, decided)` ＋ query（title/subtitle 部分一致）を適用してから `groupArticlesByStage`。

- [ ] **Step 3: 型・lint・移設対象外テスト緑を確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）
Run: `npx eslint .`（0 errors）
Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（**移設対象 describe〔タブ分割/ソート#242・タブ分離#119・タブ a11y#119・タブ初期化#119・公開キュー#H23/#H24・操作性一括選択#109〕は一時赤を許容。それ以外は緑**。赤は移設対象に限ることを確認＝シェル骨格の回帰を出していない）。

> このタスクはコミット時点で ApproveClient.test.tsx の一部が赤。**Task 7 と連続実行**し、Task 7 完了で全緑＋カバレッジ 100% に到達させる。コミットは「シェル骨格差し替え（テスト移設は次タスク）」として記録する。

- [ ] **Step 4: Commit**
```bash
git add src/app/growth/approve/ApproveClient.tsx
git commit -m "feat(growth): 承認画面シェルを proto 固定シェル＋5view へ組み替え実データ結線（テスト移設は次タスク）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 7: 旧サーフェス撤去・テスト移設・全体ゲート

**Files:**
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（移設対象 describe を新構造へ書き換え）
- Delete: `src/app/growth/approve/BoardTabs.tsx`・`src/app/growth/approve/BoardToolbar.tsx`・`src/app/growth/approve/BulkActionBar.tsx`
- Delete（存在すれば）: 上記の co-located テスト（`BoardTabs` 等にテストがあれば撤去）。
- Modify: `src/app/growth/approve/ApproveClient.test.tsx` の `selectTab` ヘルパ。

**設計判断（テスト移設・確定）:**
- `selectTab(name)` ヘルパを **LeftRail のナビボタン click** へ書き換え:
  ```ts
  async function selectView(name: RegExp): Promise<void> {
    await userEvent.click(screen.getByRole("button", { name }));
  }
  ```
  旧 `selectTab(/記事/)`→`selectView(/記事/)`（記事＝approve view）。`selectTab(/施策/)`→`selectView(/施策/)`、`/プロンプト/`→`selectView(/プロンプト/)`。
- 段階セグメント関連の `role="tablist" aria-label="表示切替"` → **`role="tablist" aria-label="段階フィルタ"`（TopBar）**。`role="tab"` の名前は段階ラベル（すべて/あなた待ち/生成中/公開済み）へ。**注意**: 旧「タブ分離/ルーティング(#119)」「タブのキーボード/a11y(#119)」は「LeftRail ナビ（nav/button・`aria-current`）」と「TopBar 段階フィルタ（tablist/tab）」の 2 系統に分割して書き換える:
  - LeftRail ナビ: `screen.getByRole("button", { name: /記事/ })` の `aria-current="page"` を検証（旧 `aria-selected` の役割）。`?view=approve` を URL に書くことを検証（旧 `?view=articles`→新 `?view=approve`）。
  - TopBar 段階フィルタ: `role="tablist" aria-label="段階フィルタ"` で ← → 相当（proto は ←→ 移動を持たないクリック切替のため、**キーボード ←→ 移動は段階フィルタには無い**。旧「← → でタブ移動」テストは **LeftRail ナビには ←→ が無い**ため撤去し、代わりに「ナビボタン click で view 切替＋`aria-current` 反映」を検証する形へ作り替える。`role="tab"` の段階フィルタは click で `onSegmentChange` を検証）。
  - `aria-controls/labelledby`: `<main role="tabpanel" id=... aria-labelledby=...>` を TopBar の選択中段階タブと紐付け、tab/tabpanel の関係を検証（approve view 表示時）。
- 公開キュー(#H23/#H24): 手順を `selectView(/公開キュー/)` で独立 view を開く形へ変更（旧 `selectTab(/記事/)`→記事タブ内の公開キュー展開ボタン、を撤去）。`onChanged→pollBoard` の検証本体（publish API 呼び出し＋`/api/growth/approve` 2 回以上再取得）は維持。
- 操作性 一括選択(#109): `BulkActionBar`（`role="group" aria-label="一括操作"`・`2件 選択中`・`一括承認`/`一括却下`/`解除`）→ **`BulkBar`** のクエリへ。`screen.getByText("2件 選択中")` は proto BulkBar が「`{count}` ＋ `件を選択中`」分割表示のため **`screen.getByText("2")`（件数バッジ）＋`getByText("件を選択中")`** に分解。ボタン名は `一括承認`→`/まとめて承認/`・`一括却下`→`/まとめて却下/`・`解除`→`name: "選択解除"`。一括承認/却下/解除の click→結果（`承認しました` トースト等）の検証強度は維持（空アサート禁止）。
- タブ分割/ソート(#242): `selectTab(/記事/)`→`selectView(/記事/)`。region `aria-label="施策レーン"`/`記事パイプライン` は ProposalsView/ArticlesView 由来で不変のため維持。優先度降順アサートも維持。
- **`/` キー＝検索フォーカスへ移設（確定#1）**: `it("/ でコマンドパレットが開き…")`（L2397）は **`/` で TopBar 検索欄にフォーカスが移ることを検証**する形へ書き換える（`fireEvent.keyDown(document.body, { key: "/" })`→`expect(screen.getByPlaceholderText("記事を検索…")).toHaveFocus()`。ジャンプ検証は ⌘K パレット側の別テストへ寄せる）。L2682 のパレット起点 `fireEvent.keyDown(document.body, { key: "/" })` も **⌘K（`{ key: "k", metaKey: true }`）** に置換（`/` はパレットを開かなくなるため）。
- **CommandPalette は ⌘K のみ（確定#1）**: `BoardToolbar` 撤去で `name: /検索・ジャンプ/` の検索ボタンが消えるため、`it("ツールバーの検索ボタンで開き…")`（L2411）は **⌘K でパレットを開く**起点へ書き換える（`fireEvent.keyDown(document.body, { key: "k", metaKey: true })`→`コマンドパレット` dialog 表示→背景クリック/閉じるで閉じる）。`コマンドパレットを閉じる` ボタン検証は維持。⌘K の既存パレットテスト（L2417 周辺・L2543）はそのまま緑。
- **検証強度の維持**: 各移設テストは「実 click/keyDown→実 DOM/トースト/URL/API 呼び出し/フォーカス」の実フローを保つ。role 名・ラベル・起点キーだけ新構造へ合わせ、アサート内容（件数・順序・API 呼び出し回数・URL 値・フォーカス）は落とさない。

- [ ] **Step 1: 移設対象テストを新構造へ書き換える（RED 駆動）**

ApproveClient.test.tsx の以下 describe を書き換え:
1. `ApproveClient タブ分割/ソート(#242/#90)`（L634-689）: `selectTab`→`selectView`、`?view` 検証は無し（region 維持）。
2. `ApproveClient タブ分離/ルーティング(#119)`（L2629-2688）: LeftRail ナビ系へ。`aria-selected`→`aria-current="page"`、`?view=articles`→`?view=approve`、`role="tab"`(view)→`role="button"`(view)。パレットからのジャンプ後 `aria-current` 検証。
3. `ApproveClient タブ初期化の同期(#119)`（L2691-2706）: `?view=articles`→`?view=approve`、`role="tab"`→`role="button" aria-current`。
4. `ApproveClient タブのキーボード/a11y(#119)`（L2708-2752）: ←→ ナビ移動テストを「ナビ click で view 切替＋`aria-current`」へ作り替え、`aria-controls/labelledby` を TopBar 段階タブ↔`<main role="tabpanel">` の紐付け検証へ変更。
5. `ApproveClient 公開キュー(#H23/#H24)`（L3636-3674）: `selectView(/公開キュー/)` で独立 view を開く手順へ。
6. `ApproveClient 操作性 一括選択(#109)`（L2422-2466）: BulkBar クエリへ（件数バッジ分解・ボタン名）。
7. `/` キー＝検索フォーカス（確定#1）: `it("/ でコマンドパレットが開き…")`（L2397）を「`/`→検索欄フォーカス」へ書き換え。`it("ツールバーの検索ボタンで開き…")`（L2411）を「⌘K でパレット起動」へ書き換え（`/検索・ジャンプ/` ボタンは BoardToolbar 撤去で消滅）。L2682 のパレット起点 `/` を ⌘K に置換。
8. ヘルパ: `selectTab`→`selectView`（LeftRail ボタン click）。
9. 旧 `BoardTabs`/`BoardToolbar`/`BulkActionBar` を参照する import・co-located テストがあれば撤去。

Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx` → 書き換えた describe が（実装は Task 6 済みのため）**緑になる**ことを確認。まだ赤なら実装側（Task 6 の語彙/role）を微修正（実装を直す・テストを甘くしない）。

- [ ] **Step 2: 旧コンポーネントを削除**

`BoardTabs.tsx`/`BoardToolbar.tsx`/`BulkActionBar.tsx` を削除。これらを import している箇所が ApproveClient 以外に無いことを確認（`grep -rn "BoardTabs\|BoardToolbar\|BulkActionBar" src`）。`viewRouting` の旧値を参照する箇所が残っていないことも確認。

- [ ] **Step 3: 全体ゲート確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）
Run: `npx eslint .`（0 errors）
Run: `npx vitest run --coverage`（全 PASS・グローバル statements/branches/functions/lines すべて 100%）
確認:
- 新規 `boardShellStats.ts`/`shellNav.ts`/`shell/TopBar.tsx`/`shell/LeftRail.tsx`/`shell/ShortcutBar.tsx`/`shell/ShortcutOverlay.tsx`/`shell/BulkBar.tsx`/`hooks/useDialog.ts` がすべて 100% で計測対象に入る（**exclude に追加しない**）。
- `vitest.config.ts` の `coverage.exclude` は **変更しない**（シェル操作系は除外しない方針）。`useDialog`/`ShortcutOverlay` の到達不可分岐は行内 `istanbul ignore` で対応済み。
- 旧 `BoardTabs`/`BoardToolbar`/`BulkActionBar` 削除で dead code・orphaned テストが残っていない。

- [ ] **Step 4: Commit**
```bash
git add -A src/app/growth/approve/
git status --short  # next-env.d.ts / node_modules が含まれないことを確認
git commit -m "test(growth): シェル移植に伴う旧タブ/一括バー/公開キューのテストを新構造へ移設し旧サーフェスを撤去

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 8: フェーズ検証（動作確認観点の提示）

**Files:** なし（コードは Task 7 で完了。本タスクは検証と確認観点提示のみ）。

- [ ] **Step 1: 最終ゲート再確認**

Run: `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run --coverage` を再実行し全緑・100% を確認。`git status` で未 push・`next-env.d.ts`/`node_modules` 非ステージを確認。

- [ ] **Step 2: 動作確認観点をユーザーへ提示（ブラウザ確認はユーザーが実施）**

以下を日本語で提示:
1. `/growth/approve` がダークテーマ（`.approve-shell`）で固定シェル表示になる（TopBar / LeftRail / 本体 / ShortcutBar）。
2. LeftRail で 施策/記事/プロンプト/成績/公開キュー を切替でき、URL `?view=` が `proposal|approve|prompt|performance|queue` で同期する。アクティブ項目に accent バー＋`aria-current`。
3. TopBar 段階セグメント（すべて/あなた待ち/生成中/公開済み）は常時表示。**非 approve view で段階セグメントを選ぶと approve view へ遷移しフィルタ適用**。件数ピル（あなた待ち/公開済み）と同期ラベル（たった今/N分前・2分以上で amber）が実データで動く。`/` キーで TopBar 検索欄へフォーカス（⌘K は CommandPalette）。検索欄でカード絞り込み。施策追加ボタンで AddProposalForm 起動（現行）。更新ボタンで盤再取得（回転アニメ）。
4. 公開キュー/成績が独立 view として開く（中身は現行ライトのまま＝過渡状態・P5 で再スキン）。
5. カードを複数選択すると下からフローティングの BulkBar がせり上がり、まとめて承認/却下/解除が動く。
6. ShortcutBar の**ヘルプボタン**（`?` ラベル付き）で ShortcutOverlay（focus-trap・esc ボタンで閉じる）。**`?` キー押下では開かない**（キーバインドは P6）。
7. **中身（ボードカード/詳細パネル/PublishQueue/PerformanceBoard/ProposalsView/PromptsView）はまだライト基調**＝P2〜P5 で再スキンする想定（過渡状態として正常）。
8. `prefers-reduced-motion` でアニメが抑制される。

> ユーザーのブラウザ確認完了まで push しない。確認で修正が出たら本計画の該当タスクへ戻る。

---

## Self-Review

- **Spec coverage**:
  - AD1（`.approve-shell` 適用・`--p-*` 維持）=Task 6 のシェル骨格組み替え＋`MotionConfig reducedMotion="user"`。
  - AD2（見た目 proto・データ本番フック）=Task 4/5 で proto コンポーネント near-verbatim 移植＋Task 6 で `useApproveBoard`/`useApproveDecisions` 等の実データ結線。
  - AD3（純ロジック分離 100%・presentation は薄結線のみ）=Task 1（boardShellStats）/Task 2（viewRouting/shellNav）を 100% テスト。シェル操作系（TopBar/LeftRail/ShortcutBar/ShortcutOverlay/BulkBar/useDialog）も**除外せず RTL で 100%**。
  - AD4（ステージ写像）=Task 1 で `isActionable`＋`stage` ベースのセグメント写像。
  - AD5（縮約）=`publishedTotal`（今週フィルタ未対応→published 総数・ピルラベルも「公開済み」に正確化）・`queueReady`（partition 近似）をコメント明記。performance/queue は独立 view へ移設するが再スキンせず縮約のまま。
  - surface map「テスト影響」6 describe（#242/#119×3/#H23#H24/#109）=Task 7 で新構造へ移設し検証強度維持。
- **Placeholder scan**: 全 step に実コード/実コマンド/期待結果。純ロジック（boardShellStats/viewRouting/shellNav）は実装全文を inline。コンポーネント移植は移植元パス＋具体的 rename（`proto-`→`approve-`・import 先・`aria-current`/`role` 追加）で曖昧さなし。
- **Type consistency**: `ShellSegmentKey`（boardShellStats）→ shellNav/TopBar/ApproveClient で一致。`ApproveView`（viewRouting 5 値）→ LeftRail/ApproveClient で一致。`ShellCounts`/`SyncAgo` の field 名が Task 6 結線指示と一致。`PendingItem`/`isActionable`/`Stage` の参照元一致。
- **確定した設計判断（メイン確定済み）**:
  1. **検索 vs パレット**: `/` キー→TopBar 検索フォーカス（proto 忠実）。CommandPalette は **⌘K のみ**で存置（`/` からは外す）。`/`→パレット起動の旧テストは「検索欄フォーカス」へ移設（Task 7）。
  2. **段階セグメント**: 常時表示（proto 忠実）。**非 approve view でセグメント選択→approve view へ遷移＋フィルタ適用**。tablist は approve のボード領域（tabpanel）を `aria-controls` で制御。
  3. **統計ピル 2 つ目**: ラベルを正確に **「公開済み」（published 総数）**。`deriveShellCounts` のキーは `publishedTotal`。コメントで「proto は今週公開・publishedAt 境界が surface できれば差し替え(AD5)」を明記。
  4. **キーバインド**: `?` 及び proto のフル keyboard system（J/K/A/R/E/X/1-4）は **P6 a11y へ送る**。P1 は ShortcutBar/ShortcutOverlay を**ボタン到達のみ**で出す（既存の本番キーハンドラは維持・新規キーバインド追加なし）。Global Constraints と Task 6/8 に明記。
  5. **初期 view**: `decideInitialView` は proto ヒューリスティック踏襲（施策未処理>0→`proposal` / あなた待ち>0→`approve` / それ以外→`performance`）。`deriveShellCounts` の `proposalPending`/`awaiting` で判定する純ロジックとして Task 2 でテスト済み（静的 performance 固定にしない）。
  6. **URL 語彙の破壊的変更**: 旧 `proposals|articles|prompts` を廃止し新 `proposal|approve|prompt|performance|queue` 化。`viewRouting.test.ts` の既存テストも Task 2 の移設対象に含めた。ShortcutOverlay の起動はボタン経由のみのテスト（`?` キー非追加）。
