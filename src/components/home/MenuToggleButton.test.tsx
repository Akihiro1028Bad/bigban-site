import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuToggleButton from "./MenuToggleButton";

describe("MenuToggleButton", () => {
  it("閉じている時は開くラベルを表示する", () => {
    render(
      <MenuToggleButton
        isOpen={false}
        onClick={vi.fn()}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
      />
    );
    const button = screen.getByRole("button", { name: "メニューを開く" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("開いている時は閉じるラベルと aria-expanded=true になる", () => {
    render(
      <MenuToggleButton
        isOpen
        onClick={vi.fn()}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
      />
    );
    const button = screen.getByRole("button", { name: "メニューを閉じる" });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onClick が呼ばれる", () => {
    const onClick = vi.fn();
    render(
      <MenuToggleButton
        isOpen={false}
        onClick={onClick}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("開いている時は枠線とアイコンをアクセント色にする", () => {
    render(
      <MenuToggleButton
        isOpen
        onClick={vi.fn()}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
      />
    );
    const button = screen.getByRole("button", { name: "メニューを閉じる" });
    // 開いている状態を色でも伝える(×アイコンのモーフだけに頼らない)。
    expect(button.classList.contains("border-accent")).toBe(true);
    expect(button.classList.contains("text-accent")).toBe(true);
  });

  it("閉じている時は控えめな枠線のままで、ホバーのアクセント化は残す", () => {
    render(
      <MenuToggleButton
        isOpen={false}
        onClick={vi.fn()}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
      />
    );
    const button = screen.getByRole("button", { name: "メニューを開く" });
    expect(button.classList.contains("border-accent")).toBe(false);
    expect(button.classList.contains("text-accent")).toBe(false);
    expect(button.classList.contains("border-white/15")).toBe(true);
    expect(button.classList.contains("text-text-light")).toBe(true);
    expect(button.classList.contains("hover:border-accent")).toBe(true);
    expect(button.classList.contains("hover:text-accent")).toBe(true);
  });

  it("追加の className を適用する", () => {
    render(
      <MenuToggleButton
        isOpen={false}
        onClick={vi.fn()}
        labelOpen="メニューを開く"
        labelClose="メニューを閉じる"
        className="fixed top-2"
      />
    );
    const button = screen.getByRole("button", { name: "メニューを開く" });
    expect(button.className).toContain("fixed");
    expect(button.className).toContain("top-2");
  });
});
