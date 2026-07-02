import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShortcutOverlay } from "./ShortcutOverlay";

describe("ShortcutOverlay", () => {
  it("ダイアログとショートカット一覧を表示する", () => {
    render(<ShortcutOverlay onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "キーボードショートカット" })).toBeInTheDocument();
    expect(screen.getByText("次の記事")).toBeInTheDocument();
    expect(screen.getByText("承認")).toBeInTheDocument();
  });

  it("esc ボタンで onClose", async () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    // ヘッダ右の閉じるボタン(Kbd esc を内包する button)
    await userEvent.click(screen.getAllByRole("button").find((b) => b.textContent === "esc")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("背景の mousedown で onClose", () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "キーボードショートカット" });
    const backdrop = dialog.parentElement!;
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it("ダイアログ本体の mousedown は伝播を止めて onClose を呼ばない", () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "キーボードショートカット" });
    dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ダイアログ本体で Esc を押すと onClose を呼ぶ(自前 Esc)", async () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "キーボードショートカット" });
    dialog.focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("ダイアログ内の修飾なし単一キーは onClose を呼ばない(キー漏れ防止)", async () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "キーボードショートカット" });
    dialog.focus();
    await userEvent.keyboard("a");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("移動/操作/表示の全グループの項目を表示する", () => {
    render(<ShortcutOverlay onClose={vi.fn()} />);
    expect(screen.getByText("移動")).toBeInTheDocument();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByText("表示")).toBeInTheDocument();
    expect(screen.getByText("前の記事")).toBeInTheDocument();
    expect(screen.getByText("検索にフォーカス")).toBeInTheDocument();
    expect(screen.getByText("修正を依頼")).toBeInTheDocument();
    expect(screen.getByText("本文を編集")).toBeInTheDocument();
    expect(screen.getByText("選択 / 解除")).toBeInTheDocument();
    expect(screen.getByText("閉じる / 選択解除")).toBeInTheDocument();
    expect(screen.getByText("構成案")).toBeInTheDocument();
    expect(screen.getByText("プレビュー")).toBeInTheDocument();
    expect(screen.getByText("素材")).toBeInTheDocument();
    expect(screen.queryByText("校正")).not.toBeInTheDocument();
    expect(screen.getByText("このヘルプ")).toBeInTheDocument();
  });
});
