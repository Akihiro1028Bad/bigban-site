/**
 * 構成案セクションの手動編集フォーム(#H7 分解 / #54)。見出し＋説明をその場で直す。
 */

"use client";

import { motion } from "framer-motion";

import { choiceButtonClass } from "./approveStyles";

interface SectionEditorProps {
  heading: string;
  editHeading: string;
  onHeadingChange: (value: string) => void;
  editDescription: string;
  onDescriptionChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function SectionEditor({
  heading,
  editHeading,
  onHeadingChange,
  editDescription,
  onDescriptionChange,
  busy,
  onCancel,
  onSave,
}: SectionEditorProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <input
        type="text"
        aria-label={`見出しを編集: ${heading}`}
        value={editHeading}
        onChange={(event) => onHeadingChange(event.target.value)}
        className="w-full rounded-md border border-[var(--p-border-strong)] bg-[var(--p-bg-input)] p-2 text-sm font-medium text-[var(--p-text)]"
      />
      <textarea
        aria-label={`説明を編集: ${heading}`}
        value={editDescription}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="このセクションの内容(1行)"
        className="mt-1 h-14 w-full rounded-md border border-[var(--p-border-strong)] bg-[var(--p-bg-input)] p-2 text-sm text-[var(--p-text-2)]"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={choiceButtonClass("approve-btn-ghost")}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className={choiceButtonClass("approve-btn-primary border border-transparent bg-[var(--p-accent)] text-[#0a0c10]")}
        >
          この行を保存
        </button>
      </div>
    </motion.div>
  );
}
