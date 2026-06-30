# 施策インボックス 多種別化（OUTCOME ROUTER）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認画面プロトタイプ(`approve-proto`)の施策タブを「記事案専用」から、記事/サイト/イベント/その他の**多種別インボックス**へ拡張し、承認＝種別ごとの次工程への変換を「結末プレビュー」で可視化する。

**Architecture:** 種別 `proposalKind` を Article へ加算追加（未設定は `article` 扱い＝ゼロ破壊移行）。表示メタ `KIND_META` と承認アウトカム導出 `approveOutcomeFor` を純関数 `proposalKind.ts` に分離（テスト対象）。詳細の中段だけ種別で差し替える `ProposalDetailBody.tsx`（ConsultCard が status で本体を差し替える作法の兄弟版）。一覧グルーピング(pending/rejected/adopted)・master-detail・却下フローは温存。

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict / Tailwind v4 / Framer Motion / Vitest。

## Global Constraints

- 仕様書: `docs/superpowers/specs/2026-06-30-proposal-inbox-multikind-design.md`。
- 対象は `src/app/growth/approve-proto/` のみ。本番ロジック(`scripts/growth/*`・`src/lib/growth/*`・`src/app/[locale]/*`)・AI往復UI(ConsultDrawer 等)・記事承認フロー本体には**触れない**。
- TypeScript strict。`any` 禁止。型専用 import は `import type`。`React.FC` 禁止（関数宣言＋`XxxProps`）。`@ts-ignore` 禁止。イミュータブル更新のみ。
- **テスト方針**: Vitest はカバレッジ100%ゲート。istanbul は `all:true` 未設定なので**テストが import したファイルだけ**が計測対象。本計画で唯一テストするのは純関数 `proposalKind.ts`（import は型専用の `./types` のみ）で 100% にする。UI（ProposalView/ProposalDetailBody/ProposalFormModal/page.tsx/mockData.ts）はテストが import しない薄い結線として無計測（#proto 方針）。`vitest.config.ts` は変更しない。
- `proposalKind.ts` は**型専用 import 以外を持ち込まない**（reviseMock/bodyBlocks/icons 等を import しない。JSXアイコンは UI 側に置く）。
- 種別は **4種で確定**: `article` / `site` / `event` / `other`。
- 既存の `proposalStatus`(pending/rejected/adopted)・`proposalCategory`・`proposalRejectNote`・`evidence`・`hypothesis` は**温存**（hypothesis は article 専用として意味が明確化）。
- 確定アイコン（icons.tsx に実在を確認済み）: article=`IconFileText` / site=`IconLayout` / event=`IconCalendar` / other=`IconBolt`。色トークン: article=`--p-accent` / site=`--p-purple` / event=`--p-green` / other=`--p-text-3`。
- 承認アウトカムはプロトでは**トースト演出のみ**（バックエンド無し）。記事案だけ現状の記事化挙動を維持、他種別は `adopted` 化＋トーストのみ。`adopted` にも「未処理に戻す」を開放。
- Lint は `npx eslint <file>`（`next lint` は Next 16 で廃止・使用しない）。型チェックは `npx tsc --noEmit -p tsconfig.json`。
- コミットメッセージは Conventional Commits + 末尾 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。各コミットは対象ファイルを明示 `git add`。`next-env.d.ts`・`node_modules` は**絶対にステージしない**。push しない。

---

## Task 1: types.ts に ProposalKind ＋ 種別別 detail ＋ Article フィールド追加

**Files:**
- Modify: `src/app/growth/approve-proto/types.ts`

**Interfaces:**
- Produces: `ProposalKind`, `SiteProposalDetail`, `EventProposalDetail`、および `Article` の任意フィールド `proposalKind`/`siteDetail`/`eventDetail`/`freeNote`。既存 `Hypothesis`/`ReferenceLink`/`ProposalStatus` は無改変。

- [ ] **Step 1: 型を追加**

`types.ts` の `ProposalStatus`（`export type ProposalStatus = ...`）の直後に追加:

