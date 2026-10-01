import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { HYROX_PATH, PBT_CLUB_LINK_PATH } from "@/constants/firstVisit";
import { RESERVE_PATH } from "@/constants/site";
import FirstVisitNext from "./FirstVisitNext";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("FirstVisitNext", () => {
  beforeEach(() => trackCtaClick.mockClear());

  it("予約・HYROX・PBT CLUB の3つの入口を正しいリンク先で出す", () => {
    renderWithIntl(<FirstVisitNext />);
    expect(
      screen.getByRole("heading", { level: 2, name: "次の一歩" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /予約案内へ/ })).toHaveAttribute(
      "href",
      RESERVE_PATH,
    );
    expect(screen.getByRole("link", { name: /HYROX を見る/ })).toHaveAttribute(
      "href",
      HYROX_PATH,
    );
    expect(
      screen.getByRole("link", { name: /PBT CLUB を見る/ }),
    ).toHaveAttribute("href", PBT_CLUB_LINK_PATH);
  });

  it("予約への入口のクリックを計測する", async () => {
    renderWithIntl(<FirstVisitNext />);
    await userEvent.click(screen.getByRole("link", { name: /予約案内へ/ }));
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reserveEntry",
      "first_visit_next",
      "予約案内へ",
    );
  });

  it("予約以外の入口は予約として計測しない", async () => {
    renderWithIntl(<FirstVisitNext />);
    await userEvent.click(screen.getByRole("link", { name: /HYROX を見る/ }));
    expect(trackCtaClick).not.toHaveBeenCalled();
  });
});
