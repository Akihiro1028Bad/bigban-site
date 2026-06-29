/**
 * カンバン横並び盤(#proto・feature1): 段階を列にして俯瞰する。
 * カードを押すと右ドロワーで詳細を開く。
 */
"use client";

import { motion } from "framer-motion";

import { IconClock } from "./icons";
import { STAGE_META, STAGE_ORDER, toneVar } from "./stages";
import type { Article, Stage } from "./types";
import { AwaitingDot, EyecatchThumb, MetaStat, ScoreBar } from "./ui";

interface KanbanBoardProps {
  articles: Article[];
  activeId: string | null;
  onActivate: (id: string) => void;
}

export function KanbanBoard({ articles, activeId, onActivate }: KanbanBoardProps) {
  const byStage = (stage: Stage) =>
    articles.filter((a) => a.stage === stage).sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-4 py-4">
      {STAGE_ORDER.map((stage) => {
        const items = byStage(stage);
        const meta = STAGE_META[stage];
        return (
          <section
            key={stage}
            className="flex w-[272px] shrink-0 flex-col rounded-[12px]"
            style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}
          >
            <header className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: toneVar(meta.tone) }} />
              <span className="text-[12.5px] font-semibold">{meta.label}</span>
              <span className="tabular-nums text-[11px]" style={{ color: "var(--p-text-3)" }}>
                {items.length}
              </span>
            </header>

            <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-2">
              {items.length === 0 && (
                <div className="py-6 text-center text-[12px]" style={{ color: "var(--p-text-3)" }}>
                  なし
                </div>
              )}
              {items.map((a) => {
                const active = a.id === activeId;
                return (
                  <motion.button
                    key={a.id}
                    layout
                    onClick={() => onActivate(a.id)}
                    className="proto-row flex flex-col gap-2 rounded-[10px] p-2.5 text-left transition-colors"
                    style={{
                      background: active ? "var(--p-bg-active)" : "var(--p-bg-raised)",
                      border: active
                        ? "1px solid var(--p-accent)"
                        : "1px solid var(--p-border)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <EyecatchThumb hue={a.hue} has={a.hasEyecatch} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {a.awaitingYou && <AwaitingDot />}
                          <span className="line-clamp-2 text-[12.5px] font-medium leading-snug">
                            {a.title}
                          </span>
                        </span>
                      </span>
                    </div>
                    {a.stage === "generating" ? (
                      <div className="relative h-[4px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
                        <div
                          className="proto-indeterminate absolute inset-y-0 w-1/3 rounded-full"
                          style={{ background: "var(--p-purple)" }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <ScoreBar score={a.score} />
                        <MetaStat icon={<IconClock size={12} />}>{a.updatedLabel}</MetaStat>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
