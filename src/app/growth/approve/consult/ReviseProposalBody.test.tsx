import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviseProposalBody } from "./ReviseProposalBody";

const current = "## 導入\n前\n\n## まとめ\n残す";
const proposal = "## 新しい導入\n後\n\n## まとめ\n残す";

describe("ReviseProposalBody", () => {
  it("セクションごとの選択をマージし、非選択変更を却下として反映する", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<ReviseProposalBody currentOutline={current} outlineProposal={proposal} titleProposal="新タイトル" busy={false} onApply={onApply} onDiscard={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "導入の変更を反映" }));
    await user.click(screen.getByRole("checkbox", { name: "タイトル案を反映" }));
    expect(screen.getByRole("button", { name: "選択を反映（0）" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "選択を反映（0）" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("タイトルだけを選択した場合は構成案を送らない", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <ReviseProposalBody
        currentOutline={current}
        outlineProposal={proposal}
        titleProposal="新タイトル"
        busy={false}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "導入の変更を反映" }));
    await user.click(screen.getByRole("button", { name: "選択を反映（1）" }));

    expect(onApply).toHaveBeenCalledWith({
      applyTitle: true,
      rejected: [
        {
          aspect: "構成案修正",
          detail: "セクション: 導入（変更）",
          before: "## 導入\n前",
          after: "## 新しい導入\n後",
        },
      ],
    });
  });

  it("対応付け不能時は全文差分の従来表示と操作を維持する", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onDiscard = vi.fn();
    render(
      <ReviseProposalBody
        currentOutline=""
        outlineProposal={proposal}
        titleProposal="新タイトル"
        busy={false}
        onApply={onApply}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText("タイトルの修正案")).toBeInTheDocument();
    expect(screen.getByText("修正後のタイトル")).toBeInTheDocument();
    expect(screen.getByText("元の構成案")).toBeInTheDocument();
    expect(screen.getByText("変更点（差分）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "反映する" }));
    await user.click(screen.getByRole("button", { name: "やり直し" }));

    expect(onApply).toHaveBeenCalledWith({ applyTitle: true, rejected: [] });
    expect(onDiscard).toHaveBeenCalledWith([
      {
        aspect: "構成案修正",
        detail: "構成案全体（全文差分）",
        before: "",
        after: proposal,
      },
      {
        aspect: "タイトル案",
        detail: "タイトルの修正案",
        before: "",
        after: "新タイトル",
      },
    ]);
  });

  it("変更がないときは破棄だけを表示する", () => {
    render(<ReviseProposalBody currentOutline={current} outlineProposal={current} titleProposal="" busy={false} onApply={vi.fn()} onDiscard={vi.fn()} />);

    expect(screen.getByText("変更はありませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "反映しない（破棄）" })).toBeInTheDocument();
  });
});
