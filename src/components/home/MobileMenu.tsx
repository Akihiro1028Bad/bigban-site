"use client";

import { useEffect } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { INSTAGRAM_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { EASE } from "@/constants/motion";
import { NAV_ITEMS } from "@/constants/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import LanguageToggle from "./LanguageToggle";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkClick: () => void;
  activeSection: string;
  isJa: boolean;
  onSwitchLocale: (locale: "ja" | "en") => void;
  reserveHref: string;
  navItems?: readonly NavigationItem[];
}

interface NavigationItem {
  id: string;
  kind: "anchor" | "page";
  href: string;
}

function NavItemLink({
  item,
  className,
  onLinkClick,
  children,
}: {
  item: NavigationItem;
  className: string;
  onLinkClick: () => void;
  children: React.ReactNode;
}) {
  return item.kind === "page" ? (
    <Link href={item.href} onClick={onLinkClick} className={className}>
      {children}
    </Link>
  ) : (
    <a href={item.href} onClick={onLinkClick} className={className}>
      {children}
    </a>
  );
}

// パネル内のフォーカス可能要素を特定するためのセレクタ
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
// パネル本体を DOM から取得するためのマーカー（framer-motion モック下でも ref に依存せず参照できる）
const PANEL_MARKER = "data-mobile-menu-panel";
const PANEL_SELECTOR = `[${PANEL_MARKER}="true"]`;

function getFocusableElements(): HTMLElement[] {
  const panel = document.querySelector(PANEL_SELECTOR);
  /* istanbul ignore next -- @preserve ダイアログ表示中は常にパネルが存在 (null分岐は到達不可) */
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// CONCEPT セクションの星雲と同じ色言語(#306EC3)。黄色は動くものと CTA だけに残す。
const NEBULA_GLOW = "rgba(48, 110, 195, 0.18)";

/**
 * 夜空の粒。パネルを「サイトの宇宙の続き」として見せるための静かな点。
 * またたかせず、濃さだけを散らして奥行きを出す(項目の可読性を優先)。
 */
const STARS = [
  { top: "5%", left: "13%", size: 1.5, opacity: 0.45 },
  { top: "12%", left: "64%", size: 1, opacity: 0.28 },
  { top: "20%", left: "33%", size: 1, opacity: 0.22 },
  { top: "28%", left: "84%", size: 1.5, opacity: 0.35 },
  { top: "37%", left: "19%", size: 1, opacity: 0.24 },
  { top: "46%", left: "70%", size: 1, opacity: 0.3 },
  { top: "55%", left: "44%", size: 1.5, opacity: 0.26 },
  { top: "63%", left: "88%", size: 1, opacity: 0.34 },
  { top: "72%", left: "25%", size: 1, opacity: 0.2 },
  { top: "81%", left: "60%", size: 1.5, opacity: 0.38 },
  { top: "91%", left: "16%", size: 1, opacity: 0.25 },
] as const;

const LIST_VARIANTS = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.18 } },
};
const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
};

/**
 * モバイル用メニュー（フロステッド・スライドパネル）。
 * 右からスプリングでスライドイン、項目はカスケード表示。右スワイプで閉じる。
 * 開閉トグル（ハンバーガー→×モーフ）は HomeNavigation 側の MenuToggleButton が担う。
 */
