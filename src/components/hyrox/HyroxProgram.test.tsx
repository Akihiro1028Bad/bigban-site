import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しを表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
  });

  it("料金テーブル（コートレンタル）を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByText("COURT RENTAL")).toBeInTheDocument();
    expect(screen.getByText("6:00-9:00")).toBeInTheDocument();
    expect(screen.getByText("¥4,980")).toBeInTheDocument();
  });
});
