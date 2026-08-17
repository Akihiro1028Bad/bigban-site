import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SITE_URL } from "@/constants/site";

import { makeParsedColumnItem } from "../../../../../__mocks__/columns-fixtures";

const getColumnDetailMock = vi.fn();
const getColumnByContentIdMock = vi.fn();
const getColumnSlugsMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const isCmsColumnsEnabledMock = vi.fn(() => true);
const newsBodyRendererMock = vi.fn();

function applyRootTitleTemplate(title: unknown): string {
  if (typeof title !== "string") {
    throw new Error("Page metadata title must be a string");
  }
  return `${title} | THE PICKLE BANG THEORY`;
}

vi.mock("@/lib/microcms/columnsQueries", () => ({
  getColumnDetail: (a: unknown) => getColumnDetailMock(a),
  getColumnByContentId: (a: unknown) => getColumnByContentIdMock(a),
  getColumnSlugs: () => getColumnSlugsMock(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) =>
    k === "og.siteName" ? "THE PICKLE BANG THEORY" : k,
}));
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: isCmsColumnsEnabledMock,
}));
vi.mock("@/components/home/HomeNavigation", () => ({ default: () => null }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => null }));
vi.mock("@/components/news/NewsBodyRenderer", () => ({
  NewsBodyRenderer: (props: unknown) => {
    newsBodyRendererMock(props);
    return <div data-testid="body" />;
  },
}));
vi.mock("@/components/news/PreviewBanner", () => ({
  PreviewBanner: () => <div data-testid="preview-banner" />,
}));

function readJsonLdAll(): Record<string, unknown>[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  ).map((s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>);
}

function findJsonLd(type: string): Record<string, unknown> | undefined {
  return readJsonLdAll().find((d) => d["@type"] === type);
}

async function renderPage(
  params: { locale: string; slug: string },
  search: Record<string, string> = {},
) {
  const { default: Page } = await import("./page");
  const jsx = await Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(search),
  });
  render(jsx);
}

