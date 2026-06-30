# 承認画面 proto 移植 P0: デザインシステム基盤 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** proto のダークテーマ・アイコン・UIプリミティブを本番承認画面へ「休眠状態」で移植する基盤を作る（`.approve-shell` を適用するまでライブ画面の見た目は不変）。

**Architecture:** `proto.css` を `.approve-shell` スコープの本番テーマCSSへ移植（`--p-*` トークン名は維持・class prefix は `proto-`→`approve-`）。proto の `icons.tsx`/`ui.tsx`/`stages.ts` を本番 `src/app/growth/approve/ui/` へ移植し、純ロジック（しきい値・幾何・ステージメタ）を分離して 100% テスト。プリミティブは inline style の `var(--p-*)` 文字列で検証。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4 / Framer Motion / Vitest + RTL / istanbul。

## Global Constraints
- 設計書: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD1〜AD5）。
- カバレッジ 100%（istanbul・閾値変更禁止）。純ロジックは除外せずテスト。CSS は非計測（既存 `growth.css` と同様）。
- TS strict / `any` 禁止 / `React.FC` 禁止（関数宣言＋`XxxProps`）/ `import type` / boolean prop は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止。
- `"use client"` は対話/ブラウザAPIが要る時のみ。`--p-*` トークン名は維持。class prefix は `approve-`。
- **P0 はライブ画面の見た目を変えない**（`.approve-shell` を DOM に付けない・CSS は休眠）。
- 出力・コミットは日本語。push 禁止（ローカルコミットのみ）。`next-env.d.ts`/`node_modules` ステージ禁止。
- 各タスク末に `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run` 緑を確認（最終タスクで `--coverage` 100%）。

---

### Task 1: テーマCSS移植（approveTheme.css・休眠）

**Files:**
- Create: `src/app/growth/approve/theme/approveTheme.css`
- Modify: `src/app/growth/approve/page.tsx`（先頭に CSS import を1行追加）

**Interfaces:**
- Produces: `.approve-shell` スコープの `--p-*` トークン・演出クラス（`approve-pulse`/`approve-shimmer`/`approve-spin`/`approve-indeterminate`/`approve-changed`）・ボタン触感（`approve-btn-primary`/`approve-btn-ghost`/`approve-tool`/`approve-editable`）・記事タイポ（`approve-article`）・細スクロールバー・focus-visible。後続フェーズが参照。

- [ ] **Step 1: approveTheme.css を作成**

