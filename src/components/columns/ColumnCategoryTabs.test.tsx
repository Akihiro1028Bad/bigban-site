import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { ColumnCategoryTabs } from "./ColumnCategoryTabs";
import type { ColumnCategory } from "@/lib/microcms/columnsSchema";

const categories: ColumnCategory[] = [
  { id: "start", name: "はじめ方・体験", nameEn: "Getting Started", color: "#C8FF00", order: 1 },
  { id: "rules", name: "ルール・基礎知識", nameEn: "Rules & Basics", color: "#8AB4FF", order: 2 },
];

describe("ColumnCategoryTabs", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("All + カテゴリ数のボタンを描画する(動的)", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory={undefined}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("activeCategory 一致で aria-pressed=true", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory="rules"
      />,
    );
    expect(
      screen.getByRole("button", { name: "ルール・基礎知識" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("All は active=undefined で pressed=true", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory={undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "すべて" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("カテゴリクリックで /columns?category={id}", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory={undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ルール・基礎知識" }));
    expect(pushMock).toHaveBeenCalledWith("/columns?category=rules");
  });

  it("All クリックで /columns", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory="rules"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(pushMock).toHaveBeenCalledWith("/columns");
  });

  it("locale=en は /en/columns プレフィックスと nameEn ラベル", () => {
    render(
      <ColumnCategoryTabs
        locale="en"
        categories={categories}
        activeCategory={undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rules & Basics" }));
    expect(pushMock).toHaveBeenCalledWith("/en/columns?category=rules");
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("カテゴリが空なら何も描画しない(All 単独も出さない)", () => {
    const { container } = render(
      <ColumnCategoryTabs
        locale="ja"
        categories={[]}
        activeCategory={undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("active なタブは color を枠色に使う", () => {
    render(
      <ColumnCategoryTabs
        locale="ja"
        categories={categories}
        activeCategory="start"
      />,
    );
    const btn = screen.getByRole("button", { name: "はじめ方・体験" });
    expect(btn.style.borderColor).toBeTruthy();
  });
});
