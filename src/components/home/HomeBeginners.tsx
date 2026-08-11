"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import {
  EXTERNAL_LINK_PROPS,
  LABOLA_SCHOOL_URL,
  RESERVE_PATH,
  TENNISBEAR_EVENTS_URL,
} from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import type { CtaKey } from "@/lib/analytics/events";

/**
 * 未経験者の入口。
 *
 * 順序は「レッスン → コート予約 → イベント」。一人でコートを借りても
 * 相手がいないため、初心者の実際の入口はレッスンになる。
 * ナンバリングは装飾ではなく、この順に進むという意味を持たせている。
 *
 * 持ち物 (パドル・シューズ) は行動ではないためステップに混ぜず、
 * セクション末尾の注記に置く。
 */
const STEPS = [
  {
    key: "step01",
    href: LABOLA_SCHOOL_URL,
    isExternal: true,
    eventKey: "reservation" as CtaKey,
    location: "home_beginners_lesson",
  },
  {
    key: "step02",
    href: RESERVE_PATH,
    isExternal: false,
    eventKey: "reserveEntry" as CtaKey,
    location: "home_beginners_reserve",
  },
  {
    key: "step03",
    href: TENNISBEAR_EVENTS_URL,
    isExternal: true,
    eventKey: "externalLink" as CtaKey,
    location: "home_beginners_events",
  },
] as const;

export default function HomeBeginners() {
  const t = useTranslations("HomeBeginners");

  return (
    <section className="bg-deep-black py-20 text-text-light lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl font-black tracking-[0.12em] sm:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mt-4 h-[3px] w-14 bg-accent" />
          <p className="mt-8 text-sm leading-[2.1] text-text-light/90">
            {t("lead")}
          </p>
        </motion.div>

        <ol className="mt-12 grid gap-px border-t border-text-gray/15 sm:grid-cols-3 sm:gap-8 sm:border-t-0">
          {STEPS.map((step, i) => {
            const cta = t(`${step.key}.cta`);

            return (
              <motion.li
                key={step.key}
                className="border-b border-text-gray/15 py-8 sm:border-b-0 sm:border-l-2 sm:border-l-accent/20 sm:py-0 sm:pl-6"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-120px" }}
                transition={{ duration: 1.0, delay: 0.1 + i * 0.1, ease: EASE }}
              >
                <span className="font-serif text-3xl font-black text-accent">
                  {t(`${step.key}.number`)}
                </span>
                <h3 className="mt-3 text-base font-bold tracking-[0.05em]">
                  {t(`${step.key}.title`)}
                </h3>
                <p className="mt-3 text-sm leading-[2] text-text-gray">
                  {t(`${step.key}.description`)}
                </p>

                {step.isExternal ? (
                  <a
                    href={step.href}
                    {...EXTERNAL_LINK_PROPS}
                    onClick={() =>
                      trackCtaClick(step.eventKey, step.location, cta)
                    }
                    className="mt-5 inline-flex items-center gap-2 text-xs tracking-[0.15em] text-accent transition-opacity hover:opacity-70"
                  >
                    {cta}
                    <span aria-hidden>→</span>
                  </a>
                ) : (
                  <Link
                    href={step.href}
                    onClick={() =>
                      trackCtaClick(step.eventKey, step.location, cta)
                    }
                    className="mt-5 inline-flex items-center gap-2 text-xs tracking-[0.15em] text-accent transition-opacity hover:opacity-70"
                  >
                    {cta}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </motion.li>
            );
          })}
        </ol>

        <motion.p
          className="mt-12 border-t border-text-gray/15 pt-6 text-xs leading-[2] text-text-gray"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, delay: 0.4, ease: EASE }}
        >
          {t("note")}
        </motion.p>
      </div>
    </section>
  );
}
