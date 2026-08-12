import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/font/google", () => ({
  Orbitron: vi.fn().mockReturnValue({ variable: "--font-orbitron" }),
  Inter: vi.fn().mockReturnValue({ variable: "--font-inter" }),
  Noto_Sans_JP: vi.fn().mockReturnValue({ variable: "--font-noto-sans-jp" }),
  Shippori_Mincho_B1: vi
    .fn()
    .mockReturnValue({ variable: "--font-shippori-mincho-b1" }),
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
  // ルートレイアウトは <html><body> を返すが、RTL は <div> コンテナに描画するため
  // 「<html> cannot be a child of <div>」警告が出る（テスト固有の制約）。それのみ抑制する。
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const original = console.error.bind(console);
    errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      if (msg.includes("cannot be a child of") || msg.includes("hydration error")) {
        return;
      }
      original(...args);
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
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

  it("和文明朝(Shippori Mincho B1)の CSS 変数を html に適用する", async () => {
    const { default: LocaleLayout } = await import("./layout");

    render(
      await LocaleLayout({
        children: <p>mincho</p>,
        params: Promise.resolve({ locale: "ja" }),
      })
    );

    // React 19 は <html> を document 直下へホイストするため documentElement を見る。
    expect(document.documentElement.className).toContain(
      "--font-shippori-mincho-b1"
    );
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
    // twitter.images は敢えて指定しない。指定すると Next.js の自動補完が止まり、
    // 記事の opengraph-image が og:image を上書きしても twitter:image が
    // 共通ロゴのまま残ってしまう (X でアイキャッチが出ない)。
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.twitter).not.toHaveProperty("images");
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
