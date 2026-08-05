import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import PromoBanner from "./PromoBanner";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

// JST の境界をまたぐ表示切替を検証するため、テスト内でシステム時刻を固定する。
const MAY_JST = new Date("2026-05-29T03:00:00Z"); // JST 5/29 → 5月キャンペーン
const JUNE_JST = new Date("2026-06-05T03:00:00Z"); // JST 6/5 → 6月キャンペーン
const AUGUST_JST = new Date("2026-08-03T03:00:00Z"); // JST 8/3 → PBT CLUB 会員

function renderWithIntl(ui: ReactElement, locale: "ja" | "en" = "ja") {
  const messages = locale === "ja" ? jaMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PromoBanner", () => {
  it("5/31までは日本語の5月キャンペーン文言(PBTOPEN30)を表示する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MAY_JST);
    renderWithIntl(<PromoBanner />, "ja");
    expect(
      screen.getByText(/🈹️ コート30%OFFキャンペーン中/),
    ).toBeInTheDocument();
    expect(screen.getByText(/PBTOPEN30/)).toBeInTheDocument();
    expect(screen.getByText(/5\/31/)).toBeInTheDocument();
  });

  it("英語ロケールでも5月キャンペーン文言を表示する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MAY_JST);
    renderWithIntl(<PromoBanner />, "en");
    expect(screen.getByText(/🈹️ 30% OFF CAMPAIGN/)).toBeInTheDocument();
    expect(screen.getByText(/PBTOPEN30/)).toBeInTheDocument();
  });

  it("JST 6/1以降は6月キャンペーン文言(CAMPFIRE30 / 7\\31まで)へ切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(JUNE_JST);
    renderWithIntl(<PromoBanner />, "ja");
    expect(screen.getByText(/CAMPFIRE30/)).toBeInTheDocument();
    expect(screen.getByText(/7\/31/)).toBeInTheDocument();
    expect(screen.queryByText(/PBTOPEN30/)).not.toBeInTheDocument();
  });

  it("英語ロケールでも6月キャンペーン文言(CAMPFIRE30)へ切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(JUNE_JST);
    renderWithIntl(<PromoBanner />, "en");
    expect(screen.getByText(/CAMPFIRE30/)).toBeInTheDocument();
    expect(screen.queryByText(/PBTOPEN30/)).not.toBeInTheDocument();
  });

  it("JST 8/1以降は失効した CAMPFIRE30 を出さず PBT CLUB 文言へ切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(AUGUST_JST);
    renderWithIntl(<PromoBanner />, "ja");
    expect(screen.getByText(/猛暑は涼しい屋内コートで/)).toBeInTheDocument();
    expect(screen.getByText(/約30%OFF/)).toBeInTheDocument();
    expect(screen.queryByText(/CAMPFIRE30/)).not.toBeInTheDocument();
    expect(screen.queryByText(/7\/31/)).not.toBeInTheDocument();
  });

  it("英語ロケールでも JST 8/1以降は PBT CLUB 文言へ切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(AUGUST_JST);
    renderWithIntl(<PromoBanner />, "en");
    expect(screen.getByText(/PBT CLUB/)).toBeInTheDocument();
    expect(screen.queryByText(/CAMPFIRE30/)).not.toBeInTheDocument();
  });

  it("PBT CLUB 期間中は aria-label も会員制度の内容に切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(AUGUST_JST);
    renderWithIntl(<PromoBanner />, "ja");
    expect(screen.getByRole("link")).toHaveAttribute(
      "aria-label",
      "猛暑は涼しい屋内コートで。PBT CLUB会員でコート利用料が約30%OFF。予約ページへ移動します",
    );
  });

  it("PBT CLUB 期間中も予約案内ページ(/reserve)にリンクする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(AUGUST_JST);
    renderWithIntl(<PromoBanner />, "ja");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/reserve");
  });

  it("予約案内ページ(/reserve)にリンクする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MAY_JST);
    renderWithIntl(<PromoBanner />, "ja");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/reserve");
    expect(link).not.toHaveAttribute("target", "_blank");
  });

  it("exposes an accessible label describing the link destination", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MAY_JST);
    renderWithIntl(<PromoBanner />, "ja");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "aria-label",
      "コート30%OFFキャンペーン。予約ページへ移動します",
    );
  });
});
