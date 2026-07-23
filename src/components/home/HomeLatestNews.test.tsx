import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeParsedNewsItem } from "../../../__mocks__/microcms-fixtures";

const isCmsNewsEnabledMock = vi.fn(() => true);
vi.mock("@/config/featureFlags", () => ({
  isCmsNewsEnabled: () => isCmsNewsEnabledMock(),
}));

const getNewsListMock = vi.fn();
vi.mock("@/lib/microcms/queries", () => ({
  getNewsList: (args: unknown) => getNewsListMock(args),
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

const dictionary: Record<"ja" | "en", Record<string, string>> = {
  ja: {
    title: "最新ニュース",
    titleEn: "LATEST NEWS",
    viewAll: "すべてのニュースを見る",
    listLabel: "最新ニュース2件",
  },
  en: {
    title: "Latest News",
    titleEn: "LATEST NEWS",
    viewAll: "VIEW ALL NEWS",
    listLabel: "Two latest news items",
  },
};

async function renderHomeLatestNews(locale: "ja" | "en" = "ja") {
  getTranslationsMock.mockResolvedValue(
    (key: string) => dictionary[locale][key] ?? key,
  );
  const { default: HomeLatestNews } = await import("./HomeLatestNews");
  const element = await HomeLatestNews({ locale });
  return render(element);
}

describe("HomeLatestNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCmsNewsEnabledMock.mockReturnValue(true);
  });

  it("CMSフラグOFFでは取得せず何も描画しない", async () => {
    isCmsNewsEnabledMock.mockReturnValue(false);

    const { container } = await renderHomeLatestNews();

    expect(container.firstChild).toBeNull();
    expect(getNewsListMock).not.toHaveBeenCalled();
  });

  it("ニュース0件では何も描画しない", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [],
      totalCount: 0,
      offset: 0,
      limit: 3,
    });

    const { container } = await renderHomeLatestNews();

    expect(container.firstChild).toBeNull();
  });

  it("取得失敗時はログを残して何も描画しない", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchError = new Error("microcms down");
    getNewsListMock.mockRejectedValueOnce(fetchError);

    const { container } = await renderHomeLatestNews();

    expect(container.firstChild).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("HomeLatestNews"),
      fetchError,
    );
    errorSpy.mockRestore();
  });

  it("日本語の最新2件だけを画像なしのコンパクトな行で表示する", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedNewsItem({
          id: "1",
          slug: "news-1",
          title: "ニュース1",
          publishedAt: "2026-07-23T00:00:00.000Z",
        }),
        makeParsedNewsItem({
          id: "2",
          slug: "news-2",
          title: "ニュース2",
          publishedAt: undefined,
          createdAt: "2026-07-18T00:00:00.000Z",
        }),
        makeParsedNewsItem({
          id: "3",
          slug: "news-3",
          title: "ニュース3",
        }),
      ],
      totalCount: 3,
      offset: 0,
      limit: 3,
    });

    const { container } = await renderHomeLatestNews("ja");

    expect(getNewsListMock).toHaveBeenCalledWith({
      locale: "ja",
      limit: 3,
      offset: 0,
    });
    expect(screen.getByText("ニュース1")).toBeInTheDocument();
    expect(screen.getByText("ニュース2")).toBeInTheDocument();
    expect(screen.queryByText("ニュース3")).not.toBeInTheDocument();
    expect(screen.getByText("2026.07.23")).toBeInTheDocument();
    expect(screen.getByText("2026.07.18")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "最新ニュース" }),
    ).toBeInTheDocument();
    expect(screen.getByText("LATEST NEWS")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("英語ロケールでは英語記事URLと英語CTAを表示する", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedNewsItem({
          id: "1",
          locale: "en",
          slug: "english-news",
          title: "English News",
        }),
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });

    await renderHomeLatestNews("en");

    expect(getNewsListMock).toHaveBeenCalledWith({
      locale: "en",
      limit: 3,
      offset: 0,
    });
    expect(screen.getByRole("link", { name: /English News/ })).toHaveAttribute(
      "href",
      "/en/news/english-news",
    );
    expect(
      screen.getByRole("link", { name: "VIEW ALL NEWS" }),
    ).toHaveAttribute("href", "/news");
  });

  it("記事と一覧リンクを専用location・slugで1回ずつ計測する", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [
        makeParsedNewsItem({
          id: "1",
          slug: "tracked-news",
          title: "計測ニュース",
        }),
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });
    await renderHomeLatestNews();

    await userEvent.click(screen.getByRole("link", { name: /計測ニュース/ }));
    expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
    expect(trackCtaClickMock).toHaveBeenCalledWith(
      "contentClick",
      "home_latest_news",
      "tracked-news",
    );

    trackCtaClickMock.mockClear();
    await userEvent.click(
      screen.getByRole("link", { name: "すべてのニュースを見る" }),
    );
    expect(trackCtaClickMock).toHaveBeenCalledTimes(1);
    expect(trackCtaClickMock).toHaveBeenCalledWith(
      "contentClick",
      "home_latest_news_view_all",
      "news",
    );
  });
});
