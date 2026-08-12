"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll } from "framer-motion";

import SectionArcStreak from "@/components/SectionArcStreak";
import { EASE, revealInitial } from "@/constants/motion";
import { arcPathD, SECTION_ARCS } from "@/lib/sectionArc";

import type { SectionArcVariant } from "@/lib/sectionArc";

interface SectionArcDividerProps {
  /** apex = 山なりの弧、descent = 次のセクションへ落ちる弧。 */
  variant?: SectionArcVariant;
}

/**
 * セクション区切り。水平線ではなく軌道の一部（大きな弧）を引き、その上を流れ星が走る。
 *
 * - 弧: SVG pathLength 0→1 を 1.0s（whileInView, once）
 * - 流れ星: スクロール進捗に連動して弧を流れ、接線方向へ尾を引く
 * - reduced-motion: 弧は最初から全長表示、流れ星は頂点に静的表示
 *
 * SVG は viewBox 0 0 100 100 + preserveAspectRatio="none" で帯いっぱいに引き伸ばす。
 * 流れ星だけは SVG の外の HTML 要素として % 配置し、非等比の伸長で
 * 太さや長さが歪まないようにする（角度の補正は SectionArcStreak 側で行う）。
 */
export default function SectionArcDivider({
  variant = "apex",
}: SectionArcDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const arc = SECTION_ARCS[variant];
  const d = arcPathD(arc);

  // 帯が画面に入ってから抜けるまでを進捗 0→1 に対応させる。
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none relative h-20 w-full overflow-hidden sm:h-28 lg:h-36"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        focusable="false"
      >
        {/* 予測軌道: 破線の淡いワイヤー。常に全長。 */}
        <path
          d={d}
          className="fill-none stroke-text-gray"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
          strokeDasharray="3 5"
          strokeOpacity={0.28}
        />
        {/* 実軌道: 画面に入ると 1.0s で伸びる実線。 */}
        <motion.path
          d={d}
          className="fill-none stroke-text-gray"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.5}
          strokeOpacity={0.7}
          strokeLinecap="round"
          initial={revealInitial(prefersReducedMotion, { pathLength: 0 })}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>

      <SectionArcStreak
        bandRef={ref}
        arc={arc}
        progress={scrollYProgress}
        isStatic={Boolean(prefersReducedMotion)}
      />
    </div>
  );
}
