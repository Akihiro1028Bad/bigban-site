/**
 * 構成案修正のコメント入力フォーム(#H7 分解)。タイトル指示＋セクション別コメント＋依頼ボタン。
 * セクション行の描画は親から renderSection で受け取る(状態が多く密結合のため)。
 */

"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

import { choiceButtonClass } from "./approveStyles";

interface ReviseCommentFormProps {
  itemId: string;
  titlePrompt: string;
  onTitlePromptChange: (value: string) => void;
  busy: boolean;
  sectionCount: number;
  commentTotal: number;
  renderSection: (index: number) => ReactNode;
  onRequestRevise: () => void;
}

export function ReviseCommentForm({
  itemId,
  titlePrompt,
  onTitlePromptChange,
  busy,
  sectionCount,
  commentTotal,
  renderSection,
  onRequestRevise,
}: ReviseCommentFormProps) {
  const hasTitlePrompt = titlePrompt.trim() !== "";
  return (
    <MotionConfig reducedMotion="user">
      <p className="mt-1 text-xs text-[var(--p-text-2)]">
        見出しの「＋ コメント」でAIに修正を依頼、「編集」で自分で直せます。
      </p>
      <div className="mt-2">
        <label htmlFor={`title-revise-${itemId}`} className="block text-xs font-medium text-[var(--p-text-2)]">
          タイトルについて（AIに修正を依頼）
        </label>
        <textarea
          id={`title-revise-${itemId}`}
          value={titlePrompt}
          onChange={(event) => onTitlePromptChange(event.target.value)}
          disabled={busy}
          rows={2}
          placeholder="例: 市川という地名を入れて、もっと具体的に"
          className="mt-1 w-full rounded-md border border-[var(--p-border-strong)] bg-[var(--p-bg-input)] p-2 text-sm text-[var(--p-text)]"
        />
      </div>
      <ul className="mt-2 space-y-2">
        {Array.from({ length: sectionCount }, (_, i) => renderSection(i))}
      </ul>
      <button
        type="button"
        onClick={onRequestRevise}
        disabled={busy || (commentTotal === 0 && !hasTitlePrompt)}
        className={choiceButtonClass("approve-btn-primary mt-3 w-full border border-transparent bg-[var(--p-accent)] text-[#0a0c10]")}
      >
        修正を依頼{commentTotal > 0 ? `（コメント${commentTotal}件）` : ""}
      </button>
    </MotionConfig>
  );
}
