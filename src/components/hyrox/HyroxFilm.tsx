"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";

const VIDEO_SRC = "/videos/hyrox-film.mp4";
const POSTER_SRC = "/images/hyrox/film-poster.jpg";

export default function HyroxFilm() {
  const t = useTranslations("HyroxPage.film");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 動画は常時マウント済みのため ref は必ず存在する
    const video = videoRef.current!;
    video.muted = true;

    // モーション抑制設定では自動再生せず、静止ポスターのまま据え置く
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play();
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="bg-deep-black">
      <motion.figure
        className="relative aspect-video w-full overflow-hidden"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.2, ease: EASE }}
      >
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full bg-deep-black object-cover"
        />

        {/* 上辺のアクセントヘアライン */}
        <span className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px] bg-accent" />
        {/* 全体を僅かに沈めるダークトーン＋アイブロウ可読性の上部グラデ */}
        <span className="pointer-events-none absolute inset-0 bg-deep-black/15" />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-deep-black/55 to-transparent" />

        {/* アイブロウ（左上） */}
        <span className="pointer-events-none absolute left-6 top-6 z-10 font-serif text-[10px] font-medium tracking-[0.34em] text-text-gray sm:left-10 sm:top-8 sm:text-xs">
          {t("kicker")} ／ HYROX
        </span>
      </motion.figure>
    </section>
  );
}
