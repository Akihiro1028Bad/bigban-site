/**
 * 通知トースト(完了通知/コピー結果など)の状態管理(#108/M8 / #H7 分解)。
 * 一意 id を採番して積む pushToast、明示 id 付きの一括追加 pushToasts(完成検知用)、dismissToast。
 */

"use client";

import { useCallback, useRef, useState } from "react";

import type { ApproveToast } from "../ToastList";

export function useToasts() {
  const [toasts, setToasts] = useState<ApproveToast[]>([]);
  // コピー等の通知トーストに使う一意 id 採番。
  const toastSeq = useRef(0);

  const pushToast = useCallback((message: string, tone: "success" | "error" = "success"): void => {
    toastSeq.current += 1;
    setToasts((prev) => [...prev, { id: `toast-${toastSeq.current}`, message, tone }]);
  }, []);

  // #108: 完成検知など、呼び出し側が一意 id を決めて複数件まとめて積む。
  const pushToasts = useCallback((items: ApproveToast[]): void => {
    setToasts((prev) => [...prev, ...items]);
  }, []);

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, pushToast, pushToasts, dismissToast };
}
