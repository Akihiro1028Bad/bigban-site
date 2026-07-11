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
    await userEvent.click(link!);
    expect(trackCtaClick).toHaveBeenCalledWith("price", "home_pricing");
  });
});
