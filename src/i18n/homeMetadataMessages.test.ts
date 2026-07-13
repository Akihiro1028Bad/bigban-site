import { describe, expect, it } from "vitest";

import enMessages from "../../messages/en.json";
import jaMessages from "../../messages/ja.json";

describe("Japanese home metadata messages", () => {
  it("市川系クエリ向けのトップページメタデータを返す", () => {
    expect(jaMessages.Metadata.home.title).toBe(
      "市川・本八幡駅徒歩1分の屋内ピックルボールコート|THE PICKLE BANG THEORY",
    );
    expect(jaMessages.Metadata.home.description).toBe(
      "千葉県市川市・本八幡駅徒歩1分の屋内ピックルボールコート。インドアでコート3面、営業時間6:00-23:00。初心者から上級者まで楽しめる空間。",
    );
    expect(jaMessages.Metadata.home.keywords).toContain("ピックルボール 市川");
    expect(jaMessages.Metadata.home.keywords).toContain("本八幡 ピックルボール");
    expect(jaMessages.Metadata.home.keywords).not.toContain("ピックルボール 24時間");
  });
});

describe("English home metadata messages", () => {
  it("describes the indoor courts and current opening hours", () => {
    expect(enMessages.Metadata.home.title).toBe(
      "Indoor Pickleball Courts 1 Min from Motoyawata Station | THE PICKLE BANG THEORY",
    );
    expect(enMessages.Metadata.home.description).toBe(
      "Indoor pickleball courts in Ichikawa, Chiba, just a 1-minute walk from Motoyawata Station. Three indoor courts, open from 6:00 to 23:00. A space for everyone from beginners to advanced players.",
    );
  });
});
