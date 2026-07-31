"use client";

import { useTranslations } from "next-intl";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import { byTier } from "@/constants/contributors";

import ContributorLogo from "./ContributorLogo";

import type { Contributor, ContributorTier } from "@/constants/contributors";

/** 支援の対価として掲載するリンクに必要な rel(Google リンクスパムポリシー対応)。 */
const SPONSORED_REL = "sponsored nofollow noopener noreferrer";

/** ランクごとのロゴ基準高さ(px)。リターン規定の刻印サイズ差をウェブ上でも保つ。 */
const LOGO_HEIGHT: Record<ContributorTier, number> = {
  large: 78,
  medium: 48,
  small: 28,
};

/**
 * ランクごとの掲載名のクラス。`[line-break:strict]` は日本語の禁則処理で、
 * 小書き仮名(ッ・ャ 等)で行が始まるのを防ぐ。
 */
const NAME_CLASS: Record<ContributorTier, string> = {
  large:
    "text-2xl font-bold leading-[1.4] tracking-[0.02em] [line-break:strict] lg:text-3xl",
  medium: "text-lg font-semibold tracking-[0.02em] [line-break:strict] lg:text-xl",
  small: "text-[15px] leading-[1.9] text-text-light/70 [line-break:strict]",
};

/** ランクごとのセル最低高さ。ロゴと名前の行を光学的に揃える。 */
const CELL_MIN_HEIGHT: Record<ContributorTier, string> = {
  large: "min-h-24",
  medium: "min-h-16",
  small: "",
};

interface ContributorCellProps {
  readonly contributor: Contributor;
}

/** 罫線も枠も背景も持たないセル。区切りはセル間の余白だけ。 */
function ContributorCell({ contributor }: ContributorCellProps) {
  const body = contributor.logo ? (
    <ContributorLogo logo={contributor.logo} height={LOGO_HEIGHT[contributor.tier]} />
  ) : (
    <span className={NAME_CLASS[contributor.tier]}>{contributor.name}</span>
  );

  return (
    <li className={`flex items-center ${CELL_MIN_HEIGHT[contributor.tier]}`}>
      {contributor.url ? (
        <a
          href={contributor.url}
          target="_blank"
          rel={SPONSORED_REL}
          className="inline-flex items-center transition-opacity hover:opacity-60"
        >
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

interface ContributorsContentProps {
  /** COLUMN ナビリンク表示フラグ(server で isCmsColumnsEnabled() を渡す)。既定 false。 */
  readonly showColumns?: boolean;
}

/**
 * クラウドファンディング支援者ページの本体。
 *
 * 罫線・枠・背景色・通し番号を一切持たず、グリッドの整列と余白量だけで階層を示す。
 * ランクの呼称(大/中/小)と支援金額は表示しない。大きさの差だけでランクを表現する。
 */
export default function ContributorsContent({
  showColumns = false,
}: ContributorsContentProps) {
  const t = useTranslations("Contributors");

  return (
    <>
      <HomeNavigation showColumns={showColumns} />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))]">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-20 lg:py-32">
          <h1 className="font-serif text-3xl font-black tracking-[0.15em] sm:text-4xl lg:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mt-6 h-[3px] w-14 bg-accent" />

          <p className="mt-14 max-w-md text-sm leading-[2.4] text-text-gray">{t("lede")}</p>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-20 sm:grid-cols-2 lg:mt-40 lg:grid-cols-3">
            {byTier("large").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-14 sm:grid-cols-2 lg:mt-40 lg:grid-cols-3">
            {byTier("medium").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>

          <ul className="mt-28 grid list-none gap-x-16 gap-y-8 sm:grid-cols-2 lg:mt-40 lg:grid-cols-4">
            {byTier("small").map((c) => (
              <ContributorCell key={c.id} contributor={c} />
            ))}
          </ul>
        </div>
      </main>
      <HomeFooter />
    </>
  );
}
