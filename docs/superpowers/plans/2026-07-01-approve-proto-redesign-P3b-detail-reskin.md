# 承認画面 proto 移植 P3b: 詳細パネル中身の再スキン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。Steps は checkbox (`- [ ]`) 構文。

**Goal:** approve view 右ペインの**詳細の中身**を proto デザインへ再スキンする。P3a で 2ペイン骨格・右ペイン配置・`activeId` 化・`scheduled` un-縮約は完了済み。本フェーズは右ペインに描画される詳細本体を、proto の `DetailPanel`（2段タブ）＋ `DetailViews`（プレビュー/プロンプト/画像）＋ `OutlineView`（構成案・行コメント＋画像指示）＋ `QualityChecklist`（品質サマリー）＋ `DevicePreview`（3端末）＋ 再スキンした本文行コメント（`InlineCommentReview`）へ置換する。**データ・通信・操作ロジックは既存フック/API のまま**（見た目・レイアウト・タブ構造のみ proto へ）。現行 `DetailPanel`/`DetailPanelView`/`DetailHeader`/`DraftChecklist`/`DraftPreviewPane`（＋不要になった旧 preview 部品）を撤去する。

**Architecture:**
- 新 proto `DetailPanel`（2段タブ・`layoutId="approve-tab-underline"`・ヘッダ StageChip/MetaStat・footer QualityChecklist＋主操作）を本番へ移植し、現行 `DetailPanel`/`DetailPanelView`/`DetailHeader` を置換。データは既存フック（`useDraftPreview`/`useReviseEditing`/`useDraftEditing`/`useConsult`/`useBodyCommentConsult`）と承認/却下ハンドラへ結線する。
- タブ本体は proto の `outline`/`prompt`/`preview`/`images` 4 リーフを 3 クラスタ（構成案 / プレビュー / 素材=画像+プロンプト）に束ねる。
- editing 分岐は現行の全画面 TipTap ワークスペース（`.approve-shell` 外 overlay・`renderEditWorkspace`）を維持（DetailPanel 内には差し込まない）。
- 本文への行コメント（proto CommentableBody 相当）は本番 `InlineCommentReview`（実 API・`useBodyCommentConsult`）を proto 見た目へ**再スキン**して維持（proto `InlineEditor` の execCommand は移植しない）。
- 新規純ロジックは `.ts` に分離し 100% テスト：本番 `draftQuality.ts` に `countByLevel`、`src/lib/growth/imageIntent.ts`（＋型 `src/app/growth/approve/imageIntentTypes.ts`）。
- **画像指示 persist は当面セッション state に縮約**（AD5-2）。`generating` 進捗% は当面 `approve-shimmer` 不定＋既存 `generating.ts` の段階ラベルへ縮約（AD5-4）。`DevicePreview` は本番プレビュー frame（`DraftPreviewFrame`・postMessage で本文HTML注入）＋端末別固定スケールへ縮約（postMessage 高さ受信なし・AD5-5）。
- proto presentation 5 ファイル（移植後の `DetailPanel.tsx`・新 `DetailViews.tsx`・`OutlineView.tsx`・`QualityChecklist.tsx`・`DevicePreview.tsx`）を `vitest.config.ts` の `coverage.exclude` へ既存様式で追記。旧 `DetailPanelView.tsx`/`DetailHeader.tsx`/`DraftChecklist.tsx`/`DraftPreviewPane.tsx` を撤去し被覆構造を付け替える。純ロジック（countByLevel/imageIntent/excerptDraft/draftQuality/bodyComment）と状態オーケストレーションのグルーフック（useConsult 型）は**除外せず 100%**。

**Tech Stack:** Next.js 16 / React 19 / TS strict / Tailwind v4 / Framer Motion（`__mocks__/framer-motion.tsx` モック）/ Vitest + RTL / istanbul。

## Global Constraints
- 設計書: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（§2 AD1〜AD5・§4 P3・§5）。research: `.superpowers/sdd/p3-research.md`（§2 proto DetailPanel/DetailViews/OutlineView/QualityChecklist/DevicePreview/CommentableBody・§4 土台・§5 純ロジック表・§6 hooks・§7 AD5・§8 カバレッジ）。P3a 計画 `...-P3a-two-pane.md` が直前の文脈。
- カバレッジ 100%（istanbul・閾値変更禁止）。**純ロジック（`countByLevel`・`imageIntent`）と状態オーケストレーションのグルーフックは除外せず 100%**（計測逃れ禁止・差分B useConsult の教訓）。proto presentation 5 ファイル（DetailPanel/DetailViews/OutlineView/QualityChecklist/DevicePreview）は「DOM/framer 直結。純ロジックは××でテスト済」として `coverage.exclude` へ追記。`DevicePreview` の ResizeObserver/postMessage で jsdom 到達不可な行は exclude 済み（presentation として除外）。
- TS strict / `any` 禁止 / `React.FC` 禁止（関数宣言＋`XxxProps`）/ `import type` / boolean prop は is/has/should/can / handler は on/handle / `@ts-ignore` 禁止（最終手段は `@ts-expect-error`＋理由）。
- `"use client"` は対話/ブラウザAPI/framer-motion が要る時のみ。`next/image`（`EyecatchThumb` 経由）。`--p-*` トークン名は維持・class prefix は `approve-`（proto の `proto-*` は `approve-*` へ rename）。
- a11y：2段タブは `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`＋`tabpanel`（`aria-labelledby`）。画像トグルは `radiogroup`/`radio`。行コメントはボタン到達・alt・`prefers-reduced-motion`（CSS ＋ 既存 `<MotionConfig reducedMotion="user">`）。
- 出力・コミットは日本語。**push 禁止**（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。`next-env.d.ts`/`node_modules` ステージ禁止。
- 各タスク末に `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run`（最終タスクで `--coverage` 100%）。コミットメッセージ末尾に必ず `Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com`。
- **大タスクの中間状態**（Task 8 の DetailPanel 束ね＋ApproveClient 結線＋テスト移設）は P1 Task6/7・P3a Task4/5 の運用に倣い、骨格差し替え時点で `tsc`/`eslint`/移設対象外テスト緑・移設対象テストは一時赤を許容し、次タスクで全緑＋100% に到達させる。

## タスク一覧（見出し）
1. Task 1: 品質チェックのレベル別集計 純ロジック（draftQuality.ts に countByLevel 追加）
2. Task 2: 画像指示 純ロジック（imageIntentTypes.ts ＋ src/lib/growth/imageIntent.ts 移植・100%）
3. Task 3: QualityChecklist 移植（block/warn/ok サマリー＋展開）
4. Task 4: DevicePreview 移植（mobile/tablet/pc・本番プレビュー frame・固定スケール）
5. Task 5: DetailViews 移植（PromptView/PreviewView/ImagesView/MetaEditor）
6. Task 6: OutlineView 移植（仮説＋行コメント帯＋画像指示レーン・画像は session state 縮約）
7. Task 7: 本文行コメント再スキン（InlineCommentReview を proto CommentableBody 見た目へ）
8. Task 8: DetailPanel 束ね（2段タブ）＋ApproveClient 結線差し替え（テスト移設は次タスク）
9. Task 9: 旧サーフェス撤去・テスト移設・coverage.exclude 再整理・全体ゲート
10. Task 10: フェーズ検証（動作確認観点の提示）

---

### Task 1: 品質チェックのレベル別集計 純ロジック（draftQuality.ts に countByLevel 追加）

**Files:**
- Modify: `src/app/growth/approve/draftQuality.ts`
- Modify: `src/app/growth/approve/draftQuality.test.ts`

**Interfaces:**
- Produces: `countByLevel(checks: readonly QualityCheck[]): Record<CheckLevel, number>`（本番 `CheckLevel="ok"|"warn"|"block"`・本番 `QualityCheck`）。
- 結線先: Task 3 の `QualityChecklist` が block/warn/ok の件数ピルに使う。Task 8 の `DetailPanel` footer が `countByLevel(checks).block > 0` で承認ボタンの `hasBlock` を判定する（現行 `hasBlockingCheck` と同義だが、proto QualityChecklist は 3 レベルの件数を必要とするため件数写像を新設）。

**設計判断（AD3・research §5）:** proto `draftQuality.ts` の `countByLevel`（`{block,warn,ok}`）は proto `QualityLevel`（block|warn|ok）が入力。本番 `draftQuality.ts` は既に 100% テスト済で実装豊富（§5 免責/§13 断定/#H19 壊れリンク）。proto の簡易版は捨て、本番 `draftQuality.ts` に `countByLevel` を追加し `QualityChecklist`/`DetailPanel` の入力源にする。既存 `hasBlockingCheck` は残す（他所参照維持・`countByLevel(checks).block > 0` と等価）。

- [ ] **Step 1: 失敗するテストを書く**

`draftQuality.test.ts` の末尾に追記（既存 describe 群はそのまま）:
```ts
import { countByLevel } from "./draftQuality";
import type { QualityCheck } from "./draftQuality";

describe("countByLevel", () => {
  const checks: QualityCheck[] = [
    { label: "a", value: "", level: "block" },
    { label: "b", value: "", level: "warn" },
    { label: "c", value: "", level: "warn" },
    { label: "d", value: "", level: "ok" },
  ];

  it("レベルごとの件数を集計する", () => {
    expect(countByLevel(checks)).toEqual({ block: 1, warn: 2, ok: 1 });
  });

  it("空配列は全て 0", () => {
    expect(countByLevel([])).toEqual({ block: 0, warn: 0, ok: 0 });
  });
});
```
（既存の import 行に `countByLevel` を足す。`QualityCheck` は既に import 済みか確認し、無ければ足す。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/draftQuality.test.ts` → FAIL（`countByLevel` 未 export）

- [ ] **Step 3: 実装**

`draftQuality.ts` の末尾（`hasBlockingCheck` の後）に追加:
```ts
/** チェックをレベル別に集計する(proto QualityChecklist の件数ピル用・#proto P3b)。 */
export function countByLevel(checks: readonly QualityCheck[]): Record<CheckLevel, number> {
  return checks.reduce(
    (acc, c) => {
      acc[c.level] += 1;
      return acc;
    },
    { ok: 0, warn: 0, block: 0 } as Record<CheckLevel, number>,
  );
}
```

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/draftQuality.test.ts` → PASS・`draftQuality.ts` 100%。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/draftQuality.ts src/app/growth/approve/draftQuality.test.ts
git commit -m "feat(growth): 品質チェックのレベル別集計 countByLevel を追加（block/warn/ok件数・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 2: 画像指示 純ロジック（imageIntentTypes.ts ＋ src/lib/growth/imageIntent.ts 移植・100%）

**Files:**
- Create: `src/app/growth/approve/imageIntentTypes.ts`（proto の `ImageMode`/`ImageInstruction`/`ImageOutlineSection` 型を本番へ）
- Create: `src/lib/growth/imageIntent.ts`（proto `imageIntent.ts` を純関数移植）
- Test: `src/lib/growth/imageIntent.test.ts`

**Interfaces:**
- `imageIntentTypes.ts`（型のみ・DOM 非依存）:
  ```ts
  export type ImageMode = "off" | "auto" | "custom";
  export interface ImageInstruction {
    mode: ImageMode;
    action?: string;
    isEyecatch?: boolean;
    advancedNote?: string;
  }
  /** imageIntent が参照する最小のセクション形(見出し＋要約＋現在の指示)。 */
  export interface ImageOutlineSection {
    heading: string;
    summary?: string;
    imageInstruction?: ImageInstruction;
  }
  ```
- `src/lib/growth/imageIntent.ts`（proto から移植・`./types` 依存を上記 `imageIntentTypes` へ差し替え）:
  - `suggestActions(section: ImageOutlineSection): string[]`
  - `migrateImageHint(hint: string | undefined): ImageInstruction | undefined`
  - `resolveAction(section: ImageOutlineSection, inst?: ImageInstruction): string`
  - `recommendOff(section: ImageOutlineSection, index: number, total: number): boolean`
  - `effectiveMode(inst?: ImageInstruction): ImageMode`
  - `imagePlanSummary(outline: ImageOutlineSection[]): { planned: number; specified: number }`
- 結線先: Task 6 の `OutlineView`（`effectiveMode`/`recommendOff`/`resolveAction`/`suggestActions`/`imagePlanSummary`）と `ImageDirector`（`suggestActions`/`resolveAction`）。

