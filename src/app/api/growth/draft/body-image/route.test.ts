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
  process.env.MICROCMS_API_KEY = "content-key";
  vi.mocked(getPage).mockReset().mockResolvedValue({ id: PAGE_ID, url: "", properties: {} });
  vi.mocked(updatePageProps).mockReset().mockResolvedValue(PAGE_ID);
  vi.mocked(patchDraft).mockReset().mockResolvedValue("g-abc");
  vi.mocked(draftBodyOf).mockReset().mockReturnValue(BODY);
  vi.mocked(draftLinkOf).mockReset().mockReturnValue({ contentId: "g-abc", draftKey: "" });
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_API_KEY;
  delete process.env.APPROVE_SECRET;
  delete process.env.GROWTH_MICROCMS_ENDPOINT;
});

describe("POST /api/growth/draft/body-image", () => {
  function pageWithMedia(media: string) {
    return {
      id: PAGE_ID,
      url: "",
      properties: { "媒体": { select: { name: media } } },
    };
  }

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

  it("媒体=ニュースなら GROWTH_MICROCMS_ENDPOINT=columns でも news 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWithMedia("ニュース"));
    vi.mocked(draftLinkOf).mockReturnValue({ contentId: "g-news", draftKey: "" });

    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(200);
    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-news");
  });

  it("媒体=コラムなら GROWTH_MICROCMS_ENDPOINT=columns の columns 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWithMedia("コラム"));
    vi.mocked(draftLinkOf).mockReturnValue({ contentId: "g-column", draftKey: "" });

    const res = await POST(postReq(null, { pageId: PAGE_ID, targetSrc: OLD, newUrl: NEW }));
    expect(res.status).toBe(200);
    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("columns");
    expect(contentId).toBe("g-column");
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
    delete process.env.MICROCMS_API_KEY;
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
