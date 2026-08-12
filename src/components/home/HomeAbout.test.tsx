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

  it("章の縦リズム py-16 lg:py-24 を持つ（主要セクション共通）", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("about");
    expect(section?.className).toContain("py-16");
    expect(section?.className).toContain("lg:py-24");
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

  it("詳しく見るクリックで content_click を計測する", async () => {
    trackCtaClick.mockClear();
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );

    await userEvent.click(screen.getByRole("link", { name: /詳しく見る/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "home_about_read_more",
      "about",
    );
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

/** issue #404: 320px で見出しが枠(272px)を超えないよう、sm 未満だけ流体サイズにする。 */
const FLUID_SECTION_HEADING = "text-[clamp(2rem,22vw_-_34.5px,3rem)]";

describe("HomeAbout の見出し級数", () => {
  it("sm 未満は固定の text-5xl ではなく下限付きの流体サイズを使う", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeAbout />
      </NextIntlClientProvider>
    );
    const heading = screen.getByRole("heading", { level: 2, name: "ABOUT US" });
    const classes = heading.className.split(/\s+/);

    expect(classes).not.toContain("text-5xl");
    expect(classes).toContain(FLUID_SECTION_HEADING);
    expect(classes).toContain("leading-none");
    expect(classes).toContain("sm:text-6xl");
    expect(classes).toContain("lg:text-7xl");
  });
});
