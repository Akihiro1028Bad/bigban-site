// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/notion", () => ({
  queryDataSource: vi.fn(),
  defaultFetch: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { queryDataSource } from "@/lib/growth/notion";
import { GET } from "./route";

const SECRET = "approve-secret-token";

function request(token: string | null): Request {
  return new Request("http://localhost/api/growth/ops", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  flags.authEnabled = true;
  process.env.APPROVE_SECRET = SECRET;
  process.env.NOTION_TOKEN = "secret_notion";
  vi.mocked(queryDataSource).mockReset();
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
  delete process.env.NOTION_TOKEN;
  delete process.env.GROWTH_WORKER_LOG_DS;
});

describe("GET /api/growth/ops", () => {
  it("token 不一致は 401", async () => {
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
    expect(queryDataSource).not.toHaveBeenCalled();
  });

  it("GROWTH_WORKER_LOG_DS 未設定でも setupMissing=true で返す", async () => {
    const res = await GET(request(SECRET));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ops.setupMissing).toBe(true);
    expect(json.ops.currentTargets).toEqual([]);
  });

  it("GROWTH_WORKER_LOG_DS 設定済みで Notion token 未設定なら 500", async () => {
    process.env.GROWTH_WORKER_LOG_DS = "worker-log";
    delete process.env.NOTION_TOKEN;

    const res = await GET(request(SECRET));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "サーバー設定エラー" });
    expect(queryDataSource).not.toHaveBeenCalled();
  });

  it("Notion の worker log から currentTargets を返す", async () => {
    process.env.GROWTH_WORKER_LOG_DS = "worker-log";
    vi.mocked(queryDataSource).mockResolvedValue({
      hasMore: false,
      nextCursor: null,
      pages: [
        {
          id: "r1",
          url: "",
          properties: {
            "名前": { title: [{ plain_text: "advise running" }] },
            "種別": { select: { name: "job" } },
            "ステータス": { select: { name: "running" } },
            "モード": { rich_text: [{ plain_text: "advise" }] },
            "対象タイトル": { rich_text: [{ plain_text: "記事A" }] },
            "対象種別": { select: { name: "article" } },
            "開始時刻": { date: { start: new Date(Date.now() - 60_000).toISOString() } },
            "記録時刻": { date: { start: new Date().toISOString() } },
          },
        },
      ],
    });

    const res = await GET(request(SECRET));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ops.currentTargets).toEqual([
      expect.objectContaining({ targetTitle: "記事A", mode: "advise", status: "running" }),
    ]);
  });

  it("Notion 取得失敗は 502", async () => {
    process.env.GROWTH_WORKER_LOG_DS = "worker-log";
    vi.mocked(queryDataSource).mockRejectedValue(new Error("secret"));
    const res = await GET(request(SECRET));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("運用ログの取得中にエラーが発生しました");
  });
});
