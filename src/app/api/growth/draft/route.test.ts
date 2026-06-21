// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPage だけを差し替え、draftBodyOf/ideaTitleOf 等は実物を使う(#95)。
vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  getPage: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage } from "@/lib/growth/notion";
import { GET } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function getRequest(token: string | null, pageId: string | null): Request {
  const url = new URL("http://localhost/api/growth/draft");
  if (token !== null) url.searchParams.set("token", token);
  if (pageId !== null) url.searchParams.set("pageId", pageId);
  return new Request(url, { method: "GET" });
}

// #95: 本文ミラー(下書き本文HTML)＋タイトル案を持つ Notion ページ。
function pageWithMirror(bodyHtml?: string, title = "夜のピックル") {
  const properties: Record<string, unknown> = {
    "タイトル案": { type: "title", title: [{ plain_text: title }] },
  };
  if (bodyHtml !== undefined) {
    properties["下書き本文HTML"] = {
      type: "rich_text",
      rich_text: [{ plain_text: bodyHtml }],
    };
  }
  return { id: PAGE_ID, url: "", properties };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/draft", () => {
  it("Notion 本文ミラーから下書き本文を返す(#95: microCMS を読まない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithMirror("<p>本文</p>"));

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      exists: true,
      draft: { title: "夜のピックル", displayMode: "html", bodyHtml: "<p>本文</p>", body: "" },
    });
  });

  it("本文ミラー未保存は exists:false(エラーにしない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithMirror());

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, exists: false, draft: null });
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
    vi.mocked(getPage).mockResolvedValue(pageWithMirror("<p>本文</p>"));
    const res = await GET(getRequest("right", PAGE_ID));
    expect(res.status).toBe(200);
  });
});
