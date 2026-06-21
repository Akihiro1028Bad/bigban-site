// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPage / updatePageProps を差し替え、buildBodyMirrorProps 等の純関数は実物を使う(#95)。
vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  getPage: vi.fn(),
  updatePageProps: vi.fn(),
}));

vi.mock("@/lib/growth/content", () => ({
  patchDraft: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { BODY_MIRROR_PROP, getPage, updatePageProps } from "@/lib/growth/notion";
import { patchDraft } from "@/lib/growth/content";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/draft/edit");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

function pageWith(contentId?: string) {
  const properties: Record<string, unknown> = {};
  if (contentId !== undefined) {
    properties["下書きID"] = { type: "rich_text", rich_text: [{ plain_text: contentId }] };
  }
  return { id: PAGE_ID, url: "", properties };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_CONTENT_API_KEY = "content-key";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
  vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
  vi.mocked(patchDraft).mockReset();
  vi.mocked(patchDraft).mockResolvedValue("g-abc");
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_CONTENT_API_KEY;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/draft/edit", () => {
  it("保存時にサーバで再サニタイズし、危険タグを除去して content キーで patch する", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));

    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>本文</p><script>alert(1)</script>" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const [endpoint, contentId, data, opts] = vi.mocked(patchDraft).mock.calls[0];
    expect(endpoint).toBe("news");
    expect(contentId).toBe("g-abc");
    const saved = (data as { bodyHtml: string }).bodyHtml;
    expect(saved).toContain("本文");
    expect(saved).not.toContain("<script");
    expect(saved).not.toContain("alert");
    expect((opts as { apiKey: string }).apiKey).toBe("content-key");

    // #95: Notion 本文ミラーも同じサニタイズ済みHTMLで更新される。
    const [mirrorPageId, mirrorProps] = vi.mocked(updatePageProps).mock.calls[0];
    expect(mirrorPageId).toBe(PAGE_ID);
    const mirror = (mirrorProps as Record<string, { rich_text: Array<{ text: { content: string } }> }>)[
      BODY_MIRROR_PROP
    ];
    expect(mirror.rich_text.map((r) => r.text.content).join("")).toBe(saved);
  });

  it("Notion ミラー更新が失敗したら 502(microCMS を叩かない / #95)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion write down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Notion/);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("下書き未作成(contentId 無し)は 404", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith());
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(404);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("contentId が不正形式なら 404(patch しない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("bad/../id"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(404);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("bodyHtml が空は 400", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "   " }));
    expect(res.status).toBe(400);
  });

  it("bodyHtml が文字列でないと 400", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: 123 }));
    expect(res.status).toBe(400);
  });

  it("本文が大きすぎる(上限超過)は 400(patch しない)", async () => {
    const huge = "<p>" + "あ".repeat(500_001) + "</p>";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: huge }));
    expect(res.status).toBe(400);
    expect(vi.mocked(patchDraft)).not.toHaveBeenCalled();
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "nope", bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(400);
  });

  it("不正な JSON は 400", async () => {
    const res = await POST(postRequest(null, undefined, "{not json"));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(500);
  });

  it("MICROCMS_CONTENT_API_KEY 未設定は 500(管理キーにフォールバックしない)", async () => {
    delete process.env.MICROCMS_CONTENT_API_KEY;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(500);
  });

  it("patchDraft が失敗したら 502", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    vi.mocked(patchDraft).mockRejectedValue(new Error("microcms down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
  });

  it("getPage が失敗したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(502);
  });

  it("認可ON+トークン不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+トークン未指定は 401(長さ不一致)", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postRequest(null, { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest("anything", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(401);
  });

  it("認可ON+正しいトークンは通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    vi.mocked(getPage).mockResolvedValue(pageWith("g-abc"));
    const res = await POST(postRequest("right", { pageId: PAGE_ID, bodyHtml: "<p>x</p>" }));
    expect(res.status).toBe(200);
  });
});
