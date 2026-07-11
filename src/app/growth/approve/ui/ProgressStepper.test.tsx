import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressStepper } from "./ProgressStepper";

describe("ProgressStepper", () => {
  it("現在地点と完了済みステップを表す", () => {
    render(<ProgressStepper label="施策進捗" steps={["提案", "承認", "成果物化", "実行中", "実行済み"]} currentIndex={2} />);
    expect(screen.getByLabelText("施策進捗")).toBeInTheDocument();
    expect(screen.getByText("成果物化")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("提案").parentElement).toHaveAttribute("data-complete", "true");
  });
});
