/**
 * ショートカット一覧: ? で開くチートシート。proto(#proto) からの本番移植。
 */
"use client";

import { motion } from "framer-motion";

import { handleOverlayKeyDown } from "@/app/growth/approve/hooks/overlayKeyDown";
import { useDialog } from "@/app/growth/approve/hooks/useDialog";
import { Kbd } from "@/app/growth/approve/ui/primitives";

interface Row {
  keys: string[];
  label: string;
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "移動",
    rows: [
      { keys: ["J"], label: "次の記事" },
      { keys: ["K"], label: "前の記事" },
      { keys: ["/"], label: "検索にフォーカス" },
    ],
  },
  {
    title: "操作",
    rows: [
      { keys: ["A"], label: "承認" },
      { keys: ["R"], label: "修正を依頼" },
      { keys: ["E"], label: "本文を編集" },
      { keys: ["X"], label: "選択 / 解除" },
      { keys: ["esc"], label: "閉じる / 選択解除" },
    ],
  },
  {
    title: "表示",
    rows: [
      { keys: ["1"], label: "構成案" },
      { keys: ["2"], label: "プレビュー" },
      { keys: ["3"], label: "素材" },
      { keys: ["?"], label: "このヘルプ" },
    ],
  },
];

interface ShortcutOverlayProps {
  onClose: () => void;
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  const dialogRef = useDialog();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onClose)}
        className="w-full max-w-[560px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <span className="text-[14px] font-semibold">キーボードショートカット</span>
          <button onClick={onClose} className="ml-auto"><Kbd>esc</Kbd></button>
        </div>
        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
                {g.title}
              </div>
              <div className="flex flex-col gap-2.5">
                {g.rows.map((r) => (
                  <div key={r.label} className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      {r.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                    <span className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
                      {r.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
