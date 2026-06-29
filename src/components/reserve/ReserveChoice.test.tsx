import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { RESERVE_URL, LABOLA_RESERVE_URL } from "@/constants/site";
import ReserveChoice from "./ReserveChoice";

describe("ReserveChoice", () => {
  it("利用月で予約先が分かれる案内文を表示する", () => {
    renderWithIntl(<ReserveChoice />);
    expect(screen.getByText(/予約サイトが異なります/)).toBeInTheDocument();
  });

  it("7月までの予約は RESERVA へ外部リンクする（文言にシステム名は出さない）", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /7月までを予約する/ });
    expect(link).toHaveAttribute("href", RESERVE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("8月以降の予約は labola へ外部リンクする（文言にシステム名は出さない）", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /8月以降を予約する/ });
    expect(link).toHaveAttribute("href", LABOLA_RESERVE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ユーザー向け文言にシステム名（RESERVA / labola）を露出しない", () => {
    const { container } = renderWithIntl(<ReserveChoice />);
    expect(container.textContent).not.toMatch(/RESERVA/i);
    expect(container.textContent).not.toMatch(/labola/i);
  });
});
