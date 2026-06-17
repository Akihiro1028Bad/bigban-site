// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  createPage: vi.fn(),
  defaultFetch: vi.fn(),
}));

import { createPage } from "@/lib/growth/notion";
import { POST } from "./route";

const SECRET = "approve-secret-token";

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/proposals");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(createPage).mockReset();
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
});

describe("POST /api/growth/proposals", () => {
  it("施策を承認待ちで作成し表示用アイテムを返す", async () => {
    vi.mocked(createPage).mockResolvedValue("38099efa-346b-8122-9681-f4d2cc321a31");

    const res = await POST(
      postRequest(SECRET, { name: "平日昼クーポン", category: "MEO", note: "LINE配布" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      item: {
        id: "38099efa-346b-8122-9681-f4d2cc321a31",
        kind: "proposal",
        title: "平日昼クーポン",
        subtitle: "MEO",
        details: [{ label: "想定アクション", value: "LINE配布" }],
        score: 0,
      },
    });
    expect(createPage).toHaveBeenCalledWith(
      "3503f4bc-b1c4-4927-91ce-7609a6c4e460",
      expect.objectContaining({ "ステータス": { select: { name: "未処理" } } }),
      expect.anything()
    );
  });

  it("token が違えば 401", async () => {
    const res = await POST(postRequest("wrong", { name: "A" }));
    expect(res.status).toBe(401);
    expect(createPage).not.toHaveBeenCalled();
  });

  it("token 未指定なら 401", async () => {
    const res = await POST(postRequest(null, { name: "A" }));
    expect(res.status).toBe(401);
  });

  it("APPROVE_SECRET 未設定なら 401", async () => {
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest(SECRET, { name: "A" }));
    expect(res.status).toBe(401);
  });

  it("NOTION_TOKEN 未設定なら 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(SECRET, { name: "A" }));
    expect(res.status).toBe(500);
  });

  it("施策名が無ければ 400 と理由を返す", async () => {
    const res = await POST(postRequest(SECRET, { name: "  " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/施策名を入力/);
    expect(createPage).not.toHaveBeenCalled();
  });

  it("Notion 作成失敗時は 502(詳細は返さない)", async () => {
    vi.mocked(createPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest(SECRET, { name: "A" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("作成中にエラーが発生しました");
  });
});
