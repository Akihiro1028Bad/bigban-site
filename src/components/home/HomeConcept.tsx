"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { EASE } from "@/constants/motion";


export default function HomeConcept() {
  const t = useTranslations("HomeConcept");

  return (
    <section id="concept" className="bg-off-white text-text-dark py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Section Title */}
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-black tracking-[0.15em]">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs sm:text-sm tracking-[0.25em] text-text-gray">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 w-14 h-[3px] bg-accent" />
        </motion.div>

        {/* Photo overlay with text */}
        <motion.div
          className="relative w-full overflow-hidden rounded-sm"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <div className="relative min-h-[500px] sm:aspect-[4/3] lg:aspect-[16/9]">
            <Image
              src="/images/concept-bigbang.jpg"
              alt={t("imageAlt")}
              fill
              sizes="(min-width: 1280px) 1216px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/70" />

            {/* Text overlay */}
            <div className="absolute inset-0 flex items-center">
              <div className="px-6 sm:px-8 md:px-12 lg:px-16 max-w-3xl drop-shadow-lg">
                {/* Lead paragraph */}
                <motion.p
                  className="text-white text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed font-medium mb-4 sm:mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-150px" }}
                  transition={{ duration: 1.1, delay: 0.1, ease: EASE }}
                >
                  {t("lead")}
                </motion.p>

                {/* Poetry lines */}
                <motion.div
                  className="mb-4 sm:mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-150px" }}
                  transition={{ duration: 1.1, delay: 0.2, ease: EASE }}
                >
                  <p className="text-white text-base sm:text-lg md:text-xl font-bold leading-loose">
                    {t("poetry1")}
                  </p>
                  <p className="text-white text-base sm:text-lg md:text-xl font-bold leading-loose">
                    {t("poetry2")}
                  </p>
                </motion.div>

                {/* Description */}
                <motion.div
                  className="mb-4 sm:mb-6"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-150px" }}
                  transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
                >
                  <p className="text-white/80 text-sm sm:text-base md:text-lg leading-loose mb-2">
                    {t("description1")}
                  </p>
                  <p className="text-white/80 text-sm sm:text-base md:text-lg leading-loose">
                    {t("description2")}
                  </p>
                </motion.div>

                {/* Catchcopy */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-150px" }}
                  transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
                >
                  <div className="w-10 h-[2px] bg-accent mb-4" />
                  <p className="text-accent text-lg sm:text-xl lg:text-2xl font-black tracking-wide">
                    {t("catchcopy")}
                  </p>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
