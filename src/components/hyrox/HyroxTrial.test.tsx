import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import { HYROX_LESSON_PRICES } from "@/constants/pricing";
import { EXTERNAL_LINK_PROPS, LABOLA_SCHOOL_URL } from "@/constants/site";
import HyroxTrial from "./HyroxTrial";

import type React from "react";

const trackCtaClick = vi.fn();
const trackLabolaEntry = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
  trackLabolaEntry: (...args: unknown[]) => trackLabolaEntry(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

beforeEach(() => {
  trackCtaClick.mockClear();
  trackLabolaEntry.mockClear();
});

describe("HyroxTrial", () => {
  it("h2 に英語見出しと日本語(公式トレーニングクラブ認定・体験会)を含む", () => {
    renderWithIntl(<HyroxTrial />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "OFFICIAL HYROX公式トレーニングクラブ認定・体験会",
      }),
    ).toBeInTheDocument();
  });

  it("2026年8月にトレーニングクラブへ認定された旨と、公式トレーニングジムの併記がある", () => {
    renderWithIntl(<HyroxTrial />);
    const text = screen.getByText(/2026年8月にHYROX公式トレーニングクラブ/);
    expect(text).toHaveTextContent("HYROX Training Club");
    expect(text).toHaveTextContent("公式トレーニングジム");
  });

  it("体験会の分数と料金は HYROX_LESSON_PRICES.trial と一致する", () => {
    renderWithIntl(<HyroxTrial />);
    const { minutes, priceYen } = HYROX_LESSON_PRICES.trial;
    expect(
      screen.getByText(`${minutes}分・${priceYen.toLocaleString("ja-JP")}円`),
    ).toBeInTheDocument();
  });

  it("持ち物(ランニングシューズ・トレーニングウェア、レンタルなし)を案内する", () => {
    renderWithIntl(<HyroxTrial />);
    expect(screen.getByText(/ランニングシューズ/)).toHaveTextContent(
      "レンタルはありません",
    );
  });

  it("開催日は書かず、体験会の開催日のお知らせへ内部リンクして content_click を送る", async () => {
    renderWithIntl(<HyroxTrial />);
    expect(
      screen.getByText("開催日は、お知らせとLaBOLAでご案内しています。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
    const link = screen.getByRole("link", { name: "開催日のお知らせを見る" });
    expect(link).toHaveAttribute("href", "/news/hyrox-morning-trial-class-2026");
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_trial_schedule",
      "hyrox-morning-trial-class-2026",
    );
  });

  it("予約 CTA は LaBOLA のクラス・スクール一覧へ別タブで直リンクし、計測を送る", async () => {
    renderWithIntl(<HyroxTrial />);
    const link = screen.getByRole("link", { name: /体験会を予約する/ });
    expect(link).toHaveAttribute("href", LABOLA_SCHOOL_URL);
    expect(link).toHaveAttribute("target", EXTERNAL_LINK_PROPS.target);
    expect(link).toHaveAttribute("rel", EXTERNAL_LINK_PROPS.rel);
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "hyrox_trial",
      "体験会を予約する",
    );
    expect(trackLabolaEntry).toHaveBeenCalledWith("program");
  });

  it("認定のお知らせへ内部リンクし、content_click を送る", async () => {
    renderWithIntl(<HyroxTrial />);
    const link = screen.getByRole("link", { name: "認定のお知らせを読む" });
    expect(link).toHaveAttribute("href", "/news/hyrox-official-training-gym");
    await userEvent.click(link);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "contentClick",
      "hyrox_trial_news",
      "hyrox-official-training-gym",
    );
  });

  it("Gym Finder へのリンクを含まない(#420 完了まで張らない)", () => {
    renderWithIntl(<HyroxTrial />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("hyrox-training-finder"))).toBe(
      false,
    );
  });

  it("英語表示では英語の文言になり、日本語のみのお知らせリンクは2つとも出さない", () => {
    renderWithIntl(<HyroxTrial />, { locale: "en" });
    expect(screen.getByText("50 min · ¥3,000")).toBeInTheDocument();
    expect(
      screen.getByText("Upcoming dates are listed on LaBOLA."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "See upcoming dates" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Book a trial session/ }),
    ).toHaveAttribute("href", LABOLA_SCHOOL_URL);
    expect(
      screen.queryByRole("link", { name: "Read the certification announcement" }),
    ).not.toBeInTheDocument();
  });
});
