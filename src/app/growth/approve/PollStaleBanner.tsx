/**
 * 盤ポーリング連続失敗の可視化バナー(#H5 / #H7 分解)。古いデータを最新のように見せない。
 * 表示条件(shouldWarnPollStale)は呼び出し側が判定し、本コンポーネントは中身だけを描く。
 */

"use client";

import { formatLastUpdated } from "./pollHealth";

interface PollStaleBannerProps {
  lastBoardSuccessMs: number | null;
  onRetry: () => void;
}

export function PollStaleBanner({ lastBoardSuccessMs, onRetry }: PollStaleBannerProps) {
  return (
    <p
      role="status"
      className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      <span className="flex-1">
        最新情報を取得できていません（最終更新 {formatLastUpdated(lastBoardSuccessMs)}）。回線や自宅PCの状態を確認してください。
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        再試行
      </button>
    </p>
  );
}
