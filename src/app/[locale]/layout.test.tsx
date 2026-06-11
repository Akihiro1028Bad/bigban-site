import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/font/google", () => ({
  Orbitron: vi.fn().mockReturnValue({ variable: "--font-orbitron" }),
  Inter: vi.fn().mockReturnValue({ variable: "--font-inter" }),
  Noto_Sans_JP: vi.fn().mockReturnValue({ variable: "--font-noto-sans-jp" }),
}));

const mockGetTranslations = vi.fn().mockResolvedValue(
  (key: string) => {
    const map: Record<string, string> = {
      "og.siteName": "THE PICKLE BANG THEORY",
    };
    return map[key] ?? key;
  }
);

vi.mock("next-intl/server", () => ({
  getMessages: vi.fn().mockResolvedValue({}),
  setRequestLocale: vi.fn(),
  getTranslations: (...args: unknown[]) => mockGetTranslations(...args),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  hasLocale: vi.fn((locales: string[], locale: string) =>
    locales.includes(locale)
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("@/components/PreHydrationScripts", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/PreHydrationScripts")
  >("@/components/PreHydrationScripts");
  return {
    ...actual,
    default: () => null,
  };
});

vi.mock("../../globals.css", () => ({}));

import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

describe("LocaleLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children with ja locale", async () => {
    const { default: LocaleLayout } = await import("./layout");

    render(
      await LocaleLayout({
        children: <p>test content</p>,
        params: Promise.resolve({ locale: "ja" }),
      })
    );

    expect(screen.getByText("test content")).toBeInTheDocument();
    expect(setRequestLocale).toHaveBeenCalledWith("ja");
  });

  it("exposes a browser-detection script that sets data-browser for iOS Safari", async () => {
    const { browserDetectScript } = await import(
      "@/components/PreHydrationScripts"
    );

    expect(browserDetectScript).toContain("ios-safari");
    expect(browserDetectScript).toContain("navigator.userAgent");
    expect(browserDetectScript).toContain("maxTouchPoints");
  });

  it("excludes Instagram in-app browser from iOS Safari detection", async () => {
    const { browserDetectScript } = await import(
      "@/components/PreHydrationScripts"
    );

    expect(browserDetectScript).toContain("Instagram");
  });

  it("renders children with en locale", async () => {
    const { default: LocaleLayout } = await import("./layout");

    render(
      await LocaleLayout({
        children: <p>english content</p>,
        params: Promise.resolve({ locale: "en" }),
      })
    );

    expect(screen.getByText("english content")).toBeInTheDocument();
    expect(setRequestLocale).toHaveBeenCalledWith("en");
  });

  it("calls notFound for invalid locale", async () => {
    const { default: LocaleLayout } = await import("./layout");

    render(
      await LocaleLayout({
        children: <p>invalid</p>,
        params: Promise.resolve({ locale: "fr" }),
      })
    );

    expect(notFound).toHaveBeenCalled();
  });

  it("generates static params for all locales", async () => {
    const { generateStaticParams } = await import("./layout");

    const params = generateStaticParams();

    expect(params).toEqual([{ locale: "ja" }, { locale: "en" }]);
  });
});

describe("generateMetadata", () => {
  it("returns metadata with ja locale", async () => {
    const { generateMetadata } = await import("./layout");

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "http://localhost:3000/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "THE PICKLE BANG THEORY",
      },
    ]);
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["http://localhost:3000/opengraph-image.png"],
    });
    expect(mockGetTranslations).toHaveBeenCalledWith({
      locale: "ja",
      namespace: "Metadata",
    });
  });

  it("returns metadata with en locale", async () => {
    const { generateMetadata } = await import("./layout");

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.openGraph).toBeDefined();
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(mockGetTranslations).toHaveBeenCalledWith({
      locale: "en",
      namespace: "Metadata",
    });
  });

  it("robots.googleBotでリッチスニペット最大化設定を返す", async () => {
    const { generateMetadata } = await import("./layout");

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.robots).toMatchObject({
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    });
  });

  it("GOOGLE_SITE_VERIFICATION env varが設定されている時にverificationに反映する", async () => {
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", "test-verification-token");
    vi.resetModules();
    const { generateMetadata } = await import("./layout");

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.verification).toEqual({
      google: "test-verification-token",
    });
    vi.unstubAllEnvs();
  });

  it("GOOGLE_SITE_VERIFICATION未設定ならverificationを含めない", async () => {
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", "");
    vi.resetModules();
    const { generateMetadata } = await import("./layout");

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.verification).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("viewport", () => {
  it("themeColorに背景色のディープブラックを設定する", async () => {
    const { viewport } = await import("./layout");

    expect(viewport.themeColor).toBe("#0A0A0A");
  });
});
