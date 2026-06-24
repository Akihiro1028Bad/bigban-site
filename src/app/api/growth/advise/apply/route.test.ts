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
const BODY = "<p>これは導入の段落です。</p><p>本文の段落です。</p>";

const ADVICE = {
  summary: "総評",
  scores: [],
  strengths: [],
  fixes: [
    { area: "文体", severity: "中", quote: "導入の段落", reason: "硬い", suggestion: "やわらかく" },
    { area: "正確性", severity: "高", quote: "本文の段落", reason: "要確認", suggestion: "確認" },
  ],
};

function postReq(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/advise/apply");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

function page(opts: { applyStatus?: string; advice?: unknown; body?: string } = {}) {
  const properties: Record<string, unknown> = {};
  if (opts.applyStatus) properties["アドバイス反映ステータス"] = { select: { name: opts.applyStatus } };
  if (opts.advice !== undefined) {
    properties["アドバイスステータス"] = { select: { name: "提示中" } };
    properties["アドバイス結果"] = { rich_text: [{ plain_text: JSON.stringify(opts.advice) }] };
  }
  if (opts.body !== undefined) {
    properties["下書き本文HTML"] = { rich_text: [{ plain_text: opts.body }] };
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
  vi.restoreAllMocks();
});

describe("POST /api/growth/advise/apply", () => {
  it("採用候補に一致する index を依頼として記録する(200)", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ advice: ADVICE, body: BODY }));
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(updatePageProps).toHaveBeenCalledTimes(1);
    const props = vi.mocked(updatePageProps).mock.calls[0][1] as Record<string, unknown>;
    expect(props["アドバイス反映ステータス"]).toEqual({ select: { name: "依頼中" } });
  });

  it("認証失敗は 401（同長トークン不一致）", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postReq("wrong", { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(401);
  });

  it("認証失敗は 401（token 無し・長さ不一致）", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(401);
  });

  it("APPROVE_SECRET 未設定なら常に 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await POST(postReq("anything", { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(401);
  });

  it("不正な pageId は 400", async () => {
    const res = await POST(postReq(null, { pageId: "x", adoptedIndexes: [0] }));
    expect(res.status).toBe(400);
  });

  it("adoptedIndexes が配列でない/空/非整数は 400", async () => {
    expect((await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: "x" }))).status).toBe(400);
    expect((await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [] }))).status).toBe(400);
    expect((await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [1.5] }))).status).toBe(400);
    expect((await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [-1] }))).status).toBe(400);
  });

  it("JSON 本文が壊れていれば 400", async () => {
    const url = new URL("http://localhost/api/growth/advise/apply");
    const res = await POST(new Request(url, { method: "POST", body: "{壊れ" }));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(500);
  });

  it("処理中/提示中は 409", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ applyStatus: "処理中", advice: ADVICE, body: BODY }));
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(409);
  });

  it("アドバイス未提示は 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ body: BODY }));
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(400);
  });

  it("採用が反映不可カテゴリのみ(index=1)なら 400", async () => {
    vi.mocked(getPage).mockResolvedValue(page({ advice: ADVICE, body: BODY }));
    // index 1 は area=正確性 → 反映対象外
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [1] }));
    expect(res.status).toBe(400);
  });

  it("getPage が失敗したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await POST(postReq(null, { pageId: PAGE_ID, adoptedIndexes: [0] }));
    expect(res.status).toBe(502);
  });
});