```ts
/** 施策の種別＝承認後アウトカムのルーティング先。未設定は "article" 相当（欠落耐性・後方互換）。 */
export type ProposalKind = "article" | "site" | "event" | "other";

/** proposalKind==="site" の詳細。参考は既存 Article.refs を流用するため新型は足さない。 */
export interface SiteProposalDetail {
  /** 何を変えるか。 */
  whatChange: string;
  /** どこを（例: ヒーローセクション）。 */
  whereTarget?: string;
  /** なぜ。 */
  whyReason?: string;
}

/** proposalKind==="event" の詳細。 */
export interface EventProposalDetail {
  /** いつ（"7月中旬" 等の自由文・断定しない）。 */
  whenLabel: string;
  /** 対象。 */
  audience?: string;
  /** 形式。 */
  format?: string;
  /** 想定人数（自由文）。 */
  capacity?: string;
}
```

`Article` interface の proposal 系フィールド（`proposalStatus?` などがある箇所）に追記:

```ts
  /** 施策の種別。未設定は "article"（ゼロ破壊移行）。 */
  proposalKind?: ProposalKind;
  /** proposalKind==="site" のとき。 */
  siteDetail?: SiteProposalDetail;
  /** proposalKind==="event" のとき。 */
  eventDetail?: EventProposalDetail;
  /** proposalKind==="other" の自由記述。 */
  freeNote?: string;
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS（追加のみ・既存無改変）

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/types.ts
git commit -m "feat(growth): 施策の種別(ProposalKind)と種別別detail型を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: proposalKind.ts（純関数）＋ テスト（TDD・100%）

**Files:**
- Create: `src/app/growth/approve-proto/proposalKind.ts`
- Test: `src/app/growth/approve-proto/proposalKind.test.ts`

**Interfaces:**
- Consumes: `ProposalKind` from `./types`（型専用）。
- Produces:
  - `KIND_META: Record<ProposalKind, { label: string; tone: string }>`（tone は CSS 変数文字列）
  - `approveOutcomeFor(kind?: ProposalKind): ApproveOutcome`（既定 `article`）、`ApproveOutcome = { buttonLabel; preview; toast; done }`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/growth/approve-proto/proposalKind.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { approveOutcomeFor, KIND_META } from "./proposalKind";
import type { ProposalKind } from "./types";

describe("proposalKind: KIND_META", () => {
  it("4種別すべてに label と tone がある", () => {
    const kinds: ProposalKind[] = ["article", "site", "event", "other"];
    for (const k of kinds) {
      expect(KIND_META[k].label.length).toBeGreaterThan(0);
      expect(KIND_META[k].tone).toMatch(/^var\(--p-/);
    }
  });
});

describe("proposalKind: approveOutcomeFor", () => {
  it("article は記事化のラベル/結末を返す", () => {
    const o = approveOutcomeFor("article");
    expect(o.buttonLabel).toBe("承認して記事化");
    expect(o.preview).toBe("記事ドラフト生成キュー");
    expect(o.toast).toContain("記事生成パイプライン");
    expect(o.done).toContain("記事生成パイプライン");
  });

  it("site は実装タスク化", () => {
    expect(approveOutcomeFor("site").buttonLabel).toBe("承認して実装タスク化");
    expect(approveOutcomeFor("site").preview).toBe("実装タスク");
  });

  it("event は開催準備", () => {
    expect(approveOutcomeFor("event").buttonLabel).toBe("承認して開催準備へ");
    expect(approveOutcomeFor("event").preview).toBe("開催準備タスク");
  });

  it("other はタスク化", () => {
    expect(approveOutcomeFor("other").buttonLabel).toBe("承認してタスク化");
    expect(approveOutcomeFor("other").preview).toBe("タスク");
  });

  it("未指定は article にフォールバックする", () => {
    expect(approveOutcomeFor()).toEqual(approveOutcomeFor("article"));
  });
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npx vitest run src/app/growth/approve-proto/proposalKind.test.ts`
Expected: FAIL（"Cannot find module './proposalKind'"）

- [ ] **Step 3: 実装**

`src/app/growth/approve-proto/proposalKind.ts`:

