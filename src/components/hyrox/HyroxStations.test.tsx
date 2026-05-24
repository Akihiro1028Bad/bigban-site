import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxStations from "./HyroxStations";

describe("HyroxStations", () => {
  it("8 STATIONS 見出しを表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByRole("heading", { name: "8 STATIONS" })).toBeInTheDocument();
  });

  it("8種目すべての名称を表示する", () => {
    renderWithIntl(<HyroxStations />);
    expect(screen.getByText("SkiErg")).toBeInTheDocument();
    expect(screen.getByText("Wall Balls")).toBeInTheDocument();
    expect(screen.getByText("08")).toBeInTheDocument();
  });
});
