/**
 * 盤の1カード(#H7 分解 / #107・#119・#137)。記事=段階インジケータ＋スコアバー、
 * 決定済み/下書き/下流待ち/未処理で操作を出し分ける。派生値は親が計算して渡す(表示専用)。
 */

"use client";

import { STAGE_STEPS } from "./board";
import { choiceButtonClass, TAP_TARGET } from "./approveStyles";

interface BoardCardItem {
  id: string;
  title: string;
  kind: "proposal" | "idea";
  stage: string;
  isDraftReady?: boolean;
}

interface BoardCardProps {
  item: BoardCardItem;
  choice: string | undefined;
  isBusy: boolean;
  lockedForRevise: boolean;
  failure: { message: string; retry: () => void } | undefined;
  isFocused: boolean;
  bulkSelectable: boolean;
  selected: boolean;
  isIdea: boolean;
  step: number;
  scoreBarWidth: number;
  stageAccentClass: string;
  stuck: boolean;
  rowClassName: string;
  kindLabel: string;
  generatingStepsText: string;
  awaitingDownstream: boolean;
  onOpen: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function BoardCard({
  item,
  choice,
  isBusy,
  lockedForRevise,
  failure,
  isFocused,
  bulkSelectable,
  selected,
  isIdea,
  step,
  scoreBarWidth,
  stageAccentClass,
  stuck,
  rowClassName,
  kindLabel,
  generatingStepsText,
  awaitingDownstream,
  onOpen,
  onUndo,
  onEdit,
  onToggleSelect,
  onApprove,
  onReject,
}: BoardCardProps) {
  const detailButton = (
    <button
      type="button"
      aria-label={`詳細: ${item.title}`}
      onClick={onOpen}
      className={`${TAP_TARGET} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
    >
      詳細
    </button>
  );
  return (
    <li
      className={`${rowClassName} ${stageAccentClass} ${isFocused ? "ring-2 ring-blue-500" : ""}`}
      data-decision={choice ?? ""}
    >
      {bulkSelectable ? (
        <label className="mb-1 flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            aria-label={`一括選択: ${item.title}`}
            checked={selected}
            onChange={onToggleSelect}
          />
          選択
        </label>
      ) : null}
      {isIdea ? (
        <div className="mb-2">
          <div aria-label="進捗" className="flex items-center gap-1">
            {STAGE_STEPS.map((label, i) => (
              <span
                key={label}
                aria-current={i === step ? "step" : undefined}
                className={`h-1.5 w-1.5 rounded-full ${i <= step ? "bg-blue-600" : "bg-gray-300"}`}
              />
            ))}
            <span className="ml-1 text-xs text-gray-500">{STAGE_STEPS[step]}</span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-gray-200">
            <div className="h-1 rounded-full bg-blue-500" style={{ width: `${scoreBarWidth}%` }} />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left line-clamp-2 text-[15px] font-semibold leading-snug ${
          choice ? "text-gray-600" : "text-gray-900"
        }`}
      >
        {item.title}
      </button>
      {choice ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-gray-700">
            ✓ <span className="font-semibold">{choice}しました</span>
          </span>
          <div className="ml-auto flex gap-2">
            {detailButton}
            <button
              type="button"
              id={`undo-${item.id}`}
              aria-label={`取り消す: ${item.title}`}
              onClick={onUndo}
              disabled={isBusy}
              className={choiceButtonClass("shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
            >
              取り消す
            </button>
          </div>
        </div>
      ) : item.isDraftReady ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
            📝 下書き
          </span>
          <div className="ml-auto flex gap-2">
            {detailButton}
            <button
              type="button"
              id={`card-edit-${item.id}`}
              aria-label={`編集: ${item.title}`}
              onClick={onEdit}
              className={`${TAP_TARGET} border border-blue-600 bg-blue-600 text-white`}
            >
              編集
            </button>
          </div>
        </div>
      ) : awaitingDownstream ? (
        <div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`shrink-0 rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white ${
                item.stage === "generating" ? "motion-safe:animate-pulse" : ""
              }`}
            >
              {item.kind === "proposal" ? "承認済み" : item.stage === "generating" ? "生成中" : "生成待ち"}
            </span>
            <div className="ml-auto">{detailButton}</div>
          </div>
          {item.stage === "generating" ? (
            <div className="mt-2 text-xs text-gray-500">
              <span className="motion-safe:animate-pulse">🖊 自宅PCで執筆中…</span>
              <span className="ml-2">{generatingStepsText}</span>
            </div>
          ) : null}
          {stuck ? (
            <p role="status" className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              時間がかかっています。自宅PCの巡回が動いているか確認してください。
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 rounded bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
              {kindLabel}
            </span>
          </div>
          <div
            role="group"
            aria-label={`承認または却下: ${item.title}`}
            className="mt-2 flex flex-col gap-2 sm:flex-row"
          >
            <button
              type="button"
              id={`approve-${item.id}`}
              aria-label={`承認: ${item.title}`}
              onClick={onApprove}
              disabled={isBusy || lockedForRevise}
              className={choiceButtonClass("flex-1 border border-blue-600 bg-blue-600 text-white")}
            >
              承認
            </button>
            <button
              type="button"
              aria-label={`却下: ${item.title}`}
              onClick={onReject}
              disabled={isBusy || lockedForRevise}
              className={choiceButtonClass("flex-1 border border-gray-700 bg-gray-700 text-white")}
            >
              却下
            </button>
            {detailButton}
          </div>
        </>
      )}
      {failure ? (
        <div
          role="alert"
          className="mt-2 flex items-center justify-between gap-2 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800"
        >
          <span>{failure.message}</span>
          <button
            type="button"
            aria-label={`再試行: ${item.title}`}
            onClick={failure.retry}
            disabled={isBusy}
            className={choiceButtonClass("shrink-0 border border-red-600 bg-red-600 text-white")}
          >
            再試行
          </button>
        </div>
      ) : null}
    </li>
  );
}