**設計判断（AD5-2 縮約・research §5/§7）:** 本番 outline は `[画像:<style>: <説明>]` トークン（`outline.ts`）で mode(off/auto/custom) 概念なし。**フル persist（Notion スキーマ＋API）は P3.5（BE）へ切る**。P3b は imageIntent を純関数移植し UI（OutlineView）で動かすが、`ImageInstruction` の persist は**セッション state に縮約**（Task 6 で `useState<Record<number, ImageInstruction>>` を DetailPanel が保持）。`imageIntentTypes.ts` を本番へ新設し `imageIntent.ts` の `./types` 依存を差し替える（proto の巨大 `Article`/`OutlineSection` を持ち込まない）。proto の `import type { ImageInstruction, OutlineSection } from "./types"` を `import type { ImageInstruction, ImageOutlineSection } from "@/app/growth/approve/imageIntentTypes"` に置換し、関数シグネチャの `OutlineSection` を `ImageOutlineSection` へ。実装本体（ACTION_DICT/FALLBACK_ACTIONS/各関数のロジック）は proto を逐語（コメント冒頭を「…proto(#proto) からの本番移植。画像指示 persist は P3b でセッション state に縮約(AD5-2)…」に更新）。

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/growth/imageIntent.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import {
  effectiveMode,
  imagePlanSummary,
  migrateImageHint,
  recommendOff,
  resolveAction,
  suggestActions,
} from "./imageIntent";
import type { ImageOutlineSection } from "@/app/growth/approve/imageIntentTypes";

function sec(over: Partial<ImageOutlineSection> = {}): ImageOutlineSection {
  return { heading: "見出し", summary: "", ...over };
}

describe("suggestActions", () => {
  it("キーワードから候補を出し常に1件以上・最大4件・重複なし", () => {
    const out = suggestActions(sec({ heading: "スイングのフォーム", summary: "初心者向け基本" }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(new Set(out).size).toBe(out.length);
  });
  it("該当なしでもフォールバックを返す", () => {
    const out = suggestActions(sec({ heading: "無関係な語", summary: "" }));
    expect(out).toContain("コートに立つ");
  });
});

describe("migrateImageHint", () => {
  it("プレフィクス付きヒントを custom action へ正規化", () => {
    expect(migrateImageHint("mascot: 案内する宇宙人")).toEqual({ mode: "custom", action: "案内する宇宙人" });
  });
  it("プレフィクスなしはそのまま action", () => {
    expect(migrateImageHint("コートを見渡す")).toEqual({ mode: "custom", action: "コートを見渡す" });
  });
  it("空/未定義は undefined", () => {
    expect(migrateImageHint(undefined)).toBeUndefined();
    expect(migrateImageHint("  ")).toBeUndefined();
    expect(migrateImageHint("diagram:   ")).toBeUndefined();
  });
});

describe("resolveAction", () => {
  it("off は空文字", () => {
    expect(resolveAction(sec(), { mode: "off" })).toBe("");
  });
  it("custom は action を返す", () => {
    expect(resolveAction(sec(), { mode: "custom", action: "手を振る" })).toBe("手を振る");
  });
  it("custom で action 空なら auto 推測へフォールバック", () => {
    expect(resolveAction(sec({ heading: "コート案内" }), { mode: "custom", action: "  " }).length).toBeGreaterThan(0);
  });
  it("inst 省略時は section.imageInstruction を見る", () => {
    expect(resolveAction(sec({ imageInstruction: { mode: "off" } }))).toBe("");
  });
});

describe("recommendOff", () => {
  it("まとめ/CTA 系はオフ推奨", () => {
    expect(recommendOff(sec({ heading: "まとめ" }), 2, 3)).toBe(true);
  });
  it("最終セクションが来店誘導ならオフ推奨", () => {
    expect(recommendOff(sec({ heading: "さあ", summary: "ぜひお越しください" }), 2, 3)).toBe(true);
  });
  it("通常セクションは false", () => {
    expect(recommendOff(sec({ heading: "スイングの基本" }), 0, 3)).toBe(false);
  });
});

describe("effectiveMode / imagePlanSummary", () => {
  it("未設定は auto", () => {
    expect(effectiveMode(undefined)).toBe("auto");
    expect(effectiveMode({ mode: "off" })).toBe("off");
  });
  it("planned は off 以外の数・specified は custom の数", () => {
    const outline: ImageOutlineSection[] = [
      sec({ imageInstruction: { mode: "off" } }),
      sec({ imageInstruction: { mode: "auto" } }),
      sec({ imageInstruction: { mode: "custom", action: "x" } }),
      sec(), // 未設定=auto
    ];
    expect(imagePlanSummary(outline)).toEqual({ planned: 3, specified: 1 });
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/growth/imageIntent.test.ts` → FAIL（モジュール未作成）

- [ ] **Step 3: 実装**

`src/app/growth/approve/imageIntentTypes.ts` を上記 Interfaces の型定義で作成（冒頭コメント「画像指示の型(#proto P3b・本番)。proto types.ts の ImageMode/ImageInstruction を承認画面本番へ。persist は P3b でセッション state に縮約(AD5-2)、フル persist は P3.5(BE)。」）。

`src/lib/growth/imageIntent.ts` に proto `src/app/growth/approve-proto/imageIntent.ts` を逐語移植し、冒頭 import を
```ts
import type { ImageInstruction, ImageOutlineSection } from "@/app/growth/approve/imageIntentTypes";
```
へ差し替え、各関数の引数型 `OutlineSection` → `ImageOutlineSection`・戻り値の `ImageInstruction["mode"]` は `ImageMode`（import 追加）または `ImageInstruction["mode"]` のまま維持。ACTION_DICT/FALLBACK_ACTIONS・`suggestActions`/`migrateImageHint`/`resolveAction`/`recommendOff`/`effectiveMode`/`imagePlanSummary` の本体は proto 逐語。冒頭コメントに「純関数移植。画像指示 persist は P3b でセッション state に縮約(AD5-2)。」を追記。

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/lib/growth/imageIntent.test.ts` → PASS・`imageIntent.ts` 100%（未到達分岐があれば実効テスト追加。`imageIntentTypes.ts` は型のみ＝計測対象に実行コードが無く 100% に影響しない）。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/imageIntentTypes.ts src/lib/growth/imageIntent.ts src/lib/growth/imageIntent.test.ts
git commit -m "feat(growth): 画像指示の純ロジック imageIntent を proto から移植（action提案/正規化/集計・100%テスト）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 3: QualityChecklist 移植（block/warn/ok サマリー＋展開）

**Files:**
- Create: `src/app/growth/approve/QualityChecklist.tsx`
- Test: `src/app/growth/approve/QualityChecklist.test.tsx`

**Interfaces:**
- `QualityChecklist`（proto と同型・入力を本番 `QualityCheck` へ）:
  ```ts
  interface QualityChecklistProps {
    checks: QualityCheck[];      // 本番 draftQuality.ts の QualityCheck
    open: boolean;
    onToggle: () => void;
  }
  ```
- 結線先: Task 8 の `DetailPanel` footer が `checks`（`draftQuality(...)` の結果）＋ `qOpen` state を渡す。

**設計判断（research §2/§8）:** proto `QualityChecklist.tsx` を移植。**入力は本番 `QualityCheck`**（`{ label; value; level; hint? }`）で、proto の `{ id; level; label; detail? }` とはフィールド名が違う。移植時に:
- `countByLevel` は本番 `./draftQuality` の Task 1 版を import。
- 展開行の key は proto `c.id` → 本番は `id` が無いため `c.label`（label は draftQuality 内で一意）。
- 詳細テキストは proto `c.detail` → 本番 `c.hint`。
- `QualityLevel` 型 → 本番 `CheckLevel`（`ok|warn|block`・順序は proto と同一）。
- `TONE`/`ORDER`/`AnimatePresence height` 展開・件数ピル・chevron 回転は proto 逐語。`proto-pulse` 等の class は本 file には無い（QualityChecklist に proto class は無い）。`framer-motion` 使用のため `"use client"`。アイコンは `@/app/growth/approve/ui/icons`（`IconCheck`/`IconChevronDown`/`IconX`）。

- [ ] **Step 1: 失敗するテストを書く**

`QualityChecklist.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QualityChecklist } from "./QualityChecklist";
import type { QualityCheck } from "./draftQuality";

const checks: QualityCheck[] = [
  { label: "AI免責文", value: "なし", level: "block", hint: "末尾に§5の免責文が必要" },
  { label: "見出し", value: "1", level: "warn", hint: "2個以上を推奨" },
  { label: "文字数", value: "2,000字", level: "ok" },
];

describe("QualityChecklist", () => {
  it("block/warn/ok の件数ピルを出す", () => {
    render(<QualityChecklist checks={checks} open={false} onToggle={vi.fn()} />);
    expect(screen.getByText(/公開不可\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/要確認\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/OK\s*1/)).toBeInTheDocument();
  });

  it("トグルボタンで onToggle を呼ぶ", async () => {
    const onToggle = vi.fn();
    render(<QualityChecklist checks={checks} open={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("open=true で各チェックの詳細(label/hint)を展開表示する", () => {
    render(<QualityChecklist checks={checks} open onToggle={vi.fn()} />);
    expect(screen.getByText("AI免責文")).toBeInTheDocument();
    expect(screen.getByText(/末尾に§5の免責文が必要/)).toBeInTheDocument();
  });

  it("件数 0 のレベルはピルを描画しない", () => {
    render(<QualityChecklist checks={[{ label: "文字数", value: "x", level: "ok" }]} open={false} onToggle={vi.fn()} />);
    expect(screen.queryByText(/公開不可/)).not.toBeInTheDocument();
    expect(screen.getByText(/OK\s*1/)).toBeInTheDocument();
  });
});
```
（AnimatePresence はモック済で `open` 時に子が素通り描画される。ピルの文言は proto の `{TONE[lv].label} {counts[lv]}` = 「公開不可 1」等になる想定。正規表現は proto の出力に合わせて調整可。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/QualityChecklist.test.tsx` → FAIL

- [ ] **Step 3: 移植**

`src/app/growth/approve-proto/QualityChecklist.tsx` を移植:
- import: `import { AnimatePresence, motion } from "framer-motion";`・`import { countByLevel } from "./draftQuality";`・`import type { CheckLevel, QualityCheck } from "./draftQuality";`・`import { IconCheck, IconChevronDown, IconX } from "./ui/icons";`。
- `QualityLevel` → `CheckLevel`。`TONE: Record<CheckLevel, {color;bg;label}>`（proto と同値 block=公開不可/warn=要確認/ok=OK）。`ORDER: CheckLevel[] = ["block", "warn", "ok"]`。
- `sorted` は `[...checks].sort((a,b)=>ORDER.indexOf(a.level)-ORDER.indexOf(b.level))`（proto 同）。展開行の key は `c.label`、詳細は `c.detail` → `c.hint`。
- 件数ピル・chevron 回転・`AnimatePresence`（height 展開）は proto 逐語。`"use client"` 付与。

- [ ] **Step 4: テスト緑＋100% を確認** — Run: `npx vitest run --coverage src/app/growth/approve/QualityChecklist.test.tsx` → PASS。**注意**: この時点では `QualityChecklist.tsx` はまだ `coverage.exclude` に入れない（Task 3 単体テストで 100% を担保・exclude 追記は Task 9 でまとめて行う）。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/QualityChecklist.tsx src/app/growth/approve/QualityChecklist.test.tsx
git commit -m "feat(growth): 品質チェックリスト QualityChecklist を proto から移植（3段階サマリー/展開）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 4: DevicePreview 移植（mobile/tablet/pc・本番プレビュー frame・固定スケール）

**Files:**
- Create: `src/app/growth/approve/DevicePreview.tsx`
- Test: `src/app/growth/approve/DevicePreview.test.tsx`

**Interfaces:**
- `DevicePreview`（proto と近い・本番プレビュー frame へ結線）:
  ```ts
  interface DevicePreviewProps {
    html: string;   // 下書き本文HTML(draft.bodyHtml || draft.body)。DraftPreviewFrame へ postMessage で注入。
    slug: string;   // ブラウザバーの URL 表示用(item.id 等)。
  }
  ```
- 結線先: Task 5 の `PreviewView` が `<DevicePreview html={draftHtml} slug={pageId} />`。

**設計判断（AD5-5 縮約・research §7・要 DevicePreview.tsx 精読済）:** proto `DevicePreview.tsx` は専用ルート `approve-proto/preview/[id]` を iframe src とし postMessage で `proto-preview-height` を受信して iframe 高さを可変にする。**本番プレビューは `/draft-frame`（`DraftPreviewFrame`）で、iframe src に本文を postMessage 注入する方式（route パラメータ無し・高さ受信なし）**。したがって:
- iframe は proto の生 `<iframe src=.../>` ではなく**本番 `DraftPreviewFrame`（`html` を postMessage 注入）**を使う。`article.id` の URL は無いため src 依存を廃止。
- `contentHeight` の postMessage 受信ロジックは**削除**（本番 frame は高さを返さない＝AD5-5 縮約）。**iframe 高さは端末別の固定値**（例: mobile=720 / tablet=900 / pc=760）に置換し、`ResizeObserver` で avail 幅から `scale` を決めて縮小表示（proto の `scale = min(1, avail/vw)` は維持）。
- 端末: `mobile(390)`/`tablet(834)`/`pc(1280)` の 3 種（proto と同・**タブレットはフロントのみ追加**）。ブラウザ chrome（信号ドット＋URL バー）は proto 逐語。URL バー表示は `thepicklebangtheory.com/ja/news/{slug}`。
- `ResizeObserver` はモック不要（jsdom で存在しなければ vitest.setup 済みか要確認。無ければテストは `scale` を検証せず、端末切替＋DraftPreviewFrame 描画到達のみ検証）。**presentation として Task 9 で `coverage.exclude` へ追記**するため、本 file の 100% はテスト到達分岐で満たす必要はないが、Task 4 の単体テストでは exclude 前提でも「主要分岐が壊れていない」ことを検証する（端末切替 tab の `aria-selected`・DraftPreviewFrame の存在）。
- import: `import { DraftPreviewFrame } from "./DraftPreviewFrame";`・`import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet } from "./ui/icons";`。`proto-*` class 無し。`"use client"`（useState/useEffect/ResizeObserver）。

- [ ] **Step 1: 失敗するテストを書く**

`DevicePreview.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DevicePreview } from "./DevicePreview";

describe("DevicePreview", () => {
  it("3端末のタブを出し、既定はスマホ選択", () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    expect(screen.getByRole("tablist", { name: "プレビュー端末" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /スマホ/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /タブレット/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /PC/ })).toBeInTheDocument();
  });

  it("端末タブ切替で aria-selected が移る", async () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    await userEvent.click(screen.getByRole("tab", { name: /PC/ }));
    expect(screen.getByRole("tab", { name: /PC/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /スマホ/ })).toHaveAttribute("aria-selected", "false");
  });

  it("本番プレビュー frame(iframe)を描画し、URL に slug を出す", () => {
    render(<DevicePreview html="<p>本文</p>" slug="a1" />);
    expect(screen.getByTitle("公開後プレビュー")).toBeInTheDocument();
    expect(screen.getByText(/thepicklebangtheory\.com\/ja\/news\/a1/)).toBeInTheDocument();
  });
});
```
（`DraftPreviewFrame` に `title="公開後プレビュー"` を渡す。iframe は `DraftPreviewFrame` が `<iframe title=... />` を出すため `getByTitle` で到達。ResizeObserver が jsdom に無い場合は `vitest.setup.ts` に polyfill が既にあるか確認し、無ければ本 test 内で `globalThis.ResizeObserver` を no-op モックする（`beforeAll`）。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/DevicePreview.test.tsx` → FAIL

- [ ] **Step 3: 移植**

`src/app/growth/approve-proto/DevicePreview.tsx` を移植し、上記「設計判断」に沿って改修:
- props を `{ html, slug }` へ（`article` 依存を排除）。
- `DEVICES` は proto の `mobile(390)/tablet(834)/pc(1280)` を逐語。各端末に固定 `fh`（frame height）を追加: `{ key:"mobile", vw:390, fh:720 }`・`{ key:"tablet", vw:834, fh:900 }`・`{ key:"pc", vw:1280, fh:760 }`。
- postMessage 受信 `useEffect`（`onMsg`/`proto-preview-height`）を**削除**。`contentHeight` state を撤去し `current.fh` を使う。
- ResizeObserver で `avail` 測定→`scale = Math.min(1, avail / vw)` は維持。
- iframe は `<DraftPreviewFrame title="公開後プレビュー" html={html} className={...} />` に置換。外側の縮小ラッパは `width: Math.round(vw * scale)`・`height: Math.round(fh * scale)`・内側 `DraftPreviewFrame` の style/className に `width: vw; height: fh; transform: scale(${scale}); transformOrigin: "top left"` を適用（`DraftPreviewFrame` は `className` を受けるので、transform/size は wrapper div に付け iframe は `width:100%; height:100%` にする形へ調整＝`DraftPreviewFrame` は `className` のみ受ける実装のため、`transform` は外側の固定サイズ box で表現）。**具体化**: proto の「真のビューポート幅で描画した iframe を縮小して収める」ボックス構造を維持し、内側の生 `<iframe>` を `DraftPreviewFrame` へ差し替え、`DraftPreviewFrame` の `className` に `block border-0` を、transform/幅高は proto と同じく外側 `<div style={{width:vw*scale, height:fh*scale, overflow:"hidden"}}>` の**さらに内側の `<div style={{width:vw,height:fh,transform:scale}}>` でラップ**して `DraftPreviewFrame` を `w-full h-full` にする（`DraftPreviewFrame` に transform を直接渡せないため中間ラッパで表現）。ブラウザ chrome・信号ドット・URL バー（`thepicklebangtheory.com/ja/news/{slug}`）は proto 逐語。
- ResizeObserver の `wrapRef.current` null 分岐など jsdom 非到達行は presentation として Task 9 で exclude されるため行内 ignore は不要（exclude 追記で計測対象外）。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/DevicePreview.test.tsx` → PASS（**この時点では未 exclude なので 100% を満たす必要は Task 9 まで無いが、`vitest run`〔非 coverage〕で緑**。Task 9 で exclude 追記後に全体 coverage 100% を確認する）。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/DevicePreview.tsx src/app/growth/approve/DevicePreview.test.tsx
git commit -m "feat(growth): デバイスプレビュー DevicePreview を proto から移植（3端末・本番frame結線・固定スケールに縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 5: DetailViews 移植（PromptView / PreviewView / ImagesView / MetaEditor）

**Files:**
- Create: `src/app/growth/approve/DetailViews.tsx`
- Test: `src/app/growth/approve/DetailViews.test.tsx`

**Interfaces（本番データへ寄せる・proto の巨大 `Article` は使わない）:**
- `PromptView`:
  ```ts
  interface PromptViewProps { prompt: string; refs?: { title: string; source: string }[] }
  ```
- `PreviewView`（generating/no-body/ready 3分岐）:
  ```ts
  interface PreviewViewProps {
    stage: BoardStage;            // deriveBoardStage の結果(generating 判定に使う)
    generatingStep?: string;      // generating.ts のラベル(AD5-4 縮約)
    stuck?: boolean;              // 滞留(pullStale 由来・任意)
    bodyHtml: string;             // 下書き本文(空=no body)
    metaDescription?: string;     // 現行の excerpt(未取得は空)
    slug: string;                 // DevicePreview の URL 表示
    onSaveMeta: (text: string) => void;  // メタ保存(ExcerptEditor の保存経路へ結線)
  }
  ```
- `ImagesView`（アイキャッチ＋本文画像・regenKeys で生成中）:
  ```ts
  interface ImagesViewProps {
    hue: number;
    hasEyecatch: boolean;
    eyecatchUrl?: string;
    bodyImages: number;
    bodyImageHues?: number[];
    bodyImageUrls?: (string | undefined)[];
    regenKeys: Set<string>;       // `${id}:eyecatch` / `${id}:body:${i}`
    itemId: string;
    onPickEyecatch: () => void;
    onRegenEyecatch: () => void;
    onPickBodyImage: (index: number) => void;
    onRegenBodyImage: (index: number) => void;
  }
  ```
- `MetaEditor`（内部・PreviewView から使用）: proto の 120字判定を本番 `excerptDraft.ts`（`EXCERPT_MAX`/`autoExcerpt`/`isExcerptTooLong`）へ寄せる。
- 結線先: Task 8 の `DetailPanel` が各 View を安全タブで出し分ける。ready 時 `PreviewView` は `<MetaEditor/>` ＋ `<DevicePreview/>`。

**設計判断（research §2・DetailViews.tsx 精読済）:**
- proto の巨大 `Article` を持ち込まず、各 View に必要フィールドだけ props で渡す（AD2 データ本番化）。
- **MetaEditor の 120字判定は本番 `excerptDraft.ts`**へ寄せる: `over = isExcerptTooLong(text)`（`EXCERPT_MAX=120`）・「本文から自動生成」は `autoExcerpt(stripTags(bodyHtml))`（proto の `stripTags(...).slice(0,116)…` を `autoExcerpt` に置換＝上限 120 で省略）。カウンタ `{text.length}/{EXCERPT_MAX}`。保存は `onSave(text)`（Task 8 で ExcerptEditor の保存 API か既存経路に結線・**P3b では onSaveMeta の受け口を用意し、実保存は現行 `ExcerptEditor` の保存フローに委譲**＝下記 §結線注記）。`stripTags` は本 file にローカルで持つ（proto の `./bodyBlocks` の `stripTags` を本 file に小関数として移植、または `draftQuality` のプライベート `stripTags` は非 export のため、`imageIntentTypes` 同様の小ユーティリティとして DetailViews 内に inline）。
- **PreviewView の generating 進捗（AD5-4 縮約）**: proto は `article.genProgress`（%）＋進捗バー。本番 stage=generating に % が無いため、**進捗バーは `approve-shimmer` 不定＋段階ラベル（`generatingStep`）表示に縮約**（`{Math.round(progress)}%` の数値表示は出さない）。滞留（`stuck`）バナーは proto 逐語（`stuck` prop・任意）。shimmer プレースホルダ行（`[92,78,...]`）は proto 逐語（`proto-shimmer`→`approve-shimmer`）。
- **ImagesView**: `EyecatchThumb`（`@/app/growth/approve/ui/eyecatchThumb`）＋ローカル `ImageFrame`（生成中オーバーレイ `approve-pulse`）。`regenKeys.has(`${itemId}:eyecatch`)`・`${itemId}:body:${i}`。`bodyHues` は `bodyImageHues ?? Array.from(...)`。`proto-tool`→`approve-tool`・`proto-btn-ghost`→`approve-btn-ghost`。アイコンは `./ui/icons`。
- `"use client"`（useState）。framer-motion 不使用（AnimatePresence は DetailPanel 側）。

**§結線注記（onSaveMeta）:** proto MetaEditor の保存は onSave(text) のみ。本番のメタ保存は `ExcerptEditor.tsx`（fetch・exclude 済）が担う。P3b では **MetaEditor は表示＋自動生成＋onSave コールバックまで**を担い、実 API 保存は Task 8 で `onSaveMeta` を「現行 ExcerptEditor 相当の保存経路（`autoExcerpt`＋API）」に繋ぐ。API 経路が既存フックに無い場合は当面 `onSaveMeta` をトースト＋no-op（縮約）にせず、既存 `ExcerptEditor` の保存関数（`/api/growth/draft` の excerpt patch）を呼ぶ薄いハンドラを ApproveClient に用意する（実データ維持・沈黙させない）。**この結線の実在確認は Task 8 Step 1 で行い、無ければ ExcerptEditor をそのまま MetaEditor の下に併置する経路に切替（過剰実装回避）。**

- [ ] **Step 1: 失敗するテストを書く**

`DetailViews.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ImagesView, PreviewView, PromptView } from "./DetailViews";

describe("PromptView", () => {
  it("生成メモと参照を出す", () => {
    render(<PromptView prompt="この記事の狙い" refs={[{ title: "施設ページ", source: "/facility" }]} />);
    expect(screen.getByText("この記事の狙い")).toBeInTheDocument();
    expect(screen.getByText("施設ページ")).toBeInTheDocument();
  });
});

describe("PreviewView", () => {
  it("generating は shimmer と段階ラベルを出す(進捗%は出さない)", () => {
    render(
      <PreviewView stage="generating" generatingStep="本文を生成中" bodyHtml="" slug="a1" onSaveMeta={vi.fn()} />,
    );
    expect(screen.getByText("本文を生成中")).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });
  it("本文なし(draft_review)は空状態を出す", () => {
    render(<PreviewView stage="draft_review" bodyHtml="" slug="a1" onSaveMeta={vi.fn()} />);
    expect(screen.getByText("本文はまだ生成されていません")).toBeInTheDocument();
  });
  it("ready はメタ編集＋デバイスプレビューを出す", () => {
    render(<PreviewView stage="draft_review" bodyHtml="<p>本文</p>" slug="a1" onSaveMeta={vi.fn()} />);
    expect(screen.getByText(/メタディスクリプション/)).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "プレビュー端末" })).toBeInTheDocument();
  });
  it("メタが120字超で警告を出し、保存で onSaveMeta を呼ぶ", async () => {
    const onSaveMeta = vi.fn();
    render(<PreviewView stage="draft_review" bodyHtml="<p>本文</p>" slug="a1" metaDescription={"あ".repeat(121)} onSaveMeta={onSaveMeta} />);
    expect(screen.getByText(/120字を超えると/)).toBeInTheDocument();
    // 何か1文字消して dirty にしてから保存
    const ta = screen.getByPlaceholderText(/検索結果に出る説明文/);
    await userEvent.type(ta, "x");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(onSaveMeta).toHaveBeenCalled();
  });
  it("本文から自動生成で excerpt を埋める", async () => {
    render(<PreviewView stage="draft_review" bodyHtml={`<p>${"本文テキスト".repeat(40)}</p>`} slug="a1" onSaveMeta={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /本文から自動生成/ }));
    const ta = screen.getByPlaceholderText(/検索結果に出る説明文/) as HTMLTextAreaElement;
    expect(ta.value.length).toBeGreaterThan(0);
    expect(ta.value.endsWith("…")).toBe(true); // 120字超で省略
  });
});

