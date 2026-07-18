import { describe, expect, it } from "vitest";
import {
  cancellationStats,
  demographics,
  demandHeatmap,
  jstYmdOfIso,
  leadTimeStats,
  onTheBooksPoints,
  paymentMethodShare,
  programFills,
  revPach,
  selfBookedInWeek,
  unpaidAging,
  wardCounts,
  weeklyKpis,
  weeklyReservationSeries,
} from "./reservationAggregates";
import type {
  CanonicalBundle,
  CanonicalCustomer,
  CanonicalReservation, CanonicalProgram, CanonicalBlockedSlot } from "./labolaNormalize";
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
    paymentStatus: "未払い",
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
  options: { customers?: CanonicalCustomer[]; salesDaily?: SalesSummaryRow[]; programs?: CanonicalProgram[]; blockedSlots?: CanonicalBlockedSlot[] } = {}
): CanonicalBundle {
  return {
    reservations,
    customers: options.customers ?? [],
    salesDaily: options.salesDaily ?? [],
    programs: options.programs ?? [],
    blockedSlots: options.blockedSlots ?? [],
    remarks: [],
    meta: {
      schemaVersion: 1,
      generatedAt: "2026-07-16T12:00:00+09:00",
      sourceSyncedAt: "2026-07-16T12:00:00+09:00",
      coverage: { start: "2026-06-01", end: "2026-07-16" },
      reservationsDigest: "",
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

  it("不正な日時は日本語エラーにする", () => {
    expect(() => jstYmdOfIso("不正な日時")).toThrow("日時を解釈できません");
  });
});

describe("P1拡張集計", () => {
  it("公開プログラムを予約と突合し、非公開・期間外を除外する", () => {
    const data = bundle([res({ space: "初級", category: "スクール", useDate: "2026-07-17", start: "10:00" }), res({ reservationId: "x", status: "cancelled", space: "初級", category: "スクール", useDate: "2026-07-17", start: "10:00" })]); data.programs = [{ name: "初級", category: "スクール", heldOn: "2026-07-17", start: "10:00", end: "11:00", capacity: 1, status: "", publishStatus: "公開" }, { name: "非公開", category: "", heldOn: "2026-07-17", start: "10:00", end: "", capacity: null, status: "", publishStatus: "非公開" }];
    expect(programFills(data, "2026-07-16")).toEqual([expect.objectContaining({ name: "初級", reserved: 1, fillRate: 1 })]);
  });
  it("プログラムは時刻順に並べ、定員なし・0は充足率なしとして対象外予約を数えない", () => {
    const data = bundle([
      res({ space: "午後", category: "スクール", useDate: "2026-07-17", start: "15:00" }),
      res({ reservationId: "space", space: "午前", category: "スペース予約", useDate: "2026-07-17", start: "09:00" }),
      res({ reservationId: "mismatch", space: "別名", category: "スクール", useDate: "2026-07-17", start: "09:00" }),
    ]);
    data.programs = [
      { name: "午後", category: "", heldOn: "2026-07-17", start: "15:00", end: "16:00", capacity: 0, status: "", publishStatus: "公開" },
      { name: "午前", category: "", heldOn: "2026-07-17", start: "09:00", end: "10:00", capacity: null, status: "", publishStatus: "公開" },
      { name: "翌日", category: "", heldOn: "2026-07-18", start: "09:00", end: "10:00", capacity: 1, status: "", publishStatus: "公開" },
      { name: "未来", category: "", heldOn: "2026-08-14", start: "09:00", end: "10:00", capacity: 1, status: "", publishStatus: "公開" },
    ];
    expect(programFills(data, "2026-07-16")).toEqual([
      expect.objectContaining({ name: "午前", reserved: 0, fillRate: null }),
      expect.objectContaining({ name: "午後", reserved: 1, fillRate: null }),
      expect.objectContaining({ name: "翌日", reserved: 0, fillRate: 0 }),
    ]);
  });
  it("未収金は未来利用を除外し、15日以上を分桶する", () => {
    const data = bundle([res({ bookedAt: "2026-06-30T10:00:00+09:00", useDate: "2026-07-01", amount: 1000 }), res({ reservationId: "future", useDate: "2026-07-20", amount: 999 })]);
    expect(unpaidAging(data, "2026-07-16")).toMatchObject({ count: 1, amount: 1000, buckets: [expect.anything(), expect.anything(), { label: "15日以上", count: 1, amount: 1000 }] }); expect(unpaidAging(bundle([], {}), "2026-07-16")).toBeNull();
  });
  it("支払方法と顧客分布を集計する", () => { const data = bundle([res({ paymentMethod: "" }), res({ reservationId: "2", paymentMethod: "カード" })], { customers: [customer({ gender: "女性" }), customer({ pseudoId: "d", gender: "女性" })] }); expect(paymentMethodShare(data, "2026-07-16")).toEqual([{ method: "カード", count: 1 }, { method: "不明", count: 1 }]); expect(demographics(data)).toEqual([{ ageBand: "30代", gender: "女性", customerType: "一般", count: 2 }]); });
  it("RevPACHは営業時間クリップとNone除外を反映する", () => { const data = bundle([res({ useDate: "2026-07-16", amount: 1020 })]); data.blockedSlots = [{ date: "2026-07-16", start: "05:00", end: "07:00", space: "Aコート" }, { date: "2026-07-16", start: "12:00", end: "13:00", space: "None" }]; expect(revPach(data, "2026-07-16")).toMatchObject({ revenue: 1020, availableCourtHours: 475, spaces: 1 }); });
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
      { start: "2026-07-06", end: "2026-07-12" }, "2026-07-16"
    );
    expect(kpi.actual).toEqual({ currentWeek: 1, priorWeek: 1, cumulative: 2 });
    expect(kpi.self).toEqual({ selfCount4w: 1, total4w: 2, smartphone4w: 1, unknown4w: 0 });
    expect(kpi.sales).toEqual({ currentWeek: null, priorWeek: null, forecast28: null });
  });

  it("実績売上と翌日から27日後までの見込み売上を合計する", () => {
    const data = bundle([], {
      salesDaily: [
        { date: "2026-07-14", isForecast: false, rentalSpace: 100, event: 0, memberFees: 0, total: 100 },
        { date: "2026-07-06", isForecast: false, rentalSpace: 200, event: 0, memberFees: 0, total: 200 },
        { date: "2026-07-20", isForecast: true, rentalSpace: 300, event: 0, memberFees: 0, total: 300 },
        { date: "2026-08-16", isForecast: true, rentalSpace: 400, event: 0, memberFees: 0, total: 400 },
        { date: "2026-08-17", isForecast: true, rentalSpace: 400, event: 0, memberFees: 0, total: 400 },
      ],
    });
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" }, "2026-07-16");
    expect(kpi.sales).toEqual({ currentWeek: 100, priorWeek: 200, forecast28: 300 });
  });

  it("週の開始日・終了日を含め、範囲外の受付日は除く", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-13T00:00:00+09:00" }),
      res({ reservationId: "2", bookedAt: "2026-07-19T23:59:00+09:00" }),
      res({ reservationId: "3", bookedAt: "2026-07-12T23:59:00+09:00" }),
      res({ reservationId: "4", bookedAt: "2026-07-20T00:00:00+09:00" }),
    ]);
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" }, "2026-07-16");
    expect(kpi.actual.currentWeek).toBe(2);
    expect(kpi.actual.priorWeek).toBe(1);
  });

  it("28日セルフ予約窓と28日見込み売上窓の両端を含め、直外を除く", () => {
    const data = bundle([
      res({ bookedAt: "2026-06-22T00:00:00+09:00", channel: "user_sp" }),
      res({ reservationId: "2", bookedAt: "2026-07-19T23:59:59+09:00", channel: "user_pc" }),
      res({ reservationId: "3", bookedAt: "2026-06-21T23:59:59+09:00", channel: "user_sp" }),
      res({ reservationId: "4", bookedAt: "2026-07-20T00:00:00+09:00", channel: "user_sp" }),
    ], {
      salesDaily: [
        { date: "2026-07-16", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 100 },
        { date: "2026-08-12", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 200 },
        { date: "2026-07-15", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 400 },
        { date: "2026-08-13", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 800 },
      ],
    });
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" }, "2026-07-16");
    expect(kpi.self).toEqual({ selfCount4w: 2, total4w: 2, smartphone4w: 1, unknown4w: 0 });
    expect(kpi.sales.forecast28).toBe(300);
  });

  it("直近28日のunknown予約方法を別集計する", () => {
    const data = bundle([
      res({ channel: "unknown" }),
      res({ reservationId: "2", channel: "unknown", status: "cancelled" }),
    ]);
    const kpi = weeklyKpis(data, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" }, "2026-07-16");
    expect(kpi.self.unknown4w).toBe(1);
  });
});

