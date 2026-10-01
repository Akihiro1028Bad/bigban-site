import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { renderWithIntl } from "@/test-utils/intl-wrapper";
import ReserveEnglishGuide from "./ReserveEnglishGuide";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, onClick, ...props }: Record<string, unknown>) => (
    <a href={href as string} onClick={onClick as React.MouseEventHandler} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("ReserveEnglishGuide", () => {
  it("LaBOLA とテニスベアが日本語のみであることを明記する", () => {
    renderWithIntl(<ReserveEnglishGuide />, { locale: "en" });
    expect(
      screen.getByRole("heading", { name: "Booking in English" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/are in Japanese only/)).toBeInTheDocument();
  });

  it("手順はビジター予約の案内に任せ、支払い方法とキャンセル方針だけを案内する", () => {
    renderWithIntl(<ReserveEnglishGuide />, { locale: "en" });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: /Payment and cancellation/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/credit card or PayPay/)).toBeInTheDocument();
  });

  it("テニスベアの案内を出す", () => {
    renderWithIntl(<ReserveEnglishGuide />, { locale: "en" });
    expect(
      screen.getByRole("heading", { name: /Tennis Bear/ }),
    ).toBeInTheDocument();
  });

  it("問い合わせフォームと Instagram へのリンクを出し、Instagram のクリックを計測する", () => {
    trackCtaClick.mockClear();
    renderWithIntl(<ReserveEnglishGuide />, { locale: "en" });
    const contact = screen.getByRole("link", { name: "Contact form" });
    expect(contact).toHaveAttribute("href", "/about#contact");
    const instagram = screen.getByRole("link", { name: "Instagram" });
    expect(instagram).toHaveAttribute(
      "href",
      "https://www.instagram.com/thepicklebangtheory",
    );
    fireEvent.click(instagram);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "instagram",
      "reserve_english_guide",
      "dm",
    );
  });
});
