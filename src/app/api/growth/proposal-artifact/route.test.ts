// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, listBlockChildren: vi.fn(), defaultFetch: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { listBlockChildren } from "@/lib/growth/notion";
import { GET } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function request(pageId: string | null): Request {
  const url = new URL("http://localhost/api/growth/proposal-artifact");
  if (pageId !== null) url.searchParams.set("pageId", pageId);
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(listBlockChildren).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/proposal-artifact", () => {
  it("Notion ページ本文の主要ブロックを画面表示用に整形して返す", async () => {
    vi.mocked(listBlockChildren).mockResolvedValue({
      blocks: [
        {
          id: "b1",
          type: "heading_2",
          heading_2: { rich_text: [{ plain_text: "実装ステップ" }] },
        },
        {
          id: "b2",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "ホームに沿線アクセスを追記する。" }] },
        },
        {
          id: "b3",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: [{ plain_text: "Before/After 文言を確認する。" }] },
        },
        {
          id: "b4",
          type: "divider",
          divider: {},
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const res = await GET(request(PAGE_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      blocks: [
        { id: "b1", type: "heading_2", text: "実装ステップ" },
        { id: "b2", type: "paragraph", text: "ホームに沿線アクセスを追記する。" },
        { id: "b3", type: "bulleted_list_item", text: "Before/After 文言を確認する。" },
      ],
      hasMore: false,
    });
    expect(listBlockChildren).toHaveBeenCalledWith(
      PAGE_ID,
      expect.objectContaining({ token: "secret_notion" }),
      { pageSize: 80 }
    );
  });

  it("不正な pageId は 400", async () => {
    const res = await GET(request("bad!"));

    expect(res.status).toBe(400);
    expect(listBlockChildren).not.toHaveBeenCalled();
  });

  it("Notion token 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;

    const res = await GET(request(PAGE_ID));

    expect(res.status).toBe(500);
    expect(listBlockChildren).not.toHaveBeenCalled();
  });

  it("Notion 取得失敗は 502", async () => {
    vi.mocked(listBlockChildren).mockRejectedValue(new Error("notion secret"));

    const res = await GET(request(PAGE_ID));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, error: "成果物の取得に失敗しました" });
  });
});
