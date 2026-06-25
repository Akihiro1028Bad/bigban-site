// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});
vi.mock("@/lib/growth/content", () => ({ patchDraft: vi.fn() }));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { patchDraft } from "@/lib/growth/content";
import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const ASSET = "https://images.microcms-assets.io/assets/abc/new.png";

function postReq(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/draft/eyecatch");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function pageWithContentId(contentId?: string) {
  return {
    id: PAGE_ID,
    url: "",
    properties: contentId
      ? { "下書きID": { type: "rich_text", rich_text: [{ plain_text: contentId }] } }
      : {},
  };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_CONTENT_API_KEY = "content-key";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
  vi.mocked(patchDraft).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_CONTENT_API_KEY;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/draft/eyecatch", () => {
  it("Notion ミラー更新→microCMS 下書きの eyecatch を差し替える", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithContentId("g-abc"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    vi.mocked(patchDraft).mockResolvedValue("g-abc");

    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const [, mirrorProps] = vi.mocked(updatePageProps).mock.calls[0];
    expect(mirrorProps).toEqual({ "アイキャッチURL": { url: ASSET } });
    const [endpoint, contentId, data] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-abc");
    expect(data).toEqual({ eyecatch: ASSET });
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postReq(null, { pageId: "bad!", eyecatchUrl: ASSET }));
    expect(res.status).toBe(400);
  });

  it("microCMS アセット以外の URL は 400", async () => {
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: "https://evil.com/x.png" }));
    expect(res.status).toBe(400);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/draft/eyecatch");
    const res = await POST(new Request(url, { method: "POST", body: "x" }));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(500);
  });

  it("CONTENT キー未設定は 500", async () => {
    delete process.env.MICROCMS_CONTENT_API_KEY;
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(500);
  });

  it("下書きID 取得で Notion 失敗は 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(502);
  });

  it("下書きID が無い/不正は 404", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithContentId());
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(404);
  });

  it("Notion ミラー更新失敗は 502", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithContentId("g-abc"));
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion patch fail"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(502);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("microCMS 同期失敗は 502", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithContentId("g-abc"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(502);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postReq("wrong", { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、token 未指定は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "s";
    const res = await POST(postReq(null, { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postReq("x", { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret-token";
    vi.mocked(getPage).mockResolvedValue(pageWithContentId("g-abc"));
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    vi.mocked(patchDraft).mockResolvedValue("g-abc");
    const res = await POST(postReq("secret-token", { pageId: PAGE_ID, eyecatchUrl: ASSET }));
    expect(res.status).toBe(200);
  });
});
