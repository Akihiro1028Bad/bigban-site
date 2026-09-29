// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CLASS_KEYS, CLASS_WEEKDAY_LABEL, classOfDate, otherClass } from "./classes";

describe("classOfDate", () => {
  it("火曜は初中級、木曜は中級以上", () => {
    expect(classOfDate("2026-10-06")).toBe("初中級");
    expect(classOfDate("2026-10-01")).toBe("中級以上");
  });

  it("それ以外の曜日はその他", () => {
    expect(classOfDate("2026-06-24")).toBe("その他");
    expect(classOfDate("2026-06-28")).toBe("その他");
    expect(classOfDate("2026-06-29")).toBe("その他");
  });
});

describe("otherClass", () => {
  it("もう一方のクラスを返し、往復すると元に戻る", () => {
    expect(otherClass("初中級")).toBe("中級以上");
    expect(otherClass("中級以上")).toBe("初中級");
    expect(otherClass(otherClass("初中級"))).toBe("初中級");
  });
});

describe("クラス定数", () => {
  it("曜日ラベルとクラスの並び", () => {
    expect(CLASS_WEEKDAY_LABEL).toEqual({ 初中級: "火", 中級以上: "木" });
    expect(CLASS_KEYS).toEqual(["初中級", "中級以上"]);
  });
});
