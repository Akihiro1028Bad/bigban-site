import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { makeParsedColumnItem } from "../../../__mocks__/columns-fixtures";
import { ColumnCard } from "./ColumnCard";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("ColumnCard", () => {
  it("タイトルとカテゴリ名(ja)を表示する", () => {
    const item = makeParsedColumnItem({ title: "屋内の始め方", slug: "s" });
    render(<ColumnCard item={item} locale="ja" />);
    expect(screen.getByText("屋内の始め方")).toBeInTheDocument();
    expect(screen.getByText("はじめ方・体験")).toBeInTheDocument();
  });

  it("locale=en は nameEn を表示しLinkへロケール非依存URLを渡す", () => {
    const item = makeParsedColumnItem({ slug: "how-to", title: "T" });
    render(<ColumnCard item={item} locale="en" />);
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/columns/how-to",
    );
  });

  it("ja は /columns/ へリンクする", () => {
    const item = makeParsedColumnItem({ slug: "x" });
    render(<ColumnCard item={item} locale="ja" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/columns/x");
  });

  it("カードクリックを content_click として計測する", async () => {
    trackCtaClick.mockClear();
    const item = makeParsedColumnItem({ slug: "tracked-column", title: "計測コラム" });
    render(<ColumnCard item={item} locale="ja" />);

    await userEvent.click(screen.getByRole("link"));

    expect(trackCtaClick).toHaveBeenCalledWith("contentClick", "column_card", "tracked-column");
  });

  it("呼び出し元が指定した計測locationを使う", async () => {
    trackCtaClick.mockClear();
    const item = makeParsedColumnItem({
      slug: "home-column",
      title: "ホーム掲載コラム",
    });
    render(
      <ColumnCard
        item={item}
        locale="ja"
        trackingLocation="home_column_card"
      />,
    );

    await userEvent.click(screen.getByRole("link"));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_column_card",
      "home-column",
    );
  });

  it("カテゴリ未設定でもタイトルは表示する(欠落耐性)", () => {
    const item = makeParsedColumnItem({ title: "無カテゴリ", category: null });
    render(<ColumnCard item={item} locale="ja" />);
    expect(screen.getByText("無カテゴリ")).toBeInTheDocument();
  });

  it("eyecatch 無しはプレースホルダを描画する", () => {
    const item = makeParsedColumnItem({ eyecatch: undefined });
    render(<ColumnCard item={item} locale="ja" />);
    expect(
      screen.getByTestId("column-card-placeholder"),
    ).toBeInTheDocument();
  });

  it("eyecatch もカテゴリも無い時は既定色のプレースホルダ", () => {
    const item = makeParsedColumnItem({
      eyecatch: undefined,
      category: null,
    });
    render(<ColumnCard item={item} locale="ja" />);
    expect(
      screen.getByTestId("column-card-placeholder"),
    ).toBeInTheDocument();
  });

  it("publishedAt 未設定は createdAt を日付に使う", () => {
    const item = makeParsedColumnItem({
      publishedAt: undefined,
      createdAt: "2026-05-10T00:00:00.000Z",
      title: "未公開扱い",
    });
    render(<ColumnCard item={item} locale="ja" />);
    expect(screen.getByText("2026.05.10")).toBeInTheDocument();
  });

  it("nameEn 未設定の en は name にフォールバックする", () => {
    const item = makeParsedColumnItem({
      category: {
        id: "start",
        name: "はじめ方・体験",
        nameEn: null,
        color: "#C8FF00",
        order: 1,
      },
    });
    render(<ColumnCard item={item} locale="en" />);
    expect(screen.getByText("はじめ方・体験")).toBeInTheDocument();
  });
});
