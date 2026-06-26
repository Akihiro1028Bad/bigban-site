"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type StepMedia =
  | { type: "video"; poster: string; sources: { src: string; mime: string }[] }
  | { type: "image"; src: string; width: number; height: number };

interface Step {
  key: "step01" | "step02" | "step03";
  num: string;
  media: StepMedia;
}

const STEPS: Step[] = [
  {
    key: "step01",
    num: "01",
    media: {
      type: "video",
      poster: "/reserve/step01-calendar-poster.jpg",
      sources: [
        { src: "/reserve/step01-calendar.webm", mime: "video/webm" },
        { src: "/reserve/step01-calendar.mp4", mime: "video/mp4" },
      ],
    },
  },
  {
    key: "step02",
    num: "02",
    media: {
      type: "image",
      src: "/reserve/step02-booking-detail.png",
      width: 1100,
      height: 877,
    },
  },
  {
    key: "step03",
    num: "03",
    media: {
      type: "image",
      src: "/reserve/step03-booking-complete.png",
      width: 1100,
      height: 1051,
    },
  },
];

export default function ReserveSteps() {
  const t = useTranslations("Reserve.steps");
  const prefersReducedMotion = useReducedMotion();
  // モバイルは横スワイプのカルーセル。640px 以上では active:false にして
  // CSS グリッド（3カラム）表示へ切り替える。
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    breakpoints: { "(min-width: 640px)": { active: false } },
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  const handleScrollTo = useCallback(
    (index: number) => {
      if (!emblaApi) return;
      emblaApi.scrollTo(index);
    },
    [emblaApi],
  );

  return (
    <section className="bg-deep-black pb-16 lg:pb-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <motion.div
          className="mb-9 text-center lg:mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          <p className="text-[10px] tracking-[0.4em] text-accent sm:text-xs">
            {t("heading")}
          </p>
          <h2 className="mt-2 font-serif text-2xl font-black tracking-[0.12em] text-text-light sm:text-3xl">
            {t("headingEn")}
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          {/* モバイル: 横スワイプ（peek つき） / PC: 3カラムグリッド */}
          <div
            className="overflow-hidden sm:overflow-visible"
            ref={emblaRef}
          >
            <ol
              aria-label={t("heading")}
              className="flex gap-4 sm:grid sm:grid-cols-3 sm:gap-6 lg:gap-8"
            >
              {STEPS.map((step) => (
                <li
                  key={step.key}
                  className="group min-w-0 flex-[0_0_82%] sm:flex-none"
                >
                  <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-lg bg-[#0c0c0c] p-2.5 ring-1 ring-white/10">
                {step.media.type === "video" ? (
                  <video
                    aria-label={t(`${step.key}.imageAlt`)}
                    className="h-full w-full rounded-[3px] object-cover object-top motion-safe:transition-transform motion-safe:duration-700 group-hover:scale-[1.02]"
                    poster={step.media.poster}
                    autoPlay={!prefersReducedMotion}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  >
                    {step.media.sources.map((s) => (
                      <source key={s.mime} src={s.src} type={s.mime} />
                    ))}
                  </video>
                ) : (
                  <Image
                    src={step.media.src}
                    alt={t(`${step.key}.imageAlt`)}
                    width={step.media.width}
                    height={step.media.height}
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="h-full w-full rounded-[3px] object-cover object-top motion-safe:transition-transform motion-safe:duration-700 group-hover:scale-[1.02]"
                  />
                )}

                {/* 連番タグ。実際の予約画面の一連の流れであることを示す */}
                <span className="absolute left-3 top-3 z-10 rounded-sm bg-accent px-2.5 py-1 font-serif text-xs font-bold tracking-[0.1em] text-deep-black">
                  {step.num}
                </span>
              </div>

              <h3 className="mt-4 font-serif text-base tracking-[0.06em] text-text-light">
                {t(`${step.key}.title`)}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-light/60">
                {t(`${step.key}.description`)}
              </p>
                </li>
              ))}
            </ol>
          </div>

          {/* モバイル: ドット & スワイプ誘導（PC は非表示） */}
          <div className="mt-5 flex items-center justify-center gap-2 sm:hidden">
            {STEPS.map((step, i) => (
              <button
                key={step.key}
                type="button"
                onClick={() => handleScrollTo(i)}
                aria-label={t("goToStep", { num: step.num })}
                aria-current={i === selectedIndex}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  i === selectedIndex
                    ? "scale-125 bg-accent"
                    : "bg-text-gray/30 hover:bg-text-gray/60"
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] tracking-[0.25em] text-text-gray sm:hidden">
            {t("swipeHint")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
