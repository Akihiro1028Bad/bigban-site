// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/approve/revert");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function page(status: string, contentId = "art_abc") {
  return {
    id: PAGE_ID,
    url: "",
    properties: {
      "ステータス": { select: { name: status } },
      "下書きID": { rich_text: [{ plain_text: contentId }] },
    },
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

describe("POST /api/growth/approve/revert", () => {
  it("下書き作成済みを提案中に戻し、下書きリンクを空にして 200", async () => {
    vi.mocked(getPage).mockResolvedValue(page("下書き作成済み"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const [id, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(id).toBe(PAGE_ID);
    expect(props).toEqual({
      "ステータス": { select: { name: "提案中" } },
      "下書きID": { rich_text: [] },
      "下書きプレビューキー": { rich_text: [] },
    });
  });

  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("生成中"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("公開済みの記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue(page("公開済み"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "bad!" }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/approve/revert");
    const res = await POST(new Request(url, { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(500);
  });

  it("Notion 失敗時は 502(詳細は返さない)", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down: secret"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).not.toMatch(/secret/);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID }));
    expect(res.status).toBe(401);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    vi.mocked(getPage).mockResolvedValue(page("下書き作成済み"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest("secret-token", { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
  });
});
