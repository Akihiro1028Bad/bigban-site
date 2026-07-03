import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxStations from "./HyroxStations";

describe("HyroxStations", () => {
  it("8種目すべての名称を表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByText("SkiErg")).toBeInTheDocument();
    expect(screen.getByText("Wall Balls")).toBeInTheDocument();
    expect(screen.getByText("08")).toBeInTheDocument();
  });

  it("各種目を写真付きで表示する（8枚）", () => {
    const { container } = renderWithIntl(<HyroxStations />);
    expect(container.querySelectorAll("img")).toHaveLength(8);
  });
});
