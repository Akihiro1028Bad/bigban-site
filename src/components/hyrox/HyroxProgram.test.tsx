import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しを表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
  });

  it("エリア利用料・90分・平日/土日祝の料金を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByText("エリア利用料")).toBeInTheDocument();
    expect(screen.getByText("90分")).toBeInTheDocument();
    expect(screen.getByText("平日")).toBeInTheDocument();
    expect(screen.getByText("¥3,500")).toBeInTheDocument();
    expect(screen.getByText("土日祝")).toBeInTheDocument();
    expect(screen.getByText("¥4,000")).toBeInTheDocument();
  });

  it("旧料金（¥2,980／1時間）は表示しない", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.queryByText("¥2,980")).not.toBeInTheDocument();
    expect(screen.queryByText("／ 1時間")).not.toBeInTheDocument();
  });

  it("ピックルのコートレンタル料金表は表示しない", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.queryByText("¥4,980")).not.toBeInTheDocument();
  });
});
