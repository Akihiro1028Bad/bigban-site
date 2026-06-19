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
  const url = new URL("http://localhost/api/growth/revise/edit");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function page(status?: string) {
  return {
    id: PAGE_ID,
    url: "",
    properties: status ? { "修正ステータス": { select: { name: status } } } : {},
  };
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

describe("POST /api/growth/revise/edit", () => {
  it("構成案を直接上書きする(修正状態は触らない)", async () => {
    vi.mocked(getPage).mockResolvedValue(page());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postRequest(null, { pageId: PAGE_ID, outline: "## A\n説明" }));
    expect(res.status).toBe(200);
    const [id, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(id).toBe(PAGE_ID);
    expect(props).toEqual({ "構成案": { rich_text: [{ text: { content: "## A\n説明" } }] } });
  });

  it("AI修正処理中なら 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提示中"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "bad!", outline: "## A" }));
    expect(res.status).toBe(400);
  });

  it("構成案が空(空文字/空白のみ)は 400", async () => {
    expect((await POST(postRequest(null, { pageId: PAGE_ID, outline: "  " }))).status).toBe(400);
    expect((await POST(postRequest(null, { pageId: PAGE_ID, outline: 123 }))).status).toBe(400);
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/revise/edit");
    const res = await POST(new Request(url, { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(500);
  });

  it("Notion 失敗時は 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(502);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、token 未指定は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest("x", { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    vi.mocked(getPage).mockResolvedValue(page());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, outline: "## A" }));
    expect(res.status).toBe(200);
  });
});
