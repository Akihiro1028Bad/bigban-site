/**
 * 構成案の修正セクション枠(#H7 分解 / #42・#139 A)。タイトル直接編集＋段階別の本体(phaseContent)。
 * 段階の振り分けと本体描画は親が行い、phaseContent として注入する。
 */

"use client";

import type { ReactNode } from "react";

import { SECTION_CARD, SECTION_HEAD } from "./approveStyles";
import { TitleEditor } from "./TitleEditor";

interface ReviseSectionProps {
  itemId: string;
  title: string;
  editingTitle: boolean;
  titleValue: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onStartEditTitle: () => void;
  onCancelTitle: () => void;
  onSaveTitle: () => void;
  phaseContent: ReactNode;
  error: string;
}

export function ReviseSection({
  itemId,
  title,
  editingTitle,
  titleValue,
  busy,
  onTitleChange,
  onStartEditTitle,
  onCancelTitle,
  onSaveTitle,
  phaseContent,
  error,
}: ReviseSectionProps) {
  return (
    <section aria-label="構成案の修正" className={`mt-4 ${SECTION_CARD}`}>
      <h3 className={SECTION_HEAD}>構成案の修正</h3>
      <TitleEditor
        itemId={itemId}
        title={title}
        editing={editingTitle}
        value={titleValue}
        busy={busy}
        onChange={onTitleChange}
        onStartEdit={onStartEditTitle}
        onCancel={onCancelTitle}
        onSave={onSaveTitle}
      />
      {phaseContent}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
