import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MetricChips } from "./MetricChips";

describe("MetricChips", () => {
  it("details をラベル＋値のチップで描く", () => {
    render(
      <MetricChips
        details={[
          { label: "優先度スコア", value: "8.5" },
          { label: "確度", value: "高" },
        ]}
      />,
    );
    expect(screen.getByText("優先度スコア")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("確度")).toBeInTheDocument();
    expect(screen.getByText("高")).toBeInTheDocument();
  });

  it("空/未定義なら何も描かない", () => {
    const { container: empty } = render(<MetricChips details={[]} />);
    expect(empty).toBeEmptyDOMElement();
    const { container: undef } = render(<MetricChips />);
    expect(undef).toBeEmptyDOMElement();
  });
});