describe("ImagesView", () => {
  const base = {
    hue: 200, hasEyecatch: true, bodyImages: 2, itemId: "a1", regenKeys: new Set<string>(),
    onPickEyecatch: vi.fn(), onRegenEyecatch: vi.fn(), onPickBodyImage: vi.fn(), onRegenBodyImage: vi.fn(),
  };
  it("アイキャッチと本文画像の枚数を出す", () => {
    render(<ImagesView {...base} />);
    expect(screen.getByText("アイキャッチ")).toBeInTheDocument();
    expect(screen.getByText(/本文画像 \(2\)/)).toBeInTheDocument();
  });
  it("アイキャッチ未設定で警告を出す", () => {
    render(<ImagesView {...base} hasEyecatch={false} />);
    expect(screen.getByText(/未設定 — 公開にはアイキャッチが必要です/)).toBeInTheDocument();
  });
  it("本文画像0で『ありません』", () => {
    render(<ImagesView {...base} bodyImages={0} />);
    expect(screen.getByText("本文画像はありません。")).toBeInTheDocument();
  });
  it("再生成ボタンで onRegenBodyImage(index)", async () => {
    render(<ImagesView {...base} />);
    const regen = screen.getAllByTitle("AIで再生成");
    await userEvent.click(regen[1]); // アイキャッチ+本文の順。本文0番目
    expect(base.onRegenBodyImage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/DetailViews.test.tsx` → FAIL

- [ ] **Step 3: 移植**

`src/app/growth/approve-proto/DetailViews.tsx` を上記 Interfaces/設計判断で移植:
- `PromptView`: proto 逐語（props を `{ prompt, refs }` へ）。refs は任意（`refs?.length`）。
- `PreviewView`: 分岐を `stage === "generating"`（進捗% を消し `generatingStep` ＋ `approve-shimmer` 行のみ）/ `!bodyHtml`（空状態逐語）/ ready（`<MetaEditor .../>`＋`<DevicePreview html={bodyHtml} slug={slug} />`）。`stuck` バナー逐語。
- `MetaEditor`: proto 逐語だが `over = isExcerptTooLong(text)`・カウンタ `/{EXCERPT_MAX}`・自動生成 `autoExcerpt(stripTags(bodyHtml))`。`import { EXCERPT_MAX, autoExcerpt, isExcerptTooLong } from "@/lib/growth/excerptDraft";`。`stripTags` は本 file にローカル小関数（`html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()`）。
- `ImageFrame`/`ImagesView`: proto 逐語で props を本番へ。`EyecatchThumb` は `@/app/growth/approve/ui/eyecatchThumb`。`proto-tool`→`approve-tool`・`proto-btn-ghost`→`approve-btn-ghost`・`proto-pulse`→`approve-pulse`。regenKeys の key を `${itemId}:eyecatch`/`${itemId}:body:${i}`。
- import: `import { DevicePreview } from "./DevicePreview";`・`import { IconCheck, IconFileText, IconImage, IconSparkles } from "./ui/icons";`・`import { EyecatchThumb } from "./ui/eyecatchThumb";`・`import type { BoardStage } from "./ui/boardStage";`。`"use client"`。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/DetailViews.test.tsx` → PASS（exclude は Task 9・ここでは `vitest run` 緑）。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/DetailViews.tsx src/app/growth/approve/DetailViews.test.tsx
git commit -m "feat(growth): 詳細タブビュー DetailViews を proto から移植（プレビュー/プロンプト/画像・generating進捗は縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 6: OutlineView 移植（仮説＋行コメント帯＋画像指示レーン・画像は session state 縮約）

**Files:**
- Create: `src/app/growth/approve/OutlineView.tsx`
- Create: `src/app/growth/approve/ImagePlanBanner.tsx`
- Create: `src/app/growth/approve/ImageStateToggle.tsx`
- Create: `src/app/growth/approve/ImageSlot.tsx`
- Create: `src/app/growth/approve/ImageDirector.tsx`
- Create: `src/app/growth/approve/ActionInput.tsx`
- Create: `src/app/growth/approve/ActionSuggestions.tsx`
- Create: `src/app/growth/approve/HouseStylePreview.tsx`
- Test: `src/app/growth/approve/OutlineView.test.tsx`

**Interfaces（本番データ＋画像は session state 縮約）:**
- `OutlineView`:
  ```ts
  interface OutlineViewSection {
    heading: string;
    summary?: string;
    comments?: string[];
  }
  interface OutlineViewProps {
    sections: OutlineViewSection[];   // 現行 outline(文字列) を parse した構成案(下記 §parse)
    hypothesis?: ArticleHypothesis;   // @/lib/growth/approve の仮説(未記入は非表示)
    hue: number;                      // house style プレビューの色相
    imageInstructions: Record<number, ImageInstruction>;  // session state(縮約・親が保持)
    revising: boolean;                // 構成案修正が依頼中/処理中(useReviseEditing.reviseBusy 等)
    onAddComment: (sectionIndex: number, text: string) => void;
    onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
    onUpdateImage: (sectionIndex: number, patch: Partial<ImageInstruction>) => void;  // session merge
    onRequestOutlineRevise: () => void;
  }
  ```
- 結線先: Task 8 の `DetailPanel` が `useReviseEditing` の コメント配列（`draftComments`）＋ `requestRevise`/`saveComment`/`deleteComment` を、画像指示は DetailPanel が持つ `useState<Record<number, ImageInstruction>>`（縮約 persist）を渡す。

**設計判断（AD5-2 縮約・research §2/§5/§7・OutlineView.tsx / Image* 精読済）:**
- **画像指示 persist は当面セッション state に縮約**（フル persist は P3.5 BE）。`OutlineView` は画像指示を props（`imageInstructions`）＋ `onUpdateImage`（親のセッション merge）で受ける。`s.imageInstruction` の直接参照を `imageInstructions[i]` に置換。この縮約理由を OutlineView 冒頭コメント＋設計書 AD5-2 に追記（Task 9）。
- **行コメント（section 単位）は `useReviseEditing` へ結線**（本番の構成案コメント配列＝`draftComments`）。proto の `s.comments` は本番 `draftComments[i]` から供給（Task 8 の親で `sections[i].comments = revise.draftComments[i]` を合成）。`onAddComment`/`onRemoveComment`/`onRequestOutlineRevise` は `revise.saveComment`/`revise.deleteComment`/`revise.requestRevise(item)` に結線（Task 8）。proto の内部 `commentFor`/`commentText` ローカル state は OutlineView 内で維持（入力途中の一時状態＝UI ローカルで正しい）。
- **仮説カード**: proto は `article.hypothesis`（proto の `Hypothesis`＝articleType/targetReader/searchIntent/winningAngle/successMetric/plannedCta）。本番 `ArticleHypothesis`（`@/lib/growth/approve`）へ写像。**フィールド名の対応を Task 6 Step 1 前に `@/lib/growth/approve` の `ArticleHypothesis` を精読して確定**（既存 `HypothesisCard.tsx` が本番 hypothesis の表示に使う対応を流用）。本番のフィールドに無い proto ラベルは出さない（欠落耐性・空セルは描画しない）。
- **画像サブ部品（ImagePlanBanner/ImageStateToggle/ImageSlot/ImageDirector/ActionInput/ActionSuggestions/HouseStylePreview）を proto から移植**。`imageIntent` は `@/lib/growth/imageIntent`（Task 2）を、型は `@/app/growth/approve/imageIntentTypes` を import。`ImageSlot`/`HouseStylePreview` の `mediaSvgUrl`（proto `./mediaLibrary`）は house-style モックサムネ生成の純関数のため `src/app/growth/approve/mediaLibrary.ts`（proto から移植・data-URI 生成の純関数）を新設して import（＝Task 6 で `mediaLibrary.ts` も移植・100% テストは Task 6 の OutlineView テストで到達しない分岐が出れば `mediaLibrary.test.ts` を追加）。**注意**: `mediaLibrary.ts` は純ロジック（SVG data-URI 生成）なので **exclude せず 100%**。`ImageSlot` の `<img src={mediaSvgUrl(...)}>` は proto が `next/image` 非対応の data-URI モックとして生 `<img>`＋eslint-disable コメントを持つ→本番でも同様に `eslint-disable-next-line @next/next/no-img-element` で維持（house-style モックプレビュー・実アイキャッチは ImagesView の `EyecatchThumb`＝`next/image`）。
- `proto-*` class → `approve-*`（`proto-tool`/`proto-btn-primary` 等）。アイコンは `./ui/icons`。framer-motion 不使用。`"use client"`。

**§parse（構成案の sections 供給）:** 本番 outline は文字列（`item.outline`）で、既存 `outline.ts` に parse 純ロジックがある（`parseOutline` 等）。Task 8 の親で `outline.ts` の parse 結果（見出し＋説明）を `OutlineViewSection[]` に写像して渡す。**`outline.ts` の export を Task 6 Step 3 前に精読**し、既存の parse 関数（見出し/説明の抽出）を使う（新規 parse は書かない）。画像トークン（`[画像:...]`）はセッション画像指示とは独立に既存 parse がハンドルするため、P3b の OutlineView は「見出し＋説明＋コメント＋セッション画像指示」だけを扱う。

- [ ] **Step 1: 失敗するテストを書く**

`OutlineView.test.tsx`（要点）:
```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OutlineView } from "./OutlineView";
import type { ImageInstruction } from "./imageIntentTypes";

function setup(over: Partial<Parameters<typeof OutlineView>[0]> = {}) {
  const props = {
    sections: [
      { heading: "導入", summary: "ピックルボールとは", comments: [] as string[] },
      { heading: "まとめ", summary: "ぜひお越しください", comments: ["ここを短く"] },
    ],
    hue: 200,
    imageInstructions: {} as Record<number, ImageInstruction>,
    revising: false,
    onAddComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onUpdateImage: vi.fn(),
    onRequestOutlineRevise: vi.fn(),
    ...over,
  };
  render(<OutlineView {...props} />);
  return props;
}

describe("OutlineView", () => {
  it("セクション見出し＋説明を出す", () => {
    setup();
    expect(screen.getByText("導入")).toBeInTheDocument();
    expect(screen.getByText("まとめ")).toBeInTheDocument();
  });
  it("コメント集約帯: 件数と修正依頼ボタン(コメント0で無効)", () => {
    const p = setup({ sections: [{ heading: "a", summary: "", comments: [] }] });
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeDisabled();
  });
  it("コメントがあると修正依頼ボタンが有効で onRequestOutlineRevise", async () => {
    const p = setup();
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(p.onRequestOutlineRevise).toHaveBeenCalled();
  });
  it("既存コメントの削除で onRemoveComment(i, ci)", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "コメント削除" }));
    expect(p.onRemoveComment).toHaveBeenCalledWith(1, 0);
  });
  it("コメント追加: ＋コメント→入力→追加で onAddComment(i, text)", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    await userEvent.type(screen.getByPlaceholderText("このセクションへの指示…"), "導入を短く");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(p.onAddComment).toHaveBeenCalledWith(0, "導入を短く");
  });
  it("画像トグルを custom にすると onUpdateImage(i,{mode:'custom'})", async () => {
    const p = setup();
    const radios = screen.getAllByRole("radio", { name: /指定/ });
    await userEvent.click(radios[0]);
    expect(p.onUpdateImage).toHaveBeenCalledWith(0, { mode: "custom" });
  });
  it("画像プラン帯を出す(house style 明示)", () => {
    setup();
    expect(screen.getByText(/宇宙人マスコット × コスミック/)).toBeInTheDocument();
  });
});
```
（`ImageStateToggle` は radiogroup/radio。ラベルは「オフ/おまかせ/指定」。`changeMode` が `onUpdateImage(i,{mode})` を呼ぶ。仮説カードは props 無しでは非表示。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/app/growth/approve/OutlineView.test.tsx` → FAIL

- [ ] **Step 3: 移植**

まず画像サブ部品を移植（proto → 本番・`proto-`→`approve-`・import 差し替え）:
- `mediaLibrary.ts`（proto `src/app/growth/approve-proto/mediaLibrary.ts` の `mediaSvgUrl` 等・純ロジック）を `src/app/growth/approve/mediaLibrary.ts` へ。必要なら `mediaLibrary.test.ts` を追加（100%・exclude しない）。
- `ActionInput.tsx`/`ActionSuggestions.tsx`/`HouseStylePreview.tsx`/`ImageSlot.tsx`/`ImageStateToggle.tsx`/`ImagePlanBanner.tsx`/`ImageDirector.tsx` を proto から逐語移植。import を本番へ:
  - `import { effectiveMode, imagePlanSummary, recommendOff, resolveAction, suggestActions } from "@/lib/growth/imageIntent";`
  - `import type { ImageInstruction, ImageMode } from "@/app/growth/approve/imageIntentTypes";`（`OutlineSection` は `ImageOutlineSection` へ）
  - `import { mediaSvgUrl } from "./mediaLibrary";`
  - アイコン `./ui/icons`
  - `proto-*`→`approve-*`
  - `ImagePlanBanner` の `outline: OutlineSection[]` → `outline: ImageOutlineSection[]`（`imagePlanSummary` 入力）。
  - `ImageDirector`/`ImageSlot`/`ImageStateToggle` は `"use client"`・`ImagePlanBanner` も `"use client"`（useMemo）。
- `OutlineView.tsx` を移植し、上記 Interfaces に沿って改修:
  - props を上記 `OutlineViewProps` へ。`article.outline` → `sections`、`article.hue` → `hue`、`article.hypothesis` → `hypothesis`（本番 `ArticleHypothesis` の対応ラベルへ）、`article.consults`（revise 進行判定）→ `revising` prop。
  - 各セクションの `inst = s.imageInstruction` → `inst = imageInstructions[i]`。`mode = effectiveMode(inst)`・`recOff = recommendOff({heading:s.heading, summary:s.summary}, i, total)`・`slotAction = mode==="custom" ? (inst?.action ?? "") : resolveAction({heading:s.heading, summary:s.summary}, inst)`。
  - `ImageDirector` に渡す `section` は `{ heading:s.heading, summary:s.summary ?? "" }`（`ImageOutlineSection`）。`instruction={imageInstructions[i]}`。`onSetAction`/`onToggleEyecatch`/`onSetAdvancedNote`/`onCancel` は proto と同じく `onUpdateImage(i, patch)` 経由。
  - コメント帯: `totalComments = sections.reduce((n,s)=>n+(s.comments?.length ?? 0),0)`・修正依頼ボタン `disabled={totalComments===0 || revising}`。
  - `commentFor`/`commentText`/`editingImg` の UI ローカル state は proto 逐語。`submitComment`/`changeMode` は proto 逐語（`onAddComment`/`onUpdateImage` へ）。
  - 仮説セクション: 本番 `ArticleHypothesis` のフィールドが埋まっているものだけ `[label,value]` 配列に入れて grid 描画（proto の 6 項目固定 → 本番の存在フィールドのみ）。
  - `ImagePlanBanner` へ渡す outline は `sections.map((s,i)=>({heading:s.heading, summary:s.summary, imageInstruction: imageInstructions[i]}))`（`ImageOutlineSection[]`）。
  - `"use client"`。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/OutlineView.test.tsx src/app/growth/approve/mediaLibrary.test.ts` → PASS。画像サブ部品（ActionInput/ActionSuggestions/HouseStylePreview/ImageSlot/ImageStateToggle/ImagePlanBanner/ImageDirector）は OutlineView 経由で到達＝OutlineView が exclude される（Task 9）ため個別 exclude 判断が要る（下記）。

> **カバレッジ注記（Task 9 で確定）:** OutlineView は presentation として exclude する。画像サブ部品も presentation（DOM/framer 直結）だが、**`mediaLibrary.ts`（純ロジック・data-URI 生成）と `imageIntent`（Task 2）は exclude しない**。画像サブ部品 .tsx（ActionInput/ActionSuggestions/HouseStylePreview/ImageSlot/ImageStateToggle/ImagePlanBanner/ImageDirector）は Task 9 で「OutlineView と同じく DOM 直結。純ロジックは imageIntent/mediaLibrary でテスト済」として exclude 追記するか、OutlineView 経由の RTL テストで 100% 到達させるかを選ぶ。**方針: 画像サブ部品は exclude せず OutlineView.test.tsx で RTL 到達（ActionInput 入力/ActionSuggestions ピック/HouseStylePreview 表示/ImageSlot custom クリック/ImageStateToggle 矢印キー移動/ImagePlanBanner 集計/ImageDirector 高度指定トグル）を厚く書き 100% を満たす。** exclude するのは DetailPanel/DetailViews/OutlineView/QualityChecklist/DevicePreview の 5 file のみ（設計指定）。したがって Task 6 の OutlineView.test.tsx は画像サブ部品の分岐（矢印キー・custom スロット・director 高度指定・advancedNote 入力）を到達させる追加ケースを含める（Step 1 のテストに以下を追加）:
> - `ImageStateToggle`: 矢印キーで mode 移動（`ArrowRight`/`ArrowLeft`）。
> - `ImageSlot`（custom）: サムネクリックで `onEdit`（ImageDirector 再展開）。
> - `ImageDirector`: 「高度な指定」トグル・advancedNote textarea 入力→`onSetAdvancedNote`・「おまかせに戻す」→`onCancel`（`onUpdateImage(i,{mode:"auto"})`）・isFirst の「アイキャッチに使う」チェック→`onToggleEyecatch`。
> - `ActionSuggestions`: サジェスト click→`onSetAction`。
> - `HouseStylePreview`: previewAction 反映（debounce は fake timer or 直接表示検証）。
> これにより 5 file 以外は 100% 計測対象のまま。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/OutlineView.tsx src/app/growth/approve/ImagePlanBanner.tsx src/app/growth/approve/ImageStateToggle.tsx src/app/growth/approve/ImageSlot.tsx src/app/growth/approve/ImageDirector.tsx src/app/growth/approve/ActionInput.tsx src/app/growth/approve/ActionSuggestions.tsx src/app/growth/approve/HouseStylePreview.tsx src/app/growth/approve/mediaLibrary.ts src/app/growth/approve/mediaLibrary.test.ts src/app/growth/approve/OutlineView.test.tsx
git commit -m "feat(growth): 構成案タブ OutlineView と画像指示レーンを proto から移植（行コメント=revise結線・画像persistはセッションに縮約）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 7: 本文行コメント再スキン（InlineCommentReview を proto CommentableBody 見た目へ）

**Files:**
- Modify: `src/app/growth/approve/InlineCommentReview.tsx`（proto CommentableBody の見た目へ再スキン・実 API 維持）

**Interfaces:** props は現行維持（`{ pageId, token, bodyHtml, bodyComment?, onChanged }`）。`useBodyCommentConsult`（実 API・exclude 済）は不変。

**設計判断（research §2/§8・CommentableBody.tsx / InlineCommentReview.tsx 精読済）:**
- proto `InlineEditor`（execCommand）は**移植しない**。proto `CommentableBody`（本文を文/項目行に割りホバー「+」で行コメント）の**見た目**を、本番 `InlineCommentReview`（実 API・`useBodyCommentConsult`）に被せる。
- 現行 `InlineCommentReview` は既に「1文＝1行・行ガター・ホバー＋・コメント表示・入力・AI依頼」の構造を持つ（`extractReviewLines`＋`useBodyCommentConsult`）。**ロジック・API・props は一切変えず、class/配色/余白を proto CommentableBody 風（`.proto-article`→`.approve-article`・amber コメント・`--p-*` トークン・行ホバー `group/row`・「+」ボタンの見た目）へ置換**する。GitHub 風の白テーマ（`bg-gray-50`/`text-blue-700` 等）を proto ダーク（`var(--p-*)`）へ。
- `InlineCommentReview.tsx` は既に `coverage.exclude` 済（#182・薄い DOM 結線）。再スキンは class 変更のみのため **exclude のまま**（純ロジック `bodyComment.ts`/`extractReviewLines` は変わらず 100%）。
- **禁止事項の維持**: 実 API（`/api/growth/body-comment`）・`useBodyCommentConsult` の busy/error/status 表示・沈黙させない（error は `role="alert"` 維持）。既存の a11y ラベル（`aria-label="本文インラインコメント"`・`${i+1}行目にコメント`・`コメントを削除`・`role="status"`/`role="alert"`）を**保持**（テスト参照点のため）。

- [ ] **Step 1: 既存テストで参照点を確認**

`grep -rn "InlineCommentReview\|本文インラインコメント\|行目にコメント\|AIに指摘を依頼" src/app/growth/approve/*.test.tsx` で InlineCommentReview を参照する既存テスト（ApproveClient.test.tsx 等）を確認。**再スキンは class のみのため既存テストは緑のまま通る前提**（role/aria-label/文言を変えない）。もし固有 class を assert するテストがあれば洗い出し、Step 3 で壊さないよう class 変更範囲を限定する。

- [ ] **Step 2: 再スキン前のベースライン確認** — Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx -t "コメント"`（InlineCommentReview 関連が現状緑であることを確認・基準作り）。

- [ ] **Step 3: 再スキン**

`InlineCommentReview.tsx` の JSX の class/style を proto `CommentableBody.tsx` の見た目へ置換:
- ルート `<section>`: `.approve-article` 相当のダーク背景・`var(--p-bg-raised)`/`var(--p-border)`。
- 行ガター・「+」ボタン: proto の `group/row` ホバー・`var(--p-bg-active)`/`var(--p-amber-weak)`・amber 数字バッジ。
- コメント行: proto の amber カード（`var(--p-amber-weak)`・`IconMessage`）。アイコンは `./ui/icons`（`IconMessage`/`IconPlus`/`IconX`）。
- 入力欄・追加ボタン: `var(--p-bg-input)`/`approve-btn-primary`・`var(--p-accent)`。
- status/proposal/AI 依頼ボタン: proto トーンへ（`var(--p-purple-weak)` 等）。文言・`role`・`aria-label` は不変。
- **ロジック（`extractReviewLines`/`ic.*`/status 分岐/structureNote）は一切変更しない**。

- [ ] **Step 4: テスト緑を確認** — Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（InlineCommentReview 関連が緑・class 変更で回帰なし）。`InlineCommentReview.tsx` は exclude 済のため coverage には影響しない。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/InlineCommentReview.tsx
git commit -m "refactor(growth): 本文インラインコメントを proto CommentableBody 見た目へ再スキン（実API/props/ロジックは不変）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 8: DetailPanel 束ね（2段タブ）＋ApproveClient 結線差し替え（テスト移設は次タスク）

> 本タスクは大きい。骨格差し替え時点で `tsc`/`eslint`/移設対象外テストは緑、`ApproveClient.test.tsx` の詳細系 describe は一時赤を許容し Task 9 で回復（P1 Task6/7・P3a Task4/5 の運用）。

**Files:**
- Create: `src/app/growth/approve/DetailPanel.tsx`（proto 2段タブ版で**現行 DetailPanel を上書き**。現行の外枠 DetailPanel は撤去され新実装に置換）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（`renderDetailPanel` を新 DetailPanel へ・画像 session state・DetailTab state・onSaveMeta 結線）
- Test: `src/app/growth/approve/DetailPanel.test.tsx`

**Interfaces（proto DetailPanel を本番データへ）:**
- `DetailTab = "outline" | "prompt" | "preview" | "images"`（本 file にローカル型 or `imageIntentTypes` 隣に）。
- `DetailPanel`（proto から・データ本番化）:
  ```ts
  interface DetailPanelProps {
    item: PendingItem;               // article=null 相当は親が未選択で描画しない
    stage: BoardStage;               // deriveBoardStage(item)
    tab: DetailTab;
    editing: boolean;
    draftState: DraftState;          // preview/quality の入力源
    onBack?: () => void;             // モバイル「← 一覧」
    onTabChange: (tab: DetailTab) => void;
    // 主操作(現行ロジック維持)
    onApprove: () => void;           // decideFromPanel(item,"承認") 等
    onRevise: () => void;            // consult.openDrawer(見た目 skin は P4)
    onReject: () => void;            // decideFromPanel(item,"却下")
    onRevert: () => void;            // openConfirm(item,"revert")
    onEdit: () => void;              // startEditDraft(bodyHtml)
    // DetailViews/OutlineView への結線
    prompt: string; refs?: ...; hue: number; slug: string;
    regenKeys: Set<string>;
    onPickEyecatch/onRegenEyecatch/onPickBodyImage/onRegenBodyImage;
    sections: OutlineViewSection[]; hypothesis?: ArticleHypothesis;
    imageInstructions: Record<number, ImageInstruction>;
    revising: boolean;
    onAddComment/onRemoveComment/onUpdateImage/onRequestOutlineRevise;
    onSaveMeta: (text: string) => void;
    // 本文行コメント(再スキンした InlineCommentReview)を差し込む slot
    inlineComments?: ReactNode;      // consultSentenceMode 相当。親が InlineCommentReview を注入。
    consultSentenceMode?: boolean;
  }
  ```
  - **設計判断**: proto DetailPanel は `CommentableBody` を内部に持つが、本番は行コメントを **`inlineComments` slot（親が再スキン済 InlineCommentReview を注入）** で受ける。`consultSentenceMode && inlineComments` のとき本文注釈 UI を前面に出す。editing は現行 TipTap 全画面 overlay（`renderEditWorkspace`）が担うため、**DetailPanel の editing 分岐は「編集中バッジ表示のみ」**とし、`DraftEditWorkspace` は DetailPanel 内に描画しない（proto の `editing ? <DraftEditWorkspace/>` は本番では親の overlay へ委譲＝body は editing 中も outline/preview を出さず「編集中」プレースホルダ or 通常 tabpanel を維持）。**確定: editing 中も tabpanel は通常表示のまま**（TipTap は overlay で前面に出るため DetailPanel body は隠れる）。よって proto の `editing ?` 分岐は本番 DetailPanel では持たず、ヘッダの「編集中」バッジのみ `editing` で切替。

- `checks`: `draftState.status === "ready" ? draftQuality({ bodyHtml, body, title, knownNewsPaths }) : []`（本番 `draftQuality`）。`hasBlock = countByLevel(checks).block > 0`。footer は proto 逐語（decided=公開済み/公開予約済み・else=構成からやり直す（draft_review 時）・却下・AIに相談（onRevise）・承認（`disabled={!isReviewable || hasBlock}`））。`decided`/`isReviewable` は `stage`（BoardStage）で判定: `decided = stage==="scheduled" || stage==="published"`・`isReviewable = stage==="draft_review" || stage==="outline_review"`。
- 主操作の footer ボタンラベルは proto 逐語（`stage==="outline_review" ? "構成案を承認" : "承認して公開予約"`）。

**ApproveClient 結線（研究 §1/§6・renderDetailPanel 差し替え）:**
- `DetailTab` state 追加: `const [detailTab, setDetailTab] = useState<DetailTab>("preview")`（activeId 変化でリセット可・proto 既定=preview）。
- 画像 session state（縮約）: `const [imageInstructions, setImageInstructions] = useState<Record<number, ImageInstruction>>({})`（activeId 変化でリセット）。`onUpdateImage = (i, patch) => setImageInstructions((prev) => ({ ...prev, [i]: { ...(prev[i] ?? { mode: "auto" }), ...patch } }))`（immutable マージ）。
- sections 供給: `outline.ts` の parse 純ロジックで `activeItem.outline`（文字列）→ `OutlineViewSection[]`（見出し＋説明）へ。コメントは `revise.draftComments[i]` を合成。
- `onSaveMeta`: `§結線注記`（Task 5）に従い、既存の excerpt 保存経路（ExcerptEditor 相当の API 呼び出し）へ結線。無ければ ExcerptEditor をそのまま MetaEditor 下に併置 or `onSaveMeta` を `/api/growth/draft` の excerpt patch を叩く薄いハンドラに（Task 8 Step 1 で実在確認）。
- `onRevise`: `consult.openDrawer`（ConsultDrawer の見た目 skin は P4・ここは結線のみ）。**consult は現状 DetailPanelView 内で生成していたため、Task 8 で `useConsult` を DetailPanel（or ApproveClient）側へ移す**。DetailPanelView 撤去に伴い、`useConsult({ item, token, draft, onReloadDraft, revise })` を ApproveClient の renderDetailPanel 近傍で生成し、`onRevise={consult.openDrawer}`・`consultSentenceMode = consult.mode === "sentence" && consult.open`・`inlineComments = <InlineCommentReview .../>`（ready 時）を渡す。ConsultDrawer/ConsultComposer は現行どおり ApproveClient から描画（DetailPanelView が持っていた ConsultDrawer 描画を ApproveClient へ移設）。
- `regenKeys`: 現行に `regenKeys` state が無ければ、`draft.eyecatchRegen`/`draft.bodyRegen` の status から生成中 key を導出（`draftState.draft.eyecatchRegen?.status==="処理中"` 等で `${id}:eyecatch` を Set 化）。**実在確認 Task 8 Step 1**（無ければ空 Set＋既存の EyecatchPicker/BodyImagePicker 側の生成中表示に委ねる縮約）。
- `onPickEyecatch`/`onRegenEyecatch`/`onPickBodyImage`/`onRegenBodyImage`: 現行の EyecatchPicker/BodyImagePicker/media picker の起動関数へ結線（実在確認 Step 1・無ければ既存 media 導線へ）。

- [ ] **Step 1: 現行の詳細結線を精読し結線先を確定**

`ApproveClient.tsx` の `renderDetailPanel`/`DetailPanelView`/`useConsult` 生成箇所・`outline.ts` の parse export・`excerptDraft`/ExcerptEditor の保存経路・`regenKeys` 相当・media picker 起動関数を読む。**onSaveMeta / regenKeys / 画像 picker の実在を確認**し、無い経路は「既存 UI へ委譲（縮約）」か「薄いハンドラ新設」を選ぶ（過剰実装回避・実データ維持）。Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx -t "認証"`（移設対象外の基準確認）。

- [ ] **Step 2: DetailPanel.tsx（2段タブ）を移植・実装＋DetailPanel.test.tsx**

`src/app/growth/approve-proto/DetailPanel.tsx` を移植し上記 Interfaces へ改修:
- `clustersFromLeaves`/`aggregateDot`/`clusterTargetLeaf`/`tabsFor`（4リーフ→3クラスタ）は proto 逐語。`layoutId="proto-tab-underline"`→`layoutId="approve-tab-underline"`。`role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls="approve-detail-panel"`/`tabpanel aria-labelledby` は proto 逐語（id を `approve-*` へ）。
- ヘッダ: `StageChip stage={stage}`（BoardStage）・`MetaStat`（更新/文字数/読了）・keyword chip。proto の `article.updatedLabel`/`wordCount`/`readMinutes`/`keyword` は本番に無いフィールドがあるため、**本番で出せるものだけ表示**（`item` から出せない項目は非表示 or draft から算出）。**確定: 更新ラベルは item 由来が無ければ非表示・文字数/読了は draft ready 時に本文長から算出（`stripTags(bodyHtml).length` 字・読了=`Math.ceil(len/400)`分 等の簡易算出を本 file のローカル純関数で）・keyword は item に無ければ非表示**（欠落耐性）。scheduledLabel は `item.scheduledAtMs` があれば簡易ラベル（例「予約済み」）。
- body: `editing`→ヘッダバッジのみ（DraftEditWorkspace は親 overlay）。`consultSentenceMode && inlineComments`→`inlineComments` を前面。else→AnimatePresence で `OutlineView`/`PromptView`/`PreviewView`/`ImagesView` を安全タブで出し分け。
- footer: `checks`＋`QualityChecklist`（qOpen ローカル state）・主操作（proto 逐語・`onRevise`＝AIに相談・`hasBlock` で承認無効）。`Kbd R`/`Kbd A` は proto 逐語（表示ラベル・キーバインドは P6）。
- `EmptyDetail`（記事未選択）は親が未選択で描画しないため**移植不要**（proto の `if (!article) return <EmptyDetail/>` は本番では親の「記事を選択」プレースホルダが担う＝P3a で実装済）。ただし proto の EmptyDetail 相当を DetailPanel が持つ必要は無い（親制御）。
- import: framer-motion・`./DetailViews`・`./OutlineView`・`./QualityChecklist`・`./draftQuality`（`draftQuality`/`countByLevel`）・`./ui/primitives`（`Kbd`/`MetaStat`/`StageChip`）・`./ui/icons`・`./ui/boardStage`（`BoardStage`）・`./imageIntentTypes`・`./draftTypes`・`./types`。styleChecks は本番に `StyleHints`（`styleFindings`）があるが proto の `styleChecks`（QualityCheck 合流）は本番に無い→**footer の checks は `draftQuality(...)` のみ**（styleChecks 合流は縮約・StyleHints は別途 §結線で扱わない＝P3b は draftQuality チェックのみをフッターに出す。文体チェックの合流は将来拡張）。`"use client"`。

`DetailPanel.test.tsx`（要点）:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DetailPanel } from "./DetailPanel";
import type { PendingItem } from "./types";
import type { DraftState } from "./draftTypes";

function pi(over: Partial<PendingItem> = {}): PendingItem {
  return { id: "a1", kind: "idea", title: "記事タイトル", subtitle: "", stage: "drafted", ...over } as PendingItem;
}
const draftReady: DraftState = {
  status: "ready",
  draft: { title: "t", displayMode: "html", bodyHtml: "<h2>見出し</h2><p>本文</p>", body: "本文" },
};

function setup(over: Partial<Parameters<typeof DetailPanel>[0]> = {}) {
  const props = {
    item: pi(), stage: "draft_review" as const, tab: "preview" as const, editing: false,
    draftState: draftReady, prompt: "メモ", hue: 200, slug: "a1",
    regenKeys: new Set<string>(), sections: [], imageInstructions: {}, revising: false,
    onBack: vi.fn(), onTabChange: vi.fn(), onApprove: vi.fn(), onRevise: vi.fn(), onReject: vi.fn(),
    onRevert: vi.fn(), onEdit: vi.fn(), onPickEyecatch: vi.fn(), onRegenEyecatch: vi.fn(),
    onPickBodyImage: vi.fn(), onRegenBodyImage: vi.fn(), onAddComment: vi.fn(), onRemoveComment: vi.fn(),
    onUpdateImage: vi.fn(), onRequestOutlineRevise: vi.fn(), onSaveMeta: vi.fn(),
    ...over,
  };
  render(<DetailPanel {...props} />);
  return props;
}

describe("DetailPanel(2段タブ)", () => {
  it("クラスタ tablist(構成案/プレビュー/素材)を出す", () => {
    setup();
    expect(screen.getByRole("tab", { name: /構成案/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /プレビュー/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /素材/ })).toBeInTheDocument();
  });
  it("クラスタ切替で onTabChange(リーフ) を呼ぶ", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("tab", { name: /構成案/ }));
    expect(p.onTabChange).toHaveBeenCalledWith("outline");
  });
  it("素材クラスタは子タブ(画像/プロンプト)を出す", async () => {
    const p = setup({ tab: "images" });
    // 素材クラスタ選択中は内訳 tablist が出る
    expect(screen.getByRole("tablist", { name: /素材の内訳/ })).toBeInTheDocument();
  });
  it("footer: 承認/却下/AIに相談を出し、AIに相談で onRevise", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /AIに相談/ }));
    expect(p.onRevise).toHaveBeenCalled();
  });
  it("draft_review は『構成からやり直す』を出し onRevert", async () => {
    const p = setup({ stage: "draft_review" });
    await userEvent.click(screen.getByRole("button", { name: /構成からやり直す/ }));
    expect(p.onRevert).toHaveBeenCalled();
  });
  it("block チェックがあると承認ボタンが無効", () => {
    // 免責文なし＝block。draftReady.body に免責文が無いので AI免責文=block になる想定。
    setup({ stage: "draft_review" });
    expect(screen.getByRole("button", { name: /承認して公開予約|構成案を承認/ })).toBeDisabled();
  });
  it("published/scheduled は公開済みバッジで主操作を出さない", () => {
    setup({ stage: "published", item: pi({ stage: "published" }) });
    expect(screen.getByText("公開済み")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AIに相談/ })).not.toBeInTheDocument();
  });
  it("editing で編集中バッジを出す(DraftEditWorkspace は描画しない)", () => {
    setup({ editing: true });
    expect(screen.getByText("編集中")).toBeInTheDocument();
  });
  it("consultSentenceMode で inlineComments を前面に出す", () => {
    setup({ consultSentenceMode: true, inlineComments: <div>行コメントUI</div> });
    expect(screen.getByText("行コメントUI")).toBeInTheDocument();
  });
  it("onBack で一覧へ戻る(モバイル)", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: /一覧/ }));
    expect(p.onBack).toHaveBeenCalled();
  });
});
```
（`block チェック` テストは免責文なし本文で `draftQuality` が block を返す前提。draftReady の body に免責文を含めないことで block を作る。承認無効の検証。DetailPanel は Task 9 で exclude するため、この test は「主要分岐が壊れていない」ことの担保＝exclude 後も残す。）

Run: `npx vitest run src/app/growth/approve/DetailPanel.test.tsx` → PASS。

- [ ] **Step 3: ApproveClient.tsx を結線差し替え**

1. import: 新 `DetailPanel`（`./DetailPanel`）・`useConsult`・`ConsultDrawer`/`ConsultComposer`（DetailPanelView から移設）・`InlineCommentReview`・`deriveBoardStage`・`countByLevel`（DetailPanel 内で使うなら不要）・`ImageInstruction`（imageIntentTypes）・`DetailTab`・`outline.ts` parse。`DetailPanelView`/`DetailHeader`/`DraftChecklist` の import を削除。
2. state 追加: `detailTab`/`imageInstructions`（activeId 変化でリセット）。`useConsult` を renderDetailPanel 近傍で生成（`item=activeItem`・`draft`・`onReloadDraft`・`revise`）。
3. `renderDetailPanel(item)` を新 `DetailPanel` 呼び出しへ差し替え（上記 Interfaces に全 props 結線）。`sections`＝outline parse＋`revise.draftComments`、`hypothesis`＝`item.hypothesis`、`onAddComment`＝`revise.saveComment` 系、`onRequestOutlineRevise`＝`() => void revise.requestRevise(item)`、`onRevise`＝`consult.openDrawer`、`inlineComments`＝ready 時 `<InlineCommentReview pageId token bodyHtml onChanged />`、`consultSentenceMode`＝`consult.mode === "sentence" && consult.open`、`onApprove/onReject`＝`decideFromPanel`、`onRevert`＝`() => openConfirm(item,"revert")`、`onEdit`＝`() => startEditDraft(draft.bodyHtml)`、`onSaveMeta`＝Step 1 で確定した保存経路、`regenKeys`＝Step 1 で確定、画像 picker ハンドラ＝Step 1 で確定。
4. ConsultDrawer/ConsultComposer を ApproveClient から描画（DetailPanelView が持っていた分を移設・現行 props のまま）。
5. `renderEditWorkspace`（TipTap 全画面 overlay）は不変。

- [ ] **Step 4: 型・lint・移設対象外テスト緑を確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint src/app/growth/approve/`（0）/ `npx vitest run src/app/growth/approve/ApproveClient.test.tsx`（**詳細パネル/チェックリスト/プレビュー/相談に触れる describe は一時赤を許容・それ以外は緑**。赤が移設対象に限ることを確認＝新結線の回帰を出していない）。

