import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeServices from "./HomeServices";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

describe("HomeServices", () => {
  it('セクションID "services" を持つ', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("services");
    expect(section).toBeInTheDocument();
  });

  it("SERVICESタイトルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("SERVICES")).toBeInTheDocument();
  });

  it("日本語サブタイトル「サービス・プラン」を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("サービス・プラン")).toBeInTheDocument();
  });

  it("5つのサービス番号（01〜05）を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByText("05")).toBeInTheDocument();
  });

  it("日本語タイトルを全て表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("コートレンタル")).toBeInTheDocument();
    expect(screen.getByText("レッスン & クリニック")).toBeInTheDocument();
    expect(screen.getByText("トレーニングプログラム")).toBeInTheDocument();
    expect(screen.getByText("大会 & リーグ")).toBeInTheDocument();
    expect(screen.getByText("イベント")).toBeInTheDocument();
  });

  it("英語タイトルを全て表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("COURT RENTAL")).toBeInTheDocument();
    expect(screen.getByText("LESSONS & CLINICS")).toBeInTheDocument();
    expect(screen.getByText("TRAINING")).toBeInTheDocument();
    expect(screen.getByText("TOURNAMENTS & LEAGUES")).toBeInTheDocument();
    expect(screen.getByText("EVENTS")).toBeInTheDocument();
  });

  it("説明文のキーワードを全て含む", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/無人チェックイン/)).toBeInTheDocument();
    expect(screen.getByText(/レベル別プログラム/)).toBeInTheDocument();
    expect(screen.getByText(/コンディショニング/)).toBeInTheDocument();
    expect(screen.getByText(/賞金付き/)).toBeInTheDocument();
    expect(screen.getByText(/異業種コラボレーション/)).toBeInTheDocument();
  });

  it("コートレンタルにRESERVEボタンを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const reserveButton = screen.getByText("RESERVE");
    expect(reserveButton).toBeInTheDocument();
    const link = reserveButton.closest("a");
    expect(link).toHaveAttribute("href", "/reserve?tab=pickleball");
  });

  it("他のサービスにはRESERVEボタンを表示しない", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const reserveButtons = screen.getAllByText("RESERVE");
    expect(reserveButtons).toHaveLength(1);
  });

  it("イベントにVIEW EVENTSボタン（テニスベアへのリンク）を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const ctaButton = screen.getByText("VIEW EVENTS");
    expect(ctaButton).toBeInTheDocument();
    const link = ctaButton.closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.tennisbear.net/user/148195/organized-event"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("data-service-row属性で背景色が交互になる（奇数:bg-deep-black, 偶数:bg-off-white）", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeServices />
      </NextIntlClientProvider>
    );
    const rows = document.querySelectorAll("[data-service-row]");
    expect(rows).toHaveLength(5);

    rows.forEach((row, index) => {
      if (index % 2 === 0) {
        expect(row.className).toContain("bg-deep-black");
        expect(row.className).toContain("text-text-light");
      } else {
        expect(row.className).toContain("bg-off-white");
        expect(row.className).toContain("text-text-dark");
      }
    });
  });
});
