// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { growthAuthHeaders } from "@/test/growthAuth";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postReq(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/decorate/dismiss");
  return new Request(url, { method: "POST", headers: growthAuthHeaders(token), body: JSON.stringify(body) });
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(updatePageProps).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/decorate/dismiss", () => {
  it("クリア(なし)プロパティを書き込む", async () => {
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect((props as Record<string, { select?: { name: string } }>)["装飾ステータス"]).toEqual({
      select: { name: "なし" },
    });
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/decorate/dismiss");
    const res = await POST(new Request(url, { method: "POST", headers: growthAuthHeaders(null), body: "x" }));
    expect(res.status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postReq(null, { pageId: "bad!" }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(500);
  });

  it("Notion 書き込み失敗は 502", async () => {
    vi.mocked(updatePageProps).mockRejectedValue(new Error("down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(502);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postReq("wrong", { pageId: PAGE_ID }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、token 未指定は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postReq("x", { pageId: PAGE_ID }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postReq("secret-token", { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
  });
});
