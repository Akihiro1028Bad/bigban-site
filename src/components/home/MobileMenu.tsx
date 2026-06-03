"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RESERVE_URL, INSTAGRAM_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { NAV_ITEMS } from "./HomeNavigation";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export type MobileMenuVariant = "A" | "B" | "C";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkClick: () => void;
  activeSection: string;
  isJa: boolean;
  onSwitchLocale: (locale: "ja" | "en") => void;
  variant: MobileMenuVariant;
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface MenuLangToggleProps {
  isJa: boolean;
  onSwitch: (locale: "ja" | "en") => void;
}

function MenuLangToggle({ isJa, onSwitch }: MenuLangToggleProps) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => onSwitch("ja")}
        aria-pressed={isJa}
        className={isJa ? "text-text-light cursor-default" : "text-text-gray hover:text-accent motion-safe:transition-colors cursor-pointer"}
      >
        JP
      </button>
      <span className="text-text-gray">/</span>
      <button
        onClick={() => onSwitch("en")}
        aria-pressed={!isJa}
        className={isJa ? "text-text-gray hover:text-accent motion-safe:transition-colors cursor-pointer" : "text-text-light cursor-default"}
      >
        EN
      </button>
    </div>
  );
}

export default function MobileMenu({
  isOpen,
  onClose,
  onLinkClick,
  activeSection,
  isJa,
  onSwitchLocale,
  variant,
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {variant === "A" && (
            <VariantEditorial
              t={t}
              onClose={onClose}
              onLinkClick={onLinkClick}
              activeSection={activeSection}
              isJa={isJa}
              onSwitchLocale={onSwitchLocale}
            />
          )}
          {variant === "B" && (
            <VariantKinetic
              t={t}
              onClose={onClose}
              onLinkClick={onLinkClick}
              activeSection={activeSection}
              isJa={isJa}
              onSwitchLocale={onSwitchLocale}
            />
          )}
          {variant === "C" && (
            <VariantFrosted
              t={t}
              onClose={onClose}
              onLinkClick={onLinkClick}
              activeSection={activeSection}
              isJa={isJa}
              onSwitchLocale={onSwitchLocale}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

type Translate = ReturnType<typeof useTranslations>;

interface VariantProps {
  t: Translate;
  onClose: () => void;
  onLinkClick: () => void;
  activeSection: string;
  isJa: boolean;
  onSwitchLocale: (locale: "ja" | "en") => void;
}

function NavItemLink({
  item,
  className,
  onLinkClick,
  children,
}: {
  item: (typeof NAV_ITEMS)[number];
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

/* ── 案A: エディトリアル・ナンバード ───────────────────────── */
function VariantEditorial({ t, onClose, onLinkClick, activeSection, isJa, onSwitchLocale }: VariantProps) {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
  };
  const row = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };

  return (
    <motion.div
      role="dialog"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-deep-black"
    >
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between px-6 py-5">
        <span className="font-serif text-xs tracking-[0.3em] text-text-gray">MENU</span>
        <div className="flex items-center gap-5">
          <MenuLangToggle isJa={isJa} onSwitch={onSwitchLocale} />
          <button aria-label={t("closeMenu")} onClick={onClose} className="text-text-light">
            <CloseIcon />
          </button>
        </div>
      </div>

      <motion.nav
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col justify-center gap-1 px-6 py-4"
      >
        {NAV_ITEMS.map((item, i) => {
          const ja = t(`${item.id}Ja`);
          const isActive = activeSection === item.id;
          return (
            <motion.div key={item.id} variants={row}>
              <NavItemLink
                item={item}
                onLinkClick={onLinkClick}
                className={`group flex items-baseline gap-4 border-l-2 py-2 pl-4 transition-colors ${
                  isActive ? "border-accent" : "border-transparent"
                }`}
              >
                <span className={`font-serif text-xs tabular-nums ${isActive ? "text-accent" : "text-text-gray"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex flex-col leading-tight">
                  <span
                    className={`text-3xl font-black uppercase tracking-wide transition-colors ${
                      isActive ? "text-accent" : "text-text-light group-hover:text-accent"
                    }`}
                  >
                    {t(item.id)}
                  </span>
                  {ja ? (
                    <span aria-hidden className="mt-0.5 text-[11px] tracking-normal text-text-gray">
                      {ja}
                    </span>
                  ) : null}
                </span>
              </NavItemLink>
            </motion.div>
          );
        })}
      </motion.nav>

      <div className="px-6 pb-8 pt-2">
        <a
          href={RESERVE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="block w-full bg-accent py-4 text-center text-sm font-bold uppercase tracking-[0.2em] text-deep-black"
        >
          {t("reserve")}
        </a>
      </div>
    </motion.div>
  );
}

/* ── 案B: キネティック・フルスクリーン ───────────────────────── */
function VariantKinetic({ t, onClose, onLinkClick, activeSection, isJa, onSwitchLocale }: VariantProps) {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
  };
  const row = {
    hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } },
  };

  return (
    <motion.div
      role="dialog"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-deep-black"
    >
      <div className="flex items-center justify-between px-6 py-5">
        <MenuLangToggle isJa={isJa} onSwitch={onSwitchLocale} />
        <button aria-label={t("closeMenu")} onClick={onClose} className="text-text-light">
          <CloseIcon />
        </button>
      </div>

      <motion.nav
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col justify-center gap-2 px-6 py-4"
      >
        {NAV_ITEMS.map((item, i) => {
          const ja = t(`${item.id}Ja`);
          const isActive = activeSection === item.id;
          return (
            <motion.div key={item.id} variants={row}>
              <NavItemLink
                item={item}
                onLinkClick={onLinkClick}
                className="group relative flex items-center overflow-hidden py-2"
              >
                {/* アクセントのワイプ */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1 left-0 -z-0 w-full origin-left scale-x-0 bg-accent/15 transition-transform duration-500 ease-out group-hover:scale-x-100 group-active:scale-x-100"
                />
                <span
                  aria-hidden
                  className={`relative z-10 mr-3 font-serif text-xs tabular-nums ${isActive ? "text-accent" : "text-text-gray"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative z-10 flex flex-col leading-none">
                  <span
                    className={`text-4xl font-black uppercase italic tracking-tight transition-colors ${
                      isActive ? "text-accent" : "text-text-light group-hover:text-accent"
                    }`}
                  >
                    {t(item.id)}
                  </span>
                  {ja ? (
                    <span aria-hidden className="mt-1 text-xs not-italic tracking-normal text-text-gray">
                      {ja}
                    </span>
                  ) : null}
                </span>
                {isActive ? (
                  <span aria-hidden className="relative z-10 ml-auto h-2 w-2 rounded-full bg-accent" />
                ) : null}
              </NavItemLink>
            </motion.div>
          );
        })}
      </motion.nav>

      <div className="px-6 pb-8 pt-2">
        <a
          href={RESERVE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="block w-full bg-accent py-4 text-center text-sm font-black uppercase tracking-[0.25em] text-deep-black"
        >
          {t("reserve")}
        </a>
      </div>
    </motion.div>
  );
}

/* ── 案C: フロステッド・スライドパネル（改良版） ───────────────── */
function VariantFrosted({ t, onClose, onLinkClick, activeSection, isJa, onSwitchLocale }: VariantProps) {
  const list = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.18 } },
  };
  const item = {
    hidden: { opacity: 0, x: 28 },
    show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
  };

  return (
    <motion.div
      role="dialog"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
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
        {/* 右上のアクセントグロー */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/15 blur-3xl"
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
          <MenuLangToggle isJa={isJa} onSwitch={onSwitchLocale} />
        </div>

        <motion.nav
          variants={list}
          initial="hidden"
          animate="show"
          className="relative flex flex-1 flex-col gap-0.5 px-3 py-3"
        >
          {NAV_ITEMS.map((nav) => {
            const ja = t(`${nav.id}Ja`);
            const isActive = activeSection === nav.id;
            return (
              <motion.div key={nav.id} variants={item}>
                <NavItemLink
                  item={nav}
                  onLinkClick={onLinkClick}
                  className="group relative flex items-center justify-between overflow-hidden rounded-md px-4 py-3.5"
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
          <a
            href={RESERVE_URL}
            {...EXTERNAL_LINK_PROPS}
            className="group flex w-full items-center justify-center gap-2 bg-accent py-4 text-sm font-bold uppercase tracking-[0.2em] text-deep-black transition-all hover:gap-3"
          >
            {t("reserve")}
            <span aria-hidden className="text-base leading-none">
              →
            </span>
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
