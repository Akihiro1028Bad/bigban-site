// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { growthAuthHeaders } from "@/test/growthAuth";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/publish/schedule");
  return new Request(url, { method: "POST", headers: growthAuthHeaders(token, "publish"), body: JSON.stringify(body) });
}

function page(status = "下書き作成済み") {
  return {
    id: PAGE_ID,
    url: "",
    properties: { "ステータス": { type: "select", select: { name: status } } },
  };
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = "secret-token";
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset().mockResolvedValue(page());
  vi.mocked(updatePageProps).mockReset().mockResolvedValue(PAGE_ID);
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/publish/schedule", () => {
  it("未来時刻を予約として Notion に書く(200)", async () => {
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const [id, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(id).toBe(PAGE_ID);
    expect(props).toEqual({ "公開予約時刻": { date: { start: FUTURE } } });
  });

  it("null で予約を解除する(200)", async () => {
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: null }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(props).toEqual({ "公開予約時刻": { date: null } });
  });

  it("過去時刻は 400", async () => {
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: PAST }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("形式不正は 400", async () => {
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: "いつか" }));
    expect(res.status).toBe(400);
  });

  it("scheduledAt が文字列でも null でもなければ 400", async () => {
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: 123 }));
    expect(res.status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest("secret-token", { pageId: "bad!", scheduledAt: FUTURE }));
    expect(res.status).toBe(400);
  });

  it("ボディが JSON でなければ 400", async () => {
    const url = new URL("http://localhost/api/growth/publish/schedule");
    const res = await POST(new Request(url, { method: "POST", headers: growthAuthHeaders("secret-token", "publish"), body: "{" }));
    expect(res.status).toBe(400);
  });

  it("生成中は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("生成中"));
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("下書きがまだ無い(提案中)記事は 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page("提案中"));
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("Notion 書き込み失敗は整理した 5xx", async () => {
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(200);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(401);
  });

  it("通常sessionだけなら403でNotionを呼ばない", async () => {
    const request = new Request("http://localhost/api/growth/publish/schedule", {
      method: "POST",
      headers: growthAuthHeaders("secret-token"),
      body: JSON.stringify({ pageId: PAGE_ID, scheduledAt: FUTURE }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "STEP_UP_REQUIRED", scope: "publish" });
    expect(getPage).not.toHaveBeenCalled();
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID, scheduledAt: FUTURE }));
    expect(res.status).toBe(500);
  });
});
