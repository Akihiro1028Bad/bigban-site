// @vitest-environment node
import { describe, expect, it } from "vitest";

import { columnCategoryIdForArticleType } from "@/lib/growth/columnCategory";

// 実装本体のロジックは scripts/growth/columnCategory.test.ts で網羅する。
// ここは `@/lib/growth/columnCategory` の再エクスポートが解決することだけ確認する。
describe("@/lib/growth/columnCategory 再エクスポート", () => {
  it("scripts 側の実装を束ねて公開している", () => {
    expect(columnCategoryIdForArticleType("獲得")).toBe("start");
    expect(columnCategoryIdForArticleType(undefined)).toBeUndefined();
  });
});
