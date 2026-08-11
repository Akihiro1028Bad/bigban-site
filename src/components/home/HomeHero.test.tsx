import { describe, it, expect, vi } from "vitest";
import { forwardRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeHero from "./HomeHero";

import type { ReactElement } from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: forwardRef<HTMLAnchorElement, Record<string, unknown>>(
    ({ children, href, ...props }, ref) => (
      <a ref={ref} href={href as string} {...props}>
        {children as React.ReactNode}
      </a>
    )
  ),
}));

vi.mock("@/hooks/useMagneticButton", () => ({
  useMagneticButton: () => ({
    ref: { current: null },
    position: { x: 0, y: 0 },
    handleMouseMove: vi.fn(),
    handleMouseLeave: vi.fn(),
  }),
}));

function renderWithProvider(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("HomeHero", () => {
  it("ヘッドラインを3行で表示する", () => {
    renderWithProvider(<HomeHero />);
    expect(screen.getByText("ピックルボールの")).toBeInTheDocument();
    expect(screen.getByText("ビッグバンが")).toBeInTheDocument();
    expect(screen.getByText("ここから始まる。")).toBeInTheDocument();
  });

  it("「ビッグバンが」がアクセントカラーでハイライトされている", () => {
    renderWithProvider(<HomeHero />);
    const bigbang = screen.getByText("ビッグバンが");
    expect(bigbang.className).toContain("text-accent");
  });

  it("英語タグラインを表示する", () => {
    renderWithProvider(<HomeHero />);
    expect(
      screen.getByText("FROM A SMALL DINK TO A BIG MOVEMENT")
    ).toBeInTheDocument();
  });

  it("CTAボタン（RESERVE A COURT）が予約案内ページ(/reserve)にリンクする", () => {
    renderWithProvider(<HomeHero />);
    const cta = screen.getByRole("link", { name: /RESERVE A COURT/ });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/reserve");
    expect(cta).not.toHaveAttribute("target", "_blank");
  });

  it("CTAクリックで予約入口を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithProvider(<HomeHero />);

    await userEvent.click(screen.getByRole("link", { name: /RESERVE A COURT/ }));

    expect(trackCtaClick).toHaveBeenCalledWith("reserveEntry", "home_hero", "RESERVE A COURT");
  });

  it("スクロールインジケーター（SCROLL）を表示する", () => {
    renderWithProvider(<HomeHero />);
    expect(screen.getByText("SCROLL")).toBeInTheDocument();
  });

  it("ヒーロー写真を表示する", () => {
    renderWithProvider(<HomeHero />);
    const img = screen.getByAltText(
      jaMessages.HomeHero.heroImageAlt
    );
    expect(img).toBeInTheDocument();
  });

  it("ヒーロー背景に自施設の実写を使い、既定は縦構図にする", () => {
    renderWithProvider(<HomeHero />);
    const src = decodeURIComponent(
      screen.getByAltText(jaMessages.HomeHero.heroImageAlt).getAttribute("src") ??
        ""
    );
    expect(src).not.toContain("hero.jpg");
    expect(src).toContain("/images/facility-mobile.webp");
  });

  it("デスクトップ幅では横構図の画像に切り替える", () => {
    const { container } = renderWithProvider(<HomeHero />);
    const source = container.querySelector("picture > source");
    expect(source?.getAttribute("media")).toBe("(min-width: 768px)");
    expect(decodeURIComponent(source?.getAttribute("srcset") ?? "")).toContain(
      "/images/facility.webp"
    );
  });

  it("ヘッダー＋バナー分のパディングが設定されている", () => {
    const { container } = renderWithProvider(<HomeHero />);
    const section = container.querySelector("section");
    expect(section?.className).toContain("pt-[calc(100px+var(--promo-banner-h))]");
  });
});
