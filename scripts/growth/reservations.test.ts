import { describe, expect, it, vi } from "vitest";

import {
  aggregateReservations,
  isReservationDataFresh,
  parseReservationCsv,
  selectLatestReservationSnapshot,
} from "./reservations";

const current = { start: "2026-07-07", end: "2026-07-13" };
const prior = { start: "2026-06-30", end: "2026-07-06" };

describe("parseReservationCsv", () => {
  it("正規化CSVとquoted fieldを解析する", () => {
    const parsed = parseReservationCsv(
      'reservation_id,booked_at,status,source_page_path\n"r,1",2026-07-10T12:30:00+09:00,confirmed,"/news/a?x=1"\n'
    );
    expect(parsed.hasSourcePagePath).toBe(true);
    expect(parsed.records).toEqual([
      {
        reservationId: "r,1",
        bookedAt: "2026-07-10T12:30:00+09:00",
        status: "confirmed",
        sourcePagePath: "/news/a?x=1",
      },
    ]);
  });

  it("quoted field内の二重引用符を1文字の引用符として復元する", () => {
    const parsed = parseReservationCsv(
      'reservation_id,booked_at,status,source_page_path\n"r""1",2026-07-10T12:30:00+09:00,confirmed,/news/a\n'
    );
    expect(parsed.records[0]?.reservationId).toBe('r"1');
  });

  it("CR単独改行と空行を受け入れる", () => {
    const parsed = parseReservationCsv(
      "reservation_id,booked_at,status\r\rr1,2026-07-10T12:30:00+09:00,confirmed\r"
    );
    expect(parsed.records).toHaveLength(1);
    expect(
      parseReservationCsv(
        "reservation_id,booked_at,status\r\nr2,2026-07-11T12:30:00+09:00,completed\r\n"
      ).records
    ).toHaveLength(1);
  });

  it("空入力・閉じていない引用符・空の必須値を拒否する", () => {
    expect(() => parseReservationCsv("")).toThrow(/reservation_id/);
    expect(() => parseReservationCsv('reservation_id,booked_at,status\n"r1,2026-07-10,confirmed')).toThrow(/引用符/);
    expect(() => parseReservationCsv("reservation_id,booked_at,status\n,2026-07-10T00:00:00+09:00,confirmed")).toThrow(/reservation_idが空/);
    expect(() => parseReservationCsv("booked_at,status,reservation_id\n2026-07-10T00:00:00+09:00,confirmed")).toThrow(/reservation_idが空/);
    expect(() => parseReservationCsv("reservation_id,booked_at,status\nr1")).toThrow(/日時/);
  });

  it("source_page_path列の値が欠けた行は空文字として扱う", () => {
    const parsed = parseReservationCsv(
      "reservation_id,booked_at,status,source_page_path\nr1,2026-07-10T00:00:00+09:00,confirmed"
    );
    expect(parsed.records[0]?.sourcePagePath).toBe("");
  });

  it("必須列不足・不正日時・未知status・重複IDを拒否する", () => {
    expect(() => parseReservationCsv("reservation_id,booked_at\nr1,2026-07-10")).toThrow(/status/);
    expect(() => parseReservationCsv("reservation_id,booked_at,status\nr1,nope,confirmed")).toThrow(/日時/);
    expect(() => parseReservationCsv("reservation_id,booked_at,status\nr1,2026-07-10T00:00:00+09:00,pending")).toThrow(/status/);
    expect(() => parseReservationCsv("reservation_id,booked_at,status\nr1,2026-07-10T00:00:00+09:00,confirmed\nr1,2026-07-11T00:00:00+09:00,completed")).toThrow(/重複/);
  });
});

describe("aggregateReservations", () => {
  it("confirmed/completedだけをJST境界日で集計しcancelledを除外する", () => {
    const parsed = parseReservationCsv(
      "reservation_id,booked_at,status,source_page_path\n" +
        "a,2026-07-07T00:00:00+09:00,confirmed,/news/a\n" +
        "b,2026-07-13T23:59:59+09:00,completed,/news/a\n" +
        "c,2026-07-06T23:59:59+09:00,confirmed,/news/a\n" +
        "d,2026-07-10T00:00:00+09:00,cancelled,/news/a\n"
    );
    expect(aggregateReservations(parsed, current, prior, "/news/a")).toEqual({
      facility: { current: 2, prior: 1, deltaPct: 100 },
      article: { current: 2, prior: 1, deltaPct: 100 },
    });
  });

  it("source_page_path列がなければarticle=null、空CSVは有効な0件", () => {
    const parsed = parseReservationCsv("reservation_id,booked_at,status\n");
    expect(aggregateReservations(parsed, current, prior, "/news/a")).toEqual({
      facility: { current: 0, prior: 0, deltaPct: null },
      article: null,
    });
  });

  it("source_page_pathが空・別記事なら記事帰属へ数えない", () => {
    const parsed = parseReservationCsv(
      "reservation_id,booked_at,status,source_page_path\n" +
        "a,2026-07-10T00:00:00+09:00,confirmed,\n" +
        "b,2026-07-11T00:00:00+09:00,confirmed,/news/other\n"
    );
    expect(aggregateReservations(parsed, current, prior, "/news/a")).toEqual({
      facility: { current: 2, prior: 0, deltaPct: null },
      article: { current: 0, prior: 0, deltaPct: null },
    });
  });

  it("Intlが要求した日付部品を返さない場合も範囲外として安全に扱う", () => {
    const formatToParts = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([
        { type: "year", value: "2026" },
        { type: "month", value: "07" },
      ]);
    try {
      const parsed = parseReservationCsv(
        "reservation_id,booked_at,status\nr1,2026-07-10T00:00:00+09:00,confirmed\n"
      );
      expect(aggregateReservations(parsed, current, prior, "/news/a").facility.current).toBe(0);
    } finally {
      formatToParts.mockRestore();
    }
  });
});

describe("reservation freshness", () => {
  it("7日以内はfresh、7日超・不正・未来はstale", () => {
    const checkedAt = "2026-07-15T00:00:00.000Z";
    expect(isReservationDataFresh("2026-07-08T00:00:00.000Z", checkedAt)).toBe(true);
    expect(isReservationDataFresh("2026-07-07T23:59:59.000Z", checkedAt)).toBe(false);
    expect(isReservationDataFresh("invalid", checkedAt)).toBe(false);
    expect(isReservationDataFresh("2026-07-16T00:00:00.000Z", checkedAt)).toBe(false);
  });

  it("複数snapshotから最新のavailableを選ぶ", () => {
    expect(
      selectLatestReservationSnapshot([
        { state: "missing", reason: "read_error", checkedAt: "2026-07-15T00:00:00.000Z" },
        {
          state: "available",
          source: "csv",
          syncedAt: "2026-07-10T00:00:00.000Z",
          facility: { current: 1, prior: 0, deltaPct: null },
          article: null,
        },
        {
          state: "available",
          source: "csv",
          syncedAt: "2026-07-14T00:00:00.000Z",
          facility: { current: 2, prior: 1, deltaPct: 100 },
          article: null,
        },
      ])?.syncedAt
    ).toBe("2026-07-14T00:00:00.000Z");
  });

  it("available snapshotが無ければnullを返す", () => {
    expect(
      selectLatestReservationSnapshot([
        { state: "missing", reason: "not_configured", checkedAt: "2026-07-15T00:00:00.000Z" },
      ])
    ).toBeNull();
  });
});
