/**
 * 構成案修正の「依頼中(提示待ち)」表示(#H7 分解)。PCの処理を待つ間の案内＋手動再取得。
 */

"use client";

import { choiceButtonClass } from "./approveStyles";
import { StaleNotice } from "./StaleNotice";

interface RevisePendingProps {
  requestedAtMs: number | null;
  busy: boolean;
  onRefresh: () => void;
}

export function RevisePending({ requestedAtMs, busy, onRefresh }: RevisePendingProps) {
  return (
    <div>
      <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        修正を依頼しました。PCが処理して最大5分で修正案を提示します。
      </p>
      <StaleNotice requestedAtMs={requestedAtMs} busy />
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className={choiceButtonClass("mt-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
      >
        最新を確認
      </button>
    </div>
  );
}
