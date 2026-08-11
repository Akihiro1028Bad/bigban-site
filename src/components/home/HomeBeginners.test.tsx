import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeBeginners from "./HomeBeginners";

import type { ReactElement } from "react";

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("HomeBeginners", () => {
  it("見出しを表示する", () => {
    renderWithIntl(<HomeBeginners />);
    expect(
      screen.getByRole("heading", { name: jaMessages.HomeBeginners.title })
    ).toBeInTheDocument();
  });

  it("3ステップすべてに行き先がある", () => {
    renderWithIntl(<HomeBeginners />);
    const m = jaMessages.HomeBeginners;

    // 01 レッスン: labola スクール(外部・新規タブ)
    const lesson = screen.getByRole("link", { name: m.step01.cta });
    expect(lesson).toHaveAttribute(
      "href",
      "https://yoyaku.labola.jp/r/shop/3473/event/school/"
    );
    expect(lesson).toHaveAttribute("target", "_blank");

    // 02 コート予約: 内部の予約案内ページ
    const reserve = screen.getByRole("link", { name: m.step02.cta });
    expect(reserve).toHaveAttribute("href", "/reserve");
    expect(reserve).not.toHaveAttribute("target", "_blank");

    // 03 イベント: Tennisbear(外部・新規タブ)
    const events = screen.getByRole("link", { name: m.step03.cta });
    expect(events).toHaveAttribute(
      "href",
      "https://www.tennisbear.net/pickleball/circle/36659/events"
    );
    expect(events).toHaveAttribute("target", "_blank");
  });

  it("一人でも参加できることを明示する", () => {
    renderWithIntl(<HomeBeginners />);
    // 初心者の最大の不安「一人でも行けるか」に答える文言をステップ内に持つ。
    expect(jaMessages.HomeBeginners.step01.description).toContain("おひとり");
    expect(jaMessages.HomeBeginners.step03.description).toContain("おひとり");
  });

  it("持ち物の注記でパドルレンタルとノーマーキングシューズを案内する", () => {
    renderWithIntl(<HomeBeginners />);
    const note = screen.getByText(jaMessages.HomeBeginners.note);
    expect(note).toBeInTheDocument();
    expect(jaMessages.HomeBeginners.note).toContain("ノーマーキング");
    expect(jaMessages.HomeBeginners.note).toContain("¥500");
  });

  it("レッスンCTAクリックで reservation を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HomeBeginners />);
    const lesson = screen.getByRole("link", {
      name: jaMessages.HomeBeginners.step01.cta,
    });
    lesson.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(lesson);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reservation",
      "home_beginners_lesson",
      jaMessages.HomeBeginners.step01.cta
    );
  });

  it("コート予約CTAクリックで reserveEntry を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HomeBeginners />);
    const reserve = screen.getByRole("link", {
      name: jaMessages.HomeBeginners.step02.cta,
    });
    reserve.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(reserve);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "reserveEntry",
      "home_beginners_reserve",
      jaMessages.HomeBeginners.step02.cta
    );
  });

  it("イベントCTAクリックで externalLink を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HomeBeginners />);
    const events = screen.getByRole("link", {
      name: jaMessages.HomeBeginners.step03.cta,
    });
    events.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(events);
    expect(trackCtaClick).toHaveBeenCalledWith(
      "externalLink",
      "home_beginners_events",
      jaMessages.HomeBeginners.step03.cta
    );
  });
});
