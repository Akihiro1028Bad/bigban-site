import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxFacility from "./HyroxFacility";

describe("HyroxFacility", () => {
  it("FACILITY 見出しを表示する", () => {
    renderWithIntl(<HyroxFacility />);
    expect(
      screen.getByRole("heading", { name: "FACILITY" })
    ).toBeInTheDocument();
  });

  it("準備中の表示をする", () => {
    renderWithIntl(<HyroxFacility />);
    expect(screen.getByText("準備中")).toBeInTheDocument();
  });
});
