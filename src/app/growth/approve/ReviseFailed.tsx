/**
 * 構成案修正の「失敗」表示(#H7 分解)。理由＋やり直し(破棄)。
 */

"use client";

import { choiceButtonClass } from "./approveStyles";

interface ReviseFailedProps {
  reason: string;
  busy: boolean;
  onDiscard: () => void;
}

export function ReviseFailed({ reason, busy, onDiscard }: ReviseFailedProps) {
  return (
    <div>
      <p role="alert" className="mt-2 text-sm text-red-700">
        修正に失敗しました: {reason}
      </p>
      <button
        type="button"
        onClick={onDiscard}
        disabled={busy}
        className={choiceButtonClass("mt-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
      >
        やり直し
      </button>
    </div>
  );
}
