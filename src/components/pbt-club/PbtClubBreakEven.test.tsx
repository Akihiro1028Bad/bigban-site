import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubBreakEven from "./PbtClubBreakEven";

describe("PbtClubBreakEven", () => {
  it("時間帯ごとの損益分岐を整数時間(切り上げ)で表示する", () => {
    renderWithIntl(<PbtClubBreakEven />);
    expect(
      screen.getByRole("heading", { level: 2, name: "月何時間で元が取れる？" }),
    ).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(cards).toEqual([
      "平日 6:00-9:00月7時間以上で元が取れる損益分岐 約6.8時間",
      "平日 9:00-17:00 / 土日祝 23:00-25:00月6時間以上で元が取れる損益分岐 約5.6時間",
      "平日 17:00-23:00 / 土日祝 6:00-23:00月5時間以上で元が取れる損益分岐 約4.2時間",
      "平日 23:00-25:00月9時間以上で元が取れる損益分岐 約8.5時間",
    ]);
  });

  it("正確な損益分岐(約X.X時間)を補足として表示する", () => {
    renderWithIntl(<PbtClubBreakEven />);
    expect(screen.getByText("損益分岐 約8.5時間")).toBeInTheDocument();
    expect(screen.getByText("損益分岐 約4.2時間")).toBeInTheDocument();
  });

  it("計算式と注記(ポイント・レンタル除外、月20時間上限)を表示する", () => {
    renderWithIntl(<PbtClubBreakEven />);
    expect(screen.getByText(/月会費 ÷（通常料金 − 会員料金）/)).toBeInTheDocument();
    expect(screen.getByText(/レンタル用品・ポイント還元は含めていません/)).toBeInTheDocument();
    expect(screen.getByText(/会員料金の適用は月20時間までです/)).toBeInTheDocument();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubBreakEven />, { locale: "en" });
    expect(screen.getByText("5+ hours a month")).toBeInTheDocument();
    expect(screen.getByText("Break-even: about 4.2 hours")).toBeInTheDocument();
    expect(screen.getByText("9+ hours a month")).toBeInTheDocument();
    expect(
      screen.getByText("Weekdays 17:00-23:00 / Weekends/holidays 6:00-23:00"),
    ).toBeInTheDocument();
  });
});
