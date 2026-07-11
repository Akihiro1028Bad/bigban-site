/**
 * 汎用の確認ダイアログ(#proto): 破壊的/外向きの操作の前に確認を取る。
 * 適用先: 構成からやり直す(revert) / 却下(reject) / 承認して公開予約(publish)。
 */
"use client";

import { motion } from "framer-motion";

import { IconBolt, IconWand, IconX } from "./icons";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";

export type ConfirmKind = "revert" | "reject" | "publish";

interface ConfirmCopy {
  icon: React.ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  tone: string;
  ink: string;
}

const COPY: Record<ConfirmKind, ConfirmCopy> = {
  revert: {
    icon: <IconWand size={18} />,
    title: "構成からやり直しますか？",
    body: "提案中（構成案レビュー）に戻します。再承認すると、現在の下書き・手動編集・アイキャッチ・本文画像は作り直されます。",
    confirmLabel: "やり直す",
    tone: "var(--p-amber)",
    ink: "#1a1305",
  },
  reject: {
    icon: <IconX size={18} />,
    title: "この記事を却下しますか？",
    body: "却下すると一覧から外れます。あとから戻すこともできますが、まず内容を確認してください。",
    confirmLabel: "却下する",
    tone: "var(--p-red)",
    ink: "#1a0808",
  },
  publish: {
    icon: <IconBolt size={18} />,
    title: "承認して公開予約しますか？",
    body: "この記事を承認し、公開予約に進めます。公開後は読者に表示されます。内容・アイキャッチ・公開準備を確認のうえ進めてください。",
    confirmLabel: "承認して進める",
    tone: "var(--p-accent)",
    ink: "#06101f",
  },
};

interface ConfirmActionDialogProps {
  kind: ConfirmKind;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionDialog({ kind, title, onConfirm, onCancel }: ConfirmActionDialogProps) {
  const c = COPY[kind];
  const dialogRef = useDialog();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onCancel}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: `color-mix(in srgb, ${c.tone} 16%, transparent)`, color: c.tone }}
          >
            {c.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold">{c.title}</div>
            <div className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              {title}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
              {c.body}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderTop: "1px solid var(--p-border)" }}>
          <span className="mr-auto"><Kbd>esc</Kbd></span>
          <button onClick={onCancel} className="proto-btn-ghost">取消</button>
          <button
            onClick={onConfirm}
            className="proto-btn-primary flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold"
            style={{ background: c.tone, color: c.ink }}
          >
            {c.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
