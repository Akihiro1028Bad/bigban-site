import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FirstVisitSection from "./FirstVisitSection";

describe("FirstVisitSection", () => {
  it("kicker と h2 見出しと子要素を表示する", () => {
    render(
      <FirstVisitSection id="demo" kicker="DEMO" heading="見出し">
        <p>本文</p>
      </FirstVisitSection>,
    );
    expect(screen.getByText("DEMO")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "見出し" }),
    ).toBeInTheDocument();
    expect(screen.getByText("本文")).toBeInTheDocument();
  });

  it("section が見出しで名前づけされ、id を持つ", () => {
    render(
      <FirstVisitSection id="demo" kicker="DEMO" heading="見出し">
        <p>本文</p>
      </FirstVisitSection>,
    );
    const section = screen.getByRole("region", { name: "見出し" });
    expect(section).toHaveAttribute("id", "demo");
  });
});
