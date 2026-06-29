import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import MobileMenu from "./MobileMenu";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

import type { ReactElement } from "react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, onClick, ...props }: Record<string, unknown>) => (
    <a href={href as string} onClick={onClick as React.MouseEventHandler} {...props}>
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

afterEach(() => {
  document.body.style.overflow = "";
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
    expect(screen.getByText("本八幡駅 徒歩1分・24時間利用可")).toBeInTheDocument();
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
    expect(screen.getByText("1 min from Motoyawata Sta. · Open 24h")).toBeInTheDocument();
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
