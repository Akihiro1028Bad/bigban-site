import { describe, it, expect } from "vitest";
import {
  LABOLA_CALENDAR_BASE,
  LABOLA_CALENDAR_TABS,
  LABOLA_HYROX_URL,
  LABOLA_PICKLEBALL_URL,
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

  it("予約導線の labola URL は日付を含まず常に現在の週を初期表示する", () => {
    // 週を固定すると時間経過で過去の週が初期表示になるため、日付セグメントを持たせない。
    expect(LABOLA_PICKLEBALL_URL).toBe(
      `https://yoyaku.labola.jp/r/shop/3473/calendar_week/?&tab_name=${encodeURIComponent("ピックルボールコート")}`,
    );
    expect(LABOLA_HYROX_URL).toBe(
      "https://yoyaku.labola.jp/r/shop/3473/calendar_week/?&tab_name=H%20Y%20R%20O%20X",
    );
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
