import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmActionDialog } from "./ConfirmActionDialog";

describe("ConfirmActionDialog", () => {
  it("revert: 警告本文と「提案中に戻す」ボタン・対象タイトルを出す", () => {
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "構成からやり直すの確認" })).toBeInTheDocument();
    expect(screen.getByText("構成からやり直しますか？")).toBeInTheDocument();
    expect(screen.getByText(/作り直されます/)).toBeInTheDocument();
    expect(screen.getByText("記事A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提案中に戻す" })).toBeInTheDocument();
  });

  it("確定を押すと onConfirm を呼ぶ", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "提案中に戻す" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("キャンセルを押すと onCancel を呼ぶ", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("背景(オーバーレイ)の mousedown で onCancel を呼ぶ", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );
    // aria-modal のダイアログ本体は最前面の親(オーバーレイ)にラップされる。
    // 背景クリックで閉じる proto 挙動を確認する。
    const dialog = screen.getByRole("dialog", { name: "構成からやり直すの確認" });
    const overlay = dialog.parentElement;
    expect(overlay).not.toBeNull();
    if (overlay) {
      await userEvent.pointer({ target: overlay, keys: "[MouseLeft>]" });
    }
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ダイアログ本体の mousedown では onCancel を呼ばない(誤爆防止)", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        action={{ kind: "revert", id: "i1", title: "記事A" }}
        busy={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog", { name: "構成からやり直すの確認" });
    await userEvent.pointer({ target: dialog, keys: "[MouseLeft>]" });
    expect(onCancel).not.toHaveBeenCalled();
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
    // より上の z-[80] であること(jsdom では重なり順を検証できないため overlay の className で固定する)。
    const dialog = screen.getByRole("dialog", { name: "構成からやり直すの確認" });
    expect(dialog.parentElement).toHaveClass("z-[80]");
    // トークン解決のため overlay に approve-shell を付与している(fixed overlay 回帰防止)。
    expect(dialog.parentElement).toHaveClass("approve-shell");
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
