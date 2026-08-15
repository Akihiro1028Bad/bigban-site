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
vi.mock("@/components/reserve/ReserveHero", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveChoice", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveSteps", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveCalendar", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveInfo", () => ({
  default: () => <section data-testid="reserve-info" />,
}));
vi.mock("@/components/reserve/ReserveFaq", () => ({
  default: () => <section data-testid="reserve-faq" />,
}));

function buildMockT() {
  return ((key: string) => `translated:${key}`) as unknown as (
    key: string
  ) => string;
}

describe("ReservePage generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("日本語で canonical/og:url を /reserve で返す", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(metadata.title).toBe("translated:reserve.title");
    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/reserve"
    );
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/reserve");
    expect(metadata.openGraph?.locale).toBe("ja_JP");
    expect(metadata.alternates?.languages).toMatchObject({
      ja: "http://localhost:3000/reserve",
      en: "http://localhost:3000/en/reserve",
      "x-default": "http://localhost:3000/reserve",
    });
  });

  it("英語で canonical/og:url に /en/reserve を含める", async () => {
    mockGetTranslations.mockResolvedValue(buildMockT());

    const { generateMetadata } = await import("./page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3000/en/reserve"
    );
    expect(metadata.openGraph?.url).toBe("http://localhost:3000/en/reserve");
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

describe("ReservePage", () => {
  it("locale を設定し予約案内ページを描画する", async () => {
    const { default: ReservePage } = await import("./page");
    const element = await ReservePage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);
    expect(container).toBeTruthy();
  });

  it("コラム機能の表示設定をナビゲーションへ渡す", async () => {
    const { default: ReservePage } = await import("./page");
    const element = await ReservePage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByTestId("home-navigation")).toHaveAttribute(
      "data-show-columns",
      "true",
    );
  });

  it("FAQ を ReserveInfo の後に掲出する", async () => {
    const { default: ReservePage } = await import("./page");
    const element = await ReservePage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({}),
    });
    render(element);

    const info = screen.getByTestId("reserve-info");
    const faq = screen.getByTestId("reserve-faq");
    const footer = screen.getByTestId("home-footer");
    expect(
      info.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // フッターより後ろへ落ちる回帰を防ぐため、前後どちらの境界も固定する。
    expect(
      faq.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("不正な locale で notFound により描画されない（throw する）", async () => {
    const { default: ReservePage } = await import("./page");
    await expect(
      ReservePage({
        params: Promise.resolve({ locale: "xx" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});
