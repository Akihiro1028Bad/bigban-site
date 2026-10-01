// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { weeklyEventCounts } from "./ga4Weekly";

const endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const ctx = { token: "t", propertyId: "123" };
const query = { startDate: "2026-09-21", endDate: "2026-10-04", eventNames: ["labola_reserve_complete"], host: "yoyaku.labola.jp" };
const row = (date: string, count: string) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: count }] });

describe("weeklyEventCounts", () => {
  it("日別の回数を JST の週(月曜始まり)にまとめる", async () => {
    server.use(
      http.post(endpoint, () =>
        HttpResponse.json({ rows: [row("20260927", "3"), row("20260928", "4"), row("20261004", "5")], rowCount: 3 }),
      ),
    );
    const counts = await weeklyEventCounts(ctx, query);
    expect([...counts.entries()]).toEqual([
      ["2026-09-21", 3],
      ["2026-09-28", 9],
    ]);
  });

  it("イベント名とホストで絞り、追加フィルタを AND で足す", async () => {
    let body: unknown;
    server.use(http.post(endpoint, async ({ request }) => ((body = await request.json()), HttpResponse.json({ rows: [], rowCount: 0 }))));
    await weeklyEventCounts(ctx, {
      ...query,
      extraFilter: { filter: { fieldName: "customEvent:location", stringFilter: { matchType: "EXACT", value: "x" } } },
    });
    const text = JSON.stringify(body);
    expect(text).toContain("labola_reserve_complete");
    expect(text).toContain("yoyaku.labola.jp");
    expect(text).toContain("customEvent:location");
    expect(text).toContain('"eventCount"');
  });

  it("行が無いレポートは空の集計になる", async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({})));
    expect((await weeklyEventCounts(ctx, query)).size).toBe(0);
  });

  it("HTTP エラーは例外", async () => {
    server.use(http.post(endpoint, () => new HttpResponse("denied", { status: 403 })));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 失敗: 403");
  });

  it.each([
    ["行が分割されている", { rows: [row("20260928", "1")], rowCount: 2 }],
    ["しきい値で間引かれた", { rows: [row("20260928", "1")], rowCount: 1, metadata: { subjectToThresholding: true } }],
    ["その他行に丸められた", { rows: [row("20260928", "1")], rowCount: 1, metadata: { dataLossFromOtherRow: true } }],
  ])("不完全なレポート(%s)は静かに少なく数えず例外", async (_label, payload) => {
    server.use(http.post(endpoint, () => HttpResponse.json(payload)));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 のレポートが不完全です");
  });

  it("数値でない回数は例外", async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({ rows: [row("20260928", "abc")], rowCount: 1 })));
    await expect(weeklyEventCounts(ctx, query)).rejects.toThrow("GA4 の応答の形が想定と違います");
  });
});
