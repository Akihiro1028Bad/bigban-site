import { describe, it, expect } from "vitest";
import {
  LABOLA_CALENDAR_BASE,
  LABOLA_CALENDAR_TABS,
  RESERVE_URL,
  buildLabolaCalendarSrc,
  reserveHref,
  resolveCalendarTabKey,
} from "./site";

describe("labola calendar constants", () => {
  it("LABOLA_CALENDAR_TABS は pickleball / hyrox の2タブ", () => {
    expect(LABOLA_CALENDAR_TABS.map((t) => t.key)).toEqual([
      "pickleball",
      "hyrox",
    ]);
  });

  it("各タブが labola 登録名そのままの tabName を持つ", () => {
    const byKey = Object.fromEntries(
      LABOLA_CALENDAR_TABS.map((t) => [t.key, t.tabName]),
    );
    expect(byKey.pickleball).toBe("ピックルボールコート");
    // HYROX は半角スペース入りが labola 登録名
    expect(byKey.hyrox).toBe("H Y R O X");
  });

  it("buildLabolaCalendarSrc は base に tab_name をエンコードして付与する", () => {
    expect(buildLabolaCalendarSrc("ピックルボールコート")).toBe(
      `${LABOLA_CALENDAR_BASE}&tab_name=${encodeURIComponent("ピックルボールコート")}`,
    );
  });

  it("半角スペースは %20 にエンコードされる", () => {
    expect(buildLabolaCalendarSrc("H Y R O X")).toBe(
      `${LABOLA_CALENDAR_BASE}&tab_name=H%20Y%20R%20O%20X`,
    );
  });

  it("reserveHref はタブ指定つきの予約パスを返す", () => {
    expect(reserveHref("pickleball")).toBe("/reserve?tab=pickleball");
    expect(reserveHref("hyrox")).toBe("/reserve?tab=hyrox");
  });

  it("RESERVE_URL は外部予約サービス(RESERVA)のURL", () => {
    expect(RESERVE_URL).toBe("https://reserva.be/tpbt");
  });

  it("resolveCalendarTabKey は有効なキーをそのまま返す", () => {
    expect(resolveCalendarTabKey("pickleball")).toBe("pickleball");
    expect(resolveCalendarTabKey("hyrox")).toBe("hyrox");
  });

  it("resolveCalendarTabKey は不正値・未指定・配列をピックルにフォールバック", () => {
    expect(resolveCalendarTabKey("invalid")).toBe("pickleball");
    expect(resolveCalendarTabKey(undefined)).toBe("pickleball");
    expect(resolveCalendarTabKey(["hyrox"])).toBe("pickleball");
  });
});
