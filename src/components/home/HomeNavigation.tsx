"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useActiveSection } from "@/hooks/useActiveSection";
import { useCrowdfundingPopup } from "@/hooks/useCrowdfundingPopup";
import { RESERVE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import { NAV_ITEMS, SECTION_IDS } from "@/constants/navigation";
import CrowdfundingPopup from "./CrowdfundingPopup";
import PromoBanner from "./PromoBanner";
import MobileMenu from "./MobileMenu";
import MenuToggleButton from "./MenuToggleButton";
import LanguageToggle from "./LanguageToggle";

export default function HomeNavigation() {
  const locale = useLocale();
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const activeSection = useActiveSection(SECTION_IDS);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isOpen: isCrowdfundingOpen, closePopup } = useCrowdfundingPopup();

  const handleLogoClick = useCallback(
    (e: React.MouseEvent) => {
      if (pathname === "/") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [pathname]
  );
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;
      if (currentY < 100) {
        setIsNavVisible(true);
      } else if (currentY > lastScrollY.current) {
        setIsNavVisible(false);
      } else {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentY;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleToggleMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const handleMobileLinkClick = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleSwitchLocale = useCallback(
    (targetLocale: "ja" | "en") => {
      if (targetLocale !== locale) {
        router.push(pathname, { locale: targetLocale });
      }
    },
    [locale, pathname, router]
  );

  const isJa = locale === "ja";
  const isHyrox = pathname === "/hyrox";

  return (
    <>
    {!isHyrox && <PromoBanner />}
    <header
      className={`fixed left-0 w-full z-50 transition-transform duration-300 ${
        isHyrox ? "top-0" : "top-[var(--promo-banner-h)]"
      } ${
        isNavVisible
          ? "translate-y-0"
          : isHyrox
            ? "translate-y-0 md:-translate-y-full"
            : "translate-y-0 md:-translate-y-[calc(100%+var(--promo-banner-h))]"
      }`}
    >
      <div className="site-header-bg backdrop-blur-md bg-deep-black/80">
        <div className="mx-auto flex items-center justify-between px-6 py-4 max-w-7xl">
          {/* Logo */}
          <Link href="/" onClick={handleLogoClick}>
            <Image
              src="/logos/yoko-neon.png"
              alt={tCommon("logoAlt")}
              width={180}
              height={40}
              className="h-6 w-auto sm:h-8 md:h-10"
            />
          </Link>

          {/* Desktop: Nav links */}
          <nav
            aria-label={t("mainNav")}
            className="hidden md:flex items-center gap-8"
          >
            {NAV_ITEMS.map((item) => {
              const className = `text-sm uppercase tracking-widest transition-colors hover:text-text-light ${
                activeSection === item.id ? "text-accent" : "text-text-gray"
              }`;
              const ja = t(`${item.id}Ja`);
              const label = (
                <span className="flex flex-col items-center leading-tight">
                  <span>{t(item.id)}</span>
                  {ja ? (
                    <span
                      aria-hidden
                      className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-text-gray"
                    >
                      {ja}
                    </span>
                  ) : null}
                </span>
              );
              return item.kind === "page" ? (
                <Link key={item.id} href={item.href} className={className}>
                  {label}
                </Link>
              ) : (
                <a key={item.id} href={item.href} className={className}>
                  {label}
                </a>
              );
            })}
          </nav>

          {/* Mobile: 予約ボタン（常時表示・主要コンバージョン導線）。
              右上のフローティングメニュートグルと重ならないよう右マージンを確保 */}
          <a
            href={RESERVE_URL}
            {...EXTERNAL_LINK_PROPS}
            className="mr-12 bg-accent px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-deep-black md:hidden"
          >
            {t("reserve")}
          </a>

          {/* Desktop: Right side */}
          <div className="hidden md:flex items-center gap-4">
            <LanguageToggle
              isJa={isJa}
              onSwitch={handleSwitchLocale}
            />
            <a
              href={RESERVE_URL}
              {...EXTERNAL_LINK_PROPS}
              className="bg-accent text-deep-black px-5 py-2 text-xs font-bold uppercase tracking-widest"
            >
              {t("reserve")}
            </a>
          </div>

        </div>
      </div>

    </header>

    {/* Mobile: フローティングのメニュートグル（モーフィング、オーバーレイより前面） */}
    <MenuToggleButton
      isOpen={isMobileMenuOpen}
      onClick={handleToggleMenu}
      labelOpen={t("openMenu")}
      labelClose={t("closeMenu")}
      className={`fixed right-4 z-[70] md:hidden ${
        isHyrox ? "top-2.5" : "top-[calc(var(--promo-banner-h)+0.5rem)]"
      }`}
    />

    {/* Mobile menu overlay - outside header to avoid stacking context issues */}
    <MobileMenu
      isOpen={isMobileMenuOpen}
      onClose={handleCloseMenu}
      onLinkClick={handleMobileLinkClick}
      activeSection={activeSection}
      isJa={isJa}
      onSwitchLocale={handleSwitchLocale}
    />

    <CrowdfundingPopup isOpen={isCrowdfundingOpen} onClose={closePopup} />
    </>
  );
}
