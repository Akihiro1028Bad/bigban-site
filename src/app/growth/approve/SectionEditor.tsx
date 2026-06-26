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
        className="w-full rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900"
      />
      <textarea
        aria-label={`説明を編集: ${heading}`}
        value={editDescription}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="このセクションの内容(1行)"
        className="mt-1 h-14 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-700"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
        >
          この行を保存
        </button>
      </div>
    </motion.div>
  );
}
