import { describe, it, expect, vi } from "vitest";
import { forwardRef } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeHero from "./HomeHero";

import type { ReactElement } from "react";

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

  it("CTAボタン（RESERVE A COURT）が内部予約ページにリンクする", () => {
    renderWithProvider(<HomeHero />);
    const cta = screen.getByRole("link", { name: /RESERVE A COURT/ });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/reserve");
  });

  it("スクロールインジケーター（SCROLL）を表示する", () => {
    renderWithProvider(<HomeHero />);
    expect(screen.getByText("SCROLL")).toBeInTheDocument();
  });

  it("ヒーロー写真を表示する", () => {
    renderWithProvider(<HomeHero />);
    const img = screen.getByAltText(/ピックルボールをプレーする選手/);
    expect(img).toBeInTheDocument();
  });

  it("ヘッダー＋バナー分のパディングが設定されている", () => {
    const { container } = renderWithProvider(<HomeHero />);
    const section = container.querySelector("section");
    expect(section?.className).toContain("pt-[calc(100px+var(--promo-banner-h))]");
  });
});
