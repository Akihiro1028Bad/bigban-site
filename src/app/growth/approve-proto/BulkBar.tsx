/**
 * 一括操作バー(#proto): 複数選択時に下からせり上がる。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import { IconCheck, IconX } from "./icons";
import { Kbd } from "./ui";

interface BulkBarProps {
  count: number;
  onApproveAll: () => void;
  onClear: () => void;
}

export function BulkBar({ count, onApproveAll, onClear }: BulkBarProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.18 }}
          className="fixed bottom-9 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[12px] py-2 pl-4 pr-2"
          style={{
            background: "var(--p-bg-elevated)",
            border: "1px solid var(--p-border-strong)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
          }}
        >
          <span className="flex items-center gap-2 text-[13px]">
            <span
              className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums"
              style={{ background: "var(--p-accent)", color: "#0a0c10" }}
            >
              {count}
            </span>
            件を選択中
          </span>
          <span className="h-5 w-px" style={{ background: "var(--p-border)" }} />
          <button onClick={onApproveAll} className="proto-btn-ghost">
            <IconCheck size={14} /> まとめて承認
          </button>
          <button
            onClick={onClear}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px]"
            style={{ color: "var(--p-text-3)" }}
            aria-label="選択解除"
            title="選択解除"
          >
            <IconX size={15} />
          </button>
          <Kbd>esc</Kbd>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
