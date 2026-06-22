// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  queryDataSource: vi.fn(),
  updatePageSelect: vi.fn(),
  defaultFetch: vi.fn(),
}));

// 合言葉認証フラグはテストごとに切り替える(既定は有効=現行の token 検証)。
const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { queryDataSource, updatePageSelect } from "@/lib/growth/notion";
import { GET, POST } from "./route";

const SECRET = "approve-secret-token";

function getRequest(token: string | null): Request {
  const url = new URL("http://localhost/api/growth/approve");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url);
}

function postRequest(token: string | null, body: unknown): Request {
  const url = new URL("http://localhost/api/growth/approve");
  if (token !== null) url.searchParams.set("token", token);
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(queryDataSource).mockReset();
  vi.mocked(updatePageSelect).mockReset();
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
});

describe("GET", () => {
  it("正しい token で承認待ち一覧を返す", async () => {
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({
        pages: [
          {
            id: "p1",
            url: "",
            properties: {
              "施策名": { title: [{ plain_text: "市川ページ" }] },
              "カテゴリ": { select: { name: "サイト表示内容" } },
              "確度": { select: { name: "高" } },
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      })
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null });

    const res = await GET(getRequest(SECRET));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.items).toEqual([
      {
        id: "p1",
        kind: "proposal",
        title: "市川ページ",
        subtitle: "サイト表示内容",
        details: [{ label: "確度", value: "高" }],
        score: 0,
        stage: "untouched",
      },
    ]);
    expect(queryDataSource).toHaveBeenCalledTimes(2);
  });

  it("記事は全段階(提案中/承認/生成中/下書き作成済み)を横断取得する(#106)", async () => {
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null });
    await GET(getRequest(SECRET));
    const ideasArgs = vi.mocked(queryDataSource).mock.calls[1];
    expect(ideasArgs[1].filter).toEqual({
      or: [
        { property: "ステータス", select: { equals: "提案中" } },
        { property: "ステータス", select: { equals: "承認" } },
        { property: "ステータス", select: { equals: "生成中" } },
        { property: "ステータス", select: { equals: "下書き作成済み" } },
      ],
    });
  });

  it("施策は未処理＋承認を取得する(#106)", async () => {
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null });
    await GET(getRequest(SECRET));
    const proposalArgs = vi.mocked(queryDataSource).mock.calls[0];
    expect(proposalArgs[1].filter).toEqual({
      or: [
        { property: "ステータス", select: { equals: "未処理" } },
        { property: "ステータス", select: { equals: "承認" } },
      ],
    });
  });

  it("token 不一致は 401", async () => {
    const res = await GET(getRequest("wrong"));
    expect(res.status).toBe(401);
    expect(queryDataSource).not.toHaveBeenCalled();
  });

  it("APPROVE_SECRET 未設定は 401", async () => {
    delete process.env.APPROVE_SECRET;
    const res = await GET(getRequest(SECRET));
    expect(res.status).toBe(401);
  });

  it("token 未指定は 401", async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(getRequest(SECRET));
    expect(res.status).toBe(500);
  });
});

describe("POST", () => {
  it("decisions を Notion に反映し件数を返す", async () => {
    vi.mocked(updatePageSelect).mockResolvedValue("ok");
    const res = await POST(
      postRequest(SECRET, {
        decisions: [
          { id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" },
          { id: "5adab8b1f1824123b9639463a2580d4a", decision: "却下" },
        ],
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, updated: 2 });
    expect(updatePageSelect).toHaveBeenCalledTimes(2);
    expect(updatePageSelect).toHaveBeenCalledWith(
      "38099efa-346b-8122-9681-f4d2cc321a31",
      "ステータス",
      "承認",
      expect.anything()
    );
  });

  it("不正なボディは 400", async () => {
    const res = await POST(postRequest(SECRET, { decisions: [{ id: "x!", decision: "承認" }] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/不正な id/);
    expect(updatePageSelect).not.toHaveBeenCalled();
  });

  it("token 不一致は 401", async () => {
    const res = await POST(postRequest("wrong", { decisions: [] }));
    expect(res.status).toBe(401);
  });

  it("NOTION_TOKEN 未設定は 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await POST(postRequest(SECRET, { decisions: [] }));
    expect(res.status).toBe(500);
  });

  it("Notion 更新が失敗したら 502(詳細は返さない)", async () => {
    vi.mocked(updatePageSelect).mockRejectedValue(new Error("Notion 500: secret detail"));
    const res = await POST(
      postRequest(SECRET, {
        decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" }],
      })
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("更新中にエラーが発生しました");
    expect(json.error).not.toMatch(/secret detail/);
  });
});

describe("認証無効(APPROVE_AUTH_ENABLED=false)", () => {
  beforeEach(() => {
    flags.authEnabled = false;
  });

  it("GET は token 無しでも 200(検証スキップ)", async () => {
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null });
    const res = await GET(getRequest(null));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("POST は token 無しでも反映する(検証スキップ)", async () => {
    vi.mocked(updatePageSelect).mockResolvedValue("ok");
    const res = await POST(
      postRequest(null, {
        decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" }],
      })
    );
    expect(res.status).toBe(200);
    expect(updatePageSelect).toHaveBeenCalledTimes(1);
  });

  it("認証無効でも NOTION_TOKEN 未設定なら 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(getRequest(null));
    expect(res.status).toBe(500);
  });
});