export default function MobileMenu({
  isOpen,
  onClose,
  onLinkClick,
  activeSection,
  isJa,
  onSwitchLocale,
  reserveHref,
  navItems = NAV_ITEMS,
}: MobileMenuProps) {
  const t = useTranslations("Navigation");

  // メニュー表示中は背面のスクロールを固定
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // 開いたらパネル内へフォーカスを移し、閉じたら開く前の要素へ戻す
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const [firstFocusable] = getFocusableElements();
    /* istanbul ignore next -- @preserve 表示中パネルには常にフォーカス可能要素が存在 (undefined分岐は到達不可) */
    firstFocusable?.focus();
    return () => {
      /* istanbul ignore next -- @preserve 開く前は常に要素がフォーカスされている (null分岐は到達不可) */
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // ダイアログ内に Tab フォーカスを閉じ込め、Escape で閉じる
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = getFocusableElements();
    /* istanbul ignore next -- @preserve 表示中パネルには常にフォーカス可能要素が存在 */
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t("mobileMenuAria")}
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            {...{ [PANEL_MARKER]: "true" }}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.x > 90 || info.velocity.x > 500) onClose();
            }}
            className="relative flex h-full w-[86%] max-w-sm flex-col overflow-y-auto border-l border-white/10 bg-deep-black/80 backdrop-blur-2xl"
          >
            {/* 夜空の粒（装飾） */}
            <div
              aria-hidden
              data-mobile-menu-stars="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {STARS.map((star) => (
                <span
                  key={`${star.top}-${star.left}`}
                  className="absolute rounded-full bg-white"
                  style={{
                    top: star.top,
                    left: star.left,
                    width: `${star.size}px`,
                    height: `${star.size}px`,
                    opacity: star.opacity,
                  }}
                />
              ))}
            </div>
            {/* 右上の星雲グロー（装飾） */}
            <div
              aria-hidden
              data-mobile-menu-glow="true"
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
              style={{ background: NEBULA_GLOW }}
            />
            {/* スワイプで閉じるヒント（左端のつまみ） */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1.5 top-1/2 h-12 w-1 -translate-y-1/2 rounded-full bg-white/15"
            />

            {/* ヘッダー行: ロゴ＋言語（閉じるはフローティングトグルが担当） */}
            <div className="relative flex items-center gap-4 px-5 py-5 pr-14">
              <Image
                src="/logos/yoko-neon.png"
                alt=""
                width={120}
                height={26}
                className="h-5 w-auto"
              />
              <LanguageToggle isJa={isJa} onSwitch={onSwitchLocale} />
            </div>

            <motion.nav
              variants={LIST_VARIANTS}
              initial="hidden"
              animate="show"
              className="relative flex flex-1 flex-col divide-y divide-white/10 px-3 py-3"
            >
              {navItems.map((nav) => {
                const jaKey = `${nav.id}Ja`;
                const ja = t(jaKey);
                const isActive = activeSection === nav.id;
                return (
                  <motion.div key={nav.id} variants={ITEM_VARIANTS}>
                    <NavItemLink
                      item={nav}
                      onLinkClick={onLinkClick}
                      className="group relative flex items-center justify-between overflow-hidden rounded-md px-4 py-3.5 active:bg-white/5"
                    >
                      {/* ホバー/アクティブの塗りバー */}
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute inset-0 -z-0 origin-left bg-white/5 transition-transform duration-300 ease-out ${
                          isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        }`}
                      />
                      {/* アクティブの左アクセントバー */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-1/2 z-10 h-6 w-[3px] -translate-y-1/2 bg-accent transition-opacity duration-300 ${
                          isActive ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="relative z-10 flex flex-col leading-tight">
                        <span
                          className={`text-xl font-bold uppercase tracking-wide transition-colors ${
                            isActive ? "text-accent" : "text-text-light group-hover:text-accent"
                          }`}
                        >
                          {t(nav.id)}
                        </span>
                        {ja ? (
                          <span aria-hidden className="mt-0.5 text-[11px] tracking-normal text-text-gray">
                            {ja}
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className={`relative z-10 text-lg transition-all duration-300 group-hover:translate-x-1 ${
                          isActive ? "text-accent opacity-100" : "text-text-gray opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        →
                      </span>
                    </NavItemLink>
                  </motion.div>
                );
              })}
            </motion.nav>

            {/* インフォ行: SNS＋アクセス */}
            <div className="relative mt-2 flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
              <a
                href={INSTAGRAM_URL}
                {...EXTERNAL_LINK_PROPS}
                onClick={() => trackCtaClick("instagram", "mobile_menu", "official")}
                aria-label={t("instagramAria")}
                className="flex items-center gap-2 text-text-gray transition-colors hover:text-accent"
              >
                <InstagramIcon className="h-5 w-5 shrink-0" />
                <span className="text-xs tracking-wide">{t("followUs")}</span>
              </a>
              <span className="text-right text-[11px] leading-tight text-text-gray">
                {t("menuAccess")}
              </span>
            </div>

            <div className="relative px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-3">
              <Link
                href={reserveHref}
                onClick={() => {
                  trackCtaClick("reserveEntry", "mobile_menu_reserve", t("reserveJa"));
                  onLinkClick();
                }}
                className="group flex w-full items-center justify-center gap-2 bg-accent py-4 text-deep-black hover:gap-3 motion-safe:transition-all"
              >
                <span className="text-sm font-bold tracking-[0.2em]">
                  {t("reserveJa")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-deep-black/60">
                  {t("reserve")}
                </span>
                <span aria-hidden className="text-base leading-none">
                  →
                </span>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
