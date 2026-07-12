# 承認画面 proto 移植 P3a: 2ペイン骨格＋単一リスト Board 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps は checkbox (`- [ ]`) 構文。

**Goal:** approve view を proto の「左=単一縦リスト Board（段階セクション・アクティブ行 layoutId レール）＋右=詳細ペイン」の2ペインへ組み替える。詳細の**中身は再スキンせず**現行 `DetailPanelView` を右ペインへ再ペアレントする（過渡状態・中身の proto 化は P3b）。あわせて `scheduled` ステージを un-縮約する。

**Architecture:** proto `Board.tsx`（単一縦リスト）を本番へ移植して approve view の `ArticlesView`（4列グリッド）を置換。行の見た目は P2 資産（`boardCardView`/`ui/primitives`/`ui/eyecatchThumb`/`deriveBoardStage`）を流用し、アクティブ行に framer-motion の `layoutId` レールを付ける。`ApproveClient` の `openId`（モーダル）を `activeId`（ペイン選択）へセマンティクス変更し、fixed overlay 詳細を `main` 内右ペインへ移す（TipTap 全画面編集は現行どおり `.approve-shell` 外 overlay 維持）。段階グルーピングは `deriveBoardStage`（proto BoardStage）ベースの新純ロジックで行う。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4 / Framer Motion（`__mocks__/framer-motion.tsx` モック）/ Vitest + RTL / istanbul。

## Global Constraints
- 設計書: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（§2 AD1〜AD5・§4 P3・§5）。research: `.superpowers/sdd/p3-research.md`。
- カバレッジ 100%（istanbul・閾値変更禁止）。**新規純ロジック（`groupByBoardStage`・`deriveBoardStage` 拡張）は除外せず 100%**。新規 presentation の単一リスト `Board.tsx` は P2 BoardCard と同様 **exclude せず RTL で 100%**（framer-motion はモック）。`coverage.exclude` は本フェーズでは変更しない（proto 詳細 presentation の exclude は P3b で行う）。
- **詳細の中身は再スキンしない**（現行 `DetailPanelView`/`DetailHeader`/`DraftChecklist`/`DraftPreviewPane` をそのまま右ペインで使う）。proto DetailPanel 2段タブ等は P3b。
- **操作ロジック（承認/却下/取消/選択/詳細オープン）は現行維持**。見た目・レイアウト・選択セマンティクスのみ変更。
- TS strict / `any` 禁止 / `React.FC` 禁止（関数宣言＋`XxxProps`）/ `import type` / boolean prop は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- framer-motion 使用ファイルは `"use client"`。`next/image`。`--p-*` トークン維持・class prefix `approve-`。
- a11y：単一リストは `role="list"`/`role="listitem"` 等セマンティック、アクティブ行は `aria-current`、モバイル「← 一覧」はボタン、`prefers-reduced-motion`、キーボード到達。
- 出力・コミットは日本語。**push 禁止**（ローカルコミットのみ）。`next-env.d.ts`/`node_modules` ステージ禁止。
- 各タスク末に `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run`（最終タスクで `--coverage` 100%）。コミット末尾に `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。

---

### Task 1: scheduled ステージ un-縮約（types 拡張・deriveBoardStage 拡張）

**Files:**
- Modify: `src/app/growth/approve/types.ts`（`scheduledAtMs` 追加）
- Modify: `src/app/growth/approve/ui/boardStage.ts`（`deriveBoardStage` に scheduled 分岐）
- Modify: `src/app/growth/approve/ui/boardStage.test.ts`（テスト追加）
- Modify: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD5-7 を un-縮約済へ）

**Interfaces:**
- `PendingItem` に `scheduledAtMs?: number | null`（サーバ `@/lib/growth/approve` の PendingItem に既存＝実行時データあり。クライアント型に宣言を追加するのみ）。
- `deriveBoardStage(item)`：`kind==="proposal"`→`idea` / `stage==="published"`→`published` / **`(stage==="drafted" || isDraftReady===true) && scheduledAtMs != null`→`scheduled`** / `stage==="generating"`→`generating` / `stage==="drafted" || isDraftReady===true`→`draft_review` / else→`outline_review`。

**設計判断:** scheduled は draft_review の**前**に判定（予約済み下書きは scheduled が優先）。`scheduledAtMs` は `null`/`undefined` で「未予約」。P2-fix1 の発見どおりデータは既存のため BE 改修不要。

- [ ] **Step 1: 失敗するテストを書く**

`boardStage.test.ts` の `describe("deriveBoardStage")` に追記：
```ts
it("drafted かつ scheduledAtMs があれば scheduled", () => {
  expect(deriveBoardStage(pi({ id: "s1", kind: "idea", stage: "drafted", scheduledAtMs: 1_000 }))).toBe("scheduled");
});
it("isDraftReady かつ scheduledAtMs があれば scheduled", () => {
  expect(deriveBoardStage(pi({ id: "s2", kind: "idea", stage: "queued", isDraftReady: true, scheduledAtMs: 1_000 }))).toBe("scheduled");
});
it("scheduledAtMs が null/未設定なら draft_review 側に寄る", () => {
  expect(deriveBoardStage(pi({ id: "s3", kind: "idea", stage: "drafted", scheduledAtMs: null }))).toBe("draft_review");
  expect(deriveBoardStage(pi({ id: "s4", kind: "idea", stage: "drafted" }))).toBe("draft_review");
});
it("published は scheduledAtMs があっても published", () => {
  expect(deriveBoardStage(pi({ id: "s5", kind: "idea", stage: "published", scheduledAtMs: 1_000 }))).toBe("published");
});
```
（`pi` ヘルパの型に `scheduledAtMs` を通すため `Partial<PendingItem>` で足りる。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/boardStage.test.ts` → FAIL（現 deriveBoardStage は scheduled を返さない）

