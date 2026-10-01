import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { LABOLA_MEMBER_TYPES_URL } from "@/constants/pbtClub";
import { RESERVE_PATH } from "@/constants/site";
import PbtClubJoinCta from "./PbtClubJoinCta";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("PbtClubJoinCta", () => {
  beforeEach(() => trackCtaClick.mockClear());

  it("入会リンク(LaBOLA)と予約ページへの副導線を表示する", () => {
    renderWithIntl(<PbtClubJoinCta />);
    expect(
      screen.getByRole("heading", { level: 2, name: "入会する" }),
    ).toBeInTheDocument();
    const join = screen.getByRole("link", { name: "PBT CLUBに入会する" });
    expect(join).toHaveAttribute("href", LABOLA_MEMBER_TYPES_URL);
    expect(join).toHaveAttribute("target", "_blank");
    expect(join).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "コートを予約する" })).toHaveAttribute(
      "href",
      RESERVE_PATH,
    );
  });

  it("クリックをそれぞれ計測する", async () => {
    renderWithIntl(<PbtClubJoinCta />);
    await userEvent.click(screen.getByRole("link", { name: "PBT CLUBに入会する" }));
    expect(trackCtaClick).toHaveBeenLastCalledWith(
      "externalLink",
      "pbt_club_join_bottom",
      "PBT CLUBに入会する",
    );
    await userEvent.click(screen.getByRole("link", { name: "コートを予約する" }));
    expect(trackCtaClick).toHaveBeenLastCalledWith(
      "reserveEntry",
      "pbt_club_reserve",
      "コートを予約する",
    );
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubJoinCta />, { locale: "en" });
    expect(screen.getByRole("link", { name: "Join PBT CLUB" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a court" })).toBeInTheDocument();
  });
});
