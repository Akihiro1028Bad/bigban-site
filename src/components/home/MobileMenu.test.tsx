import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import MobileMenu from "./MobileMenu";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, onClick, ...props }: Record<string, unknown>) => (
    <a
      href={href as string}
      onClick={(event) => {
        event.preventDefault();
        (onClick as React.MouseEventHandler | undefined)?.(event);
      }}
      {...props}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

// framer-motion の motion.* を素の要素に差し替え、onDragEnd を捕捉してテストから発火できるようにする
const dragState = vi.hoisted(() => ({
  handler: null as
    | null
    | ((event: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => void),
}));

vi.mock("framer-motion", () => {
  const MOTION_PROPS = new Set([
    "initial", "animate", "exit", "variants", "transition", "drag",
    "dragConstraints", "dragElastic", "onDragEnd", "whileInView",
    "whileHover", "whileTap", "viewport", "layout",
  ]);
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const Component = ({ children, ...props }: Record<string, unknown>) => {
          if (typeof props.onDragEnd === "function") {
            // テスト用モック: framer-motion の onDragEnd を捕捉してテストから発火する
            // eslint-disable-next-line react-hooks/immutability
            dragState.handler = props.onDragEnd as typeof dragState.handler;
          }
          const domProps: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(props)) {
            if (!MOTION_PROPS.has(key)) domProps[key] = value;
          }
          const Tag = tag as keyof React.JSX.IntrinsicElements;
          return <Tag {...domProps}>{children as React.ReactNode}</Tag>;
        };
        return Component;
      },
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img {...rest} data-fill={fill ? "true" : undefined} data-priority={priority ? "true" : undefined} />
    );
  },
}));

interface Options {
  isOpen?: boolean;
  activeSection?: string;
  onClose?: () => void;
  onLinkClick?: () => void;
  onSwitchLocale?: (locale: "ja" | "en") => void;
  isJa?: boolean;
  locale?: "ja" | "en";
  reserveHref?: string;
}

function renderMenu(opts: Options = {}) {
  const {
    isOpen = true,
    activeSection = "concept",
    onClose = vi.fn(),
    onLinkClick = vi.fn(),
    onSwitchLocale = vi.fn(),
    isJa = true,
    locale = "ja",
    reserveHref = "/reserve",
  } = opts;
  const messages = locale === "ja" ? jaMessages : enMessages;
  const ui: ReactElement = (
    <MobileMenu
      isOpen={isOpen}
      onClose={onClose}
      onLinkClick={onLinkClick}
      activeSection={activeSection}
      isJa={isJa}
      onSwitchLocale={onSwitchLocale}
      reserveHref={reserveHref}
    />
  );
  const utils = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
  return { ...utils, onClose, onLinkClick, onSwitchLocale };
}

const NAV = [
  { name: "CONCEPT", href: "/#concept" },
  { name: "FACILITY", href: "/#facility" },
  { name: "SERVICES", href: "/#services" },
  { name: "HYROX", href: "/hyrox" },
  { name: "PRICING", href: "/#pricing" },
  { name: "NEWS", href: "/news" },
  { name: "ABOUT", href: "/about" },
  { name: "ACCESS", href: "/#access" },
];

const trackCtaClick = vi.fn();
vi.mock("@/lib/analytics/trackEvent", () => ({
  trackCtaClick: (...args: unknown[]) => trackCtaClick(...args),
}));

afterEach(() => {
  document.body.style.overflow = "";
  trackCtaClick.mockClear();
});

