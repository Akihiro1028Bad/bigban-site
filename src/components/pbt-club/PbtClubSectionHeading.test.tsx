import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PbtClubSectionHeading from "./PbtClubSectionHeading";

describe("PbtClubSectionHeading", () => {
  it("英字ラベルと見出し(h2)を表示する", () => {
    render(<PbtClubSectionHeading label="BENEFITS" title="3つの特典" />);
    expect(screen.getByText("BENEFITS")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "3つの特典" }),
    ).toBeInTheDocument();
  });
});
