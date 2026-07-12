import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchedulePicker } from "./SchedulePicker";

describe("SchedulePicker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("過去のカスタム日時は予約できず、入力の最小値を現在時刻にする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 25, 22, 30, 0, 0));
    const onConfirm = vi.fn();

    render(<SchedulePicker count={1} onClose={vi.fn()} onConfirm={onConfirm} />);
    const input = screen.getByLabelText("日時を指定");
    fireEvent.change(input, { target: { value: "2026-01-25T21:00" } });

    expect(input).toHaveAttribute("min", "2026-01-25T22:30");
    expect(screen.getByRole("button", { name: "予約" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("未来のカスタム日時は予約できる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 25, 22, 30, 0, 0));
    const onConfirm = vi.fn();

    render(<SchedulePicker count={1} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("日時を指定"), {
      target: { value: "2026-01-26T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "予約" }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.any(String),
      new Date(2026, 0, 26, 9, 0, 0, 0).getTime()
    );
  });

  it("開いた後に期限切れになったプリセットは送信しない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 25, 20, 50, 0, 0));
    const onConfirm = vi.fn();

    render(<SchedulePicker count={1} onClose={vi.fn()} onConfirm={onConfirm} />);
    vi.setSystemTime(new Date(2026, 0, 25, 21, 10, 0, 0));
    fireEvent.click(screen.getByRole("button", { name: "今夜 21:00" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("選択した日時は過ぎています");
  });

  it("開いた後に期限切れになったカスタム日時は送信しない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 25, 20, 0, 0, 0));
    const onConfirm = vi.fn();

    render(<SchedulePicker count={1} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("日時を指定"), {
      target: { value: "2026-01-25T21:00" },
    });
    vi.setSystemTime(new Date(2026, 0, 25, 21, 10, 0, 0));
    fireEvent.click(screen.getByRole("button", { name: "予約" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("選択した日時は過ぎています");
  });
});
