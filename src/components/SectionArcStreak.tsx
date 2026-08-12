"use client";

import { useEffect, useState } from "react";
import { motion, useTransform } from "framer-motion";

import { arcAngleDeg, arcPoint } from "@/lib/sectionArc";

import type { RefObject } from "react";
import type { MotionValue } from "framer-motion";
import type { SectionArc } from "@/lib/sectionArc";

interface SectionArcStreakProps {
  /** 弧を収める区切り帯。実表示サイズを測って接線角度を補正するために参照する。 */
  bandRef: RefObject<HTMLDivElement | null>;
  arc: SectionArc;
  /** 帯のスクロール進捗（0-1）。 */
  progress: MotionValue<number>;
  /** reduced-motion 時に頂点で静止させるか。 */
  isStatic: boolean;
}

/** 区切り帯の実表示サイズ。 */
interface BandSize {
  width: number;
  height: number;
}

/**
 * 弧を流れる流れ星。
 *
 * 右端が先端で、尾は進行方向の後ろへ透過して消える。origin-right と
 * -translate-x-full の組み合わせにより、どの角度へ回しても先端が弧の点に乗る。
 *
 * 帯の実寸計測をこの子側に閉じ込めているのは、計測による再レンダーを
 * useScroll を持つ親へ波及させないため。useScroll はレンダーのたびに
 * スクロール値の accelerate 設定を作り直すので、計測のような
 * スクロールと無関係な状態は親に置かない。
 */
export default function SectionArcStreak({
  bandRef,
  arc,
  progress,
  isStatic,
}: SectionArcStreakProps) {
  const [band, setBand] = useState<BandSize>({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBand({ width, height });
    });
    // effect はマウント後に走るので ref は必ず張られている。
    observer.observe(bandRef.current as HTMLDivElement);

    return () => observer.disconnect();
  }, [bandRef]);

  const left = useTransform(progress, (t: number) => `${arcPoint(arc, t).x}%`);
  const top = useTransform(progress, (t: number) => `${arcPoint(arc, t).y}%`);
  const rotate = useTransform(
    progress,
    (t: number) => `${arcAngleDeg(arc, t, band.width, band.height)}deg`,
  );

  const apex = arcPoint(arc, 0.5);

  return (
    <motion.span
      className="section-arc-streak absolute block h-[1.5px] w-[28px] origin-right -translate-x-full -translate-y-1/2 sm:h-[2px] sm:w-[36px]"
      style={
        isStatic
          ? {
              left: `${apex.x}%`,
              top: `${apex.y}%`,
              rotate: `${arcAngleDeg(arc, 0.5, band.width, band.height)}deg`,
            }
          : { left, top, rotate }
      }
    />
  );
}
