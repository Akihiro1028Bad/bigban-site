import { describe, it, expect } from "vitest";
import {
  getPromoBannerPhase,
  isJunePromoActive,
  isHyroxCampaignActive,
} from "./promoSchedule";

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

  // この関数はクラファンポップアップの「終了済み」判定にも使われている。
  // バナーの文言切替に終了境界が入っても、こちらは true のままでなければならない
  // (8月以降にクラファンポップアップが復活してしまうため)。
  it("8月以降もアクティブのまま (クラファン終了判定を兼ねるため)", () => {
    expect(isJunePromoActive(new Date("2026-08-03T03:00:00Z"))).toBe(true);
  });
});

describe("getPromoBannerPhase", () => {
  it("JST 5/31 23:59:59 は may (PBTOPEN30)", () => {
    // 2026-05-31T23:59:59 JST = 2026-05-31T14:59:59Z
    expect(getPromoBannerPhase(new Date("2026-05-31T14:59:59Z"))).toBe("may");
  });

  it("JST 6/1 00:00:00 ちょうどで june (CAMPFIRE30) へ切り替わる", () => {
    // 2026-06-01T00:00:00 JST = 2026-05-31T15:00:00Z
    expect(getPromoBannerPhase(new Date("2026-05-31T15:00:00Z"))).toBe("june");
  });

  it("JST 7/31 23:59:59 はまだ june (CAMPFIRE30 は 7/31 まで有効)", () => {
    // 2026-07-31T23:59:59 JST = 2026-07-31T14:59:59Z
    expect(getPromoBannerPhase(new Date("2026-07-31T14:59:59Z"))).toBe("june");
  });

  it("JST 8/1 00:00:00 ちょうどで pbtClub (PBT CLUB 会員) へ切り替わる", () => {
    // 2026-08-01T00:00:00 JST = 2026-07-31T15:00:00Z
    expect(getPromoBannerPhase(new Date("2026-07-31T15:00:00Z"))).toBe(
      "pbtClub",
    );
  });

  it("8月以降 (JST 8/20) は pbtClub のまま", () => {
    expect(getPromoBannerPhase(new Date("2026-08-20T03:00:00Z"))).toBe(
      "pbtClub",
    );
  });

  it("引数省略時は現在時刻で判定する", () => {
    expect(["may", "june", "pbtClub"]).toContain(getPromoBannerPhase());
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
