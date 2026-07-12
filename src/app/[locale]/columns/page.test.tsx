import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

  it("generateMetadata: ja/en タイトル", async () => {
    const { generateMetadata } = await import("./page");
    const ja = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });
    expect(ja.title).toContain("コラム");
    const en = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });
    expect(en.title).toContain("Column");
  });
});
