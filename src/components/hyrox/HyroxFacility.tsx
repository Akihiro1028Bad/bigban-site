"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion, useInView } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { FACILITY_PHOTOS, HYROX_EQUIPMENT } from "./equipment";
import { EASE } from "@/constants/motion";


export default function HyroxFacility() {
  const t = useTranslations("HyroxPage.facility");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(carouselRef);
  // t.raw は unknown を返すため、システム境界として配列であることを検証する。
  const rawPhotos = t.raw("photos");
  const photoAlts = Array.isArray(rawPhotos) ? (rawPhotos as string[]) : [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({
      playOnInit: false,
      delay: 4000,
      // ホバー・操作後も自動送りを継続（操作後は少し待って再開）
      stopOnInteraction: false,
      stopOnMouseEnter: false,
    }),
  ]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
    };
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const autoplay = emblaApi.plugins().autoplay;
    if (isInView) {
      autoplay.play();
    } else {
      autoplay.stop();
    }
  }, [isInView, emblaApi]);

  const handleScrollTo = useCallback(
    (index: number) => {
      if (!emblaApi) return;
      emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const handleScrollPrev = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollPrev();
  }, [emblaApi]);

  const handleScrollNext = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollNext();
  }, [emblaApi]);

  return (
    <section className="bg-deep-black pt-8 pb-12 lg:pt-12 lg:pb-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* 見出し */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        <motion.p
          className="mx-auto mt-8 max-w-2xl text-center text-sm leading-loose text-text-gray lg:text-base"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          {t("lead")}
        </motion.p>

        {/* 施設写真カルーセル */}
        <motion.div
          ref={carouselRef}
          className="relative mt-12 lg:mt-16"
          aria-roledescription="carousel"
          aria-label={t("carousel.regionLabel")}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <div className="overflow-hidden rounded-sm select-none" ref={emblaRef}>
            <div className="flex">
              {FACILITY_PHOTOS.map((src, i) => (
                <div
                  key={src}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} / ${FACILITY_PHOTOS.length}`}
                  className="relative aspect-[16/9] min-w-0 flex-[0_0_100%]"
                >
                  <Image
                    src={src}
                    alt={photoAlts[i]}
                    fill
                    sizes="(min-width: 1280px) 1216px, 100vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 矢印 */}
          <button
            type="button"
            onClick={handleScrollPrev}
            aria-label={t("carousel.prev")}
            className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-text-light backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleScrollNext}
            aria-label={t("carousel.next")}
            className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-text-light backdrop-blur-sm transition-colors hover:bg-black/60"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* ドット */}
          <div className="mt-6 flex justify-center gap-3">
            {FACILITY_PHOTOS.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => handleScrollTo(i)}
                aria-label={t("carousel.showPhoto", { index: i + 1 })}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  i === selectedIndex
                    ? "scale-125 bg-accent"
                    : "bg-text-gray/30 hover:bg-text-gray/60"
                }`}
              />
            ))}
          </div>
        </motion.div>

        {/* 設置器具スペック一覧 */}
        <motion.div
          className="mt-16 lg:mt-20"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h3 className="mb-6 text-center text-xs uppercase tracking-[0.3em] text-text-gray">
            {t("equipmentTitle")}
          </h3>
          <ul className="mx-auto grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3">
            {HYROX_EQUIPMENT.map((item) => (
              <li
                key={item.key}
                className="flex flex-col gap-1 rounded-sm border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-text-light">
                    {t(`equipment.${item.key}.nameJa`)}
                  </span>
                  <span className="shrink-0 font-serif text-sm font-bold tracking-wider text-accent">
                    {item.quantity ? `× ${item.quantity}` : t("fullSet")}
                  </span>
                </div>
                <span className="text-xs text-text-gray">
                  {t(`equipment.${item.key}.spec`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs leading-relaxed text-text-gray">
            {t("note")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
