import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockGetTranslations = vi.fn();
const buildBreadcrumbMock = vi.fn().mockReturnValue({ "@type": "BreadcrumbList" });

vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/home/HomeNavigation", () => ({
  default: ({ showColumns }: { showColumns?: boolean }) => (
    <nav data-testid="home-navigation" data-show-columns={showColumns} />
  ),
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => <footer data-testid="home-footer" />,
}));
vi.mock("@/config/featureFlags", () => ({ isCmsColumnsEnabled: () => true }));
vi.mock("@/components/private/PrivateHero", () => ({
  default: () => <section data-testid="private-hero" />,
}));
vi.mock("@/components/private/PrivateDetails", () => ({
  default: () => <section data-testid="private-details" />,
}));
vi.mock("@/components/private/PrivateCta", () => ({
  default: () => <section data-testid="private-cta" />,
}));
vi.mock("@/components/StructuredData", () => ({
  default: ({ data }: { data: { "@type": string } }) => (
    <script type="application/ld+json" data-type={data["@type"]} />
  ),
}));
vi.mock("@/lib/structured-data", () => ({
  buildBreadcrumb: (...args: unknown[]) => buildBreadcrumbMock(...args),
}));

function buildMockT() {
  return vi.fn((key: string, _values?: Record<string, string>) => `translated:${key}`);
}

describe("PrivatePage generateMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ja: canonical=/private、alternates に ja/en/x-default", async () => {
    const mockT = buildMockT();
    mockGetTranslations.mockResolvedValue(mockT);
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
    expect(metadata.title).toBe("translated:private.title");
    expect(metadata.description).toBe("translated:private.description");
    expect(mockT).toHaveBeenCalledWith("private.description", { open: "6:00", close: "25:00" });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/private");
    expect(metadata.alternates?.languages).toEqual({
      ja: "http://localhost:3000/private",
      en: "http://localhost:3000/en/private",
      "x-default": "http://localhost:3000/private",
    });
    expect(metadata.openGraph?.locale).toBe("ja_JP");
  });

  it("en: canonical=/en/private", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en/private");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });
});

describe("PrivatePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ja: 各セクションとパンくず(貸切・法人)を描画する", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { default: PrivatePage } = await import("./page");
    render(await PrivatePage({ params: Promise.resolve({ locale: "ja" }) }));
    expect(screen.getByTestId("home-navigation")).toHaveAttribute("data-show-columns", "true");
    expect(screen.getByTestId("private-hero")).toBeInTheDocument();
    expect(screen.getByTestId("private-details")).toBeInTheDocument();
    expect(screen.getByTestId("private-cta")).toBeInTheDocument();
    expect(screen.getByTestId("home-footer")).toBeInTheDocument();
    expect(buildBreadcrumbMock).toHaveBeenCalledWith("ja", [
      { name: "貸切・法人", path: "/private" },
    ]);
  });

  it("en: パンくず名は Private & Corporate", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { default: PrivatePage } = await import("./page");
    render(await PrivatePage({ params: Promise.resolve({ locale: "en" }) }));
    expect(buildBreadcrumbMock).toHaveBeenCalledWith("en", [
      { name: "Private & Corporate", path: "/private" },
    ]);
  });

  it("不正 locale で notFound", async () => {
    const { default: PrivatePage } = await import("./page");
    await expect(
      PrivatePage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
