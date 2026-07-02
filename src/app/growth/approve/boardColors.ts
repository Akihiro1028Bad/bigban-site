/**
 * 記事パイプライン盤(#119)の段階カラーテーマ。純データ(DOM 非依存)。
 *
 * 左→右の流れをカード左ボーダーの accent 色で示す:
 * 提案中=Blue / 生成待ち=Amber / 生成中=Purple / 下書き=Teal。
 * 色だけに依存しないようラベルは別途必ず併記する(視認性/AA)。
 */

import type { ArticleStage } from "@/lib/growth/stage";

export interface StageTheme {
  /** カード左ボーダーの段階accent。 */
  accent: string;
}

const THEME: Record<ArticleStage, StageTheme> = {
  proposed: { accent: "border-l-blue-400" },
  queued: { accent: "border-l-amber-400" },
  generating: { accent: "border-l-purple-400" },
  drafted: { accent: "border-l-teal-400" },
  published: { accent: "border-l-green-500" },
  rejected: { accent: "border-l-gray-300" },
};

/** 段階 → カラーテーマ。 */
export function stageTheme(stage: ArticleStage): StageTheme {
  return THEME[stage];
}