> コミット時点で ApproveClient.test.tsx の一部が赤。**Task 9 と連続実行**し Task 9 完了で全緑＋カバレッジ 100% に到達させる。

- [ ] **Step 5: Commit**
```bash
git add src/app/growth/approve/DetailPanel.tsx src/app/growth/approve/DetailPanel.test.tsx src/app/growth/approve/ApproveClient.tsx
git commit -m "feat(growth): 詳細パネルを proto 2段タブ DetailPanel へ置換し ApproveClient を結線（テスト移設は次タスク）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 9: 旧サーフェス撤去・テスト移設・coverage.exclude 再整理・全体ゲート

**Files:**
- Modify: `src/app/growth/approve/ApproveClient.test.tsx`（詳細系 describe を新 DetailPanel 構造へ移設）
- Delete: `src/app/growth/approve/DetailPanelView.tsx`・`src/app/growth/approve/DetailHeader.tsx`・`src/app/growth/approve/DraftChecklist.tsx`・`src/app/growth/approve/DraftPreviewPane.tsx`
- Delete（co-located テスト）: `DetailHeader.test.tsx`・`DraftChecklist.test.tsx`（存在すれば）。`DetailPanelView`/`DraftPreviewPane` の co-located テストがあれば撤去。
- Modify: `vitest.config.ts`（`coverage.exclude` へ proto presentation 5 file 追記・旧 file の記述は元々無いので削除不要）
- Modify: `docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md`（AD5-2/AD5-4/AD5-5 の縮約理由を P3b 反映で追記）

**設計判断（research §8・カバレッジ再整理・確定）:**
- **exclude 追記（5 file・presentation）**: `DetailPanel.tsx`（2段タブ版）・`DetailViews.tsx`・`OutlineView.tsx`・`QualityChecklist.tsx`・`DevicePreview.tsx`。各行に既存様式のコメントを付す（下記 Step 3）。
- **exclude しない（純ロジック・グルー）**: `draftQuality.ts`（countByLevel 含む）・`src/lib/growth/imageIntent.ts`・`imageIntentTypes.ts`（型のみ・実行コード無し）・`mediaLibrary.ts`・`excerptDraft.ts`。画像サブ部品（ActionInput/ActionSuggestions/HouseStylePreview/ImageSlot/ImageStateToggle/ImagePlanBanner/ImageDirector）は **exclude せず OutlineView.test.tsx で 100% 到達**（Task 6 で担保）。`InlineCommentReview.tsx` は既に exclude 済（変更なし）。
- **被覆構造の付け替え**: 旧 `DetailPanelView`/`DetailHeader`/`DraftChecklist`/`DraftPreviewPane` は現在 exclude されておらず ApproveClient.test.tsx 等でカバー済 → 撤去する。これらを参照する ApproveClient.test.tsx の describe を新 DetailPanel 構造へ移設し、旧 co-located テスト（`DetailHeader.test.tsx`/`DraftChecklist.test.tsx`）を削除。
- **テスト移設（詳細系 describe）**: 旧「詳細を開く→3カラム(insight/checklist/draftPreview/reviseSection)」→「右ペインに DetailPanel(2段タブ)」へ。role/文言を新構造へ:
  - チェックリスト検証（旧 `DraftChecklist`）→ DetailPanel footer の `QualityChecklist`（`公開前チェック`・件数ピル・展開）。
  - 下書きプレビュー（旧 `DraftPreviewPane`/`DraftReadyView`）→ preview タブの `DevicePreview`（`プレビュー端末` tablist）。**注意**: 旧 `DraftReadyView`（EyecatchPicker/BodyImagePicker/DecorationAssistant/PublishCloseActions/編集/コピー）は proto DetailViews に**そのまま対応が無い**。P3b の DetailViews は preview=MetaEditor＋DevicePreview、images=EyecatchThumb＋再生成、公開操作=footer 承認。**旧 DraftReadyView が持っていた公開/クローズ/編集/コピー・EyecatchPicker/BodyImagePicker/DecorationAssistant の扱いは要判断**（下記 §DraftReadyView 依存の確定）。
  - タブ切替（proto クラスタ）・承認/却下/構成からやり直す/AIに相談・block 無効化を新 footer で検証。
- **検証強度の維持**: click→ハンドラ/API/トースト/URL/フォーカスの実フローを保つ。role 名・文言・起点だけ新構造へ。アサート内容は落とさない。正しく移設しても赤いテストは実装バグとして DetailPanel/ApproveClient を直す（テストを甘くしない）。

**§DraftReadyView 依存の確定（Task 9 Step 1 で精査・要メイン確認）:** 現行 `DraftReadyView` は EyecatchPicker/BodyImagePicker/DecorationAssistant/PublishCloseActions/編集/コピーを束ねる。proto DetailPanel は「images タブ＝アイキャッチ/本文画像の再生成」「footer＝承認」で公開系を代替するが、**DecorationAssistant（装飾提案 #147）・PublishCloseActions（公開/クローズの stage 別ボタン・#H23）・コピー**は proto DetailViews/footer に直接の対応が無い。**確定方針（過剰実装回避・実データ維持）:**
- `DecorationAssistant`（装飾提案）は P4 相談ドロワー（decorate は consult 系）or 別タブへ寄せる領域だが、P3b では **images タブ or preview タブの下部にそのまま併置**（再スキンは最小・機能維持）。または P4 まで images タブ内に現行 UI を残置（過渡状態）。
- `PublishCloseActions`（公開/クローズ）: proto footer の「承認して公開予約」が本番の「公開」に対応するが、本番の公開は `openConfirm(item,"publish")`（#H23 公開キュー経由 or 直接）。**P3b では footer の承認ボタンを現行の公開/承認ハンドラ（`decideFromPanel`＝pull型の承認依頼）へ結線**し、`PublishCloseActions` の「閉じる（close）」は footer の却下 or 別導線へ。**厳密な公開フロー（stage 別 publish/close）は現行ロジックを壊さないよう、footer の onApprove を現行の承認経路にマップし、close 経路が必要なら onReject or 追加導線に割り当てる**（Task 8 Step 1 で現行 `decideFromPanel`/`openConfirm` のシグネチャを確認して確定）。
- `EyecatchPicker`/`BodyImagePicker`（実 media 差し替え・API）: proto ImagesView の「メディアから選ぶ」ボタン（`onPickEyecatch`/`onPickBodyImage`）を **現行 EyecatchPicker/BodyImagePicker の起動へ結線**。picker 本体 UI は現行を流用（P5 の MediaLibraryModal 統一まで）。**この結線が重い場合は、images タブ内に現行 EyecatchPicker/BodyImagePicker をそのまま併置**（proto の再生成ボタンは onRegen へ・差し替えは現行 picker）＝過渡状態として許容。
- 上記により **旧 `DraftReadyView.tsx` は撤去せず残置**（EyecatchPicker/BodyImagePicker/DecorationAssistant/PublishCloseActions の束ねとして images/preview タブから参照）か、束ねを解体して個別部品を DetailViews から呼ぶ。**Task 9 Step 1 で現行 DraftReadyView の各部品の再利用可否を精査し、撤去は DetailPanelView/DetailHeader/DraftChecklist/DraftPreviewPane の 4 file に限定**（DraftReadyView と配下の picker/assistant は P5 まで残置・過渡状態）。

- [ ] **Step 1: 現行 DraftReadyView 依存を精査し撤去範囲を確定**

`DraftReadyView`/`DraftPreviewPane`/`PublishCloseActions`/`EyecatchPicker`/`BodyImagePicker`/`DecorationAssistant` の参照を `grep -rn` で洗い、**撤去は `DetailPanelView.tsx`/`DetailHeader.tsx`/`DraftChecklist.tsx`/`DraftPreviewPane.tsx` の 4 file に限定**することを確定（DraftReadyView と配下 picker/assistant/PublishCloseActions は Task 8 の DetailViews/ImagesView から再利用または併置で残置＝P5 統合まで過渡）。`DraftPreviewPane` は `DevicePreview` が置換するため撤去、その参照元 `DraftReadyView` からは `DraftPreviewPane` を外し `DevicePreview` に差し替えるか、`DraftReadyView` 自体を preview タブから外す（DetailViews.PreviewView が DevicePreview を持つため `DraftReadyView` の preview 部分は不要）。**この分解を Step 2 で実装**。

- [ ] **Step 2: 移設対象テストを新構造へ書き換える（RED 駆動）＋旧 file 撤去**

1. ApproveClient.test.tsx の詳細系 describe（詳細オープン→内容・チェックリスト・プレビュー・承認/却下/構成やり直す・AIに相談・block 無効）を新 DetailPanel 構造（クラスタ tab・`公開前チェック`・`プレビュー端末`・footer ボタン）へ書き換え。
2. `DetailPanelView.tsx`/`DetailHeader.tsx`/`DraftChecklist.tsx`/`DraftPreviewPane.tsx` を削除。co-located テスト（`DetailHeader.test.tsx`/`DraftChecklist.test.tsx`）を削除。
3. `grep -rn "DetailPanelView\|DetailHeader\|DraftChecklist\|DraftPreviewPane" src` で残参照が無いことを確認（`DraftReadyView` が `DraftPreviewPane` を参照していれば Step 1 の分解で `DevicePreview` へ or 削除）。

Run: `npx vitest run src/app/growth/approve/ApproveClient.test.tsx` → 書き換えた describe が（Task 8 実装済のため）緑になることを確認。赤なら実装（DetailPanel/ApproveClient）を微修正（テストを甘くしない）。

- [ ] **Step 3: coverage.exclude 追記**

`vitest.config.ts` の `coverage.exclude` に既存様式で追記（consult/* の下あたり）:
```ts
        // #proto P3b 詳細パネル: 2段タブ/framer 直結の presentation。純ロジック(countByLevel)は draftQuality.ts でテスト済。
        "src/app/growth/approve/DetailPanel.tsx",
        // #proto P3b 詳細タブビュー: DOM 直結。メタ判定は excerptDraft.ts でテスト済。
        "src/app/growth/approve/DetailViews.tsx",
        // #proto P3b 構成案タブ: DOM 直結。画像指示の純ロジックは imageIntent.ts/mediaLibrary.ts でテスト済。
        "src/app/growth/approve/OutlineView.tsx",
        // #proto P3b 品質チェックリスト: framer(height 展開) 直結。件数集計は draftQuality.ts(countByLevel) でテスト済。
        "src/app/growth/approve/QualityChecklist.tsx",
        // #proto P3b デバイスプレビュー: ResizeObserver/iframe への薄い DOM 結線(高さ受信は縮約)。プレビュー整形は draftPreview.ts でテスト済。
        "src/app/growth/approve/DevicePreview.tsx",
