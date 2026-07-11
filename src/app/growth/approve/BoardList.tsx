/**
 * 単一リスト Board(#proto P3a): 段階でグルーピングした記事リストを縦一列で表示する。
 *
 * proto `approve-proto/Board.tsx`(単一縦リスト・段階 section・sticky ヘッダ＋件数・
 * 行 motion・アクティブ行 layoutId レール)からの移植。
 * 行本体は `renderRow` に委譲し、本コンポーネントは
 * 「段階セクション骨格＋sticky ヘッダ＋件数＋アクティブ行 layoutId レール＋
 * 行クリック→onActivate」に責務を絞る(操作ロジックは呼び出し側で維持)。
 */
"use client";

import { motion } from "framer-motion";

import type { ReactNode } from "react";

import type { BoardGroup } from "./boardGroups";
import type { PendingItem } from "./types";

interface BoardListProps {
  groups: BoardGroup[];
  activeId: string | null;
  decided: Record<string, string | undefined>;
  densityClass?: string;
  onActivate: (id: string) => void;
  renderRow: (item: PendingItem, isActive: boolean) => ReactNode;
}

export function BoardList({
  groups,
  activeId,
  densityClass,
  onActivate,
  renderRow,
}: BoardListProps) {
  if (groups.length === 0) {
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
              {group.label}
            </span>
            <span className="tabular-nums text-[11px]" style={{ color: "var(--p-text-3)" }}>
              {group.items.length}
            </span>
            <span className="ml-2 h-px flex-1" style={{ background: "var(--p-border)" }} />
          </div>

          <ul role="list" className="m-0 list-none p-0">
            {group.items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <motion.li
                  key={item.id}
                  role="listitem"
                  data-row-id={item.id}
                  aria-current={isActive ? "true" : undefined}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => onActivate(item.id)}
                  className={`approve-row group relative flex w-full items-start gap-3 px-4 py-[11px] text-left transition-colors ${
                    densityClass ?? ""
                  }`}
                  style={{
                    background: isActive ? "var(--p-bg-raised)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--p-bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="approve-active-rail"
                      className="absolute inset-y-1 left-0 w-[3px] rounded-full"
                      style={{ background: "var(--p-accent)" }}
                    />
                  )}

                  {renderRow(item, isActive)}
                </motion.li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
