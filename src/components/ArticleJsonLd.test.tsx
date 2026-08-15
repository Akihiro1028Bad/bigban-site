import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { SITE_URL } from "@/constants/site";

import { makeParsedColumnItem } from "../../__mocks__/columns-fixtures";

import { ArticleJsonLd } from "./ArticleJsonLd";

function readJsonLd(): Record<string, unknown> {
  const s = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  return JSON.parse(s?.textContent ?? "{}") as Record<string, unknown>;
}

describe("ArticleJsonLd", () => {
  it("schemaType と pathSegment を反映する", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem({ slug: "how-to", title: "T" })}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    const d = readJsonLd();
    expect(d["@type"]).toBe("Article");
    expect(d.headline).toBe("T");
    expect(d.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/columns/how-to`,
    });
  });

  it("locale=en は URL に /en を挟み inLanguage も en", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem({ slug: "how-to" })}
        locale="en"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    const d = readJsonLd();
    expect(d.inLanguage).toBe("en");
    expect(d.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/en/columns/how-to`,
    });
  });

  it("schemaType=NewsArticle も出力できる", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem()}
        locale="ja"
        schemaType="NewsArticle"
        pathSegment="news"
      />,
    );
    expect(readJsonLd()["@type"]).toBe("NewsArticle");
  });

  it("description は excerpt、日付は publishedAt / updatedAt", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem({
          excerpt: "テスト抜粋文",
          publishedAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        })}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    const d = readJsonLd();
    expect(d.description).toBe("テスト抜粋文");
    expect(d.datePublished).toBe("2026-04-01T00:00:00.000Z");
    expect(d.dateModified).toBe("2026-04-02T00:00:00.000Z");
    expect(d.publisher).toEqual({
      "@type": "Organization",
      name: "THE PICKLE BANG THEORY",
    });
  });

  it("publishedAt 無しは createdAt を datePublished に使う", () => {
    const base = makeParsedColumnItem({
      createdAt: "2026-02-02T00:00:00.000Z",
    });
    const { publishedAt: _p, ...rest } = base;
    void _p;
    render(
      <ArticleJsonLd
        item={rest}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    expect(readJsonLd().datePublished).toBe("2026-02-02T00:00:00.000Z");
  });

  it("eyecatch があれば image に出力する", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem()}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    expect(readJsonLd().image).toBe(
      "https://images.microcms-assets.io/assets/x/test.jpg?w=1200&fm=jpg",
    );
  });

  it("eyecatch 無しは image を出力しない", () => {
    const base = makeParsedColumnItem();
    const { eyecatch: _e, ...rest } = base;
    void _e;
    render(
      <ArticleJsonLd
        item={rest}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    expect(readJsonLd().image).toBeUndefined();
  });

  it("`<` をエスケープして script を閉じさせない", () => {
    render(
      <ArticleJsonLd
        item={makeParsedColumnItem({ title: "</script><img>" })}
        locale="ja"
        schemaType="Article"
        pathSegment="columns"
      />,
    );
    const raw =
      document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"]',
      )?.textContent ?? "";
    expect(raw).not.toContain("</script>");
    expect(raw).toContain("\\u003c");
    expect(readJsonLd().headline).toBe("</script><img>");
  });
});
