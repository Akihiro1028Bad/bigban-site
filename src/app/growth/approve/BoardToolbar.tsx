/**
 * 操作ツールバー(#109 / #H7 分解)。コマンドパレット起動＋表示密度トグル(キーボード非依存の可視UI)。
 */

"use client";

import { TAP_TARGET } from "./approveStyles";
import type { Density } from "./boardPrefs";

interface BoardToolbarProps {
  density: Density;
  onToggleDensity: () => void;
  onOpenPalette: () => void;
}

export function BoardToolbar({ density, onToggleDensity, onOpenPalette }: BoardToolbarProps) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenPalette}
        className={`${TAP_TARGET} flex-1 border border-gray-300 bg-white text-left text-sm text-gray-600 hover:bg-gray-50`}
      >
        🔍 検索・ジャンプ（⌘K / /）
      </button>
      <button
        type="button"
        aria-pressed={density === "compact"}
        onClick={onToggleDensity}
        className={`${TAP_TARGET} border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50`}
      >
        {density === "compact" ? "コンパクト" : "標準"}
      </button>
    </div>
  );
}
