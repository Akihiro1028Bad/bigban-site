import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProposalView } from "./ProposalView";
import type { PendingItem } from "./types";

function proposal(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    id: "p1",
    kind: "proposal",
    title: "市川ページ改善",
    subtitle: "サイト表示内容",
    details: [],
    score: 1,
    stage: "completed",
    ...overrides,
  };
}

describe("ProposalView 実行管理", () => {
  it("成果物化済み施策から実行中・実行済みに進められる", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <ProposalView
        proposals={[proposal()]}
        token="t"
        decided={{}}
        activeId="p1"
        onActivate={vi.fn()}
        onApprove={onApprove}
        onReopen={vi.fn()}
        onReject={vi.fn()}
        onOpenForm={vi.fn()}
      />
    );

    expect(screen.getAllByText("成果物化済").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("施策進捗")).toBeInTheDocument();
    expect(screen.getAllByText("次にやること").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "実行中にする" }));
    await user.click(screen.getByRole("button", { name: "実行済みにする" }));

    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), "実行中");
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), "実行済み");
  });

  it("実行状態の保存中は両方の更新ボタンを無効化する", async () => {
    let resolveSave: (() => void) | undefined;
    const onApprove = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    render(
      <ProposalView
        proposals={[proposal()]}
        token="t"
        decided={{}}
        activeId="p1"
        onActivate={vi.fn()}
        onApprove={onApprove}
        onReopen={vi.fn()}
        onReject={vi.fn()}
        onOpenForm={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "実行中にする" }));
    expect(screen.getByRole("button", { name: "実行中にする" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "実行済みにする" })).toBeDisabled();
    resolveSave?.();
  });

  it("状態別サマリーを表示する", () => {
    render(
      <ProposalView
        proposals={[proposal(), proposal({ id: "p2", stage: "proposed", title: "未処理施策" })]}
        token="t"
        decided={{}}
        activeId="p1"
        onActivate={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
        onReject={vi.fn()}
        onOpenForm={vi.fn()}
      />
    );
    expect(screen.getByLabelText("施策ステータス集計")).toHaveTextContent("1未処理");
    expect(screen.getByLabelText("施策ステータス集計")).toHaveTextContent("1成果物化済");
  });

  it("実行済み施策は完了状態として表示する", () => {
    render(
      <ProposalView
        proposals={[proposal({ stage: "executed", executedAtMs: Date.parse("2026-07-11T10:00:00.000Z") })]}
        token="t"
        decided={{}}
        activeId="p1"
        onActivate={vi.fn()}
        onApprove={vi.fn()}
        onReopen={vi.fn()}
        onReject={vi.fn()}
        onOpenForm={vi.fn()}
      />
    );

    expect(screen.getAllByText("実行済み").length).toBeGreaterThan(0);
    expect(screen.getByText(/完了日時.*2026\/07\/11/)).toBeInTheDocument();
  });
});
