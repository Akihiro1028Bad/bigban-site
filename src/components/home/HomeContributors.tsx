"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { EASE } from "@/constants/motion";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

/**
 * トップページからクラウドファンディング支援者ページへの導線。
 *
 * 掲載しているのはクラウドファンディング支援者の**うち、ウェブ掲載のリターンを選んだ方**に
 * 限られる。支援者はほかにも大勢いるため、次の 2 つを避けている。
 *
 * - 人数を出す: それ以外の支援者を数から除外して読ませてしまう
 * - ロゴを掲げる: ロゴ提出は 3 社しかなく、その 3 社が代表的な支援者に見えてしまう
 *
 * したがって他セクションのような主張の強い扱いはせず、詳細ページへ送る静かな案内に留める。
 */
export default function HomeContributors() {
  const t = useTranslations("HomeContributors");
  const kickerJa = t("kickerJa");

  return (
    <section className="bg-deep-black text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12 lg:py-24">
        <motion.div
          className="max-w-2xl border-t border-text-gray/20 pt-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-gray">
            {t("kicker")}
            {kickerJa ? <span className="ml-2 normal-case">{kickerJa}</span> : null}
          </p>

          <h2 className="mt-3 text-lg font-semibold tracking-[0.08em]">{t("titleJa")}</h2>

          <p className="mt-4 text-sm leading-[2.1] text-text-gray">{t("description")}</p>

          <Link
            href="/contributors"
            onClick={() =>
              trackCtaClick("contentClick", "home_contributors", "contributors")
            }
            className="mt-6 inline-flex items-center gap-2 text-xs tracking-[0.15em] text-accent transition-opacity hover:opacity-70"
          >
            {t("cta")}
            <span aria-hidden>→</span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
