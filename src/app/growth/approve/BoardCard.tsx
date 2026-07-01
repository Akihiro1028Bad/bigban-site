/**
 * 盤の1カード(#H7 分解 / #107・#119・#137 / #proto P2 T4 再スキン)。
 * 見た目は proto 由来のプリミティブ(EyecatchThumb/StageChip/ScoreBar/AwaitingDot)へ寄せる。
 * 分岐(決定済み/下書き完了/下流待ち/未決定)と承認/却下/取消/編集の操作ロジックは現行維持。
 * 派生表示値(hue/抜粋/hasEyecatch/stage)は表示専用の純ロジックから決定的に導出する。
 */

"use client";

import { choiceButtonClass, TAP_TARGET } from "./approveStyles";
import { cardExcerpt, cardHasEyecatch, cardHue } from "./boardCardView";
import type { PendingItem } from "./types";
import { EyecatchThumb } from "./ui/eyecatchThumb";
import { deriveBoardStage } from "./ui/boardStage";
import { AwaitingDot, ScoreBar, StageChip } from "./ui/primitives";

interface BoardCardProps {
  item: PendingItem;
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
  // 「あなた待ち」= 未決定 & 未下書き & 下流待ちでない(isActionable と同義。decided は choice が担う)。
  const awaitingYou = !choice && !item.isDraftReady && !awaitingDownstream;
  const excerpt = cardExcerpt(item);
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
        <label className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--p-text-3)" }}>
          <input
            type="checkbox"
            aria-label={`一括選択: ${item.title}`}
            checked={selected}
            onChange={onToggleSelect}
          />
          選択
        </label>
      ) : null}

      <div className="flex items-start gap-3">
        <EyecatchThumb hue={cardHue(item.id)} has={cardHasEyecatch(item)} size={38} alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {awaitingYou ? <AwaitingDot /> : null}
            <button
              type="button"
              onClick={onOpen}
              className="min-w-0 flex-1 line-clamp-2 text-left text-[14px] font-semibold leading-snug"
              style={{ color: choice ? "var(--p-text-2)" : "var(--p-text)" }}
            >
              {item.title}
            </button>
          </div>
          {excerpt ? (
            <p className="mt-[3px] truncate text-[12px] leading-snug" style={{ color: "var(--p-text-3)" }}>
              {excerpt}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StageChip stage={deriveBoardStage(item)} small />
            {item.score != null ? <ScoreBar score={item.score} /> : null}
          </div>
        </div>
      </div>

      {choice ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--p-text-2)" }}>
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
              className={`shrink-0 rounded-full px-2 py-[2px] text-[11px] font-medium ${
                item.stage === "generating" ? "approve-pulse" : ""
              }`}
              style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
            >
              {item.kind === "proposal" ? "承認済み" : item.stage === "generating" ? "生成中" : "生成待ち"}
            </span>
            <div className="ml-auto">{detailButton}</div>
          </div>
          {item.stage === "generating" ? (
            <div className="mt-2 text-xs" style={{ color: "var(--p-text-3)" }}>
              <span className="approve-pulse">🖊 自宅PCで執筆中…</span>
              <span className="ml-2">{generatingStepsText}</span>
            </div>
          ) : null}
          {stuck ? (
            <p
              role="status"
              className="mt-2 rounded-md px-2 py-1 text-xs"
              style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
            >
              時間がかかっています。自宅PCの巡回が動いているか確認してください。
            </p>
          ) : null}
        </div>
      ) : (
        <>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="shrink-0 rounded-full px-2 py-[2px] text-[11px] font-medium"
            style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
          >
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
