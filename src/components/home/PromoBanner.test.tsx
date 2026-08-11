import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import PromoBanner from "./PromoBanner";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("PromoBanner", () => {
  it("PBT CLUB 会員制度の文言を表示する", () => {
    renderWithIntl(<PromoBanner />, "ja");
    expect(
      screen.getByText(jaMessages.PromoBanner.textPbtClub)
    ).toBeInTheDocument();
  });

  it("英語ロケールでも PBT CLUB の文言を表示する", () => {
    renderWithIntl(<PromoBanner />, "en");
    expect(
      screen.getByText(enMessages.PromoBanner.textPbtClub)
    ).toBeInTheDocument();
  });

  it("会員制度のニュース記事にリンクする", () => {
    renderWithIntl(<PromoBanner />, "ja");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/news/pbt-club-membership");
    expect(link).not.toHaveAttribute("target", "_blank");
  });

  it("リンク先を説明する aria-label を持つ", () => {
    renderWithIntl(<PromoBanner />, "ja");
    expect(screen.getByRole("link")).toHaveAttribute(
      "aria-label",
      jaMessages.PromoBanner.ariaLabelPbtClub
    );
  });
});
