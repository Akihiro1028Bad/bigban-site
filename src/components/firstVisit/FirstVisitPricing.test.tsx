import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { COURT_PRICES } from "@/constants/pricing";
import FirstVisitPricing from "./FirstVisitPricing";

describe("FirstVisitPricing", () => {
  it("見出しと、1コート1時間の料金表(既存の料金定数)を表示する", () => {
    renderWithIntl(<FirstVisitPricing />);
    expect(
      screen.getByRole("heading", { level: 2, name: "料金の目安" }),
    ).toBeInTheDocument();
    for (const row of COURT_PRICES) {
      expect(screen.getAllByText(row.weekday).length).toBeGreaterThan(0);
      expect(screen.getAllByText(row.weekend).length).toBeGreaterThan(0);
    }
  });

  it("4人で割った1人あたりの表を出す", () => {
    renderWithIntl(<FirstVisitPricing />);
    const table = screen.getByRole("table", {
      name: "4人で割った1人あたり(1時間)",
    });
    expect(within(table).getByText("¥1,250")).toBeInTheDocument();
    expect(within(table).getByText("¥1,500")).toBeInTheDocument();
    expect(within(table).getAllByText("¥2,000").length).toBeGreaterThan(0);
  });

  it("4人は例であり人数上限の規定ではないと注記する", () => {
    renderWithIntl(<FirstVisitPricing />);
    expect(
      screen.getByText(/人数の上限を定めるものではありません/),
    ).toBeInTheDocument();
  });
});
