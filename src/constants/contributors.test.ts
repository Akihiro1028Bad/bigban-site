import { describe, expect, it } from "vitest";

import { CONTRIBUTORS, byTier } from "./contributors";

describe("CONTRIBUTORS", () => {
  it("id が重複しない", () => {
    const ids = CONTRIBUTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("掲載名が空の支援者を持たない", () => {
    for (const c of CONTRIBUTORS) {
      expect(c.name.trim()).not.toBe("");
    }
  });

  it("リンクは全て https で始まる", () => {
    for (const c of CONTRIBUTORS) {
      if (c.url) expect(c.url.startsWith("https://")).toBe(true);
    }
  });

  it("ロゴを持つ支援者は 3 件(焼肉やまと・谷根千ラボ東京・ピックルボールワン)", () => {
    const withLogo = CONTRIBUTORS.filter((c) => c.logo);
    expect(withLogo.map((c) => c.id)).toEqual([
      "yamato",
      "yanesen-lab",
      "pickleball-one",
    ]);
  });

  it("ロゴの縦横比は正の数", () => {
    for (const c of CONTRIBUTORS) {
      if (c.logo) expect(c.logo.aspect).toBeGreaterThan(0);
    }
  });
});

describe("byTier", () => {
  it("指定ランクだけを定義順のまま返す", () => {
    const large = byTier("large");
    expect(large.length).toBeGreaterThan(0);
    for (const c of large) expect(c.tier).toBe("large");
    expect(large[0].id).toBe("yamato");
  });

  it("3 ランクの合計が全件と一致する", () => {
    const total =
      byTier("large").length + byTier("medium").length + byTier("small").length;
    expect(total).toBe(CONTRIBUTORS.length);
  });
});
