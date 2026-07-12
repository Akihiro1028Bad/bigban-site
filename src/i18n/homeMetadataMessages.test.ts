import { describe, expect, it } from "vitest";

import jaMessages from "../../messages/ja.json";

describe("Japanese home metadata messages", () => {
  it("市川系クエリ向けのトップページメタデータを返す", () => {
    expect(jaMessages.Metadata.home.title).toBe(
      "市川・本八幡駅徒歩1分の屋内ピックルボール専門店|THE PICKLE BANG THEORY",
    );
    expect(jaMessages.Metadata.home.description).toBe(
      "千葉県市川市・本八幡駅徒歩1分の屋内専用ピックルボール施設。全天候型でコート3面、営業時間6:00-23:00。初心者から上級者まで楽しめる空間。",
    );
    expect(jaMessages.Metadata.home.keywords).toContain("ピックルボール 市川");
    expect(jaMessages.Metadata.home.keywords).toContain("本八幡 ピックルボール");
    expect(jaMessages.Metadata.home.keywords).not.toContain("ピックルボール 24時間");
  });
});
