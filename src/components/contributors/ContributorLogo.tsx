import Image from "next/image";

import type { ContributorLogoAsset } from "@/constants/contributors";

/**
 * 面積を揃える基準となる縦横比。この比のロゴは指定 height がそのまま使われる。
 * 一般的な横組みロゴロックアップの比率に合わせている。
 */
const REFERENCE_ASPECT = 2.5;

interface ContributorLogoProps {
  readonly logo: ContributorLogoAsset;
  /** 基準高さ(px)。縦横比 2.5 のロゴでこの高さになる。 */
  readonly height: number;
  readonly className?: string;
}

/**
 * 支援者ロゴを支給されたまま表示する。
 *
 * 配色や下地には手を加えない(反転・合成・プレート敷きはしない)。加える正規化は
 * 大きさだけで、**高さではなく面積**を揃える。高さだけ揃えると正方形ロゴが横長ロゴの
 * 半分以下の面積になり、同じ列で明らかに弱く見えてしまうため。
 */
export default function ContributorLogo({ logo, height, className }: ContributorLogoProps) {
  const scale = Math.sqrt(REFERENCE_ASPECT / logo.aspect);
  const normalizedHeight = Math.round(height * scale);
  const width = Math.round(normalizedHeight * logo.aspect);

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Image
        src={logo.src}
        alt={logo.alt}
        width={width}
        height={normalizedHeight}
        style={{ height: normalizedHeight, width: "auto" }}
      />
    </span>
  );
}
