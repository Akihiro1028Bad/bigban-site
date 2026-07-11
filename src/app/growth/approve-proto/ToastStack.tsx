/**
 * トースト表示(#proto): 操作結果を右下に積む。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import { IconCheckCircle, IconWand, IconX } from "./icons";
import type { Toast } from "./types";

const TONE: Record<Toast["tone"], { color: string; bg: string; icon: React.ReactNode }> = {
  success: { color: "var(--p-green)", bg: "var(--p-green-weak)", icon: <IconCheckCircle size={16} /> },
  info: { color: "var(--p-accent)", bg: "var(--p-accent-weak)", icon: <IconWand size={16} /> },
  danger: { color: "var(--p-red)", bg: "var(--p-red-weak)", icon: <IconX size={16} /> },
};

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const tone = TONE[t.tone];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2.5 rounded-[12px] py-2.5 pl-3 pr-4 text-[13px] font-medium"
              style={{
                background: "var(--p-bg-elevated)",
                border: "1px solid var(--p-border-strong)",
                color: "var(--p-text)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px]"
                style={{ background: tone.bg, color: tone.color }}
              >
                {tone.icon}
              </span>
              {t.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
