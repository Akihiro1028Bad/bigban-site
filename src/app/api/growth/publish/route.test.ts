// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageSelect: vi.fn(), defaultFetch: vi.fn() };
});
vi.mock("@/lib/growth/content", () => ({ publishContent: vi.fn() }));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { publishContent } from "@/lib/growth/content";
import { getPage, updatePageSelect } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const SECRET = "open-sesame";

function postReq(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/publish");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

function page(opts: { contentId?: string; eyecatch?: string; body?: string } = {}) {
  const properties: Record<string, unknown> = {};
  if (opts.contentId !== undefined) {
    properties["下書きID"] = { rich_text: [{ plain_text: opts.contentId }] };
  }
  if (opts.eyecatch !== undefined) {
    properties["アイキャッチURL"] = { type: "url", url: opts.eyecatch };
  }
  if (opts.body !== undefined) {
    properties["下書き本文HTML"] = { rich_text: [{ plain_text: opts.body }] };
  }
  return { id: PAGE_ID, url: "", properties };
}

const READY = page({
  contentId: "my-article",
  eyecatch: "https://images.microcms-assets.io/x.png",
  body: "<p>本文</p>",
});

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_CONTENT_API_KEY = "content-key";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageSelect).mockReset();
  vi.mocked(publishContent).mockReset().mockResolvedValue("my-article");
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_CONTENT_API_KEY;
  vi.restoreAllMocks();
});

describe("POST /api/growth/publish", () => {
  it("認証有効＋正規トークン＋検証OKで公開し、ステータスを公開済みにする(200)", async () => {
    vi.mocked(getPage).mockResolvedValue(READY);
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(publishContent).toHaveBeenCalledWith("news", "my-article", expect.anything());
    expect(updatePageSelect).toHaveBeenCalledWith(PAGE_ID, "ステータス", "公開済み", expect.anything());
  });

  it("APPROVE_AUTH_ENABLED が無効なら常に 401(公開は最強権限)", async () => {
    flags.authEnabled = false;
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(401);
    expect(publishContent).not.toHaveBeenCalled();
  });

  it("トークン不一致は 401", async () => {
    expect((await POST(postReq("wrong", { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("トークン無しは 401", async () => {
    expect((await POST(postReq(null, { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID }))).status).toBe(500);
  });

  it("APPROVE_SECRET 未設定は 401", async () => {
    delete process.env.APPROVE_SECRET;
    expect((await POST(postReq("anything", { pageId: PAGE_ID }))).status).toBe(401);
  });

  it("壊れた JSON は 400", async () => {
    expect((await POST(postReq(SECRET, null, "{壊れ"))).status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    expect((await POST(postReq(SECRET, { pageId: "x" }))).status).toBe(400);
  });

  it("NOTION_TOKEN / microCMS 設定が無ければ 500", async () => {
    delete process.env.MICROCMS_CONTENT_API_KEY;
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID }))).status).toBe(500);
  });

  it("下書きID が無ければ 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ eyecatch: "https://images.microcms-assets.io/x.png", body: "<p>本文</p>" }));
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(400);
    expect(publishContent).not.toHaveBeenCalled();
  });

  it("アイキャッチが無ければ 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ contentId: "my-article", body: "<p>本文</p>" }));
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID }))).status).toBe(400);
  });

  it("本文が空なら 400", async () => {
    vi.mocked(getPage).mockResolvedValue(
      page({ contentId: "my-article", eyecatch: "https://images.microcms-assets.io/x.png", body: "   " })
    );
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID }))).status).toBe(400);
  });

  it("公開処理が失敗したら 502", async () => {
    vi.mocked(getPage).mockResolvedValue(READY);
    vi.mocked(publishContent).mockRejectedValue(new Error("microcms down"));
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID }))).status).toBe(502);
  });
});
