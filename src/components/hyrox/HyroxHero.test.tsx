import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxHero from "./HyroxHero";

import type React from "react";

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

// 共通モックは initial を捨てるため、ここでは初期スタイルを data 属性に残して
// 「最初から表示された状態で描画するか(LCP)」を検証できるようにする。
vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const cache: Record<string, unknown> = {};
  const motion = new Proxy(
    {},
    {
      get: (_target, key: string) => {
        cache[key] ??= ReactModule.forwardRef(function MotionStub(
          {
            children,
            initial,
            animate: _animate,
            transition: _transition,
            ...rest
          }: Record<string, unknown>,
          ref,
        ) {
          return ReactModule.createElement(
            key,
            {
              ...rest,
              ref,
              "data-initial":
                initial === undefined ? undefined : JSON.stringify(initial),
            },
            children as React.ReactNode,
          );
        });
        return cache[key];
      },
    },
  );
  return { motion };
});

/** 自身か祖先に opacity:0 から始まるモーションがあるか。 */
function startsHidden(element: Element): boolean {
  const animated = element.closest("[data-initial]");
  if (!animated) return false;
  const initial = JSON.parse(animated.getAttribute("data-initial") ?? "{}") as {
    opacity?: number;
  };
  return initial.opacity === 0;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HyroxHero", () => {
  it("h1 に HYROX・ハイロックス・千葉・本八幡のHYROX公式トレーニングジム をまとめる", () => {
    renderWithIntl(<HyroxHero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName(
      "HYROX ハイロックス 千葉・本八幡のHYROX公式トレーニングジム",
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("en: 和名が空なら出さず、h1 に英語の説明行を含める", () => {
    renderWithIntl(<HyroxHero />, { locale: "en" });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName(
      "HYROX Official HYROX Training Club gym in Motoyawata, Chiba",
    );
    expect(h1.querySelectorAll("span")).toHaveLength(2);
  });

  it("LCP: h1 と3つの動詞は最初から表示された状態で描画する(opacity:0 から始めない)", () => {
    renderWithIntl(<HyroxHero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(startsHidden(h1)).toBe(false);
    for (const word of ["走る。", "鍛える。", "挑戦する。"]) {
      expect(startsHidden(screen.getByText(word))).toBe(false);
    }
  });

  it("LCP: 宣言文(実測の LCP 要素)も最初から表示された状態で描画する", () => {
    renderWithIntl(<HyroxHero />);
    expect(startsHidden(screen.getByText(/すべてを出し切るための舞台/))).toBe(
      false,
    );
  });

  it("CTA のモーションは維持する", () => {
    renderWithIntl(<HyroxHero />);
    expect(startsHidden(screen.getByRole("link", { name: "今すぐ予約" }))).toBe(
      true,
    );
  });

  it("予約ボタンが予約案内ページ（/reserve）へ内部リンクする", () => {
    renderWithIntl(<HyroxHero />);
    const link = screen.getByRole("link", { name: "今すぐ予約" });
    expect(link).toHaveAttribute("href", "/reserve?tab=hyrox");
  });

  it("予約ボタンのクリックで予約入口を計測する", async () => {
    trackCtaClick.mockClear();
    renderWithIntl(<HyroxHero />);

    await userEvent.click(screen.getByRole("link", { name: "今すぐ予約" }));

    expect(trackCtaClick).toHaveBeenCalledWith("reserveEntry", "hyrox_hero", "今すぐ予約");
  });

  it("3枚のヒーロー画像をフェード表示する", () => {
    const { container } = renderWithIntl(<HyroxHero />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(imgs[0].className).toContain("opacity-90");
    expect(imgs[1].className).toContain("opacity-0");
    // 1枚目はスレッドプル画像、3枚目はスタートゲート画像（順番入れ替え後）
    expect(imgs[0]).toHaveAttribute("alt", "スレッドプルに挑むアスリート");
    expect(imgs[2]).toHaveAttribute(
      "alt",
      "HYROXのスタートゲートを駆け抜けるアスリート"
    );
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
