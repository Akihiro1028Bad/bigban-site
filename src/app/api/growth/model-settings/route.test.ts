// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  chunkRichText: (value: string) => (value ? [{ text: { content: value } }] : []),
  createPage: vi.fn(),
  defaultFetch: vi.fn(),
  queryDataSource: vi.fn(),
  updatePageProps: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { createPage, queryDataSource, updatePageProps } from "@/lib/growth/notion";
import { GET, PUT } from "./route";

const SECRET = "approve-secret-token";

function request(method: "GET" | "PUT", body?: unknown, token = SECRET): Request {
  return new Request("http://localhost/api/growth/model-settings", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(queryDataSource).mockReset();
  vi.mocked(createPage).mockReset();
  vi.mocked(updatePageProps).mockReset();
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
});

describe("/api/growth/model-settings", () => {
  it("GETはNotion上書きを既定値へマージして10工程を返す", async () => {
    vi.mocked(queryDataSource).mockResolvedValue({
      hasMore: false,
      nextCursor: null,
      pages: [
        {
          id: "setting-1",
          url: "",
          properties: {
            "工程ID": { title: [{ plain_text: "decorate" }] },
            "プロバイダー": { select: { name: "claude" } },
            "モデル": { rich_text: [{ plain_text: "claude-sonnet-5" }] },
            "推論強度": { select: { name: "medium" } },
          },
        },
      ],
    });

    const res = await GET(request("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings).toHaveLength(10);
    expect(json.settings.find((item: { id: string }) => item.id === "decorate")).toMatchObject({
      provider: "claude",
      model: "claude-sonnet-5",
      source: "notion",
    });
    expect(json.catalog).toEqual(expect.arrayContaining([expect.objectContaining({ id: "gpt-5.5" })]));
  });

  it("認証不一致はGET/PUTとも401", async () => {
    expect((await GET(request("GET", undefined, "wrong"))).status).toBe(401);
    expect((await PUT(request("PUT", {}, "wrong"))).status).toBe(401);
    expect(queryDataSource).not.toHaveBeenCalled();
  });

  it("Notion token未設定でも推奨値へフォールバックする", async () => {
    delete process.env.NOTION_TOKEN;
    const res = await GET(request("GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      storageAvailable: false,
      settings: expect.arrayContaining([
        expect.objectContaining({ id: "weekly", source: "default" }),
      ]),
    });
  });

  it("PUTは既存工程を更新する", async () => {
    vi.mocked(queryDataSource).mockResolvedValue({
      hasMore: false,
      nextCursor: null,
      pages: [{ id: "setting-1", url: "", properties: {} }],
    });
    vi.mocked(updatePageProps).mockResolvedValue("setting-1");

    const res = await PUT(
      request("PUT", {
        phaseId: "advise",
        provider: "claude",
        model: "claude-opus-4-8",
        effort: "xhigh",
      }),
    );

    expect(res.status).toBe(200);
    expect(updatePageProps).toHaveBeenCalledWith(
      "setting-1",
      expect.objectContaining({ "モデル": { rich_text: expect.any(Array) } }),
      expect.anything(),
    );
    expect(createPage).not.toHaveBeenCalled();
  });

  it("PUTは未登録工程を新規作成する", async () => {
    vi.mocked(queryDataSource).mockResolvedValue({ hasMore: false, nextCursor: null, pages: [] });
    vi.mocked(createPage).mockResolvedValue("setting-new");

    const res = await PUT(
      request("PUT", {
        phaseId: "regen",
        provider: "claude",
        model: "claude-sonnet-5",
        effort: "medium",
      }),
    );

    expect(res.status).toBe(200);
    expect(createPage).toHaveBeenCalledWith(
      "d6b79283-f892-4d75-b998-332ccb6dc22e",
      expect.objectContaining({ "工程ID": { title: expect.any(Array) } }),
      expect.anything(),
    );
  });

  it("PUTは不正なモデル組み合わせを400で拒否する", async () => {
    const res = await PUT(
      request("PUT", {
        phaseId: "weekly",
        provider: "codex",
        model: "claude-opus-4-8",
        effort: "high",
      }),
    );

    expect(res.status).toBe(400);
    expect(queryDataSource).not.toHaveBeenCalled();
  });

  it("Notion取得失敗は推奨値へフォールバックし、保存失敗は詳細を隠して502", async () => {
    vi.mocked(queryDataSource).mockRejectedValue(new Error("secret"));
    const getResponse = await GET(request("GET"));
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      success: true,
      storageAvailable: false,
      warning: "NotionのAIモデル設定DBを読み込めないため、推奨値を表示しています。",
    });
    expect(
      (
        await PUT(
          request("PUT", {
            phaseId: "weekly",
            provider: "codex",
            model: "gpt-5.6-sol",
            effort: "xhigh",
          }),
        )
      ).status,
    ).toBe(502);
  });
});