describe("onTheBooksPoints", () => {
  it("利用日の先行日数ごとに確定予約と見込み売上を境界を含めて集計する", () => {
    const data = bundle([
      res({ reservationId: "today", useDate: "2026-07-16" }),
      res({ reservationId: "seven", useDate: "2026-07-23" }),
      res({ reservationId: "eight", useDate: "2026-07-24" }),
      res({ reservationId: "cancelled", useDate: "2026-07-20", status: "cancelled" }),
    ], {
      salesDaily: [
        { date: "2026-07-23", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 100 },
        { date: "2026-07-24", isForecast: true, rentalSpace: 0, event: 0, memberFees: 0, total: 200 },
        { date: "2026-07-30", isForecast: false, rentalSpace: 0, event: 0, memberFees: 0, total: 500 },
      ],
    });

    expect(onTheBooksPoints(data, "2026-07-16")).toEqual([
      { daysOut: 7, reservations: 1, forecastSales: 100 },
      { daysOut: 14, reservations: 2, forecastSales: 300 },
      { daysOut: 21, reservations: 2, forecastSales: 300 },
      { daysOut: 28, reservations: 2, forecastSales: 300 },
    ]);
  });

  it("売上CSV欠落はnull、実績日だけなら見込み0として区別する", () => {
    expect(onTheBooksPoints(bundle([]), "2026-07-16").every((point) => point.forecastSales === null)).toBe(true);
    const data = bundle([], { salesDaily: [{ date: "2026-07-17", isForecast: false, rentalSpace: 0, event: 0, memberFees: 0, total: 100 }] });
    expect(onTheBooksPoints(data, "2026-07-16").every((point) => point.forecastSales === 0)).toBe(true);
  });
});

