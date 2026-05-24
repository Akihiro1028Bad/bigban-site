import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しと Coming Soon を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });

  it("注記文を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(
      screen.getByText("プログラム・料金は準備中です。詳細が決まり次第お知らせします。"),
    ).toBeInTheDocument();
  });
});
