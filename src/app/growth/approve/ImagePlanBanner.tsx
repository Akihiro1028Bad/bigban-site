/**
 * 画像プラン帯(#proto P3b・本番移植・画像指示再設計): 構成案タブ上部に常設。
 * 「画風は house style で自動統一」を明示し、画像の全体プラン(出す枚数/指定済み)を俯瞰させる。
 */
"use client";

import { useMemo } from "react";

import { imagePlanSummary } from "@/lib/growth/imageIntent";
import { IconImage, IconSparkles } from "./ui/icons";
import type { ImageOutlineSection } from "./imageIntentTypes";

interface ImagePlanBannerProps {
  outline: ImageOutlineSection[];
}

export function ImagePlanBanner({ outline }: ImagePlanBannerProps) {
  const { planned, specified } = useMemo(() => imagePlanSummary(outline), [outline]);

  return (
    <section
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] px-3.5 py-2.5"
      style={{ background: "var(--p-purple-weak)", border: "1px solid var(--p-purple)" }}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--p-purple)" }}>
        <IconSparkles size={13} /> 画像は〈宇宙人マスコット × コスミック〉で全記事を自動統一
      </span>
      <span className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        各セクションは「出す / 出さない」と一言の動きだけ決めればOK
      </span>
      <span
        className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-medium tabular-nums"
        style={{ background: "var(--p-bg-elevated)", color: "var(--p-text-2)" }}
      >
        <IconImage size={12} {...{ style: { color: "var(--p-purple)" } }} />
        画像 {planned}枚予定 ・ 指定済み {specified}
      </span>
    </section>
  );
}
