import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemandHeatmap } from "./DemandHeatmap";

describe("DemandHeatmap", () => {
  it("曜日と時間帯のグリッドにセル値と強度を表示する", () => {
    render(<DemandHeatmap cells={[
      { dow: 0, slot: "6-9", count: 4, intensity: 4 },
      { dow: 6, slot: "21-23", count: 1, intensity: 1 },
    ]} />);

    expect(screen.getByRole("table", { name: "曜日と時間帯ごとの予約需要" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "月" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "日" })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "6–9時" })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: "21–23時" })).toBeVisible();
    expect(screen.getByText("4件").closest("td")).toHaveClass("intensity-4");
    expect(screen.getByText("1件").closest("td")).toHaveClass("intensity-1");
    expect(screen.getAllByText("0件")).toHaveLength(40);
  });

  it("空なら収集中を表示する", () => {
    render(<DemandHeatmap cells={[]} />);
    expect(screen.getByText("需要データを収集中です。")).toBeVisible();
  });
});
