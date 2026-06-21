import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxServices from "./HyroxServices";

import type React from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("HyroxServices", () => {
  it("SERVICES 見出しを表示する", () => {
    renderWithIntl(<HyroxServices />);
    expect(
      screen.getByRole("heading", { name: "SERVICES" })
    ).toBeInTheDocument();
  });

  it("3つのサービス（英字＋日本語）を表示する", () => {
    renderWithIntl(<HyroxServices />);
    expect(screen.getByText("AREA RENTAL")).toBeInTheDocument();
    expect(screen.getByText("TRIAL")).toBeInTheDocument();
    expect(screen.getByText("GROUP SESSION")).toBeInTheDocument();
    expect(screen.getByText("時間制レンタル")).toBeInTheDocument();
    expect(screen.getByText("体験・トライアル")).toBeInTheDocument();
    expect(screen.getByText("グループセッション")).toBeInTheDocument();
  });

  it("各サービスに予約ページ(/reserve)への内部リンクを表示する", () => {
    renderWithIntl(<HyroxServices />);
    const links = screen.getAllByRole("link", { name: /RESERVE/ });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/reserve");
    expect(links[0]).not.toHaveAttribute("target");
  });
});
