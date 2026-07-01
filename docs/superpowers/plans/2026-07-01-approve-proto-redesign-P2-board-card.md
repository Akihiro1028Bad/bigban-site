# 承認画面 proto 移植 P2: ボード＋カード 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps は checkbox (`- [ ]`) 構文。

**Goal:** approve view のカード（`BoardCard`）と空/読込/エラー状態（`GateScreens`）を proto デザインへ再スキンし、AD4 のステージ写像 `deriveBoardStage` とカード表示派生値を純ロジック化して 100% テストする。**盤のレイアウト（4列グリッド＋モバイル横スワイプ・`board.ts` の列グルーピング）は変えない**（proto 単一縦リスト＋2ペイン＋`layoutId` アクティブレールは P3 送り）。

**Architecture:**
- P0/P1 成果（`ui/primitives.tsx` の `StageChip`/`ScoreBar`/`AwaitingDot`/`MetaStat`・`ui/boardStage.ts` の `BoardStage`/`STAGE_META`・`ui/scales.ts`・`.approve-shell` テーマCSS・framer-motion モック）を土台に、カード見た目のみ proto へ寄せる。
- 新規純ロジックは `.ts` に分離し 100% テスト（除外しない）：`deriveBoardStage`（`ui/boardStage.ts` へ追加）・`boardCardView.ts`（`cardExcerpt`/`cardHue`/`cardHasEyecatch`）。
- presentation（`ui/eyecatchThumb.tsx` 新規・`BoardCard.tsx`/`GateScreens.tsx` 再スキン）は RTL で 100% テスト（除外しない・P0/P1 踏襲）。
- `ArticlesView.tsx`/`board.ts`/`ApproveClient.tsx` の**盤構造・操作ロジック・列グルーピングは不変**。P2 は「カードとステート画面の見た目」に閉じる。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4 / Framer Motion（`__mocks__/framer-motion.tsx` モック）/ Vitest + RTL / istanbul。

