// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BODY_IMAGE_MAX,
  bodyImagePlaceholder,
  buildBodyImageAlt,
  buildBodyImageCaption,
  buildBodyImagePrompt,
  buildBodyImageSpec,
  placeholderIndices,
} from "./body-image";

describe("buildBodyImagePrompt", () => {
  it("mascot は参照キャラと宇宙シーンを含み、説明を埋める", () => {
    const p = buildBodyImagePrompt("mascot", " 宇宙人がサーブする ");
    expect(p).toContain("宇宙人がサーブする");
    expect(p).toMatch(/alien/i);
    expect(p).toContain("#F6FF54");
    expect(p).toMatch(/No text/i);
  });

  it("minimal はミニマル・文字なしで説明を埋める", () => {
    const p = buildBodyImagePrompt("minimal", "パドルの握り方");
    expect(p).toContain("パドルの握り方");
    expect(p).toMatch(/[Mm]inimal/);
    expect(p).toMatch(/No text/i);
  });

  it("diagram は概念図・文字最小で説明を埋める", () => {
    const p = buildBodyImagePrompt("diagram", "キッチンの位置関係");
    expect(p).toContain("キッチンの位置関係");
    expect(p).toMatch(/diagram/i);
    expect(p).toMatch(/avoid garbled text/i);
  });
});

describe("buildBodyImageAlt / buildBodyImageCaption", () => {
  it("diagram は alt・caption に「イメージ図」を明示する", () => {
    expect(buildBodyImageAlt("diagram", " コート図 ")).toBe("イメージ図: コート図");
    expect(buildBodyImageCaption("diagram", "コート図")).toBe("コート図（イメージ図）");
  });

  it("mascot / minimal は説明をそのまま使う", () => {
    expect(buildBodyImageAlt("mascot", "宇宙人")).toBe("宇宙人");
    expect(buildBodyImageCaption("minimal", "握り方")).toBe("握り方");
  });
});

describe("buildBodyImageSpec", () => {
  it("index・スタイル・正規化した説明・prompt/alt/caption を揃える", () => {
    const spec = buildBodyImageSpec(2, "diagram", "  ゾーン図  ");
    expect(spec).toEqual({
      index: 2,
      style: "diagram",
      description: "ゾーン図",
      prompt: buildBodyImagePrompt("diagram", "ゾーン図"),
      alt: "イメージ図: ゾーン図",
      caption: "ゾーン図（イメージ図）",
    });
  });

  it("説明の改行・連続空白を1行に正規化する(プロンプト混入の防御)", () => {
    const spec = buildBodyImageSpec(1, "mascot", "宇宙人が\n\n  サーブ");
    expect(spec.description).toBe("宇宙人が サーブ");
  });

  it("index が1未満は例外(無音の不正プレースホルダを防ぐ)", () => {
    expect(() => buildBodyImageSpec(0, "mascot", "x")).toThrow(/1 以上/);
  });
});

describe("プレースホルダ", () => {
  it("bodyImagePlaceholder は {{IMG:n}} を返す", () => {
    expect(bodyImagePlaceholder(1)).toBe("{{IMG:1}}");
  });

  it("placeholderIndices は本文中の index を出現順に返す", () => {
    expect(placeholderIndices("a {{IMG:1}} b {{IMG:3}} c")).toEqual([1, 3]);
  });

  it("プレースホルダが無ければ空配列", () => {
    expect(placeholderIndices("画像なしの本文")).toEqual([]);
  });
});

describe("BODY_IMAGE_MAX", () => {
  it("上限は3枚(#61 と整合)", () => {
    expect(BODY_IMAGE_MAX).toBe(3);
  });
});