`src/app/growth/approve-proto/proto.css` の内容を移植し、以下を機械的に置換:
- ルートセレクタ `.proto-root` → `.approve-shell`
- クラス prefix `proto-` → `approve-`（`.proto-pulse`→`.approve-pulse`、`.proto-article`→`.approve-article`、`.proto-btn-primary`→`.approve-btn-primary`、`.proto-tool`→`.approve-tool`、`.proto-editable`→`.approve-editable`、`.proto-changed`→`.approve-changed`、`.proto-row`→`.approve-row`、`.proto-shimmer`→`.approve-shimmer`、`.proto-spin`→`.approve-spin`、`.proto-indeterminate`→`.approve-indeterminate`）
- `@keyframes proto-*` → `@keyframes approve-*`（参照箇所も合わせる）
- `--p-*` トークン名は**変更しない**。
- 冒頭コメントを「承認画面ダークテーマ。`.approve-shell` 配下にスコープ。proto.css(#proto) からの本番移植。」に更新。

- [ ] **Step 2: page.tsx で CSS を import（休眠）**

`src/app/growth/approve/page.tsx` の先頭（既存 import より前）に追加:
```tsx
import "./theme/approveTheme.css";
```
`.approve-shell` を持つ要素はまだ無いため、トークン定義・スコープ済みルールは適用されず**ライブ画面の見た目は不変**（演出クラス・記事タイポも使用箇所ゼロ）。

- [ ] **Step 3: 既存テスト・型・lint が緑のままを確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）
Run: `npx eslint .`（0 errors）
Run: `npx vitest run`（全 PASS・件数不変）
Expected: すべて緑。CSS は非計測のためカバレッジ影響なし。

- [ ] **Step 4: Commit**
```bash
git add src/app/growth/approve/theme/approveTheme.css src/app/growth/approve/page.tsx
git commit -m "feat(growth): 承認画面ダークテーマCSSを休眠移植（.approve-shell スコープ）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: アイコン移植（icons.tsx）

**Files:**
- Create: `src/app/growth/approve/ui/icons.tsx`
- Test: `src/app/growth/approve/ui/icons.test.tsx`

**Interfaces:**
- Produces: 33 個の名前付きアイコン export（`IconCheck`/`IconCheckCircle`/`IconX`/`IconEdit`/`IconSparkles`/`IconCalendar`/`IconClock`/`IconSearch`/`IconCommand`/`IconArrowRight`/`IconChevronRight`/`IconArrowLeft`/`IconChevronDown`/`IconBolt`/`IconFileText`/`IconImage`/`IconLayout`/`IconWand`/`IconChart`/`IconArrowUp`/`IconArrowDown`/`IconDot`/`IconKeyboard`/`IconList`/`IconInbox`/`IconDeviceMobile`/`IconDeviceTablet`/`IconDeviceDesktop`/`IconExternalLink`/`IconUpload`/`IconRefresh`/`IconPlus`/`IconMessage`）。各 `(props: IconProps) => JSX`、`IconProps extends SVGProps<SVGSVGElement> { size?: number }`、`size` 既定 16・24x24・stroke 1.6・currentColor。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/icons.test.tsx`:
```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as Icons from "./icons";

const ALL = Object.entries(Icons).filter(([name]) => name.startsWith("Icon"));

describe("approve icons", () => {
  it("全アイコンが svg を描画し size を反映する", () => {
    expect(ALL.length).toBe(33);
    for (const [name, Icon] of ALL) {
      const { container, unmount } = render(<Icon size={20} aria-label={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg?.getAttribute("width")).toBe("20");
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      unmount();
    }
  });

  it("size 省略時は 16", () => {
    const { container } = render(<Icons.IconCheck />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/icons.test.tsx` → FAIL（モジュール未作成）

- [ ] **Step 3: icons.tsx を移植**

`src/app/growth/approve-proto/icons.tsx` を `src/app/growth/approve/ui/icons.tsx` へ**逐語移植**（`Base` 内部コンポーネント＋33 export）。冒頭コメントを「承認画面用の軽量アイコン。proto(#proto) からの本番移植。」に更新。ロジック変更なし。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ui/icons.test.tsx` → PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/ui/icons.tsx src/app/growth/approve/ui/icons.test.tsx
git commit -m "feat(growth): 承認画面アイコン群を proto から移植（33個・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: ステージメタ純ロジック（boardStage.ts）

**Files:**
- Create: `src/app/growth/approve/ui/boardStage.ts`
- Test: `src/app/growth/approve/ui/boardStage.test.ts`

**Interfaces:**
- Produces: `type BoardStage` / `type StageTone` / `interface StageMeta` / `STAGE_META: Record<BoardStage, StageMeta>` / `STAGE_ORDER: BoardStage[]` / `toneVar(tone)` / `toneWeakVar(tone)`。P2 の `deriveBoardStage(item)` と StageChip が参照。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/boardStage.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { STAGE_META, STAGE_ORDER, toneVar, toneWeakVar } from "./boardStage";

describe("boardStage", () => {
  it("6 ステージの label/tone/order を持つ", () => {
    expect(Object.keys(STAGE_META)).toHaveLength(6);
    expect(STAGE_META.outline_review).toEqual({ label: "構成案レビュー", tone: "amber", order: 0 });
    expect(STAGE_META.published).toEqual({ label: "公開済み", tone: "green", order: 5 });
  });

  it("STAGE_ORDER は order 昇順", () => {
    expect(STAGE_ORDER).toEqual([
      "outline_review",
      "draft_review",
      "generating",
      "scheduled",
      "idea",
      "published",
    ]);
  });

  it("toneVar は gray を text-3 に写像、他は同名トークン", () => {
    expect(toneVar("gray")).toBe("var(--p-text-3)");
    expect(toneVar("accent")).toBe("var(--p-accent)");
  });

  it("toneWeakVar は gray を白6%、他は -weak トークン", () => {
    expect(toneWeakVar("gray")).toBe("rgba(255,255,255,0.06)");
    expect(toneWeakVar("amber")).toBe("var(--p-amber-weak)");
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/boardStage.test.ts` → FAIL

- [ ] **Step 3: boardStage.ts を実装**
```ts
/**
 * 盤の表示ステージ(proto 由来の語彙)とメタ情報。
 * 本番 PendingItem からの導出 deriveBoardStage は P2 で追加する。
 */

export type BoardStage =
  | "outline_review"
  | "draft_review"
  | "generating"
  | "scheduled"
  | "idea"
  | "published";

export type StageTone = "amber" | "accent" | "purple" | "teal" | "gray" | "green";

export interface StageMeta {
  label: string;
  tone: StageTone;
  order: number;
}

export const STAGE_META: Record<BoardStage, StageMeta> = {
  outline_review: { label: "構成案レビュー", tone: "amber", order: 0 },
  draft_review: { label: "下書きレビュー", tone: "accent", order: 1 },
  generating: { label: "生成中", tone: "purple", order: 2 },
  scheduled: { label: "公開予約", tone: "teal", order: 3 },
  idea: { label: "ネタ案", tone: "gray", order: 4 },
  published: { label: "公開済み", tone: "green", order: 5 },
};

export const STAGE_ORDER: BoardStage[] = (Object.keys(STAGE_META) as BoardStage[]).sort(
  (a, b) => STAGE_META[a].order - STAGE_META[b].order,
);

export function toneVar(tone: StageTone): string {
  return `var(--p-${tone === "gray" ? "text-3" : tone})`;
}

export function toneWeakVar(tone: StageTone): string {
  if (tone === "gray") return "rgba(255,255,255,0.06)";
  return `var(--p-${tone}-weak)`;
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ui/boardStage.test.ts` → PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/ui/boardStage.ts src/app/growth/approve/ui/boardStage.test.ts
git commit -m "feat(growth): 盤ステージメタ純ロジック boardStage を追加（100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: 表示スケール純ロジック（scales.ts）

**Files:**
- Create: `src/app/growth/approve/ui/scales.ts`
- Test: `src/app/growth/approve/ui/scales.test.ts`

**Interfaces:**
- Produces: `scoreBarTone(score)` / `ringTone(value)` / `ringGeometry(value,size): {r,circumference,dashOffset}` / `sparkColor(up)` / `sparklineGeometry(data,width,height): {line,area,last:{x,y}} | null`。プリミティブ ScoreBar/RingScore/Sparkline が参照。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/scales.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { ringGeometry, ringTone, scoreBarTone, sparkColor, sparklineGeometry } from "./scales";

describe("scales", () => {
  it("scoreBarTone: 85+ green / 70+ accent / 未満 text-3", () => {
    expect(scoreBarTone(85)).toBe("var(--p-green)");
    expect(scoreBarTone(70)).toBe("var(--p-accent)");
    expect(scoreBarTone(69)).toBe("var(--p-text-3)");
  });

  it("ringTone: 85+ green / 70+ accent / 未満 amber", () => {
    expect(ringTone(90)).toBe("var(--p-green)");
    expect(ringTone(70)).toBe("var(--p-accent)");
    expect(ringTone(50)).toBe("var(--p-amber)");
  });

  it("ringGeometry: 半径=(size-8)/2・周長=2πr・dashOffset=周長*(1-value/100)", () => {
    const g = ringGeometry(100, 56);
    expect(g.r).toBe(24);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 24);
    expect(g.dashOffset).toBeCloseTo(0);
    expect(ringGeometry(0, 56).dashOffset).toBeCloseTo(2 * Math.PI * 24);
  });

  it("sparkColor: up=green / down=red", () => {
    expect(sparkColor(true)).toBe("var(--p-green)");
    expect(sparkColor(false)).toBe("var(--p-red)");
  });

  it("sparklineGeometry: 2点未満は null", () => {
    expect(sparklineGeometry([1], 124, 34)).toBeNull();
  });

  it("sparklineGeometry: 2点以上で line/area/last を返す", () => {
    const g = sparklineGeometry([0, 10], 124, 34);
    expect(g).not.toBeNull();
    expect(g?.line.startsWith("M")).toBe(true);
    expect(g?.area.endsWith("Z")).toBe(true);
    expect(typeof g?.last.x).toBe("number");
  });

  it("sparklineGeometry: 全点同値でも span>=1 で破綻しない", () => {
    const g = sparklineGeometry([5, 5, 5], 124, 34);
    expect(g).not.toBeNull();
    expect(Number.isFinite(g?.last.y)).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/scales.test.ts` → FAIL

- [ ] **Step 3: scales.ts を実装**
```ts
/**
 * 承認画面の表示スケール純ロジック(色しきい値・円弧/折れ線の幾何)。
 * proto ui.tsx(#proto) の ScoreBar/RingScore/Sparkline から分離。
 */

/** 優先度スコアバーの色トークン(0-100)。85+ green / 70+ accent / 未満 text-3。 */
export function scoreBarTone(score: number): string {
  return score >= 85 ? "var(--p-green)" : score >= 70 ? "var(--p-accent)" : "var(--p-text-3)";
}

/** 円形スコアの色トークン(0-100)。85+ green / 70+ accent / 未満 amber。 */
export function ringTone(value: number): string {
  return value >= 85 ? "var(--p-green)" : value >= 70 ? "var(--p-accent)" : "var(--p-amber)";
}

export interface RingGeometry {
  r: number;
  circumference: number;
  dashOffset: number;
}

/** 円形スコアの幾何。半径=(size-8)/2・周長=2πr・dashOffset=周長*(1-value/100)。 */
export function ringGeometry(value: number, size: number): RingGeometry {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  return { r, circumference, dashOffset: circumference * (1 - value / 100) };
}

/** スパークラインの色トークン。 */
export function sparkColor(up: boolean): string {
  return up ? "var(--p-green)" : "var(--p-red)";
}

export interface SparklineGeometry {
  line: string;
  area: string;
  last: { x: number; y: number };
}

/** スパークラインの SVG パス幾何。点が2未満なら null。span は最低1で 0 除算回避。 */
export function sparklineGeometry(
  data: readonly number[],
  width: number,
  height: number,
): SparklineGeometry | null {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pad = 3;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i): [number, number] => [
    pad + i * stepX,
    pad + (height - pad * 2) * (1 - (v - min) / span),
  ]);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const lastPt = pts[pts.length - 1];
  const area = `${line} L${lastPt[0].toFixed(1)} ${height - pad} L${pts[0][0].toFixed(1)} ${height - pad} Z`;
  return { line, area, last: { x: lastPt[0], y: lastPt[1] } };
}
```

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ui/scales.test.ts` → PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/ui/scales.ts src/app/growth/approve/ui/scales.test.ts
git commit -m "feat(growth): 表示スケール純ロジック scales を追加（色しきい値/幾何・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: UIプリミティブ（primitives.tsx）

**Files:**
- Create: `src/app/growth/approve/ui/primitives.tsx`
- Test: `src/app/growth/approve/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: `boardStage.ts`（`BoardStage`/`STAGE_META`/`toneVar`/`toneWeakVar`）・`scales.ts`（`scoreBarTone`/`ringTone`/`ringGeometry`/`sparkColor`/`sparklineGeometry`）。
- Produces: `Kbd` / `StageChip({stage:BoardStage, small?})` / `ScoreBar({score})` / `AwaitingDot` / `RingScore({value, size?})` / `Sparkline({data, up, width?, height?})` / `MetaStat({icon, children, title?})`。EyecatchThumb は P2（画像処理判断のため本タスク対象外）。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve/ui/primitives.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AwaitingDot, Kbd, MetaStat, RingScore, ScoreBar, Sparkline, StageChip } from "./primitives";

describe("primitives", () => {
  it("Kbd は children を描画", () => {
    render(<Kbd>esc</Kbd>);
    expect(screen.getByText("esc")).toBeInTheDocument();
  });

  it("StageChip は label を出し、generating はパルスドット", () => {
    const { rerender, container } = render(<StageChip stage="published" />);
    expect(screen.getByText("公開済み")).toBeInTheDocument();
    rerender(<StageChip stage="generating" />);
    expect(container.querySelector(".approve-pulse")).not.toBeNull();
  });

  it("ScoreBar は score に応じた色トークンを style に反映", () => {
    const { container, rerender } = render(<ScoreBar score={90} />);
    expect(container.innerHTML).toContain("var(--p-green)");
    rerender(<ScoreBar score={50} />);
    expect(container.innerHTML).toContain("var(--p-text-3)");
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("AwaitingDot は説明 title を持つ", () => {
    render(<AwaitingDot />);
    expect(screen.getByTitle("あなたのアクション待ち")).toBeInTheDocument();
  });

  it("RingScore は値を表示し色トークンを反映", () => {
    const { container } = render(<RingScore value={90} />);
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(container.innerHTML).toContain("var(--p-green)");
  });

  it("Sparkline は 2点以上で path を描画、2点未満は空", () => {
    const { container, rerender } = render(<Sparkline data={[1, 2, 3]} up />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain("var(--p-green)");
    rerender(<Sparkline data={[1]} up={false} />);
    expect(container.querySelectorAll("path").length).toBe(0);
  });

  it("MetaStat は icon と値を並べる", () => {
    render(<MetaStat icon={<span data-testid="ic" />} title="views">1,234</MetaStat>);
    expect(screen.getByTestId("ic")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/ui/primitives.test.tsx` → FAIL

- [ ] **Step 3: primitives.tsx を実装**

`src/app/growth/approve-proto/ui.tsx` から **EyecatchThumb を除く7プリミティブ**を移植し、以下を適用:
- 先頭 `"use client";`、冒頭コメントを「承認画面共通の小さなUI部品。proto(#proto) からの本番移植。」に更新。
- import を本番モジュールへ: `import { STAGE_META, toneVar, toneWeakVar } from "./boardStage"; import type { BoardStage } from "./boardStage"; import { ringGeometry, ringTone, scoreBarTone, sparkColor, sparklineGeometry } from "./scales";`
- `StageChip` の prop 型を `stage: BoardStage`、`generating` のドットに付与するクラスを `"approve-pulse"`（proto の `"proto-pulse"` から rename）。
- `ScoreBar` のしきい値分岐は `scoreBarTone(score)` を呼ぶ形に置換（インライン三項を削除）。
- `RingScore` は `ringTone(value)` と `ringGeometry(value, size)` を使い、`r`/`strokeDasharray`/`strokeDashoffset` をそこから取得。
- `Sparkline` は `sparklineGeometry(data, width, height)` を使い、`null` のとき `<div style={{ width, height }} />` を返す。色は `sparkColor(up)`。`<path d={geo.area} .../>`・`<path d={geo.line} .../>`・`<circle cx={geo.last.x} cy={geo.last.y} .../>`。
- `Kbd`/`AwaitingDot`/`MetaStat` は inline style（`var(--p-*)`）含め逐語移植。
- `React.FC` 不使用・各 props に名前付き型（インライン型でも可だが `any` 禁止）。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ui/primitives.test.tsx` → PASS

- [ ] **Step 5: 全体ゲート確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）
Run: `npx eslint .`（0 errors）
Run: `npx vitest run --coverage`（全 PASS・グローバル statements/branches/functions/lines すべて 100%。新規 `ui/icons.tsx`/`boardStage.ts`/`scales.ts`/`primitives.tsx` が 100% で計測対象に入っていること。`approveTheme.css` は非計測）
Expected: すべて緑・100%維持。

- [ ] **Step 6: Commit**
```bash
git add src/app/growth/approve/ui/primitives.tsx src/app/growth/approve/ui/primitives.test.tsx
git commit -m "feat(growth): 承認画面UIプリミティブを proto から移植（7部品・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

## Self-Review

- **Spec coverage**: AD1（テーマCSS移植）=Task1 / AD3（純ロジック100%・presentation方針）=Task3,4 純ロジック分離＋Task2,5 テスト / proto デザインシステム（icons/ui/演出）=Task1,2,5。P0 範囲（基盤・休眠）を満たす。`.approve-shell` 適用と実データ結線は P1+。
- **Placeholder scan**: 全 step に実コード/実コマンド/期待結果あり。移植タスクは移植元パス＋具体的な置換指示で曖昧さなし。
- **Type consistency**: `BoardStage`/`StageTone`/`STAGE_META`/`toneVar`/`toneWeakVar`（Task3）→ Task5 primitives で一致使用。`scoreBarTone`/`ringTone`/`ringGeometry`/`sparkColor`/`sparklineGeometry`（Task4）→ Task5 で一致使用。`IconProps`（Task2）整合。
- **カバレッジ留意**: icons/boardStage/scales/primitives は全分岐をテストで到達（exclude しない）。CSS のみ非計測。EyecatchThumb を P2 へ送り P0 から外したのは画像処理（next/image 設定）判断を P2 に集約するため（YAGNI）。