```ts
/**
 * 施策の種別メタ＋承認アウトカム導出(#proto・多種別化)。
 * 純関数のみ。型専用 import に保ち、JSXアイコンは UI 側(ProposalView/ProposalDetailBody)に置く。
 */
import type { ProposalKind } from "./types";

/** 種別の表示メタ。tone は CSS 変数（面は塗らず文字/アイコン色に使う）。 */
export const KIND_META: Record<ProposalKind, { label: string; tone: string }> = {
  article: { label: "記事", tone: "var(--p-accent)" },
  site: { label: "サイト", tone: "var(--p-purple)" },
  event: { label: "イベント", tone: "var(--p-green)" },
  other: { label: "その他", tone: "var(--p-text-3)" },
};

/** 承認したら何になるか（種別ごとに変わる出口）。 */
export interface ApproveOutcome {
  /** 承認ボタンのラベル。 */
  buttonLabel: string;
  /** 結末プレビューの送り先名（押す前の未来形）。 */
  preview: string;
  /** 承認後トースト。 */
  toast: string;
  /** adopted 表示用（過去形）。 */
  done: string;
}

/** 種別から承認アウトカムを導出。未設定は article。 */
export function approveOutcomeFor(kind: ProposalKind = "article"): ApproveOutcome {
  switch (kind) {
    case "site":
      return { buttonLabel: "承認して実装タスク化", preview: "実装タスク", toast: "実装タスクに登録しました", done: "実装タスクとして起票済み" };
    case "event":
      return { buttonLabel: "承認して開催準備へ", preview: "開催準備タスク", toast: "開催準備タスクを作成しました", done: "開催準備タスクとして登録済み" };
    case "other":
      return { buttonLabel: "承認してタスク化", preview: "タスク", toast: "タスクに登録しました", done: "タスクとして起票済み" };
    case "article":
    default:
      return { buttonLabel: "承認して記事化", preview: "記事ドラフト生成キュー", toast: "記事生成パイプラインに送りました", done: "記事生成パイプラインへ送出済み" };
  }
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `npx vitest run src/app/growth/approve-proto/proposalKind.test.ts`
Expected: PASS（全テスト）

- [ ] **Step 5: 100%カバレッジ確認**

Run: `npx vitest run src/app/growth/approve-proto/proposalKind.test.ts --coverage`
Expected: `proposalKind.ts` が statements/branches/functions/lines 100%。未到達があればテストを足す（コードは増やさない）。

- [ ] **Step 6: Commit**

```bash
git add src/app/growth/approve-proto/proposalKind.ts src/app/growth/approve-proto/proposalKind.test.ts
git commit -m "feat(growth): 施策の種別メタと承認アウトカム導出を純関数化(TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: mockData.ts に種別付きサンプル施策を追加

**Files:**
- Modify: `src/app/growth/approve-proto/mockData.ts`

**Interfaces:**
- Consumes: `ProposalKind`/`SiteProposalDetail`/`EventProposalDetail` from `./types`。

> 既存の施策モック（`proposalStatus: "pending"` を持つ Article）はそのまま＝`proposalKind` 未設定で article 扱いになる（ゼロ破壊）。これに加えて site/event/other を各1件足し、多種別の見た目を確認できるようにする。

- [ ] **Step 1: mockData.ts を読み、既存の施策エントリ（`proposalStatus: "pending"`）を把握**

`mockData.ts` 内で `proposalStatus: "pending"` を持つ Article を探す（無ければ page.tsx の MOCK_ARTICLES 元データを確認）。少なくとも1件は記事案として既存のはず。

- [ ] **Step 2: site / event / other のサンプルを各1件追加**

既存の施策エントリの近くに、同じ Article 形（必須フィールドを満たす）で3件追加。必須フィールドは既存エントリに合わせ、proposal 系は以下を設定（`hypothesis` は付けない）:

