# CTA インライン編集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グロース下書きの CTA を構造化ノード化し、手動リッチエディタと AI インライン指示（#182）の両方から文言・リンク先・一次/二次・追加削除を編集可能にする。

**Architecture:** CTA の parse/serialize/検証/宛先プリセットを DOM 非依存の純ロジック（`scripts/growth/ctaBlock.ts` ＋ `src/lib/growth/ctaBlock.ts` 再export）に集約し、headless（AI ループ）とエディタ UI の双方から使う。エディタ UI は TipTap カスタムノード（`DraftEditor.tsx`、カバレッジ除外）で純ロジックに委譲。AI は既存 #182 の pull ループ（`bodyComment.ts` / `comment-revise-cli.ts`）を CTA 対応に拡張し、反映は人間採用を経る。

**Tech Stack:** TypeScript(strict) / Vitest + RTL / TipTap(ProseMirror) / Next.js App Router / 既存サニタイザ `@/lib/news/sanitize`。

## Global Constraints

- `strict: true`・`any` 禁止（`unknown`＋narrowing）・`import type` 使用・`@ts-ignore` 禁止（`@ts-expect-error`＋説明のみ最終手段）。
- カバレッジ **All files 100%**（statements/branches/functions/lines）。**除外リスト追加・`istanbul ignore` 追加・防御コード削除・`.only`/`.skip`・テスト削除でカバレッジを繕うことを禁止**。純ロジックは実テストで 100%。UI（`DraftEditor.tsx`）は既存慣例どおり `vitest.config.ts` の除外済み（追加不要）。
- 純ロジックは `scripts/growth/*.ts` に実装し `src/lib/growth/*` で再export（headless 共有）。CLI/`DraftEditor.tsx`/`run.mjs`/gen-* はカバレッジ除外。
- サニタイザは `cta` / `cta--ghost` クラスを許可済み（`src/lib/news/sanitize.ts`）。変更不要。
- 予約 URL は 2026年7月時点 RESERVA `https://reserva.be/tpbt`、8月以降 labola へ切替予定（手動）。CTA 宛先の単一ソースを `ctaBlock.ts` の `CTA_DESTINATIONS` に置き、切替点をコメントで明示する。
- 未確定情報の断定禁止（`facility-context.json` の `doNotWrite`）。AI 経由の URL 変更は人間採用必須。
- git push は `ttmakhr1028ai-art` アカウント。コミットはユーザーの動作確認後（各 Phase 単位でレビュー）。

---

## File Structure

- Create `scripts/growth/ctaBlock.ts` — CTA 純ロジック（型・parse・serialize・宛先プリセット・validate）。
- Create `src/lib/growth/ctaBlock.ts` — 上記の再export（アプリからの import 口）。
- Create `src/app/growth/approve/ctaBlock.test.ts` — 純ロジックのテスト（`@/lib/growth/ctaBlock` 経由・往復にサニタイザを使うため node 環境）。
- Modify `src/app/growth/approve/DraftEditor.tsx` — CTA カスタムノード／nodeView／ツールバー「CTA挿入」追加、`PRESERVE_SELECTORS` から `div.cta` 除去（カバレッジ除外）。
- Modify `scripts/growth/bodyComment.ts` — `extractReviewLines` を CTA 対応（CTA をコメント可能行にする）。
- Modify `src/app/growth/approve/bodyComment.test.ts`（無ければ該当既存テスト）— CTA 行のテスト追加。
- Modify `scripts/growth/prompts/*comment-revise*` プロンプト — CTA 変更ルール追記。
- Modify `scripts/growth/comment-revise-cli.ts` — CTA 提案の適用結線（`serializeCta` 使用・カバレッジ除外）。

---

## Phase 1 — CTA 純ロジック（`ctaBlock.ts`）

### Task 1: CTA 型・parse（`<a class="cta">` / `cta--ghost` / `div.cta` 吸収）

**Files:**
- Create: `scripts/growth/ctaBlock.ts`
- Create: `src/lib/growth/ctaBlock.ts`
- Test: `src/app/growth/approve/ctaBlock.test.ts`

**Interfaces:**
- Produces: `type CtaVariant = "primary" | "ghost"`, `interface Cta { label: string; href: string; variant: CtaVariant }`, `parseCta(html: string): Cta | null`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseCta } from "@/lib/growth/ctaBlock";

