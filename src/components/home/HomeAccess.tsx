"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

const MAPS_EMBED_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3240.!2d139.924!3d35.726!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z5Y2D6JGJ55yM5biC5bed5biC5YWr5bmhMi0xNi02!5e0!3m2!1sja!2sjp!4v1";

// 埋め込み地図はクリックを親で計測できないため、来店意図を拾う「マップで開く」リンクを併設する。
const MAPS_PLACE_URL = "https://maps.app.goo.gl/Hjm2wMkZ6SXVoJKq7";

const ROUTE_KEYS = ["jr", "toei", "keisei"] as const;

export default function HomeAccess() {
  const t = useTranslations("HomeAccess");

  return (
    <section id="access" className="bg-off-white text-text-dark py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Google Maps */}
        <motion.div
          className="mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <iframe
            src={MAPS_EMBED_URL}
            title={t("mapTitle")}
            className="h-[300px] md:h-[450px] w-full rounded-lg"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </motion.div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
          {/* Left: Address */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, ease: EASE }}
          >
            <p className="text-lg font-semibold mb-4">{t("companyName")}</p>
            <div className="space-y-1 text-base leading-relaxed">
              <p>{t("postalCode")}</p>
              <p>{t("address")}</p>
              <p>{t("hours")}</p>
            </div>
            <a
              href={MAPS_PLACE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCtaClick("access", "home_access")}
              className="mt-4 inline-flex items-center gap-1.5 text-accent text-sm font-semibold hover:underline"
            >
              {t("openInMaps")} →
            </a>
          </motion.div>

          {/* Right: Access routes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
          >
            <ul>
              {ROUTE_KEYS.map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between py-4 border-b border-text-gray/30"
                >
                  <span>
                    <span className="font-semibold">{t(`routes.${key}.line`)}</span>
                    {t(`routes.${key}.station`)} —{" "}
                    <span className="text-accent font-semibold">
                      {t(`routes.${key}.walkTime`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Parking notice */}
            <p className="mt-6 text-text-gray text-sm">
              {t("parkingNote")}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
