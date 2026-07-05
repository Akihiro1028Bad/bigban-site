import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

describe("HyroxProgram", () => {
  it("PROGRAM 見出しを表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByRole("heading", { name: "PROGRAM" })).toBeInTheDocument();
  });

  it("ピックルと同一のコート料金テーブル（時間帯別・1時間あたり）を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByText("エリア利用料")).toBeInTheDocument();
    expect(screen.getByText("1時間あたりの料金")).toBeInTheDocument();
    expect(screen.getByText("6:00-9:00")).toBeInTheDocument();
    expect(screen.getByText("¥4,980")).toBeInTheDocument();
    expect(screen.getByText("¥5,980")).toBeInTheDocument();
    expect(screen.getAllByText("¥7,980").length).toBeGreaterThan(0);
    expect(screen.getByText("平日")).toBeInTheDocument();
    expect(screen.getByText("週末・祝日")).toBeInTheDocument();
  });

  it("4名まで同一料金・5名目以降 +¥1,000 の注記を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getByText(/5名目以降/)).toBeInTheDocument();
    expect(screen.getByText(/\+¥1,000/)).toBeInTheDocument();
  });

  it("旧料金（¥3,500／¥4,000／90分）は表示しない", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.queryByText("¥3,500")).not.toBeInTheDocument();
    expect(screen.queryByText("¥4,000")).not.toBeInTheDocument();
    expect(screen.queryByText("90分")).not.toBeInTheDocument();
  });
});
