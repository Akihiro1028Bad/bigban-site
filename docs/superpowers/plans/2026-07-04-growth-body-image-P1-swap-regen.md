# グロース本文画像 P1（差し替え＋再生成の結線）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認画面の画像タブから本文画像の「差し替え（既存アセットの即時付け替え）」と「AI 再生成（おまかせ・現行 `mascot` 相当）」を動かせるようにする（spec §13 P1）。

**Architecture:** 純ロジック（本文 HTML からの `<figure>`/`<img>` 抽出）は `scripts/growth/*.ts` に置き `src/lib/growth/*` から再エクスポートする（既存方針）。同期差し替えは新設 API `/api/growth/draft/body-image`（`/draft/eyecatch` と同型）が直接 `patchDraft`。AI 再生成は既存 pull 型 API `/api/growth/body-image/regen` に `ApproveClient` から依頼を書き込むだけ（PC ループが拾う）。UI は既存アイキャッチの差し替え/再生成の様式にそのまま揃える。

**Tech Stack:** Next.js 16 App Router（Route Handler・`runtime = "nodejs"`）/ TypeScript strict / React 19 + React Testing Library / Vitest + MSW / microCMS content API + Notion。

**タスク分割の判断（spec §13 の順序からの差分・1-2 行）:** spec の例示順は T5(requestBodyImageRegen/deriveRegenKeys) を T4(DetailPanel/ImagesView 配線) の後に置くが、本計画では **T5 を T4 の前に置く**。理由: DetailPanel/ImagesView の実配線（T4）は `extractBodyImages`（T1）と `requestBodyImageRegen`/`deriveRegenKeys`（T5）の両方を消費するため、配線タスクが「既に出来た部品を繋ぐだけ」になるよう依存を前に積む。

## Global Constraints

- TDD 必須（Red → Green → Refactor）。実装コードより先に必ず失敗するテストを書く。
- カバレッジ 100% ゲート（CLI・`run.mjs`・`gen-*` は既存どおり除外。薄い presentation は `vitest.config.ts` の `coverage.exclude` に追記）。
- TS strict / `any` 禁止（外部入力は `unknown` + narrowing）/ `React.FC` 禁止（関数宣言＋`ComponentNameProps`）/ 型専用 import は `import type`。
- boolean prop は `is`/`has`/`should`/`can` 接頭、handler prop は `on` 接頭・関数は `handle` 接頭。
- 全書き込み API は `verifyToken`（`Authorization: Bearer`・`authHeaders`）＋ `articleEditGuard`（#H9）を維持する。
- 差し替え両 URL（`targetSrc`・`newUrl`）は `isMicrocmsAssetUrl`（`@/lib/growth/media`）で検証する（任意 URL 拒否）。
- 全書き込み経路でサーバ側 `sanitizeNewsHtml(STRICT_HTML_CONFIG)`（`@/lib/news/sanitize`）を再適用する。
- 純ロジックは `scripts/growth/*.ts` に置き `src/lib/growth/*` から `export *` で再エクスポートする（CLI・`run.mjs`・`gen-*` はカバレッジ除外）。
- `MICROCMS_MANAGEMENT_API_KEY` は server-only（`NEXT_PUBLIC_` 禁止）。メディア一覧/アップロードは API ルート経由のみ。
- 書き込みは content API キー（`MICROCMS_CONTENT_API_KEY`）で `patchDraft`（管理キーは使わない）。
- コミットは日本語 Conventional Commits（`feat:`/`test:`/`refactor:` 等）。**push はしない**（ローカルコミットのみ・ユーザーのブラウザ確認完了まで）。
- P1 スコープ限定: `style`/`textSpec`/スタイル選択モーダル/生成モーダル/新規挿入（placeholder）は **P2/P3 で扱うため本計画では実装しない**。既存 API のボディ `{ pageId, targetSrc, instruction? }` をそのまま使う。

---

## T1: 本文画像抽出の純関数（`extractBodyImages`）

本文 HTML から `<img>` を本文出現順に抽出し、URL 列と枚数を供給する純関数を新設する。`scripts/growth/body-image-regen.ts` に置き `src/lib/growth/bodyImageRegen.ts`（既存 `export *`）経由で Web 層から使う。

**Files:**
- Modify: `scripts/growth/body-image-regen.ts`（末尾・L265 の後ろに追記。`IMG_TAG_RE`/`srcOf`/`isMicrocmsAssetUrl` を再利用）
- Test: `scripts/growth/body-image-regen.test.ts`（既存ファイルに `describe("extractBodyImages", …)` を追記）
- （再エクスポートは `src/lib/growth/bodyImageRegen.ts` が `export *` 済みのため変更不要）

**Interfaces:**
- Consumes: 既存 `IMG_TAG_RE`（`/<img\b[^>]*>/gi`）・`srcOf(tag)`・`isMicrocmsAssetUrl(value)`（同ファイル L216-236）。
- Produces:
  - `interface BodyImageRef { src: string }`
  - `function extractBodyImages(html: string): BodyImageRef[]` — 本文出現順に `<img>` を走査し、`src` を持つものだけを配列で返す（`src` 空タグは除外）。microCMS アセット判定はしない（本文にはアセット外 `<img>` も入り得る想定。抽出は「どの画像枠があるか」で、差し替え可否＝アセット検証は API 境界＝T2 が担う）。同一 `src` の重複も**各出現を 1 要素として**残す（枚数=本文の実 `<img>` 数）。