- [ ] **Step 3: 実装**

`types.ts` の `contentId?` 付近に追加：
```ts
  // #H24/#proto P3a: 予約公開時刻(ms)。サーバ PendingItem のミラー由来。未予約は null/未設定。
  scheduledAtMs?: number | null;
```
`boardStage.ts` の `deriveBoardStage` を差し替え：
```ts
export function deriveBoardStage(item: PendingItem): BoardStage {
  if (item.kind === "proposal") return "idea";
  if (item.stage === "published") return "published";
  const draftish = item.stage === "drafted" || item.isDraftReady === true;
  if (draftish && item.scheduledAtMs != null) return "scheduled";
  if (item.stage === "generating") return "generating";
  if (draftish) return "draft_review";
  return "outline_review";
}
```

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/ui/boardStage.test.ts` → PASS・`boardStage.ts` 100%。

- [ ] **Step 5: 設計書 AD5-7 を更新**

AD5-7 の項目を「un-縮約済」に書き換え（例）：
```
7. **ボードステージ scheduled**: P3a で un-縮約。サーバ PendingItem の scheduledAtMs をクライアント型に宣言し、deriveBoardStage が drafted/isDraftReady かつ scheduledAtMs!=null を scheduled に写像する。
```

- [ ] **Step 6: Commit**
```bash
git add src/app/growth/approve/types.ts src/app/growth/approve/ui/boardStage.ts src/app/growth/approve/ui/boardStage.test.ts docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md
git commit -m "feat(growth): scheduled ステージを un-縮約（scheduledAtMs 宣言＋deriveBoardStage 拡張・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: 段階グルーピングの純ロジック（groupByBoardStage）

**Files:**
- Create: `src/app/growth/approve/boardGroups.ts`
- Test: `src/app/growth/approve/boardGroups.test.ts`

**Interfaces:**
- Consumes: `PendingItem`（`./types`）・`deriveBoardStage`（`./ui/boardStage`）・`BoardStage`/`STAGE_ORDER`/`STAGE_META`（`./ui/boardStage`）・`isActionable`（`./board`）。
- Produces:
  - `interface BoardGroup { stage: BoardStage; label: string; items: PendingItem[] }`
  - `groupByBoardStage(items: readonly PendingItem[]): BoardGroup[]`（各 item を `deriveBoardStage` で分類し、`STAGE_ORDER` 順のセクション配列にする。**空セクションは除外**。各 group 内は入力順を保つ＝呼び出し側で優先度ソート済みを前提）。
