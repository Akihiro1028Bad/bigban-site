/**
 * 承認画面の通知トースト一覧(#H7 分解)。完成通知・コピー通知等。閉じるまで残す。
 */

"use client";

export interface ApproveToast {
  id: string;
  message: string;
  tone: "success" | "error";
}

interface ToastListProps {
  toasts: ApproveToast[];
  onDismiss: (id: string) => void;
}

export function ToastList({ toasts, onDismiss }: ToastListProps) {
  if (toasts.length === 0) return null;
  return (
    <div aria-label="お知らせ" className="mt-2 space-y-1">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            toast.tone === "error" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            aria-label={`通知を閉じる: ${toast.message}`}
            onClick={() => onDismiss(toast.id)}
            className={`shrink-0 rounded border bg-white px-2 py-0.5 text-xs ${
              toast.tone === "error"
                ? "border-red-300 text-red-700"
                : "border-green-300 text-green-700"
            }`}
          >
            閉じる
          </button>
        </div>
      ))}
    </div>
  );
}