describe("ColumnDetailPage", () => {
  beforeEach(() => {
    getColumnDetailMock.mockReset();
    getColumnByContentIdMock.mockReset();
    getColumnSlugsMock.mockReset();
    notFoundMock.mockClear();
    isCmsColumnsEnabledMock.mockReturnValue(true);
    newsBodyRendererMock.mockClear();
  });

  it("公開版: タイトルとカテゴリチップ", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "屋内の始め方" }),
    );
    await renderPage({ locale: "ja", slug: "x" });
    expect(screen.getByText("屋内の始め方")).toBeInTheDocument();
    expect(screen.getByText("はじめ方・体験")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-banner")).not.toBeInTheDocument();
    expect(newsBodyRendererMock).toHaveBeenCalledWith(
      expect.objectContaining({ articleSlug: "x" }),
    );
  });

  it("eyecatch/カテゴリ無し・publishedAt 無しでも本文を描画する(欠落耐性)", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({
        slug: "x",
        title: "最小記事",
        category: null,
        eyecatch: undefined,
        publishedAt: undefined,
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    await renderPage({ locale: "ja", slug: "x" });
    expect(screen.getByText("最小記事")).toBeInTheDocument();
    expect(screen.getByTestId("body")).toBeInTheDocument();
    // カテゴリチップは出ない。
    expect(screen.queryByText("はじめ方・体験")).not.toBeInTheDocument();
  });

  it("en: 戻るリンクラベルが英語", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", locale: "en", title: "T" }),
    );
    await renderPage({ locale: "en", slug: "x" });
    expect(screen.getByText("← Column index")).toBeInTheDocument();
  });

  it("bodyHtml/body 未設定(キー欠落)でも空文字 fallback で本文を渡す", async () => {
    // schema は null を "" に畳むため、キー自体を落として undefined を再現する
    // (news の page.test.tsx と同手法)。
    const base = makeParsedColumnItem({ slug: "x", title: "本文なし" });
    const { bodyHtml: _bh, body: _b, ...rest } = base;
    void _bh;
    void _b;
    getColumnDetailMock.mockResolvedValue(rest);
    await renderPage({ locale: "ja", slug: "x" });
    expect(screen.getByTestId("body")).toBeInTheDocument();
  });

  it("記事が無いと notFound", async () => {
    getColumnDetailMock.mockResolvedValue(null);
    await expect(
      renderPage({ locale: "ja", slug: "none" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag OFF かつプレビュー無しは notFound", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    await expect(renderPage({ locale: "ja", slug: "x" })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
    expect(getColumnDetailMock).not.toHaveBeenCalled();
  });

  it("flag OFF でもプレビュー(contentId+draftKey)有効なら描画する(§5.4)", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    getColumnByContentIdMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "下書き", locale: "ja" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "c-1", draftKey: "dk" },
    );
    expect(screen.getByText("下書き")).toBeInTheDocument();
    expect(screen.getByTestId("preview-banner")).toBeInTheDocument();
    expect(getColumnByContentIdMock).toHaveBeenCalledWith({
      id: "c-1",
      draftKey: "dk",
    });
  });

  it("プレビュー: locale/slug が URL と不一致なら公開版へフォールバック", async () => {
    getColumnByContentIdMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "other", locale: "ja" }),
    );
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "公開版" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "c-1", draftKey: "dk" },
    );
    expect(screen.getByText("公開版")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-banner")).not.toBeInTheDocument();
  });

  it("不正 locale で notFound", async () => {
    await expect(
      renderPage({ locale: "fr", slug: "x" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("generateStaticParams: flag ON は slug 一覧", async () => {
    getColumnSlugsMock.mockResolvedValue([{ locale: "ja", slug: "a" }]);
    const { generateStaticParams } = await import("./page");
    expect(await generateStaticParams()).toEqual([
      { locale: "ja", slug: "a" },
    ]);
  });

  it("generateStaticParams: flag OFF は空配列", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    const { generateStaticParams } = await import("./page");
    expect(await generateStaticParams()).toEqual([]);
    expect(getColumnSlugsMock).not.toHaveBeenCalled();
  });

  it("generateStaticParams: 取得失敗は空配列(防御)", async () => {
    getColumnSlugsMock.mockRejectedValue(new Error("down"));
    const { generateStaticParams } = await import("./page");
    expect(await generateStaticParams()).toEqual([]);
  });

  it("generateMetadata: 日本語記事はルートtemplate適用後もブランド名が1回だけ", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "日本語記事", excerpt: "E" }),
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(applyRootTitleTemplate(meta.title)).toBe(
      "日本語記事 | THE PICKLE BANG THEORY",
    );
    expect(meta.description).toBe("E");
  });

  it("generateMetadata: プレビューは noindex", async () => {
    getColumnByContentIdMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "T", locale: "ja" }),
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({ contentId: "c-1", draftKey: "dk" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("generateMetadata: 英語記事はルートtemplate適用後もブランド名が1回だけ", async () => {
    getColumnDetailMock
      .mockResolvedValueOnce(
        makeParsedColumnItem({ slug: "x", locale: "en", title: "English article" }),
      )
      .mockResolvedValueOnce(null);
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(applyRootTitleTemplate(meta.title)).toBe(
      "English article | THE PICKLE BANG THEORY",
    );
    // 2回目の getColumnDetail は対向 locale=ja で呼ばれる。
    expect(getColumnDetailMock).toHaveBeenLastCalledWith({
      locale: "ja",
      slug: "x",
    });
  });

  it("generateMetadata: 不正 locale は空", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "fr", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta).toEqual({});
  });

  it("generateMetadata: 記事無しは空", async () => {
    getColumnDetailMock.mockResolvedValue(null);
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "none" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta).toEqual({});
  });

  it("generateMetadata: 対向 locale が存在すれば alternates.languages を出す", async () => {
    // 1回目(自 locale)=記事あり、2回目(対向 locale)=記事あり。
    getColumnDetailMock
      .mockResolvedValueOnce(
        makeParsedColumnItem({ slug: "x", title: "T", excerpt: "E" }),
      )
      .mockResolvedValueOnce(
        makeParsedColumnItem({ slug: "x", locale: "en" }),
      );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.languages?.ja).toContain("/columns/x");
    expect(meta.alternates?.languages?.en).toContain("/en/columns/x");
  });

  it("generateMetadata: 対向 locale が無ければ alternates を出さない", async () => {
    getColumnDetailMock
      .mockResolvedValueOnce(
        makeParsedColumnItem({ slug: "x", title: "T", excerpt: "E" }),
      )
      .mockResolvedValueOnce(null);
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.canonical).toContain("/columns/x");
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it("プレビュー: contentId のみ(draftKey 欠落)は公開版へフォールバック", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "公開版" }),
    );
    await renderPage({ locale: "ja", slug: "x" }, { contentId: "c-1" });
    expect(screen.getByText("公開版")).toBeInTheDocument();
    expect(getColumnByContentIdMock).not.toHaveBeenCalled();
  });

  it("プレビュー: contentId 形式違反は公開版へフォールバック", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "公開版" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "{CONTENT_ID}", draftKey: "dk" },
    );
    expect(screen.getByText("公開版")).toBeInTheDocument();
    expect(getColumnByContentIdMock).not.toHaveBeenCalled();
  });

  it("プレビュー: microCMS 取得不可(null)は公開版へフォールバック", async () => {
    getColumnByContentIdMock.mockResolvedValue(null);
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "公開版" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "c-1", draftKey: "dk" },
    );
    expect(screen.getByText("公開版")).toBeInTheDocument();
  });

  it("公開版: Article JSON-LD を出力する (ja)", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "屋内の始め方" }),
    );
    await renderPage({ locale: "ja", slug: "x" });
    const article = findJsonLd("Article");
    expect(article).toBeDefined();
    expect(article?.headline).toBe("屋内の始め方");
    expect(article?.inLanguage).toBe("ja");
    expect(article?.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/columns/x`,
    });
  });

  it("公開版: BreadcrumbList JSON-LD を出力する (ja)", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "屋内の始め方" }),
    );
    await renderPage({ locale: "ja", slug: "x" });
    const bc = findJsonLd("BreadcrumbList");
    expect(bc).toBeDefined();
    const items = bc?.itemListElement as { name: string; item: string }[];
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({
      name: "コラム",
      item: `${SITE_URL}/columns`,
    });
    expect(items[2]).toMatchObject({
      name: "屋内の始め方",
      item: `${SITE_URL}/columns/x`,
    });
  });

  it("公開版: en は JSON-LD の URL とラベルを英語側に切り替える", async () => {
    getColumnDetailMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "Indoor basics", locale: "en" }),
    );
    await renderPage({ locale: "en", slug: "x" });
    expect(findJsonLd("Article")?.mainEntityOfPage).toEqual({
      "@type": "WebPage",
      "@id": `${SITE_URL}/en/columns/x`,
    });
    const items = findJsonLd("BreadcrumbList")?.itemListElement as {
      name: string;
      item: string;
    }[];
    expect(items[1]).toMatchObject({
      name: "Column",
      item: `${SITE_URL}/en/columns`,
    });
  });

  it("generateMetadata: 公開版は og:url と type=article を出す", async () => {
    getColumnDetailMock.mockImplementation(async ({ locale }: { locale: string }) =>
      locale === "ja"
        ? makeParsedColumnItem({
            slug: "x",
            publishedAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          })
        : null,
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.openGraph).toMatchObject({
      type: "article",
      url: `${SITE_URL}/columns/x`,
      publishedTime: "2026-04-01T00:00:00.000Z",
      modifiedTime: "2026-04-02T00:00:00.000Z",
    });
  });

  it("generateMetadata: openGraph に images を出さない (記事アイキャッチを活かす)", async () => {
    // images を持つと Next が opengraph-image.tsx のファイル規約を
    // 適用しなくなり、og:image が共通ロゴに退化する。
    getColumnDetailMock.mockResolvedValue(makeParsedColumnItem({ slug: "x" }));
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.openGraph).not.toHaveProperty("images");
  });

  it("generateMetadata: publishedAt 無しは createdAt を publishedTime に使う", async () => {
    const base = makeParsedColumnItem({
      slug: "x",
      createdAt: "2026-02-02T00:00:00.000Z",
    });
    const { publishedAt: _p, ...rest } = base;
    void _p;
    getColumnDetailMock.mockResolvedValue(rest);
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.openGraph).toMatchObject({
      publishedTime: "2026-02-02T00:00:00.000Z",
    });
  });

  it("generateMetadata: プレビューは openGraph を出さない", async () => {
    getColumnByContentIdMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", locale: "ja" }),
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({ contentId: "c-1", draftKey: "dk" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph).toBeUndefined();
  });

  it("プレビュー中は JSON-LD を出力しない (noindex と揃える)", async () => {
    getColumnByContentIdMock.mockResolvedValue(
      makeParsedColumnItem({ slug: "x", title: "下書き", locale: "ja" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "c-1", draftKey: "dk" },
    );
    expect(screen.getByTestId("preview-banner")).toBeInTheDocument();
    expect(readJsonLdAll()).toHaveLength(0);
  });
});
