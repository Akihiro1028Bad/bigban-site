// @vitest-environment node
import { describe, it, expect } from "vitest";

import { computeWeeklyPeriods, jstDateString } from "./period";

describe("computeWeeklyPeriods", () => {
  it("木曜実行時、直近の確定した先週(月〜日)とその前週を返す", () => {
    // 2026-06-18 は木曜。直近の確定週は 06-08(月)〜06-14(日)
    const result = computeWeeklyPeriods(new Date("2026-06-18T07:00:00+09:00"));
    expect(result.current).toEqual({ start: "2026-06-08", end: "2026-06-14" });
    expect(result.prior).toEqual({ start: "2026-06-01", end: "2026-06-07" });
  });

  it("月曜実行時も、その週は未確定なので前の完全な週を返す", () => {
    // 2026-06-15 は月曜。current 週(06-15〜)はまだ確定していないため直前の完全週
    const result = computeWeeklyPeriods(new Date("2026-06-15T07:00:00+09:00"));
    expect(result.current).toEqual({ start: "2026-06-08", end: "2026-06-14" });
    expect(result.prior).toEqual({ start: "2026-06-01", end: "2026-06-07" });
  });

  it("日曜実行時は、その日を含む週はまだ終わっていないため前の完全週を返す", () => {
    // 2026-06-14 は日曜。週(06-08〜06-14)の最終日だが完全週は直前
    const result = computeWeeklyPeriods(new Date("2026-06-14T23:00:00+09:00"));
    expect(result.current).toEqual({ start: "2026-06-01", end: "2026-06-07" });
    expect(result.prior).toEqual({ start: "2026-05-25", end: "2026-05-31" });
  });

  it("月をまたぐ週も正しく算出する", () => {
    // 2026-03-05 は木曜。直近の確定週は 02-23(月)〜03-01(日)
    const result = computeWeeklyPeriods(new Date("2026-03-05T07:00:00+09:00"));
    expect(result.current).toEqual({ start: "2026-02-23", end: "2026-03-01" });
    expect(result.prior).toEqual({ start: "2026-02-16", end: "2026-02-22" });
  });

  it("年をまたぐ週も正しく算出する", () => {
    // 2026-01-08 は木曜。直近の確定週は 2025-12-29(月)〜2026-01-04(日)
    const result = computeWeeklyPeriods(new Date("2026-01-08T07:00:00+09:00"));
    expect(result.current).toEqual({ start: "2025-12-29", end: "2026-01-04" });
    expect(result.prior).toEqual({ start: "2025-12-22", end: "2025-12-28" });
  });
});

describe("jstDateString", () => {
  it("JST のカレンダー日付を YYYY-MM-DD で返す", () => {
    expect(jstDateString(new Date("2026-06-18T07:00:00+09:00"))).toBe(
      "2026-06-18"
    );
  });

  it("UTC では前日でも JST の日付に補正する", () => {
    // 2026-06-18T00:30+09:00 は UTC では 2026-06-17T15:30Z
    expect(jstDateString(new Date("2026-06-18T00:30:00+09:00"))).toBe(
      "2026-06-18"
    );
  });
});
