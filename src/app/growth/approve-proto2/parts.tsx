/**
 * 承認コンソールv2 共有部品(#proto2): 段階ステッパー・段階チップ・段階判定。
 * 盤(ArticleRow)とドロワーで共用する。
 */
"use client";

import { STAGE_META } from "../approve-proto/stages";
import type { Article, Stage } from "../approve-proto/types";

export const STAGE_STEP: Record<Stage, number> = {
  idea: 1,
  outline_review: 2,
  generating: 3,
  draft_review: 4,
  scheduled: 5,
  published: 6,
};

/** 戻り(pull型の依頼の返り)が届いているか。決定済み(公開/予約/ネタ)は対象外。 */
export function hasReturn(a: Article): boolean {
  if (a.stage === "published" || a.stage === "scheduled" || a.stage === "idea") return false;
  return (
    a.reviseStatus === "presenting" ||
    a.adviceStatus === "presenting" ||
    a.bodyCommentStatus === "presenting"
  );
}

export function stageToneVar(stage: Stage): string {
  const tone = STAGE_META[stage].tone;
  return tone === "gray" ? "text-3" : tone;
}

export function StageStepper({ stage, size = 7 }: { stage: Stage; size?: number }) {
  const filled = STAGE_STEP[stage];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => {
        const done = i < filled;
        const cur = i === filled - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: cur ? size + 1 : size,
                height: cur ? size + 1 : size,
                borderRadius: "50%",
                background: done ? "var(--p-accent)" : "transparent",
                border: done ? "none" : "1.5px solid var(--p-border-strong)",
                boxShadow: cur ? "0 0 0 3px var(--p-accent-weak)" : "none",
              }}
            />
            {i < 5 && <span style={{ width: size, height: 2, background: done ? "var(--p-accent)" : "var(--p-border)" }} />}
          </span>
        );
      })}
    </span>
  );
}

export function StageChip({ stage }: { stage: Stage }) {
  const meta = STAGE_META[stage];
  const tone = stageToneVar(stage);
  const shortLabel = meta.label.replace("レビュー", "").replace("案", "");
  return (
    <span
      className="proto2-num"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        fontWeight: 500,
        color: `var(--p-${tone})`,
        background: `var(--p-${tone}-weak)`,
        borderRadius: 999,
        padding: "2px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {shortLabel}
    </span>
  );
}
