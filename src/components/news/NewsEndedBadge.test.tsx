import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NewsEndedBadge } from "./NewsEndedBadge";

describe("NewsEndedBadge", () => {
  it("日本語は「終了」", () => {
    render(<NewsEndedBadge locale="ja" />);
    expect(screen.getByText("終了")).toBeInTheDocument();
  });

  it("英語は Ended", () => {
    render(<NewsEndedBadge locale="en" />);
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("className を追加できる", () => {
    render(<NewsEndedBadge locale="ja" className="extra" />);
    expect(screen.getByText("終了")).toHaveClass("extra");
  });
});
