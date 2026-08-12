import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomePricing from "./HomePricing";

import type React from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

describe("HomePricing", () => {
  it('セクションID "pricing" を持つ', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("pricing");
    expect(section).toBeInTheDocument();
  });

  it("下パディングを章の縦リズムに揃える（上は FLOW と一体で読ませるため詰めたまま）", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const className = document.getElementById("pricing")?.className ?? "";
    expect(className).toContain("pb-16");
    expect(className).toContain("lg:pb-24");
    expect(className).not.toContain("lg:pb-32");
    // FLOW から続けて読ませる意図なので上は据え置き。
    expect(className).toContain("pt-8");
    expect(className).toContain("lg:pt-16");
  });

  it("PRICINGタイトルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("PRICING")).toBeInTheDocument();
  });

  it("日本語サブタイトル「料金プラン」を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("料金プラン")).toBeInTheDocument();
  });

  it("COURT RENTALラベルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("COURT RENTAL")).toBeInTheDocument();
  });

  it("全時間帯の料金を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("6:00-9:00")).toBeInTheDocument();
    expect(screen.getByText("9:00-17:00")).toBeInTheDocument();
    expect(screen.getByText("17:00-23:00")).toBeInTheDocument();
    expect(screen.getByText("¥4,980")).toBeInTheDocument();
    expect(screen.getByText("¥5,980")).toBeInTheDocument();
    const prices7980 = screen.getAllByText("¥7,980");
    expect(prices7980.length).toBeGreaterThanOrEqual(3);
  });

  it("平日・週末ヘッダーを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("平日")).toBeInTheDocument();
    expect(screen.getByText("週末・祝日")).toBeInTheDocument();
  });

  it("レンタル案内を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(
        "レンタルパドル 1本 ¥500（1コートにつき6本まで）／レンタルシューズの貸出はございません"
      )
    ).toBeInTheDocument();
  });

  it("HYROXエリアが同一料金である注記を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(
        "HYROXエリアレンタルも同一料金です（4名まで／5名目以降は1名につき+¥1,000）"
      )
    ).toBeInTheDocument();
  });

  it("貸切・法人利用の案内とリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const link = screen.getByText("お問い合わせ");
    expect(link.closest("a")).toHaveAttribute("href", "/about#contact");
  });

  it("bg-deep-black背景を持つ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("pricing");
    expect(section?.className).toContain("bg-deep-black");
  });

  it("お問い合わせCTAクリックで price_click を計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const link = document.querySelector('a[href="/about#contact"]');
    link?.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link!);
    expect(trackCtaClick).toHaveBeenCalledWith("price", "home_pricing");
  });

  it("料金表の下に予約案内ページ(/reserve)へのCTAを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const cta = screen.getByRole("link", { name: "コートを予約する" });
    expect(cta).toHaveAttribute("href", "/reserve");
    expect(cta).not.toHaveAttribute("target", "_blank");
  });

  it("予約CTAクリックで reserveEntry を計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const cta = screen.getByRole("link", { name: "コートを予約する" });
    cta.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(cta);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reserveEntry",
      "home_pricing_reserve",
      "コートを予約する"
    );
  });

  it("PBT CLUB 会員価格を料金表に表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    // 3行 × 平日/週末の6セルすべてに「PBT CLUB会員」ラベル付きの価格が並ぶ。
    expect(screen.getAllByText("PBT CLUB会員")).toHaveLength(6);
    expect(screen.getByText("¥3,500")).toBeInTheDocument();
    expect(screen.getByText("¥4,200")).toBeInTheDocument();
    expect(screen.getAllByText("¥5,600")).toHaveLength(4);
  });

  it("PBT CLUB 詳細リンククリックで home_pricing_pbt_club を計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", {
      name: /PBT CLUBについて詳しく見る/,
    });
    expect(link).toHaveAttribute("href", "/news/pbt-club-membership");
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_pricing_pbt_club",
      "pbt-club"
    );
  });

  it("貸切・法人利用のお問い合わせリンクは維持される", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    expect(
      document.querySelector('a[href="/about#contact"]')
    ).toBeInTheDocument();
  });
});

/** issue #404: 320px で見出しが枠(272px)を超えないよう、sm 未満だけ流体サイズにする。 */
const FLUID_SECTION_HEADING = "text-[clamp(2rem,22vw_-_34.5px,3rem)]";

describe("HomePricing の見出し級数", () => {
  it("sm 未満は固定の text-5xl ではなく下限付きの流体サイズを使う", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomePricing />
      </NextIntlClientProvider>
    );
    const heading = screen.getByRole("heading", { level: 2, name: "PRICING" });
    const classes = heading.className.split(/\s+/);

    expect(classes).not.toContain("text-5xl");
    expect(classes).toContain(FLUID_SECTION_HEADING);
    expect(classes).toContain("leading-none");
    expect(classes).toContain("sm:text-6xl");
    expect(classes).toContain("lg:text-7xl");
  });
});
