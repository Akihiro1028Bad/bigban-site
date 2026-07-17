// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/growth/analyticsBlob", () => ({ resolveSnapshotStore: vi.fn() }));

import { resolveSnapshotStore } from "@/lib/growth/analyticsBlob";
import { POST } from "./route";

const TOKEN = "0123456789abcdef0123456789abcdef";
const snapshot = {
  schemaVersion: 1, generatedAt: "2026-07-17T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-17" }, analysis: { referenceYmd: "2026-07-17", currentWeek: { start: "2026-07-13", end: "2026-07-19" } },
  meta: { sourceSyncedAt: "2026-07-17T12:00:00+09:00", inputs: [], excludedCount: 0, missingSections: [], warnings: [] },
  kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } },
  catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [],
};

function request(body: BodyInit, authorization?: string): Request {
  return new Request("http://localhost/api/growth/analytics/snapshot", {
    method: "POST", body, headers: { "content-type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
  });
}

beforeEach(() => {
  process.env.GROWTH_ANALYTICS_INGEST_TOKEN = TOKEN;
  vi.mocked(resolveSnapshotStore).mockReset();
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
    vi.mocked(resolveSnapshotStore).mockReturnValue({ putLatest: async () => { throw new Error("token leaked"); }, getLatest: async () => null });
    const res = await POST(request(JSON.stringify(snapshot), `Bearer ${TOKEN}`));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("スナップショットの保存に失敗しました");
  });
});
