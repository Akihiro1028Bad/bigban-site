import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewsCard } from "./NewsCard";
import { makeParsedNewsItem } from "../../../__mocks__/microcms-fixtures";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

describe("NewsCard", () => {
  it("タイトル/日付/カテゴリバッジ", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({
          title: "サンプル",
          publishedAt: "2026-04-01T00:00:00.000Z",
          category: ["media"],
          slug: "sample",
        })}
        locale="ja"
      />,
    );
    expect(screen.getByText("サンプル")).toBeInTheDocument();
    expect(screen.getByText(/2026\.04\.01/)).toBeInTheDocument();
    expect(screen.getByText("メディア掲載")).toBeInTheDocument();
  });

  it("locale=en で英語ラベルとLink用のロケール非依存URLを表示する", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({ slug: "sample", category: ["media"] })}
        locale="en"
      />,
    );
    expect(screen.getByText("Media")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/news/sample",
    );
  });

  it("locale=ja prefix なしリンク", () => {
    render(
      <NewsCard item={makeParsedNewsItem({ slug: "x" })} locale="ja" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/news/x");
  });

  it("カードクリックを content_click として計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NewsCard
        item={makeParsedNewsItem({ slug: "tracked-news", title: "計測記事" })}
        locale="ja"
      />,
    );

    await userEvent.click(screen.getByRole("link"));

    expect(trackCtaClick).toHaveBeenCalledWith("contentClick", "news_card", "tracked-news");
  });

  it("eyecatch あり img描画", () => {
    const { container } = render(
      <NewsCard item={makeParsedNewsItem({ slug: "y" })} locale="ja" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src") ?? "").toContain("test.jpg");
  });

  it("eyecatch なしでプレースホルダ", () => {
    const base = makeParsedNewsItem({ slug: "z" });
    const { eyecatch: _e, ...rest } = base;
    void _e;
    const { container } = render(<NewsCard item={rest} locale="ja" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("news-card-placeholder")).toBeInTheDocument();
  });

  it("publishedAt なければ createdAt", () => {
    const base = makeParsedNewsItem({
      slug: "p",
      createdAt: "2026-01-15T00:00:00.000Z",
    });
    const { publishedAt: _p, ...rest } = base;
    void _p;
    render(<NewsCard item={rest} locale="ja" />);
    expect(screen.getByText(/2026\.01\.15/)).toBeInTheDocument();
  });

  it("カテゴリ未定義 (allowlist 外) でも fallback 色でプレースホルダ描画", () => {
    const base = makeParsedNewsItem({ slug: "u" });
    const { eyecatch: _e, category: _c, ...rest } = base;
    void _e;
    void _c;
    // 強引に未知カテゴリを設定 (microCMS 側にしかないラベル想定の防御)
    const item = {
      ...rest,
      category: ["unknown-category"] as unknown as typeof base.category,
    };
    const { getByTestId } = render(<NewsCard item={item} locale="ja" />);
    const placeholder = getByTestId("news-card-placeholder");
    // fallback 色 #8A8A8A33 (RGB 138,138,138 + 33 alpha) が browser で normalize された状態を確認
    expect(placeholder.getAttribute("style")).toContain("138, 138, 138");
  });

  it("複数カテゴリは配列順にすべてチップ表示する (ja)", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({
          slug: "multi",
          category: ["notice", "media", "event"],
        })}
        locale="ja"
      />,
    );
    const labels = ["お知らせ", "メディア掲載", "イベント情報"];
    const elements = labels.map((l) => screen.getByText(l));
    elements.forEach((el) => expect(el).toBeInTheDocument());
    // 配列順 (DOM 出現順) を担保
    const positions = elements.map((el) =>
      Array.prototype.indexOf.call(el.parentElement!.children, el),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("複数カテゴリは locale=en で英語ラベルを並べる", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({
          slug: "multi-en",
          category: ["notice", "campaign"],
        })}
        locale="en"
      />,
    );
    expect(screen.getByText("Notice")).toBeInTheDocument();
    expect(screen.getByText("Campaign")).toBeInTheDocument();
  });

  it("不正カテゴリが混ざっていても有効カテゴリのみ描画する", () => {
    const base = makeParsedNewsItem({ slug: "mix" });
    const item = {
      ...base,
      category: ["notice", "ghost-cat"] as unknown as typeof base.category,
    };
    render(<NewsCard item={item} locale="ja" />);
    expect(screen.getByText("お知らせ")).toBeInTheDocument();
    expect(screen.queryByText("ghost-cat")).not.toBeInTheDocument();
  });

  it("time要素 dateTime 属性", () => {
    render(
      <NewsCard
        item={makeParsedNewsItem({
          publishedAt: "2026-04-01T00:00:00.000Z",
          slug: "x",
        })}
        locale="ja"
      />,
    );
    const t = screen.getByText(/2026\.04\.01/);
    expect(t.tagName).toBe("TIME");
    expect(t).toHaveAttribute("dateTime", "2026-04-01");
  });
});
