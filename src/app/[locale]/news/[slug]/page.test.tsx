import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeParsedNewsItem as makeNewsItem } from "../../../../../__mocks__/microcms-fixtures";

const getNewsDetailMock = vi.fn();
const getNewsByContentIdMock = vi.fn();
const getNewsSlugsMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const isCmsNewsEnabledMock = vi.fn(() => true);
const routerPushMock = vi.fn();

vi.mock("@/lib/microcms/queries", () => ({
  getNewsDetail: (args: unknown) => getNewsDetailMock(args),
  getNewsByContentId: (args: unknown) => getNewsByContentIdMock(args),
  getNewsSlugs: () => getNewsSlugsMock(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("next-intl", () => ({
  hasLocale: (_l: readonly string[], v: string) =>
    v === "ja" || v === "en",
}));
vi.mock("@/config/featureFlags", () => ({
  isCmsNewsEnabled: isCmsNewsEnabledMock,
  isCmsColumnsEnabled: () => false,
}));
vi.mock("@/components/home/HomeNavigation", () => ({
  default: () => null,
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => null,
}));

async function renderPage(
  params: { locale: string; slug: string },
  search: Record<string, string> = {},
) {
  const { default: Detail } = await import("./page");
  const jsx = await Detail({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(search),
  });
  render(jsx);
}

describe("NewsDetailPage", () => {
  beforeEach(() => {
    getNewsDetailMock.mockReset();
    getNewsByContentIdMock.mockReset();
    getNewsSlugsMock.mockReset();
    notFoundMock.mockClear();
    isCmsNewsEnabledMock.mockReturnValue(true);
  });

  it("記事+JSON-LD描画", async () => {
    getNewsDetailMock.mockImplementation(async ({ slug, locale }) => {
      if (slug === "x" && locale === "ja") {
        return makeNewsItem({
          title: "本件",
          slug: "x",
          bodyHtml: "<p>hi</p>",
        });
      }
      return null;
    });
    await renderPage({ locale: "ja", slug: "x" });
    expect(
      screen.getByRole("heading", { name: "本件" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('script[type="application/ld+json"]'),
    ).not.toBeNull();
  });

  it("複数カテゴリは配列順にすべてチップ表示する (ja)", async () => {
    getNewsDetailMock.mockImplementation(async () =>
      makeNewsItem({
        title: "複数",
        slug: "multi",
        category: ["notice", "media", "event"],
      }),
    );
    await renderPage({ locale: "ja", slug: "multi" });
    expect(screen.getByText("お知らせ")).toBeInTheDocument();
    expect(screen.getByText("メディア掲載")).toBeInTheDocument();
    expect(screen.getByText("イベント情報")).toBeInTheDocument();
  });

  it("複数カテゴリは locale=en で英語ラベルを並べる", async () => {
    getNewsDetailMock.mockImplementation(async () =>
      makeNewsItem({
        title: "Multi",
        slug: "multi-en",
        category: ["notice", "campaign"],
        locale: "en",
      }),
    );
    await renderPage({ locale: "en", slug: "multi-en" });
    expect(screen.getByText("Notice")).toBeInTheDocument();
    expect(screen.getByText("Campaign")).toBeInTheDocument();
  });

  it("publishedAt/bodyHtml/body が undefined でも createdAt と空文字 fallback で描画", async () => {
    getNewsDetailMock.mockImplementation(async () => {
      const base = makeNewsItem({
        title: "ドラフト",
        slug: "x",
        createdAt: "2026-03-15T00:00:00.000Z",
      });
      const { publishedAt: _p, bodyHtml: _bh, body: _b, ...rest } = base;
      void _p;
      void _bh;
      void _b;
      return rest;
    });
    await renderPage({ locale: "ja", slug: "x" });
    expect(screen.getByText(/2026\.03\.15/)).toBeInTheDocument();
  });

  it("記事なし notFound", async () => {
    getNewsDetailMock.mockResolvedValue(null);
    await expect(
      renderPage({ locale: "ja", slug: "none" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("flag OFF notFound", async () => {
    isCmsNewsEnabledMock.mockReturnValue(false);
    await expect(
      renderPage({ locale: "ja", slug: "x" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("不正locale notFound", async () => {
    await expect(
      renderPage({ locale: "fr", slug: "x" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("externalLink ボタン", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) => {
      if (locale === "ja") {
        return makeNewsItem({
          slug: "x",
          externalLink: {
            label: "詳しくはこちら",
            url: "https://example.com",
          },
        });
      }
      return null;
    });
    await renderPage({ locale: "ja", slug: "x" });
    const a = screen.getByRole("link", { name: /詳しくはこちら/ });
    expect(a).toHaveAttribute("href", "https://example.com");
    expect(a).toHaveAttribute("target", "_blank");
  });

  it("戻るリンク /news", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) =>
      locale === "ja" ? makeNewsItem({ slug: "x" }) : null,
    );
    await renderPage({ locale: "ja", slug: "x" });
    expect(screen.getByRole("link", { name: /一覧/ })).toHaveAttribute(
      "href",
      "/news",
    );
  });

  it("locale=en 戻るリンク /en/news", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) =>
      locale === "en"
        ? makeNewsItem({ slug: "x", locale: "en" })
        : null,
    );
    await renderPage({ locale: "en", slug: "x" });
    expect(screen.getByRole("link", { name: /news index/i })).toHaveAttribute(
      "href",
      "/en/news",
    );
  });

  it("generateStaticParams が全slug返す", async () => {
    getNewsSlugsMock.mockResolvedValue([
      { locale: "ja", slug: "a" },
      { locale: "en", slug: "b" },
    ]);
    const { generateStaticParams } = await import("./page");
    const r = await generateStaticParams();
    expect(r).toEqual([
      { locale: "ja", slug: "a" },
      { locale: "en", slug: "b" },
    ]);
  });

  it("generateMetadata title", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) =>
      locale === "ja"
        ? makeNewsItem({ title: "T", slug: "x", excerpt: "E" })
        : null,
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toContain("T");
    expect(meta.description).toBe("E");
  });

  it("generateMetadata 記事なし空", async () => {
    getNewsDetailMock.mockResolvedValue(null);
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta).toEqual({});
  });

  it("generateMetadata 不正locale で空", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "fr", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta).toEqual({});
  });

  it("generateMetadata locale=en で対向 ja を引きに行く", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) => {
      if (locale === "en") {
        return makeNewsItem({ title: "T", slug: "x", locale: "en" });
      }
      if (locale === "ja") {
        return makeNewsItem({ title: "T", slug: "x" });
      }
      return null;
    });
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.languages).toBeDefined();
  });

  it("readPreviewItem: getNewsByContentId が null を返す時は preview なし扱い", async () => {
    getNewsByContentIdMock.mockResolvedValue(null);
    getNewsDetailMock.mockResolvedValue(
      makeNewsItem({ slug: "x", title: "公開版" }),
    );
    await renderPage(
      { locale: "ja", slug: "x" },
      { contentId: "g-missing", draftKey: "dk-1" },
    );
    expect(
      screen.getByRole("heading", { name: "公開版" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("対向言語が存在する時のみ alternates.languages を出力", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) => {
      if (locale === "ja") {
        return makeNewsItem({ title: "T", slug: "x" });
      }
      if (locale === "en") {
        return makeNewsItem({ title: "T", slug: "x", locale: "en" });
      }
      return null;
    });
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.languages).toBeDefined();
  });

  it("対向言語なしの時は alternates.languages を出力しない", async () => {
    getNewsDetailMock.mockImplementation(async ({ locale }) =>
      locale === "ja" ? makeNewsItem({ title: "T", slug: "x" }) : null,
    );
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja", slug: "x" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  describe("preview (URL クエリ ?contentId & ?draftKey)", () => {
    it("preview パラメータ揃って microCMS から返れば draft 表示 + プレビューバナー表示", async () => {
      getNewsByContentIdMock.mockResolvedValue(
        makeNewsItem({ slug: "x", title: "ドラフトタイトル" }),
      );
      // 公開版は呼ばれない (preview を優先)
      getNewsDetailMock.mockResolvedValue(null);
      await renderPage(
        { locale: "ja", slug: "x" },
        { contentId: "g-abc", draftKey: "dk-1" },
      );
      expect(getNewsByContentIdMock).toHaveBeenCalledWith({
        id: "g-abc",
        draftKey: "dk-1",
      });
      expect(
        screen.getByRole("heading", { name: "ドラフトタイトル" }),
      ).toBeInTheDocument();
      // プレビューバナー (role=status) が出る
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("preview の slug/locale が URL と不一致なら fallback (公開版を見る)", async () => {
      getNewsByContentIdMock.mockResolvedValue(
        makeNewsItem({ slug: "different-slug" }),
      );
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({ slug: "x", title: "公開版" }),
      );
      await renderPage(
        { locale: "ja", slug: "x" },
        { contentId: "g-abc", draftKey: "dk-1" },
      );
      expect(
        screen.getByRole("heading", { name: "公開版" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("contentId が不正形式なら preview 経路をスキップ", async () => {
      getNewsDetailMock.mockResolvedValue(
        makeNewsItem({ slug: "x", title: "公開版" }),
      );
      await renderPage(
        { locale: "ja", slug: "x" },
        { contentId: "{CONTENT_ID}", draftKey: "dk-1" },
      );
      expect(getNewsByContentIdMock).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "公開版" }),
      ).toBeInTheDocument();
    });

    it("preview 中は generateMetadata が noindex + alternates なし", async () => {
      getNewsByContentIdMock.mockResolvedValue(
        makeNewsItem({ slug: "x", title: "T", excerpt: "E" }),
      );
      const { generateMetadata } = await import("./page");
      const meta = await generateMetadata({
        params: Promise.resolve({ locale: "ja", slug: "x" }),
        searchParams: Promise.resolve({
          contentId: "g-abc",
          draftKey: "dk-1",
        }),
      });
      expect(meta.robots).toEqual({ index: false, follow: false });
      expect(meta.alternates?.languages).toBeUndefined();
    });
  });
});
