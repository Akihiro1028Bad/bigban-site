/**
 * 下部バー(#proto): キーヒント / 盤モード切替(リスト⇄カンバン) / ブランド配色 / ヘルプ。
 */
"use client";

import { IconKeyboard, IconLayout, IconList, IconSparkles } from "./icons";
import { Kbd } from "./ui";
import type { BoardMode } from "./types";

interface ShortcutBarProps {
  boardMode: BoardMode;
  showBoardToggle: boolean;
  brand: boolean;
  onBoardModeChange: (mode: BoardMode) => void;
  onToggleBrand: () => void;
  onOpenShortcuts: () => void;
}

export function ShortcutBar({
  boardMode,
  showBoardToggle,
  brand,
  onBoardModeChange,
  onToggleBrand,
  onOpenShortcuts,
}: ShortcutBarProps) {
  return (
    <footer
      className="flex h-[34px] shrink-0 items-center gap-4 px-4 text-[11.5px]"
      style={{
        borderTop: "1px solid var(--p-border)",
        background: "var(--p-bg-elevated)",
        color: "var(--p-text-3)",
      }}
    >
      <span className="flex items-center gap-1.5">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> 移動
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>A</Kbd> 承認
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>R</Kbd> 修正
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>X</Kbd> 選択
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>E</Kbd> 編集
      </span>

      <div className="ml-auto flex items-center gap-2">
        {showBoardToggle && (
          <div
            className="flex items-center gap-[2px] rounded-[8px] p-[2px]"
            style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
          >
            <button
              onClick={() => onBoardModeChange("list")}
              className="flex items-center gap-1 rounded-[6px] px-2 py-[3px] text-[11.5px] font-medium"
              style={{
                background: boardMode === "list" ? "var(--p-bg-raised)" : "transparent",
                color: boardMode === "list" ? "var(--p-text)" : "var(--p-text-3)",
              }}
            >
              <IconList size={13} /> リスト
            </button>
            <button
              onClick={() => onBoardModeChange("kanban")}
              className="flex items-center gap-1 rounded-[6px] px-2 py-[3px] text-[11.5px] font-medium"
              style={{
                background: boardMode === "kanban" ? "var(--p-bg-raised)" : "transparent",
                color: boardMode === "kanban" ? "var(--p-text)" : "var(--p-text-3)",
              }}
            >
              <IconLayout size={13} /> カンバン
            </button>
          </div>
        )}

        <button
          onClick={onToggleBrand}
          className="flex items-center gap-1.5 rounded-[8px] px-2 py-[4px] font-medium transition-colors"
          style={{
            background: brand ? "var(--p-accent-weak)" : "var(--p-bg-input)",
            border: "1px solid var(--p-border)",
            color: brand ? "var(--p-accent)" : "var(--p-text-3)",
          }}
          title="ブランド配色(アクセント黄)を切替"
        >
          <IconSparkles size={13} /> ブランド配色
        </button>

        <button
          onClick={onOpenShortcuts}
          className="flex items-center gap-1.5 rounded-[8px] px-2 py-[4px]"
          style={{
            background: "var(--p-bg-input)",
            border: "1px solid var(--p-border)",
            color: "var(--p-text-3)",
          }}
        >
          <IconKeyboard size={13} /> <Kbd>?</Kbd>
        </button>
      </div>
    </footer>
  );
}
