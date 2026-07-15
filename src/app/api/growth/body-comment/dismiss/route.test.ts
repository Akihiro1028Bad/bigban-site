// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { growthAuthHeaders } from "@/test/growthAuth";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: false } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postReq(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/body-comment/dismiss");
  return new Request(url, { method: "POST", headers: growthAuthHeaders(token), body: raw ?? JSON.stringify(body) });
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.APPROVE_SECRET = "open-sesame";
  vi.mocked(updatePageProps).mockReset().mockResolvedValue(PAGE_ID);
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/growth/body-comment/dismiss", () => {
  it("コメント状態をクリアして なし に戻す(200)", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect((props as Record<string, { select: { name: string } }>)["本文コメントステータス"].select.name).toBe(
      "なし"
    );
  });

  it("認証有効＋トークン不一致は 401", async () => {
    flags.authEnabled = true;
    expect((await POST(postReq("wrong", { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("認証有効＋トークン無しは 401", async () => {
    flags.authEnabled = true;
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("認証有効＋APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    expect((await POST(postReq("anything", { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("認証有効＋正規トークンは通る", async () => {
    flags.authEnabled = true;
    expect((await POST(postReq("open-sesame", { pageId: PAGE_ID }))).status).toBe(200);
  });

  it("壊れた JSON は 400", async () => {
    expect((await POST(postReq(null, null, "{壊れ"))).status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    expect((await POST(postReq(null, { pageId: "x" }))).status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(500);
  });

  it("書き込み失敗は 502(真因はログ)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion down"));
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(502);
  });
});
