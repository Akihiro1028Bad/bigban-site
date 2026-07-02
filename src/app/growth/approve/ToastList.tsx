/**
 * 承認画面の通知トースト一覧(#H7 分解 / #proto P5b)。完成通知・コピー通知等。
 * proto ToastStack の見た目へ再スキン: 右下 fixed スタック＋AnimatePresence。
 * 契約は不変(tone 2値 / dismiss ボタン維持 / role=status / aria-label=お知らせ / useToasts 不変)。
 * #P6: コンテナは role="region"(aria-label を許可する landmark)を明示し、aria-prohibited-attr を解消。
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";

import { IconCheckCircle, IconX } from "./ui/icons";

export interface ApproveToast {
  id: string;
  message: string;
  tone: "success" | "error";
}

interface ToastListProps {
  toasts: ApproveToast[];
  onDismiss: (id: string) => void;
}

// tone 2値の配色。success=緑 / error=赤(proto の --p-*-weak / --p-* を踏襲。--p-bg-danger は不在なので使わない)。
const TONE: Record<
  ApproveToast["tone"],
  { color: string; bg: string; icon: React.ReactNode }
> = {
  success: {
    color: "var(--p-green)",
    bg: "var(--p-green-weak)",
    icon: <IconCheckCircle size={16} />,
  },
  error: {
    color: "var(--p-red)",
    bg: "var(--p-red-weak)",
    icon: <IconX size={16} />,
  },
};

export function ToastList({ toasts, onDismiss }: ToastListProps) {
  return (
    // 右下 fixed スタック。ToastList は .approve-shell 配下で描画されるため
    // トークン(var(--p-*))は継承で解決される(root への approve-shell 付与は不要)。
    // z-index: 既存モーダル群(詳細z-50/編集z-60/パレットz-70/確認z-80)より上の z-[90] を採る。
    // トーストは操作結果の通知であり、確認ダイアログ表示中でも見えるべきなので最前面に置く。
    // pointer-events-none で下層の操作を邪魔せず、閉じるボタンだけ pointer-events-auto にする。
    // role="region": aria-label 単独の <div> は無効 ARIA(aria-prohibited-attr)になるため、
    // ラベルを許可する landmark ロールを明示する。中の各トーストは role="status" で個別に通知する。
    <div
      role="region"
      aria-label="お知らせ"
      className="pointer-events-none fixed bottom-5 right-5 z-[90] flex flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const tone = TONE[toast.tone];
          return (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-[12px] py-2.5 pl-3 pr-3 text-[13px] font-medium"
              style={{
                background: "var(--p-bg-elevated)",
                border: "1px solid var(--p-border-strong)",
                color: "var(--p-text)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px]"
                style={{ background: tone.bg, color: tone.color }}
              >
                {tone.icon}
              </span>
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                aria-label={`通知を閉じる: ${toast.message}`}
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 rounded-[7px] px-2 py-0.5 text-[12px]"
                style={{ color: "var(--p-text-2)" }}
              >
                閉じる
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
