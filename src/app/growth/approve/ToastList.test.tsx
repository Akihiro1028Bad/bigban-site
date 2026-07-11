/**
 * ToastList(#proto P5b): 右下 fixed スタック再スキン後の挙動テスト。
 * 契約: tone 2値の配色分岐 / dismiss(閉じる)実挙動 / role=status / aria-label=お知らせ 維持。
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastList } from "./ToastList";
import type { ApproveToast } from "./ToastList";

const successToast: ApproveToast = {
  id: "toast-1",
  message: "下書きが完成しました",
  tone: "success",
};
const errorToast: ApproveToast = {
  id: "toast-2",
  message: "コピーに失敗しました",
  tone: "error",
};

describe("ToastList", () => {
  it("空配列でも aria-label=お知らせ のコンテナを描画する(exit アニメの器)", () => {
    render(<ToastList toasts={[]} onDismiss={vi.fn()} />);
    const region = screen.getByLabelText("お知らせ");
    expect(region).toBeInTheDocument();
    // トースト本体(role=status)は無い。
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("右下 fixed スタックとして描画される", () => {
    render(<ToastList toasts={[successToast]} onDismiss={vi.fn()} />);
    const region = screen.getByLabelText("お知らせ");
    expect(region.className).toContain("fixed");
    expect(region.className).toContain("bottom-5");
    expect(region.className).toContain("right-5");
  });

  it("各トーストは role=status とメッセージを持つ", () => {
    render(<ToastList toasts={[successToast, errorToast]} onDismiss={vi.fn()} />);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    expect(screen.getByText("下書きが完成しました")).toBeInTheDocument();
    expect(screen.getByText("コピーに失敗しました")).toBeInTheDocument();
  });

  it("success トーストは緑トークン(--p-green / --p-green-weak)を反映する", () => {
    render(<ToastList toasts={[successToast]} onDismiss={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status.innerHTML).toContain("var(--p-green-weak)");
    expect(status.innerHTML).toContain("var(--p-green)");
    // error 側の赤トークンは混入しない。
    expect(status.innerHTML).not.toContain("var(--p-red)");
  });

  it("error トーストは赤トークン(--p-red / --p-red-weak)を反映する", () => {
    render(<ToastList toasts={[errorToast]} onDismiss={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status.innerHTML).toContain("var(--p-red-weak)");
    expect(status.innerHTML).toContain("var(--p-red)");
    expect(status.innerHTML).not.toContain("var(--p-green)");
  });

  it("閉じるボタンは onDismiss を該当 id で呼ぶ", () => {
    const onDismiss = vi.fn();
    render(<ToastList toasts={[successToast, errorToast]} onDismiss={onDismiss} />);
    const errorStatus = screen.getByText("コピーに失敗しました").closest('[role="status"]');
    expect(errorStatus).not.toBeNull();
    const closeButton = within(errorStatus as HTMLElement).getByRole("button", {
      name: "通知を閉じる: コピーに失敗しました",
    });
    fireEvent.click(closeButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith("toast-2");
  });
});