**Steps:**

- [ ] 失敗するテストを書く（`scripts/growth/body-image-regen.test.ts` の import 追加行に `extractBodyImages` と型 `BodyImageRef` を足し、末尾に describe を追記）:

```typescript
describe("extractBodyImages", () => {
  const A = "https://images.microcms-assets.io/img1.png";
  const B = "https://images.microcms-assets.io/img2.png";

  it("本文出現順に <img src> を抽出する(figure 包み・複数)", () => {
    const html =
      `<h2>見出し</h2>` +
      `<figure><img src="${A}" alt="図1"></figure>` +
      `<p>本文</p>` +
      `<figure><img src="${B}" alt="図2"></figure>`;
    expect(extractBodyImages(html)).toEqual([{ src: A }, { src: B }]);
  });

  it("src の無い <img> は除外する", () => {
    const html = `<img alt="src無し"><img src="${A}" alt="x">`;
    expect(extractBodyImages(html)).toEqual([{ src: A }]);
  });

  it("同一 src の重複は各出現を1要素として残す", () => {
    const html = `<img src="${A}" alt="x"><img src="${A}" alt="y">`;
    expect(extractBodyImages(html)).toEqual([{ src: A }, { src: A }]);
  });

  it("画像が無ければ空配列", () => {
    expect(extractBodyImages("<p>本文だけ</p>")).toEqual([]);
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run scripts/growth/body-image-regen.test.ts` → `extractBodyImages is not a function`（または import エラー）で RED。
- [ ] 最小実装（`scripts/growth/body-image-regen.ts` 末尾に追記）:

```typescript
// ── 本文HTMLからの <img> 抽出(画像タブの本文画像実データ化・#59/P1) ──────────
/** 本文HTMLから抽出した1枚の本文画像への参照。 */
export interface BodyImageRef {
  /** その時点の src(microCMS アセットとは限らない。差し替え可否は API 境界で検証する)。 */
  src: string;
}

/**
 * 本文HTML中の `<img>` を**出現順**に走査し、`src` を持つものを配列で返す(P1)。
 * 承認画面の画像タブが「本文画像が何枚あり、どの URL か」を実データ化するために使う。
 * src の無い `<img>` は除外し、同一 src の重複は各出現を1要素として残す(枚数=実 `<img>` 数)。
 * アセット検証(差し替え可否)は API 境界(/api/growth/draft/body-image)が担うため、ここではしない。
 */
export function extractBodyImages(html: string): BodyImageRef[] {
  const refs: BodyImageRef[] = [];
  const tags = html.match(IMG_TAG_RE) ?? [];
  for (const tag of tags) {
    const src = srcOf(tag);
    if (src !== "") refs.push({ src });
  }
  return refs;
}
```

- [ ] 実行して成功確認: `npx vitest run scripts/growth/body-image-regen.test.ts` → 全 GREEN。
- [ ] コミット: `git add scripts/growth/body-image-regen.ts scripts/growth/body-image-regen.test.ts` →
  `feat(growth): 本文HTMLから本文画像を抽出する純関数 extractBodyImages を追加`

---

## T2: `/api/growth/draft/body-image` 新設（同期差し替え）

既存アセット URL の付け替えを同期処理する新ルート。`/api/growth/draft/eyecatch/route.ts` と同型。本文 HTML の該当 `<img src>` を `replaceBodyImageBySrc`（T1 と同ファイルの既存関数）で差し替え、再サニタイズ → Notion ミラー → `patchDraft`、失敗時ロールバック。

**Files:**
- Create: `src/app/api/growth/draft/body-image/route.ts`
- Test: `src/app/api/growth/draft/body-image/route.test.ts`

