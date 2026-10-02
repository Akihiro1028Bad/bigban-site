import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubRates from "./PbtClubRates";

describe("PbtClubRates", () => {
  it("列見出しと4行(通常・会員・差額)を表示する", () => {
    renderWithIntl(<PbtClubRates />);
    expect(
      screen.getByRole("heading", { level: 2, name: "会員料金表" }),
    ).toBeInTheDocument();
    for (const name of ["時間帯", "通常料金", "PBT CLUB会員", "1時間の差額"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(5); // 見出し + 4行
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(cells(rows[3])).toEqual([
      "平日 17:00-23:00 / 土日祝 6:00-23:00",
      "¥7,980",
      "¥5,600",
      "¥2,380",
    ]);
    // 深夜帯(23:00-25:00)
    expect(cells(rows[4])).toEqual(["平日 23:00-25:00", "¥3,980", "¥2,800", "¥1,180"]);
    expect(cells(rows[2])[0]).toBe("平日 9:00-17:00 / 土日祝 23:00-25:00");
  });

  it("コート・HYROX 共通の注記を表示する", () => {
    renderWithIntl(<PbtClubRates />);
    expect(
      screen.getByText("ピックルボールコート／HYROXエリア共通（1時間あたり・税込）"),
    ).toBeInTheDocument();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubRates />, { locale: "en" });
    expect(screen.getByRole("columnheader", { name: "Regular rate" })).toBeInTheDocument();
  });
});
