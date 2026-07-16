import { expect, it } from "vitest";
import { firstSeenWard } from "./firstSeenWard";
import { snapshotSchema } from "../snapshotSchema";

const bundle = { reservations: [{ reservationId: "1", bookedAt: "2026-07-14T10:00:00+09:00", useDate: "2026-07-15", start: "19:00", end: "20:00", category: "x", space: "x", status: "confirmed" as const, acceptStatus: "", paymentStatus: "", paymentMethod: "", plan: "", amount: null, partySize: null, channel: "user_sp" as const, customerType: "", pseudoId: "x", ward: "葛飾区", ageBand: "", gender: "", occupationGroup: "", hasRemarks: false }], customers: [{ pseudoId: "x", registeredAt: "2026-07-01", customerType: "", ward: "葛飾区", ageBand: "", gender: "", occupationGroup: "" }], salesDaily: [], remarks: [], meta: { schemaVersion: 1 as const, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "", end: "" }, counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
const previous = snapshotSchema.parse({ schemaVersion: 1, generatedAt: "2026-07-16T00:00:00+09:00", coverage: { start: "2026-06-01", end: "2026-07-16" }, meta: { inputs: [], excludedCount: 0, missingSections: [], warnings: [] }, kpi: { actual: { currentWeek: 0, priorWeek: 0, cumulative: 0 }, self: { selfCount4w: 0, total4w: 0, smartphone4w: 0 }, sales: { currentWeek: null, priorWeek: null, forecast28: null } }, catalog: { heatmap: [], leadTime: null, cancellation: null, wards: [] }, series: { weeklyReservations: [] }, insights: [] });
it("初回は空、前回ありなら新規市区町村をnoticeにする", () => { expect(firstSeenWard({ bundle, previousSnapshot: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "2026-07-16" })).toEqual([]); expect(firstSeenWard({ bundle, previousSnapshot: previous, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })[0]).toMatchObject({ id: "d1:ward:葛飾区", severity: "notice" }); });

it("前回済み・不明・顧客数0の商圏は検出しない", () => {
  const previousWithWard = snapshotSchema.parse({ ...previous, catalog: { ...previous.catalog, wards: [{ ward: "葛飾区", customers: 1, reservations: 1 }] } });
  expect(firstSeenWard({ bundle, previousSnapshot: previousWithWard, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
  const unknownBundle = { ...bundle, reservations: [{ ...bundle.reservations[0], ward: "不明" }], customers: [{ ...bundle.customers[0], ward: "不明" }] };
  expect(firstSeenWard({ bundle: unknownBundle, previousSnapshot: previous, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
  const withoutCustomers = { ...bundle, reservations: [{ ...bundle.reservations[0], ward: "新宿区" }], customers: [] };
  expect(firstSeenWard({ bundle: withoutCustomers, previousSnapshot: previous, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});
