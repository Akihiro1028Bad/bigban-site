import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { OG_IMAGE, SITE_URL } from "@/constants/site";

import {
  makeParsedColumnItem,
  makeParsedColumnCategory,
} from "../../../../__mocks__/columns-fixtures";
import type { ColumnList } from "@/lib/microcms/columnsSchema";

const getColumnsListMock = vi.fn();
const getColumnCategoriesMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const isCmsColumnsEnabledMock = vi.fn(() => true);
const routerPushMock = vi.fn();

function applyRootTitleTemplate(title: unknown): string {
  if (typeof title !== "string") {
    throw new Error("Page metadata title must be a string");
  }
  return `${title} | THE PICKLE BANG THEORY`;
}

vi.mock("@/lib/microcms/columnsQueries", () => ({
  getColumnsList: (args: unknown) => getColumnsListMock(args),
  getColumnCategories: () => getColumnCategoriesMock(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) => (k === "heading" ? "コラム" : k),
}));
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: isCmsColumnsEnabledMock,
}));
vi.mock("@/components/home/HomeNavigation", () => ({ default: () => null }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => null }));

function listOf(items: ReturnType<typeof makeParsedColumnItem>[], total?: number): ColumnList {
  return {
    contents: items,
    totalCount: total ?? items.length,
    offset: 0,
    limit: 12,
  };
}

function readJsonLd(): Record<string, unknown> {
  const s = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  );
  return JSON.parse(s?.textContent ?? "{}") as Record<string, unknown>;
}

async function renderPage(
  params: { locale: string },
  search: Record<string, string> = {},
) {
  const { default: ColumnsPage } = await import("./page");
  const jsx = await ColumnsPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(search),
  });
  render(jsx);
}

