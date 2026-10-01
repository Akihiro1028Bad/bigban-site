"use client";

import { useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";

import { EASE } from "@/constants/motion";
import {
  currentJstDayStartMs,
  formatRaceDates,
  getNextHyroxRace,
  getRaceStatus,
} from "@/lib/hyroxRaces";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

import HyroxSectionTitle from "./HyroxSectionTitle";

interface HyroxNextRaceProps {
  /** サーバーが渡す初回描画用の時刻(ハイドレーションを決定的にする)。 */
  initialNowMs: number;
}

// 時刻は 1 日のあいだ変わらない snapshot で扱うため、購読する外部の変化はない
function subscribeNever(): () => void {
  return () => {};
}

// 次のHYROX大会と、練習用エリアの料金・予約(#program)への誘導。
// 大会が終われば次の大会に自動で切り替わり、全大会が終われば何も描画しない。
export default function HyroxNextRace({ initialNowMs }: HyroxNextRaceProps) {
  const t = useTranslations("HyroxPage.nextRace");
  const locale = useLocale() === "en" ? "en" : "ja";
  // サーバー(と静的 HTML のハイドレーション)は initialNowMs、ブラウザは現在の JST 日付で描画する。
  // /hyrox は静的生成なので、HTML が古くてもハイドレーション後に残り日数・大会が正しくなる。
  const nowMs = useSyncExternalStore(
    subscribeNever,
    currentJstDayStartMs,
    () => initialNowMs,
  );

  const race = getNextHyroxRace(nowMs);
  if (!race) return null;

  const status = getRaceStatus(race, nowMs);

  const handleCtaClick = () => {
    trackCtaClick("contentClick", "hyrox_next_race", "program");
  };

  return (
    <section className="bg-deep-black pb-12 text-text-light lg:pb-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <HyroxSectionTitle title={t("title")} titleJa={t("titleJa")} />
        </motion.div>

        <motion.div
          className="rounded-sm border border-accent/40 bg-accent/[0.08] px-6 py-8 text-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          <p className="font-serif text-2xl font-black tracking-[0.1em] sm:text-3xl">
            {t(`races.${race.id}.name`)}
          </p>
          <p className="mt-2 text-sm text-text-gray">
            {t(`races.${race.id}.location`)}
          </p>
          <p className="mt-1 text-sm font-bold text-text-light">
            {formatRaceDates(race, locale)}
          </p>
          <p className="mt-4 text-base font-bold text-accent">
            {status.kind === "upcoming"
              ? t("daysUntil", { days: status.daysUntil })
              : t("ongoing")}
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-text-gray">
            {t("lead")}
          </p>
          <a
            href="#program"
            onClick={handleCtaClick}
            className="mt-6 inline-block bg-accent px-8 py-3 text-xs font-bold tracking-widest text-deep-black transition-colors hover:bg-accent/90"
          >
            {t("cta")}
          </a>
          <p className="mt-4">
            <a
              href={race.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-gray underline underline-offset-4 hover:text-text-light"
            >
              {t("officialLink")}
            </a>
          </p>
          <p className="mt-3 text-xs text-text-gray">{t("note")}</p>
        </motion.div>
      </div>
    </section>
  );
}
