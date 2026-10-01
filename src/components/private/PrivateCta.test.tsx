import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import PrivateCta, { PRIVATE_CONTACT_HREF } from "./PrivateCta";
import jaMessages from "../../../messages/ja.json";

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

describe("PrivateCta", () => {
  it("種別をプリセレクトするフォームへのリンクを出す", () => {
    expect(PRIVATE_CONTACT_HREF).toBe("/about?category=private#contact");
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <PrivateCta />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "お問い合わせフォームへ" }),
    ).toHaveAttribute("href", PRIVATE_CONTACT_HREF);
    expect(screen.getByText("ご希望の日時・ご人数・ご利用目的をご記入ください。")).toBeInTheDocument();
  });

  it("クリックで content_click(location=private_cta)を計測する", async () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <PrivateCta />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("link", { name: "お問い合わせフォームへ" }));
    expect(trackCtaClick).toHaveBeenCalledWith("contentClick", "private_cta", "contact");
  });
});
