import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HomeHyroxPromo from "./HomeHyroxPromo";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

describe("HomeHyroxPromo", () => {
  it("HYROX 見出しと CTA を表示する", () => {
    renderWithIntl(<HomeHyroxPromo />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("詳しく見る")).toBeInTheDocument();
  });

  it("CTA が /hyrox へのリンク", () => {
    renderWithIntl(<HomeHyroxPromo />);
    const link = screen.getByRole("link", { name: /詳しく見る/ });
    expect(link).toHaveAttribute("href", "/hyrox");
  });

  it("CTAクリックを content_click として計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HomeHyroxPromo />);

    await userEvent.click(screen.getByRole("link", { name: /詳しく見る/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_hyrox_promo",
      "hyrox",
    );
  });

  it("英語ロケールでは CTA が英語になる", () => {
    renderWithIntl(<HomeHyroxPromo />, { locale: "en" });
    const link = screen.getByRole("link", { name: /DISCOVER HYROX/ });
    expect(link).toHaveAttribute("href", "/hyrox");
  });
});
