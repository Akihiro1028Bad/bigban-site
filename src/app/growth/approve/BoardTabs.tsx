/**
 * 施策/記事のタブ切替(#119 / #H7 分解)。各タブに未処理件数バッジを出し残件を可視化する。
 * WAI-ARIA tabs(←→ で移動)。状態は持たず、表示中タブと件数・切替ハンドラだけ受け取る。
 */

"use client";

import { APPROVE_VIEWS, type ApproveView } from "./viewRouting";

interface BoardTabsProps {
  activeView: ApproveView;
  pendingByView: Record<ApproveView, number>;
  onChangeView: (view: ApproveView) => void;
}

export function BoardTabs({ activeView, pendingByView, onChangeView }: BoardTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="表示切替"
      onKeyDown={(event) => {
        // WAI-ARIA tabs: ←→ でタブ移動。それ以外のキーは既定動作を維持する。
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const idx = APPROVE_VIEWS.indexOf(activeView);
        const delta = event.key === "ArrowRight" ? 1 : -1;
        onChangeView(APPROVE_VIEWS[(idx + delta + APPROVE_VIEWS.length) % APPROVE_VIEWS.length]);
      }}
      className="mt-3 inline-flex gap-1 rounded-md bg-gray-100 p-1"
    >
      {APPROVE_VIEWS.map((v) => {
        const selectedTab = activeView === v;
        const label = v === "proposals" ? "施策" : "記事";
        const count = pendingByView[v];
        return (
          <button
            key={v}
            type="button"
            role="tab"
            id={`approve-tab-${v}`}
            aria-controls="approve-tabpanel"
            aria-selected={selectedTab}
            tabIndex={selectedTab ? 0 : -1}
            onClick={() => onChangeView(v)}
            className={`min-h-11 flex items-center gap-2 rounded px-4 text-sm font-medium transition-colors ${
              selectedTab ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
            {count > 0 ? (
              <span
                aria-label={`未処理 ${count} 件`}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
