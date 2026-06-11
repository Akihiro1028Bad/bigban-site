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

vi.mock("@/components/home/HomeIntro", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/home/HomeNavigation", () => ({ default: () => null }));
vi.mock("@/components/home/HomeHero", () => ({ default: () => null }));
vi.mock("@/components/home/HomeConcept", () => ({ default: () => null }));
vi.mock("@/components/home/HomeFacility", () => ({ default: () => null }));
vi.mock("@/components/home/HomeServices", () => ({ default: () => null }));
vi.mock("@/components/home/HomePricing", () => ({ default: () => null }));
vi.mock("@/components/home/HomeNews", () => ({ default: () => null }));
vi.mock("@/components/home/HomeAbout", () => ({ default: () => null }));
vi.mock("@/components/home/HomeAccess", () => ({ default: () => null }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => null }));

describe("Home generateMetadata", () => {
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
      buildMockT(["kw-a", "kw-b"])
    );

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.keywords).toEqual(["kw-a", "kw-b"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000",
      en: "http://localhost:3000/en",
      "x-default": "http://localhost:3000",
    });
  });

  it("英語でcanonicalに/enを含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT(["kw"]));

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.keywords).toEqual(["kw"]);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/en");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/en");
    expect(metadata.openGraph?.locale).toBe("en_US");
  });

  it("不正 locale で空メタデータを返す (getTranslations を呼ばない)", async () => {
    mockGetTranslations.mockClear();
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "fr" }),
    });
    expect(meta).toEqual({});
    expect(mockGetTranslations).not.toHaveBeenCalled();
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

describe("Home Page", () => {
  it("localeを設定しHomeコンポーネントを描画する", async () => {
    const { default: Home } = await import("./page");
    const element = await Home({
      params: Promise.resolve({ locale: "ja" }),
    });
    const { container } = render(element);
    expect(container).toBeTruthy();
  });

  it("不正 locale で notFound", async () => {
    const { default: Home } = await import("./page");
    await expect(
      Home({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it("export const dynamic === 'force-dynamic' (CDN キャッシュ無効化、microCMS 公開終了の即時反映を担保)", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("HomeNews を Suspense で囲んでストリーミング遅延を回避する", async () => {
    const { Suspense } = await import("react");
    const { default: Home } = await import("./page");
    const element = await Home({
      params: Promise.resolve({ locale: "ja" }),
    });
    function containsSuspense(node: unknown): boolean {
      if (!node || typeof node !== "object") return false;
      const el = node as {
        type?: unknown;
        props?: { children?: unknown };
      };
      if (el.type === Suspense) return true;
      const children = el.props?.children;
      if (Array.isArray(children)) return children.some(containsSuspense);
      return containsSuspense(children);
    }
    expect(containsSuspense(element)).toBe(true);
  });
});
