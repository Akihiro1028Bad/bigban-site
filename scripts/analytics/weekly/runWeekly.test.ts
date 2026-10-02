// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { NOTION_IDS } from "../../early-morning/notionIds";
import { FakeNotion } from "../../hyrox-class/fixtures/fakeNotion";
import { runWeekly } from "./runWeekly";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const GA4 = "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport";
const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CIRCLE_URL = "https://www.tennisbear.net/pickleball/circle/36659/events";
const SECRET_NAME = "テスト太郎";
const env = {
  GROWTH_GOOGLE_CLIENT_ID: "id",
  GROWTH_GOOGLE_CLIENT_SECRET: "client-secret-value",
  GROWTH_GOOGLE_REFRESH_TOKEN: "refresh-token-value",
  GROWTH_GA4_PROPERTY_ID: "123",
};
// 2026-10-01(木)12:00 JST → 今週は 2026-09-28 の週。8週前の週頭は 2026-08-10。
const now = new Date("2026-10-01T03:00:00Z");

const row = (date: string, count: string) => ({ dimensionValues: [{ value: date }], metricValues: [{ value: count }] });

function nuxt(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

function useHappyServers(onGa4?: (body: unknown) => void) {
  server.use(
    http.post("https://oauth2.googleapis.com/token", () => HttpResponse.json({ access_token: "access-token-value" })),
    http.post(GA4, async ({ request }) => {
      const body = await request.json();
      onGa4?.(body);
      const text = JSON.stringify(body);
      return HttpResponse.json(
        text.includes("labola_reserve_complete")
          ? { rows: [row("20260929", "5")], rowCount: 1 }
          : { rows: [row("20260929", "10")], rowCount: 1 },
      );
    }),
    http.get(CIRCLE_URL, () =>
      HttpResponse.text(
        nuxt({
          state: { feature: { circle: { circleDetail: { CircleOrganizedEvents: {
            circleOrganizedFutureEventList: [],
            circleOrganizedPastEventList: [{ id: 1, startDatetimeString: "2026-09-29T10:00:00.000+09:00", callOff: false }],
          } } } } },
        }),
      ),
    ),
    http.get("https://www.tennisbear.net/pickleball/event/1/info", () =>
      HttpResponse.text(
        nuxt({
          state: { feature: { event: { eventDetail: { EventDetail: { event: {
            id: 1,
            startDateTime: "2026-09-29T10:00:00.000+09:00",
            callOff: false,
            organizer: { id: 999 },
            participantList: [{ eventUserStatusType: "APPROVE", guestUserFlg: false, applyDateTime: "2026-09-28T09:00:00.000+09:00", user: { id: 5, name: SECRET_NAME } }],
            cancelUserList: [],
          } } } } } },
        }),
      ),
    ),
    http.get(PSI, () =>
      HttpResponse.json({ loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2200, category: "FAST" } } } }),
    ),
  );
}

function ledger(): FakeNotion {
  const notion = new FakeNotion();
  notion.columns = ["予約番号", "ステータス", "受付日時", "予約者"];
  notion.seed(NOTION_IDS.ledgerDb, {
    予約番号: { rich_text: [{ plain_text: "#500" }] },
    ステータス: { select: { name: "確定" } },
    受付日時: { date: { start: "2026-09-29T10:00:00.000+09:00" } },
    予約者: { rich_text: [{ plain_text: SECRET_NAME }] },
  });
  return notion;
}

const sleep = vi.fn(async () => undefined);
beforeEach(() => sleep.mockClear());

