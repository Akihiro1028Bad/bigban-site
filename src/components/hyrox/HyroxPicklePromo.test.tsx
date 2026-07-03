import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxPicklePromo from "./HyroxPicklePromo";

import type React from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("HyroxPicklePromo", () => {
  it("PICKLEBALL 見出しと日本語併記を表示する", () => {
    renderWithIntl(<HyroxPicklePromo />);
    expect(
      screen.getByRole("heading", { name: "PICKLEBALL" })
    ).toBeInTheDocument();
    expect(screen.getByText("ピックルボール")).toBeInTheDocument();
  });

  it("CTA がホーム（ピックル）へのリンク", () => {
    renderWithIntl(<HyroxPicklePromo />);
    const link = screen.getByRole("link", { name: /ピックルボールを見る/ });
    expect(link).toHaveAttribute("href", "/");
  });
});
