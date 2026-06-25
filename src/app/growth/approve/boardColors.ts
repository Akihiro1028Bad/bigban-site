/**
 * 記事パイプライン盤(#119)の段階カラーテーマ。純データ(DOM 非依存)。
 *
 * 左→右の流れを色で示す: 提案中=Blue / 生成待ち=Amber / 生成中=Purple / 下書き=Teal。
 * 色だけに依存しないようラベルは別途必ず併記する(視認性/AA)。テキストは bg-50 上で
 * 800 系を使い AA コントラストを満たす。
 */

import type { ArticleStage } from "@/lib/growth/stage";

export interface StageTheme {
  /** 列ヘッダの淡色 pill (背景＋文字)。 */
  header: string;
  /** カード左ボーダーの段階accent。 */
  accent: string;
  /** 件数バッジの淡色 pill。 */
  count: string;
  /** アクセントバーの背景色(詳細ヘッダーの上部バー等・#124)。 */
  bar: string;
}

const THEME: Record<ArticleStage, StageTheme> = {
  proposed: {
    header: "bg-blue-50 text-blue-800",
    accent: "border-l-blue-400",
    count: "bg-blue-100 text-blue-700",
    bar: "bg-blue-400",
  },
  queued: {
    header: "bg-amber-50 text-amber-800",
    accent: "border-l-amber-400",
    count: "bg-amber-100 text-amber-700",
    bar: "bg-amber-400",
  },
  generating: {
    header: "bg-purple-50 text-purple-800",
    accent: "border-l-purple-400",
    count: "bg-purple-100 text-purple-700",
    bar: "bg-purple-400",
  },
  drafted: {
    header: "bg-teal-50 text-teal-800",
    accent: "border-l-teal-400",
    count: "bg-teal-100 text-teal-700",
    bar: "bg-teal-400",
  },
  published: {
    header: "bg-green-50 text-green-800",
    accent: "border-l-green-500",
    count: "bg-green-100 text-green-700",
    bar: "bg-green-500",
  },
  rejected: {
    header: "bg-gray-100 text-gray-700",
    accent: "border-l-gray-300",
    count: "bg-gray-200 text-gray-700",
    bar: "bg-gray-300",
  },
};

/** 段階 → カラーテーマ。 */
export function stageTheme(stage: ArticleStage): StageTheme {
  return THEME[stage];
}
