import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import jaMessages from "../../../messages/ja.json";

import HomeContributors from "./HomeContributors";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

const mockTrackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => mockTrackCtaClick(...args),
}));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <HomeContributors />
    </NextIntlClientProvider>,
  );
}

describe("HomeContributors", () => {
  it("見出しを表示する", () => {
    renderSection();

    expect(
      screen.getByRole("heading", { level: 2, name: "クラウドファンディング支援者" }),
    ).toBeInTheDocument();
  });

  it("掲載対象がウェブ掲載リターンを選んだ方であると分かる説明文を出す", () => {
    renderSection();

    const description = screen.getByText(
      /クラウドファンディングでは、数多くの方に支援していただきました/,
    );
    expect(description.textContent).toContain(
      "そのうちウェブ掲載のリターンを選んでくださった皆さま",
    );
  });

  it("店内ウォールに言及しない(Web ページの説明として書く)", () => {
    const { container } = renderSection();

    expect(container.textContent).not.toContain("ウォール");
  });

  it("支援者数を断定的に表示しない", () => {
    renderSection();

    // 「24名の支援者」のような表現は、それ以外の支援者を数から除外して読ませるため出さない。
    expect(screen.queryByText(/\d+\s*名の支援者/)).toBeNull();
  });

  it("ロゴを表示しない", () => {
    const { container } = renderSection();

    // 3社だけをトップに掲げると、その3社が代表的な支援者に見えてしまう。
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("塗りつぶしの CTA ボタンではなくテキストリンクで誘導する", () => {
    renderSection();

    const link = screen.getByRole("link", { name: /支援者のご紹介を見る/ });
    expect(link).toHaveAttribute("href", "/contributors");
    expect(link.className).not.toContain("bg-accent");
  });

  it("CTA クリックで計測イベントを送る", () => {
    renderSection();

    screen.getByRole("link", { name: /支援者のご紹介を見る/ }).click();

    expect(mockTrackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_contributors",
      "contributors",
    );
  });
});
