import { describe, it, expect } from "vitest";
import { newsItemSchema, newsListSchema } from "./schema";

const validItem = {
  id: "abc123",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  publishedAt: "2026-04-01T00:00:00.000Z",
  revisedAt: "2026-04-01T00:00:00.000Z",
  title: "タイトル",
  slug: "grand-opening-2026",
  locale: ["ja"],
  category: ["notice"],
  excerpt: "抜粋文",
  displayMode: ["html"],
  bodyHtml: "<p>本文HTML</p>",
  body: "<p>本文リッチ</p>",
  eyecatch: {
    url: "https://images.microcms-assets.io/assets/xxx/test.jpg",
    width: 1200,
    height: 630,
  },
  externalLink: { label: "詳細を見る", url: "https://example.com" },
};

describe("newsItemSchema", () => {
  it("完全なレコードをパース", () => {
    const p = newsItemSchema.parse(validItem);
    expect(p.title).toBe("タイトル");
    expect(p.locale).toBe("ja");
    expect(p.displayMode).toBe("html");
    expect(p.category).toEqual(["notice"]);
  });

  it("eyecatch/externalLink/bodyHtml/body なしでもOK (excerpt と displayMode は必須)", () => {
    const {
      eyecatch: _e,
      externalLink: _el,
      bodyHtml: _bh,
      body: _b,
      ...minimal
    } = validItem;
    void _e;
    void _el;
    void _bh;
    void _b;
    const p = newsItemSchema.parse(minimal);
    expect(p.eyecatch).toBeUndefined();
    expect(p.externalLink).toBeUndefined();
    expect(p.bodyHtml).toBe("");
    expect(p.body).toBe("");
  });

  it("locale 想定外はエラー", () => {
    expect(() => newsItemSchema.parse({ ...validItem, locale: ["fr"] })).toThrow();
  });

  it("locale 単一string形式 (microCMS 単一選択) も受理", () => {
    const p = newsItemSchema.parse({ ...validItem, locale: "ja" });
    expect(p.locale).toBe("ja");
  });

  it("displayMode 単一string形式 (microCMS 単一選択) も受理", () => {
    const p = newsItemSchema.parse({ ...validItem, displayMode: "rich" });
    expect(p.displayMode).toBe("rich");
  });

  it("locale 単一string で想定外値はエラー", () => {
    expect(() =>
      newsItemSchema.parse({ ...validItem, locale: "fr" }),
    ).toThrow();
  });

  it("category 想定外はエラー", () => {
    expect(() =>
      newsItemSchema.parse({ ...validItem, category: ["invalid"] }),
    ).toThrow();
  });

  it("category 日本語ラベルは内部IDに変換される", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      category: ["お知らせ", "イベント情報"],
    });
    expect(p.category).toEqual(["notice", "event"]);
  });

  it("category 英語IDも引き続き受理 (後方互換)", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      category: ["media", "campaign"],
    });
    expect(p.category).toEqual(["media", "campaign"]);
  });

  it("category 英語/日本語 混在もOK", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      category: ["お知らせ", "media"],
    });
    expect(p.category).toEqual(["notice", "media"]);
  });

  it("displayMode 想定外はエラー", () => {
    expect(() =>
      newsItemSchema.parse({ ...validItem, displayMode: ["pdf"] }),
    ).toThrow();
  });

  it("displayMode 欠落はエラー", () => {
    const { displayMode: _d, ...missing } = validItem;
    void _d;
    expect(() => newsItemSchema.parse(missing)).toThrow();
  });

  it("excerpt 欠落はエラー", () => {
    const { excerpt: _e, ...missing } = validItem;
    void _e;
    expect(() => newsItemSchema.parse(missing)).toThrow();
  });

  it("excerpt 長文も受理 (文字数制限なし)", () => {
    const longExcerpt = "あ".repeat(500);
    const p = newsItemSchema.parse({ ...validItem, excerpt: longExcerpt });
    expect(p.excerpt.length).toBe(500);
  });

it("必須欠落 (title) でエラー", () => {
    const { title: _t, ...missing } = validItem;
    void _t;
    expect(() => newsItemSchema.parse(missing)).toThrow();
  });

  it("externalLink.url 非URLはエラー", () => {
    expect(() =>
      newsItemSchema.parse({
        ...validItem,
        externalLink: { label: "x", url: "not-url" },
      }),
    ).toThrow();
  });

  it("externalLink.url が http:// (非 https) はエラー", () => {
    expect(() =>
      newsItemSchema.parse({
        ...validItem,
        externalLink: { label: "x", url: "http://example.com" },
      }),
    ).toThrow();
  });

  it("slug 形式違反 (大文字) はエラー", () => {
    expect(() =>
      newsItemSchema.parse({ ...validItem, slug: "Invalid-Slug" }),
    ).toThrow();
  });

  // microCMS は未入力フィールドを null で返す (省略ではなく)。
  // optional() は undefined のみ許容するため、null も受理できるよう nullish() に。
  it("body / bodyHtml が null でも受理 (microCMS 未入力時の表現)", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      body: null,
      bodyHtml: null,
    });
    expect(p.body).toBe("");
    expect(p.bodyHtml).toBe("");
  });

  it("eyecatch / externalLink が null でも受理", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      eyecatch: null,
      externalLink: null,
    });
    expect(p.eyecatch).toBeUndefined();
    expect(p.externalLink).toBeUndefined();
  });

  it("publishedAt / revisedAt が null でも受理 (DRAFT のみ状態)", () => {
    const p = newsItemSchema.parse({
      ...validItem,
      publishedAt: null,
      revisedAt: null,
    });
    expect(p.publishedAt).toBeUndefined();
    expect(p.revisedAt).toBeUndefined();
  });
});

describe("newsListSchema", () => {
  it("contents配列をパース", () => {
    const p = newsListSchema.parse({
      contents: [validItem],
      totalCount: 1,
      offset: 0,
      limit: 12,
    });
    expect(p.contents).toHaveLength(1);
  });

  it("空でもOK", () => {
    const p = newsListSchema.parse({
      contents: [],
      totalCount: 0,
      offset: 0,
      limit: 12,
    });
    expect(p.contents).toEqual([]);
  });
});

describe("newsItemSchema eventEndAt", () => {
  it("eventEndAt を文字列として受け取る", () => {
    const parsed = newsItemSchema.parse({
      ...validItem,
      eventEndAt: "2026-09-23T14:59:00.000Z",
    });
    expect(parsed.eventEndAt).toBe("2026-09-23T14:59:00.000Z");
  });

  it("eventEndAt が無いとき undefined になる(後方互換)", () => {
    const parsed = newsItemSchema.parse(validItem);
    expect(parsed.eventEndAt).toBeUndefined();
  });

  it("eventEndAt が null のとき undefined に正規化される", () => {
    const parsed = newsItemSchema.parse({ ...validItem, eventEndAt: null });
    expect(parsed.eventEndAt).toBeUndefined();
  });
});
