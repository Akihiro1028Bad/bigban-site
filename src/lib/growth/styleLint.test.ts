import { describe, expect, it } from "vitest";

import { styleLint, styleLintSummary, termHints } from "./styleLint";

describe("styleLint", () => {
  it("誇大・煽り・医療断定の語を検出する", () => {
    const hits = styleLint("業界No.1の設備。今だけ急げ。これで痩せる。");
    const cats = hits.map((h) => h.category);
    expect(cats).toContain("誇大");
    expect(cats).toContain("煽り");
    expect(cats).toContain("医療断定");
  });

  it("AI定型のぼかし表現を検出する", () => {
    const hits = styleLint("人気と言われています。いかがでしょうか。");
    expect(hits.filter((h) => h.category === "AI定型").map((h) => h.term)).toEqual([
      "と言われています",
      "いかがでしょうか",
    ]);
  });

  it("メタ言及を検出する", () => {
    expect(styleLint("この記事では基礎を紹介します。").map((h) => h.category)).toEqual([
      "メタ言及",
      "メタ言及",
    ]);
  });

  it("英単語＋括弧書き直訳を検出する", () => {
    const hits = styleLint("belonging（帰属の感覚）が大切だ。");
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe("括弧直訳");
    expect(hits[0].term).toContain("belonging");
  });

  it("同じ語の複数出現を全て位置付きで返し、位置順に並ぶ", () => {
    const hits = styleLint("絶対。途中。絶対。");
    expect(hits).toHaveLength(2);
    expect(hits[0].index).toBeLessThan(hits[1].index);
    expect(hits[0].term).toBe("絶対");
  });

  it("確認表現は2回目以降だけを過剰反復として検出する", () => {
    const hits = styleLint(
      "料金は公式サイトで確認してください。日程もご確認ください。開催条件も確認してください。",
    ).filter((hit) => hit.category === "確認反復");

    expect(hits.map((hit) => hit.term)).toEqual(["ご確認ください", "確認してください"]);
  });

  it("必須のAI免責文は確認表現の回数に含めない", () => {
    const hits = styleLint(
      "料金は公式サイトで確認してください。※この記事はAIが作成した下書きです。公開前に内容をご確認ください。",
    ).filter((hit) => hit.category === "確認反復");

    expect(hits).toEqual([]);
  });

  it("該当なしは空配列", () => {
    expect(styleLint("市川の屋内コートで、平日夜に1時間打てる。")).toEqual([]);
  });
});

describe("termHints", () => {
  it("用語のゆれ・誤用を置換候補つきで位置順に返す", () => {
    const hits = termHints("ラケットで打つ。pickleball を楽しむ。");
    expect(hits.map((h) => h.term)).toEqual(["ラケット", "pickleball"]);
    expect(hits[0].suggestion).toContain("パドル");
    expect(hits[0].index).toBeLessThan(hits[1].index);
  });
  it("該当なしは空", () => {
    expect(termHints("パドルでピックルボールを打つ。")).toEqual([]);
  });
});

describe("styleLintSummary", () => {
  it("カテゴリ別件数を定義順で返し、0件は除外する", () => {
    const hits = styleLint("絶対。絶対。今だけ。");
    expect(styleLintSummary(hits)).toEqual([
      { category: "誇大", count: 2 },
      { category: "煽り", count: 1 },
    ]);
  });

  it("空入力は空サマリ", () => {
    expect(styleLintSummary([])).toEqual([]);
  });
});