```ts
// --- サイト施策 ---
{
  id: "prop-site-1",
  title: "ヒーローのレイアウト変更",
  stage: "idea",
  score: 64,
  awaitingYou: false,
  updatedLabel: "1時間前",
  excerpt: "PCで予約ボタンがFV外。直帰率が高い。",
  keyword: "LP改善",
  hue: 270,
  wordCount: 0,
  readMinutes: 0,
  outline: [],
  prompt: "",
  refs: [{ title: "競合A の予約導線", source: "ref" }],
  bodyHtml: "",
  hasEyecatch: false,
  bodyImages: 0,
  decorations: 0,
  advice: { overall: 0, scores: [], strengths: [], fixes: [] },
  checklist: [],
  proposalStatus: "pending",
  proposalKind: "site",
  proposalCategory: "LP改善",
  evidence: ["直帰率 62%"],
  siteDetail: {
    whatChange: "ファーストビューを予約導線優先の縦構成に",
    whereTarget: "トップLP ヒーローセクション",
    whyReason: "PCで予約ボタンがFV外。直帰率が高い",
  },
},
// --- イベント施策 ---
{
  id: "prop-event-1",
  title: "初心者クリニックを7月開催",
  stage: "idea",
  score: 58,
  awaitingYou: false,
  updatedLabel: "2時間前",
  excerpt: "梅雨〜夏の体験申込の季節需要を取り込む。",
  keyword: "集客",
  hue: 140,
  wordCount: 0,
  readMinutes: 0,
  outline: [],
  prompt: "",
  refs: [],
  bodyHtml: "",
  hasEyecatch: false,
  bodyImages: 0,
  decorations: 0,
  advice: { overall: 0, scores: [], strengths: [], fixes: [] },
  checklist: [],
  proposalStatus: "pending",
  proposalKind: "event",
  proposalCategory: "集客",
  evidence: ["体験申込の季節需要"],
  eventDetail: {
    whenLabel: "7月中旬",
    audience: "初心者・未経験者",
    format: "屋内クリニック 90分",
    capacity: "12〜16名",
  },
},
// --- その他施策 ---
{
  id: "prop-other-1",
  title: "LINE友だち限定クーポン",
  stage: "idea",
  score: 52,
  awaitingYou: false,
  updatedLabel: "3時間前",
  excerpt: "初回体験者の再来店率を底上げする。",
  keyword: "CRM",
  hue: 30,
  wordCount: 0,
  readMinutes: 0,
  outline: [],
  prompt: "",
  refs: [],
  bodyHtml: "",
  hasEyecatch: false,
  bodyImages: 0,
  decorations: 0,
  advice: { overall: 0, scores: [], strengths: [], fixes: [] },
  checklist: [],
  proposalStatus: "pending",
  proposalKind: "other",
  proposalCategory: "CRM",
  evidence: ["友だち 2,400人"],
  freeNote: "初回体験者へ翌週リピート用のクーポンをLINEで配布。再来店率の底上げを狙う。",
},
```

> 注: 上記フィールドは既存エントリの必須項目に合わせること。`Article` に必須フィールドがあれば（例: 既存が `metaDescription` などを必ず持つ等）既存エントリに倣って補う。tsc が真実。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS（不足フィールドがあれば既存エントリに合わせて補完）

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve-proto/mockData.ts
git commit -m "feat(growth): 施策モックにサイト/イベント/その他の種別サンプルを追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: ProposalDetailBody.tsx（種別ポリモーフィックな詳細本体）

**Files:**
- Create: `src/app/growth/approve-proto/ProposalDetailBody.tsx`

**Interfaces:**
- Consumes: `Article` from `./types`。
- Produces: `ProposalDetailBody({ article }: { article: Article })` — `article.proposalKind ?? "article"` で4分岐し、中段本体だけを描画（ヘッダ/フッタは ProposalView 側）。却下理由ブロックは含めない（ProposalView 側の既存ロジックが担当）。
- 併せて種別→アイコンのマップ `KIND_ICON` を export（ProposalView のカード/ヘッダが再利用）。

- [ ] **Step 1: 作成**

現状 ProposalView の hypothesis グリッド（ラベル `text-[10.5px]` color `--p-text-3` ／ 値 `text-[12.5px]` color `--p-text-2`）と同じ言語で各 kind を描く。

