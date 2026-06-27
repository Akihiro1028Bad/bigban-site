import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";
import HomeAbout from "./HomeAbout";

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

describe("HomeAbout", () => {
  it('セクションID "about" を持つ', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("about");
    expect(section).toBeInTheDocument();
  });

  it("ABOUT USタイトルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("ABOUT US")).toBeInTheDocument();
  });

  it("日本語サブタイトル「運営会社・代表について」を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("運営会社・代表について")).toBeInTheDocument();
  });

  it("西村昭彦の名前を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("西村昭彦")).toBeInTheDocument();
  });

  it("FOUNDER & CEOラベルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("FOUNDER & CEO")).toBeInTheDocument();
  });

  it("英語名を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("AKIHIKO NISHIMURA")).toBeInTheDocument();
  });

  it("概要テキストを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/クロスミントン世界チャンピオン/)
    ).toBeInTheDocument();
  });

  it("活動内容テキストを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/選手活動及びJPA TOP TOUR大会ディレクター/)
    ).toBeInTheDocument();
  });

  it("詳しく見るリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("詳しく見る")).toBeInTheDocument();
  });

  it("/aboutへのリンクを持つ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const link = screen.getByText("詳しく見る").closest("a");
    expect(link).toHaveAttribute("href", "/about");
  });

  it("Instagramリンクを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const link = screen.getByText("@akihiko.rst").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/akihiko.rst/"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link?.querySelector("svg")).toBeInTheDocument();
  });

  it("Instagramクリックで instagram_click を計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const link = screen.getByText("@akihiko.rst").closest("a");
    await userEvent.click(link!);
    expect(trackCtaClick).toHaveBeenCalledWith("instagram", "home_about");
  });

  it("英語ロケールでfounderBio1を表示する", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/Crossminton World Champion/)
    ).toBeInTheDocument();
  });

  it("英語ロケールでfounderBio2を表示する", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(/JPA TOP TOUR tournament director/)
    ).toBeInTheDocument();
  });
});
