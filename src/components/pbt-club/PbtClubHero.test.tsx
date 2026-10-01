import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { LABOLA_MEMBER_TYPES_URL } from "@/constants/pbtClub";
import PbtClubHero from "./PbtClubHero";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("PbtClubHero", () => {
  beforeEach(() => trackCtaClick.mockClear());

  it("h1 に PBT CLUB を表示する", () => {
    renderWithIntl(<PbtClubHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: "PBT CLUB" }),
    ).toBeInTheDocument();
  });

  it("月会費と会員料金のレンジ、差額・上限を含む説明を表示する", () => {
    renderWithIntl(<PbtClubHero />);
    expect(screen.getByText("¥10,000")).toBeInTheDocument();
    expect(screen.getByText("¥2,800〜¥5,600")).toBeInTheDocument();
    expect(
      screen.getByText(/1時間あたり ¥1,180〜¥2,380 安くなります。会員料金の適用は月20時間までです。/),
    ).toBeInTheDocument();
  });

  it("入会リンクは LaBOLA の入会ページへ別タブで開く", () => {
    renderWithIntl(<PbtClubHero />);
    const link = screen.getByRole("link", { name: "PBT CLUBに入会する" });
    expect(link).toHaveAttribute("href", LABOLA_MEMBER_TYPES_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("入会リンクのクリックを externalLink として計測する", async () => {
    renderWithIntl(<PbtClubHero />);
    await userEvent.click(
      screen.getByRole("link", { name: "PBT CLUBに入会する" }),
    );
    expect(trackCtaClick).toHaveBeenCalledWith(
      "externalLink",
      "pbt_club_join_hero",
      "PBT CLUBに入会する",
    );
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubHero />, { locale: "en" });
    expect(screen.getByText("Monthly membership")).toBeInTheDocument();
    expect(screen.getByText("¥2,800〜¥5,600")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Join PBT CLUB" }),
    ).toBeInTheDocument();
  });
});
