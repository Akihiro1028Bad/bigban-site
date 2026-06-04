import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";

import HomeFooter from "./HomeFooter";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        data-fill={fill ? "true" : undefined}
        data-priority={priority ? "true" : undefined}
      />
    );
  },
}));

describe("HomeFooter", () => {
  it("footer要素が存在する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("ロゴ画像を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByAltText("THE PICKLE BANG THEORY")
    ).toBeInTheDocument();
  });

  it("ロゴがホーム(/)へのリンクである", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const logoLink = screen.getByAltText("THE PICKLE BANG THEORY").closest("a");
    expect(logoLink).toHaveAttribute("href", "/");
  });

  it("ブランド名（英語＋日本語）を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/THE PICKLE BANG THEORY.*ザ ピックルバン セオリー/)
    ).toBeInTheDocument();
  });

  it("8つのナビリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const links = [
      { name: "CONCEPT", href: "/#concept" },
      { name: "FACILITY", href: "/#facility" },
      { name: "SERVICES", href: "/#services" },
      { name: "HYROX", href: "/hyrox" },
      { name: "PRICING", href: "/#pricing" },
      { name: "NEWS", href: "/news" },
      { name: "ABOUT", href: "/about" },
      { name: "ACCESS", href: "/#access" },
    ];

    for (const link of links) {
      const el = screen.getByRole("link", { name: link.name });
      expect(el).toBeInTheDocument();
      expect(el).toHaveAttribute("href", link.href);
    }
  });

  it("コピーライトを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/© 2026 RST Agency Inc\./)
    ).toBeInTheDocument();
  });

  it("住所を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/〒272-0021/)).toBeInTheDocument();
  });

  it("特定商取引法リンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", { name: "特定商取引法に基づく表記" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/tokushoho");
  });

  it("フッターに HYROX ページへのリンクがある", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link", { name: "HYROX" });
    expect(link).toHaveAttribute("href", "/hyrox");
  });

  it("アクセントセパレーターを持つ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeFooter />
      </NextIntlClientProvider>
    );
    const footer = screen.getByRole("contentinfo");
    const firstChild = footer.firstElementChild;
    expect(firstChild).not.toBeNull();
    expect(firstChild?.className).toContain("h-px");
  });
});