- 結線先: Task 3 の単一リスト Board がこの配列で段階セクションを描画。

**設計判断:** proto Board は段階セクションの縦リスト。本番は `deriveBoardStage`（BoardStage 6値）でグルーピングする（現行 `board.ts` の ArticleStage 4列グリッド `groupArticlesByStage` は approve グリッド専用＝Task 4 で不使用になるが本 Task では触らない）。ラベルは `STAGE_META[stage].label`。

- [ ] **Step 1: 失敗するテストを書く**

`boardGroups.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { groupByBoardStage } from "./boardGroups";
import type { PendingItem } from "./types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("groupByBoardStage", () => {
  it("BoardStage ごとに STAGE_ORDER 順のセクションへ分ける", () => {
    const items = [
      pi({ id: "g", kind: "idea", stage: "generating" }),
      pi({ id: "p", kind: "idea", stage: "published" }),
      pi({ id: "o", kind: "idea", stage: "proposed" }),
    ];
    const groups = groupByBoardStage(items);
    const stages = groups.map((g) => g.stage);
    // outline_review が generating より前・published が最後(STAGE_ORDER 準拠)
    expect(stages).toContain("outline_review");
    expect(stages).toContain("generating");
    expect(stages).toContain("published");
    expect(stages.indexOf("outline_review")).toBeLessThan(stages.indexOf("generating"));
    expect(stages.indexOf("generating")).toBeLessThan(stages.indexOf("published"));
  });
  it("空セクションは含めない", () => {
    const groups = groupByBoardStage([pi({ id: "p", kind: "idea", stage: "published" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].stage).toBe("published");
    expect(groups[0].label.length).toBeGreaterThan(0);
  });
  it("group 内は入力順を保つ", () => {
    const items = [
      pi({ id: "a", kind: "idea", stage: "proposed" }),
      pi({ id: "b", kind: "idea", stage: "proposed" }),
    ];
    expect(groupByBoardStage(items)[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("空配列は空配列", () => {
    expect(groupByBoardStage([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/boardGroups.test.ts` → FAIL

- [ ] **Step 3: 実装**

