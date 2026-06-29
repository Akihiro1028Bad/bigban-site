/**
 * 盤(左カラム・#proto): 段階でグルーピングした記事リスト。
 * キーボードのフォーカス行をハイライトし、選択(複数)はチェックで示す。
 */
"use client";

import { motion } from "framer-motion";

import { IconCheck, IconClock } from "./icons";
import { STAGE_META } from "./stages";
import { styleHintCount } from "./styleHints";
import type { Article, Stage } from "./types";
import { AwaitingDot, EyecatchThumb, MetaStat, ScoreBar, StageChip } from "./ui";

interface BoardGroup {
  stage: Stage;
  items: Article[];
}

interface BoardProps {
  groups: BoardGroup[];
  activeId: string | null;
  selectedIds: Set<string>;
  compact?: boolean;
  onActivate: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

export function Board({
  groups,
  activeId,
  selectedIds,
  compact,
  onActivate,
  onToggleSelect,
}: BoardProps) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  if (total === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ color: "var(--p-text-3)" }}
      >
        <span className="text-[13px]">該当する記事がありません</span>
      </div>
    );
  }

  return (
    <div className="py-2">
      {groups.map((group) => (
        <section key={group.stage} className="mb-1">
          <div
            className="sticky top-0 z-10 flex items-center gap-2 px-4 py-[7px] backdrop-blur"
            style={{
              background: "color-mix(in srgb, var(--p-bg) 82%, transparent)",
            }}
          >
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--p-text-2)" }}
            >
              {STAGE_META[group.stage].label}
            </span>
            <span className="tabular-nums text-[11px]" style={{ color: "var(--p-text-3)" }}>
              {group.items.length}
            </span>
            <span className="ml-2 h-px flex-1" style={{ background: "var(--p-border)" }} />
          </div>

          {group.items.map((a) => {
            const active = a.id === activeId;
            const selected = selectedIds.has(a.id);
            return (
              <motion.button
                key={a.id}
                data-row-id={a.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => onActivate(a.id)}
                className={`proto-row group relative flex w-full items-start gap-3 px-4 text-left transition-colors ${compact ? "py-[6px]" : "py-[11px]"}`}
                style={{
                  background: active ? "var(--p-bg-raised)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--p-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {active && (
                  <motion.span
                    layoutId="proto-active-rail"
                    className="absolute inset-y-1 left-0 w-[3px] rounded-full"
                    style={{ background: "var(--p-accent)" }}
                  />
                )}

                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(a.id);
                  }}
                  className={`mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] transition-opacity ${
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    background: selected ? "var(--p-accent)" : "transparent",
                    border: selected
                      ? "1px solid var(--p-accent)"
                      : "1px solid var(--p-border-strong)",
                  }}
                >
                  {selected && <IconCheck size={13} style={{ color: "#0a0c10" }} />}
                </span>

                <EyecatchThumb hue={a.hue} has={a.hasEyecatch} url={a.eyecatchUrl} size={38} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {a.awaitingYou && <AwaitingDot />}
                    <span
                      className="truncate text-[13.5px] font-medium leading-snug"
                      style={{ color: "var(--p-text)" }}
                    >
                      {a.title}
                    </span>
                  </span>

                  {!compact && (
                    <span
                      className="mt-[3px] block truncate text-[12px] leading-snug"
                      style={{ color: "var(--p-text-3)" }}
                    >
                      {a.excerpt}
                    </span>
                  )}

                  <span className="mt-2 flex items-center gap-3">
                    <StageChip stage={a.stage} small />
                    {a.stuck && (
                      <span
                        className="proto-pulse rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                        style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
                        title="生成が滞留しています"
                      >
                        滞留
                      </span>
                    )}
                    {a.reviseStatus === "presenting" && (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                        style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
                      >
                        提示中
                      </span>
                    )}
                    {styleHintCount(a) > 0 && (
                      <span
                        className="rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                        style={{ background: "var(--p-red-weak)", color: "var(--p-red)" }}
                        title="文体チェックの指摘あり"
                      >
                        文体{styleHintCount(a)}
                      </span>
                    )}
                    {a.reviseStatus === "requested" && (
                      <span
                        className="proto-pulse rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                        style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
                      >
                        修正中
                      </span>
                    )}
                    <ScoreBar score={a.score} />
                    <MetaStat icon={<IconClock size={13} />}>{a.updatedLabel}</MetaStat>
                  </span>
                </span>
              </motion.button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
