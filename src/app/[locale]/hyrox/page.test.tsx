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
vi.mock("./HyroxContent", () => ({ default: () => null }));
vi.mock("@/components/StructuredData", () => ({ default: () => null }));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({}),
  buildExerciseGym: vi.fn().mockReturnValue({}),
}));

describe("Hyrox generateMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  function buildMockT(keywords: string[]) {
    const mockT = ((key: string) => `translated:${key}`) as unknown as {
      (key: string): string;
      raw: (key: string) => unknown;
    };
    mockT.raw = (_key: string) => keywords;
    return mockT;
  }

  it("ja: canonical=/hyrox, og:locale=ja_JP", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["HYROX"]));
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
    expect(metadata.keywords).toEqual(["HYROX"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/hyrox");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/hyrox");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
  });

  it("en: canonical=/en/hyrox, og:locale=en_US", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT([]));
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/hyrox");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("Hyrox Page", () => {
  it("ja で描画できる", async () => {
    const { default: HyroxPage } = await import("./page");
    const element = await HyroxPage({ params: Promise.resolve({ locale: "ja" }) });
    const { container } = render(element);
    expect(container).toBeTruthy();
  });

  it("不正 locale で notFound", async () => {
    const { default: HyroxPage } = await import("./page");
    await expect(
      HyroxPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
