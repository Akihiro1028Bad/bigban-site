import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ContributorsContent from "./ContributorsContent";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `translated:${key}`,
}));
vi.mock("@/components/home/HomeNavigation", () => ({
  default: () => <nav data-testid="nav" />,
}));
vi.mock("@/components/home/HomeFooter", () => ({
  default: () => <footer data-testid="footer" />,
}));

describe("ContributorsContent", () => {
  it("見出しと日本語サブタイトルとリード文を表示する", () => {
    render(<ContributorsContent />);

    expect(
      screen.getByRole("heading", { level: 1, name: "translated:title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("translated:titleJa")).toBeInTheDocument();
    expect(screen.getByText("translated:lede")).toBeInTheDocument();
  });

  it("ナビゲーションとフッターを表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByTestId("nav")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("ロゴを持たない支援者は掲載名を表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByText("ピックルピーク")).toBeInTheDocument();
    expect(screen.getByText("ひろさん")).toBeInTheDocument();
    expect(screen.getByText("Suzuko K.")).toBeInTheDocument();
  });

  it("ロゴを持つ支援者は名前ではなくロゴを表示する", () => {
    render(<ContributorsContent />);

    expect(screen.getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
    expect(screen.queryByText("焼肉やまと")).toBeNull();
  });

  it("外部リンクに sponsored / nofollow / noopener / noreferrer を付ける", () => {
    render(<ContributorsContent />);

    const link = screen.getByRole("link", { name: "ピックルピーク" });
    expect(link).toHaveAttribute("href", "https://pickle-peak.com/index.html");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
      "sponsored",
    ]);
  });

  it("リンクを持たない支援者はリンクにしない", () => {
    render(<ContributorsContent />);

    expect(screen.queryByRole("link", { name: "ひろさん" })).toBeNull();
  });

  it("3 つのランクをリストとして持ち、大ランクが最初に来る", () => {
    render(<ContributorsContent />);

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(3);
    expect(within(lists[0]).getByRole("img", { name: "焼肉やまと" })).toBeInTheDocument();
  });

  it("日本語の禁則処理を掲載名に当てる", () => {
    render(<ContributorsContent />);

    const name = screen.getByText("大洗町ビーチテニス＆ピックルボールクラブ");
    expect(name.className).toContain("[line-break:strict]");
  });

  it("showColumns を HomeNavigation に渡せる", () => {
    render(<ContributorsContent showColumns />);

    expect(screen.getByTestId("nav")).toBeInTheDocument();
  });
});
