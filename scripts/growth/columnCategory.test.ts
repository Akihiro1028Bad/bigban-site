// @vitest-environment node
import { describe, expect, it } from "vitest";

import { columnCategoryIdForArticleType } from "./columnCategory";

describe("columnCategoryIdForArticleType", () => {
  it("獲得 → start(来店直結の入口記事)", () => {
    expect(columnCategoryIdForArticleType("獲得")).toBe("start");
  });

  it("不安解消 → start(獲得と同じ導線カテゴリへ多対一)", () => {
    expect(columnCategoryIdForArticleType("不安解消")).toBe("start");
  });

  it("資産 → rules(既定。上達/健康は編集で振替)", () => {
    expect(columnCategoryIdForArticleType("資産")).toBe("rules");
  });

  it("比較 → compare", () => {
    expect(columnCategoryIdForArticleType("比較")).toBe("compare");
  });

  it("イベント → event", () => {
    expect(columnCategoryIdForArticleType("イベント")).toBe("event");
  });

  it("内部ID を渡しても同じ ID を返す(冪等)", () => {
    expect(columnCategoryIdForArticleType("acquire")).toBe("start");
    expect(columnCategoryIdForArticleType("relief")).toBe("start");
    expect(columnCategoryIdForArticleType("asset")).toBe("rules");
  });

  it("未知/欠落は undefined(category を省略 = 人が後付け)", () => {
    expect(columnCategoryIdForArticleType("不明")).toBeUndefined();
    expect(columnCategoryIdForArticleType(undefined)).toBeUndefined();
    expect(columnCategoryIdForArticleType("")).toBeUndefined();
  });

  it("前後の空白を無視する", () => {
    expect(columnCategoryIdForArticleType("  獲得  ")).toBe("start");
  });

  it("空白のみ(trim で空になる)は undefined", () => {
    expect(columnCategoryIdForArticleType("   ")).toBeUndefined();
  });
});
