// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  getPage: vi.fn(),
}));

vi.mock("@/lib/growth/content", () => ({ patchDraft: vi.fn() }));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage } from "@/lib/growth/notion";
import { patchDraft } from "@/lib/growth/content";
import { EXCERPT_HARD_MAX } from "@/lib/growth/excerptDraft";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/draft/excerpt");
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request(url, { method: "POST", headers, body: raw ?? JSON.stringify(body) });
}

function pageWith(contentId?: string, media?: string) {
  const properties: Record<string, unknown> = {};
  if (contentId !== undefined) {
    properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: contentId }] };
  }
  if (media !== undefined) {
    properties["媒体"] = { select: { name: media } };
  }
  return { id: PAGE_ID, url: "", properties };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_API_KEY = "content-key";
  vi.mocked(getPage).mockReset().mockResolvedValue(pageWith("g-abc"));
  vi.mocked(patchDraft).mockReset().mockResolvedValue("g-abc");
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_API_KEY;
  delete process.env.APPROVE_SECRET;
  delete process.env.GROWTH_MICROCMS_ENDPOINT;
});

describe("POST /api/growth/draft/excerpt", () => {
  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });
    const res = await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "市川の屋内コートで打てる" }));
    expect(res.status).toBe(409);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("excerpt を content キーで patch する(200)", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "市川の屋内コートで打てる" }));
    expect(res.status).toBe(200);
    const [endpoint, contentId, data, opts] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-abc");
    expect((data as { excerpt: string }).excerpt).toBe("市川の屋内コートで打てる");
    expect((opts as { apiKey: string }).apiKey).toBe("content-key");
  });

  it("媒体=ニュースなら GROWTH_MICROCMS_ENDPOINT=columns でも news 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-news", "ニュース"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "ニュース本文" }));
    expect(res.status).toBe(200);
    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-news");
  });

  it("媒体=コラムなら GROWTH_MICROCMS_ENDPOINT=columns の columns 下書きを更新する", async () => {
    process.env.GROWTH_MICROCMS_ENDPOINT = "columns";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-column", "コラム"));

    const res = await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "コラム本文" }));
    expect(res.status).toBe(200);
    const [endpoint, contentId] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("columns");
    expect(contentId).toBe("g-column");
  });

  it("excerpt が長すぎると 400(patch しない)", async () => {
    const long = "あ".repeat(EXCERPT_HARD_MAX + 1);
    const res = await POST(postRequest(null, { pageId: PAGE_ID, excerpt: long }));
    expect(res.status).toBe(400);
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("excerpt が文字列でないと 400", async () => {
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: 123 }))).status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    expect((await POST(postRequest(null, { pageId: "nope", excerpt: "x" }))).status).toBe(400);
  });

  it("不正な JSON は 400", async () => {
    expect((await POST(postRequest(null, undefined, "{not json"))).status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(500);
  });

  it("CONTENT キー未設定は 500", async () => {
    delete process.env.MICROCMS_API_KEY;
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(500);
  });

  it("下書き未作成(contentId 無し)は 404", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith());
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(404);
  });

  it("getPage が失敗したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(502);
  });

  it("patchDraft が失敗したら 502", async () => {
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));
    expect((await POST(postRequest(null, { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(502);
  });

  it("認可ON+トークン不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    expect((await POST(postRequest("wrong", { pageId: PAGE_ID, excerpt: "x" }))).status).toBe(401);
  });
});
