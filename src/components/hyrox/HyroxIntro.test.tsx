import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxIntro from "./HyroxIntro";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("HyroxIntro", () => {
  it("WHAT IS HYROX 見出しを表示する", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.getByRole("heading", { name: "WHAT IS HYROX" })).toBeInTheDocument();
  });

  it("キーナンバー表示は出さない", () => {
    renderWithIntl(<HyroxIntro />);
    expect(screen.queryByText("KM RUN")).not.toBeInTheDocument();
    expect(screen.queryByText("WORKOUTS")).not.toBeInTheDocument();
    expect(screen.queryByText("RACE")).not.toBeInTheDocument();
  });

  it("showColumnLink 時、入門コラムへの内部リンクを「ハイロックス」を含むアンカーテキストで表示する", () => {
    renderWithIntl(<HyroxIntro showColumnLink />);
    const link = screen.getByRole("link", { name: /ハイロックスとは/ });
    expect(link).toHaveAttribute("href", "/columns/hyrox-beginners-guide");
  });

  it("showColumnLink 未指定(コラム CMS 無効)ではコラムリンクを出さない", () => {
    renderWithIntl(<HyroxIntro />);
    expect(
      screen.queryByRole("link", { name: /ハイロックスとは/ }),
    ).not.toBeInTheDocument();
  });

  it("英語ロケールでもコラムへの内部リンクを表示する", () => {
    renderWithIntl(<HyroxIntro showColumnLink />, { locale: "en" });
    const link = screen.getByRole("link", { name: /HYROX/ });
    expect(link).toHaveAttribute("href", "/columns/hyrox-beginners-guide");
  });

  it("コラムリンクのクリックを content_click として計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HyroxIntro showColumnLink />);
    await userEvent.click(screen.getByRole("link", { name: /ハイロックスとは/ }));
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_what_is",
      "column_beginners_guide",
    );
  });
});
