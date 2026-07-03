"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

export default function ReserveInfo() {
  const t = useTranslations("Reserve");
  // t.raw は unknown を返すため、システム境界として配列であることを検証する。
  const rawNotes = t.raw("notes.items");
  const notes = Array.isArray(rawNotes) ? (rawNotes as string[]) : [];

  return (
    <section className="bg-deep-black pb-20 lg:pb-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          {/* INFORMATION */}
          <div>
            <h2 className="text-xs tracking-[0.3em] text-accent mb-6">
              {t("info.heading")}
            </h2>
            <dl className="space-y-5">
              <div>
                <dt className="text-xs tracking-[0.2em] text-text-gray mb-1">
                  {t("info.hoursLabel")}
                </dt>
                <dd className="text-text-light">{t("info.hoursValue")}</dd>
              </div>
              <div>
                <dt className="text-xs tracking-[0.2em] text-text-gray mb-1">
                  {t("info.accessLabel")}
                </dt>
                <dd className="text-text-light">{t("info.accessStation")}</dd>
                <dd className="text-text-light/70 text-sm mt-1">
                  {t("info.accessAddress")}
                </dd>
              </div>
            </dl>
          </div>

          {/* NOTES */}
          <div>
            <h2 className="text-xs tracking-[0.3em] text-accent mb-6">
              {t("notes.headingEn")}
            </h2>
            <p className="text-sm text-text-gray mb-4">{t("notes.heading")}</p>
            <ul className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note}
                  className="relative pl-5 text-sm leading-relaxed text-text-light/80 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:bg-accent"
                >
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
