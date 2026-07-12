import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ColumnPagination } from "./ColumnPagination";

describe("ColumnPagination", () => {
  it("totalPages<=1 は描画しない", () => {
    const { container } = render(
      <ColumnPagination currentPage={1} totalPages={1} locale="ja" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("ja: ページリンクは /columns?page=n", () => {
    render(<ColumnPagination currentPage={1} totalPages={3} locale="ja" />);
    const link2 = screen.getByRole("link", { name: "2" });
    expect(link2).toHaveAttribute("href", "/columns?page=2");
  });

  it("category 付きは ?page=n&category=id を維持する", () => {
    render(
      <ColumnPagination
        currentPage={1}
        totalPages={3}
        locale="ja"
        category="start"
      />,
    );
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/columns?page=2&category=start",
    );
  });

  it("1ページ目のリンクは page を省略する(category のみ)", () => {
    render(
      <ColumnPagination
        currentPage={2}
        totalPages={3}
        locale="ja"
        category="start"
      />,
    );
    const prev = screen.getByRole("link", { name: "前のページ" });
    expect(prev).toHaveAttribute("href", "/columns?category=start");
  });

  it("en は /en/columns プレフィックス", () => {
    render(<ColumnPagination currentPage={1} totalPages={3} locale="en" />);
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/en/columns?page=2",
    );
  });

  it("現在ページに aria-current=page", () => {
    render(<ColumnPagination currentPage={2} totalPages={3} locale="ja" />);
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("多数ページで ellipsis(…)を描画する", () => {
    render(<ColumnPagination currentPage={5} totalPages={20} locale="ja" />);
    // buildPageList(5,20) → [1,"...",4,5,6,"...",20]
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
  });
});