```
**画像サブ部品（ActionInput/ActionSuggestions/HouseStylePreview/ImageSlot/ImageStateToggle/ImagePlanBanner/ImageDirector）・`mediaLibrary.ts`・`imageIntent.ts`・`imageIntentTypes.ts`・`draftQuality.ts` は exclude しない**（純ロジックは 100%・画像サブ部品は OutlineView.test.tsx で RTL 100% 到達）。

- [ ] **Step 4: 設計書 AD5 を P3b 反映で更新**

`design.md` の AD5 を更新（例）:
```
2. **画像指示サブシステム**: P3b で imageIntent 純ロジックを src/lib/growth/imageIntent.ts へ移植(100%テスト)・OutlineView の UI を移植。persist は当面セッション state に縮約(BE 無し)。フル persist(Notion スキーマ+API)は P3.5(BE)へ。
4. **generating の genProgress**: P3b では進捗% を出さず approve-shimmer 不定＋段階ラベル(generatingStep)に縮約。% surface は BE 追加後に差し替え。
5. **DevicePreview のタブレット**: P3b で 3端末(mobile/tablet/pc)を移植。iframe は本番 DraftPreviewFrame(postMessage で本文注入)・高さは端末別固定スケールに縮約(proto の postMessage 高さ受信は本番 frame が返さないため不採用)。
```

- [ ] **Step 5: 全体ゲート確認**

Run: `npx tsc --noEmit -p tsconfig.json`（PASS）/ `npx eslint .`（0）/ `npx vitest run --coverage`（全 PASS・グローバル statements/branches/functions/lines すべて 100%）。確認:
- 新規純ロジック（`draftQuality.countByLevel`・`imageIntent`・`mediaLibrary`）が 100% で計測対象（exclude しない）。
- 画像サブ部品 7 file が OutlineView.test.tsx で 100% 到達（exclude しない）。
- proto presentation 5 file が exclude 追記済み。
- `useConsult`（グルーフック）は exclude されず 100%（移設先 ApproveClient で生成しても useConsult.test.ts の 100% は不変）。
- 旧 `DetailPanelView`/`DetailHeader`/`DraftChecklist`/`DraftPreviewPane` 撤去で dead code・orphaned テストが残っていない。

- [ ] **Step 6: Commit**
```bash
git add -A src/app/growth/approve/ vitest.config.ts docs/superpowers/specs/2026-07-01-approve-proto-redesign-design.md
git status --short  # next-env.d.ts / node_modules を含まないこと
git commit -m "test(growth): 詳細パネル再スキンに伴うテスト移設・旧サーフェス撤去・coverage.exclude 再整理（100%維持）

