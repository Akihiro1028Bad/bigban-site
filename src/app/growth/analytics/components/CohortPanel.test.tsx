import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CohortPanel } from "./CohortPanel";

describe("CohortPanel", () => {
  it("旧データでは収集中、空データではデータなしを表示する", () => {
    const { rerender } = render(<CohortPanel cohorts={null} />);
    expect(screen.getByText("収集中")).toBeVisible();
    rerender(<CohortPanel cohorts={[]} />);
    expect(screen.getByText("データなし")).toBeVisible();
  });

  it("月別コホートを見出し付きテーブルと注記で表示する", () => {
    render(<CohortPanel cohorts={[{ month: "2026-07", customers: 3, repeatText: "2/3人", revenueText: "¥12,000" }]} />);
    expect(screen.getByRole("columnheader", { name: "初回月" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "2026-07" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "2/3人" })).toBeVisible();
    expect(screen.getByText("コホート売上は予約金額ベースのため、売上サマリとは一致しません。")).toBeVisible();
  });
});
