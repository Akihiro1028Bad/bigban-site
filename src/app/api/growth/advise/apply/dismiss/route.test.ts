// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function postReq(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/advise/apply/dismiss");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(updatePageProps).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/growth/advise/apply/dismiss", () => {
  it("クリアして 200", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const props = vi.mocked(updatePageProps).mock.calls[0][1] as Record<string, unknown>;
    expect(props["アドバイス反映ステータス"]).toEqual({ select: { name: "なし" } });
  });

  it("認証失敗は 401（同長トークン不一致）", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    expect((await POST(postReq("wrong", { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("認証失敗は 401（token 無し・長さ不一致）", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("APPROVE_SECRET 未設定なら常に 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    expect((await POST(postReq("anything", { pageId: PAGE_ID }))).status).toBe(401);
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

  it("更新失敗は 502", async () => {
    vi.mocked(updatePageProps).mockRejectedValue(new Error("down"));
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(502);
  });
});
