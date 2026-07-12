/**
 * 下部バー: キーヒント / ヘルプ。proto(#proto) からの本番移植。
 */
"use client";

import { IconKeyboard } from "@/app/growth/approve/ui/icons";
import { Kbd } from "@/app/growth/approve/ui/primitives";

interface ShortcutBarProps {
  onOpenShortcuts: () => void;
}

export function ShortcutBar({ onOpenShortcuts }: ShortcutBarProps) {
  return (
    <footer
      className="flex h-[34px] shrink-0 items-center gap-4 px-4 text-[11.5px]"
      style={{
        borderTop: "1px solid var(--p-border)",
        background: "var(--p-bg-elevated)",
        color: "var(--p-text-3)",
      }}
    >
      {/* キーヒントはキーボード専用。タッチ中心の狭幅では隠す。 */}
      <div className="hidden items-center gap-4 md:flex">
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
      </div>

      <button
        onClick={onOpenShortcuts}
        className="ml-auto flex items-center gap-1.5 rounded-[8px] px-2 py-[4px]"
        style={{
          background: "var(--p-bg-input)",
          border: "1px solid var(--p-border)",
          color: "var(--p-text-3)",
        }}
      >
        <IconKeyboard size={13} /> <Kbd>?</Kbd>
      </button>
    </footer>
  );
}
