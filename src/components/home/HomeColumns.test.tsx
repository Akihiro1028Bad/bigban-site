import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeParsedColumnItem } from "../../../__mocks__/columns-fixtures";

const isCmsColumnsEnabledMock = vi.fn(() => true);
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: () => isCmsColumnsEnabledMock(),
}));

const getColumnsListMock = vi.fn();
vi.mock("@/lib/microcms/columnsQueries", () => ({
  getColumnsList: (args: unknown) => getColumnsListMock(args),
}));

const getTranslationsMock = vi.fn();
vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => getTranslationsMock(...args),
}));

const trackCtaClickMock = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClickMock(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        data-fill={fill ? "true" : undefined}
        data-priority={priority ? "true" : undefined}
      />
    );
  },
}));

const dictionary: Record<"ja" | "en", Record<string, string>> = {
  ja: {
    title: "COLUMN",
    titleJa: "コラム",
    subtitle: "ピックルボールをもっと楽しむための最新コラム",
    viewAll: "すべてのコラムを見る",
  },
  en: {
    title: "COLUMN",
    titleJa: "Column",
    subtitle: "Latest columns to help you enjoy pickleball",
    viewAll: "VIEW ALL COLUMNS",
  },
};

async function renderHomeColumns(locale: "ja" | "en" = "ja") {
  getTranslationsMock.mockResolvedValue(
    (key: string) => dictionary[locale][key] ?? key,
  );
  const { default: HomeColumns } = await import("./HomeColumns");
  const element = await HomeColumns({ locale });
  return render(element);
}

describe("HomeColumns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCmsColumnsEnabledMock.mockReturnValue(true);
  });

  it("CMSフラグOFFでは取得せず何も描画しない", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);

    const { container } = await renderHomeColumns();

    expect(container.firstChild).toBeNull();
    expect(getColumnsListMock).not.toHaveBeenCalled();
  });

  it("コラム0件では何も描画しない", async () => {
    getColumnsListMock.mockResolvedValueOnce({
      contents: [],
      totalCount: 0,
      offset: 0,
      limit: 3,
    });

    const { container } = await renderHomeColumns();

    expect(container.firstChild).toBeNull();
  });

  it("取得失敗時はログを残して何も描画しない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchError = new Error("microcms down");
    getColumnsListMock.mockRejectedValueOnce(fetchError);

    const { container } = await renderHomeColumns();

    expect(container.firstChild).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("HomeColumns"),
      fetchError,
    );
    errorSpy.mockRestore();
  });

  it("日本語の最新コラム3件と一覧リンクを表示する", async () => {
    getColumnsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedColumnItem({ id: "1", slug: "column-1", title: "コラム1" }),
        makeParsedColumnItem({ id: "2", slug: "column-2", title: "コラム2" }),
        makeParsedColumnItem({ id: "3", slug: "column-3", title: "コラム3" }),
      ],
      totalCount: 3,
      offset: 0,
      limit: 3,
    });

    const { container } = await renderHomeColumns("ja");

    expect(getColumnsListMock).toHaveBeenCalledWith({
      locale: "ja",
      limit: 3,
      offset: 0,
    });
    expect(screen.getByText("コラム1")).toBeInTheDocument();
    expect(screen.getByText("コラム2")).toBeInTheDocument();
    expect(screen.getByText("コラム3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "すべてのコラムを見る" }),
    ).toHaveAttribute("href", "/columns");
    expect(container.querySelector("section#columns")).toBeInTheDocument();
  });

  it("英語ロケールでは英語コラムを取得して英語CTAを表示する", async () => {
    getColumnsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedColumnItem({
          id: "1",
          locale: "en",
          slug: "english-column",
          title: "English Column",
        }),
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });

    await renderHomeColumns("en");

    expect(getColumnsListMock).toHaveBeenCalledWith({
      locale: "en",
      limit: 3,
      offset: 0,
    });
    expect(
      screen.getByRole("link", { name: "VIEW ALL COLUMNS" }),
    ).toHaveAttribute("href", "/columns");
  });

  it("カードと一覧リンクをホーム専用locationで1回ずつ計測する", async () => {
    getColumnsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedColumnItem({
          id: "1",
          slug: "tracked-column",
          title: "計測コラム",
        }),
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });
    await renderHomeColumns();

    await userEvent.click(screen.getByRole("link", { name: /計測コラム/ }));
    expect(trackCtaClickMock).toHaveBeenCalledWith(
      "contentClick",
      "home_column_card",
      "tracked-column",
    );

    trackCtaClickMock.mockClear();
    await userEvent.click(
      screen.getByRole("link", { name: "すべてのコラムを見る" }),
    );
    expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
    expect(trackCtaClickMock).toHaveBeenCalledWith(
      "contentClick",
      "home_columns_view_all",
      "columns",
    );
  });
});