describe("MobileMenu", () => {
  it("isOpen=false では何も表示しない", () => {
    renderMenu({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true でダイアログを表示する", () => {
    renderMenu();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("8つのナビリンクと正しいhrefを表示する", () => {
    renderMenu();
    for (const item of NAV) {
      const link = screen.getByRole("link", { name: item.name });
      expect(link).toHaveAttribute("href", item.href);
    }
  });

  it("アクティブセクションをアクセント色でハイライトする", () => {
    renderMenu({ activeSection: "concept" });
    const active = screen.getByRole("link", { name: "CONCEPT" });
    const inactive = screen.getByRole("link", { name: "FACILITY" });
    expect(active.querySelector(".text-accent")).not.toBeNull();
    expect(inactive.querySelector(".text-accent")).toBeNull();
  });

  it("ナビリンククリックで onLinkClick が呼ばれる", () => {
    const { onLinkClick } = renderMenu();
    fireEvent.click(screen.getByRole("link", { name: "CONCEPT" }));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("背景（オーバーレイ）クリックで onClose が呼ばれる", () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("パネル内クリックは onClose を呼ばない（伝播停止）", () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole("link", { name: /RESERVE/ }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("RESERVE は渡された reserveHref を内部の予約案内ページへのリンクとして使う", () => {
    renderMenu({ reserveHref: "/reserve" });
    const reserve = screen.getByRole("link", { name: /RESERVE/ });
    expect(reserve).toHaveAttribute("href", "/reserve");
    expect(reserve).not.toHaveAttribute("target", "_blank");
  });

  it("Instagram リンクとアクセス情報を表示する", () => {
    renderMenu();
    const ig = screen.getByRole("link", { name: "THE PICKLE BANG THEORY の Instagram" });
    expect(ig).toHaveAttribute("href", "https://www.instagram.com/thepicklebangtheory");
    expect(ig).toHaveAttribute("target", "_blank");
    expect(screen.getByText("本八幡駅 徒歩1分・6:00-23:00営業")).toBeInTheDocument();
  });

  it("Instagramクリックを計測する", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("link", { name: "THE PICKLE BANG THEORY の Instagram" }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "instagram",
      "mobile_menu",
      "official",
    );
  });

  it("RESERVEクリックで予約入口を計測し onLinkClick を呼ぶ", () => {
    const { onLinkClick } = renderMenu();

    fireEvent.click(screen.getByRole("link", { name: /RESERVE/ }));

    expect(trackCtaClick).toHaveBeenCalledWith(
      "reserveEntry",
      "mobile_menu_reserve",
      "予約",
    );
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("言語トグルで onSwitchLocale が呼ばれる（EN/JP 両方）", () => {
    const { onSwitchLocale } = renderMenu({ isJa: true });
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(onSwitchLocale).toHaveBeenCalledWith("en");
    fireEvent.click(screen.getByRole("button", { name: "JP" }));
    expect(onSwitchLocale).toHaveBeenCalledWith("ja");
  });

  it("右に大きくスワイプすると onClose が呼ばれる", () => {
    const { onClose } = renderMenu();
    dragState.handler?.(null, { offset: { x: 120, y: 0 }, velocity: { x: 0, y: 0 } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("素早く右にスワイプすると onClose が呼ばれる（速度しきい値）", () => {
    const { onClose } = renderMenu();
    dragState.handler?.(null, { offset: { x: 10, y: 0 }, velocity: { x: 800, y: 0 } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("わずかなドラッグでは onClose が呼ばれない", () => {
    const { onClose } = renderMenu();
    dragState.handler?.(null, { offset: { x: 10, y: 0 }, velocity: { x: 0, y: 0 } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("表示中は body のスクロールを固定し、閉じると解除する", () => {
    const { rerender } = renderMenu();
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <MobileMenu
          isOpen={false}
          onClose={vi.fn()}
          onLinkClick={vi.fn()}
          activeSection="concept"
          isJa
          onSwitchLocale={vi.fn()}
          reserveHref="/reserve"
        />
      </NextIntlClientProvider>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("英語ロケールではアクセス情報が英語になる", () => {
    renderMenu({ locale: "en", isJa: false });
    expect(
      screen.getByText("1 min from Motoyawata Sta. · Open 6:00-23:00")
    ).toBeInTheDocument();
  });

  // --- 夜空の続きとしてのパネル ---

  it("右上のグローはブランドブルーの星雲にし、黄色(accent)で光らせない", () => {
    renderMenu();
    const glow = document.querySelector<HTMLElement>('[data-mobile-menu-glow="true"]');
    expect(glow).not.toBeNull();
    // CONCEPT の星雲と同じ色言語(#306EC3)。黄色は動くものと CTA だけに残す。
    expect(glow?.style.background).toMatch(/48,\s*110,\s*195/);
    const panel = document.querySelector('[data-mobile-menu-panel="true"]');
    expect(panel?.querySelector('[class*="bg-accent/"]')).toBeNull();
  });

  it("グローと星は装飾なので支援技術から隠し、操作も妨げない", () => {
    renderMenu();
    for (const selector of ['[data-mobile-menu-glow="true"]', '[data-mobile-menu-stars="true"]']) {
      const layer = document.querySelector<HTMLElement>(selector);
      expect(layer).not.toBeNull();
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer?.className).toContain("pointer-events-none");
    }
  });

  it("パネルにうっすら星を敷くが、またたかせない", () => {
    renderMenu();
    const stars = document.querySelector<HTMLElement>('[data-mobile-menu-stars="true"]');
    const dots = Array.from(stars?.children ?? []) as HTMLElement[];
    expect(dots.length).toBeGreaterThanOrEqual(8);
    for (const dot of dots) {
      // 演出は控えめに。またたきアニメは持たせない。
      expect(dot.className).not.toMatch(/animate-|transition/);
      const opacity = Number(dot.style.opacity);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThanOrEqual(0.5);
    }
    // 一様な明るさに並べず、粒ごとに濃さを散らす。
    expect(new Set(dots.map((dot) => dot.style.opacity)).size).toBeGreaterThan(1);
  });

  // --- 項目の区切りとタッチの手応え ---

  it("ナビ項目の「間」だけにヘアラインを引く", () => {
    renderMenu();
    const nav = screen.getByRole("dialog").querySelector("nav");
    // divide-y は項目間だけに線を置く(先頭の上・末尾の下には引かれない)。
    expect(nav?.className).toContain("divide-y");
    expect(nav?.className).toContain("divide-white/10");
    const rows = Array.from(nav?.children ?? []) as HTMLElement[];
    expect(rows.length).toBe(NAV.length);
    for (const row of rows) {
      // 項目側に個別の枠線を持たせない(先頭・末尾に線が出てしまう)。
      expect(row.className).not.toMatch(/border-/);
    }
    // 隙間を空けるとヘアラインが宙に浮くため、行同士は詰めて並べる。
    expect(nav?.className).not.toMatch(/gap-/);
  });

  it("タッチでも手応えが出るよう、各項目に押下時の背景変化を持たせる", () => {
    renderMenu();
    for (const item of NAV) {
      // 塗りバーと矢印は hover 依存でタッチでは出ないため、active: を別に用意する。
      expect(screen.getByRole("link", { name: item.name }).className).toContain("active:bg-white/5");
    }
  });

  // --- 予約CTA直上の営業時間 ---

  it("予約CTAの直上に営業時間を添える", () => {
    renderMenu();
    const hours = screen.getByText("営業時間 6:00–23:00");
    const reserve = screen.getByRole("link", { name: /RESERVE/ });
    // 予約を押す直前に開いている時間が目に入るよう、CTA より前に置く。
    expect(
      hours.compareDocumentPosition(reserve) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(hours.className).toContain("text-text-gray");
  });

  it("英語ロケールでは営業時間も英語表記にする", () => {
    renderMenu({ locale: "en", isJa: false });
    expect(screen.getByText("OPEN DAILY 6:00–23:00")).toBeInTheDocument();
  });

  // --- アクセシビリティ: モーダルダイアログのフォーカス管理 ---

  function panelFocusables(): HTMLElement[] {
    const panel = document.querySelector('[data-mobile-menu-panel="true"]');
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  it("ダイアログに aria-modal=true を設定する", () => {
    renderMenu();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("開いたときパネル内の最初の要素へフォーカスを移す", () => {
    renderMenu();
    const focusables = panelFocusables();
    expect(focusables.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("最後の要素で Tab すると最初へフォーカスが戻る", () => {
    renderMenu();
    const focusables = panelFocusables();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("中間要素での Tab はフォーカスをラップしない", () => {
    renderMenu();
    const focusables = panelFocusables();
    const middle = focusables[1];
    middle.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(document.activeElement).toBe(middle);
  });

  it("最初の要素で Shift+Tab すると最後へフォーカスが移る", () => {
    renderMenu();
    const focusables = panelFocusables();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("中間要素での Shift+Tab はフォーカスをラップしない", () => {
    renderMenu();
    const focusables = panelFocusables();
    const middle = focusables[1];
    middle.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(middle);
  });

  it("Escape キーで onClose が呼ばれる", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab/Escape 以外のキーは無視する", () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("閉じると開く前にフォーカスしていた要素へ戻す", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = renderMenu();
    // 開いている間はパネル内へフォーカスが移る
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <MobileMenu
          isOpen={false}
          onClose={vi.fn()}
          onLinkClick={vi.fn()}
          activeSection="concept"
          isJa
          onSwitchLocale={vi.fn()}
          reserveHref="/reserve"
        />
      </NextIntlClientProvider>
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
