import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubRates from "./PbtClubRates";

describe("PbtClubRates", () => {
  it("列見出しと3行(通常・会員・差額)を表示する", () => {
    renderWithIntl(<PbtClubRates />);
    expect(
      screen.getByRole("heading", { level: 2, name: "会員料金表" }),
    ).toBeInTheDocument();
    for (const name of ["時間帯", "通常料金", "PBT CLUB会員", "1時間の差額"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4); // 見出し + 3行
    const peak = within(rows[3]).getAllByRole("cell");
    expect(peak.map((c) => c.textContent)).toEqual([
      "平日 17:00-23:00 / 土日祝 終日",
      "¥7,980",
      "¥5,600",
      "¥2,380",
    ]);
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
