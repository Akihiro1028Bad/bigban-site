"use client";

import { motion, useReducedMotion } from "framer-motion";

import { EASE, revealInitial } from "@/constants/motion";

import type { ReactNode } from "react";

interface FirstVisitSectionProps {
  id: string;
  kicker: string;
  heading: string;
  children: ReactNode;
}

/** 「はじめての方へ」の各セクション共通の枠(kicker + h2 + 控えめなリビール)。 */
export default function FirstVisitSection({
  id,
  kicker,
  heading,
  children,
}: FirstVisitSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="bg-deep-black text-text-light"
    >
      <motion.div
        className="mx-auto max-w-5xl border-t border-white/10 px-6 py-12 lg:px-12 lg:py-16"
        initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 1.0, ease: EASE }}
      >
        <p className="text-[10px] tracking-[0.3em] text-accent">{kicker}</p>
        <h2
          id={titleId}
          className="mt-2 font-sans text-xl font-black tracking-[0.08em] sm:text-2xl"
        >
          {heading}
        </h2>
        <div className="mt-8">{children}</div>
      </motion.div>
    </section>
  );
}
