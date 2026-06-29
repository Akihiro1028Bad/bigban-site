/**
 * 施策の構造化登録フォーム(#proto): 施策名＋カテゴリ＋メモ＋検証。
 * 今の「ネタ案追加」(無構造)に対し、施策トリアージの入口を構造化する。
 */
"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { IconPlus } from "./icons";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";

const CATEGORIES = ["SEO記事", "季節・イベント", "比較・選び方", "施設・体験", "法人・団体", "お知らせ"];

interface ProposalFormModalProps {
  onClose: () => void;
  onSubmit: (data: { title: string; category: string; note: string }) => void;
}

export function ProposalFormModal({ onClose, onSubmit }: ProposalFormModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");
  const canSubmit = title.trim().length > 0;
  const dialogRef = useDialog();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="施策を追加"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-[14px]"
        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border-strong)", boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}
      >
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconPlus size={16} {...{ style: { color: "var(--p-accent)" } }} />
          <span className="text-[14px] font-semibold">施策を追加</span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>施策名 *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例）雨の日でも楽しめる屋内ピックルボール"
              className="h-[36px] w-full rounded-[9px] px-3 text-[13px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>カテゴリ</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const active = c === category;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className="rounded-[8px] px-2.5 py-[6px] text-[12px] font-medium"
                    style={{
                      background: active ? "var(--p-accent-weak)" : "var(--p-bg-input)",
                      color: active ? "var(--p-accent)" : "var(--p-text-3)",
                      border: active ? "1px solid var(--p-accent)" : "1px solid var(--p-border)",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--p-text-2)" }}>メモ（狙い・読者）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例）梅雨〜夏の検討層に、屋内施設の快適さで差別化"
              rows={3}
              className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderTop: "1px solid var(--p-border)" }}>
          <button onClick={onClose} className="proto-btn-ghost">取消</button>
          <button
            onClick={() => canSubmit && onSubmit({ title: title.trim(), category, note: note.trim() })}
            disabled={!canSubmit}
            className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconPlus size={14} /> 施策を追加
          </button>
        </div>
      </motion.div>
    </div>
  );
}