## Global Constraints
- 設計書: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（§2 AD3/AD4/AD5・§3 disposition ボード行・§4 P2・§5 制約）。
- カバレッジ 100%（istanbul・閾値/`coverage.exclude` 変更禁止）。**新規純ロジック（`deriveBoardStage`・`boardCardView.ts`）と再スキン presentation（`eyecatchThumb.tsx`・`BoardCard.tsx`・`GateScreens.tsx`）は除外せず 100% テスト**。jsdom 到達不可分岐のみ行内 `/* istanbul ignore next -- @preserve 理由 */`（exclude に足さない）。CSS は非計測。
- TS strict / `any` 禁止 / `React.FC` 禁止（関数宣言＋`XxxProps`）/ `import type` / boolean prop は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止（最終手段 `@ts-expect-error`＋理由）。
- `"use client"` は対話/framer-motion/ブラウザAPI が要る時のみ。**画像は `next/image`（raw `<img>` 禁止）**。`--p-*` トークン名維持・class prefix `approve-`。
- a11y：セマンティック HTML・`prefers-reduced-motion`・コントラスト・キーボード・全画像に `alt`（装飾は `alt=""`）。
- **盤レイアウト・列グルーピング・承認/却下等の操作ロジックは現行維持**（P2 は見た目のみ）。proto 単一リスト/2ペイン/`layoutId` は P3。
- 出力・コミットは日本語。**push 禁止**（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。`next-env.d.ts`/`node_modules` ステージ禁止。
- 各タスク末に `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run`（最終タスクで `--coverage` 100%）緑を確認。
- コミットメッセージ末尾に必ず `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。

### 確定した設計判断（メイン確定済み・蒸し返さない）
- **レイアウト現行維持**（ユーザー確定）。P2 はカード＋ステート画面の再スキンに閉じる。
- **`scheduled` は縮約**：`scheduledAtMs` が本番 `PendingItem` に無いため `deriveBoardStage` は `scheduled` を返さない。AD5 に追記（Task 1）。
- **`idea` は施策トリアージ用**（`kind==="proposal"`）。記事盤（`kind==="idea"`）には現れないが、`deriveBoardStage` は total な関数として proposal→`idea` を返す（ProposalsView 再スキン=P5 で利用）。
- **生成中 pulse は `approve-pulse` CSS へ統一**（現行 `motion-safe:animate-pulse` から。`StageChip` と一貫）。
- **`hue`/`excerpt`/`hasEyecatch` は本番データから導出**（proto Article 固有属性が本番 `PendingItem` に無いため）。更新時刻ラベル等の surface できない proto 属性は縮約（`MetaStat` は導出可能な情報＝スコア等に限定、または省略）。

---

### Task 1: ステージ写像の純ロジック（deriveBoardStage）＋ AD5 追記

**Files:**
- Modify: `src/app/growth/approve/ui/boardStage.ts`（`deriveBoardStage` を追加）
- Modify: `src/app/growth/approve/ui/boardStage.test.ts`（テスト追加）
- Modify: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD5 に scheduled 縮約を追記）

**Interfaces:**
- Consumes: `PendingItem`（`../types`）・`BoardStage`（同ファイル既存型）。
- Produces: `deriveBoardStage(item: PendingItem): BoardStage`。後続 Task 4（BoardCard）が `StageChip(deriveBoardStage(item))` で使用。

**設計判断（AD4 写像）:**
- `kind==="proposal"` → `"idea"`（最優先）。
- 記事（`kind==="idea"`）: `stage==="published"`→`"published"` / `stage==="generating"`→`"generating"` / `stage==="drafted" || isDraftReady===true`→`"draft_review"` / それ以外（`proposed`/`queued`/`rejected` 等）→`"outline_review"`。
- `"scheduled"` は返さない（縮約・`scheduledAtMs` 未 surface）。この縮約理由を関数コメントと設計書 AD5 に明記。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/boardStage.test.ts` に追記：
```ts
import { deriveBoardStage } from "./boardStage";
import type { PendingItem } from "../types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("deriveBoardStage", () => {
  it("施策(proposal)は idea", () => {
    expect(deriveBoardStage(pi({ id: "p1", kind: "proposal", stage: "proposed" }))).toBe("idea");
  });
  it("published は published", () => {
    expect(deriveBoardStage(pi({ id: "a1", kind: "idea", stage: "published" }))).toBe("published");
  });
  it("generating は generating", () => {
    expect(deriveBoardStage(pi({ id: "a2", kind: "idea", stage: "generating" }))).toBe("generating");
  });
  it("drafted は draft_review", () => {
    expect(deriveBoardStage(pi({ id: "a3", kind: "idea", stage: "drafted" }))).toBe("draft_review");
  });
  it("isDraftReady=true は stage に依らず draft_review", () => {
    expect(deriveBoardStage(pi({ id: "a4", kind: "idea", stage: "queued", isDraftReady: true }))).toBe("draft_review");
  });
  it("proposed/queued(下書き未) は outline_review", () => {
    expect(deriveBoardStage(pi({ id: "a5", kind: "idea", stage: "proposed" }))).toBe("outline_review");
    expect(deriveBoardStage(pi({ id: "a6", kind: "idea", stage: "queued" }))).toBe("outline_review");
  });
  it("scheduled は返さない(縮約=drafted系は draft_review へ寄る)", () => {
    // scheduledAtMs 未 surface のため scheduled 判定はしない。drafted は draft_review。
    expect(deriveBoardStage(pi({ id: "a7", kind: "idea", stage: "drafted" }))).not.toBe("scheduled");
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/boardStage.test.ts` → FAIL（`deriveBoardStage` 未 export）

- [ ] **Step 3: deriveBoardStage を実装**

`src/app/growth/approve/ui/boardStage.ts` に追加（`import type { PendingItem } from "../types";` を先頭 import 群へ）：
```ts
/**
 * 本番 PendingItem を proto の BoardStage へ写像する(AD4)。
 * 縮約(AD5): `scheduled` は scheduledAtMs が本番型に無いため返さない。予約公開が surface
 * できるようになったら drafted 系から分岐して復活させる。`idea` は施策トリアージ(kind=proposal)用。
 */
export function deriveBoardStage(item: PendingItem): BoardStage {
  if (item.kind === "proposal") return "idea";
  if (item.stage === "published") return "published";
  if (item.stage === "generating") return "generating";
  if (item.stage === "drafted" || item.isDraftReady === true) return "draft_review";
  return "outline_review";
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ui/boardStage.test.ts` → PASS。カバレッジで `boardStage.ts` 100% を確認。

