/**
 * 行為(action)一言入力(#proto P3b・本番移植・画像指示再設計)。
 * 「宇宙人は何をしている?」だけを聞く。Enter で確定、Esc で「おまかせ」へ戻す。
 * 入力はライブでプレビューへ反映(onChange)、確定は onCommit。
 */
"use client";

import { IconArrowRight } from "./ui/icons";

interface ActionInputProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function ActionInput({ value, placeholder, onChange, onCommit, onCancel }: ActionInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="approve-action-input">
        宇宙人は何をしている?
      </label>
      <input
        id="approve-action-input"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder={placeholder ?? "例: ラケットを持ち比べる / コートでスイング"}
        className="h-[34px] min-w-0 flex-1 rounded-[8px] px-3 text-[12.5px] outline-none"
        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
      />
      <button
        onClick={onCommit}
        disabled={!value.trim()}
        className="flex items-center gap-1 rounded-[8px] px-3 py-[7px] text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--p-accent)", color: "#0a0c10" }}
      >
        確定 <IconArrowRight size={13} />
      </button>
    </div>
  );
}
