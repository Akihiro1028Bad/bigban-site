import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemographicsPanel } from "./DemographicsPanel";

describe("DemographicsPanel", () => {
  it("統合済みの年代・性別を重複なく表示する", () => {
    render(<DemographicsPanel demographics={[{ label: "30代 女性", count: 5 }]} />);
    expect(screen.getAllByText("30代 女性")).toHaveLength(1);
    expect(screen.getByText("5人")).toBeVisible();
  });
});
