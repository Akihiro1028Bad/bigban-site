import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxProgram from "./HyroxProgram";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

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

  it("旧料金（¥4,000／90分）は表示しない", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.queryByText("¥4,000")).not.toBeInTheDocument();
    expect(screen.queryByText("90分")).not.toBeInTheDocument();
  });

  it("¥3,500 は旧料金ではなく PBT CLUB 会員価格としてのみ表示する", () => {
    renderWithIntl(<HyroxProgram />);
    const amount = screen.getByText("¥3,500");
    expect(amount.parentElement?.textContent).toContain("PBT CLUB会員");
  });

  it("ピックルと同じ PBT CLUB 会員価格を表示する", () => {
    renderWithIntl(<HyroxProgram />);
    expect(screen.getAllByText("PBT CLUB会員")).toHaveLength(6);
    expect(screen.getByText("¥4,200")).toBeInTheDocument();
    expect(screen.getAllByText("¥5,600")).toHaveLength(4);
  });

  it("PBT CLUB 詳細リンククリックで hyrox_program_pbt_club を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HyroxProgram />);
    const link = screen.getByRole("link", {
      name: /PBT CLUBについて詳しく見る/,
    });
    expect(link).toHaveAttribute("href", "/news/pbt-club-membership");
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_program_pbt_club",
      "pbt-club"
    );
  });
});