- [ ] **Step 5: 設計書 AD5 に scheduled 縮約を追記**

`docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md` の AD5 リストに 1 項目追記（既存様式に合わせる）：
```
7. **ボードステージ scheduled（予約公開）**: 本番 PendingItem に scheduledAtMs が無いため P2 では `scheduled` を写像しない（drafted 系は draft_review へ寄せる）。予約公開時刻を Notion/派生で surface できるようになった時点で deriveBoardStage に分岐追加。
```

- [ ] **Step 6: Commit**
```bash
git add src/app/growth/approve/ui/boardStage.ts src/app/growth/approve/ui/boardStage.test.ts docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md
git commit -m "feat(growth): AD4 ステージ写像 deriveBoardStage を追加（scheduled 縮約・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: カード表示派生値の純ロジック（boardCardView.ts）

**Files:**
- Create: `src/app/growth/approve/boardCardView.ts`
- Test: `src/app/growth/approve/boardCardView.test.ts`

**Interfaces:**
- Consumes: `PendingItem`（`./types`）。
- Produces:
  - `cardExcerpt(item: PendingItem, max?: number): string`（既定 max=60。`subtitle` → 無ければ `details` → 無ければ空。max 超で `…` 付与）
  - `cardHue(seed: string): number`（決定的ハッシュ 0-359。EyecatchThumb のグラデーション用）
  - `cardHasEyecatch(item: PendingItem): boolean`（`contentId` があれば true＝microCMS 化済み＝画像あり相当の近似。近似理由をコメント明記）
- 結線先: Task 4 BoardCard が `EyecatchThumb` の `hue`/`has`・カード抜粋にこれらを使用。あなた待ちドットは既存 `isActionable`（`./board`）を再利用（本 Task では作らない）。

**設計判断:** proto Article の `hue`/`excerpt`/`hasEyecatch` は本番 `PendingItem` に無い派生値。視覚目的の合成であり BE 不要な範囲で決定的に導出する。更新時刻ラベル等 surface 不能な proto 属性は導出しない（縮約・BoardCard 側で該当 `MetaStat` を出さない）。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/boardCardView.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { cardExcerpt, cardHasEyecatch, cardHue } from "./boardCardView";
import type { PendingItem } from "./types";

function pi(over: Partial<PendingItem> & Pick<PendingItem, "id" | "kind" | "stage">): PendingItem {
  return { title: "t", subtitle: "", ...over } as PendingItem;
}

describe("cardExcerpt", () => {
  it("subtitle を優先して返す", () => {
    expect(cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: "サブ" }))).toBe("サブ");
  });
  it("subtitle が空なら details を使う", () => {
    expect(cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: "", details: "詳細" }))).toBe("詳細");
  });
  it("max を超えたら … を付けて切る", () => {
    const long = "あ".repeat(80);
    const out = cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: long }), 10);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(11);
  });
  it("どちらも無ければ空文字", () => {
    expect(cardExcerpt(pi({ id: "a", kind: "idea", stage: "proposed", subtitle: undefined }))).toBe("");
  });
});

describe("cardHue", () => {
  it("同じ seed は同じ値・範囲は 0-359", () => {
    const h = cardHue("abc");
    expect(h).toBe(cardHue("abc"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  it("異なる seed で分布する(空文字も 0-359)", () => {
    expect(cardHue("")).toBeGreaterThanOrEqual(0);
    expect(cardHue("x")).not.toBe(cardHue("y"));
  });
});

describe("cardHasEyecatch", () => {
  it("contentId があれば true", () => {
    expect(cardHasEyecatch(pi({ id: "a", kind: "idea", stage: "drafted", contentId: "c1" }))).toBe(true);
  });
  it("contentId が無ければ false", () => {
    expect(cardHasEyecatch(pi({ id: "a", kind: "idea", stage: "proposed" }))).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/boardCardView.test.ts` → FAIL（モジュール未作成）

