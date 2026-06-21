import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxHero from "./HyroxHero";

import type React from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("HyroxHero", () => {
  it("見出し HYROX と和名 ハイロックス を表示する", () => {
    renderWithIntl(<HyroxHero />);
    expect(screen.getByRole("heading", { name: "HYROX" })).toBeInTheDocument();
    expect(screen.getByText("ハイロックス")).toBeInTheDocument();
  });

  it("予約ページ(/reserve)への CTA を表示する", () => {
    renderWithIntl(<HyroxHero />);
    const cta = screen.getByRole("link", { name: "体験予約" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/reserve?tab=hyrox");
  });

  it("3枚のヒーロー画像をフェード表示する", () => {
    const { container } = renderWithIntl(<HyroxHero />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0].className).toContain("opacity-90");
    expect(imgs[1].className).toContain("opacity-0");
    expect(
      screen.getByAltText("HYROXのスタートゲートを駆け抜けるアスリート")
    ).toBeInTheDocument();
  });

  it("一定時間ごとに表示画像を切り替える", () => {
    vi.useFakeTimers();
    const { container } = renderWithIntl(<HyroxHero />);
    act(() => {
      vi.advanceTimersByTime(5500);
    });
    const imgs = container.querySelectorAll("img");
    expect(imgs[1].className).toContain("opacity-90");
    expect(imgs[0].className).toContain("opacity-0");
  });

  it("prefers-reduced-motion では自動切替しない", () => {
    vi.useFakeTimers();
    (window.matchMedia as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })
    );
    const { container } = renderWithIntl(<HyroxHero />);
    act(() => {
      vi.advanceTimersByTime(11000);
    });
    const imgs = container.querySelectorAll("img");
    expect(imgs[0].className).toContain("opacity-90");
  });
});
