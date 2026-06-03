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
  { name: "ABOUT", href: "/#about" },
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
    fireEvent.click(screen.getByRole("link", { name: "RESERVE" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("RESERVE 外部リンクを表示する", () => {
    renderMenu();
    const reserve = screen.getByRole("link", { name: /RESERVE/ });
    expect(reserve).toHaveAttribute("href", "https://reserva.be/tpbt");
    expect(reserve).toHaveAttribute("target", "_blank");
    expect(reserve).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("Instagram リンクとアクセス情報を表示する", () => {
    renderMenu();
    const ig = screen.getByRole("link", { name: "THE PICKLE BANG THEORY の Instagram" });
    expect(ig).toHaveAttribute("href", "https://www.instagram.com/thepicklebangtheory");
    expect(ig).toHaveAttribute("target", "_blank");
    expect(screen.getByText("本八幡駅 徒歩1分・24時間利用可")).toBeInTheDocument();
  });

  it("言語トグルで onSwitchLocale が呼ばれる", () => {
    const { onSwitchLocale } = renderMenu({ isJa: true });
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(onSwitchLocale).toHaveBeenCalledWith("en");
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
        />
      </NextIntlClientProvider>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("英語ロケールではアクセス情報が英語になる", () => {
    renderMenu({ locale: "en", isJa: false });
    expect(screen.getByText("1 min from Motoyawata Sta. · Open 24h")).toBeInTheDocument();
  });
});
