import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OutlineView } from "./OutlineView";
import type { ArticleHypothesis } from "@/lib/growth/approve";

function setup(over: Partial<Parameters<typeof OutlineView>[0]> = {}) {
  const props = {
    sections: [
      { heading: "導入", summary: "ピックルボールとは", comments: [] as string[] },
      { heading: "まとめ", summary: "ぜひお越しください", comments: ["ここを短く"] },
    ],
    revising: false,
    onAddComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onRequestOutlineRevise: vi.fn(),
    ...over,
  };
  render(<OutlineView {...props} />);
  return props;
}

describe("OutlineView", () => {
  it("セクション見出し＋説明を出す", () => {
    setup();
    expect(screen.getByText("導入")).toBeInTheDocument();
    expect(screen.getByText("まとめ")).toBeInTheDocument();
    expect(screen.getByText("ピックルボールとは")).toBeInTheDocument();
  });

  it("コメント集約帯: 件数と修正依頼ボタン(コメント0で無効)", () => {
    setup({ sections: [{ heading: "a", summary: "", comments: [] }] });
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/構成案の修正を依頼できます/)).toBeInTheDocument();
  });

  it("コメントがあると件数帯と修正依頼ボタンが有効で onRequestOutlineRevise", async () => {
    const p = setup();
    expect(screen.getByText(/1件のコメント/)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /構成案の修正を依頼/ });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(p.onRequestOutlineRevise).toHaveBeenCalled();
  });

  it("revising 中は修正依頼ボタンが無効", () => {
    setup({ revising: true });
    expect(screen.getByRole("button", { name: /構成案の修正を依頼/ })).toBeDisabled();
  });

  it("既存コメントの削除で onRemoveComment(i, ci)", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "コメント削除" }));
    expect(p.onRemoveComment).toHaveBeenCalledWith(1, 0);
  });

  it("コメント追加: ＋コメント→入力→追加で onAddComment(i, text)", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    await userEvent.type(screen.getByPlaceholderText("このセクションへの指示…"), "導入を短く");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(p.onAddComment).toHaveBeenCalledWith(0, "導入を短く");
  });

  it("コメント入力 Enter で追加、再度トグルすると閉じる", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    const input = screen.getByPlaceholderText("このセクションへの指示…");
    await userEvent.type(input, "Enterで追加{Enter}");
    expect(p.onAddComment).toHaveBeenCalledWith(0, "Enterで追加");
  });

  it("空コメントは追加されない", async () => {
    const p = setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    await userEvent.type(screen.getByPlaceholderText("このセクションへの指示…"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(p.onAddComment).not.toHaveBeenCalled();
  });

  it("コメント入力 Escape で閉じる、＋コメント再クリックでもトグル", async () => {
    setup();
    const addButtons = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(addButtons[0]);
    const input = screen.getByPlaceholderText("このセクションへの指示…");
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByPlaceholderText("このセクションへの指示…")).not.toBeInTheDocument();
    // 再度開いて同じボタンで閉じる
    const reopen = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(reopen[0]);
    expect(screen.getByPlaceholderText("このセクションへの指示…")).toBeInTheDocument();
    const toggle = screen.getAllByRole("button", { name: /コメント$/ });
    await userEvent.click(toggle[0]);
    expect(screen.queryByPlaceholderText("このセクションへの指示…")).not.toBeInTheDocument();
  });

  it("仮説カード: props 無しでは非表示", () => {
    setup();
    expect(screen.queryByText("この記事の狙い（仮説）")).not.toBeInTheDocument();
  });

  it("仮説カード: 記入フィールドのみ描画(欠落耐性)", () => {
    const hypothesis: ArticleHypothesis = {
      articleType: "獲得",
      targetReader: "初心者",
      searchIntent: "",
      winningAngle: "",
      successMetric: "",
      plannedCta: ["LINE", "予約"],
    };
    setup({ hypothesis });
    expect(screen.getByText("この記事の狙い（仮説）")).toBeInTheDocument();
    expect(screen.getByText("記事タイプ")).toBeInTheDocument();
    expect(screen.getByText("獲得")).toBeInTheDocument();
    expect(screen.getByText("狙う読者")).toBeInTheDocument();
    // 空フィールドは出さない
    expect(screen.queryByText("検索意図")).not.toBeInTheDocument();
    expect(screen.queryByText("勝ち筋")).not.toBeInTheDocument();
    expect(screen.queryByText("成功指標")).not.toBeInTheDocument();
    // CTA (string[]) は結合表示
    expect(screen.getByText("想定CTA")).toBeInTheDocument();
    expect(screen.getByText("LINE / 予約")).toBeInTheDocument();
  });

  it("仮説カード: CTA が空配列なら CTA 行を出さない", () => {
    const hypothesis: ArticleHypothesis = {
      articleType: "獲得",
      targetReader: "",
      searchIntent: "",
      winningAngle: "",
      successMetric: "",
      plannedCta: [],
    };
    setup({ hypothesis });
    expect(screen.queryByText("想定CTA")).not.toBeInTheDocument();
  });
});
