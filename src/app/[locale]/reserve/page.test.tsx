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

// 子コンポーネントはモックして page.tsx 自身の分岐のみを検証する。
const reserveCalendarSpy = vi.hoisted(() => ({
  initialTab: undefined as string | undefined,
}));

vi.mock("@/components/home/HomeNavigation", () => ({ default: () => null }));
vi.mock("@/components/home/HomeFooter", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveHero", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveSteps", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveCalendar", () => ({
  default: ({ initialTab }: { initialTab?: string }) => {
    reserveCalendarSpy.initialTab = initialTab;
    return null;
  },
}));
vi.mock("@/components/reserve/ReserveInfo", () => ({ default: () => null }));
vi.mock("@/components/reserve/ReserveFaq", () => ({ default: () => null }));

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
  it("locale を設定し予約ページを描画する（tab 未指定はピックル）", async () => {
    const { default: ReservePage } = await import("./page");
    const element = await ReservePage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);
    expect(container).toBeTruthy();
    expect(reserveCalendarSpy.initialTab).toBe("pickleball");
  });

  it("?tab=hyrox のとき ReserveCalendar に initialTab=hyrox を渡す", async () => {
    const { default: ReservePage } = await import("./page");
    const element = await ReservePage({
      params: Promise.resolve({ locale: "ja" }),
      searchParams: Promise.resolve({ tab: "hyrox" }),
    });
    render(element);
    expect(reserveCalendarSpy.initialTab).toBe("hyrox");
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