```tsx
/**
 * 施策詳細の本体(#proto・多種別化): proposalKind で中段だけ差し替える。
 * ConsultCard が status で本体を差し替えるのと対称。ヘッダ/フッタ/却下理由は ProposalView 側。
 */
"use client";

import { IconBolt, IconCalendar, IconFileText, IconLayout } from "./icons";
import type { Article, ProposalKind } from "./types";

/** 種別→アイコン（JSXは純モジュール proposalKind.ts に置けないのでここで持つ）。 */
export const KIND_ICON = {
  article: IconFileText,
  site: IconLayout,
  event: IconCalendar,
  other: IconBolt,
} as const satisfies Record<ProposalKind, (p: { size?: number }) => React.ReactElement>;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
      <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{value}</div>
    </div>
  );
}

export function ProposalDetailBody({ article }: { article: Article }) {
  const kind = article.proposalKind ?? "article";

  if (kind === "site") {
    const d = article.siteDetail;
    return (
      <div className="flex flex-col gap-3">
        {d?.whatChange && <Field label="何を変える" value={d.whatChange} />}
        {d?.whereTarget && <Field label="どこを" value={d.whereTarget} />}
        {d?.whyReason && <Field label="なぜ" value={d.whyReason} />}
        {article.refs.length > 0 && (
          <div>
            <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>参考</div>
            <div className="mt-1 flex flex-col gap-1">
              {article.refs.map((r) => (
                <span key={r.source} className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>↗ {r.title}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (kind === "event") {
    const d = article.eventDetail;
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {d?.whenLabel && <Field label="いつ" value={d.whenLabel} />}
        {d?.audience && <Field label="対象" value={d.audience} />}
        {d?.format && <Field label="形式" value={d.format} />}
        {d?.capacity && <Field label="想定人数" value={d.capacity} />}
      </div>
    );
  }

  if (kind === "other") {
    return article.freeNote ? (
      <div className="text-[13px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>{article.freeNote}</div>
    ) : null;
  }

  // article: 既存 hypothesis グリッドを移植
  return article.hypothesis ? (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
      <Field label="記事タイプ" value={article.hypothesis.articleType} />
      <Field label="狙う読者" value={article.hypothesis.targetReader} />
      <Field label="検索意図" value={article.hypothesis.searchIntent} />
      <Field label="勝ち筋" value={article.hypothesis.winningAngle} />
      <Field label="成功指標" value={article.hypothesis.successMetric} />
      <Field label="想定CTA" value={article.hypothesis.plannedCta} />
    </div>
  ) : null;
}
```

> `Hypothesis` の実フィールド名は `types.ts` で確認して合わせる（articleType/targetReader/searchIntent/winningAngle/successMetric/plannedCta）。

- [ ] **Step 2: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/growth/approve-proto/ProposalDetailBody.tsx`
Expected: PASS（`satisfies` の型不一致が出たら、KIND_ICON の型注釈を `Record<ProposalKind, (p: { size?: number }) => React.ReactElement>` に合わせるか、`as const` のみにして利用側で `size` を渡す）

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve-proto/ProposalDetailBody.tsx
git commit -m "feat(growth): 施策詳細の種別ポリモーフィック本体 ProposalDetailBody を追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: ProposalView.tsx — 種別chip / 種別フィルタ / 詳細差し替え / 結末プレビュー / adopted reopen

**Files:**
- Modify: `src/app/growth/approve-proto/ProposalView.tsx`

**Interfaces:**
- Consumes: `KIND_META`/`approveOutcomeFor` from `./proposalKind`、`ProposalDetailBody`/`KIND_ICON` from `./ProposalDetailBody`。
- 既存 props（onApprove/onReopen/onReject/onActivate/onOpenForm）は不変。

> ProposalView を読み、以下を最小差分で適用する。グルーピング(`groups`)・master-detail・却下入力・active黄帯は無改修。

- [ ] **Step 1: 種別フィルタの state とフィルタ適用**

`useState` に `const [kindFilter, setKindFilter] = useState<ProposalKind | "all">("all");` を追加。一覧ヘッダ（「施策」＋「手動で追加」の行）の直下に、種別フィルタchip行を1段追加（`すべて / 記事 / サイト / イベント / その他`、各件数付き、既定=all、単一トグル）。`KIND_META` のラベルと件数（`proposals.filter(p => (p.proposalKind ?? "article") === k).length`）を使う。`groups` を作る前に `kindFilter !== "all"` なら `proposals` を種別で絞る（グルーピングは状態のまま）。

スタイルは既存の chip 作法（`ProposalFormModal` のカテゴリchip or `--p-bg-active`/`--p-bg-input` 系）に合わせ、選択中は `--p-accent` 枠 or `--p-bg-active`。

- [ ] **Step 2: カードに種別chipを追加**

一覧カード（現状 `title → proposalCategory chip → evidence chips`）の**タイトル行の前**に種別chipを足す。`const kind = p.proposalKind ?? "article"; const Icon = KIND_ICON[kind];`:

```tsx
<span className="inline-flex items-center gap-1 text-[11px] font-medium self-start" style={{ color: KIND_META[kind].tone }}>
  <Icon size={12} /> {KIND_META[kind].label}
