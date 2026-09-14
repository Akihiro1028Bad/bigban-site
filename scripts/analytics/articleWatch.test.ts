// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addDays, buildArticleWindows, computeWindows, daysBetween, THRESHOLDS } from "./articleWatch.mjs";

describe("日付ユーティリティ", () => {
  it("日数を加減し、月またぎも扱う", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-09-14", 7)).toBe("2026-09-21");
    expect(daysBetween("2026-08-31", "2026-09-14")).toBe(14);
  });
});

describe("日付窓", () => {
  it("昨日・前週同曜日・直近7日・前7日・取得窓を JST の今日から作る", () => {
    const w = computeWindows("2026-09-14");
    expect(w.yesterday).toEqual({ startDate: "2026-09-13", endDate: "2026-09-13" });
    expect(w.sameWeekdayLastWeek).toEqual({ startDate: "2026-09-06", endDate: "2026-09-06" });
    expect(w.last7).toEqual({ startDate: "2026-09-07", endDate: "2026-09-13" });
    expect(w.prev7).toEqual({ startDate: "2026-08-31", endDate: "2026-09-06" });
    expect(w.fetch).toEqual({ startDate: "2026-08-31", endDate: "2026-09-13" });
  });
});

describe("GA4 行の記事別集計", () => {
  const windows = computeWindows("2026-09-14");
  it("記事パスだけを4窓に振り分け、クエリ文字列と /ja/ を正規化して合算する", () => {
    const rows = [
      { landingPage: "/columns/a?draftKey=x", date: "20260913", sessions: 3 },
      { landingPage: "/ja/columns/a", date: "20260913", sessions: 2 },
      { landingPage: "/columns/a", date: "20260906", sessions: 4 },
      { landingPage: "/columns/a", date: "20260901", sessions: 1 },
      { landingPage: "/en/news/b/", date: "20260910", sessions: 7 },
      { landingPage: "/reserve", date: "20260913", sessions: 100 },
      { landingPage: "/columns", date: "20260913", sessions: 50 },
    ];
    const map = buildArticleWindows(rows, windows);
    expect(map.get("/columns/a")).toEqual({ yesterday: 5, sameWeekdayLastWeek: 4, last7: 5, prev7: 5 });
    expect(map.get("/en/news/b")).toEqual({ yesterday: 0, sameWeekdayLastWeek: 0, last7: 7, prev7: 0 });
    expect(map.has("/reserve")).toBe(false);
    expect(map.has("/columns")).toBe(false);
  });
  it("窓の外の日付は無視する", () => {
    const map = buildArticleWindows([{ landingPage: "/columns/a", date: "20260830", sessions: 9 }], windows);
    expect(map.get("/columns/a")).toEqual({ yesterday: 0, sameWeekdayLastWeek: 0, last7: 0, prev7: 0 });
  });
  it("閾値は設計書の値を持つ", () => {
    expect(THRESHOLDS).toEqual({ g1MinPrev7: 30, g1Percent: 40, g2MinPrev: 20, g2Percent: 60, g3MinPrev7: 30, newArticleDays: 14, h2StaleDays: 14, maxArticles: 50 });
  });
});
