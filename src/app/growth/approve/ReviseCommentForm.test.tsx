import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviseCommentForm } from "./ReviseCommentForm";

function renderForm(overrides: Partial<Parameters<typeof ReviseCommentForm>[0]> = {}) {
  const onTitlePromptChange = vi.fn();
  const onOutlineOverallPromptChange = vi.fn();
  const onRequestRevise = vi.fn();
  render(
    <ReviseCommentForm
      itemId="item-1"
      titlePrompt=""
      onTitlePromptChange={onTitlePromptChange}
      outlineOverallPrompt=""
      onOutlineOverallPromptChange={onOutlineOverallPromptChange}
      busy={false}
      sectionCount={0}
      commentTotal={0}
      renderSection={() => null}
      onRequestRevise={onRequestRevise}
      {...overrides}
    />
  );
  return { onTitlePromptChange, onOutlineOverallPromptChange, onRequestRevise };
}

describe("ReviseCommentForm 構成案全体への指示", () => {
  it("全体指示の入力が onOutlineOverallPromptChange に伝わる", () => {
    const { onOutlineOverallPromptChange } = renderForm();
    fireEvent.change(screen.getByLabelText("構成案全体への指示（任意）"), {
      target: { value: "導入と結論を対応させたい" },
    });
    expect(onOutlineOverallPromptChange).toHaveBeenCalledWith("導入と結論を対応させたい");
  });

  it("セクションコメントがあるとき全体指示 textarea は無効(先入力優先)", () => {
    renderForm({ commentTotal: 2 });
    expect(screen.getByLabelText("構成案全体への指示（任意）")).toBeDisabled();
  });

  it("全体指示のみでも依頼ボタンが活性になる", () => {
    renderForm({ outlineOverallPrompt: "全体を再構成して" });
    expect(screen.getByRole("button", { name: /修正を依頼/ })).toBeEnabled();
  });
});
