import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { BEGINNER_GUIDE_PATH } from "@/constants/firstVisit";
import { RESERVE_PATH } from "@/constants/site";
import FirstVisitHero from "./FirstVisitHero";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("FirstVisitHero", () => {
  beforeEach(() => trackCtaClick.mockClear());

  it("h1 と結論先出しのリード文を表示する", () => {
    renderWithIntl(<FirstVisitHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: "はじめての方へ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("FIRST VISIT")).toBeInTheDocument();
    expect(
      screen.getByText(/全員初心者のグループでも楽しめます/),
    ).toBeInTheDocument();
  });

  it("ルール確認の導線がコラムを指す", () => {
    renderWithIntl(<FirstVisitHero />);
    expect(screen.getByText("ルールは事前に確認できます。")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ピックルボールの始め方を読む" }),
    ).toHaveAttribute("href", BEGINNER_GUIDE_PATH);
  });

  it("予約 CTA が予約案内を指し、クリックを計測する", async () => {
    renderWithIntl(<FirstVisitHero />);
    const cta = screen.getByRole("link", { name: "コートを予約する" });
    expect(cta).toHaveAttribute("href", RESERVE_PATH);
    await userEvent.click(cta);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reserveEntry",
      "first_visit_hero",
      "コートを予約する",
    );
  });

  it("英語でも描画できる", () => {
    renderWithIntl(<FirstVisitHero />, { locale: "en" });
    expect(
      screen.getByRole("heading", { level: 1, name: "First Visit" }),
    ).toBeInTheDocument();
  });
});
