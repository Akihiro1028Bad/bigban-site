import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  makeNewsItem,
  makeNewsList,
} from "../../../../__mocks__/microcms-fixtures";

const getNewsListMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const isCmsNewsEnabledMock = vi.fn(() => true);
const routerPushMock = vi.fn();

vi.mock("@/lib/microcms/queries", () => ({
  getNewsList: (args: unknown) => getNewsListMock(args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) =>
    k === "heading" ? "ニュース" : k,
}));
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
  params: { locale: string },
  search: Record<string, string> = {},
) {
  const { default: NewsPage } = await import("./page");
  const jsx = await NewsPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(search),
  });
  render(jsx);
}

describe("NewsPage", () => {
  beforeEach(() => {
    getNewsListMock.mockReset();
    notFoundMock.mockClear();
    isCmsNewsEnabledMock.mockReturnValue(true);
    routerPushMock.mockClear();
  });

  it("12件カード描画", async () => {
    getNewsListMock.mockResolvedValue(
      makeNewsList(
        Array.from({ length: 12 }, (_, i) =>
          makeNewsItem({ id: `x${i}`, slug: `s${i}`, title: `T${i}` }),
        ),
        24,
      ),
    );
    await renderPage({ locale: "ja" });
    expect(screen.getByText("T0")).toBeInTheDocument();
    expect(screen.getByText("T11")).toBeInTheDocument();
  });

  it("category を渡す", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([]));
    await renderPage({ locale: "ja" }, { category: "media" });
    expect(getNewsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "media",
        offset: 0,
        limit: 12,
      }),
    );
  });

  it("page=2 で offset=12 を渡す", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([makeNewsItem()], 24));
    await renderPage({ locale: "ja" }, { page: "2" });
    expect(getNewsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 12, limit: 12 }),
    );
  });

  it("不正category で notFound", async () => {
    await expect(
      renderPage({ locale: "ja" }, { category: "invalid" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("不正page (非数値) で 1ページ目相当にフォールバック", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([makeNewsItem()], 12));
    await renderPage({ locale: "ja" }, { page: "abc" });
    expect(getNewsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("page が範囲外 (>totalPages) で notFound", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([], 12));
    await expect(
      renderPage({ locale: "ja" }, { page: "999" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("不正locale で notFound", async () => {
    await expect(renderPage({ locale: "fr" })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  it("flag OFF で notFound", async () => {
    isCmsNewsEnabledMock.mockReturnValue(false);
    await expect(renderPage({ locale: "ja" })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  it("空リストメッセージ", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([], 0));
    await renderPage({ locale: "ja" });
    expect(
      screen.getByText(/表示できるニュースはありません/),
    ).toBeInTheDocument();
  });

  it("locale=en 空リストメッセージ", async () => {
    getNewsListMock.mockResolvedValue(makeNewsList([], 0));
    await renderPage({ locale: "en" });
    expect(
      screen.getByText(/No news to show right now/),
    ).toBeInTheDocument();
  });

  it("totalCount>12 でページネーション描画", async () => {
    getNewsListMock.mockResolvedValue(
      makeNewsList(
        Array.from({ length: 12 }, (_, i) =>
          makeNewsItem({ id: `x${i}`, slug: `s${i}` }),
        ),
        24,
      ),
    );
    await renderPage({ locale: "ja" });
    expect(screen.getByRole("link", { name: "2" })).toBeInTheDocument();
  });

  it("generateStaticParams が全 locale を返す", async () => {
    const { generateStaticParams } = await import("./page");
    expect(generateStaticParams()).toEqual([
      { locale: "ja" },
      { locale: "en" },
    ]);
  });

  it("generateMetadata: ja は日本語タイトル/説明", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(meta.title).toContain("ニュース");
    expect(meta.description).toContain("最新");
  });

  it("generateMetadata: en は英語タイトル/説明", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(meta.title).toContain("News");
    expect(meta.description).toContain("Latest");
  });
});
