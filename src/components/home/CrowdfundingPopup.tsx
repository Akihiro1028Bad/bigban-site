"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { CAMPFIRE_URL, EXTERNAL_LINK_PROPS } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface CrowdfundingPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CrowdfundingPopup({
  isOpen,
  onClose,
}: CrowdfundingPopupProps) {
  const t = useTranslations("CrowdfundingPopup");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([aria-hidden="true"]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        /* istanbul ignore next -- defensive guard: dialog always has focusable elements */
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crowdfunding-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        >
          <button
            data-testid="crowdfunding-backdrop"
            className="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm cursor-default"
            onClick={onClose}
            tabIndex={-1}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 1.0, delay: 0.2, ease: EASE }}
            className="relative max-w-md w-full bg-deep-black border border-accent/30 border-t-2 border-t-accent overflow-hidden"
          >
            <button
              ref={closeButtonRef}
              aria-label={t("close")}
              onClick={onClose}
              className="absolute top-3 right-3 z-10 text-text-gray hover:text-text-light motion-safe:transition-colors bg-black/50 rounded-full w-8 h-8 flex items-center justify-center"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="relative aspect-[16/10] w-full">
              <Image
                src="/images/crowdfunding.jpg"
                alt={t("imageAlt")}
                fill
                sizes="(min-width: 640px) 28rem, 100vw"
                className="object-cover"
              />
            </div>

            <div className="p-6 sm:p-8 space-y-4">
              <h2
                id="crowdfunding-title"
                className="font-serif text-3xl font-black text-accent tracking-[0.1em]"
              >
                {t("headline")}
              </h2>
              <p className="text-sm text-text-dark leading-relaxed">
                {t("subheadline")}
              </p>
              <p
                role="status"
                className="bg-accent/10 border border-accent/40 text-accent text-sm font-bold px-4 py-2 leading-relaxed"
              >
                {t("bonus")}
              </p>
              <a
                href={CAMPFIRE_URL}
                {...EXTERNAL_LINK_PROPS}
                onClick={() => trackCtaClick("externalLink", "crowdfunding_popup", "campfire")}
                aria-label={t("ctaAriaLabel")}
                className="block bg-accent text-deep-black font-bold uppercase tracking-widest text-sm px-8 py-3 text-center hover:bg-accent/90 motion-safe:transition-colors"
              >
                {t("cta")}
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
