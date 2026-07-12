// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/growth/notion")>();
  return { ...actual, getPage: vi.fn(), updatePageProps: vi.fn(), defaultFetch: vi.fn() };
});

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: false } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";
const SECRET = "open-sesame";
const BODY = "<p>一文目です。二文目です。</p>";
const COMMENT = { blockIndex: 0, excerpt: "一文目です。", comment: "やわらかく" };

function postReq(token: string | null, body: unknown, raw?: string): Request {
  const url = new URL("http://localhost/api/growth/body-comment");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: raw ?? JSON.stringify(body) });
}

function page(opts: { commentStatus?: string; body?: string } = {}) {
  const properties: Record<string, unknown> = {};
  if (opts.commentStatus) properties["本文コメントステータス"] = { select: { name: opts.commentStatus } };
  if (opts.body !== undefined) properties["下書き本文HTML"] = { rich_text: [{ plain_text: opts.body }] };
  return { id: PAGE_ID, url: "", properties };
}

function writtenRequestJson(): unknown {
  const [, props] = vi.mocked(updatePageProps).mock.calls[0];
  const p = props as Record<string, { rich_text?: Array<{ text: { content: string } }> }>;
  return JSON.parse(p["本文コメント指示"].rich_text!.map((r) => r.text.content).join(""));
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  process.env.APPROVE_SECRET = SECRET;
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset().mockResolvedValue(PAGE_ID);
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
  vi.restoreAllMocks();
});

describe("POST /api/growth/body-comment", () => {
  it("生成中の記事は 409 で弾く(#H9)", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: PAGE_ID,
      url: "",
      properties: { "ステータス": { select: { name: "生成中" } } },
    });
    const res = await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("アンカーできるコメントを依頼として記録する(200・依頼中)", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { select?: { name: string }; rich_text?: Array<{ text: { content: string } }> }>;
    expect(p["本文コメントステータス"].select?.name).toBe("依頼中");
    expect(JSON.parse(p["本文コメント指示"].rich_text!.map((r) => r.text.content).join(""))).toEqual({
      comments: [COMMENT],
    });
  });

  it("overall 単独はアンカー検証せず依頼として記録する(200)", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID, overall: "全体にヘッジが多い" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(writtenRequestJson()).toEqual({
      comments: [],
      overall: "全体にヘッジが多い",
    });
  });

  it("comments の項目がスキーマ不一致なら 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID, comments: [{ blockIndex: -1 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("コメントを入力してください。");
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("overall が2000字を超えると 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID, overall: "あ".repeat(2001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("全体コメントが長すぎます。");
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("overall と comments が両方非空なら 400", async () => {
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID, overall: "x", comments: [COMMENT] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("同時に送れません");
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("overall と comments が両方空/未指定なら 400", async () => {
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("コメントを入力してください。");
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("overall 単独でも処理中/提示中の行は 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ commentStatus: "提示中", body: BODY }));
    const res = await POST(postReq(SECRET, { pageId: PAGE_ID, overall: "全体を見直して" }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("認証有効＋トークン不一致は 401", async () => {
    flags.authEnabled = true;
    expect((await POST(postReq("wrong", { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(401);
  });

  it("認証有効＋正規トークンは通る", async () => {
    flags.authEnabled = true;
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    expect((await POST(postReq(SECRET, { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(200);
  });

  it("認証有効＋トークン無しは 401", async () => {
    flags.authEnabled = true;
    expect((await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(401);
  });

  it("認証有効＋APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    expect((await POST(postReq("anything", { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(401);
  });

  it("壊れた JSON は 400", async () => {
    expect((await POST(postReq(null, null, "{壊れ"))).status).toBe(400);
  });

  it("不正な pageId は 400", async () => {
    expect((await POST(postReq(null, { pageId: "x", comments: [COMMENT] }))).status).toBe(400);
  });

  it("コメントが空/不正は 400", async () => {
    expect((await POST(postReq(null, { pageId: PAGE_ID, comments: [] }))).status).toBe(400);
    expect((await POST(postReq(null, { pageId: PAGE_ID, comments: "x" }))).status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    expect((await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(500);
  });

  it("処理中/提示中の行は 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ commentStatus: "処理中", body: BODY }));
    const res = await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("本文に一致するコメントが無ければ 400(要確認)", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(
      postReq(null, { pageId: PAGE_ID, comments: [{ blockIndex: 0, excerpt: "存在しない。", comment: "x" }] })
    );
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("Notion プロパティ欠落は 500 ＋ どのプロパティかを返す(#177)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    vi.mocked(updatePageProps).mockRejectedValue(
      new Error("本文コメント指示 is not a property that exists")
    );
    const res = await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("本文コメント指示");
  });

  it("その他の書き込み失敗は 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    vi.mocked(updatePageProps).mockRejectedValue(new Error("notion down"));
    expect((await POST(postReq(null, { pageId: PAGE_ID, comments: [COMMENT] }))).status).toBe(502);
  });
});
