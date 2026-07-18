import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaceCurvePanel } from "./PaceCurvePanel";

describe("PaceCurvePanel", () => {
  it("旧データでは収集中を表示する", () => {
    render(<PaceCurvePanel view={null} />);
    expect(screen.getByRole("heading", { name: "ペースカーブ" })).toBeVisible();
    expect(screen.getByText("収集中")).toBeVisible();
  });

  it("各日数の件数・基準・二本のバーと履歴注記を表示する", () => {
    const { container } = render(<PaceCurvePanel view={{ state: "collecting", points: [{ daysOut: 7, current: 12, baseline: 10, pct: 120, currentWidthPct: 100, baselineWidthPct: 83 }, { daysOut: 14, current: 2, baseline: null, pct: null, currentWidthPct: 17, baselineWidthPct: 0 }] }} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("+7日 12件");
    expect(screen.getByText("基準 10件(120%)")).toBeVisible();
    expect(screen.getByText("基準 収集中")).toBeVisible();
    expect(screen.getByText("基準は履歴6週で表示されます")).toBeVisible();
    expect(container.querySelectorAll(".analytics-pace-current-bar")[1]).toHaveStyle({ width: "17%" });
    expect(container.querySelectorAll(".analytics-pace-baseline-bar")[0]).toHaveStyle({ width: "83%" });
  });

  it("基準が0件のときは比率を出さず件数だけ表示する", () => {
    render(<PaceCurvePanel view={{ state: "ready", points: [{ daysOut: 7, current: 3, baseline: 0, pct: null, currentWidthPct: 100, baselineWidthPct: 0 }] }} />);
    expect(screen.getByText("基準 0件")).toBeVisible();
  });

  it("基準がそろったら履歴注記を表示しない", () => {
    render(<PaceCurvePanel view={{ state: "ready", points: [{ daysOut: 7, current: 3, baseline: 2, pct: 150, currentWidthPct: 100, baselineWidthPct: 67 }] }} />);
    expect(screen.queryByText("基準は履歴6週で表示されます")).toBeNull();
  });

  it("点がないときは収集中と区別してデータなしを表示する", () => {
    render(<PaceCurvePanel view={{ state: "collecting", points: [] }} />);

    expect(screen.getByText("データなし")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("基準は履歴6週で表示されます")).toBeNull();
  });
});