describe("ColumnsPage", () => {
  beforeEach(() => {
    getColumnsListMock.mockReset();
    getColumnCategoriesMock.mockReset();
    notFoundMock.mockClear();
    isCmsColumnsEnabledMock.mockReturnValue(true);
    routerPushMock.mockClear();
    getColumnCategoriesMock.mockResolvedValue([
      makeParsedColumnCategory({ id: "start" }),
      makeParsedColumnCategory({ id: "rules", name: "ルール・基礎知識" }),
    ]);
  });

  it("カード描画", async () => {
    getColumnsListMock.mockResolvedValue(
      listOf([
        makeParsedColumnItem({ id: "a", slug: "a", title: "TA" }),
        makeParsedColumnItem({ id: "b", slug: "b", title: "TB" }),
      ]),
    );
    await renderPage({ locale: "ja" });
    expect(screen.getByText("TA")).toBeInTheDocument();
    expect(screen.getByText("TB")).toBeInTheDocument();
  });

  it("動的カテゴリタブを描画する", async () => {
    getColumnsListMock.mockResolvedValue(listOf([]));
    await renderPage({ locale: "ja" });
    expect(
      screen.getByRole("button", { name: "ルール・基礎知識" }),
    ).toBeInTheDocument();
  });

  it("有効な category(マスタ実在)を渡す", async () => {
    getColumnsListMock.mockResolvedValue(listOf([]));
    await renderPage({ locale: "ja" }, { category: "rules" });
    expect(getColumnsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: "rules", offset: 0, limit: 12 }),
    );
  });

  it("マスタに無い category は notFound", async () => {
    getColumnsListMock.mockResolvedValue(listOf([]));
    await expect(
      renderPage({ locale: "ja" }, { category: "ghost" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("page=2 で offset=12", async () => {
    getColumnsListMock.mockResolvedValue(
      listOf([makeParsedColumnItem()], 24),
    );
    await renderPage({ locale: "ja" }, { page: "2" });
    expect(getColumnsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 12 }),
    );
  });

  it("非数値 page は1ページ目扱い", async () => {
    getColumnsListMock.mockResolvedValue(
      listOf([makeParsedColumnItem()], 12),
    );
    await renderPage({ locale: "ja" }, { page: "x" });
    expect(getColumnsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("範囲外 page で notFound", async () => {
    getColumnsListMock.mockResolvedValue(listOf([], 12));
    await expect(
      renderPage({ locale: "ja" }, { page: "999" }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("不正 locale で notFound", async () => {
    await expect(renderPage({ locale: "fr" })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  it("flag OFF で notFound", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    await expect(renderPage({ locale: "ja" })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    );
  });

  it("空リストメッセージ(ja)", async () => {
    getColumnsListMock.mockResolvedValue(listOf([], 0));
    await renderPage({ locale: "ja" });
    expect(screen.getByText(/表示できるコラムはありません/)).toBeInTheDocument();
  });

  it("空リストメッセージ(en)", async () => {
    getColumnsListMock.mockResolvedValue(listOf([], 0));
    await renderPage({ locale: "en" });
    expect(screen.getByText(/No columns to show right now/)).toBeInTheDocument();
  });

  it("totalCount>12 でページネーション描画", async () => {
    getColumnsListMock.mockResolvedValue(
      listOf(
        Array.from({ length: 12 }, (_, i) =>
          makeParsedColumnItem({ id: `x${i}`, slug: `s${i}` }),
        ),
        24,
      ),
    );
    await renderPage({ locale: "ja" });
    expect(screen.getByRole("link", { name: "2" })).toBeInTheDocument();
  });

  it("generateStaticParams: flag ON は全 locale", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(true);
    const { generateStaticParams } = await import("./page");
    expect(generateStaticParams()).toEqual([
      { locale: "ja" },
      { locale: "en" },
    ]);
  });

  it("generateStaticParams: flag OFF は空配列", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    const { generateStaticParams } = await import("./page");
    expect(generateStaticParams()).toEqual([]);
  });

  it("generateMetadata: ルートtemplate適用後もja/enのブランド名は1回だけ", async () => {
    const { generateMetadata } = await import("./page");
    const ja = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(applyRootTitleTemplate(ja.title)).toBe(
      "コラム | THE PICKLE BANG THEORY",
    );
    const en = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(applyRootTitleTemplate(en.title)).toBe(
      "Column | THE PICKLE BANG THEORY",
    );
  });

  it("generateMetadata: ja は self canonical と hreflang を出力する", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/columns`);
    expect(meta.alternates?.languages).toEqual({
      ja: `${SITE_URL}/columns`,
      en: `${SITE_URL}/en/columns`,
      "x-default": `${SITE_URL}/columns`,
    });
  });

  it("generateMetadata: en の canonical は /en/columns", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/en/columns`);
  });

  it("generateMetadata: openGraph にページ固有の title/url を出力する (ja)", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(meta.openGraph?.title).toBe("コラム");
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/columns`);
    expect(meta.openGraph?.locale).toBe("ja_JP");
    expect(meta.openGraph?.images).toEqual([OG_IMAGE]);
  });

  it("generateMetadata: openGraph は en で en_US と /en/columns", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(meta.openGraph?.title).toBe("Column");
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/en/columns`);
    expect(meta.openGraph?.locale).toBe("en_US");
  });

  it("generateMetadata: twitter は summary_large_image", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(meta.twitter?.images).toEqual([OG_IMAGE.url]);
  });

  it("BreadcrumbList JSON-LD を出力する (ja)", async () => {
    getColumnsListMock.mockResolvedValue(listOf([]));
    await renderPage({ locale: "ja" });
    const d = readJsonLd();
    expect(d["@type"]).toBe("BreadcrumbList");
    const items = d.itemListElement as { name: string; item: string }[];
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      name: "コラム",
      item: `${SITE_URL}/columns`,
    });
  });

  it("BreadcrumbList JSON-LD は en でラベルとURLを切り替える", async () => {
    getColumnsListMock.mockResolvedValue(listOf([]));
    await renderPage({ locale: "en" });
    const items = readJsonLd().itemListElement as {
      name: string;
      item: string;
    }[];
    expect(items[1]).toMatchObject({
      name: "Column",
      item: `${SITE_URL}/en/columns`,
    });
  });
});
