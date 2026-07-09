/**
 * 盤の1行(#213/#211 proto 対話モデルへ一本化)。
 * 行は「開く / 選ぶ」だけを担い、決定操作(承認/却下/編集/取消/詳細)は撤去した。
 * 決定は詳細パネル(フッター/ヘッダ)・ProposalView・BulkBar が担う。
 * 見た目は proto `approve-proto/Board.tsx` の行に合わせる:
 *  - 控えめ 18px チェック(hover で出現・選択時 accent 塗り + IconCheck)。
 *  - タイトルはボタン(13.5px medium truncate)で onOpen。
 *  - 抜粋 + メタ行(StageChip / 滞留・修正中バッジ / ScoreBar)。
 * 状態は決定操作ではなく情報チップ(✓承認 / 生成中 / 生成待ち / 承認済み)として最小表示する。
 * 派生表示値(hue/抜粋/hasEyecatch/stage)は表示専用の純ロジックから決定的に導出する。
 */

"use client";

import { cardExcerpt, cardHasEyecatch, cardHue } from "./boardCardView";
import { isReviseBusy } from "./boardItemHelpers";
import { activityBadgeLabels } from "@/lib/growth/activity";
import type { PendingItem } from "./types";
import { IconCheck } from "./ui/icons";
import { EyecatchThumb } from "./ui/eyecatchThumb";
import { deriveBoardStage } from "./ui/boardStage";
import { AwaitingDot, ScoreBar, StageChip } from "./ui/primitives";

interface BoardCardProps {
  item: PendingItem;
  choice: string | undefined;
  isFocused: boolean;
  bulkSelectable: boolean;
  selected: boolean;
  stuck: boolean;
  rowClassName: string;
  awaitingDownstream: boolean;
  /**
   * 行のルート要素。既定は `<li>`(単体で `<ul>` 直下に置くとき用)。
   * BoardList は自前で `<li role="listitem">` を持つため、その中では `"div"` を渡して
   * `<li>` の入れ子(不正 HTML)を避ける。表示系の中身は as に依存せず不変。
   */
  as?: "li" | "div";
  onOpen: () => void;
  onToggleSelect: () => void;
}

export function BoardCard({
  item,
  choice,
  isFocused,
  bulkSelectable,
  selected,
  stuck,
  rowClassName,
  awaitingDownstream,
  as: Root = "li",
  onOpen,
  onToggleSelect,
}: BoardCardProps) {
  // 「あなた待ち」= 未決定 & 未下書き & 下流待ちでない(isActionable と同義。decided は choice が担う)。
  const awaitingYou = !choice && !item.isDraftReady && !awaitingDownstream;
  const excerpt = cardExcerpt(item);
  const reviseBusy = isReviseBusy(item.reviseStatus);
  const activityBadges = activityBadgeLabels(item.activities ?? []);
  const downstreamLabel =
    item.kind === "proposal"
      ? "承認済み"
      : item.stage === "generating"
        ? "生成中"
        : "生成待ち";

  return (
    <Root
      className={`${rowClassName} ${isFocused ? "ring-2 ring-[var(--p-ring)]" : ""}`}
      data-decision={choice ?? ""}
    >
      {bulkSelectable ? (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={`一括選択: ${item.title}`}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }
          }}
          className={`mt-[2px] flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            backgroundColor: selected ? "var(--p-accent)" : "transparent",
            borderColor: selected ? "var(--p-accent)" : "var(--p-border-strong)",
          }}
        >
          {selected ? <IconCheck size={13} style={{ color: "#0a0c10" }} /> : null}
        </span>
      ) : null}

      <EyecatchThumb
        hue={cardHue(item.id)}
        has={cardHasEyecatch(item)}
        url={item.eyecatchUrl || undefined}
        size={38}
        alt=""
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {awaitingYou ? <AwaitingDot /> : null}
          <button
            type="button"
            id={`open-${item.id}`}
            onClick={onOpen}
            className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium leading-snug"
            style={{ color: choice ? "var(--p-text-2)" : "var(--p-text)" }}
          >
            {item.title}
          </button>
        </div>

        {excerpt ? (
          <p
            className="mt-[3px] truncate text-[12px] leading-snug"
            style={{ color: "var(--p-text-3)" }}
          >
            {excerpt}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StageChip stage={deriveBoardStage(item)} small />
          {stuck ? (
            <span
              className="approve-pulse rounded-full px-1.5 py-[1px] text-[10px] font-medium"
              style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
              title="生成が滞留しています"
            >
              滞留
            </span>
          ) : null}
          {reviseBusy ? (
            <span
              className="approve-pulse rounded-full px-1.5 py-[1px] text-[10px] font-medium"
              style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
              title="AI が修正中です"
            >
              修正中
            </span>
          ) : null}
          {activityBadges.map((label) => (
            <span
              key={label}
              className={`rounded-full px-1.5 py-[1px] text-[10px] font-medium ${
                label === "AI処理中" || label === "画像再生成中" ? "approve-pulse" : ""
              }`}
              style={{
                background: label === "直近失敗" ? "var(--p-red-weak)" : "var(--p-bg-raised)",
                color: label === "直近失敗" ? "var(--p-red)" : "var(--p-text-2)",
              }}
            >
              {label}
            </span>
          ))}
          {choice ? (
            <span
              className="rounded-full px-1.5 py-[1px] text-[10px] font-medium"
              style={{ color: "var(--p-text-2)" }}
            >
              ✓{choice}
            </span>
          ) : null}
          {awaitingDownstream ? (
            <span
              className={`rounded-full px-1.5 py-[1px] text-[10px] font-medium ${
                item.stage === "generating" ? "approve-pulse" : ""
              }`}
              style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
            >
              {downstreamLabel}
            </span>
          ) : null}
          {item.score != null ? <ScoreBar score={item.score} /> : null}
        </div>
      </div>
    </Root>
  );
}