`boardGroups.ts`:
```ts
/**
 * 単一リスト Board(#proto P3a)の段階セクション・グルーピングの純ロジック。DOM 非依存。
 * deriveBoardStage(proto BoardStage) で分類し STAGE_ORDER 順に並べる。空セクションは除外。
 * 現行 board.ts の groupArticlesByStage(ArticleStage 列グリッド)とは別レイヤー。
 */

import { deriveBoardStage, STAGE_META, STAGE_ORDER, type BoardStage } from "./ui/boardStage";
import type { PendingItem } from "./types";

export interface BoardGroup {
  stage: BoardStage;
  label: string;
  items: PendingItem[];
}

/** items を BoardStage ごとに STAGE_ORDER 順のセクション配列へ分ける(空セクション除外・group 内は入力順保持)。 */
export function groupByBoardStage(items: readonly PendingItem[]): BoardGroup[] {
  const byStage = new Map<BoardStage, PendingItem[]>();
  for (const item of items) {
    const stage = deriveBoardStage(item);
    const bucket = byStage.get(stage);
    if (bucket) bucket.push(item);
    else byStage.set(stage, [item]);
  }
  return STAGE_ORDER.flatMap((stage) => {
    const bucket = byStage.get(stage);
    return bucket && bucket.length > 0
      ? [{ stage, label: STAGE_META[stage].label, items: bucket }]
      : [];
  });
}
```
（`STAGE_ORDER`/`STAGE_META` の export 名・型は `ui/boardStage.ts` を確認して合わせる。`STAGE_ORDER` が無ければ `STAGE_META` のキーを order 順に並べたものを使う。）

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/boardGroups.test.ts` → PASS・`boardGroups.ts` 100%。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/boardGroups.ts src/app/growth/approve/boardGroups.test.ts
git commit -m "feat(growth): 単一リスト Board の段階グルーピング純ロジック groupByBoardStage を追加（100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: 単一リスト Board コンポーネント移植（proto Board → 本番）

**Files:**
- Create: `src/app/growth/approve/BoardList.tsx`
- Test: `src/app/growth/approve/BoardList.test.tsx`

**Interfaces:**
- `BoardList` props（proto `Board.tsx` を本番データへ寄せる）:
  ```ts
  interface BoardListProps {
    groups: BoardGroup[];              // groupByBoardStage の結果
    activeId: string | null;           // 選択中(右ペイン表示)。アクティブ行 layoutId レール。
    decided: Record<string, string | undefined>; // isActionable 判定用
    densityClass?: string;
    onActivate: (id: string) => void;  // 行クリック→詳細ペイン表示(旧 onOpen 相当)
    renderRow: (item: PendingItem, isActive: boolean) => ReactNode; // 行本体(P2 カード資産を流用)
  }
  ```
  - **設計判断**: 行の中身（EyecatchThumb/StageChip/ScoreBar/AwaitingDot/承認却下ボタン等）は既存の行レンダラ（`ApproveClient` の `renderItem` 相当）を `renderRow` で受け取り、`BoardList` は「段階セクション骨格＋アクティブ行 layoutId レール＋クリックで onActivate」に責務を絞る。これにより操作ロジックを現行維持しつつ単一リスト化できる。
  - アクティブ行の左端に `layoutId="approve-active-rail"` の `motion.div`（3px アクセント）。
- 結線先: Task 4 の ApproveClient が `groups={groupByBoardStage(filteredIdeas)}`・`renderRow` に現行カード描画・`activeId`/`onActivate` を渡す。

**設計判断（proto Board.tsx 移植・research §2/§3）:**
- proto `approve-proto/Board.tsx`（単一縦リスト・段階 `<section>`・sticky ヘッダ＋件数・行は `motion.button` の `layout`＋アクティブ `layoutId="proto-active-rail"`）を**読んで**移植。`proto-`→`approve-`・アイコン `./ui/icons`・`"use client"`。
- proto は行内に独自マークアップを持つが、本番は**行本体を `renderRow` に委譲**（操作ロジック維持のため）。proto の「行の枠・hover・アクティブ背景・layoutId レール・段階セクション・sticky ヘッダ・空セクション無し」を移植し、行の中身だけ `renderRow` を差し込む。
- 段階セクションのラベル/件数は `group.label`/`group.items.length`。
- a11y: `<ul role="list">` セクション、`<li>`、アクティブ行 `aria-current="true"`。

- [ ] **Step 1: 失敗するテストを書く**

`BoardList.test.tsx`（要点）:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardList } from "./BoardList";
import type { BoardGroup } from "./boardGroups";
import type { PendingItem } from "./types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: over.id ?? "t", subtitle: "", ...over } as PendingItem;
}
const groups: BoardGroup[] = [
  { stage: "generating", label: "生成中", items: [pi({ id: "g1", kind: "idea", stage: "generating" })] },
  { stage: "published", label: "公開済み", items: [pi({ id: "p1", kind: "idea", stage: "published" })] },
];

function setup(over: Partial<Parameters<typeof BoardList>[0]> = {}) {
  const onActivate = vi.fn();
  render(
    <BoardList
      groups={groups}
      activeId={null}
      decided={{}}
      onActivate={onActivate}
      renderRow={(item) => <span>{item.id}行</span>}
      {...over}
    />,
  );
  return { onActivate };
}

describe("BoardList", () => {
  it("段階セクションをラベル＋件数で出す", () => {
    setup();
    expect(screen.getByText("生成中")).toBeInTheDocument();
    expect(screen.getByText("公開済み")).toBeInTheDocument();
  });
  it("renderRow で行本体を描画する", () => {
    setup();
    expect(screen.getByText("g1行")).toBeInTheDocument();
    expect(screen.getByText("p1行")).toBeInTheDocument();
  });
  it("行クリックで onActivate(id)", async () => {
    const { onActivate } = setup();
    await userEvent.click(screen.getByText("g1行"));
    expect(onActivate).toHaveBeenCalledWith("g1");
  });
  it("activeId の行に aria-current が付く", () => {
    setup({ activeId: "p1" });
    const active = screen.getByText("p1行").closest("[aria-current]");
    expect(active).toHaveAttribute("aria-current", "true");
  });
});
```
（proto 行が `motion.button` なので、`renderRow` は button の中に置くか、行ラッパーを button にするかを実装で決める。onActivate は行ラッパーのクリックで発火。テストは `renderRow` の中身クリックで onActivate を確認。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/BoardList.test.tsx` → FAIL

- [ ] **Step 3: BoardList.tsx を移植・実装**

proto `Board.tsx` を読み、上記 Interfaces/設計判断に沿って移植。段階セクション骨格・sticky ヘッダ・アクティブ行 `layoutId="approve-active-rail"`・hover/active 配色（`--p-*`）を proto から。行本体は `renderRow(item, item.id === activeId)`。クリックは行ラッパーの `onClick={() => onActivate(item.id)}`。framer-motion `motion`/`layoutId` 使用のため `"use client"`。

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/BoardList.test.tsx` → PASS・`BoardList.tsx` 100%（未到達は実効テスト追加）。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/BoardList.tsx src/app/growth/approve/BoardList.test.tsx
git commit -m "feat(growth): 単一リスト Board(BoardList) を proto から移植（段階セクション・layoutId アクティブレール・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: ApproveClient 2ペイン結線（activeId 化・Board 差し替え・詳細ペイン化）

