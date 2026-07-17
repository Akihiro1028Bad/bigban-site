// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/analyticsBlob", () => ({ resolveSnapshotStore: vi.fn(), getLatestSnapshot: vi.fn((store: { getLatest: () => Promise<string | null> }) => store.getLatest()) }));
vi.mock("@/lib/growth/apiAuth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/growth/apiAuth")>()), verifyToken: vi.fn(() => true) }));

import { getLatestSnapshot, resolveSnapshotStore } from "@/lib/growth/analyticsBlob";
import { verifyToken } from "@/lib/growth/apiAuth";
import { analyticsSnapshot } from "../../../../../../scripts/growth/__fixtures__/analyticsSnapshot";
import { GET, POST } from "./route";

const TOKEN = "0123456789abcdef0123456789abcdef";
const snapshot = analyticsSnapshot();

function request(body: BodyInit, authorization?: string): Request {
  return new Request("http://localhost/api/growth/analytics/snapshot", {
    method: "POST", body, headers: { "content-type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
  });
}

beforeEach(() => {
  process.env.GROWTH_ANALYTICS_INGEST_TOKEN = TOKEN;
  vi.mocked(resolveSnapshotStore).mockReset();
  vi.mocked(getLatestSnapshot).mockClear();
  vi.mocked(verifyToken).mockReturnValue(true);
});

afterEach(() => { delete process.env.GROWTH_ANALYTICS_INGEST_TOKEN; });

describe("POST /api/growth/analytics/snapshot", () => {
  it("認証失敗なら401でストアに触れない", async () => {
    const res = await POST(request(JSON.stringify(snapshot)));
    expect(res.status).toBe(401);
    expect(resolveSnapshotStore).not.toHaveBeenCalled();
  });

  it("サーバー側トークン未設定なら503で受け口を無効化する", async () => {
    delete process.env.GROWTH_ANALYTICS_INGEST_TOKEN;
    const res = await POST(request(JSON.stringify(snapshot), `Bearer ${TOKEN}`));
    expect(res.status).toBe(503);
    expect(resolveSnapshotStore).not.toHaveBeenCalled();
  });

  it("5MBを超えるボディを拒否する", async () => {
    const res = await POST(request("x".repeat(5 * 1024 * 1024 + 1), `Bearer ${TOKEN}`));
    expect(res.status).toBe(413);
    expect(resolveSnapshotStore).not.toHaveBeenCalled();
  });

  it("ボディ読取失敗を400にする", async () => {
    const brokenRequest = {
      headers: new Headers({ Authorization: `Bearer ${TOKEN}` }),
      arrayBuffer: async (): Promise<ArrayBuffer> => { throw new Error("body unavailable"); },
    } as unknown as Request;
    const res = await POST(brokenRequest);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("スナップショットの読取に失敗しました");
  });

  it("スキーマ不正を400で拒否する", async () => {
    const res = await POST(request(JSON.stringify({ schemaVersion: 1 }), `Bearer ${TOKEN}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("スナップショットの形式が不正です");
  });

  it("検証済みスナップショットを保存して成功を返す", async () => {
    const putLatest = vi.fn(async () => undefined);
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest, getLatest: async () => null });
    const res = await POST(request(JSON.stringify(snapshot), `Bearer ${TOKEN}`));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ success: true });
    expect(putLatest).toHaveBeenCalledWith(JSON.stringify(snapshot), "2026-07-17");
  });

  it("スキーマ外の生データを保存しない", async () => {
    const putLatest = vi.fn(async () => undefined);
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest, getLatest: async () => null });
    const res = await POST(request(JSON.stringify({ ...snapshot, unexpectedRawData: "must-not-store" }), `Bearer ${TOKEN}`));
    expect(res.status).toBe(202);
    expect(putLatest).toHaveBeenCalledWith(JSON.stringify(snapshot), "2026-07-17");
  });

  it("保存失敗を秘密値なしのエラーにする", async () => {
    const error = new Error("token leaked");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => { throw error; }, getLatest: async () => null });
    const res = await POST(request(JSON.stringify(snapshot), `Bearer ${TOKEN}`));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("スナップショットの保存に失敗しました");
    expect(consoleError).toHaveBeenCalledWith("[analytics snapshot] 保存に失敗しました", { name: error.name, message: error.message });
    consoleError.mockRestore();
  });
});

describe("GET /api/growth/analytics/snapshot", () => {
  it("セッション認証に失敗すると401でストアに触れない", async () => {
    vi.mocked(verifyToken).mockReturnValue(false);
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(401);
    expect(resolveSnapshotStore).not.toHaveBeenCalled();
  });

  it("保存済みデータが無い初回はnullを正常に返す", async () => {
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => undefined, getLatest: async () => null });
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, snapshot: null });
  });

  it("保存済みJSONが不正なら500を返す", async () => {
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => undefined, getLatest: async () => "{" });
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("保存済みスナップショットの形式が不正です");
  });

  it("保存済みJSONがスキーマ不正なら500を返す", async () => {
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => undefined, getLatest: async () => JSON.stringify({ schemaVersion: 1 }) });
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("保存済みスナップショットの形式が不正です");
  });

  it("ストア読取の失敗を500にする", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => undefined, getLatest: async () => { throw "storage unavailable"; } });
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("スナップショットの取得に失敗しました");
    expect(consoleError).toHaveBeenCalledWith("[analytics snapshot] 取得に失敗しました", { name: "UnknownError", message: "不明なエラー" });
    consoleError.mockRestore();
  });

  it("検証済みの最新スナップショットを返す", async () => {
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => undefined, getLatest: async () => JSON.stringify(snapshot) });
    const res = await GET(new Request("http://localhost/api/growth/analytics/snapshot"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, snapshot });
  });
});
