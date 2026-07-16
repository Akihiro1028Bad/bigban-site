import { describe, expect, it } from "vitest";
import {
  cancellationStats,
  demandHeatmap,
  jstYmdOfIso,
  leadTimeStats,
  wardCounts,
  weeklyKpis,
  weeklyReservationSeries,
} from "./reservationAggregates";
import type {
  CanonicalBundle,
  CanonicalCustomer,
  CanonicalReservation,
} from "./labolaNormalize";
import type { SalesSummaryRow } from "./labolaSchemas";

function res(overrides: Partial<CanonicalReservation> = {}): CanonicalReservation {
  return {
    reservationId: "1",
    bookedAt: "2026-07-14T10:00:00+09:00",
    useDate: "2026-07-18",
    start: "19:00",
    end: "21:00",
    category: "スペース予約",
    space: "Aコート",
    status: "confirmed",
    acceptStatus: "受付済",
    paymentStatus: "入金待ち",
    paymentMethod: "カード",
    plan: "一般",
    amount: 1000,
    partySize: null,
    channel: "user_sp",
    customerType: "一般",
    pseudoId: "a",
    ward: "台東区",
    ageBand: "30代",
    gender: "",
    occupationGroup: "会社員",
    hasRemarks: false,
    ...overrides,
  };
}

function customer(overrides: Partial<CanonicalCustomer> = {}): CanonicalCustomer {
  return {
    pseudoId: "c",
    registeredAt: "2026-07-01",
    customerType: "一般",
    ward: "台東区",
    ageBand: "30代",
    gender: "",
    occupationGroup: "会社員",
    ...overrides,
  };
}

function bundle(
  reservations: CanonicalReservation[],
  options: { customers?: CanonicalCustomer[]; salesDaily?: SalesSummaryRow[] } = {}
): CanonicalBundle {
  return {
    reservations,
    customers: options.customers ?? [],
    salesDaily: options.salesDaily ?? [],
    remarks: [],
    meta: {
      schemaVersion: 1,
      generatedAt: "2026-07-16T12:00:00+09:00",
      coverage: { start: "2026-06-01", end: "2026-07-16" },
      counts: {},
      excludedCount: 0,
      missingSections: [],
      warnings: [],
    },
  };
}

describe("jstYmdOfIso", () => {
  it("UTCの境界をJST日付へ変換する", () => {
    expect(jstYmdOfIso("2026-07-15T15:00:00Z")).toBe("2026-07-16");
  });
});

describe("weeklyKpis", () => {
  it("受付日ベースで週件数・累積・セルフ予約を返す", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-14T10:00:00+09:00", channel: "user_sp" }),
      res({ reservationId: "2", bookedAt: "2026-07-06T10:00:00+09:00", channel: "admin" }),
      res({ reservationId: "3", bookedAt: "2026-07-14T11:00:00+09:00", status: "cancelled" }),
    ]);
    const kpi = weeklyKpis(
      data,
      { start: "2026-07-13", end: "2026-07-19" },
      { start: "2026-07-06", end: "2026-07-12" }
    );
    expect(kpi.actual).toEqual({ currentWeek: 1, priorWeek: 1, cumulative: 2 });
    expect(kpi.self).toEqual({ selfCount4w: 1, total4w: 2, smartphone4w: 1 });
    expect(kpi.sales).toEqual({ currentWeek: null, priorWeek: null, forecast28: null });
  });

  it("実績売上と翌日から27日後までの見込み売上を合計する", () => {
    const data = bundle([], {
      salesDaily: [
        { date: "2026-07-14", isForecast: false, rentalSpace: 100, event: 0, goods: 0, total: 100 },
        { date: "2026-07-06", isForecast: false, rentalSpace: 200, event: 0, goods: 0, total: 200 },
        { date: "2026-07-20", isForecast: true, rentalSpace: 300, event: 0, goods: 0, total: 300 },
        { date: "2026-08-16", isForecast: true, rentalSpace: 400, event: 0, goods: 0, total: 400 },
        { date: "2026-08-17", isForecast: true, rentalSpace: 400, event: 0, goods: 0, total: 400 },
      ],
    });
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" });
    expect(kpi.sales).toEqual({ currentWeek: 100, priorWeek: 200, forecast28: 300 });
  });

  it("週の開始日・終了日を含め、範囲外の受付日は除く", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-13T00:00:00+09:00" }),
      res({ reservationId: "2", bookedAt: "2026-07-19T23:59:00+09:00" }),
      res({ reservationId: "3", bookedAt: "2026-07-12T23:59:00+09:00" }),
      res({ reservationId: "4", bookedAt: "2026-07-20T00:00:00+09:00" }),
    ]);
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" });
    expect(kpi.actual.currentWeek).toBe(2);
    expect(kpi.actual.priorWeek).toBe(1);
  });
});

