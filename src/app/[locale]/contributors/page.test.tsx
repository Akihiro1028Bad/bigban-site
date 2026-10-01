import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const mockGetTranslations = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));

const contributorsContentMock = vi.fn();
vi.mock("@/components/contributors/ContributorsContent", () => ({
  default: (props: unknown) => {
    contributorsContentMock(props);
    return null;
  },
}));
const shouldShowColumnsMock = vi.fn(async (_locale: string) => true);
vi.mock("@/lib/columns/visibility", () => ({
  shouldShowColumns: (locale: string) => shouldShowColumnsMock(locale),
}));

vi.mock("@/components/StructuredData", () => ({ default: () => null }));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({}),
}));

describe("Contributors generateMetadata", () => {
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

  it("日本語で canonical / og:url / alternates を返す", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["支援者", "クラウドファンディング"]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.keywords).toEqual(["支援者", "クラウドファンディング"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/contributors");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/contributors");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000/contributors",
      en: "http://localhost:3000/en/contributors",
      "x-default": "http://localhost:3000/contributors",
    });
  });

  it("英語で canonical に /en/contributors を含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["contributors"]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/contributors");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("ContributorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("日本語のパンくずを組み立てる", async () => {
    const { buildBreadcrumb } = await import("@/lib/structured-data");
    const { default: ContributorsPage } = await import("./page");

    await ContributorsPage({ params: Promise.resolve({ locale: "ja" }) });

    expect(buildBreadcrumb).toHaveBeenCalledWith("ja", [
      { name: "クラウドファンディング支援者", path: "/contributors" },
    ]);
  });

  it("英語のパンくずを組み立てる", async () => {
    const { buildBreadcrumb } = await import("@/lib/structured-data");
    const { default: ContributorsPage } = await import("./page");

    await ContributorsPage({ params: Promise.resolve({ locale: "en" }) });

    expect(buildBreadcrumb).toHaveBeenCalledWith("en", [
      { name: "Contributors", path: "/contributors" },
    ]);
  });
});

describe("Contributors Page のコラム表示", () => {
  beforeEach(() => {
    shouldShowColumnsMock.mockReset().mockResolvedValue(true);
    contributorsContentMock.mockClear();
  });

  it("COLUMN ナビの表示は shouldShowColumns(現在の言語)に従う", async () => {
    shouldShowColumnsMock.mockImplementation(async (l: string) => l === "ja");
    const { default: ContributorsPage } = await import("./page");
    render(await ContributorsPage({ params: Promise.resolve({ locale: "en" }) }));
    expect(shouldShowColumnsMock).toHaveBeenCalledWith("en");
    expect(contributorsContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ showColumns: false }),
    );
  });

  it("日本語では shouldShowColumns('ja') を使う", async () => {
    const { default: ContributorsPage } = await import("./page");
    render(await ContributorsPage({ params: Promise.resolve({ locale: "ja" }) }));
    expect(shouldShowColumnsMock).toHaveBeenCalledWith("ja");
    expect(contributorsContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ showColumns: true }),
    );
  });
});