> 本タスクは大きい。Task 4（骨格差し替え）／Task 5（テスト移設）に分割。Task 4 末で `tsc`/`eslint`/移設対象外テストは緑、`ApproveClient.test.tsx` の詳細/盤系の一部は一時赤を許容し Task 5 で回復（P1 Task6/7 の運用に倣う）。

**Files:**
- Modify: `src/app/growth/approve/ApproveClient.tsx`

**設計判断（research §1/§3・確定）:**
- **state**: `openId`→`activeId`（`useState<string | null>`）。`openItem`→`activeItem`。`onOpen`→`onActivate`（`setActiveId(item.id)`）。詳細を閉じる（モバイル戻る）は `onBack`（`setActiveId(null)`）。`revise`/`useDraftPreview`/`useDraftEditing` へ渡す `openId` 参照を `activeId` へ改名追従。
- **approve view レイアウト**（proto page.tsx:1064-1098 準拠）: approve view の描画を
  ```
  <div className="flex h-full min-h-0">
    <section 左: activeId!=null は lg:block hidden(モバイルで隠す)・幅 w-[38%] min/max・borderRight>
      {searchEmpty ? <SearchEmpty/> : <BoardList groups=... activeId=... onActivate=... renderRow=現行カード />}
    </section>
    <section 右: activeId==null は lg:block hidden(モバイルで隠す)・flex-1>
      {activeItem ? <DetailPanelView ...現行props... onClose={onBack} /> : <詳細未選択のプレースホルダ(lg 用「記事を選択」)> }
    </section>
  </div>
  ```
  へ置換。**現行の fixed overlay 詳細（`DetailPanelView` を全画面 overlay で出していた分岐, research §1 の 851-874）を廃し、右ペインに移す**。`DetailPanelView` の props（`item=activeItem`・`draftState`・`revise`・`onClose=onBack`・各ハンドラ）はそのまま結線（中身の再スキンは P3b）。
- **renderRow**: 現行の `renderItem`（BoardCard を返す関数）をそのまま `renderRow` として渡す（承認/却下/取消/選択の操作ロジック維持）。BoardList が段階セクション骨格＋クリック→`onActivate` を担う。旧 `ArticlesView`（4列グリッド）呼び出しを撤去。
- **groups**: `groupByBoardStage(visibleIdeas)`（`visibleIdeas` は現行の `matchesSegment`＋query 絞り込み済み ideas）。旧 `groupArticlesByStage`/`articleColumns` の approve 用途を撤去（`board.ts` 自体は残す・他用途/テストが無ければ Task 5/後続で整理）。
- **モバイル master-detail**: 上記 lg 未満の hidden 切替＋右ペイン先頭に「← 一覧」ボタン（`onBack`・`lg:hidden`）。
- **TipTap 全画面編集**: `renderEditWorkspace()`（`.approve-shell` 外 overlay）は現状維持（変更しない）。
- **他 view（proposal/prompt/performance/queue）は不変**（P1 のまま）。段階セグメント（TopBar tablist）と approve tabpanel の紐付けは維持（`aria-controls`/`labelledby`）。

