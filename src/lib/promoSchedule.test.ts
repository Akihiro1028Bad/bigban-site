import { describe, it, expect } from "vitest";
import { isHyroxCampaignActive } from "./promoSchedule";

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
