import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しを表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
  });

  it("HYROX エリア利用料（1時間 ¥2,980）を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByText("エリア利用料")).toBeInTheDocument();
    expect(screen.getByText("¥2,980")).toBeInTheDocument();
    expect(screen.getByText("／ 1時間")).toBeInTheDocument();
  });

  it("ピックルのコートレンタル料金表は表示しない", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.queryByText("¥4,980")).not.toBeInTheDocument();
  });
});
