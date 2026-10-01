import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubFit from "./PbtClubFit";

describe("PbtClubFit", () => {
  it("向いている方の4項目を表示する", () => {
    renderWithIntl(<PbtClubFit />);
    expect(
      screen.getByRole("heading", { level: 2, name: "向いている方・通常料金が合う方" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "PBT CLUBが向いている方" }),
    ).toBeInTheDocument();
    for (const text of [
      "定期的にご利用される方",
      "人気の時間帯を優先的に予約したい方",
      "ピックルボール・HYROXを継続的に楽しみたい方",
      "お得な料金で何度も利用したい方",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("通常料金が合う方を、損益分岐(平日夜・土日祝)の1時間手前から計算して示す", () => {
    renderWithIntl(<PbtClubFit />);
    expect(
      screen.getByRole("heading", { level: 3, name: "通常料金のほうが合う方" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "平日夜・土日祝の利用が月4時間以下の方（会費を含めると通常料金のほうが安くなります）",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("会員料金の適用は月20時間までです。")).toBeInTheDocument();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubFit />, { locale: "en" });
    expect(screen.getByText("Play regularly")).toBeInTheDocument();
    expect(
      screen.getByText(/Play 4 hours or less a month on weekday evenings/),
    ).toBeInTheDocument();
  });
});