describe("runWeekly", () => {
  it("3節とも成功すれば、見出しつきで出力し失敗なしを返す", async () => {
    useHappyServers();
    const { text, hasFailure } = await runWeekly({ now, env: { ...env, PSI_API_KEY: "psi-key-value" }, notion: ledger(), sleep });
    expect(hasFailure).toBe(false);
    expect(text).toContain("## GA4 予約完了と予約台帳の週次突合");
    expect(text).toContain("2026-09-28週(途中)  GA4完了=5 台帳受付=1 差=+4");
    expect(text).toContain("## テニスベア行きクリックと申込(週次)");
    expect(text).toContain("2026-09-28週(途中)  クリック=10 申込=1 申込÷クリック=10%");
    expect(text).toContain("## CrUX(実ユーザーの表示速度・モバイル p75)");
    expect(text).toContain("LCP 2.2s(良好)");
  });

  it("GA4 の期間は『最初の週頭〜昨日(JST)』で、完了はLaBOLA・クリックはサイトのホストに絞る", async () => {
    const bodies: string[] = [];
    useHappyServers((body) => bodies.push(JSON.stringify(body)));
    await runWeekly({ now, env, notion: ledger(), sleep });
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body).toContain('"startDate":"2026-08-10","endDate":"2026-09-30"');
    expect(bodies.find((body) => body.includes("labola_reserve_complete"))).toContain("yoyaku.labola.jp");
    const click = bodies.find((body) => body.includes("reservation_click"));
    expect(click).toContain("www.thepicklebang.com");
    expect(click).toContain("reserve_choice_pickle_event");
  });

  it("GA4 が失敗しても、他の節(CrUX)は出し、失敗ありを返す", async () => {
    useHappyServers();
    server.use(http.post(GA4, () => new HttpResponse(null, { status: 503 })));
    const { text, hasFailure } = await runWeekly({ now, env: { ...env, PSI_API_KEY: "psi-key-value" }, notion: ledger(), sleep });
    expect(hasFailure).toBe(true);
    expect(text).toContain("## GA4 予約完了と予約台帳の週次突合\n取得不可: GA4 失敗: 503");
    expect(text).toContain("## テニスベア行きクリックと申込(週次)\n取得不可: GA4 失敗: 503");
    expect(text).toContain("LCP 2.2s(良好)");
  });

  it("Notion が失敗しても、テニスベアの節は出す", async () => {
    useHappyServers();
    const notion = ledger();
    notion.failQueryDb = NOTION_IDS.ledgerDb;
    const { text, hasFailure } = await runWeekly({ now, env, notion, sleep });
    expect(hasFailure).toBe(true);
    expect(text).toContain("## GA4 予約完了と予約台帳の週次突合\n取得不可: ");
    expect(text).toContain("申込÷クリック=10%");
  });

  it("Error でない値が投げられても、文字列にして取得不可として出す", async () => {
    useHappyServers();
    const notion = ledger();
    notion.getDatabase = async () => {
      throw "台帳の読み取りに失敗";
    };
    const { text } = await runWeekly({ now, env, notion, sleep });
    expect(text).toContain("取得不可: 台帳の読み取りに失敗");
  });

  it("Google の認証情報が無ければ、GA4 を使う2節だけが取得不可になる", async () => {
    useHappyServers();
    const { text, hasFailure } = await runWeekly({ now, env: { GROWTH_GA4_PROPERTY_ID: "123" }, notion: ledger(), sleep });
    expect(hasFailure).toBe(true);
    expect(text).toContain("取得不可: GROWTH_GOOGLE_CLIENT_ID が未設定です");
  });

  it("GA4 のプロパティ ID が無ければ取得不可", async () => {
    useHappyServers();
    const { text } = await runWeekly({ now, env: { ...env, GROWTH_GA4_PROPERTY_ID: undefined }, notion: ledger(), sleep });
    expect(text).toContain("取得不可: GROWTH_GA4_PROPERTY_ID が未設定です");
  });

  it("認証情報もプロパティ ID も無くても、未処理の拒否を出さずに両節が取得不可になる", async () => {
    useHappyServers();
    const { text, hasFailure } = await runWeekly({ now, env: {}, notion: ledger(), sleep });
    expect(hasFailure).toBe(true);
    expect(text.match(/取得不可: GROWTH_GA4_PROPERTY_ID が未設定です/gu)).toHaveLength(2);
  });

  it("PSI_API_KEY が無ければ CrUX はスキップ(失敗にしない)", async () => {
    useHappyServers();
    const { text, hasFailure } = await runWeekly({ now, env, notion: ledger(), sleep });
    expect(hasFailure).toBe(false);
    expect(text).toContain("PSI_API_KEY が未設定のため CrUX の取得をスキップしました");
  });

  it("CrUX が失敗すれば、その節だけ取得不可になる", async () => {
    useHappyServers();
    server.use(http.get(PSI, () => new HttpResponse(null, { status: 429 })));
    const { text, hasFailure } = await runWeekly({ now, env: { ...env, PSI_API_KEY: "psi-key-value" }, notion: ledger(), sleep });
    expect(hasFailure).toBe(true);
    expect(text).toContain("取得不可: PSI 失敗: 429");
    expect(text).toContain("GA4完了=5");
  });

  it("出力に氏名・API キー・トークン・秘密の値を含めない", async () => {
    useHappyServers();
    const { text } = await runWeekly({ now, env: { ...env, PSI_API_KEY: "psi-key-value" }, notion: ledger(), sleep });
    for (const secret of [SECRET_NAME, "psi-key-value", "access-token-value", "client-secret-value", "refresh-token-value"]) {
      expect(text).not.toContain(secret);
    }
  });
});