Co-Authored-By: Claude Opus 4.8 noreply@anthropic.com"
```

---

### Task 10: フェーズ検証（動作確認観点の提示）

**Files:** なし。

- [ ] **Step 1: 最終ゲート再確認** — `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` / `npx vitest run --coverage` 全緑・100%。`git status` で未 push・`next-env.d.ts`/`node_modules` 非ステージ。

- [ ] **Step 2: 動作確認観点をユーザーへ提示（日本語）**
1. approve view 右ペインの詳細が **proto デザイン**（2段タブ・ダーク・StageChip/MetaStat ヘッダ・常駐フッター）になる。
2. タブが **構成案 / プレビュー / 素材（画像・プロンプト）** の 3 クラスタ＋子タブ。アクティブ下線が滑らかに移動（layoutId）。
3. **プレビュー**: 生成中は shimmer＋段階ラベル（進捗%は出さない＝縮約）／本文なしは空状態／完成はメタ編集（120字判定）＋**3端末デバイスプレビュー**（スマホ/タブレット/PC・本番 frame）。
4. **構成案**: 仮説カード（記入分のみ）＋コメント集約帯（コメントがあると「構成案の修正を依頼」有効）＋各セクションの行コメント＋**画像指示レーン**（オフ/おまかせ/指定・指定で ImageDirector）。**画像指示はセッション内のみ保持（縮約・保存はまだ）**。
5. **素材**: 画像タブ（アイキャッチ＋本文画像の再生成・差し替え）＋プロンプト（生成メモ・参照）。
6. フッターに **公開前チェック**（block/warn/ok 件数ピル・展開）。承認は block があると無効。承認/却下/構成からやり直す/AIに相談（相談ドロワーが開く＝見た目 skin は P4）。
7. 本文への行コメントが proto 見た目（ダーク・amber）で、実 API（AIに指摘を依頼）は従来どおり動く。
8. 予約公開済みは公開予約済みバッジ・公開済みは公開済みバッジ（主操作なし）。
9. 編集は従来どおり全画面 TipTap ワークスペース（overlay）。`prefers-reduced-motion` でアニメ抑制。

> ユーザーのブラウザ確認完了まで push しない。確認で修正が出たら該当タスクへ戻る。

---

## Self-Review

- **Spec coverage**:
  - §4 P3「DetailPanel(2段タブ・layoutId underline)」= Task 8。「DetailViews(プレビュー/メタ/画像)」= Task 5。「OutlineView(行コメント＋画像指示の骨格)」= Task 6。「QualityChecklist」= Task 3。「DevicePreview」= Task 4。「draftQuality/bodyBlocks 等を純ロジック化」= Task 1(countByLevel)/Task 2(imageIntent)＋既存 draftQuality/bodyComment/excerptDraft を再利用（重複実装回避）。
  - AD1（`--p-*` 維持・`approve-*` class）= 全移植 file で `proto-*`→`approve-*`・`--p-*` 維持。AD2（見た目 proto・データ本番フック）= 各 View を本番 props/フックへ結線（useDraftPreview/useReviseEditing/useDraftEditing/useConsult/useBodyCommentConsult）。AD3（純ロジック 100%・presentation exclude・グルーは除外せず）= Task 1/2/6(mediaLibrary)＋Task 9 の exclude 5 file・画像サブ部品は RTL 100%・useConsult 不変。AD4（BoardStage 写像）= DetailPanel が `deriveBoardStage`→BoardStage で decided/isReviewable/StageChip 判定。
  - AD5 縮約（Task 9 で設計書追記）: AD5-2 画像 persist=セッション state（フル persist は P3.5）・AD5-4 generating 進捗=shimmer＋段階ラベル・AD5-5 DevicePreview=本番 frame＋固定スケール（postMessage 高さ受信なし）＋タブレット追加。
  - disposition「詳細/編集」行: 編集=TipTap 全画面 overlay 維持（DetailPanel は編集中バッジのみ）・行コメント=InlineCommentReview 再スキン（proto InlineEditor 非移植）。
- **Placeholder scan**: 純ロジック（countByLevel/imageIntent）は実装/テスト全文を inline。presentation 移植は移植元パス＋具体 rename（`proto-`→`approve-`・import 先・型差し替え `Article`→本番 props・`OutlineSection`→`ImageOutlineSection`・`QualityLevel`→`CheckLevel`・`c.detail`→`c.hint`・`article.id` src→postMessage）で曖昧さなし（"similar to"/TBD なし）。**要精読で確定する箇所は明示**: `ArticleHypothesis` のフィールド対応（Task 6 Step 3 前）・`outline.ts` の parse export（Task 6/8）・onSaveMeta/regenKeys/画像 picker の現行実在（Task 8 Step 1）・DraftReadyView 依存の撤去範囲（Task 9 Step 1）。これらは「精読して確定・無ければ縮約 or 併置」の判断基準を明記済み（過剰実装回避）。
- **Type consistency**: `CheckLevel`/`QualityCheck`（draftQuality）→ QualityChecklist/DetailPanel 一致。`ImageMode`/`ImageInstruction`/`ImageOutlineSection`（imageIntentTypes）→ imageIntent/OutlineView/画像サブ部品/DetailPanel 一致。`BoardStage`（boardStage）→ DetailPanel/PreviewView 一致。`DraftState`/`DraftPreview`（draftTypes）→ DetailPanel/DetailViews 一致。`DetailTab`（4リーフ）→ DetailPanel/ApproveClient 一致。`PendingItem`/`ArticleHypothesis` 参照元一致。
- **メインが Self-Review で見るべき懸念**:
  1. **DraftReadyView 分解の波及**（Task 9 §DraftReadyView）: PublishCloseActions（#H23 公開フロー）・DecorationAssistant（#147）・EyecatchPicker/BodyImagePicker（実 media API）を proto DetailViews へどう収めるか。撤去を 4 file に限定し配下 picker/assistant は P5 まで残置＝過渡状態の妥当性。公開フロー（`decideFromPanel` vs `openConfirm(publish/close)`）のマッピングが現行ロジックを壊さないか（Task 8 Step 1 で要確認）。
  2. **画像 persist セッション縮約の UX**（AD5-2）: セッション state のみ＝リロードで消える。P3.5 BE までの過渡として許容か、outline トークン写像に相乗りすべきか（設計書では P3.5 へ切る判断・要追認）。
  3. **useConsult の移設先**（DetailPanelView 撤去に伴い ApproveClient へ）: consult 生成位置の変更で ConsultDrawer 描画・sentence モードの inlineComments 前面化が現行の相談フローを壊さないか（P4 前提との整合）。
  4. **footer チェックの styleChecks 非合流**（P3b は draftQuality のみ）: 文体チェック（StyleHints）をフッターに合流しない縮約の妥当性。
  5. **onSaveMeta の実保存経路**: ExcerptEditor 併置 vs 薄いハンドラ新設のどちらを採るか（沈黙 no-op 禁止）。
- **git 未変更**: 本セッションは read（コード読解）と本計画ファイル 1 件の Write のみ。ソース・設定・git ステージは未変更。
