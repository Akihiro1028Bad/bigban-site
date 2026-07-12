/**
 * 段階(Stage)のメタ情報と並び順(#proto)。
 *
 * 盤の左カラムは「あなた待ち」を最上段に寄せて把握しやすくする。
 */
import type { Stage } from "./types";

export interface StageMeta {
  label: string;
  /** 色トークン名(CSS変数のサフィックス)。 */
  tone: "amber" | "accent" | "purple" | "teal" | "gray" | "green";
  /** 盤での表示順(小さいほど上)。 */
  order: number;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  outline_review: { label: "構成案レビュー", tone: "amber", order: 0 },
  draft_review: { label: "下書きレビュー", tone: "accent", order: 1 },
  generating: { label: "生成中", tone: "purple", order: 2 },
  scheduled: { label: "公開予約", tone: "teal", order: 3 },
  idea: { label: "ネタ案", tone: "gray", order: 4 },
  published: { label: "公開済み", tone: "green", order: 5 },
};

export const STAGE_ORDER: Stage[] = (
  Object.keys(STAGE_META) as Stage[]
).sort((a, b) => STAGE_META[a].order - STAGE_META[b].order);

export function toneVar(tone: StageMeta["tone"]): string {
  return `var(--p-${tone === "gray" ? "text-3" : tone})`;
}

export function toneWeakVar(tone: StageMeta["tone"]): string {
  if (tone === "gray") return "rgba(255,255,255,0.06)";
  return `var(--p-${tone}-weak)`;
}
