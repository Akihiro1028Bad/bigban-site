"use client";

import { motion, useReducedMotion } from "framer-motion";

import { EASE, revealInitial } from "@/constants/motion";

/**
 * 中央寄せセクション見出しの下線。
 *
 * 見た目は従来の静的バー（w-14 / h-[3px] / bg-accent）のまま、画面に入ったときだけ
 * 中央から左右へ scaleX 0→1 で伸びる。transform のみを動かすのでレイアウトは走らない。
 * prefers-reduced-motion では初期状態を持たず、最初から全長で静止する。
 */
export default function SectionUnderline() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      aria-hidden
      className="mx-auto mt-4 h-[3px] w-14 origin-center bg-accent"
      initial={revealInitial(prefersReducedMotion, { scaleX: 0 })}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: EASE }}
    />
  );
}
