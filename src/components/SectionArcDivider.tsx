"use client";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

import { EASE, revealInitial } from "@/constants/motion";
import { arcPathD, arcPoint, SECTION_ARCS } from "@/lib/sectionArc";

import type { SectionArcVariant } from "@/lib/sectionArc";

interface SectionArcDividerProps {
  /** apex = 山なりの弧、descent = 次のセクションへ落ちる弧。 */
  variant?: SectionArcVariant;
}

/**
 * セクション区切り。水平線ではなく軌道の一部（大きな弧）を引き、その上を光点が流れる。
 *
 * - 弧: SVG pathLength 0→1 を 1.0s（whileInView, once）
 * - 光点: スクロール進捗に連動して弧の上を移動する
 * - reduced-motion: 弧は最初から全長表示、光点は頂点に静的表示
 *
 * SVG は viewBox 0 0 100 100 + preserveAspectRatio="none" で帯いっぱいに引き伸ばす。
 * 光点だけは SVG の外の HTML 要素として % 配置し、非等比の伸長で楕円に潰れないようにする。
 */
export default function SectionArcDivider({
  variant = "apex",
}: SectionArcDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const arc = SECTION_ARCS[variant];
  const d = arcPathD(arc);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const left = useTransform(scrollYProgress, (t: number) => `${arcPoint(arc, t).x}%`);
  const top = useTransform(scrollYProgress, (t: number) => `${arcPoint(arc, t).y}%`);

  const apex = arcPoint(arc, 0.5);

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

      {/* 弧を流れる光点（流れ星）。動くものだけがアクセント色。 */}
      <motion.span
        className="section-arc-star absolute block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
        style={
          prefersReducedMotion
            ? { left: `${apex.x}%`, top: `${apex.y}%` }
            : { left, top }
        }
      />
    </div>
  );
}