describe("parseCta", () => {
  it("一次CTA(<a class=\"cta\">)を構造化する", () => {
    expect(parseCta('<a class="cta" href="https://reserva.be/tpbt">今すぐ予約する</a>'))
      .toEqual({ label: "今すぐ予約する", href: "https://reserva.be/tpbt", variant: "primary" });
  });
  it("二次CTA(cta--ghost)は variant=ghost", () => {
    expect(parseCta('<a href="/#contact" class="cta cta--ghost">お問い合わせ</a>'))
      .toEqual({ label: "お問い合わせ", href: "/#contact", variant: "ghost" });
  });
  it("p でラップされていても中の a.cta を拾う", () => {
    expect(parseCta('<p><a class="cta" href="https://x">予約</a></p>')?.href).toBe("https://x");
  });
  it("旧 div.cta ラッパも吸収する(後方互換)", () => {
    expect(parseCta('<div class="cta"><a href="https://y">予約</a></div>')?.href).toBe("https://y");
  });
  it("CTAでないHTMLは null", () => {
    expect(parseCta("<p>本文</p>")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: FAIL（`parseCta` 未定義）

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/growth/ctaBlock.ts
export type CtaVariant = "primary" | "ghost";

export interface Cta {
  label: string;
  href: string;
  variant: CtaVariant;
}

/** CTA の <a class="cta[ cta--ghost]" href>label</a>(p/div.cta ラップ可)を構造化する。CTA でなければ null。 */
export function parseCta(html: string): Cta | null {
  const anchor = html.match(/<a\b[^>]*\bclass=("[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/a>/i);
  if (!anchor) return null;
  const classes = anchor[1].slice(1, -1);
  if (!/\bcta\b/.test(classes)) return null;
  const tag = anchor[0];
  const hrefMatch = tag.match(/\bhref=("([^"]*)"|'([^']*)')/i);
  const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
  const label = anchor[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const variant: CtaVariant = /\bcta--ghost\b/.test(classes) ? "ghost" : "primary";
  return { label, href, variant };
}
```

```ts
// src/lib/growth/ctaBlock.ts
/** CTA 構造化の純ロジック再エクスポート。実装は scripts/growth/ctaBlock.ts(headless 共有)。 */
export * from "../../../scripts/growth/ctaBlock";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/growth/ctaBlock.ts src/lib/growth/ctaBlock.ts src/app/growth/approve/ctaBlock.test.ts
git commit -m "feat(growth): CTA構造化ロジック parseCta を追加"
```

### Task 2: serializeCta（正準HTMLへ直列化・サニタイザ往復維持）

**Files:**
- Modify: `scripts/growth/ctaBlock.ts`
- Test: `src/app/growth/approve/ctaBlock.test.ts`

**Interfaces:**
- Consumes: `Cta`, `CtaVariant`。
- Produces: `serializeCta(cta: Cta): string`（`<a class="cta[ cta--ghost]" href="...">label</a>` を返す）。

- [ ] **Step 1: Write the failing test**

```ts
import { serializeCta, parseCta } from "@/lib/growth/ctaBlock";
import { sanitizeDraftHtml } from "./draftEditorContent";

describe("serializeCta", () => {
  it("一次CTAを正準HTMLにする", () => {
    expect(serializeCta({ label: "予約する", href: "https://reserva.be/tpbt", variant: "primary" }))
      .toBe('<a class="cta" href="https://reserva.be/tpbt">予約する</a>');
  });
  it("二次CTAは cta--ghost を付ける", () => {
    expect(serializeCta({ label: "問い合わせ", href: "/#contact", variant: "ghost" }))
      .toBe('<a class="cta cta--ghost" href="/#contact">問い合わせ</a>');
  });
  it("HTML特殊文字をエスケープする", () => {
    expect(serializeCta({ label: "A & B <x>", href: 'https://x?q="1"', variant: "primary" }))
      .toBe('<a class="cta" href="https://x?q=&quot;1&quot;">A &amp; B &lt;x&gt;</a>');
  });
  it("サニタイザ往復で class/href が残る(parse⇔serialize安定)", () => {
    const cta = { label: "予約", href: "https://reserva.be/tpbt", variant: "ghost" as const };
    const round = parseCta(sanitizeDraftHtml(serializeCta(cta)));
    expect(round).toEqual(cta);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: FAIL（`serializeCta` 未定義）

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/growth/ctaBlock.ts に追記
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cta を正準 CTA HTML に直列化する。サニタイザ(STRICT)往復で保持される形。 */
export function serializeCta(cta: Cta): string {
  const cls = cta.variant === "ghost" ? "cta cta--ghost" : "cta";
  return `<a class="${cls}" href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: PASS（サニタイザ往復含む）

- [ ] **Step 5: Commit**

```bash
git add scripts/growth/ctaBlock.ts src/app/growth/approve/ctaBlock.test.ts
git commit -m "feat(growth): serializeCta と往復安定性テストを追加"
```

### Task 3: 宛先プリセット `CTA_DESTINATIONS` ＋ `validateCta`

**Files:**
- Modify: `scripts/growth/ctaBlock.ts`
- Test: `src/app/growth/approve/ctaBlock.test.ts`

**Interfaces:**
- Produces:
  - `interface CtaDestination { key: string; label: string; url: string }`
  - `CTA_DESTINATIONS: readonly CtaDestination[]`
  - `validateCta(cta: Cta): { ok: boolean; errors: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { CTA_DESTINATIONS, validateCta } from "@/lib/growth/ctaBlock";

describe("CTA_DESTINATIONS", () => {
  it("予約は内部/reserveページ(RESERVA→labola切替を吸収)", () => {
    const reserve = CTA_DESTINATIONS.find((d) => d.key === "reserve");
    expect(reserve?.url).toBe("https://www.thepicklebang.com/reserve");
  });
  it("5宛先(予約/Instagram/アクセス/問い合わせ/トップ)を持つ", () => {
    expect(CTA_DESTINATIONS.map((d) => d.key).sort())
      .toEqual(["access", "contact", "instagram", "reserve", "top"]);
  });
});

describe("validateCta", () => {
  it("文言必須・href形式OKなら ok", () => {
    expect(validateCta({ label: "予約", href: "https://reserva.be/tpbt", variant: "primary" }))
      .toEqual({ ok: true, errors: [] });
  });
  it("文言が空なら error", () => {
    expect(validateCta({ label: "  ", href: "https://x", variant: "primary" }).ok).toBe(false);
  });
  it("内部アンカー(/#contact)も許可", () => {
    expect(validateCta({ label: "問い合わせ", href: "/#contact", variant: "ghost" }).ok).toBe(true);
  });
  it("不正な href(javascript:)は error", () => {
    const r = validateCta({ label: "x", href: "javascript:alert(1)", variant: "primary" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("リンク先の形式が不正です");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: FAIL（`CTA_DESTINATIONS`/`validateCta` 未定義）

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/growth/ctaBlock.ts に追記
export interface CtaDestination {
  key: string;
  label: string;
  url: string;
}

// CTA 宛先の単一ソース(canon)。予約は内部 /reserve ページ経由で RESERVA(7月)→labola(8月)の切替を吸収するため、
// 8月切替時に CTA URL を直す必要はない(/reserve 側が吸収)。
export const CTA_DESTINATIONS: readonly CtaDestination[] = [
  { key: "reserve", label: "予約", url: "https://www.thepicklebang.com/reserve" },
  { key: "instagram", label: "公式Instagram", url: "https://www.instagram.com/thepicklebangtheory/" },
  { key: "access", label: "アクセス（施設案内）", url: "https://www.thepicklebang.com/about" },
  { key: "contact", label: "問い合わせ", url: "https://www.thepicklebang.com/#contact" },
  { key: "top", label: "公式サイト", url: "https://www.thepicklebang.com/" },
];

/** CTA の文言必須・href 形式(http(s) 完全URL または内部パス/アンカー)を検証する。 */
export function validateCta(cta: Cta): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (cta.label.trim() === "") errors.push("文言を入力してください");
  const href = cta.href.trim();
  const valid = /^https?:\/\/\S+$/.test(href) || /^\/[^\s]*$/.test(href);
  if (!valid) errors.push("リンク先の形式が不正です");
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/growth/approve/ctaBlock.test.ts`
Expected: PASS

- [ ] **Step 5: Full coverage 確認（Phase 1 の純ロジック 100%）**

Run: `npx vitest run --coverage src/app/growth/approve/ctaBlock.test.ts`
Expected: `ctaBlock.ts` 100%（stmts/branch/func/lines）

- [ ] **Step 6: Commit**

```bash
git add scripts/growth/ctaBlock.ts src/app/growth/approve/ctaBlock.test.ts
git commit -m "feat(growth): CTA宛先プリセットとvalidateCtaを追加"
```

---

## Phase 2 — TipTap CTA ノード＋インライン編集 UI（`DraftEditor.tsx`・カバレッジ除外）

> このファイルは `vitest.config.ts` で除外済み。挙動はブラウザ検証で担保し、変換ロジックは Phase 1 の `ctaBlock.ts` に委譲する（`DraftEditor.tsx` に純ロジックを書かない）。

### Task 4: CTA ノード定義と `div.cta` の保持解除

**Files:**
- Modify: `src/app/growth/approve/DraftEditor.tsx`（`PreservedBlock`(240-271 付近)/`DecorationCallout`(299-) を手本）

**Interfaces:**
- Consumes: `parseCta`, `serializeCta`, `Cta`, `CtaVariant`（`@/lib/growth/ctaBlock`）。
- Produces: TipTap `Cta` ノード（name: `"cta"`, atom, attrs `{ label, href, variant }`）。

- [ ] **Step 1: `PRESERVE_SELECTORS` から `div.cta` を除去**

`DraftEditor.tsx` 71-77 の配列から `"div.cta",` を削除（CTA は保持専用でなく編集可能ノードにする）。

- [ ] **Step 2: `Cta` ノードを定義（`DecorationCallout` と同じ `Node.create` 様式）**

```tsx
const Cta = Node.create({
  name: "cta",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: "予約する" },
      href: { default: "https://reserva.be/tpbt" },
      variant: { default: "primary" as CtaVariant },
    };
  },
  parseHTML() {
    return [
      { tag: "a.cta", getAttrs: (el) => attrsFromEl(el as HTMLElement) },
      { tag: "div.cta", getAttrs: (el) => attrsFromEl(el as HTMLElement) },
    ];
  },
  renderHTML({ node }) {
    const cta: Cta = {
      label: String(node.attrs.label ?? ""),
      href: String(node.attrs.href ?? ""),
      variant: (node.attrs.variant === "ghost" ? "ghost" : "primary") as CtaVariant,
    };
    return htmlToDom(serializeCta(cta));
  },
  addNodeView() {
    return ReactNodeViewRenderer(CtaNodeView);
  },
});
```

`attrsFromEl` は要素の outerHTML を `parseCta` に渡して `{label,href,variant}` を得る薄いヘルパ。`htmlToDom` は `serializeCta` の文字列を DOMParser で ProseMirror の DOMOutputSpec に変換する薄いヘルパ（既存 `DecorationCallout.renderHTML` の返し方に合わせる）。

- [ ] **Step 3: エディタの `extensions` に `Cta` を登録**（`PreservedBlock`/`DecorationCallout` を追加している箇所と同じ配列に加える）。

- [ ] **Step 4: ブラウザ検証（Task 6 でまとめて実施）** — この時点では既存 CTA が保持ブロックでなく `cta` ノードとして読み込まれること、保存往復で壊れないことを Task 6 で確認する。

- [ ] **Step 5: Commit**

```bash
git add src/app/growth/approve/DraftEditor.tsx
git commit -m "feat(growth): CTAをTipTap編集可能ノード化(div.cta保持解除)"
```

### Task 5: CTA nodeView（インライン編集ポップオーバー）＋ツールバー「CTA挿入」

**Files:**
- Modify: `src/app/growth/approve/DraftEditor.tsx`（`PreservedBlockView`(151-) と装飾ポップオーバー(429-) を手本）

**Interfaces:**
- Consumes: `CTA_DESTINATIONS`, `validateCta`, `serializeCta`, `Cta`。
- Produces: `CtaNodeView`（React nodeView）、ツールバーの「CTA挿入」ボタン。

- [ ] **Step 1: `CtaNodeView` を実装**

ボタン表示（`serializeCta` の class に応じた見た目）＋クリックで開くインラインポップオーバー。フィールド:
- 文言: `<input>` → `updateAttributes({ label })`
- 宛先: `<select>`（`CTA_DESTINATIONS` の label ＋「自由URL…」）。選択で `href` を該当 url に。`自由URL…` 選択時は `<input>` で任意 href。確定 URL を下に表示。
- 種別: 一次/二次トグル → `updateAttributes({ variant })`
- 削除: `deleteNode()`
- 「完了」で `validateCta` を通し、error があればポップオーバー内に表示（保存はブロックしない＝下書きなので警告のみ）。

装飾ポップオーバー(#179)の dialog/フォーカストラップ/キーボード操作の様式を流用する（`role="dialog"`・Esc で閉じる・アクセシブルなラベル）。

- [ ] **Step 2: ツールバーに「CTA挿入」を追加**

装飾ボタン（452 付近）と同じ並びに配置。クリックで既定 CTA（予約・一次）を挿入して即編集状態にする:

```tsx
editor.chain().focus().insertContent({
  type: "cta",
  attrs: { label: "予約する", href: "https://reserva.be/tpbt", variant: "primary" },
}).run();
```

- [ ] **Step 3: Commit**

```bash
git add src/app/growth/approve/DraftEditor.tsx
git commit -m "feat(growth): CTAインライン編集ポップオーバーとCTA挿入ボタンを追加"
```

### Task 6: ブラウザ検証（手動編集フロー）

**Files:** なし（検証のみ）

- [ ] **Step 1: dev サーバ起動して `/growth/approve` の下書き編集を開く**（`preview_start` → 該当下書き）。
- [ ] **Step 2: 既存 CTA を含む下書きで、CTA がボタン表示され、クリックでポップオーバーが開くこと**を確認（`preview_snapshot`/`preview_screenshot`）。
- [ ] **Step 3: 文言変更・宛先変更(プリセット/自由URL)・一次⇄二次・削除・CTA挿入**の各操作を試し、保存→再読込で保持されることを確認。
- [ ] **Step 4: 保存本文が `<a class="cta[ cta--ghost]" href>…</a>` になっていること**を `preview_network`(draft/edit) で確認。

---

## Phase 3 — AI インライン指示（#182 拡張）

### Task 7: `extractReviewLines` で CTA をコメント可能行にする

**Files:**
- Modify: `scripts/growth/bodyComment.ts`（`extractReviewLines`(75-)、`splitTopLevelBlocks`）
- Test: 既存 `bodyComment` テスト（`src/app/growth/approve/bodyComment.test.ts` または `scripts` 側テスト。無ければ co-locate で新規）

**Interfaces:**
- Consumes: `parseCta`（`./ctaBlock`）。
- Produces: `extractReviewLines` が CTA ブロックを `{ blockIndex, tag: "cta", text: <CTA文言>, excerpt: <CTA文言>, commentable: true }` として返す。

- [ ] **Step 1: Write the failing test**

```ts
import { extractReviewLines, anchorExists } from "@/lib/growth/bodyComment";

describe("extractReviewLines CTA対応", () => {
  const body = '<p>本文</p><p><a class="cta" href="https://reserva.be/tpbt">今すぐ予約する</a></p>';
  it("CTAをコメント可能行として返す", () => {
    const lines = extractReviewLines(body);
    const cta = lines.find((l) => l.tag === "cta");
    expect(cta).toMatchObject({ tag: "cta", excerpt: "今すぐ予約する", commentable: true });
  });
  it("CTA文言をアンカーにコメントできる", () => {
    const cta = extractReviewLines(body).find((l) => l.tag === "cta")!;
    expect(anchorExists(body, cta.blockIndex, "今すぐ予約する")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run <bodyComment テストのパス>`
Expected: FAIL（CTA が commentable 行にならない）

- [ ] **Step 3: 実装**

`splitTopLevelBlocks` で得た各ブロックについて、`parseCta(block.outerHtml)` が非 null なら CTA 行（`tag:"cta"`, `text/excerpt:<label>`, `commentable:true`）を push する分岐を `extractReviewLines` に追加する。既存のテキストブロック分割ロジックは維持し、CTA は文分割せず1行にする。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run <bodyComment テストのパス>`
Expected: PASS

- [ ] **Step 5: full coverage で bodyComment.ts 100% 維持**

Run: `npx vitest run --coverage <bodyComment テストのパス>`
Expected: `bodyComment.ts` 100%

- [ ] **Step 6: Commit**

```bash
git add scripts/growth/bodyComment.ts <テストパス>
git commit -m "feat(growth): 本文コメント(#182)でCTAをコメント可能行にする"
```

### Task 8: comment-revise プロンプトに CTA 変更ルール追記

**Files:**
- Modify: `scripts/growth/prompts/`（comment-revise 用プロンプト md）

- [ ] **Step 1: プロンプトに CTA 変更ルールを追記**

- CTA 行（`tag:cta`）へのコメントには、文言 / 種別（一次=`cta` / 二次=`cta--ghost`）/ 宛先を変更してよい。
- 宛先は許可先（予約=`https://www.thepicklebang.com/reserve` / 公式Instagram / アクセス=`/about` / 問い合わせ=`/#contact` / 公式サイト）から選ぶか、必要なら任意 URL。ただし**未確定情報の断定禁止**。予約は内部 `/reserve` を使う（RESERVA→labola 切替を吸収するため raw RESERVA URL は使わない）。
- 出力する CTA HTML は正準形 `<a class="cta[ cta--ghost]" href="…">文言</a>`。
- 反映は人間採用を経る前提（AI は提案のみ）。

- [ ] **Step 2: style guide の予約URLを内部/reserveへ同期更新**

`docs/operations/growth-article-style.md` の §13(330行付近)・§15(353/360行付近) の予約導線記述を、外部 RESERVA `https://reserva.be/tpbt` から内部 `https://www.thepicklebang.com/reserve`（RESERVA→labola 切替を吸収）へ更新する。「予約導線は内部リンクではなく外部 CTA」の一文も、内部 `/reserve` を正とする記述へ改める。記事生成AIが今後 `/reserve` を使うようにするため。

- [ ] **Step 3: Commit**

```bash
git add scripts/growth/prompts/ docs/operations/growth-article-style.md
git commit -m "docs(growth): comment-reviseにCTA変更ルール追記、予約導線を内部/reserveへ更新"
```

### Task 9: comment-revise 適用パスで CTA を正準HTML化（CLI 結線・除外）

**Files:**
- Modify: `scripts/growth/comment-revise-cli.ts`（カバレッジ除外）

- [ ] **Step 1: 適用時、対象が CTA 行なら AI 提案を `Cta` へ解釈し `serializeCta` で本文へ差し込む**（自由文の本文置換ではなく CTA として整形）。既存のアンカー置換ロジックに、CTA 行のときだけ `serializeCta` を通す分岐を足す。純ロジック（解釈・整形）は `ctaBlock.ts` に寄せ、CLI は結線のみ。
- [ ] **Step 2: 実データ手動確認**（headless で CTA コメント→提案→採用→本文が正準 CTA になること）。この CLI は除外なので単体テストは書かず、`ctaBlock.ts` 側のロジックで担保する。
- [ ] **Step 3: Commit**

```bash
git add scripts/growth/comment-revise-cli.ts scripts/growth/ctaBlock.ts
git commit -m "feat(growth): comment-reviseの採用でCTAを正準HTML化"
```

---

## Phase 4 — 全体検証

### Task 10: 型・全テスト・カバレッジ・ブラウザ

- [ ] **Step 1:** `npx tsc --noEmit` → exit 0
- [ ] **Step 2:** `npx vitest run --coverage` → 全 pass ＆ All files 100%（除外リストは既存＋今回追加分のみ。`ctaBlock.ts`/`bodyComment.ts` は除外せず実テストで 100%）
- [ ] **Step 3:** `/growth/approve` で手動編集 4 操作＋AI インライン指示（CTA コメント→提案→採用）をブラウザ確認
- [ ] **Step 4:** ユーザー動作確認 → OK 後に `ttmakhr1028ai-art` で push、PR #192 に反映

---

## Self-Review

- **Spec coverage:** 手動4操作=Task 5、リンク先canon=Task 3(`CTA_DESTINATIONS`)、一次/二次=Task 1/2/5、追加削除=Task 5、AI拡張=Task 7-9、後方互換(div.cta)=Task 1/4、サニタイザ往復=Task 2、100%カバレッジ=Task 3/7/10。全要件に対応タスクあり。
- **Placeholder scan:** 宛先 URL は全て確定値（予約=`/reserve`・Instagram・アクセス=`/about`・問い合わせ=`/#contact`・トップ）。TBD なし。LINE・価格は宛先が無いため今回は不採用（自由URLで代替可）。
- **Type consistency:** `Cta{label,href,variant}` / `CtaVariant` / `parseCta`/`serializeCta`/`validateCta`/`CTA_DESTINATIONS`/`CtaDestination` を全タスクで一貫使用。

## 確定事項（オーナー確認済み 2026-07-09）
- 予約 CTA = 内部 `https://www.thepicklebang.com/reserve`（RESERVA→labola 切替を /reserve が吸収）。→ Task 8 で style guide の「外部 RESERVA」記述も同期更新する。
- 公式 Instagram = `https://www.instagram.com/thepicklebangtheory/`、公式サイト = `https://www.thepicklebang.com/`。
- 公式 LINE / 価格ページは対象外（宛先無し）。必要時は自由 URL で入れる。
