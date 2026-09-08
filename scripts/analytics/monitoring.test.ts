// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { collectMonitoring, formatMonitoring } from "./monitoring.mjs";

const endpoint = "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport";
const cur = { startDate: "2026-09-06", endDate: "2026-09-06" };
const prv = { startDate: "2026-08-30", endDate: "2026-08-30" };
const options = { token: "test-token", propertyId: "123", cur, prv };
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const row = (key: string, value: string) => ({ dimensionValues: [{ value: key }], metricValues: [{ value }] });
interface ReportRequest { dateRanges: { startDate: string }[]; dimensions: { name: string }[]; dimensionFilter: unknown }

describe("監視用の比較値", () => {
  it("指定した前週同曜日を直接取得し、英語ページも合算する", async () => {
    const requests: ReportRequest[] = [];
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as ReportRequest;
      requests.push(body);
      const current = body.dateRanges[0].startDate === cur.startDate;
      return HttpResponse.json({ rows: body.dimensions[0].name === "eventName"
        ? [row("reservation_click", current ? "30" : "20")]
        : [row("/reserve", current ? "10" : "20"), row("/en/reserve/", "5"), row("/hyrox", "7")] });
    }));
    const result = await collectMonitoring(options);
    expect(requests).toHaveLength(4);
    expect(requests.filter(r => r.dateRanges[0].startDate === prv.startDate)).toHaveLength(2);
    expect(result.metrics.find(r => r.name === "reservation_click")).toMatchObject({ current: 30, previous: 20, deltaPercent: 50 });
    expect(result.metrics.find(r => r.name === "/reserve")).toMatchObject({ current: 15, previous: 25, deltaPercent: -40 });
    expect(JSON.stringify(requests)).toContain("/reserve");
    expect(formatMonitoring(result)).toContain("reservation_click  今期=30 前期=20 (+50%)");
  });

  it("成功した空レポートだけをゼロとし、全監視対象を出す", async () => {
    server.use(http.post(endpoint, () => HttpResponse.json({})));
    const result = await collectMonitoring(options);
    expect(result.metrics.find(r => r.name === "/reserve")).toMatchObject({ current: 0, previous: 0, deltaPercent: null });
    expect(result.metrics.find(r => r.name === "reserve_entry_click")).toMatchObject({ current: 0, previous: 0 });
    expect(formatMonitoring(result)).toContain("今期=0 前期=0 (-)");
  });

  it("イベントAPIが失敗してもページ監視は取得し、失敗をnullにする", async () => {
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as ReportRequest;
      return body.dimensions[0].name === "eventName"
        ? new HttpResponse("secret error body", { status: 403 })
        : HttpResponse.json({ rows: [row("/reserve", "10")] });
    }));
    const result = await collectMonitoring(options);
    expect(result.metrics.find(r => r.name === "reservation_click")).toMatchObject({ current: null, previous: null, deltaPercent: null });
    expect(result.metrics.find(r => r.name === "/reserve")).toMatchObject({ current: 10, previous: 10 });
    expect(formatMonitoring(result)).toContain("取得不可");
    expect(JSON.stringify(result)).not.toContain("secret error body");
  });

  it.each([
    { rows: [row("/reserve", "NaN")] },
    { rows: [row("/reserve", "-1")] },
    { rows: [row("/reserve", "")] },
    { rows: [{}] },
    { rows: "invalid" },
    { rows: [], rowCount: 50 },
    { rows: [], metadata: { subjectToThresholding: true } },
    { rows: [], metadata: { dataLossFromOtherRow: true } },
  ])("不正・不完全なレポートをゼロ扱いしない: %j", async (report) => {
    server.use(http.post(endpoint, () => HttpResponse.json(report)));
    const result = await collectMonitoring(options);
    expect(result.metrics.every(r => r.current === null && r.previous === null)).toBe(true);
  });

  it("ネットワーク失敗を観測不能として返す", async () => {
    server.use(http.post(endpoint, () => HttpResponse.error()));
    const result = await collectMonitoring(options);
    expect(result.metrics.every(r => r.current === null)).toBe(true);
  });

  it("前期だけ取得不能でも今期を保持し、比較は保留する", async () => {
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as ReportRequest;
      return body.dateRanges[0].startDate === prv.startDate
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json({ rows: [row("reservation_click", "3")] });
    }));
    const result = await collectMonitoring(options);
    expect(formatMonitoring(result)).toContain("reservation_click  今期=3 前期=取得不可 (比較不可)");
  });

  it("前期ゼロ・今期ありをnewと表示する", async () => {
    server.use(http.post(endpoint, async ({ request }) => {
      const body = await request.json() as ReportRequest;
      return HttpResponse.json({ rows: body.dateRanges[0].startDate === prv.startDate ? [] : [row("reservation_click", "3")] });
    }));
    expect(formatMonitoring(await collectMonitoring(options))).toContain("今期=3 前期=0 (new)");
  });
});