</span>
```

色は文字/アイコンのみ（面は塗らない）。active 黄帯は現状のまま。

- [ ] **Step 3: 詳細ヘッダに種別chip、本体を ProposalDetailBody に差し替え**

詳細ヘッダ（category chip ＋ タイトル ＋ evidence の領域）の先頭に、一覧と同じ種別chip（`--p-bg-active` 地の pill でも良い）を追加。中段の `active.hypothesis` グリッド（現状 `{active.hypothesis && (<div className="grid ...">...6項目...</div>)}`）を **`<ProposalDetailBody article={active} />` の呼び出しに置換**。却下理由ブロック（`active.proposalStatus === "rejected" && active.proposalRejectNote`）は**そのまま残す**。

- [ ] **Step 4: 結末プレビュー行 ＋ 承認ボタンのラベル可変化**

フッタの非却下入力時の領域（現状「却下」＋「承認して記事化」ボタンの行）の**直上**に、結末プレビュー行を新設:

```tsx
{active.proposalStatus !== "rejected" && (() => {
  const kind = active.proposalKind ?? "article";
  const o = approveOutcomeFor(kind);
  const Icon = KIND_ICON[kind];
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-text-3)" }}>
      <span style={{ color: KIND_META[kind].tone, display: "inline-flex" }}><Icon size={13} /></span>
      承認すると <span style={{ color: KIND_META[kind].tone }}>{o.preview}</span> へ
    </div>
  );
})()}
```

承認ボタンのラベル「承認して記事化」を `approveOutcomeFor(active.proposalKind ?? "article").buttonLabel` に置換（地色 `--p-accent`・`A`・IconCheck・IconArrowRight は不変）。

- [ ] **Step 5: adopted reopen の開放**

現状フッタは `rejected` のみ「未処理に戻す」を出す。`adopted`（承認済み）でも `onReopen` ボタンを出す。adopted のときフッタに過去形の確定表示（`✓ {approveOutcomeFor(kind).done}` を `--p-green`/IconCheck で）＋「未処理に戻す」を表示する分岐を足す。

> 注: 現状 ProposalView は adopted を一覧 `ORDER`(pending/rejected) に含めず表示しない可能性がある。本タスクのスコープは「詳細を開いた adopted 施策のフッタ」。adopted を一覧に出すかは現状の `ORDER`/`groups` を変えない（YAGNI）。adopted のリカバリは主に承認直後の取り消し動線として機能すれば十分——もし現状 adopted が一覧から消えて選べないなら、この reopen 開放は「承認直後 activeId が残っている間」に効く。実装者は現状挙動を確認し、無理に一覧へ adopted を足さないこと（足すなら別タスク）。

- [ ] **Step 6: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/growth/approve-proto/ProposalView.tsx`
Expected: PASS（未使用 import の整理込み）

- [ ] **Step 7: 手動確認（ユーザー）**

dev サーバ（http://localhost:3001/growth/approve-proto → 施策タブ）で、種別chip・種別フィルタ・種別別詳細・結末プレビュー・承認ラベルの差し替えを確認（ユーザーがブラウザ確認）。

- [ ] **Step 8: Commit**

