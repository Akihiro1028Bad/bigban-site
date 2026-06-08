import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import PromoBanner from "./PromoBanner";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

// JST の境界をまたぐ表示切替を検証するため、テスト内でシステム時刻を固定する。
const MAY_JST = new Date("2026-05-29T03:00:00Z"); // JST 5/29 → 5月キャンペーン
const JUNE_JST = new Date("2026-06-05T03:00:00Z"); // JST 6/5 → 6月キャンペーン

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

  it("links to the reserve URL opening in a new tab with safe rel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MAY_JST);
    renderWithIntl(<PromoBanner />, "ja");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://reserva.be/tpbt");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
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