- [ ] **Step 3: boardCardView.ts を実装**
```ts
/**
 * ボードカードの表示派生値の純ロジック(#proto P2)。DOM/IO 非依存。
 * proto Article の hue/excerpt/hasEyecatch は本番 PendingItem に無いため、視覚目的で決定的に導出する。
 * hasEyecatch は contentId 有無で近似(microCMS 化済み=アイキャッチ設定済みの近似)。
 * surface できない proto 属性(更新時刻ラベル等)は導出せず、BoardCard 側でも表示しない(縮約)。
 */

import type { PendingItem } from "./types";

/** 抜粋(subtitle 優先・無ければ details・max 超で … 付与)。 */
export function cardExcerpt(item: PendingItem, max = 60): string {
  const src = (item.subtitle && item.subtitle.trim()) || (item.details ?? "").trim();
  if (src.length <= max) return src;
  return `${src.slice(0, max)}…`;
}

/** seed から決定的に 0-359 の hue を得る(EyecatchThumb グラデーション用)。 */
export function cardHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** アイキャッチ有無の近似(microCMS content 化済み=contentId ありなら true)。 */
export function cardHasEyecatch(item: PendingItem): boolean {
  return typeof item.contentId === "string" && item.contentId.length > 0;
}
```

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/boardCardView.test.ts` → PASS・`boardCardView.ts` 100%。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/boardCardView.ts src/app/growth/approve/boardCardView.test.ts
git commit -m "feat(growth): ボードカード表示派生の純ロジック boardCardView を追加（抜粋/hue/アイキャッチ近似・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: EyecatchThumb 移植（ui/eyecatchThumb.tsx）

**Files:**
- Create: `src/app/growth/approve/ui/eyecatchThumb.tsx`
- Test: `src/app/growth/approve/ui/eyecatchThumb.test.tsx`

**Interfaces:**
- Produces: `EyecatchThumb({ hue, size?, has?, url?, alt? }: EyecatchThumbProps)`。
  - `interface EyecatchThumbProps { hue: number; size?: number; has?: boolean; url?: string; alt?: string }`（既定 `size=40`・`has=true`）。
- 結線先: Task 4 BoardCard が `<EyecatchThumb hue={cardHue(item.id)} has={cardHasEyecatch(item)} url={...} size={38} alt="" />`。

**設計判断（proto `ui.tsx` の EyecatchThumb 移植・研究所見 §2）:**
- 分岐は proto 準拠：`has && url` → 画像 / `!has` → 破線枠＋「無」プレースホルダ / `has && !url` → hue ベースのグラデーション div。
- **`has && url` の画像は `next/image` を使う**（プロジェクト規約・raw `<img>` 禁止）。サイズ固定のサムネなので `width={size} height={size}`＋`alt`（既定 `alt=""` 装飾）。外部URL 最適化不可な場合は `unoptimized` を付けてよい（microCMS 配信URL は最適化対象外になりうるため）。
- class prefix は `approve-`。`--p-*` トークンで配色。`"use client"` は不要（画像/静的 div のみ・状態やイベント無し）だが、`next/image` は Server Component でも使えるため付けない。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/eyecatchThumb.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EyecatchThumb } from "./eyecatchThumb";

describe("EyecatchThumb", () => {
  it("has && url は画像を出す(alt 反映)", () => {
    render(<EyecatchThumb hue={10} has url="https://example.com/i.png" alt="記事画像" />);
    expect(screen.getByRole("img", { name: "記事画像" })).toBeInTheDocument();
  });
  it("has=false はプレースホルダ(「無」)を出す", () => {
    render(<EyecatchThumb hue={10} has={false} />);
    expect(screen.getByText("無")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("has && url 無しは hue グラデーション(画像でもプレースホルダでもない)", () => {
    const { container } = render(<EyecatchThumb hue={200} has />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("無")).not.toBeInTheDocument();
    // hue がスタイルに反映される(実装で --p 由来 or hsl を使用)
    expect(container.firstChild).toBeTruthy();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/eyecatchThumb.test.tsx` → FAIL

