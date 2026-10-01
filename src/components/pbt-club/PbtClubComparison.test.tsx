import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubComparison from "./PbtClubComparison";

describe("PbtClubComparison", () => {
  it("公開記事と同じ 4/5/8 時間の比較を表示する", () => {
    renderWithIntl(<PbtClubComparison />);
    expect(
      screen.getByRole("heading", { level: 2, name: "月の支払額の比較" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ["4時間", "¥31,920", "¥32,400", "通常利用が¥480安い"],
      ["5時間", "¥39,900", "¥38,000", "会員利用が¥1,900安い"],
      ["8時間", "¥63,840", "¥54,800", "会員利用が¥9,040安い"],
    ]);
  });

  it("前提(平日17時以降・土日祝、1時間の料金、レンタル・ポイント除外)を明記する", () => {
    renderWithIntl(<PbtClubComparison />);
    expect(
      screen.getByText(
        "平日17:00〜23:00、または土日祝の6:00〜23:00に利用する場合の例です。通常料金は1時間 ¥7,980、会員料金は1時間 ¥5,600 で計算しています。レンタル用品等は含めず、ポイント還元も差し引いていません。",
      ),
    ).toBeInTheDocument();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubComparison />, { locale: "en" });
    expect(screen.getByText("Membership is ¥1,900 cheaper")).toBeInTheDocument();
    expect(screen.getByText("Regular is ¥480 cheaper")).toBeInTheDocument();
  });
});
