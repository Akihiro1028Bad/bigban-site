import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import {
  RESERVE_URL,
  LABOLA_PICKLEBALL_URL,
  LABOLA_HYROX_URL,
  LABOLA_SCHOOL_URL,
} from "@/constants/site";
import ReserveChoice from "./ReserveChoice";

const trackCtaClick = vi.fn();
const trackLabolaEntry = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
  trackLabolaEntry: (...args: unknown[]) => trackLabolaEntry(...args),
}));

describe("ReserveChoice", () => {
  it("利用月で予約先が分かれる案内文を表示する", () => {
    renderWithIntl(<ReserveChoice />);
    expect(screen.getByText(/予約サイトが異なります/)).toBeInTheDocument();
  });

  it("ピックルボールコート・HYROXエリア のセクション見出しを表示する", () => {
    renderWithIntl(<ReserveChoice />);
    expect(
      screen.getByRole("heading", { name: "ピックルボールコート" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "HYROXエリア" }),
    ).toBeInTheDocument();
  });

  it("HYROXセクション内をエリア利用とレッスン/クラスの2カテゴリに分ける", () => {
    renderWithIntl(<ReserveChoice />);
    expect(
      screen.getByRole("heading", { name: "エリア利用" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "レッスン / クラス" }),
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

  it("エリアの予約は labola（HYROXタブ）へ外部リンクする", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /エリアの予約/ });
    expect(link).toHaveAttribute("href", LABOLA_HYROX_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("レッスンの予約は labola（スクール）へ外部リンクする", () => {
    renderWithIntl(<ReserveChoice />);
    const link = screen.getByRole("link", { name: /レッスンの予約/ });
    expect(link).toHaveAttribute("href", LABOLA_SCHOOL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("4種類の外部予約クリックを reservation_click として計測する", async () => {
    trackCtaClick.mockClear();
    trackLabolaEntry.mockClear();
    renderWithIntl(<ReserveChoice />);

    await userEvent.click(screen.getByRole("link", { name: /7月末までの予約/ }));
    await userEvent.click(screen.getByRole("link", { name: /8月以降の予約/ }));
    await userEvent.click(screen.getByRole("link", { name: /エリアの予約/ }));
    await userEvent.click(screen.getByRole("link", { name: /レッスンの予約/ }));

    expect(trackCtaClick).toHaveBeenNthCalledWith(
      1,
      "reservation",
      "reserve_choice_july",
      "7月末までの予約",
    );
    expect(trackCtaClick).toHaveBeenNthCalledWith(
      2,
      "reservation",
      "reserve_choice_august",
      "8月以降の予約",
    );
    expect(trackCtaClick).toHaveBeenNthCalledWith(
      3,
      "reservation",
      "reserve_choice_hyrox_area",
      "エリアの予約",
    );
    expect(trackCtaClick).toHaveBeenNthCalledWith(
      4,
      "reservation",
      "reserve_choice_hyrox_lesson",
      "レッスンの予約",
    );
    expect(trackLabolaEntry).toHaveBeenNthCalledWith(1, "rental");
    expect(trackLabolaEntry).toHaveBeenNthCalledWith(2, "rental");
    expect(trackLabolaEntry).toHaveBeenNthCalledWith(3, "program");
    expect(trackLabolaEntry).toHaveBeenCalledTimes(3);
  });

  it("ユーザー向け文言にシステム名（RESERVA / labola）を露出しない", () => {
    const { container } = renderWithIntl(<ReserveChoice />);
    expect(container.textContent).not.toMatch(/RESERVA/i);
    expect(container.textContent).not.toMatch(/labola/i);
  });
});
