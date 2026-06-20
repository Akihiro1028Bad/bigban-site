// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPage だけを差し替え、DRAFT_LINK_PROPS 等は実物を使う(approve.draftLinkOf が参照するため)。
vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  getPage: vi.fn(),
}));

vi.mock("@/lib/microcms/queries", () => ({
  getNewsByContentId: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage } from "@/lib/growth/notion";
import { getNewsByContentId } from "@/lib/microcms/queries";
import { GET } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function getRequest(token: string | null, pageId: string | null): Request {
  const url = new URL("http://localhost/api/growth/draft");
  if (token !== null) url.searchParams.set("token", token);
  if (pageId !== null) url.searchParams.set("pageId", pageId);
  return new Request(url, { method: "GET" });
}

function pageWithLink(contentId?: string, draftKey?: string) {
  const properties: Record<string, unknown> = {};
  if (contentId !== undefined) {
    properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: contentId }] };
  }
  if (draftKey !== undefined) {
    properties["下書きプレビューキー"] = {
      type: "rich_text",
      rich_text: [{ plain_text: draftKey }],
    };
  }
  return { id: PAGE_ID, url: "", properties };
}

const newsItem = {
  title: "市川で始める",
  displayMode: "html",
  bodyHtml: "<p>本文</p>",
  body: "",
};

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset();
  vi.mocked(getNewsByContentId).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/draft", () => {
  it("contentId+draftKey から下書き本文を返す", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithLink("g-abc", "dk-1"));
    vi.mocked(getNewsByContentId).mockResolvedValue(newsItem as never);

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      exists: true,
      draft: { title: "市川で始める", displayMode: "html", bodyHtml: "<p>本文</p>", body: "" },
    });
    expect(vi.mocked(getNewsByContentId)).toHaveBeenCalledWith({ id: "g-abc", draftKey: "dk-1" });
  });

  it("draftKey 空なら undefined で取得する", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithLink("g-abc", ""));
    vi.mocked(getNewsByContentId).mockResolvedValue(newsItem as never);

    await GET(getRequest(null, PAGE_ID));
    expect(vi.mocked(getNewsByContentId)).toHaveBeenCalledWith({ id: "g-abc", draftKey: undefined });
  });

  it("下書き未作成(contentId 無し)は exists:false(エラーにしない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithLink());

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, exists: false, draft: null });
    expect(vi.mocked(getNewsByContentId)).not.toHaveBeenCalled();
  });

  it("microCMS 取得失敗(null)は 502", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithLink("g-abc", "dk-1"));
    vi.mocked(getNewsByContentId).mockResolvedValue(null);

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/取得に失敗/);
  });

  it("getPage が throw したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(502);
  });

  it("不正な pageId は 400", async () => {
    const res = await GET(getRequest(null, "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("pageId 未指定は 400", async () => {
    const res = await GET(getRequest(null, null));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(500);
  });

  it("認可ON+トークン不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await GET(getRequest("wrong", PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+トークン未指定は 401(長さ不一致)", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await GET(getRequest("anything", PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+正しいトークンは通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    vi.mocked(getPage).mockResolvedValue(pageWithLink("g-abc", "dk-1"));
    vi.mocked(getNewsByContentId).mockResolvedValue(newsItem as never);
    const res = await GET(getRequest("right", PAGE_ID));
    expect(res.status).toBe(200);
  });
});
