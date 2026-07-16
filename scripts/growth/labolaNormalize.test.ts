import { describe, expect, it } from "vitest";
import { buildCanonical, parseJsonl, serializeJsonl } from "./labolaNormalize";
import type { YoyakuRow } from "./labolaSchemas";

const yoyaku = (over: Partial<YoyakuRow>): YoyakuRow => ({ reservationId: "90", bookedAt: "2026-07-15T14:19:00+09:00", useDate: "2026-08-13", start: "19:00", end: "21:00", category: "スペース予約", space: "A:テストコート", status: "confirmed", acceptStatus: "受付済", paymentStatus: "入金待ち", paymentMethod: "クレジットカード", plan: "一般価格", amount: 15960, partySize: null, channel: "user_sp", customerType: "一般会員", memberNo: "00901", name: "試験対象", email: "taro@example.com", postal: "1000001", address: "東京都千代田区1-1-1", gender: "男性", birthDate: "1990/01/02", occupation: "会社員", remarks: "", ...over });
const base = { customers: null, salesSummary: null, rules: { emails: ["owner@example.com"], nameContains: ["削除対象"] }, hashKey: "k", coverageStart: "2026-06-01", generatedAt: "2026-07-16T14:20:00+09:00", parseWarnings: ["w1"] };

describe("buildCanonical", () => {
  it("PIIを落とし粗視化フィールドへ置き換える", () => { const record = buildCanonical({ ...base, yoyaku: [yoyaku({})] }).reservations[0]; expect(record.ward).toBe("千代田区"); expect(record.ageBand).toBe("30代"); expect(record.pseudoId).toMatch(/^[0-9a-f]{16}$/); expect(record).not.toHaveProperty("name"); expect(record).not.toHaveProperty("email"); expect(record).not.toHaveProperty("address"); expect(record).not.toHaveProperty("birthDate"); });
  it("除外規則に該当する予約を落とし件数を記録する", () => { const bundle = buildCanonical({ ...base, yoyaku: [yoyaku({}), yoyaku({ reservationId: "91", email: "owner@example.com" })] }); expect(bundle.reservations).toHaveLength(1); expect(bundle.meta.excludedCount).toBe(1); });
  it("備考はremarksにのみ残しhasRemarksフラグ化する", () => { const bundle = buildCanonical({ ...base, yoyaku: [yoyaku({ remarks: "16名でイベント希望" })] }); expect(bundle.reservations[0].hasRemarks).toBe(true); expect(JSON.stringify(bundle.reservations)).not.toContain("16名"); expect(bundle.remarks[0]).toMatchObject({ reservationId: "90", remarks: "16名でイベント希望" }); });
  it("任意CSV欠落をmissingSectionsへ、coverage.endは生成日JST", () => { const bundle = buildCanonical({ ...base, yoyaku: [yoyaku({})] }); expect(bundle.meta.missingSections).toEqual(["customer", "salesSummary"]); expect(bundle.meta.coverage).toEqual({ start: "2026-06-01", end: "2026-07-16" }); expect(bundle.meta.warnings).toContain("w1"); });
  it("予約IDの重複はエラー", () => expect(() => buildCanonical({ ...base, yoyaku: [yoyaku({}), yoyaku({})] })).toThrow("重複"));
  it("顧客にも除外とPII境界を適用する", () => { const bundle = buildCanonical({ ...base, yoyaku: [], customers: [{ registeredAt: "2026-07-01", customerType: "一般", memberNo: "1", name: "削除対象", email: "", postal: "", address: "東京都台東区1", gender: "", birthDate: "", occupation: "" }] }); expect(bundle.customers).toEqual([]); expect(bundle.meta.excludedCount).toBe(1); });
  it("除外されない顧客を正準化し、受付日が範囲外なら警告する", () => {
    const bundle = buildCanonical({ ...base, coverageStart: "2026-07-01", yoyaku: [yoyaku({ bookedAt: "2026-06-30T10:00:00+09:00" })], customers: [{ registeredAt: "2026-07-01", customerType: "一般", memberNo: "2", name: "架空顧客", email: "customer@example.com", postal: "", address: "東京都台東区1", gender: "", birthDate: "1990/01/01", occupation: "会社員" }] });
    expect(bundle.customers[0]).toMatchObject({ ward: "台東区", ageBand: "30代" });
    expect(bundle.meta.warnings).toContain("予約受付日時が収録範囲外です");
  });
  it("売上サマリが空配列でも欠落扱いにしない", () => {
    const bundle = buildCanonical({ ...base, yoyaku: [], salesSummary: [] });
    expect(bundle.meta.missingSections).toEqual(["customer"]);
    expect(bundle.salesDaily).toEqual([]);
  });
  it("生成日時と収録範囲は共有日付スキーマで検証する", () => {
    expect(() => buildCanonical({ ...base, yoyaku: [], coverageStart: "2026-02-30" })).toThrow("収録範囲");
    expect(() => buildCanonical({ ...base, yoyaku: [], generatedAt: "日時" })).toThrow("生成日時");
  });
  it("生成日が収録開始日より前なら収録範囲を拒否する", () => {
    expect(() => buildCanonical({ ...base, yoyaku: [], coverageStart: "2026-07-17" })).toThrow("収録範囲が不正");
  });
});
describe("JSONL往復", () => {
  it("serialize→parseで同一になる", () => { const records = [{ a: 1 }, { a: 2 }]; expect(parseJsonl(serializeJsonl(records), (value) => value as { a: number })).toEqual(records); });
  it("空配列は空文字列にし、不正な行は行番号付きでエラーにする", () => {
    expect(serializeJsonl([])).toBe("");
    expect(() => parseJsonl("{bad}\n", (value) => value)).toThrow("JSONLの1行目");
  });
});
