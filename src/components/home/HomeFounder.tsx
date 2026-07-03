"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";


interface TimelineEntry {
  text: string;
  highlightYear?: string;
}

const TIMELINE: TimelineEntry[] = [
  { text: "北海道出身。8歳でバドミントンを始める" },
  { text: "青森山田高校・中央大学で競技経験を積む" },
  { text: "インターハイ・全国高校選抜 シングルスベスト8" },
  { text: "全日本総合バドミントン選手権 4度出場" },
  { text: "クロスミントン転向", highlightYear: "2015年" },
  {
    text: "世界選手権ミックスダブルス4連覇、シングルス2連覇（計6度優勝）",
  },
  {
    text: "ピックルボール転向、選手兼大会ディレクター",
    highlightYear: "2023年",
  },
  { text: "RST Agency株式会社 代表取締役" },
];

const PRESS_TITLE =
  "クロスミントン世界王者・西村昭彦 本八幡駅徒歩1分に都市型ピックルボール施設『THE PICKLE BANG THEORY』2026年春オープン";

const PRESS_URL =
  "https://prtimes.jp/main/html/rd/p/000000003.000179043.html";

export default function HomeFounder() {
  return (
    <section
      id="founder"
      className="relative py-24 lg:py-32 overflow-hidden"
      style={{
        background: "linear-gradient(to bottom, #0d0d1a, #0A0A0A)",
      }}
    >
      {/* Background image */}
      <Image
        src="/images/home-nishimura.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Blue ambient glow */}
      <div className="absolute top-[10%] right-[10%] w-[400px] h-[400px] rounded-full blur-[150px] pointer-events-none"
           style={{ background: 'rgba(48,110,195,0.12)' }} />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        {/* FOUNDER label */}
        <motion.span
          className="block text-xs tracking-[0.3em] text-text-gray font-bold mb-12"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          FOUNDER
        </motion.span>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left: name block */}
          <div className="lg:w-[40%] shrink-0">
            <motion.h2
              className="font-serif text-5xl lg:text-7xl text-text-light mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.1, ease: EASE }}
            >
              西村昭彦
            </motion.h2>
            <motion.p
              className="text-sm tracking-[0.2em] text-text-gray"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-150px" }}
              transition={{ duration: 1.0, delay: 0.2, ease: EASE }}
            >
              AKIHIKO NISHIMURA
            </motion.p>
          </div>

          {/* Right: timeline */}
          <div className="flex-1">
            <ul className="space-y-4">
              {TIMELINE.map((entry, i) => (
                <motion.li
                  key={entry.text}
                  className="flex items-start gap-4 text-text-light/90 text-base lg:text-lg leading-relaxed"
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-150px" }}
                  transition={{
                    duration: 1.0,
                    delay: i * 0.1,
                    ease: EASE,
                  }}
                >
                  <span className="mt-2 block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    {entry.highlightYear && (
                      <span className="text-accent font-bold">
                        {entry.highlightYear}{" "}
                      </span>
                    )}
                    {entry.text}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        {/* Press section */}
        <div className="mt-20 border-t border-white/10 pt-12">
          <motion.span
            className="block text-xs tracking-[0.3em] text-text-gray font-bold mb-6"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, ease: EASE }}
          >
            PRESS
          </motion.span>

          <motion.p
            className="text-text-light/80 text-base lg:text-lg leading-relaxed mb-4 max-w-3xl"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.1, ease: EASE }}
          >
            {PRESS_TITLE}
          </motion.p>

          <motion.a
            href={PRESS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-accent text-sm tracking-wide hover:underline"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-150px" }}
            transition={{ duration: 1.0, delay: 0.2, ease: EASE }}
          >
            PR TIMES →
          </motion.a>
        </div>
      </div>
    </section>
  );
}
