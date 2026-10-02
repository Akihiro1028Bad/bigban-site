"use client";

import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { EASE, revealInitial } from "@/constants/motion";
import { EXTERNAL_LINK_PROPS, GOOGLE_BUSINESS_PROFILE_URL } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";
import HyroxSectionTitle from "./HyroxSectionTitle";

const ROUTE_KEYS = ["jr", "toei", "keisei"] as const;

export default function HyroxAccess() {
  const t = useTranslations("HyroxPage.access");
  // 住所・路線・営業時間は HomeAccess の文言を単一ソースとして共有する。
  const home = useTranslations("HomeAccess");
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="bg-deep-black py-12 text-text-light lg:py-16">
      <motion.div
        className="mx-auto max-w-4xl px-6 lg:px-12"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <div className="text-center">
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <p className="text-lg font-semibold">{home("companyName")}</p>
            <div className="mt-3 space-y-1 text-sm leading-relaxed text-text-light/75">
              <p>{home("postalCode")}</p>
              <p>{home("address")}</p>
              <p>{home("hours")}</p>
            </div>
            <a
              href={GOOGLE_BUSINESS_PROFILE_URL}
              {...EXTERNAL_LINK_PROPS}
              onClick={() => trackCtaClick("access", "hyrox_access")}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              {home("openInMaps")}
              <span aria-hidden="true">→</span>
              <span className="sr-only">{t("newTab")}</span>
            </a>
          </div>

          <div>
            <ul>
              {ROUTE_KEYS.map((key) => (
                <li
                  key={key}
                  className="border-b border-white/10 py-4 text-sm"
                >
                  <span className="font-semibold">
                    {home(`routes.${key}.line`)}
                  </span>
                  {home(`routes.${key}.station`)} —{" "}
                  <span className="font-semibold text-accent">
                    {home(`routes.${key}.walkTime`)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-text-gray">{home("parkingNote")}</p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
