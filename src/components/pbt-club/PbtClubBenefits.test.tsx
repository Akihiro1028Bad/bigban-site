import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import PbtClubBenefits from "./PbtClubBenefits";

describe("PbtClubBenefits", () => {
  it("3つの特典を表示する(日本語)", () => {
    renderWithIntl(<PbtClubBenefits />);
    expect(
      screen.getByRole("heading", { level: 2, name: "3つの特典" }),
    ).toBeInTheDocument();
    expect(screen.getByText("コート利用料金が約30%OFF")).toBeInTheDocument();
    expect(screen.getByText("30日前から先行予約")).toBeInTheDocument();
    expect(screen.getByText("PBTポイント2倍付与")).toBeInTheDocument();
  });

  it("差額・予約開始日・ポイント還元率を確定値から表示する", () => {
    renderWithIntl(<PbtClubBenefits />);
    expect(screen.getByText(/1時間あたり ¥1,180〜¥2,380 です/)).toBeInTheDocument();
    expect(
      screen.getByText(/一般予約は14日前から、会員は30日前から予約できます/),
    ).toBeInTheDocument();
    expect(screen.getByText(/ご利用料金の2%を還元します/)).toBeInTheDocument();
  });

  it("英語ロケールでも描画できる", () => {
    renderWithIntl(<PbtClubBenefits />, { locale: "en" });
    expect(screen.getByText("Book 30 days ahead")).toBeInTheDocument();
    expect(screen.getByText(/We return 2% of what you spend/)).toBeInTheDocument();
  });
});
