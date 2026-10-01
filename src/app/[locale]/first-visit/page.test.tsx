import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

// 子コンポーネントはモックして page.tsx 自身の分岐のみを検証する。
vi.mock("@/components/home/HomeNavigation", () => ({
  default: ({ showColumns }: { showColumns?: boolean }) => (
    <nav data-testid="home-navigation" data-show-columns={showColumns} />
  ),
}));
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: () => true,
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => <footer data-testid="home-footer" />,
}));
vi.mock("@/components/firstVisit/FirstVisitHero", () => ({
  default: () => <section data-testid="fv-hero" />,
}));
vi.mock("@/components/firstVisit/FirstVisitFlow", () => ({
  default: () => <section data-testid="fv-flow" />,
}));
vi.mock("@/components/firstVisit/FirstVisitFacts", () => ({
  default: () => <section data-testid="fv-facts" />,
}));
vi.mock("@/components/firstVisit/FirstVisitPricing", () => ({
  default: () => <section data-testid="fv-pricing" />,
}));
vi.mock("@/components/firstVisit/FirstVisitNext", () => ({
  default: () => <section data-testid="fv-next" />,
}));
vi.mock("@/components/firstVisit/FirstVisitFaq", () => ({
  default: () => <section data-testid="fv-faq" />,
}));

function buildMockT() {
  return ((key: string) => `translated:${key}`) as unknown as (
    key: string,
  ) => string;
}

describe("FirstVisitPage generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("日本語で canonical/og:url を /first-visit で返す", async () => {
    const t = vi.fn(buildMockT());
    mockGetTranslations.mockResolvedValue(t);
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    // 営業時間は定数から差し込む(文言に直書きしない)
    expect(t).toHaveBeenCalledWith("firstVisit.description", {
      open: "6:00",
      close: "25:00",
    });
    expect(metadata.title).toBe("translated:firstVisit.title");
    expect(metadata.description).toBe("translated:firstVisit.description");
    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/first-visit",
    );
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/first-visit");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000/first-visit",
      en: "http://localhost:3000/en/first-visit",
      "x-default": "http://localhost:3000/first-visit",
    });
  });

  it("英語で canonical/og:url に /en/first-visit を含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/en/first-visit",
    );
    expect(metadata.openGraph?.url).toBe(
      "http://localhost:3000/en/first-visit",
    );
    expect(metadata.openGraph?.locale).toBe("en_US");
  });

  it("不正 locale で空メタデータを返す (getTranslations を呼ばない)", async () => {
    const { generateMetadata } = await import("./page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "fr" }),
    });

    expect(meta).toEqual({});
    expect(mockGetTranslations).not.toHaveBeenCalled();
  });
});

describe("FirstVisitPage", () => {
  it.each(["ja", "en"])("%s で各セクションを順に描画する", async (locale) => {
    const { default: FirstVisitPage } = await import("./page");
    const { container } = render(
      await FirstVisitPage({ params: Promise.resolve({ locale }) }),
    );

    const ids = [...container.querySelectorAll("[data-testid]")].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual([
      "home-navigation",
      "fv-hero",
      "fv-flow",
      "fv-facts",
      "fv-pricing",
      "fv-next",
      "fv-faq",
      "home-footer",
    ]);
  });

  it("コラム機能の表示設定をナビゲーションへ渡す", async () => {
    const { default: FirstVisitPage } = await import("./page");
    render(await FirstVisitPage({ params: Promise.resolve({ locale: "ja" }) }));
    expect(screen.getByTestId("home-navigation")).toHaveAttribute(
      "data-show-columns",
      "true",
    );
  });

  it("パンくずの構造化データを出す", async () => {
    const { default: FirstVisitPage } = await import("./page");
    const { container } = render(
      await FirstVisitPage({ params: Promise.resolve({ locale: "ja" }) }),
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@type": string;
      itemListElement: { item: string }[];
    };
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement.at(-1)?.item).toBe(
      "http://localhost:3000/first-visit",
    );
  });

  it("不正 locale で notFound を呼ぶ", async () => {
    const { default: FirstVisitPage } = await import("./page");
    await expect(
      FirstVisitPage({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
