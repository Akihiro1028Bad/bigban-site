import { describe, it, expect } from "vitest";
import { buildFaqPage } from "./faqPage";

describe("buildFaqPage", () => {
  it("FAQPage スキーマを生成する", () => {
    const schema = buildFaqPage([
      { question: "営業時間は？", answer: "6:00〜23:00" },
    ]);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("FAQPage");
  });

  it("各項目を Question / acceptedAnswer に変換する", () => {
    const schema = buildFaqPage([
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ]);
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "Q1",
      acceptedAnswer: { "@type": "Answer", text: "A1" },
    });
  });

  it("空配列でも mainEntity が空のスキーマを返す", () => {
    const schema = buildFaqPage([]);
    expect(schema.mainEntity).toEqual([]);
  });
});
