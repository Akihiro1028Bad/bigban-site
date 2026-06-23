// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  getPage: vi.fn(),
  updatePageProps: vi.fn(),
  defaultFetch: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage, updatePageProps } from "@/lib/growth/notion";
import { POST } from "./route";

const SECRET = "approve-secret-token";
const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/revise");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function pageWithStatus(name?: string) {
  return {
    id: PAGE_ID,
    url: "",
    properties: name ? { "修正ステータス": { select: { name } } } : {},
  };
}

const COMMENTS = [{ line: "## 見出し", comment: "3つを箇条書きで" }];

beforeEach(() => {
  flags.authEnabled = false; // 既定はオフ(#36)。MVP は認可なし。
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("POST /api/growth/revise", () => {
  it("修正指示+依頼中+依頼時刻を1 PATCHで書き込む", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithStatus());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);

    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(updatePageProps).toHaveBeenCalledTimes(1);
    const [id, props] = vi.mocked(updatePageProps).mock.calls[0];
    expect(id).toBe(PAGE_ID);
    const p = props as Record<string, { select?: { name: string }; date?: { start: string }; rich_text?: unknown }>;
    expect(p["修正ステータス"]).toEqual({ select: { name: "依頼中" } });
    expect(p["修正指示"].rich_text).toEqual([
      { text: { content: JSON.stringify(COMMENTS) } },
    ]);
    // 依頼時刻は ISO 文字列
    expect(p["修正依頼時刻"].date?.start).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it.each(["依頼中", "処理中", "提示中"])("既に %s なら 409(再依頼拒否)", async (status) => {
    vi.mocked(getPage).mockResolvedValue(pageWithStatus(status));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postRequest(null, { pageId: "bad!", comments: COMMENTS }));
    expect(res.status).toBe(400);
  });

  it("コメントが空配列かつタイトル指示も無いなら 400(#139 B)", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: [] }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("コメントもタイトル指示も無いなら 400(#139 B)", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID }));
    expect(res.status).toBe(400);
  });

  it("タイトル指示が長すぎる(500文字超)なら 400(#139 B)", async () => {
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, titleInstruction: "あ".repeat(501) })
    );
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("コメントが非空だが要素が不正なら 400(#139 B)", async () => {
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: [{ line: "a" }] }));
    expect(res.status).toBe(400);
    expect(updatePageProps).not.toHaveBeenCalled();
  });

  it("タイトル指示だけでも依頼できる(構成案コメントは空・#139 B)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithStatus());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, titleInstruction: "  もっと短く  " })
    );
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { rich_text?: unknown; select?: { name: string } }>;
    expect(p["修正指示"].rich_text).toEqual([]);
    expect(p["修正タイトル指示"].rich_text).toEqual([{ text: { content: "もっと短く" } }]);
    expect(p["修正ステータス"]).toEqual({ select: { name: "依頼中" } });
  });

  it("構成案コメントとタイトル指示の両方を1 PATCHで書き込む(#139 B)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithStatus());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(
      postRequest(null, { pageId: PAGE_ID, comments: COMMENTS, titleInstruction: "タイトルも短く" })
    );
    expect(res.status).toBe(200);
    const [, props] = vi.mocked(updatePageProps).mock.calls[0];
    const p = props as Record<string, { rich_text?: unknown }>;
    expect(p["修正指示"].rich_text).toEqual([{ text: { content: JSON.stringify(COMMENTS) } }]);
    expect(p["修正タイトル指示"].rich_text).toEqual([{ text: { content: "タイトルも短く" } }]);
  });

  it("不正な JSON ボディは 400", async () => {
    const url = new URL("http://localhost/api/growth/revise");
    const req = new Request(url, { method: "POST", body: "not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(500);
  });

  it("Notion 失敗時は 502(詳細は返さない)", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion 500: secret"));
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/secret/);
  });

  it("認可ON時、token 不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = SECRET;
    const res = await POST(postRequest("wrong", { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(401);
    expect(getPage).not.toHaveBeenCalled();
  });

  it("認可ON時、APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postRequest("x", { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、token 未指定は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = SECRET;
    const res = await POST(postRequest(null, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(401);
  });

  it("認可ON時、正しい token なら通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = SECRET;
    vi.mocked(getPage).mockResolvedValue(pageWithStatus());
    vi.mocked(updatePageProps).mockResolvedValue(PAGE_ID);
    const res = await POST(postRequest(SECRET, { pageId: PAGE_ID, comments: COMMENTS }));
    expect(res.status).toBe(200);
  });
});
