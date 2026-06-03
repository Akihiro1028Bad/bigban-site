"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RESERVE_URL, INSTAGRAM_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { EASE } from "@/constants/motion";
import { NAV_ITEMS } from "./HomeNavigation";
import LanguageToggle from "./LanguageToggle";

interface MobileMenuProps {
  isOpen: boolean;
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
              <LanguageToggle isJa={isJa} onSwitch={onSwitchLocale} />
            </div>

            <motion.nav
              variants={LIST_VARIANTS}
              initial="hidden"
              animate="show"
              className="relative flex flex-1 flex-col gap-0.5 px-3 py-3"
            >
              {NAV_ITEMS.map((nav) => {
                const ja = t(`${nav.id}Ja`);
                const isActive = activeSection === nav.id;
                return (
                  <motion.div key={nav.id} variants={ITEM_VARIANTS}>
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
      )}
    </AnimatePresence>
  );
}
