import { describe, expect, it, vi } from "vitest";

import {
  aggregateReservations,
  actualReservationsForPage,
  isReservationDataFresh,
  parseCanonicalMeta,
  parseCanonicalReservationsJsonl,
  reservationCoverageForPeriods,
  selectLatestReservationSnapshot,
} from "./reservations";
import { parseCsvRows } from "./labolaCsv";
import type { ParsedReservationCsv, ReservationRecord } from "./reservations";

const current = { start: "2026-07-07", end: "2026-07-13" };
const prior = { start: "2026-06-30", end: "2026-07-06" };

/** 集計既存ケース用の入力ビルダー。旧CSVパーサのAPIではない。 */
function parsedFixture(input: string): ParsedReservationCsv {
  const rows = parseCsvRows(input);
  const headers = rows[0] ?? [];
  const sourceIndex = headers.indexOf("source_page_path");
  const records = rows.slice(1).map((row): ReservationRecord => ({
    reservationId: row[0] ?? "", bookedAt: row[1] ?? "", status: (row[2] ?? "confirmed") as ReservationRecord["status"],
    ...(sourceIndex >= 0 ? { sourcePagePath: row[sourceIndex] ?? "" } : {}),
  }));
  return { records, hasSourcePagePath: sourceIndex >= 0 };
}

describe("reservation coverage", () => {
  it("正準metaの収録開始・終了日を検証して解析する", () => {
    expect(parseCanonicalMeta('{"generatedAt":"2026-07-16T05:20:00.000Z","sourceSyncedAt":"2026-07-08T05:20:00.000Z","reservationsDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","coverage":{"start":"2026-06-30","end":"2026-07-13"}}')).toEqual({ generatedAt: "2026-07-16T05:20:00.000Z", sourceSyncedAt: "2026-07-08T05:20:00.000Z", reservationsDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", coverage: { start: "2026-06-30", end: "2026-07-13" } });
    expect(() => parseCanonicalMeta('{"generatedAt":"x","coverage":{"start":"2026-07-13","end":"2026-06-30"}}')).toThrow(/generatedAt/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","sourceSyncedAt":"2026-07-16T00:00:00Z","reservationsDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","coverage":{"start":"2026-07-13","end":"2026-06-30"}}')).toThrow(/前後/);
    expect(() => parseCanonicalMeta("{")).toThrow(/JSON/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","sourceSyncedAt":"2026-07-16T00:00:00Z","reservationsDigest":"xyz","coverage":{"start":"2026-07-01","end":"2026-07-16"}}')).toThrow(/reservationsDigest/);
    expect(() => parseCanonicalMeta("null")).toThrow(/形式/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","sourceSyncedAt":"2026-07-16T00:00:00Z","reservationsDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')).toThrow(/coverage/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","sourceSyncedAt":"2026-07-16T00:00:00Z","reservationsDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","coverage":{"start":"bad","end":"2026-07-16"}}')).toThrow(/日付/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","coverage":{"start":"2026-07-01","end":"2026-07-16"}}')).toThrow(/sourceSyncedAt/);
    expect(() => parseCanonicalMeta('{"generatedAt":"2026-07-16T00:00:00Z","sourceSyncedAt":"2026-02-30T12:00:00Z","coverage":{"start":"2026-07-01","end":"2026-07-16"}}')).toThrow(/sourceSyncedAt/);
  });

  it("currentとpriorを別々に収録判定する", () => {
    expect(
      reservationCoverageForPeriods(
        { start: "2026-07-07", end: "2026-07-13" },
        current,
        prior
      )
    ).toEqual({ current: true, prior: false });
  });
});

describe("parseCanonicalReservationsJsonl", () => {
  it("JSONLを既存のParsedReservationCsvへ変換する", () => {
    const parsed = parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-07-15T14:19:00+09:00","status":"confirmed"}\n{"reservationId":"2","bookedAt":"2026-07-13T10:00:00+09:00","status":"cancelled"}\n');
    expect(parsed).toMatchObject({ hasSourcePagePath: false, records: [{ reservationId: "1" }, { reservationId: "2" }] });
  });
  it("不正statusを拒否する", () => expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-07-15T14:19:00+09:00","status":"pending"}\n')).toThrow(/status/));
  it("JSON・形式・ID重複・日時不正を拒否する", () => {
    expect(() => parseCanonicalReservationsJsonl("{\n")).toThrow(/JSON/);
    expect(() => parseCanonicalReservationsJsonl("[]\n")).toThrow(/reservationId/);
    expect(() => parseCanonicalReservationsJsonl("null\n")).toThrow(/形式/);
    expect(() => parseCanonicalReservationsJsonl('"text"\n')).toThrow(/形式/);
    expect(() => parseCanonicalReservationsJsonl('{"reservationId":"","bookedAt":"2026-07-15T00:00:00Z","status":"confirmed"}\n')).toThrow(/reservationId/);
    expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"x","status":"confirmed"}\n')).toThrow(/日時/);
    expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-02-30T12:00:00Z","status":"confirmed"}\n')).toThrow(/日時/);
    expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-07-15T12:00:00","status":"confirmed"}\n')).toThrow(/日時/);
    expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-07-15T00:00:00Z","status":"confirmed"}\n{"reservationId":"1","bookedAt":"2026-07-15T00:00:00Z","status":"confirmed"}\n')).toThrow(/重複/);
  });
});

describe("aggregateReservations", () => {
  it("confirmed/completedだけをJST境界日で集計しcancelledを除外する", () => {
    const parsed = parsedFixture(
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
    const parsed = parsedFixture("reservation_id,booked_at,status\n");
    expect(aggregateReservations(parsed, current, prior, "/news/a")).toEqual({
      facility: { current: 0, prior: 0, deltaPct: null },
      article: null,
    });
  });

  it("source_page_pathが空・別記事なら記事帰属へ数えない", () => {
    const parsed = parsedFixture(
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
      const parsed = parsedFixture(
        "reservation_id,booked_at,status\nr1,2026-07-10T00:00:00+09:00,confirmed\n"
      );
      expect(aggregateReservations(parsed, current, prior, "/news/a").facility.current).toBe(0);
    } finally {
      formatToParts.mockRestore();
    }
  });
});

describe("actualReservationsForPage", () => {
  const checkedAt = "2026-07-15T00:00:00.000Z";
  const syncedAt = "2026-07-14T00:00:00.000Z";

  it("current/prior両期間を収録した空CSVだけをfreshな実測0として扱う", () => {
    const parsed = parsedFixture("reservation_id,booked_at,status\n");
    expect(
      actualReservationsForPage({
        parsed,
        coverage: { start: "2026-06-30", end: "2026-07-13" },
        current,
        prior,
        pagePath: "/news/a",
        syncedAt,
        checkedAt,
      })
    ).toEqual({
      state: "available",
      source: "csv",
      syncedAt,
      facility: { current: 0, prior: 0, deltaPct: null },
      article: null,
    });
  });

  it("prior未収録なら0件ではなくcoverage_incompleteとして代理指標へ倒す", () => {
    const parsed = parsedFixture(
      "reservation_id,booked_at,status\nr1,2026-07-10T00:00:00+09:00,confirmed\n"
    );
    expect(
      actualReservationsForPage({
        parsed,
        coverage: { start: "2026-07-07", end: "2026-07-13" },
        current,
        prior,
        pagePath: "/news/a",
        syncedAt,
        checkedAt,
      })
    ).toEqual({
      state: "missing",
      reason: "coverage_incomplete",
      checkedAt,
      coverage: {
        start: "2026-07-07",
        end: "2026-07-13",
        current: true,
        prior: false,
      },
    });
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
