"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveSection } from "@/hooks/useActiveSection";
import { useCrowdfundingPopup } from "@/hooks/useCrowdfundingPopup";
import { RESERVE_PATH } from "@/constants/site";
import CrowdfundingPopup from "./CrowdfundingPopup";
import PromoBanner from "./PromoBanner";

const SECTION_IDS = ["concept", "facility", "services", "pricing", "about", "access"];

const NAV_ITEMS = [
  { id: "concept", kind: "anchor", href: "/#concept" },
  { id: "facility", kind: "anchor", href: "/#facility" },
  { id: "services", kind: "anchor", href: "/#services" },
  { id: "pricing", kind: "anchor", href: "/#pricing" },
  { id: "news", kind: "page", href: "/news" },
  { id: "about", kind: "anchor", href: "/#about" },
  { id: "access", kind: "anchor", href: "/#access" },
] as const;

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

  const handleOpenMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
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

  return (
    <>
    <PromoBanner />
    <header
      className={`fixed top-[var(--promo-banner-h)] left-0 w-full z-50 transition-transform duration-300 ${
        isNavVisible ? "translate-y-0" : "translate-y-0 md:-translate-y-[calc(100%+var(--promo-banner-h))]"
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
              return item.kind === "page" ? (
                <Link key={item.id} href={item.href} className={className}>
                  {t(item.id)}
                </Link>
              ) : (
                <a key={item.id} href={item.href} className={className}>
                  {t(item.id)}
                </a>
              );
            })}
          </nav>

          {/* Desktop: Right side */}
          <div className="hidden md:flex items-center gap-4">
            <LanguageToggle
              isJa={isJa}
              onSwitch={handleSwitchLocale}
            />
            <Link
              href={RESERVE_PATH}
              className="bg-accent text-deep-black px-5 py-2 text-xs font-bold uppercase tracking-widest"
            >
              {t("reserve")}
            </Link>
          </div>

          {/* Mobile: Right side */}
          <div className="flex md:hidden items-center gap-4">
            <LanguageToggle
              isJa={isJa}
              onSwitch={handleSwitchLocale}
            />
            <button
              aria-label={t("openMenu")}
              onClick={handleOpenMenu}
              className="text-text-light"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

    </header>

    {/* Mobile menu overlay - outside header to avoid stacking context issues */}
    <AnimatePresence>
      {isMobileMenuOpen && (
        <motion.div
          role="dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center"
        >
          <button
            aria-label={t("closeMenu")}
            onClick={handleCloseMenu}
            className="absolute top-6 right-6 text-text-light"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <nav className="flex flex-col items-center gap-8">
            {NAV_ITEMS.map((item) => {
              const className = `text-2xl uppercase tracking-widest transition-colors ${
                activeSection === item.id ? "text-accent" : "text-text-light"
              }`;
              return item.kind === "page" ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={handleMobileLinkClick}
                  className={className}
                >
                  {t(item.id)}
                </Link>
              ) : (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={handleMobileLinkClick}
                  className={className}
                >
                  {t(item.id)}
                </a>
              );
            })}
          </nav>

          <Link
            href={RESERVE_PATH}
            onClick={handleMobileLinkClick}
            className="mt-12 bg-accent text-deep-black px-8 py-3 text-sm font-bold uppercase tracking-widest"
          >
            {t("reserve")}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>

    <CrowdfundingPopup isOpen={isCrowdfundingOpen} onClose={closePopup} />
    </>
  );
}

interface LanguageToggleProps {
  isJa: boolean;
  onSwitch: (locale: "ja" | "en") => void;
}

function LanguageToggle({ isJa, onSwitch }: LanguageToggleProps) {
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
