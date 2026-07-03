import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const mockGetTranslations = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("./AboutContent", () => ({ default: () => null }));
vi.mock("@/components/StructuredData", () => ({ default: () => null }));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({}),
}));
const isCmsNewsEnabledMock = vi.fn(() => false);
vi.mock("@/config/featureFlags", () => ({
  isCmsNewsEnabled: () => isCmsNewsEnabledMock(),
  isCmsColumnsEnabled: () => false,
}));
const getNewsListMock = vi.fn().mockResolvedValue({
  contents: [],
  totalCount: 0,
  offset: 0,
  limit: 12,
});
vi.mock("@/lib/microcms/queries", () => ({
  getNewsList: (args: unknown) => getNewsListMock(args),
}));

describe("About generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildMockT(keywords: string[]) {
    const mockT = ((key: string) => `translated:${key}`) as unknown as {
      (key: string): string;
      raw: (key: string) => unknown;
    };
    mockT.raw = (_key: string) => keywords;
    return mockT;
  }

  it("日本語でキーワード/canonical/og:urlを返す", async () => {
    mockGetTranslations.mockResolvedValue(
      buildMockT(["RST Agency", "西村昭彦"])
    );

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.keywords).toEqual(["RST Agency", "西村昭彦"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/about");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/about");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
  });

  it("英語でcanonicalに/en/aboutを含める", async () => {
    mockGetTranslations.mockResolvedValue(
      buildMockT(["Akihiko Nishimura"])
    );

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/en/about"
    );
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/en/about");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });

  it("openGraphに共通OGP画像を明示する", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT([]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "http://localhost:3000/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "THE PICKLE BANG THEORY",
      },
    ]);
  });
});

describe("About Page", () => {
  beforeEach(() => {
    isCmsNewsEnabledMock.mockReturnValue(false);
    getNewsListMock.mockClear();
  });

  it("localeを設定しAboutコンポーネントを描画する", async () => {
    const { default: AboutPage } = await import("./page");
    const element = await AboutPage({
      params: Promise.resolve({ locale: "ja" }),
    });
    const { container } = render(element);
    expect(container).toBeTruthy();
  });

  it("不正 locale で notFound", async () => {
    const { default: AboutPage } = await import("./page");
    await expect(
      AboutPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("CMS フラグ ON で getNewsList から news を取得して渡す", async () => {
    isCmsNewsEnabledMock.mockReturnValue(true);
    getNewsListMock.mockResolvedValueOnce({
      contents: [
        {
          id: "n1",
          slug: "n-1",
          title: "test",
          excerpt: "ex",
          locale: "ja",
          category: ["notice"],
          displayMode: "html",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: "2026-01-01T00:00:00.000Z",
          revisedAt: "2026-01-01T00:00:00.000Z",
          bodyHtml: "",
          body: "",
        },
      ],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });
    const { default: AboutPage } = await import("./page");
    const element = await AboutPage({
      params: Promise.resolve({ locale: "ja" }),
    });
    render(element);
    expect(getNewsListMock).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "ja", limit: 3, offset: 0 }),
    );
  });
});