- [ ] **Step 1: 現状の approve view / 詳細分岐を把握**

Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx -t "認証"`（移設対象外の基準確認）。`ApproveClient.tsx` の openId/DetailPanelView overlay・approve view 描画箇所を読む。

- [ ] **Step 2: ApproveClient.tsx を組み替える**

1. `openId`→`activeId`・`openItem`→`activeItem`・`onOpen`→`onActivate`・`onClose`→`onBack` に改名追従（`revise`/`useDraftPreview` 等の引数名も）。
2. approve view の `return` を上記 2ペイン構造へ置換（`BoardList` + 右 `DetailPanelView`/プレースホルダ）。旧 `ArticlesView` 呼び出しと fixed overlay 詳細分岐を撤去。
3. `groups={groupByBoardStage(visibleIdeas)}`・`renderRow={renderItem}`・`activeId`・`onActivate`・`decided` を結線。
4. モバイル master-detail の hidden 切替＋「← 一覧」。

- [ ] **Step 3: 型・lint・移設対象外テスト緑を確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（**詳細オープン/閉じ・盤描画・#237 系など activeId/2ペインに触れる describe は一時赤を許容・それ以外は緑**。赤が移設対象に限ることを確認＝新シェルの回帰を出していない）。

> コミット時点で ApproveClient.test.tsx の一部が赤。**Task 5 と連続実行**し Task 5 完了で全緑＋カバレッジ 100% に到達させる。

- [ ] **Step 4: Commit**
```bash
git add src/app/growth/approve/ApproveClient.tsx
git commit -m "feat(growth): approve view を proto 2ペイン(単一リスト+右詳細ペイン)へ組み替え・activeId 化（テスト移設は次タスク）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: ApproveClient テスト移設・旧盤サーフェス整理・全体ゲート

**Files:**
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（詳細/盤系 describe を2ペイン構造へ）
- Modify（必要時）: `src/app/growth/approve/ArticlesView.tsx`/`ArticlesView.test.tsx`（approve で未使用になった場合の整理。他 view で使っていなければ撤去・使っていれば残置）

**設計判断（テスト移設・確定）:**
- 詳細オープン検証：旧「カードの詳細を開く→モーダル/ドロワー表示」→「行を `onActivate`→**右ペイン**に詳細表示（`activeId` 反映・アクティブ行 `aria-current`）」へ。`openId` 由来の close→`onBack`（モバイル「← 一覧」or lg で選択解除）。
- 盤描画検証：旧 `ArticlesView`（4列グリッド・列見出し）→ `BoardList`（段階セクション・単一リスト）。段階ラベル/件数・カード到達を新構造で。
- **強度維持**：承認/却下/取消/編集の click→ハンドラ・API 呼出回数・トースト・URL・フォーカスのアサートは落とさない。正しく2ペインへ直しても赤いテストは実装バグとして `ApproveClient.tsx` を直す（テストを甘くしない）。
- 旧 `ArticlesView` が approve から外れたことで参照が無くなれば撤去（`grep -rn "ArticlesView" src`）。他 view/テストが使っていれば残置し、その旨コメント。

- [ ] **Step 1: 移設対象テストを新構造へ書き換える（RED 駆動）**

`ApproveClient.test.tsx` の詳細オープン/閉じ・盤描画・#237/#275 等の describe を新2ペイン構造へ。Run 後、書き換えた describe が（Task 4 実装済みのため）緑になることを確認。まだ赤なら実装を微修正（テストを甘くしない）。

- [ ] **Step 2: 旧盤サーフェスの整理**

