// 子プロセスのCLI結線テスト専用。すべての外部通信をMSWで遮断する。
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
const row = (key, count) => ({ dimensionValues: [{ value: key }], metricValues: [{ value: String(count) }, { value: "1" }] });
const server = setupServer(
  http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({ access_token: "test-token" })),
  http.post("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport", async ({ request }) => {
    if (process.env.TEST_GOOGLE_FAILURE === "ga4") return new HttpResponse(null, { status: 503 });
    const body = await request.json();
    const current = body.dateRanges[0].endDate === yesterday;
    if (body.dimensions[0].name === "eventName") {
      const event = row("reservation_click", current ? 30 : 10);
      if (body.dimensions.length === 2) event.dimensionValues.push({ value: "test-location" });
      return HttpResponse.json({ rows: [event] });
    }
    return HttpResponse.json({ rows: [row("/reserve", 100), row("/columns/example", 20)] });
  }),
  http.post("https://www.googleapis.com/webmasters/v3/sites/:site/searchAnalytics/query", async ({ request }) => {
    if (process.env.TEST_GOOGLE_FAILURE === "gsc") return new HttpResponse(null, { status: 503 });
    const body = await request.json();
    return HttpResponse.json({ rows: [{ keys: body.dimensions.length === 2 ? ["https://example.test/columns/example", "pickleball"] : ["pickleball"], impressions: 200, clicks: 10, ctr: 0.05, position: 4 }] });
  }),
);
server.listen({ onUnhandledRequest: "error" });
