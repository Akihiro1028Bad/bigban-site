import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { renderWithIntl } from "@/test-utils/intl-wrapper";
import enMessages from "../../../messages/en.json";
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

  it("LaBOLA の手順を4ステップの順序つきリストで出し、ビジター予約と支払いを案内する", () => {
    renderWithIntl(<ReserveEnglishGuide />, { locale: "en" });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText(/ビジターで予約/)).toBeInTheDocument();
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

  it("steps が配列でない場合は手順を描画しない", () => {
    const broken = JSON.parse(JSON.stringify(enMessages)) as typeof enMessages;
    (broken.Reserve.englishGuide as unknown as { steps: unknown }).steps =
      "not-an-array";
    render(
      <NextIntlClientProvider locale="en" messages={broken}>
        <ReserveEnglishGuide />
      </NextIntlClientProvider>,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("形の崩れた要素は読み飛ばし、正しい要素だけを描画する", () => {
    const broken = JSON.parse(JSON.stringify(enMessages)) as typeof enMessages;
    (broken.Reserve.englishGuide as unknown as { steps: unknown }).steps = [
      "text",
      null,
      { title: 1, body: "x" },
      { title: "a", body: 2 },
      { title: "ok", body: "fine" },
    ];
    render(
      <NextIntlClientProvider locale="en" messages={broken}>
        <ReserveEnglishGuide />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});
