import { describe, it, expect } from "vitest";

import {
  columnCategorySchema,
  columnItemSchema,
  columnListSchema,
} from "./columnsSchema";

const baseCategory = {
  id: "start",
  name: "はじめ方・体験",
  nameEn: "Getting Started",
  color: "#C8FF00",
  order: 1,
};

const baseItem = {
  id: "abc123",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  publishedAt: "2026-04-01T00:00:00.000Z",
  revisedAt: "2026-04-01T00:00:00.000Z",
  title: "屋内ピックルボールの始め方",
  slug: "how-to-start",
  locale: ["ja"],
  articleType: ["獲得"],
  category: baseCategory,
  excerpt: "はじめての方向けの体験ガイド",
  displayMode: ["html"],
  bodyHtml: "<p>本文</p>",
  body: "",
  eyecatch: {
    url: "https://images.microcms-assets.io/assets/x/test.jpg",
    width: 1200,
    height: 630,
  },
};

describe("columnCategorySchema", () => {
  it("全フィールド揃った参照を検証する", () => {
    const r = columnCategorySchema.parse(baseCategory);
    expect(r).toEqual({
      id: "start",
      name: "はじめ方・体験",
      nameEn: "Getting Started",
      color: "#C8FF00",
      order: 1,
    });
  });

  it("nameEn/color/order 未設定(null)でも通る(欠落耐性)", () => {
    const r = columnCategorySchema.parse({
      id: "rules",
      name: "ルール・基礎知識",
      nameEn: null,
      color: null,
      order: null,
    });
    expect(r.name).toBe("ルール・基礎知識");
    expect(r.nameEn).toBeUndefined();
    expect(r.color).toBeUndefined();
    expect(r.order).toBeUndefined();
  });

  it("nameEn/color/order 欠落(プロパティ自体なし)でも通る", () => {
    const r = columnCategorySchema.parse({ id: "event", name: "イベント" });
    expect(r.id).toBe("event");
    expect(r.nameEn).toBeUndefined();
  });
});

describe("columnItemSchema", () => {
  it("locale/displayMode の配列形式を string に正規化する", () => {
    const r = columnItemSchema.parse(baseItem);
    expect(r.locale).toBe("ja");
    expect(r.displayMode).toBe("html");
  });

  it("locale/displayMode の単一文字列形式も受理する", () => {
    const r = columnItemSchema.parse({
      ...baseItem,
      locale: "en",
      displayMode: "rich",
    });
    expect(r.locale).toBe("en");
    expect(r.displayMode).toBe("rich");
  });

  it("articleType 日本語ラベルを内部ID へ変換する", () => {
    const r = columnItemSchema.parse({ ...baseItem, articleType: ["不安解消"] });
    expect(r.articleType).toBe("relief");
  });

  it("articleType の単一文字列形式も受理する", () => {
    const r = columnItemSchema.parse({ ...baseItem, articleType: "比較" });
    expect(r.articleType).toBe("compare");
  });

  it("articleType 未設定(null)でも通る(内部計測は任意)", () => {
    const r = columnItemSchema.parse({ ...baseItem, articleType: null });
    expect(r.articleType).toBeUndefined();
  });

  it("articleType 空配列でも通る(microCMS の未選択)", () => {
    const r = columnItemSchema.parse({ ...baseItem, articleType: [] });
    expect(r.articleType).toBeUndefined();
  });

  it("articleType 内部ID(英語)直接入力も受理する(後方互換)", () => {
    const r = columnItemSchema.parse({ ...baseItem, articleType: ["asset"] });
    expect(r.articleType).toBe("asset");
  });

  it("articleType 未知ラベルは拒否する", () => {
    expect(() =>
      columnItemSchema.parse({ ...baseItem, articleType: ["不明"] }),
    ).toThrow();
  });

  it("bodyHtml/body 未設定(null)は空文字に正規化する", () => {
    const r = columnItemSchema.parse({
      ...baseItem,
      bodyHtml: null,
      body: null,
    });
    expect(r.bodyHtml).toBe("");
    expect(r.body).toBe("");
  });

  it("category 未設定(参照先が下書き/削除で null)でも通る(nullish 耐性)", () => {
    const r = columnItemSchema.parse({ ...baseItem, category: null });
    expect(r.category).toBeUndefined();
  });

  it("category 参照を depth1 展開後の形で検証する", () => {
    const r = columnItemSchema.parse(baseItem);
    expect(r.category?.id).toBe("start");
    expect(r.category?.color).toBe("#C8FF00");
  });

  it("externalLink フィールドは持たない(告知用は削除)", () => {
    const r = columnItemSchema.parse(baseItem);
    expect(r).not.toHaveProperty("externalLink");
  });

  it("不正 slug は拒否する", () => {
    expect(() =>
      columnItemSchema.parse({ ...baseItem, slug: "Bad Slug" }),
    ).toThrow();
  });
});

describe("columnListSchema", () => {
  it("contents/totalCount/offset/limit を検証する", () => {
    const r = columnListSchema.parse({
      contents: [baseItem],
      totalCount: 1,
      offset: 0,
      limit: 12,
    });
    expect(r.contents).toHaveLength(1);
    expect(r.totalCount).toBe(1);
  });
});
