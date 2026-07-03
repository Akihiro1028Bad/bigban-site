import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import {
  RESERVE_URL,
  LABOLA_PICKLEBALL_URL,
  LABOLA_HYROX_URL,
} from "@/constants/site";
import ReserveChoice from "./ReserveChoice";

describe("ReserveChoice", () => {
  it("利用月で予約先が分かれる案内文を表示する", () => {
    renderWithIntl(<ReserveChoice />);
    expect(screen.getByText(/予約サイトが異なります/)).toBeInTheDocument();
  });

  it("ピックルボールコートと HYROXエリア のセクション見出しを表示する", () => {
    renderWithIntl(<ReserveChoice />);
    expect(
      screen.getByRole("heading", { name: "ピックルボールコート" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "HYROXエリア" }),
    ).toBeInTheDocument();
  });

  it("ピックル7月末までの予約は RESERVA へ外部リンクする", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /7月末までの予約/ });
    expect(link).toHaveAttribute("href", RESERVE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ピックル8月以降の予約は labola（ピックルタブ）へ外部リンクする", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /8月以降の予約/ });
    expect(link).toHaveAttribute("href", LABOLA_PICKLEBALL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("HYROXの予約は labola（HYROXタブ）へ外部リンクする", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /HYROXの予約/ });
    expect(link).toHaveAttribute("href", LABOLA_HYROX_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("ユーザー向け文言にシステム名（RESERVA / labola）を露出しない", () => {
    const { container } = renderWithIntl(<ReserveChoice />);
    expect(container.textContent).not.toMatch(/RESERVA/i);
    expect(container.textContent).not.toMatch(/labola/i);
  });
});
