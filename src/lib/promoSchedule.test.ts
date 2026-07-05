import { describe, it, expect } from "vitest";
import { isJunePromoActive, isHyroxCampaignActive } from "./promoSchedule";

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

  it("境界より前 (JST 5/31 23:00) は非アクティブ", () => {
    // 2026-05-31T14:00:00Z = JST 2026-05-31 23:00 → まだ5月キャンペーン
    expect(isJunePromoActive(new Date("2026-05-31T14:00:00Z"))).toBe(false);
  });

  it("5月より前 (4月) は非アクティブ", () => {
    expect(isJunePromoActive(new Date("2026-04-10T00:00:00Z"))).toBe(false);
  });
});

describe("isHyroxCampaignActive", () => {
  it("JST 8/9 23:59:59 はまだアクティブ (千葉大会当日まで)", () => {
    // 2026-08-09T23:59:59 JST = 2026-08-09T14:59:59Z
    expect(isHyroxCampaignActive(new Date("2026-08-09T14:59:59Z"))).toBe(true);
  });

  it("JST 8/10 00:00:00 ちょうどで終了する", () => {
    // 2026-08-10T00:00:00 JST = 2026-08-09T15:00:00Z
    expect(isHyroxCampaignActive(new Date("2026-08-09T15:00:00Z"))).toBe(false);
  });

  it("期間中 (JST 7月) はアクティブ", () => {
    expect(isHyroxCampaignActive(new Date("2026-07-05T03:00:00Z"))).toBe(true);
  });

  it("終了後 (JST 8/15) は非アクティブ", () => {
    expect(isHyroxCampaignActive(new Date("2026-08-15T00:00:00Z"))).toBe(false);
  });
});
