/**
 * 一括選択バー(#109 / #H7 分解)。選択がある時のみ表示(条件は呼び出し側)。
 * 一括承認/却下は各カードと同じ即時保存＋取り消し。
 */

"use client";

import { choiceButtonClass } from "./approveStyles";

interface BulkActionBarProps {
  count: number;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}

export function BulkActionBar({ count, onApprove, onReject, onClear }: BulkActionBarProps) {
  return (
    <div
      role="group"
      aria-label="一括操作"
      className="mt-2 flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm"
    >
      <span className="flex-1 text-gray-700">{count}件 選択中</span>
      <button
        type="button"
        onClick={onApprove}
        className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
      >
        一括承認
      </button>
      <button
        type="button"
        onClick={onReject}
        className={choiceButtonClass("border border-gray-700 bg-gray-700 text-white")}
      >
        一括却下
      </button>
      <button
        type="button"
        onClick={onClear}
        className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
      >
        解除
      </button>
    </div>
  );
}
