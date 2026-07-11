import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeftRail } from "./LeftRail";

describe("LeftRail", () => {
  it("編集司令室の7 viewをグループ表示し、アクティブに aria-current=page", () => {
    render(<LeftRail view="approve" articleCount={2} proposalCount={1} queueReadyCount={3} opsIssueCount={0} onChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "情報源" })).toBeInTheDocument();
    const article = screen.getByRole("button", { name: "記事制作" });
    expect(article).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "施策" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "ホーム" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI設定" })).toBeInTheDocument();
    expect(screen.getByText("WORKFLOW")).toBeInTheDocument();
  });

  it("各 view のバッジ(施策/記事/公開キュー)を出す", () => {
    render(<LeftRail view="approve" articleCount={2} proposalCount={1} queueReadyCount={3} opsIssueCount={4} onChange={vi.fn()} />);
    expect(within(screen.getByRole("button", { name: "施策" })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "記事制作" })).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "公開" })).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "運用状況" })).getByText("4")).toBeInTheDocument();
  });

  it("クリックで onChange(該当 view)", async () => {
    const onChange = vi.fn();
    render(<LeftRail view="approve" articleCount={0} proposalCount={0} queueReadyCount={0} opsIssueCount={0} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "成績" }));
    expect(onChange).toHaveBeenCalledWith("performance");
  });

  it("バッジ 0 のときはバッジを描画しない", () => {
    render(<LeftRail view="approve" articleCount={0} proposalCount={0} queueReadyCount={0} opsIssueCount={0} onChange={vi.fn()} />);
    expect(within(screen.getByRole("button", { name: "AI設定" })).queryByText("0")).not.toBeInTheDocument();
  });
});
