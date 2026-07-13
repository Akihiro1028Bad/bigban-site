import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SentenceFixBody } from "./SentenceFixBody";

const proposal = [
  { commentIndex: 0, before: "<p>変更前 1</p>", after: "<p>変更後 1</p>" },
  { commentIndex: 1, before: "<p>変更前 2</p>", after: "<p>変更後 2</p>" },
];

describe("SentenceFixBody", () => {
  it("案ごとのチェックボックスを描画し、変更を親へ通知する", () => {
    const onToggleSelect = vi.fn();
    render(
      <SentenceFixBody proposal={proposal} busy={false} selected={new Set([0, 1])} onToggleSelect={onToggleSelect} onApplySelected={vi.fn()} onDismissAll={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "修正案2を反映" }));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("選択数を反映ボタンに表示し、0件なら無効化する", () => {
    const { rerender } = render(
      <SentenceFixBody proposal={proposal} busy={false} selected={new Set([0])} onToggleSelect={vi.fn()} onApplySelected={vi.fn()} onDismissAll={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "選択した 1 件を反映" })).toBeEnabled();

    rerender(
      <SentenceFixBody proposal={proposal} busy={false} selected={new Set()} onToggleSelect={vi.fn()} onApplySelected={vi.fn()} onDismissAll={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "選択した 0 件を反映" })).toBeDisabled();
  });

  it("反映しないで全案を却下する", () => {
    const onDismissAll = vi.fn();
    render(
      <SentenceFixBody proposal={proposal} busy={false} selected={new Set([0, 1])} onToggleSelect={vi.fn()} onApplySelected={vi.fn()} onDismissAll={onDismissAll} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "反映しない" }));
    expect(onDismissAll).toHaveBeenCalledOnce();
  });
});