```bash
git add src/app/growth/approve-proto/ProposalView.tsx
git commit -m "feat(growth): 施策一覧/詳細を多種別化(種別chip・フィルタ・結末プレビュー・adopted reopen)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: page.tsx — 承認アウトカムの種別分岐 ＋ addProposal の種別ペイロード

**Files:**
- Modify: `src/app/growth/approve-proto/page.tsx`

**Interfaces:**
- Consumes: `approveOutcomeFor` from `./proposalKind`、型 `ProposalKind`/`SiteProposalDetail`/`EventProposalDetail` from `./types`。

- [ ] **Step 1: approveProposal を種別分岐に**

現状 `approveProposal`（`proposalStatus: "adopted"` にして「施策を承認 → ネタ案に追加しました」トースト）を、対象の `proposalKind ?? "article"` を見て分岐:
- 共通: 当該を `adopted` 化（`updatedLabel: "たった今"`）、`approveOutcomeFor(kind).toast` をトースト、次の pending へ `setActiveId`（現状ロジック踏襲）。
- article のみ: 現状の「ネタ案に追加」相当の挙動を維持（現状コードが記事化として何をしているか確認し、その意味を保つ。少なくともトースト文言は `approveOutcomeFor("article").toast`）。

```ts
const approveProposal = useCallback((id: string) => {
  const target = articles.find((a) => a.id === id);
  const kind = target?.proposalKind ?? "article";
  const goNext = proposals.find((p) => p.id !== id && p.proposalStatus === "pending");
  setArticles((prev) => prev.map((a) => (a.id === id ? { ...a, proposalStatus: "adopted", updatedLabel: "たった今" } : a)));
  pushToast("success", approveOutcomeFor(kind).toast);
  if (goNext) setActiveId(goNext.id);
}, [articles, proposals, pushToast]);
```

> `approveProposal` の依存配列に `articles` を追加（target 参照のため）。

- [ ] **Step 2: addProposal を種別ペイロード対応に**

`ProposalFormModal` の `onSubmit` ペイロードに種別と種別別 detail が増える（Task 7）。`addProposal` のシグネチャを拡張:

```ts
const addProposal = useCallback(
  (data: {
    kind: ProposalKind;
    title: string;
    category: string;
    note: string;
    siteDetail?: SiteProposalDetail;
    eventDetail?: EventProposalDetail;
    freeNote?: string;
  }) => {
    // ...既存の newProp 構築に以下を反映...
    // proposalKind: data.kind,
    // proposalCategory: data.category,
    // hypothesis は data.kind === "article" のときだけ付ける(他種別は付けない)
    // siteDetail/eventDetail/freeNote を data から反映
  },
  [pushToast]
);
```

既存 `addProposal` の `newProp` から、`hypothesis` は `data.kind === "article"` のときのみ設定し、他種別では `proposalKind` ＋ 対応 detail を設定する。`evidence: ["手動追加"]` 等の既存初期値は踏襲。

- [ ] **Step 3: 型チェック ＋ lint ＋ テスト**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/growth/approve-proto/page.tsx && npx vitest run src/app/growth/approve-proto`
Expected: PASS（proposalKind テスト緑、型/lint緑）

- [ ] **Step 4: Commit**

