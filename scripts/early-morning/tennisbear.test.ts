// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { FetchFn, HttpResponse } from "../growth/http";
import {
  TennisbearError,
  extractCircleEvents,
  extractEventDetail,
  fetchEarlyEventDetails,
  isEarlyEvent,
} from "./tennisbear";

function summary(id: number, start: string, callOff = false) {
  return { id, startDatetimeString: start, callOff, eventTitle: "無関係なタイトル" };
}

function circleState(future: unknown[], past: unknown[]) {
  return {
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
}

function user(id: number, name: string, status: string, guest = false) {
  return { eventUserStatusType: status, guestUserFlg: guest, applyDateTime: "2026-09-20T10:00:00.000+09:00", user: { id, name } };
}

function eventState(id: number, start: string, participants: unknown[], cancels: unknown[] = [], callOff = false) {
  return {
    state: {
      feature: {
        event: {
          eventDetail: {
            EventDetail: {
              event: {
                id,
                startDateTime: start,
                callOff,
                organizer: { id: 999 },
                participantList: participants,
                cancelUserList: cancels,
              },
            },
          },
        },
      },
    },
  };
}

function htmlOf(state: unknown): string {
  return `<script>window.__NUXT__=(function(){return ${JSON.stringify(state)}}());</script>`;
}

function response(body: string, status = 200): HttpResponse {
  return { ok: status < 400, status, json: async () => ({}), text: async () => body };
}

describe("extractCircleEvents", () => {
  it("今後と過去の一覧を合わせ、同じ ID は1件にする", () => {
    const state = circleState(
      [summary(3, "2026-10-06T06:00:00.000+09:00")],
      [summary(2, "2026-09-29T06:00:00.000+09:00", true), summary(3, "2026-10-06T06:00:00.000+09:00")],
    );
    expect(extractCircleEvents(state)).toEqual([
      { id: 3, startAt: "2026-10-06T06:00:00.000+09:00", isCallOff: false },
      { id: 2, startAt: "2026-09-29T06:00:00.000+09:00", isCallOff: true },
    ]);
  });

  it("形が違えばエラー", () => {
    expect(() => extractCircleEvents({ state: {} })).toThrow(TennisbearError);
  });
});

describe("isEarlyEvent", () => {
  it("開始 06:00 だけを早朝とみなす", () => {
    expect(isEarlyEvent({ id: 1, startAt: "2026-10-06T06:00:00.000+09:00", isCallOff: false })).toBe(true);
    expect(isEarlyEvent({ id: 2, startAt: "2026-10-06T12:00:00.000+09:00", isCallOff: false })).toBe(false);
  });
});

describe("extractEventDetail", () => {
  it("申込とキャンセルを取り、ゲストに印を付け、未知の状態は数だけ数える", () => {
    const state = eventState(
      9,
      "2026-09-22T06:00:00.000+09:00",
      [user(11, "テスト太郎", "APPROVE"), user(-1, "LBゲスト1", "APPROVE", true), user(12, "テスト次郎", "APPLYING")],
      [user(13, "テスト三郎", "CANCEL")],
    );
    expect(extractEventDetail(state)).toEqual({
      id: 9,
      startAt: "2026-09-22T06:00:00.000+09:00",
      isCallOff: false,
      ignoredStatusCount: 1,
      participants: [
        { userId: 11, name: "テスト太郎", status: "APPROVE", isGuest: false, appliedAt: "2026-09-20T10:00:00.000+09:00" },
        { userId: -1, name: "LBゲスト1", status: "APPROVE", isGuest: true, appliedAt: "2026-09-20T10:00:00.000+09:00" },
        { userId: 13, name: "テスト三郎", status: "CANCEL", isGuest: false, appliedAt: "2026-09-20T10:00:00.000+09:00" },
      ],
    });
  });

  it("ID が -1 ならゲスト印がなくてもゲスト扱い", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [{ ...user(-1, "枠", "APPROVE"), guestUserFlg: false }]);
    expect(extractEventDetail(state).participants[0].isGuest).toBe(true);
  });

  it("キャンセル一覧に CANCEL 以外があれば数だけ数える", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [], [user(14, "テスト四郎", "DECLINE")]);
    expect(extractEventDetail(state).ignoredStatusCount).toBe(1);
  });

  it("主催者は参加者に出さない", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [
      user(999, "テスト主催", "APPROVE"),
      user(11, "テスト太郎", "APPROVE"),
    ]);
    expect(extractEventDetail(state).participants.map((p) => p.userId)).toEqual([11]);
  });

  it("指定した ID は申込・キャンセルの両方から消える", () => {
    const state = eventState(
      9,
      "2026-09-22T06:00:00.000+09:00",
      [user(11, "テスト太郎", "APPROVE"), user(12, "テスト次郎", "APPROVE")],
      [user(11, "テスト太郎", "CANCEL"), user(13, "テスト三郎", "CANCEL")],
    );
    const detail = extractEventDetail(state, [11]);
    expect(detail.participants.map((p) => [p.userId, p.status])).toEqual([
      [12, "APPROVE"],
      [13, "CANCEL"],
    ]);
  });

  it("主催者が未知の状態でも無視した数に入れない", () => {
    const state = eventState(9, "2026-09-22T06:00:00.000+09:00", [user(999, "テスト主催", "APPLYING")]);
    const detail = extractEventDetail(state);
    expect(detail.ignoredStatusCount).toBe(0);
    expect(detail.participants).toEqual([]);
  });

  it("形が違えばエラー", () => {
    expect(() => extractEventDetail({ state: { feature: {} } })).toThrow(TennisbearError);
  });
});

