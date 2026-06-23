/**
 * 詳細パネル(#124)のヘッダー段階バッジの純ロジック。DOM 非依存。
 *
 * 記事は実効段階(楽観的承認を反映)を段階色で、施策は未処理/承認/却下を
 * 状態色で表す。色だけに依存しないよう label を必ず併記する。
 */

import type { ArticleStage, Stage } from "@/lib/growth/stage";

import { effectiveStage } from "./board";
import { stageTheme, type StageTheme } from "./boardColors";

export interface DetailBadge {
  label: string;
  theme: StageTheme;
}

// 全 ArticleStage を網羅するため Record<ArticleStage, string>(欠落はビルドで検出)。
const ARTICLE_STAGE_LABEL: Record<ArticleStage, string> = {
  proposed: "提案中",
  queued: "生成待ち",
  generating: "生成中",
  drafted: "下書き",
  rejected: "却下",
};

interface BadgeItem {
  id: string;
  kind: "proposal" | "idea";
  stage: Stage;
}

export function detailBadge(item: BadgeItem, choice?: string): DetailBadge {
  if (item.kind === "idea") {
    const stage = effectiveStage(item, choice);
    return { label: ARTICLE_STAGE_LABEL[stage], theme: stageTheme(stage) };
  }
  // 施策: 状態を段階色テーマに対応づける(未処理=提案中色/承認=下書き色/却下=却下色)。
  if (choice === "承認") return { label: "承認", theme: stageTheme("drafted") };
  if (choice === "却下") return { label: "却下", theme: stageTheme("rejected") };
  return { label: "未処理", theme: stageTheme("proposed") };
}
