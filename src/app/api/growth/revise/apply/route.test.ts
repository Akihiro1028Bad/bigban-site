// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  getPage: vi.fn(),
  updatePageProps: vi.fn(),
  defaultFetch: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/revise/apply");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function page(status?: string, proposal?: string, titleProposal?: string) {
  const properties: Record<string, unknown> = {};
  if (status) properties["修正ステータス"] = { select: { name: status } };
  if (proposal) properties["修正案"] = { rich_text: [{ plain_text: proposal }] };
  if (titleProposal) properties["修正タイトル案"] = { rich_text: [{ plain_text: titleProposal }] };
  return { id: PAGE_ID, url: "", properties };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/revise/apply", () => {
  it("apply: 提示中の修正案を構成案へ上書きしクリアする", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中", "## 改訂"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(200);
    const [id, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(id).toBe(PAGE_ID);
    expect((props as Record<string, unknown>)["構成案"]).toEqual({
      rich_text: [{ text: { content: "## 改訂" } }],
    });
    expect((props as Record<string, unknown>)["修正ステータス"]).toEqual({
      select: { name: "なし" },
    });
  });

  it("apply: 提示中でなければ 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page("処理中", "x"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("apply: 構成案・タイトル案ともに空なら 409(#139 B)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(409);
  });

  it("apply: タイトル案だけでも反映できる(構成案は触らない・#139 B)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中", undefined, "短い新タイトル"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, unknown>;
    expect(p["構成案"]).toBeUndefined();
    expect(p["タイトル案"]).toEqual({ title: [{ text: { content: "短い新タイトル" } }] });
    expect(p["修正ステータス"]).toEqual({ select: { name: "なし" } });
  });

  it("apply: 構成案とタイトル案の両方を反映できる(#139 B)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中", "## 改訂", "新タイトル"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, unknown>;
    expect(p["構成案"]).toEqual({ rich_text: [{ text: { content: "## 改訂" } }] });
    expect(p["タイトル案"]).toEqual({ title: [{ text: { content: "新タイトル" } }] });
  });

  it("discard: 構成案は触らず修正状態だけクリアする", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中", "x"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "discard" }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect((props as Record<string, unknown>)["構成案"]).toBeUndefined();
    expect((props as Record<string, unknown>)["修正ステータス"]).toEqual({
      select: { name: "なし" },
    });
  });

  it("discard: 失敗からも破棄できる", async () => {
    vi.mocked(getPage).mockResolvedValue(page("失敗", "理由"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "discard" }));
    expect(res.status).toBe(200);
  });

  it("discard: なし(修正なし)なら 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page());
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "discard" }));
    expect(res.status).toBe(409);
  });

  it("discard: 依頼中/処理中(PC作業中)は 409(競合回避)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("処理中"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "discard" }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("不正な action は 400", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "x" }));
    expect(res.status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "bad!", action: "apply" }));
    expect(res.status).toBe(400);
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/revise/apply");
    const res = await POST(new Request(url, { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(500);
  });

  it("Notion 失敗時は 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(502);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、token 未指定は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest("x", { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    vi.mocked(getPage).mockResolvedValue(page("提示中", "## 改訂"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, action: "apply" }));
    expect(res.status).toBe(200);
  });
});