`grep -rn "ArticlesView\|groupArticlesByStage" src` で approve 以外の参照を確認。approve 専用で未使用化したものは撤去（co-located テスト含む）。`board.ts` の `groupArticlesByStage` が他所（テスト等）で使われていれば残置。

- [ ] **Step 3: 全体ゲート確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint .`（0）/ `npx vitest run --coverage`（全 PASS・グローバル 100%）。確認：
- 新規 `boardGroups.ts`・`BoardList.tsx`・`deriveBoardStage` 拡張が 100% で計測対象（exclude しない）。
- `coverage.exclude` を本フェーズで変更していない（proto 詳細 presentation の exclude は P3b）。
- dead code・orphaned テストが残っていない。

- [ ] **Step 4: Commit**
```bash
git add -A src/app/growth/approve/
git status --short  # next-env.d.ts / node_modules を含まないこと
git commit -m "test(growth): 2ペイン化に伴う ApproveClient テストを新構造(単一リスト/右詳細ペイン/activeId)へ移設し旧グリッドを整理

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: フェーズ検証（動作確認観点の提示）

**Files:** なし。

- [ ] **Step 1: 最終ゲート再確認** — `npx tsc --noEmit` / `npx eslint .` / `npx vitest run --coverage` 全緑・100%。`git status` で未 push・`next-env.d.ts`/`node_modules` 非ステージ。

- [ ] **Step 2: 動作確認観点をユーザーへ提示（日本語）**
1. approve view（記事）が **2ペイン**（左=単一縦リストの段階セクション盤・右=詳細）になる。**4列グリッドは廃止**。
2. 左リストで記事をクリックすると**右ペインに詳細**が出る（モーダルでなくペイン）。アクティブ行に左端アクセントレール（滑らかに移動）＋`aria-current`。
3. **狭幅（モバイル）**では1ペイン：未選択=一覧全幅／選択=詳細全幅＋「← 一覧」で戻る。
4. **詳細の中身はまだ現行ライト版**（右ペインに再ペアレントしただけ＝過渡状態・proto 化は P3b）。
5. 予約公開済みの下書きが `scheduled`（予約）段階として区別される。
6. 承認/却下/取消/編集などの操作は従来どおり。`prefers-reduced-motion` でレール/アニメ抑制。

> ユーザーのブラウザ確認完了まで push しない。確認で修正が出たら該当タスクへ戻る。

---

## Self-Review
- **Spec coverage**:
  - §4 P3「2ペイン・単一リスト Board・layoutId」= Task 3（BoardList・active-rail）/ Task 4（2ペイン結線）。DetailPanel 2段タブ/DetailViews/OutlineView/QualityChecklist/DevicePreview の中身再スキンは **P3b**（本計画スコープ外・明記）。
  - AD4/AD5-7（scheduled）= Task 1（un-縮約）。
  - AD3（純ロジック分離 100%）= Task 1（deriveBoardStage）/ Task 2（groupByBoardStage）。単一リスト Board は presentation だが P2 同様 exclude せず 100%（framer-motion モック）。
  - research §3 の 2ペイン骨格・master-detail・activeId・TipTap overlay 維持 = Task 4。
- **Placeholder scan**: 純ロジック（deriveBoardStage 拡張・groupByBoardStage）は実装全文 inline。BoardList/ApproveClient は proto/現行を読んで移植する具体手順＋テストコードで曖昧さなし（"similar to"/TBD なし）。
- **Type consistency**: `scheduledAtMs`（types）→ deriveBoardStage で参照。`BoardGroup`（boardGroups）→ BoardList props / ApproveClient 結線。`deriveBoardStage`/`STAGE_ORDER`/`STAGE_META`（boardStage）の参照一致。`renderRow`/`onActivate`/`activeId` の型が Task 3↔Task 4 で一致。
- **確定判断の明記**: 詳細中身は再スキンせず現行 DetailPanelView 再ペアレント（proto 化=P3b）・scheduled un-縮約・段階グルーピングは deriveBoardStage ベース・操作ロジック維持・TipTap overlay 維持・coverage.exclude は本フェーズ不変。