describe("fetchEarlyEventDetails", () => {
  const circleHtml = htmlOf(
    circleState(
      [summary(5, "2026-10-06T06:00:00.000+09:00"), summary(6, "2026-10-06T12:00:00.000+09:00")],
      [summary(4, "2026-09-29T06:00:00.000+09:00"), summary(3, "2026-09-24T06:00:00.000+09:00", true)],
    ),
  );

  it("早朝だけを開始順に取得し、中止回は取得しない", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) => {
      if (url.endsWith("/circle/36659/events")) return response(circleHtml);
      if (url.endsWith("/event/4/info")) return response(htmlOf(eventState(4, "2026-09-29T06:00:00.000+09:00", [user(11, "テスト太郎", "APPROVE")])));
      if (url.endsWith("/event/5/info")) return response(htmlOf(eventState(5, "2026-10-06T06:00:00.000+09:00", [])));
      return response("", 404);
    });
    const sleep = vi.fn(async () => undefined);

    const details = await fetchEarlyEventDetails({ fetchFn, sleep, intervalMs: 1000 });

    expect(details.map((d) => [d.id, d.isCallOff, d.participants.length])).toEqual([
      [3, true, 0],
      [4, false, 1],
      [5, false, 0],
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://www.tennisbear.net/pickleball/circle/36659/events");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("HTTP エラーは TennisbearError", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => response("", 503));
    await expect(fetchEarlyEventDetails({ fetchFn, sleep: async () => undefined, intervalMs: 0 })).rejects.toThrow(
      "HTTP 503",
    );
  });

  it("詳細ページの ID が一覧と違えばエラー", async () => {
    const fetchFn = vi.fn<FetchFn>(async (url) =>
      url.endsWith("/events")
        ? response(htmlOf(circleState([summary(5, "2026-10-06T06:00:00.000+09:00")], [])))
        : response(htmlOf(eventState(99, "2026-10-06T06:00:00.000+09:00", []))),
    );
    await expect(fetchEarlyEventDetails({ fetchFn, sleep: async () => undefined, intervalMs: 0 })).rejects.toThrow(
      TennisbearError,
    );
  });
});
