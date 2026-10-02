"use client";

import { motion, useReducedMotion } from "framer-motion";

import { EASE, revealInitial } from "@/constants/motion";

import type { ReactNode } from "react";

interface PbtClubRevealProps {
  children: ReactNode;
  className?: string;
}

// 出現アニメーションだけを client に閉じ込める葉の wrapper。
// prefers-reduced-motion のときは動かさず、最初から表示する。
// SSR は reduced-motion を判定できず opacity:0 で描画するため、クライアントの initial={false} と
// 属性が食い違い、React は修復しない(見えないまま残る)。motion-reduce の CSS で打ち消し、
// 想定内の不一致なので警告も抑える。
const REDUCED_MOTION_VISIBLE =
  "motion-reduce:opacity-100! motion-reduce:transform-none!";

export default function PbtClubReveal({
  children,
  className,
}: PbtClubRevealProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={[REDUCED_MOTION_VISIBLE, className].filter(Boolean).join(" ")}
      suppressHydrationWarning
      initial={revealInitial(prefersReducedMotion, { opacity: 0, y: 24 })}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
