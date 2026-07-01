/**
 * 盤の表示ステージ(proto 由来の語彙)とメタ情報、および本番 PendingItem からの導出。
 */

import type { PendingItem } from "../types";

export type BoardStage =
  | "outline_review"
  | "draft_review"
  | "generating"
  | "scheduled"
  | "idea"
  | "published";

export type StageTone = "amber" | "accent" | "purple" | "teal" | "gray" | "green";

export interface StageMeta {
  label: string;
  tone: StageTone;
  order: number;
}

export const STAGE_META: Record<BoardStage, StageMeta> = {
  outline_review: { label: "構成案レビュー", tone: "amber", order: 0 },
  draft_review: { label: "下書きレビュー", tone: "accent", order: 1 },
  generating: { label: "生成中", tone: "purple", order: 2 },
  scheduled: { label: "公開予約", tone: "teal", order: 3 },
  idea: { label: "ネタ案", tone: "gray", order: 4 },
  published: { label: "公開済み", tone: "green", order: 5 },
};

export const STAGE_ORDER: BoardStage[] = (Object.keys(STAGE_META) as BoardStage[]).sort(
  (a, b) => STAGE_META[a].order - STAGE_META[b].order,
);

export function toneVar(tone: StageTone): string {
  return `var(--p-${tone === "gray" ? "text-3" : tone})`;
}

export function toneWeakVar(tone: StageTone): string {
  if (tone === "gray") return "rgba(255,255,255,0.06)";
  return `var(--p-${tone}-weak)`;
}

/**
 * 本番 PendingItem を proto の BoardStage へ写像する(AD4)。
 * 縮約(AD5): `scheduled` は scheduledAtMs が本番型に無いため返さない。予約公開が surface
 * できるようになったら drafted 系から分岐して復活させる。`idea` は施策トリアージ(kind=proposal)用。
 */
export function deriveBoardStage(item: PendingItem): BoardStage {
  if (item.kind === "proposal") return "idea";
  if (item.stage === "published") return "published";
  if (item.stage === "generating") return "generating";
  if (item.stage === "drafted" || item.isDraftReady === true) return "draft_review";
  return "outline_review";
}