describe("weeklyReservationSeries", () => {
  it("月曜始まりで最古週から実行週までを0埋めし、キャンセルを除外する", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-01T10:00:00+09:00" }),
      res({ reservationId: "2", bookedAt: "2026-07-15T10:00:00+09:00" }),
      res({ reservationId: "3", bookedAt: "2026-07-15T10:00:00+09:00", status: "cancelled" }),
    ]);
    expect(weeklyReservationSeries(data)).toEqual([
      { weekStart: "2026-06-29", count: 1 },
      { weekStart: "2026-07-06", count: 0 },
      { weekStart: "2026-07-13", count: 1 },
    ]);
  });
});

describe("demandHeatmap", () => {
  it("直近28日の利用日で時間帯の区間重なりを計上し、キャンセルと営業時間外を除く", () => {
    const data = bundle([
      res({ useDate: "2026-07-10", start: "19:00", end: "21:30" }),
      res({ reservationId: "2", useDate: "2026-07-10", start: "05:00", end: "06:00" }),
      res({ reservationId: "3", useDate: "2026-07-10", status: "cancelled" }),
    ]);
    const cells = demandHeatmap(data, "2026-07-16");
    expect(cells.find((cell) => cell.dow === 4 && cell.slot === "18-21")?.count).toBe(1);
    expect(cells.find((cell) => cell.dow === 4 && cell.slot === "21-23")?.count).toBe(1);
  });

  it("スロット境界で終了する予約を次の半開区間へ計上しない", () => {
    const data = bundle([res({ useDate: "2026-07-10", start: "19:00", end: "21:00" })]);
    const cells = demandHeatmap(data, "2026-07-16");
    expect(cells.find((cell) => cell.dow === 4 && cell.slot === "18-21")?.count).toBe(1);
    expect(cells.find((cell) => cell.dow === 4 && cell.slot === "21-23")?.count).toBe(0);
  });
});

describe("leadTimeStats", () => {
  it("直近28日の受付分からリードタイムの分位点を返す", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-01T10:00:00+09:00", useDate: "2026-07-05" }),
      res({ reservationId: "2", bookedAt: "2026-07-02T10:00:00+09:00", useDate: "2026-07-10" }),
      res({ reservationId: "3", bookedAt: "2026-06-01T10:00:00+09:00", useDate: "2026-06-03" }),
      res({ reservationId: "4", bookedAt: "2026-07-03T10:00:00+09:00", status: "cancelled" }),
    ]);
    expect(leadTimeStats(data, "2026-07-16")).toEqual({ n: 2, median: 6, p25: 5, p75: 7 });
    expect(leadTimeStats(bundle([]), "2026-07-16")).toBeNull();
  });
});

describe("wardCounts", () => {
  it("予約数降順で不明を末尾にし、キャンセルを予約数から除く", () => {
    const data = bundle(
      [
        res({ ward: "市川市" }),
        res({ reservationId: "2", ward: "台東区" }),
        res({ reservationId: "3", ward: "台東区" }),
        res({ reservationId: "4", ward: "不明" }),
        res({ reservationId: "5", ward: "市川市", status: "cancelled" }),
      ],
      { customers: [customer({ ward: "市川市" }), customer({ pseudoId: "d", ward: "台東区" }), customer({ pseudoId: "e", ward: "不明" })] }
    );
    expect(wardCounts(data)).toEqual([
      { ward: "台東区", customers: 1, reservations: 2 },
      { ward: "市川市", customers: 1, reservations: 1 },
      { ward: "不明", customers: 1, reservations: 1 },
    ]);
  });
});

describe("cancellationStats", () => {
  it("直近28日の受付分からキャンセル率とWilson区間を返す", () => {
    const data = bundle([
      res({ status: "cancelled" }),
      res({ reservationId: "2" }),
      res({ reservationId: "3", bookedAt: "2026-06-01T10:00:00+09:00" }),
    ]);
    const stats = cancellationStats(data, "2026-07-16");
    expect(stats).toMatchObject({ n: 2, cancelled: 1, rate: 0.5 });
    expect(stats?.ciLow).toBeLessThan(0.5);
    expect(stats?.ciHigh).toBeGreaterThan(0.5);
    expect(cancellationStats(bundle([]), "2026-07-16")).toBeNull();
  });
});