- [ ] **Step 3: eyecatchThumb.tsx を移植**

`src/app/growth/approve-proto/ui.tsx` の `EyecatchThumb`（101行目〜）を `src/app/growth/approve/ui/eyecatchThumb.tsx` へ移植：
- 冒頭コメント「アイキャッチのサムネ。proto(#proto) からの本番移植。」。
- `interface EyecatchThumbProps { hue: number; size?: number; has?: boolean; url?: string; alt?: string }`＋関数宣言 `export function EyecatchThumb({ hue, size = 40, has = true, url, alt = "" }: EyecatchThumbProps)`。
- `has && url` 分岐の `<img>` を **`next/image` の `<Image src={url} alt={alt} width={size} height={size} unoptimized className="approve-eyecatch" />`** に置換（`import Image from "next/image";`）。
- `!has` プレースホルダ・`has && !url` グラデーションは proto 逐語（class の `proto-`→`approve-` rename・hue は `style={{ background: \`hsl(${hue} ...)\` }}` 等 proto の式を踏襲）。
- jsdom で `next/image` が扱えない場合は既存テスト基盤（他所の `next/image` 使用テスト）に倣う。到達不可分岐が出れば行内 istanbul ignore。

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/ui/eyecatchThumb.test.tsx` → PASS・`eyecatchThumb.tsx` 100%。branch 100% に届かない分岐（size 既定など）は実効テストを追加。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/ui/eyecatchThumb.tsx src/app/growth/approve/ui/eyecatchThumb.test.tsx
git commit -m "feat(growth): アイキャッチサムネ EyecatchThumb を proto から移植（next/image・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: BoardCard 再スキン（proto カード見た目）

**Files:**
- Modify: `src/app/growth/approve/BoardCard.tsx`
- Modify: `src/app/growth/approve/BoardCard.test.tsx`（見た目変更に伴う role/テキスト整合・**操作系アサートは維持**）

**Interfaces:**
- Consumes: `EyecatchThumb`（`./ui/eyecatchThumb`）・`StageChip`/`ScoreBar`/`AwaitingDot`/`MetaStat`（`./ui/primitives`）・`deriveBoardStage`（`./ui/boardStage`）・`cardExcerpt`/`cardHue`/`cardHasEyecatch`（`./boardCardView`）・`isActionable`（`./board`）。
- Produces: 見た目が proto カード化された `BoardCard`。**props シグネチャは現行維持**（`ApproveClient.tsx` の `renderItem` からの呼び出しを壊さない）。

**設計判断（研究所見 §1/§2）:**
- **props・分岐（決定済み/下書き完了/下流待ち/未決定・idea の進捗）・承認/却下/取消/編集の操作ロジックは現行維持**。置換するのは「見た目」のみ。
- カード行に proto 要素を配置：先頭に `<EyecatchThumb hue={cardHue(item.id)} has={cardHasEyecatch(item)} url={item.eyecatchUrl ?? undefined} size={38} alt="" />`（`item.eyecatchUrl` が型に無ければ渡さず `has` のみで分岐）、タイトル、`cardExcerpt(item)` の抜粋、`<StageChip stage={deriveBoardStage(item)} small />`、`isActionable(item, decided)` の時 `<AwaitingDot />`、`item.score` があれば `<ScoreBar score={item.score} />`、必要に応じ `<MetaStat>`（surface できる情報のみ・更新時刻等は出さない）。
- **生成中 pulse は現行 `motion-safe:animate-pulse` を廃し、`approve-pulse` クラス**（`.approve-shell` スコープ内の CSS・`StageChip` が使用中）へ統一。
- 独自インラインの旧バッジ/進捗バーのうち、proto プリミティブ（StageChip/ScoreBar/AwaitingDot）で置換できるものは置換。idea 種別の 5 段階ドット進捗は proto に無いため、StageChip＋ScoreBar 表現へ寄せる（現行の `STAGE_STEPS` ドット表示は撤去可・判断は実装時に proto Board.tsx のカード情報量と突合）。

- [ ] **Step 1: 既存 BoardCard.test.tsx を確認し、見た目変更で壊れる箇所を洗い出す**

Run: `npx vitest run src/app/growth/approve/BoardCard.test.tsx` → 現状の緑を確認（基準作り）。旧バッジ文言・独自進捗の DOM に依存するアサートが再スキンで壊れる想定。

- [ ] **Step 2: 失敗するテストへ更新（RED 駆動）**

`BoardCard.test.tsx` を新見た目へ更新（**操作系＝承認/却下/取消/編集の click→ハンドラ呼び出し・disabled 条件のアサートは維持**。見た目系のみ role/テキストを新構造へ）：
- `StageChip`（`deriveBoardStage` のラベル）・`ScoreBar`・`AwaitingDot`・`EyecatchThumb`・抜粋テキストの表示を検証。
- 生成中カードが `approve-pulse` を持つ（class 検証）ことを確認するテストを追加/更新。
- 例（要点・実装に合わせ調整可）:
```tsx
it("未決定カードは承認/却下ボタンを出し click でハンドラを呼ぶ", async () => {
  const onApprove = vi.fn();
  render(<BoardCard {...baseProps} onApprove={onApprove} />);
  await userEvent.click(screen.getByRole("button", { name: /承認/ }));
  expect(onApprove).toHaveBeenCalled();
});
it("ステージチップと抜粋を出す", () => {
  render(<BoardCard {...baseProps} />);
  expect(screen.getByText(/下書き|生成|構成|公開|施策/)).toBeInTheDocument(); // StageChip ラベル
});
```

Run: `npx vitest run src/app/growth/approve/BoardCard.test.tsx` → 更新分が FAIL（再スキン未実装）。

- [ ] **Step 3: BoardCard.tsx を再スキン**

上記「設計判断」に従い、`src/app/growth/approve-proto/Board.tsx` のカード行（研究所見 §2 の要素順：EyecatchThumb→タイトル→抜粋→StageChip→AwaitingDot→ScoreBar→…）を参考に、現行 BoardCard の**分岐・props・ハンドラを保ったまま**見た目のマークアップを proto へ置換。import を上記 Interfaces のとおり追加。`proto-`→`approve-` rename・`--p-*` 配色。`next/image`（EyecatchThumb 経由）。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/BoardCard.test.tsx` → PASS。`npx tsc --noEmit -p tsconfig.json` / `npx eslint src/app/growth/approve/BoardCard.tsx src/app/growth/approve/BoardCard.test.tsx` 緑。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/BoardCard.tsx src/app/growth/approve/BoardCard.test.tsx
git commit -m "feat(growth): ボードカードを proto デザインへ再スキン（EyecatchThumb/StageChip/ScoreBar/approve-pulse・操作ロジック不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: GateScreens 再スキン（skeleton / empty / error）＋ ApproveClient 結線

**Files:**
- Modify: `src/app/growth/approve/GateScreens.tsx`
- Modify: `src/app/growth/approve/GateScreens.test.tsx`（存在すれば・無ければ Create）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（分岐の描画差し替えのみ・条件は維持）
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（読込/空/エラー表示の検証を新構造へ・強度維持）

**Interfaces:**
- Produces（proto `StateScreens.tsx` 準拠・研究所見 §2）:
  - `SkeletonBoard()`（`approve-shimmer` のプレースホルダ骨格。旧 `LoadingGate` の中身を置換）
  - `EmptyState({ icon, title, sub, tone }: EmptyStateProps)` 共通部品 → `BoardEmpty()` / `ReviewDoneEmpty()` / `SearchEmpty({ query }: { query: string })`
  - `ErrorState({ onRetry }: { onRetry: () => void })`（旧 `LoadErrorGate` 相当）
  - 既存 `EmptyGate`（🎉＋`AddProposalForm` 埋め込み）は `BoardEmpty`/`ReviewDoneEmpty` の見た目へ寄せつつ **`AddProposalForm` 埋め込みは維持**（施策追加導線を壊さない）。
- 結線: `ApproveClient.tsx` の分岐（研究所見 §1: L517 `busy`→`SkeletonBoard` / L521 `loadError`→`ErrorState` / L540 `items.length===0`→`BoardEmpty`（＋AddProposalForm）/ 検索絞り込み 0 件→`SearchEmpty`）。**分岐条件は維持し描画中身のみ差し替え**。

**設計判断:** proto の shimmer は `.proto-shimmer`→`approve-shimmer`（`.approve-shell` スコープ CSS・P0 で移植済みか要確認。無ければ本 Task で `approveTheme.css` に `@keyframes approve-shimmer` を追加＝CSS は非計測）。`SkeletonDetail` は P3 スコープのため本 Task では移植しない。

- [ ] **Step 1: 失敗するテストを書く（GateScreens.test.tsx）**
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardEmpty, ErrorState, ReviewDoneEmpty, SearchEmpty, SkeletonBoard } from "./GateScreens";

