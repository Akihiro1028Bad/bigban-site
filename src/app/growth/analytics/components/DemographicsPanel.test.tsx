import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemographicsPanel } from "./DemographicsPanel";

describe("DemographicsPanel", () => {
  it("年代・性別の分布を表示する", () => { render(<DemographicsPanel demographics={[{ label: "30代 女性", count: 4 }]} />); expect(screen.getByText("30代 女性")).toBeVisible(); expect(screen.getByText("4人")).toBeVisible(); });
  it("空なら収集中を表示する", () => { render(<DemographicsPanel demographics={[]} />); expect(screen.getByText("顧客分布データを収集中です。")).toBeVisible(); });
});
