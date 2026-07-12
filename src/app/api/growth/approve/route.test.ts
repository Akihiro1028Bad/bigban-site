// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  getPage: vi.fn(),
  queryDataSource: vi.fn(),
  updatePageProps: vi.fn(),
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

import { getPage, queryDataSource, updatePageProps, updatePageSelect } from "@/lib/growth/notion";
import { GET, POST } from "./route";

const SECRET = "approve-secret-token";

function authHeaders(token: string | null): Record<string, string> {
  return token !== null ? { authorization: `Bearer ${token}` } : {};
}

function getRequest(token: string | null): Request {
  return new Request("http://localhost/api/growth/approve", { headers: authHeaders(token) });
}

function postRequest(token: string | null, body: unknown): Request {
  return new Request("http://localhost/api/growth/approve", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(queryDataSource).mockReset();
  vi.mocked(getPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
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

  it("記事は却下を含む全管理状態を横断取得する(#106/#167)", async () => {
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
        { property: "ステータス", select: { equals: "公開済み" } },
        { property: "ステータス", select: { equals: "却下" } },
      ],
    });
  });

  it("施策は却下を含む全管理状態を取得する", async () => {
    vi.mocked(queryDataSource)
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ pages: [], hasMore: false, nextCursor: null });
    await GET(getRequest(SECRET));
    const proposalArgs = vi.mocked(queryDataSource).mock.calls[0];
    expect(proposalArgs[1].filter).toEqual({
      or: [
        { property: "ステータス", select: { equals: "未処理" } },
        { property: "ステータス", select: { equals: "承認" } },
        { property: "ステータス", select: { equals: "成果物化済" } },
        { property: "ステータス", select: { equals: "実行中" } },
        { property: "ステータス", select: { equals: "実行済み" } },
        { property: "ステータス", select: { equals: "却下" } },
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

  it("Notion 取得が失敗したら 502(空ボディではなく JSON で詳細を返さない)", async () => {
    vi.mocked(queryDataSource).mockRejectedValue(new Error("Notion 400: secret detail"));
    const res = await GET(getRequest(SECRET));
    expect(res.status).toBe(502);
    // 本文が空でない JSON であること(クライアントの res.json() が壊れない)
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("取得中にエラーが発生しました");
    expect(json.error).not.toMatch(/secret detail/);
  });
});

describe("POST", () => {
  it("decisions を Notion に反映し件数を返す", async () => {
    vi.mocked(getPage)
      .mockResolvedValueOnce({
        id: "38099efa-346b-8122-9681-f4d2cc321a31",
        url: "",
        properties: {
          "施策名": { title: [{ plain_text: "施策" }] },
          "ステータス": { select: { name: "未処理" } },
        },
      })
      .mockResolvedValueOnce({
        id: "5adab8b1f1824123b9639463a2580d4a",
        url: "",
        properties: {
          "タイトル案": { title: [{ plain_text: "記事" }] },
          "ステータス": { select: { name: "提案中" } },
        },
      });
    vi.mocked(updatePageProps).mockResolvedValue("ok");
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
    expect(updatePageProps).toHaveBeenCalledTimes(2);
    expect(updatePageProps).toHaveBeenCalledWith(
      "38099efa-346b-8122-9681-f4d2cc321a31",
      { "ステータス": { select: { name: "承認" } } },
      expect.anything()
    );
  });

  it.each(["生成中", "公開済み"])("記事が%sへ進んだ後の遅延decisionは409で拒否する", async (status) => {
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      url: "",
      properties: {
        "タイトル案": { title: [{ plain_text: "記事" }] },
        "ステータス": { select: { name: status } },
      },
    });

    const res = await POST(
      postRequest(SECRET, {
        decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "提案中" }],
      })
    );

    expect(res.status).toBe(409);
    expect(updatePageProps).not.toHaveBeenCalled();
    expect(updatePageSelect).not.toHaveBeenCalled();
  });

  it("不正なボディは 400", async () => {
    const res = await POST(postRequest(SECRET, { decisions: [{ id: "x!", decision: "承認" }] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/不正な id/);
    expect(updatePageProps).not.toHaveBeenCalled();
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
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      url: "",
      properties: {
        "施策名": { title: [{ plain_text: "施策" }] },
        "ステータス": { select: { name: "未処理" } },
      },
    });
    vi.mocked(updatePageProps).mockRejectedValue(new Error("Notion 500: secret detail"));
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

  it("成果物化済の施策は実行済みに進められ、実行完了日時も保存する", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      url: "",
      properties: {
        "施策名": { title: [{ plain_text: "施策" }] },
        "ステータス": { select: { name: "成果物化済" } },
      },
    });
    vi.mocked(updatePageProps).mockResolvedValue("ok");

    const res = await POST(
      postRequest(SECRET, {
        decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "実行済み" }],
      })
    );

    expect(res.status).toBe(200);
    expect(updatePageProps).toHaveBeenCalledWith(
      "38099efa-346b-8122-9681-f4d2cc321a31",
      {
        "ステータス": { select: { name: "実行済み" } },
        "実行完了日時": { date: { start: expect.any(String) } },
      },
      expect.anything()
    );
  });

  it.each([
    ["記事", "承認", "提案中"],
    ["記事", "却下", "提案中"],
    ["施策", "承認", "未処理"],
    ["施策", "却下", "未処理"],
    ["施策", "未処理", "却下"],
    ["施策", "成果物化済", "実行中"],
    ["施策", "成果物化済", "クローズ"],
    ["施策", "実行中", "実行済み"],
    ["施策", "実行中", "成果物化済"],
    ["施策", "実行済み", "実行中"],
  ])("%sの%sから%sへの有効な遷移を許可する", async (kind, current, decision) => {
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      url: "",
      properties: {
        [kind === "記事" ? "タイトル案" : "施策名"]: { title: [{ plain_text: kind }] },
        "ステータス": { select: { name: current } },
      },
    });
    vi.mocked(updatePageProps).mockResolvedValue("ok");
    const res = await POST(postRequest(SECRET, {
      decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision }],
    }));
    expect(res.status).toBe(200);
  });

  it("種別を判定できないページの更新は拒否する", async () => {
    vi.mocked(getPage).mockResolvedValue({ id: "38099efa-346b-8122-9681-f4d2cc321a31", url: "", properties: {} });
    const res = await POST(postRequest(SECRET, {
      decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" }],
    }));
    expect(res.status).toBe(409);
  });

  it("実行済み施策を未許可の状態へは遷移させない", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31", url: "",
      properties: { "施策名": { title: [{ plain_text: "施策" }] }, "ステータス": { select: { name: "実行済み" } } },
    });
    const res = await POST(postRequest(SECRET, { decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "クローズ" }] }));
    expect(res.status).toBe(409);
  });

  it("未知の施策状態からの遷移は拒否する", async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31", url: "",
      properties: { "施策名": { title: [{ plain_text: "施策" }] }, "ステータス": { select: { name: "未知" } } },
    });
    const res = await POST(postRequest(SECRET, { decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" }] }));
    expect(res.status).toBe(409);
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
    vi.mocked(getPage).mockResolvedValue({
      id: "38099efa-346b-8122-9681-f4d2cc321a31",
      url: "",
      properties: {
        "施策名": { title: [{ plain_text: "施策" }] },
        "ステータス": { select: { name: "未処理" } },
      },
    });
    vi.mocked(updatePageProps).mockResolvedValue("ok");
    const res = await POST(
      postRequest(null, {
        decisions: [{ id: "38099efa-346b-8122-9681-f4d2cc321a31", decision: "承認" }],
      })
    );
    expect(res.status).toBe(200);
    expect(updatePageProps).toHaveBeenCalledTimes(1);
  });

  it("認証無効でも NOTION_TOKEN 未設定なら 500", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(getRequest(null));
    expect(res.status).toBe(500);
  });
});
