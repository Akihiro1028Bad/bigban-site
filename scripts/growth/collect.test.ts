// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { collectGrowthData, type CollectDeps } from "./collect";
import type { GrowthConfig } from "./config";

const config: GrowthConfig = {
  ga4PropertyId: "540956661",
  gscSiteUrl: "https://www.thepicklebang.com/",
  googleClientId: "id",
  googleClientSecret: "secret",
  googleRefreshToken: "token",
};

const current = { start: "2026-06-08", end: "2026-06-14" };
const prior = { start: "2026-06-01", end: "2026-06-07" };

const baseArgs = {
  config,
  accessToken: "ya29.token",
  current,
  prior,
  generatedAt: "2026-06-18T07:00:00+09:00",
};

describe("collectGrowthData", () => {
  it("GA4・GSC 両方の結果とメタ情報を組み立てる", async () => {
    const deps: CollectDeps = {
      fetchGa4: vi.fn().mockResolvedValue({
        summary: [{ keys: [], metrics: {} }],
        labolaFunnel: [
          { keys: ["reservation_click"], metrics: { eventCount: { current: 8, prior: 0, deltaPct: null } } },
          { keys: ["labola_step_input"], metrics: { eventCount: { current: 5, prior: 0, deltaPct: null } } },
          { keys: ["labola_reserve_complete"], metrics: { eventCount: { current: 2, prior: 0, deltaPct: null } } },
        ],
      }),
      fetchGsc: vi.fn().mockResolvedValue({ summary: [{ keys: [], metrics: {} }] }),
    };

    const result = await collectGrowthData({ ...baseArgs, deps });

    expect(result.generatedAt).toBe("2026-06-18T07:00:00+09:00");
    expect(result.period).toEqual(current);
    expect(result.priorPeriod).toEqual(prior);
    expect(result.ga4).toEqual(expect.objectContaining({ summary: [{ keys: [], metrics: {} }] }));
    expect(result.reservationFunnel).toMatchObject({
      observedDays: 0,
      isReferenceOnly: true,
      siteToLabola: 8,
      rental: { input: 5, complete: 2 },
      program: { input: 0, complete: 0 },
    });
    expect(result.gsc).toEqual({ summary: [{ keys: [], metrics: {} }] });
    expect(result.errors).toEqual([]);
  });

  it("GA4 が失敗しても GSC は取得し、errors に記録する", async () => {
    const deps: CollectDeps = {
      fetchGa4: vi.fn().mockRejectedValue(new Error("ga4 boom")),
      fetchGsc: vi.fn().mockResolvedValue({ summary: [] }),
    };

    const result = await collectGrowthData({ ...baseArgs, deps });

    expect(result.ga4).toBeNull();
    expect(result.reservationFunnel).toBeNull();
    expect(result.gsc).toEqual({ summary: [] });
    expect(result.errors).toEqual([{ source: "ga4", message: "ga4 boom" }]);
  });

  it("GSC が失敗しても GA4 は取得し、errors に記録する", async () => {
    const deps: CollectDeps = {
      fetchGa4: vi.fn().mockResolvedValue({ summary: [] }),
      fetchGsc: vi.fn().mockRejectedValue(new Error("gsc boom")),
    };

    const result = await collectGrowthData({ ...baseArgs, deps });

    expect(result.ga4).toEqual({ summary: [] });
    expect(result.gsc).toBeNull();
    expect(result.errors).toEqual([{ source: "gsc", message: "gsc boom" }]);
  });

  it("両方失敗した場合は errors を2件記録する", async () => {
    const deps: CollectDeps = {
      fetchGa4: vi.fn().mockRejectedValue(new Error("ga4 boom")),
      fetchGsc: vi.fn().mockRejectedValue("gsc string error"),
    };

    const result = await collectGrowthData({ ...baseArgs, deps });

    expect(result.ga4).toBeNull();
    expect(result.gsc).toBeNull();
    expect(result.errors).toEqual([
      { source: "ga4", message: "ga4 boom" },
      { source: "gsc", message: "gsc string error" },
    ]);
  });

  it("deps 未指定時は実装の fetchGa4/fetchGsc を用いる(グローバル fetch をスタブ)", async () => {
    const globalFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reports: [], rows: [] }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", globalFetch);

    const result = await collectGrowthData(baseArgs);

    expect(result.ga4).not.toBeNull();
    expect(result.gsc).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(globalFetch).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("各 fetch に config・トークン・期間を渡す", async () => {
    const deps: CollectDeps = {
      fetchGa4: vi.fn().mockResolvedValue({}),
      fetchGsc: vi.fn().mockResolvedValue({}),
    };

    await collectGrowthData({ ...baseArgs, deps });

    expect(deps.fetchGa4).toHaveBeenCalledWith({
      config,
      accessToken: "ya29.token",
      current,
      prior,
    });
    expect(deps.fetchGsc).toHaveBeenCalledWith({
      config,
      accessToken: "ya29.token",
      current,
      prior,
    });
  });
});
