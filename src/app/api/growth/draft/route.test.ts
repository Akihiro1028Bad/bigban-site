// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getPage だけを差し替え、draftBodyOf/ideaTitleOf 等は実物を使う(#95)。
vi.mock("@/lib/growth/notion", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth/notion")>()),
  getPage: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { getPage } from "@/lib/growth/notion";
import { GET } from "./route";

const PAGE_ID = "38099efa-346b-8122-9681-f4d2cc321a31";

function getRequest(token: string | null, pageId: string | null): Request {
  const url = new URL("http://localhost/api/growth/draft");
  if (token !== null) url.searchParams.set("token", token);
  if (pageId !== null) url.searchParams.set("pageId", pageId);
  return new Request(url, { method: "GET" });
}

// #95: 本文ミラー(下書き本文HTML)＋タイトル案を持つ Notion ページ。
// #141: アイキャッチURL(任意)も持てる。
function pageWithMirror(bodyHtml?: string, title = "夜のピックル", eyecatch?: string) {
  const properties: Record<string, unknown> = {
    "タイトル案": { type: "title", title: [{ plain_text: title }] },
  };
  if (bodyHtml !== undefined) {
    properties["下書き本文HTML"] = {
      type: "rich_text",
      rich_text: [{ plain_text: bodyHtml }],
    };
  }
  if (eyecatch !== undefined) {
    properties["アイキャッチURL"] = { type: "url", url: eyecatch };
  }
  return { id: PAGE_ID, url: "", properties };
}

beforeEach(() => {
  flags.authEnabled = false;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(getPage).mockReset();
});

afterEach(() => {
  delete process.env.NOTION_TOKEN;
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/draft", () => {
  it("Notion 本文ミラーから下書き本文を返す(#95: microCMS を読まない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithMirror("<p>本文</p>"));

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      exists: true,
      draft: {
        title: "夜のピックル",
        displayMode: "html",
        bodyHtml: "<p>本文</p>",
        body: "",
        eyecatch: "",
        advice: { status: "なし", advice: null, raw: "" },
        adviceApply: { status: "なし", proposal: [], raw: "" },
        decorate: { status: "なし", proposals: [], raw: "" },
        bodyRegen: { status: "なし", targetSrc: "" },
        eyecatchRegen: { status: "なし" },
        bodyComment: { status: "なし", comments: [], raw: "" },
      },
    });
  });

  it("AI再生成の依頼中ステータスを draft に含める(#166)", async () => {
    const page = pageWithMirror("<p>本文</p>");
    page.properties["本文画像再生成ステータス"] = { select: { name: "処理中" } };
    page.properties["本文画像再生成対象"] = {
      rich_text: [{ plain_text: "https://images.microcms-assets.io/assets/a/1.png" }],
    };
    page.properties["アイキャッチ再生成ステータス"] = { select: { name: "依頼中" } };
    vi.mocked(getPage).mockResolvedValue(page);

    const json = await (await GET(getRequest(null, PAGE_ID))).json();
    expect(json.draft.bodyRegen).toEqual({
      status: "処理中",
      targetSrc: "https://images.microcms-assets.io/assets/a/1.png",
    });
    expect(json.draft.eyecatchRegen).toEqual({ status: "依頼中" });
  });

  it("提示中の装飾提案を draft.decorate に含める(#147)", async () => {
    const proposals = [
      { id: "p1", blockIndex: 0, excerpt: "本文", op: "add", decoration: "note", reason: "注意喚起" },
    ];
    const page = pageWithMirror("<p>本文</p>");
    page.properties["装飾ステータス"] = { type: "select", select: { name: "提示中" } };
    page.properties["装飾提案"] = {
      type: "rich_text",
      rich_text: [{ plain_text: JSON.stringify(proposals) }],
    };
    vi.mocked(getPage).mockResolvedValue(page);
    const res = await GET(getRequest(null, PAGE_ID));
    const json = await res.json();
    expect(json.draft.decorate.status).toBe("提示中");
    expect(json.draft.decorate.proposals).toEqual(proposals);
  });

  it("提示中のアドバイスを draft.advice に含める(#146)", async () => {
    const advice = {
      summary: "具体性が弱い",
      scores: [{ axis: "具体性", score: 2 }],
      strengths: ["導入が良い"],
      fixes: [{ area: "文体", severity: "中", reason: "翻訳調", suggestion: "言い換え" }],
    };
    const page = pageWithMirror("<p>本文</p>");
    page.properties["アドバイスステータス"] = { type: "select", select: { name: "提示中" } };
    page.properties["アドバイス結果"] = {
      type: "rich_text",
      rich_text: [{ plain_text: JSON.stringify(advice) }],
    };
    vi.mocked(getPage).mockResolvedValue(page);
    const res = await GET(getRequest(null, PAGE_ID));
    const json = await res.json();
    expect(json.draft.advice.status).toBe("提示中");
    expect(json.draft.advice.advice).toEqual(advice);
  });

  it("アイキャッチURL があれば draft.eyecatch に含める(#141)", async () => {
    vi.mocked(getPage).mockResolvedValue(
      pageWithMirror("<p>本文</p>", "夜のピックル", "https://images.microcms-assets.io/x.png"),
    );
    const res = await GET(getRequest(null, PAGE_ID));
    const json = await res.json();
    expect(json.draft.eyecatch).toBe("https://images.microcms-assets.io/x.png");
  });

  it("本文ミラー未保存は exists:false(エラーにしない)", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithMirror());

    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, exists: false, draft: null });
  });

  it("本文ミラーがあれば advice 未設定でも advice:なし を含める", async () => {
    vi.mocked(getPage).mockResolvedValue(pageWithMirror("<p>本文</p>"));
    const res = await GET(getRequest(null, PAGE_ID));
    const json = await res.json();
    expect(json.draft.advice).toEqual({ status: "なし", advice: null, raw: "" });
  });

  it("getPage が throw したら 502", async () => {
    vi.mocked(getPage).mockRejectedValue(new Error("notion down"));
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(502);
  });

  it("不正な pageId は 400", async () => {
    const res = await GET(getRequest(null, "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("pageId 未指定は 400", async () => {
    const res = await GET(getRequest(null, null));
    expect(res.status).toBe(400);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(500);
  });

  it("認可ON+トークン不一致は 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await GET(getRequest("wrong", PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+トークン未指定は 401(長さ不一致)", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    const res = await GET(getRequest(null, PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+APPROVE_SECRET 未設定は 401", async () => {
    flags.authEnabled = true;
    delete process.env.APPROVE_SECRET;
    const res = await GET(getRequest("anything", PAGE_ID));
    expect(res.status).toBe(401);
  });

  it("認可ON+正しいトークンは通る", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "right";
    vi.mocked(getPage).mockResolvedValue(pageWithMirror("<p>本文</p>"));
    const res = await GET(getRequest("right", PAGE_ID));
    expect(res.status).toBe(200);
  });
});
