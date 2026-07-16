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

function postReq(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/eyecatch/regen");
  return new Request(url, { method: "POST", headers: growthAuthHeaders(token), body: JSON.stringify(body) });
}

function page(opts: { status?: string; contentId?: string } = {}) {
  const properties: Record<string, unknown> = {};
  if (opts.status) properties["アイキャッチ再生成ステータス"] = { select: { name: opts.status } };
  if (opts.contentId !== undefined) {
    properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: opts.contentId }] };
  }
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

describe("POST /api/growth/eyecatch/regen", () => {
  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("再生成リクエスト(指示・依頼中・依頼時刻)を書き込む", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postReq(null, { pageId: PAGE_ID, instruction: "夏らしく" }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { rich_text?: unknown; select?: { name: string } }>;
    expect(p["アイキャッチ再生成指示"].rich_text).toEqual([{ text: { content: "夏らしく" } }]);
    expect(p["アイキャッチ再生成ステータス"]).toEqual({ select: { name: "依頼中" } });
  });

  it("指示なし(空)でも依頼できる", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect((props as Record<string, { rich_text?: unknown }>)["アイキャッチ再生成指示"].rich_text).toEqual([]);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postReq(null, { pageId: "bad!" }));
    expect(res.status).toBe(400);
  });

  it("指示が長すぎる(500文字超)は 400", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, instruction: "あ".repeat(501) }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/eyecatch/regen");
    const res = await POST(new Request(url, { method: "POST", headers: growthAuthHeaders(null), body: "x" }));
    expect(res.status).toBe(400);
  });

  it("下書きが無い(contentId空)記事は 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "" }));
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it.each(["依頼中", "処理中"])("既に %s なら 409(再依頼拒否)", async (status) => {
    vi.mocked(getPage).mockResolvedValue(page({ status, contentId: "g-abc" }));
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(500);
  });

  it("Notion 取得失敗は 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(502);
  });

  it("Notion 書き込み失敗は 502", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockRejectedValue(new Error("patch fail"));
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
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "g-abc" }));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postReq("secret-token", { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
  });
});
