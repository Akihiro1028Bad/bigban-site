import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmActionDialog } from "./ConfirmActionDialog";

describe("ConfirmActionDialog", () => {
  it("publish: 公開の見出し・確定ボタンを出す", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "publish", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "公開・クローズの確認" })).toBeInTheDocument();
    expect(screen.getByText("記事を本番公開します")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "公開を確定" })).toBeInTheDocument();
  });

  it("close: クローズの見出し・確定ボタンを出す", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "close", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "公開・クローズの確認" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "クローズを確定" })).toBeInTheDocument();
  });

  it("revert: 警告本文と「提案中に戻す」ボタンを出す", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "構成からやり直すの確認" })).toBeInTheDocument();
    expect(screen.getByText(/作り直されます/)).toBeInTheDocument();
    expect(screen.getByText(/記事A/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提案中に戻す" })).toBeInTheDocument();
  });

  it("確定/キャンセルを押すとコールバックを呼ぶ", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "提案中に戻す" }));
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("詳細パネル(z-50)より前面の z-index を持つ(裏に隠れない回帰防止)", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    // 確認ダイアログは詳細パネル内のボタンから開くため、パネル(z-50)・編集(z-60)・パレット(z-70)
    // より上の z-[80] であること(jsdom では重なり順を検証できないため className で固定する)。
    expect(screen.getByRole("dialog", { name: "構成からやり直すの確認" })).toHaveClass("z-[80]");
  });

  it("busy のとき確定ボタンを無効化する", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "提案中に戻す" })).toBeDisabled();
  });
});
