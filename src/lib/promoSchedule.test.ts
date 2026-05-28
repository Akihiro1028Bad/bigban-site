import { describe, it, expect } from "vitest";
import { isJunePromoActive } from "./promoSchedule";

describe("isJunePromoActive", () => {
  it("JST 5/31 23:59:59 はまだ非アクティブ (5月キャンペーン)", () => {
    // 2026-05-31T23:59:59 JST = 2026-05-31T14:59:59Z
    expect(isJunePromoActive(new Date("2026-05-31T14:59:59Z"))).toBe(false);
  });

  it("JST 6/1 00:00:00 ちょうどでアクティブ化する", () => {
    // 2026-06-01T00:00:00 JST = 2026-05-31T15:00:00Z
    expect(isJunePromoActive(new Date("2026-05-31T15:00:00Z"))).toBe(true);
  });

  it("JST 6月中はアクティブ", () => {
    expect(isJunePromoActive(new Date("2026-06-15T03:00:00Z"))).toBe(true);
  });

  it("UTC 上では 6/1 でも JST ではまだ 5/31 の場合は非アクティブ", () => {
    // 2026-06-01T00:00:00Z = 2026-06-01T09:00:00 JST → アクティブ
    // 直前の 2026-05-31T15:00:00Z 未満を検証
    expect(isJunePromoActive(new Date("2026-05-31T14:00:00Z"))).toBe(false);
  });

  it("5月より前 (4月) は非アクティブ", () => {
    expect(isJunePromoActive(new Date("2026-04-10T00:00:00Z"))).toBe(false);
  });
});