```bash
git add src/app/growth/approve-proto/page.tsx
git commit -m "feat(growth): 施策承認のアウトカムを種別分岐し、追加フォームの種別ペイロードに対応

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: ProposalFormModal.tsx — 種別セグメント ＋ 種別別フィールド

**Files:**
- Modify: `src/app/growth/approve-proto/ProposalFormModal.tsx`

**Interfaces:**
- Produces: `onSubmit` が `{ kind, title, category, note, siteDetail?, eventDetail?, freeNote? }` を渡す（Task 6 の `addProposal` シグネチャと一致）。

- [ ] **Step 1: 種別セグメントを最上部に追加**

フォーム本体の最上部（施策名の前）に種別セグメント（4 chip・既定=`article`）を追加。`const [kind, setKind] = useState<ProposalKind>("article");`。chip は既存カテゴリchipの作法（選択中=`--p-accent` 枠）。`KIND_META` のラベルを使ってよい（import）。

- [ ] **Step 2: 種別別フィールドを条件表示**

施策名（共通）の下に、`kind` で切り替わるフィールド群:
- `article`: 既存の カテゴリchip群（`CATEGORIES`）をこの分岐へ移設。
- `site`: 「何を変える *」`whatChange` / 「どこを」`whereTarget` / 「なぜ」`whyReason`（input/textarea）。
- `event`: 「いつ」`whenLabel` / 「対象」`audience` / 「形式」`format`（input）。
- `other`: 「内容」`freeNote`（textarea のみ）。

メモ（`note`・共通）は最下部に残す。各種別フィールドは state で保持。

- [ ] **Step 3: 送信ペイロードを組み立て**

`canSubmit` は `title.trim()` を基本に（site は `whatChange` 必須も加えてよい）。`onSubmit` に `kind` と、kind に応じた `siteDetail`/`eventDetail`/`freeNote` を詰めて渡す。`category` は article のとき選択値、他種別では空 or kind ラベル（汎用タグ運用）。

- [ ] **Step 4: 型チェック ＋ lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/growth/approve-proto/ProposalFormModal.tsx`
Expected: PASS

- [ ] **Step 5: 手動確認（ユーザー）**

施策タブ →「手動で追加」→ 種別を切替えてフィールドが変わり、追加後に一覧/詳細が種別表示になることを確認。

- [ ] **Step 6: Commit**

```bash
git add src/app/growth/approve-proto/ProposalFormModal.tsx
git commit -m "feat(growth): 施策追加フォームに種別セグメントと種別別フィールドを追加

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: フル検証**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/app/growth/approve-proto
npx vitest run
npx vitest run --coverage
```
Expected: 型/lint/全テスト緑、カバレッジ100%維持（`proposalKind.ts` が計測対象に入り100%、他 proto 無計測）。

- [ ] **Step 2: 手動受け入れ確認（ユーザー）**

4種別（記事/サイト/イベント/その他）が一覧で種別chip表示、フィルタで絞れ、詳細が種別ごとに切替り、承認の結末プレビュー＋ラベルが種別ごとに変わり、承認後トーストが種別文言になること。既存の記事案（kind 未設定）が従来通り article 扱いで動くこと。

---

## Self-Review（計画↔仕様の突合）

- **仕様 §10 データモデル（proposalKind/detail 加算追加）** → Task 1。✅
- **仕様 §5/§8 KIND_META・approveOutcomeFor 純関数分離** → Task 2（TDD・100%）。✅
- **仕様 §6 一覧（種別chip・フィルタ）** → Task 5 Step1-2。✅
- **仕様 §7 詳細ポリモーフィック** → Task 4 ＋ Task 5 Step3。✅
- **仕様 §7/§8 結末プレビュー・承認ラベル可変・adopted reopen** → Task 5 Step4-5。✅
- **仕様 §8 承認アウトカムの種別分岐（page）** → Task 6。✅
- **仕様 §9 追加フォームの種別選択** → Task 7。✅
- **仕様 §3 master-detail/状態グルーピング/却下フロー温存** → Task 5 は最小差分（groups 無改修）。✅
- **仕様 §11 テスト（純関数のみ・型専用import・カバレッジ波及なし）** → Task 2＋Global Constraints。✅

**型整合**: `approveOutcomeFor`/`KIND_META`（Task2）と利用側（Task5/6/7）、`KIND_ICON`（Task4）と ProposalView（Task5）、`addProposal` ペイロード（Task6）と `ProposalFormModal.onSubmit`（Task7）の形が一致。✅

**実装者向け注意**:
- `Hypothesis` の実フィールド名は types.ts で確認（articleType/targetReader/searchIntent/winningAngle/successMetric/plannedCta）。
- mockData の新規エントリは `Article` の必須フィールドを既存エントリに倣って全て満たす（tsc が真実）。
- `KIND_ICON` の `satisfies` で型衝突したら型注釈を緩めて利用側で size を渡す。
- adopted を一覧へ出すかは本計画では変えない（reopen は詳細フッタのスコープ）。
