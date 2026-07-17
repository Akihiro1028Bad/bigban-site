import { expect, it } from "vitest";
import { newRemarks } from "./newRemarks";

it("備考本文をbodyに含めず現在週のものだけ通知する", () => {
  const bundle = { reservations: [{ reservationId: "1", bookedAt: "2026-07-14T10:00:00+09:00" }], remarks: [{ reservationId: "1", useDate: "2026-07-15", category: "x", remarks: "個人情報を含む本文" }], customers: [], salesDaily: [], meta: { schemaVersion: 1 as const, generatedAt: "", sourceSyncedAt: "", coverage: { start: "", end: "" }, counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  const output = newRemarks({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" });
  expect(output[0]).toMatchObject({ id: "d12:remark:1", severity: "info" });
  expect(output[0].body).not.toContain("個人情報");
});

it("予約が見つからない備考と週外の備考を除外する", () => {
  const bundle = { reservations: [{ reservationId: "old", bookedAt: "2026-07-01T10:00:00+09:00" }], remarks: [{ reservationId: "missing", useDate: "", category: "", remarks: "x" }, { reservationId: "old", useDate: "", category: "", remarks: "x" }], customers: [], salesDaily: [], meta: { schemaVersion: 1 as const, generatedAt: "", sourceSyncedAt: "", coverage: { start: "", end: "" }, counts: {}, excludedCount: 0, missingSections: [], warnings: [] } };
  expect(newRemarks({ bundle: bundle as never, previousSnapshot: null, baselineInputs: null, current: { start: "2026-07-13", end: "2026-07-19" }, prior: { start: "", end: "" }, todayYmd: "" })).toEqual([]);
});
