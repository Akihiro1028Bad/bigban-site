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
vi.mock("@/components/StructuredData", () => ({
  default: ({ data }: { data: { "@type": string } }) => (
    <script type="application/ld+json" data-type={data["@type"]} />
  ),
}));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: vi.fn().mockReturnValue({ "@type": "BreadcrumbList" }),
  buildExerciseGym: vi.fn().mockReturnValue({ "@type": "ExerciseGym" }),
  buildPersonSekiyoshi: vi.fn().mockReturnValue({ "@type": "Person" }),
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

  it("description に体験会の料金・所要分と営業時間を定数から差し込む", async () => {
    const mockT = buildMockT([]);
    const calls: unknown[][] = [];
    const recordingT = Object.assign(
      (...args: unknown[]) => {
        calls.push(args);
        return mockT(args[0] as string);
      },
      { raw: mockT.raw },
    );
    mockGetTranslations.mockResolvedValue(recordingT);
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
    expect(metadata.description).toBe("translated:hyrox.description");
    expect(calls).toContainEqual([
      "hyrox.description",
      { trialMinutes: 50, trialPrice: "3,000円", open: "6:00", close: "23:00" },
    ]);
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
  it("構造化データとして Breadcrumb・ExerciseGym・Person(関吉) を出す", async () => {
    const { default: HyroxPage } = await import("./page");
    const structuredData = await import("@/lib/structured-data");
    const element = await HyroxPage({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(element);
    const types = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((el) => el.getAttribute("data-type"));
    expect(types).toEqual(["BreadcrumbList", "ExerciseGym", "Person"]);
    expect(structuredData.buildPersonSekiyoshi).toHaveBeenCalledWith("en");
  });

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