describe("selfBookedInWeek", () => {
  it("セルフ経路だけを受付日の週境界を含めて数え、取消済みも比較対象に含める", () => {
    const reservations = [
      res({ reservationId: "start", bookedAt: "2026-07-13T00:00:00+09:00", channel: "user_sp" }),
      res({ reservationId: "end", bookedAt: "2026-07-19T23:59:59+09:00", channel: "user_pc", status: "cancelled" }),
      res({ reservationId: "admin", bookedAt: "2026-07-15T10:00:00+09:00", channel: "admin" }),
      res({ reservationId: "unknown", bookedAt: "2026-07-15T10:00:00+09:00", channel: "unknown" }),
      res({ reservationId: "before", bookedAt: "2026-07-12T23:59:59+09:00", channel: "user_sp" }),
      res({ reservationId: "after", bookedAt: "2026-07-20T00:00:00+09:00", channel: "user_pc" }),
    ];

    expect(selfBookedInWeek(reservations, { start: "2026-07-13", end: "2026-07-19" })).toBe(2);
  });
});

describe("weeklyReservationSeries", () => {
  it("coverage開始週から収録終了週までを0埋めし、キャンセルを除外する", () => {
    const data = bundle([
      res({ bookedAt: "2026-07-01T10:00:00+09:00" }),
      res({ reservationId: "2", bookedAt: "2026-07-15T10:00:00+09:00" }),
      res({ reservationId: "3", bookedAt: "2026-07-15T10:00:00+09:00", status: "cancelled" }),
    ]);
    expect(weeklyReservationSeries(data)).toEqual([
      { weekStart: "2026-06-01", count: 0 },
      { weekStart: "2026-06-08", count: 0 },
      { weekStart: "2026-06-15", count: 0 },
      { weekStart: "2026-06-22", count: 0 },
      { weekStart: "2026-06-29", count: 1 },
      { weekStart: "2026-07-06", count: 0 },
    ]);
  });

  it("収録範囲に完了週が1つも無ければ空を返す", () => {
    const data = bundle([]);
    data.meta.coverage = { start: "2026-07-14", end: "2026-07-15" };
    expect(weeklyReservationSeries(data)).toEqual([]);
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
  it("不正時刻・営業時間外・対象期間外の予約を集計しない", () => {
    const data = bundle([
      res({ start: "invalid", end: "20:00" }),
      res({ reservationId: "2", start: "25:00", end: "26:00" }),
      res({ reservationId: "3", start: "01:00", end: "05:00" }),
      res({ reservationId: "4", useDate: "2026-05-01" }),
    ]);
    expect(demandHeatmap(data, "2026-07-16").every((cell) => cell.count === 0)).toBe(true);
  });
  it("時刻パース不能・範囲外・6時前を飛ばし、有効な予約だけを計上する", () => {
    const base = res({ useDate: "2026-07-10", start: "19:00", end: "20:00" });
    const data: CanonicalBundle = {
      reservations: [
        { ...base, reservationId: "bad-format", start: "ab:cd" },
        { ...base, reservationId: "out-of-range", start: "25:00", end: "26:00" },
        { ...base, reservationId: "before-open", start: "01:00", end: "05:00" },
        { ...base, reservationId: "valid" },
      ],
      customers: [], salesDaily: [], programs: [], blockedSlots: [], remarks: [],
      meta: { schemaVersion: 1, generatedAt: "2026-07-16T12:00:00+09:00", sourceSyncedAt: "2026-07-16T12:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, reservationsDigest: "", counts: {}, excludedCount: 0, missingSections: [], warnings: [] },
    };
    const cells = demandHeatmap(data, "2026-07-16");
    expect(cells.find((cell) => cell.dow === 4 && cell.slot === "18-21")?.count).toBe(1);
    expect(cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(1);
  });
  it("不正な利用日は曜日計算前に日本語エラーにする", () => {
    const data = bundle([res({ useDate: "2026-06-2x", status: "confirmed", start: "10:00", end: "11:00" })]);
    expect(() => demandHeatmap(data, "2026-07-16")).toThrow("日付を解釈できません");
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
  it("予約数・顧客数が同じ商圏は名称順にし、顧客だけの商圏も含める", () => {
    const data = bundle([res({ ward: "横浜市" }), res({ reservationId: "2", ward: "荒川区" })], { customers: [customer({ ward: "横浜市" }), customer({ pseudoId: "z", ward: "荒川区" }), customer({ pseudoId: "only", ward: "千代田区" })] });
    expect(wardCounts(data)).toEqual([
      { ward: "横浜市", customers: 1, reservations: 1 },
      { ward: "荒川区", customers: 1, reservations: 1 },
      { ward: "千代田区", customers: 1, reservations: 0 },
    ]);
  });
  it("不明が比較の右側でも常に末尾になる", () => {
    const data = bundle([res({ ward: "不明" }), res({ reservationId: "2", ward: "台東区" }), res({ reservationId: "3", ward: "市川市" })]);
    expect(wardCounts(data).at(-1)).toMatchObject({ ward: "不明" });
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

describe("P1拡張ライトのカバレッジ境界", () => {
  it("jstYmdOfIsoは不正な日時を日本語エラーにする", () => {
    expect(() => jstYmdOfIso("不正")).toThrow("日時を解釈できません");
  });

  it("unpaidAgingは経過日数帯ごとに件数と金額(null=0)を積む", () => {
    const data = bundle([
      res({ reservationId: "u1", bookedAt: "2026-07-14T10:00:00+09:00", useDate: "2026-07-15", amount: 500 }),
      res({ reservationId: "u2", bookedAt: "2026-07-06T10:00:00+09:00", useDate: "2026-07-07", amount: null }),
      res({ reservationId: "u3", bookedAt: "2026-06-25T10:00:00+09:00", useDate: "2026-06-26", amount: 2000 }),
    ]);
    expect(unpaidAging(data, "2026-07-16")).toEqual({
      count: 3,
      amount: 2500,
      buckets: [
        { label: "0-7日", count: 1, amount: 500 },
        { label: "8-14日", count: 1, amount: 0 },
        { label: "15日以上", count: 1, amount: 2000 },
      ],
    });
  });

  it("unpaidAgingは処理待ちを決済処理中として未収金から除外する", () => {
    const data = bundle([res({ paymentStatus: "処理待ち", useDate: "2026-07-15" })]);
    expect(unpaidAging(data, "2026-07-16")).toMatchObject({ count: 0, amount: 0 });
  });

  it("demographicsは件数降順・同数は年代の五十音順にする", () => {
    const data = bundle([], {
      customers: [
        customer({ pseudoId: "c1", ageBand: "30代", gender: "女性" }),
        customer({ pseudoId: "c2", ageBand: "30代", gender: "女性" }),
        customer({ pseudoId: "c3", ageBand: "20代", gender: "男性" }),
        customer({ pseudoId: "c4", ageBand: "40代", gender: "男性" }),
      ],
    });
    expect(demographics(data)).toEqual([
      { ageBand: "30代", gender: "女性", customerType: "一般", count: 2 },
      { ageBand: "20代", gender: "男性", customerType: "一般", count: 1 },
      { ageBand: "40代", gender: "男性", customerType: "一般", count: 1 },
    ]);
  });

  it("revPachは収録範囲外でnull・None面と不正時刻とnull金額を安全に扱う", () => {
    const early = bundle([res({})]);
    early.meta.coverage = { start: "2026-07-20", end: "2026-07-21" };
    expect(revPach(early, "2026-07-16")).toBeNull();

    const data = bundle(
      [
        res({ reservationId: "r1", useDate: "2026-07-10", amount: 1020, space: "Aコート" }),
        res({ reservationId: "r2", useDate: "2026-07-10", amount: null, space: "Aコート" }),
        res({ reservationId: "r3", useDate: "2026-07-10", space: "None" }),
      ],
      { blockedSlots: [{ date: "2026-07-10", start: "ab:cd", end: "10:00", space: "Aコート" }] }
    );
    const result = revPach(data, "2026-07-16");
    expect(result).not.toBeNull();
    expect(result?.spaces).toBe(1);
    expect(result?.revenue).toBe(2020);
  });

  it("revPachは全時間が予約不可なら時間あたり売上を0にする", () => {
    const data = bundle([res({ reservationId: "r1", useDate: "2026-07-10", amount: 100, space: "Aコート" })]);
    data.meta.coverage = { start: "2026-07-10", end: "2026-07-10" };
    data.blockedSlots = [{ date: "2026-07-10", start: "06:00", end: "23:00", space: "Aコート" }];
    expect(revPach(data, "2026-07-10")).toMatchObject({ availableCourtHours: 0, revPerCourtHour: 0 });
  });
});
