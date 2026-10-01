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

// 子コンポーネントはモックして page.tsx 自身の並び・分岐だけを検証する。
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

const SECTION_IDS = [
  "hero",
  "benefits",
  "break-even",
  "rates",
  "comparison",
  "fit",
  "join-cta",
  "faq",
] as const;
const SECTION_FILES = [
  "PbtClubHero",
  "PbtClubBenefits",
  "PbtClubBreakEven",
  "PbtClubRates",
  "PbtClubComparison",
  "PbtClubFit",
  "PbtClubJoinCta",
  "PbtClubFaq",
] as const;
for (const [i, file] of SECTION_FILES.entries()) {
  vi.doMock(`@/components/pbt-club/${file}`, () => ({
    default: () => <section data-testid={`pbt-${SECTION_IDS[i]}`} />,
  }));
}

function buildMockT() {
  return ((key: string) => `translated:${key}`) as unknown as (
    key: string,
  ) => string;
}

describe("PbtClubPage generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("日本語で canonical/og:url を /pbt-club で返す", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.title).toBe("translated:pbtClub.title");
    expect(metadata.description).toBe("translated:pbtClub.description");
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/pbt-club");
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/pbt-club");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000/pbt-club",
      en: "http://localhost:3000/en/pbt-club",
      "x-default": "http://localhost:3000/pbt-club",
    });
  });

  it("英語で canonical/og:url に /en/pbt-club を含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());
    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/en/pbt-club",
    );
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/en/pbt-club");
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

describe("PbtClubPage", () => {
  it.each(["ja", "en"])("%s でナビ・全セクション・フッターを順番どおりに並べる", async (locale) => {
    const { default: PbtClubPage } = await import("./page");
    render(await PbtClubPage({ params: Promise.resolve({ locale }) }));

    const ordered = [
      screen.getByTestId("home-navigation"),
      ...SECTION_IDS.map((id) => screen.getByTestId(`pbt-${id}`)),
      screen.getByTestId("home-footer"),
    ];
    ordered.slice(1).forEach((node, i) => {
      expect(ordered[i].compareDocumentPosition(node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  it("コラム機能の表示設定をナビゲーションへ渡す", async () => {
    const { default: PbtClubPage } = await import("./page");
    render(await PbtClubPage({ params: Promise.resolve({ locale: "ja" }) }));
    expect(screen.getByTestId("home-navigation")).toHaveAttribute(
      "data-show-columns",
      "true",
    );
  });

  it("パンくず(ホーム › PBT CLUB)の構造化データを出す", async () => {
    const { default: PbtClubPage } = await import("./page");
    const { container } = render(
      await PbtClubPage({ params: Promise.resolve({ locale: "ja" }) }),
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(script?.textContent ?? "{}") as {
      "@type": string;
      itemListElement: { name: string; item: string }[];
    };
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement.at(-1)).toMatchObject({
      name: "PBT CLUB",
      item: "http://localhost:3000/pbt-club",
    });
  });

  it("不正な locale で notFound により描画されない（throw する）", async () => {
    const { default: PbtClubPage } = await import("./page");
    await expect(
      PbtClubPage({ params: Promise.resolve({ locale: "xx" }) }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