describe("GateScreens(P2 再スキン)", () => {
  it("SkeletonBoard は骨格プレースホルダを描画する", () => {
    const { container } = render(<SkeletonBoard />);
    expect(container.querySelector(".approve-shimmer")).toBeInTheDocument();
  });
  it("BoardEmpty は空メッセージを出す", () => {
    render(<BoardEmpty />);
    expect(screen.getByText(/ありません|まだ|空/)).toBeInTheDocument();
  });
  it("ReviewDoneEmpty は達成メッセージを出す", () => {
    render(<ReviewDoneEmpty />);
    expect(screen.getByText(/完了|お疲れ|ありません/)).toBeInTheDocument();
  });
  it("SearchEmpty は query を反映する", () => {
    render(<SearchEmpty query="ピックル" />);
    expect(screen.getByText(/ピックル/)).toBeInTheDocument();
  });
  it("ErrorState は再試行ボタンで onRetry を呼ぶ", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /再試行|再読み込み/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/GateScreens.test.tsx` → FAIL

- [ ] **Step 3: GateScreens.tsx を再スキン**

`src/app/growth/approve-proto/StateScreens.tsx` を移植（`proto-`→`approve-` rename・アイコンは `./ui/icons`・`"use client"` は AddProposalForm/onRetry を含むため付与）。`SkeletonBoard`/`EmptyState`＋3 派生/`ErrorState` を追加。既存 `LoadingGate`/`LoadErrorGate`/`EmptyGate` は新部品を使う形へ再構成（後方互換の呼び出し名が要る場合は薄いエイリアスで温存）。`approve-shimmer` の keyframe が未定義なら `theme/approveTheme.css` に追加。

- [ ] **Step 4: ApproveClient.tsx を結線**

研究所見 §1 の分岐（L517/L521/L540）の**描画中身のみ**を新部品へ差し替え：読込→`<SkeletonBoard />`、エラー→`<ErrorState onRetry={...} />`、items 0→`<BoardEmpty />`＋既存 `AddProposalForm`、approve view の絞り込み 0 件→`<SearchEmpty query={query} />`。**条件式・データ取得・ハンドラは変えない**。

- [ ] **Step 5: ApproveClient.test.tsx の読込/空/エラー検証を新構造へ更新**

該当テスト（読込中・空・ロードエラー）の role/テキストを新部品へ合わせる。**API 呼び出し回数・再試行フロー・AddProposalForm 導線のアサートは維持**（強度を落とさない）。

- [ ] **Step 6: 型・lint・テスト緑を確認** — Run: `npx tsc --noEmit -p tsconfig.json` / `npx eslint src/app/growth/approve/` / `npx vitest run src/app/growth/approve/GateScreens.test.tsx src/app/growth/approve/ApproveClient.test.tsx` すべて緑。

- [ ] **Step 7: Commit**
```bash
git add src/app/growth/approve/GateScreens.tsx src/app/growth/approve/GateScreens.test.tsx src/app/growth/approve/ApproveClient.tsx src/app/growth/approve/ApproveClient.test.tsx src/app/growth/approve/theme/approveTheme.css
git commit -m "feat(growth): 読込/空/エラー画面を proto StateScreens へ再スキンし ApproveClient へ結線（skeleton/empty/error・強度維持）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: 全体ゲート＋フェーズ検証（確認観点提示）

**Files:** なし（コードは Task 1〜5 で完了。本タスクは検証と確認観点提示のみ）。

- [ ] **Step 1: 全体ゲート確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint .`（0 errors）/ `npx vitest run --coverage`（全 PASS・グローバル 100%）。確認：
- 新規 `deriveBoardStage`/`boardCardView.ts`/`ui/eyecatchThumb.tsx` と再スキン `BoardCard.tsx`/`GateScreens.tsx` がすべて 100% で計測対象（**exclude に足さない**）。
- `vitest.config.ts` の `coverage.exclude` 未変更。
- `git status` で未 push・`next-env.d.ts`/`node_modules` 非ステージ。

- [ ] **Step 2: 動作確認観点をユーザーへ提示（ブラウザ確認はユーザー実施・日本語）**
1. `/growth/approve` の記事カードが proto デザイン（アイキャッチサムネ・StageChip・ScoreBar・あなた待ちドット・抜粋）になる。**盤のレイアウト（列）は従来どおり**。
2. 生成中カードの脈動が `approve-pulse`（CSS）で表示される。
3. 読み込み中はスケルトン（shimmer）、空はイラスト付き空状態、検索 0 件は SearchEmpty、ロードエラーは再試行付き ErrorState が出る。
4. 承認/却下/取消/編集などの**操作は従来どおり動く**（見た目のみ変更）。
5. 詳細パネル/2ペイン/単一リスト化・アクティブ行レールは**まだ**（P3 で対応＝過渡状態）。
6. `prefers-reduced-motion` で pulse/shimmer が抑制される。

> ユーザーのブラウザ確認完了まで push しない。確認で修正が出たら該当タスクへ戻る。

---

## Self-Review

- **Spec coverage**:
  - AD4（ステージ写像）= Task 1 `deriveBoardStage`（proto BoardStage への写像・100%）。
  - AD5（縮約）= Task 1 で `scheduled` 縮約を設計書へ追記。`idea` は proposal 用・記事盤では未使用と明記。更新時刻等 surface 不能属性は Task 2/4 で縮約。
  - AD3（純ロジック分離 100%・presentation も除外せず 100%）= Task 1/2 純ロジック・Task 3/4/5 presentation を RTL で 100%。
  - §3 disposition「ボード＝再スキン」= Task 4（BoardCard）/Task 5（GateScreens=StateScreens）。EyecatchThumb 新規移植 = Task 3。
  - §4 P2「Board（StageChip/ScoreBar/EyecatchThumb・生成中 pulse）と空/スケルトン（StateScreens）を実データのまま proto 見た目へ」= Task 3/4/5。**layoutId 共有アニメ・単一リストは確定判断で P3 送り**（本計画スコープ外）。
- **Placeholder scan**: 純ロジック（deriveBoardStage/boardCardView）は実装全文を inline。EyecatchThumb/BoardCard/GateScreens は移植元パス＋具体的 rename/import＋テストコードで曖昧さなし（proto の実マークアップは実装者が移植元を読んで near-verbatim 移植）。
- **Type consistency**: `deriveBoardStage(item): BoardStage`（`ui/boardStage.ts`）→ Task 4 で `StageChip(deriveBoardStage(item))`。`cardExcerpt/cardHue/cardHasEyecatch`（`boardCardView.ts`）→ Task 4 で使用。`EyecatchThumbProps`（Task 3）→ Task 4 の呼び出しと一致。`PendingItem`/`isActionable` の参照元一致。
- **確定判断の明記**: レイアウト現行維持（layoutId/単一リスト/2ペインは P3）・scheduled 縮約・idea は proposal 用・pulse は approve-pulse 統一・EyecatchThumb は next/image で新規ファイル・カバレッジ除外追加なし。
