// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { defaultFetch } from "../../growth/http";
import { fetchTennisbearApplicationCounts } from "./tennisbearApplications";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const CIRCLE_URL = "https://www.tennisbear.net/pickleball/circle/36659/events";
const eventUrl = (id: number) => `https://www.tennisbear.net/pickleball/event/${id}/info`;

function summary(id: number, start: string, callOff = false) {
  return { id, startDatetimeString: start, callOff };
}

function circleHtml(future: unknown[], past: unknown[]): string {
  const state = {
    state: {
      feature: {
        circle: {
          circleDetail: {
            CircleOrganizedEvents: { circleOrganizedFutureEventList: future, circleOrganizedPastEventList: past },
          },
        },
      },
    },
  };
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

function applicant(userId: number, status: string, appliedAt: string | null) {
  return { eventUserStatusType: status, guestUserFlg: false, applyDateTime: appliedAt, user: { id: userId, name: "参加者A" } };
}

function eventHtml(id: number, start: string, participants: unknown[], cancels: unknown[] = []): string {
  const state = {
    state: {
      feature: {
        event: {
          eventDetail: {
            EventDetail: {
              event: { id, startDateTime: start, callOff: false, organizer: { id: 999 }, participantList: participants, cancelUserList: cancels },
            },
          },
        },
      },
    },
  };
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

function deps(windowStart = "2026-09-14") {
  return { fetchFn: defaultFetch, sleep: vi.fn(async () => undefined), intervalMs: 1000, windowStart };
}

describe("fetchTennisbearApplicationCounts", () => {
  it("申込日時の週ごとに、参加とキャンセルの両方を数える", async () => {
    server.use(
      http.get(CIRCLE_URL, () =>
        HttpResponse.text(circleHtml([summary(2, "2026-10-12T10:00:00.000+09:00")], [summary(1, "2026-09-29T10:00:00.000+09:00")])),
      ),
      http.get(eventUrl(1), () =>
        HttpResponse.text(
          eventHtml(
            1,
            "2026-09-29T10:00:00.000+09:00",
            [applicant(11, "APPROVE", "2026-09-27T23:59:00.000+09:00"), applicant(12, "APPROVE", "2026-09-28T00:00:00.000+09:00")],
            [applicant(13, "CANCEL", "2026-09-28T12:00:00.000+09:00")],
          ),
        ),
      ),
      http.get(eventUrl(2), () => HttpResponse.text(eventHtml(2, "2026-10-12T10:00:00.000+09:00", [applicant(14, "APPROVE", "2026-10-01T09:00:00.000+09:00")]))),
    );
    const result = await fetchTennisbearApplicationCounts(deps());
    expect(Object.fromEntries(result.byWeek)).toEqual({ "2026-09-21": 1, "2026-09-28": 3 });
    expect(result.events).toBe(2);
    expect(result.undated).toBe(0);
  });

  it("窓より前に始まった回と中止の回は、詳細を取りに行かない", async () => {
    const requested: string[] = [];
    server.use(
      http.get(CIRCLE_URL, () =>
        HttpResponse.text(
          circleHtml(
            [summary(3, "2026-10-12T10:00:00.000+09:00", true)],
            [summary(1, "2026-09-07T10:00:00.000+09:00"), summary(4, "2026-09-14T10:00:00.000+09:00")],
          ),
        ),
      ),
      http.get(/\/event\/(\d+)\/info$/, ({ request }) => {
        requested.push(new URL(request.url).pathname);
        return HttpResponse.text(eventHtml(4, "2026-09-14T10:00:00.000+09:00", []));
      }),
    );
    const result = await fetchTennisbearApplicationCounts(deps("2026-09-14"));
    expect(requested).toEqual(["/pickleball/event/4/info"]);
    expect(result.events).toBe(1);
  });

  it("開始日時が読めない回は対象外にする", async () => {
    server.use(http.get(CIRCLE_URL, () => HttpResponse.text(circleHtml([summary(5, "未定")], []))));
    const result = await fetchTennisbearApplicationCounts(deps());
    expect(result.events).toBe(0);
  });

  it("申込日時が無い/読めない申込は undated に数え、週に混ぜない", async () => {
    server.use(
      http.get(CIRCLE_URL, () => HttpResponse.text(circleHtml([], [summary(1, "2026-09-29T10:00:00.000+09:00")]))),
      http.get(eventUrl(1), () =>
        HttpResponse.text(
          eventHtml(1, "2026-09-29T10:00:00.000+09:00", [applicant(11, "APPROVE", null), applicant(12, "APPROVE", "garbage"), applicant(13, "APPROVE", "2026-09-28T09:00:00.000+09:00")]),
        ),
      ),
    );
    const result = await fetchTennisbearApplicationCounts(deps());
    expect(result.undated).toBe(2);
    expect([...result.byWeek.entries()]).toEqual([["2026-09-28", 1]]);
  });

  it("詳細を取るたびに間隔をあける", async () => {
    server.use(
      http.get(CIRCLE_URL, () => HttpResponse.text(circleHtml([], [summary(1, "2026-09-29T10:00:00.000+09:00"), summary(2, "2026-09-30T10:00:00.000+09:00")]))),
      http.get(/\/event\/(\d+)\/info$/, ({ request }) => {
        const id = Number(new URL(request.url).pathname.split("/")[3]);
        return HttpResponse.text(eventHtml(id, "2026-09-29T10:00:00.000+09:00", []));
      }),
    );
    const dependencies = deps();
    await fetchTennisbearApplicationCounts(dependencies);
    expect(dependencies.sleep).toHaveBeenCalledTimes(2);
    expect(dependencies.sleep).toHaveBeenCalledWith(1000);
  });

  it("一覧の取得が HTTP エラーなら例外", async () => {
    server.use(http.get(CIRCLE_URL, () => new HttpResponse(null, { status: 503 })));
    await expect(fetchTennisbearApplicationCounts(deps())).rejects.toThrow("取得に失敗しました (HTTP 503)");
  });

  it("別のイベントの詳細が返ったら例外", async () => {
    server.use(
      http.get(CIRCLE_URL, () => HttpResponse.text(circleHtml([], [summary(1, "2026-09-29T10:00:00.000+09:00")]))),
      http.get(eventUrl(1), () => HttpResponse.text(eventHtml(99, "2026-09-29T10:00:00.000+09:00", []))),
    );
    await expect(fetchTennisbearApplicationCounts(deps())).rejects.toThrow("別のイベントを返しました");
  });
});
