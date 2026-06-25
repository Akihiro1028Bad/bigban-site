// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageSelect: vi.fn(), defaultFetch: vi.fn() };
});
vi.mock("@/lib/growth/content", () => ({ publishContent: vi.fn(), patchDraft: vi.fn() }));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { patchDraft, publishContent } from "@/lib/growth/content";
import { getPage, updatePageSelect } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const SECRET = "open-sesame";

function postReq(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/publish");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

function page(opts: { contentId?: string; eyecatch?: string; body?: string; title?: string } = {}) {
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
  if (opts.title !== undefined) {
    properties["タイトル案"] = { type: "title", title: [{ plain_text: opts.title }] };
  }
  return { id: PAGE_ID, url: "", properties };
}

const READY = page({
  contentId: "my-article",
  eyecatch: "https://images.microcms-assets.io/x.png",
  body: "<p>本文</p>",
  title: "公開する承認タイトル",
});

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.MICROCMS_SERVICE_DOMAIN = "thepicklebang";
  process.env.MICROCMS_MANAGEMENT_API_KEY = "mgmt-key";
  process.env.MICROCMS_CONTENT_API_KEY = "content-key";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageSelect).mockReset();
  vi.mocked(publishContent).mockReset().mockResolvedValue(undefined);
  vi.mocked(patchDraft).mockReset().mockResolvedValue("my-article");
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
  delete process.env.MICROCMS_SERVICE_DOMAIN;
  delete process.env.MICROCMS_MANAGEMENT_API_KEY;
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
    // #176: 公開直前に Notion タイトル案を microCMS 下書きの title へ最終同期する(content キー)。
    expect(patchDraft).toHaveBeenCalledWith(
      "news",
      "my-article",
      { title: "公開する承認タイトル" },
      expect.objectContaining({ apiKey: "content-key" })
    );
    // タイトル同期 → 公開の順(公開後に title を変えない)。
    expect(vi.mocked(patchDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(publishContent).mock.invocationCallOrder[0]
    );
  });

  it("既に公開済みなら 409(冪等・二重公開や手直しタイトルの再上書きを防ぐ・#SPEC-14)", async () => {
    const published = {
      id: PAGE_ID,
      url: "",
      properties: {
        ...READY.properties,
        ステータス: { type: "select", select: { name: "公開済み" } },
      },
    };
    vi.mocked(getPage).mockResolvedValue(published);
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(409);
    expect(publishContent).not.toHaveBeenCalled();
    expect(patchDraft).not.toHaveBeenCalled();
  });

  it("MICROCMS_CONTENT_API_KEY 未設定は 500(タイトル最終同期に必要)", async () => {
    delete process.env.MICROCMS_CONTENT_API_KEY;
    vi.mocked(getPage).mockResolvedValue(READY);
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(500);
    expect(publishContent).not.toHaveBeenCalled();
  });

  it("タイトル案が空でも公開はする(title 同期はスキップ)", async () => {
    vi.mocked(getPage).mockResolvedValue(
      page({
        contentId: "my-article",
        eyecatch: "https://images.microcms-assets.io/x.png",
        body: "<p>本文</p>",
        title: "   ",
      })
    );
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(200);
    expect(patchDraft).not.toHaveBeenCalled();
    expect(publishContent).toHaveBeenCalled();
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

  it("microCMS 管理キーが無ければ 500", async () => {
    delete process.env.MICROCMS_MANAGEMENT_API_KEY;
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