**Interfaces:**
- Consumes: `replaceBodyImageBySrc`（`@/lib/growth/bodyImageRegen`）・`isMicrocmsAssetUrl`（`@/lib/growth/media`）・`draftBodyOf`/`draftLinkOf`/`isNotionPageId`（`@/lib/growth/approve`）・`patchDraft`（`@/lib/growth/content`）・`buildBodyMirrorProps`/`getPage`/`updatePageProps`/`defaultFetch`（`@/lib/growth/notion`）・`articleEditGuard`（`@/lib/growth/stageGuard`）・`sanitizeNewsHtml`/`STRICT_HTML_CONFIG`（`@/lib/news/sanitize`）・`growthEndpoint`（`@/lib/growth/endpoint`）。
- Produces: `POST(request: Request): Promise<Response>`。成功 `{ success: true }`（200）。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/api/growth/draft/body-image/route.test.ts`。eyecatch の route.test.ts と同じ mock 構造。`draftBodyOf` も mock 対象に含めるため `@/lib/growth/approve` を部分 mock する）:

```typescript
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});
vi.mock("@/lib/growth/content", () => ({ patchDraft: vi.fn() }));
vi.mock("@/lib/growth/approve", async (importActual) => {
  // isNotionPageId は本物を使い(pageId 検証)、下書き読み取りだけ差し替える。
  const actual = await importActual<typeof import("@/lib/growth/approve")>();
  return { ...actual, draftBodyOf: vi.fn(), draftLinkOf: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { draftBodyOf, draftLinkOf } from "@/lib/growth/approve";
import { patchDraft } from "@/lib/growth/content";
import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const OLD = "https://images.microcms-assets.io/assets/abc/old.png";
const NEW = "https://images.microcms-assets.io/assets/abc/new.png";
const BODY = `<figure><img src="${OLD}" alt="図1"></figure>`;

function postReq(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/draft/body-image");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_CONTENT_API_KEY = "content-key";
  vi.mocked(getPage).mockReset().mockResolvedValue({ id: PAGE_ID, url: "", properties: {} });
  vi.mocked(updatePageProps).mockReset().mockResolvedValue(PAGE_ID);
  vi.mocked(patchDraft).mockReset().mockResolvedValue("g-abc");
  vi.mocked(draftBodyOf).mockReset().mockReturnValue(BODY);
  vi.mocked(draftLinkOf).mockReset().mockReturnValue({ contentId: "g-abc", draftKey: "" });
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_CONTENT_API_KEY;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/draft/body-image", () => {
  it("本文の該当 img を差し替え、Notion ミラー→microCMS 下書きへ同期する", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const [, mirrorProps] = vi.mocked(updatePageProps).mock.calls[0];
    // 下書き本文HTMLミラー(#95)に差し替え後の HTML が入る。
    expect(JSON.stringify(mirrorProps)).toContain(NEW);
    const [, contentId, data] = vi.mocked(patchDraft).mock.calls[0];
    expect(contentId).toBe("g-abc");
    expect((data as { bodyHtml: string }).bodyHtml).toContain(NEW);
    expect((data as { bodyHtml: string }).bodyHtml).not.toContain(OLD);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postReq(null, { pageId: "bad!", targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(400);
  });

  it("targetSrc が microCMS アセット以外は 400", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: "https://evil.com/x.png", newUrl: NEW }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("newUrl が microCMS アセット以外は 400", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: "https://evil.com/x.png" }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/draft/body-image");
    const res = await POST(new Request(url, { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(409);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("下書きID が無い/不正は 404", async () => {
    vi.mocked(draftLinkOf).mockReturnValue({ contentId: "", draftKey: "" });
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(404);
  });

  it("対象 img が本文に無い(差し替え不可)は 404", async () => {
    vi.mocked(draftBodyOf).mockReturnValue("<p>画像なし本文</p>");
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(404);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(500);
  });

  it("CONTENT キー未設定は 500", async () => {
    delete process.env.MICROCMS_CONTENT_API_KEY;
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(500);
  });

  it("getPage 失敗は 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(502);
  });

  it("Notion ミラー更新失敗は 502(patchDraft は呼ばれない)", async () => {
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion patch fail"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(502);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("microCMS 同期失敗はミラーを旧本文へ戻して 502", async () => {
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(502);
    // 1回目=差し替え後で更新、2回目=旧本文へロールバック。
    expect(vi.mocked(updatePageProps).mock.calls.length).toBe(2);
    expect(JSON.stringify(vi.mocked(updatePageProps).mock.calls[1][1])).toContain(OLD);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postReq("wrong", { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run src/app/api/growth/draft/body-image/route.test.ts` → ルート未作成で `Failed to resolve import "./route"` の RED。
- [ ] 最小実装（`src/app/api/growth/draft/body-image/route.ts`。eyecatch ルート＋edit ルートのロールバックを合成）:

```typescript
/**
 * 下書き本文画像の同期差し替え API(Epic #140 / #145・本文画像 P1)。
 *
 * POST { pageId, targetSrc, newUrl }: 承認画面の画像タブで選択/アップロードしたメディア URL(newUrl)を、
 * 本文HTML中の該当 <img src>(targetSrc)へ即時に付け替える(AI を介さない同期処理)。
 *
 * - `targetSrc`・`newUrl` はともに **microCMS アセット URL に限定**(任意 URL 拒否)。
 * - 差し替えは `replaceBodyImageBySrc`(src 一致の先頭1枚・関数形式置換)を流用する。
 * - 差し替え後 `sanitizeNewsHtml(STRICT_HTML_CONFIG)` を再適用(XSS 最終段)。
 * - 書き込みは content API キーで `patchDraft`(管理キーは使わない)。status=draft のみ。公開しない。
 * - #95: Notion ミラー(下書き本文HTML)を先に更新 → microCMS 同期。同期失敗はミラーを旧本文へ戻す。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate)。
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { draftBodyOf, draftLinkOf, isNotionPageId } from "@/lib/growth/approve";
import { replaceBodyImageBySrc } from "@/lib/growth/bodyImageRegen";
import { patchDraft } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import { isMicrocmsAssetUrl } from "@/lib/growth/media";
import { buildBodyMirrorProps, defaultFetch, getPage, updatePageProps } from "@/lib/growth/notion";
import { articleEditGuard } from "@/lib/growth/stageGuard";
import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

export const runtime = "nodejs";

const ENDPOINT = growthEndpoint();
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function microcmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = process.env.MICROCMS_CONTENT_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("不正なリクエストです。");
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  const targetSrc = (body as { targetSrc?: unknown })?.targetSrc;
  const newUrl = (body as { newUrl?: unknown })?.newUrl;
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (!isMicrocmsAssetUrl(targetSrc)) return badRequest("対象画像には microCMS のメディア URL を指定してください。");
  if (!isMicrocmsAssetUrl(newUrl)) return badRequest("差し替え先には microCMS のメディア URL を指定してください。");

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  let contentId: string;
  let previousBody = "";
  let stageBlocked: Response | null = null;
  try {
    const page = await getPage(pageId, notionOpts);
    stageBlocked = articleEditGuard(page);
    contentId = draftLinkOf(page).contentId;
    previousBody = draftBodyOf(page);
  } catch {
    return NextResponse.json({ success: false, error: "更新中にエラーが発生しました" }, { status: 502 });
  }
  if (stageBlocked) return stageBlocked;
  if (!contentId || !CONTENT_ID_RE.test(contentId)) {
    return NextResponse.json(
      { success: false, error: "差し替え対象の下書きが見つかりません。" },
      { status: 404 }
    );
  }

  // 本文HTMLの該当 <img src> を newUrl へ差し替える(src 一致の先頭1枚・関数形式置換)。
  const { html: swapped, replaced } = replaceBodyImageBySrc(previousBody, targetSrc, newUrl);
  if (!replaced) {
    return NextResponse.json(
      { success: false, error: "差し替え対象の画像が本文に見つかりません。" },
      { status: 404 }
    );
  }
  // サーバ側で再サニタイズしてから書き込む(XSS 最終段)。
  const sanitized = sanitizeNewsHtml(swapped, STRICT_HTML_CONFIG);

  // #95: (1)Notion ミラーを先に更新 → (2)microCMS 下書きへ同期。同期失敗はミラーを旧本文へ戻す。
  try {
    await updatePageProps(pageId, buildBodyMirrorProps(sanitized), notionOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "プレビューへの反映(Notion)に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }
  try {
    await patchDraft(ENDPOINT, contentId, { bodyHtml: sanitized }, microOpts);
  } catch {
    try {
      await updatePageProps(pageId, buildBodyMirrorProps(previousBody), notionOpts);
    } catch {
      /* rollback 失敗。再操作で冪等に回復する。 */
    }
    return NextResponse.json(
      { success: false, error: "公開ターゲット(microCMS)への同期に失敗しました。やり直してください。" },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
```

- [ ] 実行して成功確認: `npx vitest run src/app/api/growth/draft/body-image/route.test.ts` → 全 GREEN。
- [ ] コミット: `git add src/app/api/growth/draft/body-image/route.ts src/app/api/growth/draft/body-image/route.test.ts` →
  `feat(growth): 本文画像の同期差し替え API /api/growth/draft/body-image を新設`

---

## T3: `MediaLibraryModal` 本文画像モード

適用先 API を eyecatch/body-image で切り替える。既定は現行どおりアイキャッチ（後方互換）。本文画像モードでは `{ pageId, targetSrc, newUrl }` を `/api/growth/draft/body-image` へ POST する。一覧・アップロード・`validateUpload` は流用（重複実装しない）。

**Files:**
- Modify: `src/app/growth/approve/MediaLibraryModal.tsx`（props に本文画像モードを追加・`applyEyecatch` を汎用化・L29-38 props / L138-160 apply / L191-201 見出し文言）
- Test: `src/app/growth/approve/MediaLibraryModal.test.tsx`（新規。MSW で `/api/growth/media`・`/api/growth/draft/eyecatch`・`/api/growth/draft/body-image` をモック）

**Interfaces:**
- Consumes: `authHeaders`（`./authHeaders`）・`validateUpload`/`MEDIA_ALLOWED_MIME`（`@/lib/growth/media`）。
- Produces: 拡張した `MediaLibraryModalProps`（後続タスク T4 が本文画像モードで開くために依存）:
  - 追加 prop `mode?: "eyecatch" | "body-image"`（既定 `"eyecatch"`。boolean ではなく判別のため文字列 union）。
  - 追加 prop `targetSrc?: string`（`mode === "body-image"` のとき必須。差し替え対象の現 src）。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/growth/approve/MediaLibraryModal.test.tsx`。承認画面 UI テストの実イディオムに合わせ、`vi.stubGlobal("fetch", …)` で fetch をスタブする＝近傍 `AddProposalForm.test.tsx` と同様。MSW ではない）:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MediaLibraryModal } from "./MediaLibraryModal";

const ASSET = "https://images.microcms-assets.io/assets/abc/pic.png";
const OLD = "https://images.microcms-assets.io/assets/abc/old.png";
const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

/** GET 一覧は 1 件、POST(反映)は success:true を返す fetch スタブ。POST の body を calls で拾う。 */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, media: [{ url: ASSET }] }),
      });
    }
    // POST(反映先)。呼び出しは fn.mock.calls から検証する。
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** POST 呼び出し(url, body)を fetch スタブの calls から取り出す。 */
function postCall(fn: ReturnType<typeof vi.fn>): { url: string; body: unknown } {
  const call = fn.mock.calls.find(([, init]) => (init?.method ?? "GET").toUpperCase() === "POST");
  const [url, init] = call as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

describe("MediaLibraryModal 本文画像モード", () => {
  it("既定(eyecatch)は /api/growth/draft/eyecatch へ POST する", async () => {
    const fn = stubFetch();
    const onApplied = vi.fn();
    render(
      <MediaLibraryModal token="" pageId={PAGE_ID} heading="記事" onClose={vi.fn()} onApplied={onApplied} />
    );
    await userEvent.click(await screen.findByRole("button", { name: "この画像をアイキャッチに設定" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const { url, body } = postCall(fn);
    expect(url).toBe("/api/growth/draft/eyecatch");
    expect(body).toEqual({ pageId: PAGE_ID, eyecatchUrl: ASSET });
  });

  it("本文画像モードは /api/growth/draft/body-image へ targetSrc 付きで POST する", async () => {
    const fn = stubFetch();
    const onApplied = vi.fn();
    render(
      <MediaLibraryModal
        token=""
        pageId={PAGE_ID}
        heading="記事"
        mode="body-image"
        targetSrc={OLD}
        onClose={vi.fn()}
        onApplied={onApplied}
      />
    );
    await userEvent.click(await screen.findByRole("button", { name: "この画像を本文画像に設定" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const { url, body } = postCall(fn);
    expect(url).toBe("/api/growth/draft/body-image");
    expect(body).toEqual({ pageId: PAGE_ID, targetSrc: OLD, newUrl: ASSET });
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run src/app/growth/approve/MediaLibraryModal.test.tsx` → 本文画像モードの POST 先が eyecatch のままで url/body が不一致、かつ aria-label 文言不一致で `findByRole` 失敗の RED。
- [ ] 最小実装（`MediaLibraryModal.tsx` を編集）:
  - props 型に mode/targetSrc を追加:

```typescript
interface MediaLibraryModalProps {
  token: string;
  /** 差し替え対象記事の Notion page id。 */
  pageId: string;
  /** モーダル見出し(記事タイトルなど)。 */
  heading: string;
  /** 適用先。既定はアイキャッチ(後方互換)。"body-image" は本文画像の同期差し替え。 */
  mode?: "eyecatch" | "body-image";
  /** mode==="body-image" のとき、差し替える本文画像の現 src(必須)。 */
  targetSrc?: string;
  onClose: () => void;
  /** 反映が成功したときに親へ通知(盤の再取得など)。 */
  onApplied: () => void;
}
```

  - `EyecatchResponse` を汎用名 `ApplyResponse` にリネーム（`{ success?: boolean; error?: unknown }` のまま）。
  - `applyEyecatch` を `applySelection` にリネームし、mode で分岐（`handleFile`/`handleSelect` の呼び出しも合わせて変更）:

```typescript
  async function applySelection(url: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === "body-image" ? "/api/growth/draft/body-image" : "/api/growth/draft/eyecatch";
      const payload =
        mode === "body-image"
          ? { pageId, targetSrc, newUrl: url }
          : { pageId, eyecatchUrl: url };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as ApplyResponse;
      if (!res.ok || body.success === false) {
        setError(pickError(body, "画像の反映に失敗しました。もう一度お試しください。"));
        return;
      }
      onApplied();
      onClose();
    } catch {
      setError("画像の反映に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
```

  - 関数本体の見出し・説明文言と各画像ボタンの `aria-label` を mode で出し分ける（本文画像は `この画像を本文画像に設定` / `画像を選んで本文画像に差し替え`、アイキャッチは現行文言）。`props` の分割代入に `mode = "eyecatch"`, `targetSrc` を追加し、`handleFile` 内 `await applyEyecatch(uploaded)` → `await applySelection(uploaded)`、`handleSelect` 内 `void applyEyecatch(url)` → `void applySelection(url)` に変更する。
- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/MediaLibraryModal.test.tsx` → 全 GREEN。
- [ ] コミット: `git add src/app/growth/approve/MediaLibraryModal.tsx src/app/growth/approve/MediaLibraryModal.test.tsx` →
  `feat(growth): MediaLibraryModal に本文画像モードを追加(適用先APIを切替)`

---

## T5: `requestBodyImageRegen` 追加＋`deriveRegenKeys` 複数対応

`ApproveClient` に本文画像の AI 再生成依頼メソッドを追加し、`deriveRegenKeys` の `:body:0` 固定を「対象 src → 抽出順インデックス」の複数対応に置き換える。純ロジック（どの本文画像が生成中かの索き）は純関数へ切り出してテストする（`ApproveClient.tsx` 自体はカバレッジ除外ではないため、ロジックは純関数に寄せて既存様式に合わせる）。

**Files:**
- Create: `src/app/growth/approve/bodyRegenKeys.ts`（純ロジック: 対象 src と本文画像列から生成中インデックス集合を導出）
- Test: `src/app/growth/approve/bodyRegenKeys.test.ts`
- Modify: `src/app/growth/approve/ApproveClient.tsx`（`requestBodyImageRegen` 追加＝L803 `requestEyecatchRegen` の直後 / `deriveRegenKeys` を新純関数で置換＝L822-830）

**Interfaces:**
- Consumes: `extractBodyImages`（`@/lib/growth/bodyImageRegen`・T1）。
- Produces:
  - `function bodyRegenIndices(bodyImageSrcs: readonly string[], targetSrc: string): number[]` — `targetSrc` が本文画像列の何番目か（抽出順）を索く。見つかれば `[index]`、見つからなければ**全インデックス**（`[0..n-1]`）を保守的に返す（並び変化等で特定できないとき全画像を生成中扱い）。`targetSrc` が空文字なら全インデックス（対象未指定＝どれが対象か不明）。本文画像 0 枚なら空配列。
  - `ApproveClient` 内 `async function requestBodyImageRegen(pageId: string, targetSrc: string): Promise<void>`（後続 T4 が `onRegenBodyImage` に結線して依存）。P1 では `instruction` は空・`style`/`textSpec` は送らない。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/growth/approve/bodyRegenKeys.test.ts`）:

```typescript
import { describe, expect, it } from "vitest";

import { bodyRegenIndices } from "./bodyRegenKeys";

const A = "https://images.microcms-assets.io/img1.png";
const B = "https://images.microcms-assets.io/img2.png";
const C = "https://images.microcms-assets.io/img3.png";

describe("bodyRegenIndices", () => {
  it("targetSrc が抽出順の何番目かを索く", () => {
    expect(bodyRegenIndices([A, B, C], B)).toEqual([1]);
    expect(bodyRegenIndices([A, B, C], A)).toEqual([0]);
  });

  it("targetSrc が本文に無ければ全インデックスを保守的に返す", () => {
    expect(bodyRegenIndices([A, B], C)).toEqual([0, 1]);
  });

  it("targetSrc が空なら全インデックス", () => {
    expect(bodyRegenIndices([A, B], "")).toEqual([0, 1]);
  });

  it("本文画像 0 枚なら空配列", () => {
    expect(bodyRegenIndices([], A)).toEqual([]);
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run src/app/growth/approve/bodyRegenKeys.test.ts` → モジュール未作成で RED。
- [ ] 最小実装（`src/app/growth/approve/bodyRegenKeys.ts`）:

```typescript
/**
 * 本文画像 AI 再生成の「どの画像が生成中か」を索く純ロジック(#166 / P1)。
 *
 * 承認画面は Notion の bodyRegen.targetSrc(その時点の src)で対象画像を指定する。本文抽出順の
 * インデックスへ写して ImagesView の生成中バッジ(`${id}:body:<index>`)へ立てる。依頼後に本文編集で
 * 並びが変わり targetSrc が索けないときは、全本文画像を保守的に生成中扱いにする(取りこぼしより過剰表示)。
 */

/**
 * 本文画像 src 列(抽出順)の中で targetSrc の位置を索く。
 * 見つかれば [index]、見つからない/空 targetSrc のときは全インデックスを返す(保守的フォールバック)。
 * 画像 0 枚なら空配列。
 */
export function bodyRegenIndices(bodyImageSrcs: readonly string[], targetSrc: string): number[] {
  if (bodyImageSrcs.length === 0) return [];
  const index = targetSrc === "" ? -1 : bodyImageSrcs.indexOf(targetSrc);
  if (index >= 0) return [index];
  return bodyImageSrcs.map((_src, i) => i);
}
```

- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/bodyRegenKeys.test.ts` → GREEN。
- [ ] `ApproveClient.tsx` に `requestBodyImageRegen` を追加（`requestEyecatchRegen`（L818 の閉じ括弧）の直後）:

```typescript
  // 本文画像の AI 再生成(おまかせ)を実経路(/api/growth/body-image/regen)へ結線する(P1)。
  // P1 ではスタイル選択なし・instruction 空。style/textSpec は P2 で追加する。
  async function requestBodyImageRegen(pageId: string, targetSrc: string): Promise<void> {
    try {
      const res = await fetch("/api/growth/body-image/regen", {
        method: "POST",
        headers: authHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ pageId, targetSrc, instruction: "" }),
      });
      const json = await readJsonObject(res);
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "再生成の依頼に失敗しました。");
      }
      pushToast("本文画像の再生成を依頼しました。PCが処理して数分で反映されます。");
    } catch (error) {
      pushToast(toMessage(error, "本文画像の再生成に失敗しました。"), "error");
    }
  }
```

- [ ] `ApproveClient.tsx` の import に純関数を追加（`import type { DraftPreview }` 群の近傍・既存 import 順に従い `@/` グループへ）:

```typescript
import { extractBodyImages } from "@/lib/growth/bodyImageRegen";
import { bodyRegenIndices } from "./bodyRegenKeys";
```

- [ ] `deriveRegenKeys`（L822-830）の `:body:0` 固定を複数対応へ置換:

```typescript
  function deriveRegenKeys(item: PendingItem): Set<string> {
    const keys = new Set<string>();
    if (draftState.status !== "ready") return keys;
    const { eyecatchRegen, bodyRegen, bodyHtml } = draftState.draft;
    const busy = (status?: string) => status === "依頼中" || status === "処理中";
    if (busy(eyecatchRegen?.status)) keys.add(`${item.id}:eyecatch`);
    if (busy(bodyRegen?.status)) {
      const srcs = extractBodyImages(bodyHtml ?? "").map((ref) => ref.src);
      for (const index of bodyRegenIndices(srcs, bodyRegen?.targetSrc ?? "")) {
        keys.add(`${item.id}:body:${index}`);
      }
    }
    return keys;
  }
```

- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/bodyRegenKeys.test.ts src/app/growth/approve/ApproveClient.test.ts` → GREEN（既存 ApproveClient テストが本文画像なしのケースで壊れないこと。`bodyRegen.status` が busy でも本文画像 0 枚なら keys は増えない＝既存挙動を維持）。
- [ ] コミット: `git add src/app/growth/approve/bodyRegenKeys.ts src/app/growth/approve/bodyRegenKeys.test.ts src/app/growth/approve/ApproveClient.tsx` →
  `feat(growth): 本文画像の再生成依頼 requestBodyImageRegen と deriveRegenKeys 複数対応を追加`

---

## T4: DetailPanel/ImagesView 実データ配線

`DetailPanel` の `bodyImages={0}` ハードコード（L458）を撤去し、本文 HTML から抽出した実データ（枚数・URL 列）を `ImagesView` へ供給する。`ApproveClient` の `onPickBodyImage`/`onRegenBodyImage` を T3（本文画像モード）・T5（`requestBodyImageRegen`）へ結線する。

**Files:**
- Modify: `src/app/growth/approve/DetailPanel.tsx`（L167-169 のコメント更新 / L453-465 の `ImagesView` へ `bodyImages`/`bodyImageUrls` を実データで渡す。抽出は draft の bodyHtml から）
- Modify: `src/app/growth/approve/ApproveClient.tsx`（`renderDetailPanel` の `onPickBodyImage`/`onRegenBodyImage` 結線＝L874-875 近傍 / 本文画像用の `mediaFor` を本文画像モードで開けるよう状態拡張 / L1176-1188 の `MediaLibraryModal` 結線に mode/targetSrc を渡す）
- Test: `src/app/growth/approve/detailBodyImages.test.ts`（`DetailPanel`/`ApproveClient` はカバレッジ除外の薄い presentation。配線に必要な純ロジック＝draft から ImagesView props への写像を純関数化してテストする）

**Interfaces:**
- Consumes: `extractBodyImages`（`@/lib/growth/bodyImageRegen`・T1）・`MediaLibraryModal` の mode/targetSrc（T3）・`requestBodyImageRegen`（T5）。
- Produces: `function bodyImageUrlsOf(bodyHtml: string): string[]`（draft 本文 HTML → ImagesView に渡す URL 列。枚数は `.length`）。`ApproveClient` の本文画像差し替え対象状態 `bodyMediaFor`（後続なし・本タスク内で完結）。

**Steps:**

- [ ] 失敗するテストを書く（`src/app/growth/approve/detailBodyImages.test.ts`）:

```typescript
import { describe, expect, it } from "vitest";

import { bodyImageUrlsOf } from "./detailBodyImages";

const A = "https://images.microcms-assets.io/img1.png";
const B = "https://images.microcms-assets.io/img2.png";

describe("bodyImageUrlsOf", () => {
  it("本文HTMLから本文画像 URL 列を抽出順で返す", () => {
    const html = `<figure><img src="${A}" alt="1"></figure><p>x</p><figure><img src="${B}" alt="2"></figure>`;
    expect(bodyImageUrlsOf(html)).toEqual([A, B]);
  });

  it("画像なしは空配列(bodyImages=0 相当)", () => {
    expect(bodyImageUrlsOf("<p>本文だけ</p>")).toEqual([]);
  });

  it("空文字は空配列", () => {
    expect(bodyImageUrlsOf("")).toEqual([]);
  });
});
```

- [ ] 実行して失敗確認: `npx vitest run src/app/growth/approve/detailBodyImages.test.ts` → モジュール未作成で RED。
- [ ] 最小実装（`src/app/growth/approve/detailBodyImages.ts`）:

```typescript
/**
 * 詳細パネル画像タブ(ImagesView)の本文画像を実データ化する純ロジック(#59 / P1)。
 * draft の本文HTMLから本文画像 URL 列を抽出順で取り出す。枚数(bodyImages)は配列長で表す。
 */
import { extractBodyImages } from "@/lib/growth/bodyImageRegen";

/** 本文HTMLから本文画像 URL 列(抽出順)を返す。ImagesView の bodyImageUrls/bodyImages 供給元。 */
export function bodyImageUrlsOf(bodyHtml: string): string[] {
  return extractBodyImages(bodyHtml).map((ref) => ref.src);
}
```

- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/detailBodyImages.test.ts` → GREEN。
- [ ] `DetailPanel.tsx` を配線（`ImagesView` 呼び出し・L453-466 を修正。`draft?.bodyHtml` から実データを供給）:

```typescript
            {safeTab === "images" && (
              <ImagesView
                hue={hue}
                hasEyecatch={Boolean(item.eyecatchUrl) || Boolean(draft?.eyecatch)}
                eyecatchUrl={item.eyecatchUrl ?? draft?.eyecatch}
                bodyImages={bodyImageUrls.length}
                bodyImageUrls={bodyImageUrls}
                regenKeys={regenKeys}
                itemId={item.id}
                onPickEyecatch={onPickEyecatch}
                onRegenEyecatch={onRegenEyecatch}
                onPickBodyImage={onPickBodyImage}
                onRegenBodyImage={onRegenBodyImage}
              />
            )}
```

  - 同ファイル冒頭 import へ `import { bodyImageUrlsOf } from "./detailBodyImages";` を追加し、`bodyHtml` 導出（L228）の近傍に `const bodyImageUrls = bodyImageUrlsOf(bodyHtml);` を足す。
  - L167-169 のコメント「本文画像0のため到達不可(#proto P3b で撤去)」を「本文画像の差し替え/再生成(#59・P1 で実データ配線)」へ更新する。
- [ ] `ApproveClient.tsx` を配線:
  - 本文画像差し替え用の状態を追加（`mediaFor` の近傍・L188 の直後）:

```typescript
  // 本文画像の差し替え(#145/P1)。対象記事＋差し替える現 src を持ち、MediaLibraryModal を本文画像モードで開く。
  const [bodyMediaFor, setBodyMediaFor] = useState<{ item: PendingItem; targetSrc: string } | null>(null);
```

  - `renderDetailPanel` の `onPickBodyImage`/`onRegenBodyImage`（現状 DetailPanel へ渡していない）を結線する。対象画像 src は draft 本文から抽出した URL 列の index で引く:

```typescript
        onPickBodyImage={(index) => {
          const srcs =
            draftState.status === "ready" ? bodyImageUrlsOf(draftState.draft.bodyHtml ?? "") : [];
          const targetSrc = srcs[index];
          if (targetSrc) setBodyMediaFor({ item, targetSrc });
        }}
        onRegenBodyImage={(index) => {
          const srcs =
            draftState.status === "ready" ? bodyImageUrlsOf(draftState.draft.bodyHtml ?? "") : [];
          const targetSrc = srcs[index];
          if (targetSrc) void requestBodyImageRegen(item.id, targetSrc);
        }}
```

  - import に `import { bodyImageUrlsOf } from "./detailBodyImages";` を追加（`@/` グループの後の相対 import 群へ）。
  - 本文画像モードの `MediaLibraryModal` を描画（既存アイキャッチ用 `mediaFor` の描画ブロック・L1176-1190 の直後に追加）:

```typescript
      {bodyMediaFor ? (
        <MediaLibraryModal
          token={token}
          pageId={bodyMediaFor.item.id}
          heading={bodyMediaFor.item.title}
          mode="body-image"
          targetSrc={bodyMediaFor.targetSrc}
          onClose={() => setBodyMediaFor(null)}
          onApplied={() => {
            void loadDraft(bodyMediaFor.item.id);
            void pollBoard();
            pushToast("本文画像を差し替えました。");
            setBodyMediaFor(null);
          }}
        />
      ) : null}
```

- [ ] 実行して成功確認: `npx vitest run src/app/growth/approve/detailBodyImages.test.ts src/app/growth/approve/ApproveClient.test.ts` → GREEN（既存 ApproveClient テストが壊れないこと）。
- [ ] コミット: `git add src/app/growth/approve/detailBodyImages.ts src/app/growth/approve/detailBodyImages.test.ts src/app/growth/approve/DetailPanel.tsx src/app/growth/approve/ApproveClient.tsx` →
  `feat(growth): 画像タブの本文画像を実データ化し差し替え/再生成を結線`

---

## T6: 仕上げ（型チェック・lint・全テスト・カバレッジ）

新規純ロジック（`extractBodyImages`・`bodyRegenIndices`・`bodyImageUrlsOf`）と新規 API（`/draft/body-image`）は 100% カバレッジ対象。UI 薄結線（`DetailPanel.tsx`・`DetailViews.tsx` は既存除外済み）はテスト不要だが、`bodyRegenKeys.ts`/`detailBodyImages.ts`/`bodyImageRegen.ts` の新規純ロジックは除外に足さず 100% を満たす。

**Files:**
- Modify（必要時のみ）: `vitest.config.ts`（新規に薄い presentation ファイルを足していないため、原則追記不要。カバレッジ穴があった場合のみ、純ロジックはテスト追加で埋め、薄結線に限り `coverage.exclude` へ追記）

**Steps:**

- [ ] 型チェック: `npx tsc --noEmit` → エラー 0。`any`/`@ts-ignore` 混入がないことを確認する。
- [ ] lint: `npm run lint`（存在すれば）→ エラー 0。import 順（React → 3rd party → `@/` → 相対 parent → 相対 sibling → `import type`）を満たすこと。
- [ ] 全テスト＋カバレッジ: `npx vitest run --coverage` → 全 GREEN。以下の新規/変更ファイルが 100%（statements/branches/functions/lines）:
  - `scripts/growth/body-image-regen.ts`（`extractBodyImages` 追加分含む）
  - `src/app/api/growth/draft/body-image/route.ts`
  - `src/app/growth/approve/bodyRegenKeys.ts`
  - `src/app/growth/approve/detailBodyImages.ts`
- [ ] カバレッジ穴があれば、純ロジックはテストケースを追加して埋める（薄結線 UI に限り `coverage.exclude` へ追記し、追記理由をコメントで残す）。再度 `npx vitest run --coverage` で確認。
- [ ] 受け入れ基準の手動確認メモを残す（コミットしない・報告のみ）: 画像タブで本文画像が実枚数で表示され、「差し替え」で MediaLibraryModal（本文画像モード）→ 即時反映、「AIで再生成」で `/body-image/regen` へ依頼＋トースト＋生成中バッジ。
- [ ] コミット（変更があった場合のみ）: `git add vitest.config.ts` →
  `test(growth): 本文画像 P1 のカバレッジを 100% に揃える`

---

## 受け入れ基準（spec §13 P1・再掲）

- 画像タブから本文画像の**差し替え（即時）**と**再生成（おまかせ・現行 `mascot` 相当）**が動く。
- `DetailPanel.tsx` の `bodyImages={0}` ハードコードが撤去され、本文 HTML 由来の実データで表示される。
- `deriveRegenKeys` の `:body:0` 固定が解消され、対象 src → 抽出順インデックスで生成中バッジが立つ（索けないときは全画像を保守的に生成中扱い）。
- 新設 `/api/growth/draft/body-image` が両 URL の `isMicrocmsAssetUrl` 検証・`sanitizeNewsHtml` 再適用・Notion ミラー＋`patchDraft`・失敗時ロールバックを備える。
