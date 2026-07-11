/**
 * 構成案1セクションの表示(#H7 分解 / #53)。見出し・説明・コメントスレッド・コメント入力。
 * 手動編集フォーム(editor)と画像指示UI(images)は親から注入する。
 *
 * コメント収集UI(スレッド・コンポーザ・＋コメント)は相談ドロワー専用(差分B Task 12)。
 * コメント関連 props は任意で、`onStartAddComment` が渡された時のみコメント導線を描画する。
 * 詳細パネル(ReviseSectionView)はコメント props を渡さず、手動編集のみを残す。
 */

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { choiceButtonClass } from "./approveStyles";

interface SectionProps {
  heading: string;
  description: string;
  editing: boolean;
  busy: boolean;
  onStartEditSection: () => void;
  editor: ReactNode;
  images: ReactNode;
  comments?: string[];
  commentOpen?: boolean;
  commentText?: string;
  onCommentTextChange?: (value: string) => void;
  editingComment?: boolean;
  onStartEditComment?: (idx: number, comment: string) => void;
  onDeleteComment?: (idx: number) => void;
  onCancelComment?: () => void;
  onSaveComment?: () => void;
  onStartAddComment?: () => void;
}

export function Section({
  heading,
  description,
  editing,
  busy,
  onStartEditSection,
  editor,
  images,
  comments,
  commentOpen,
  commentText,
  onCommentTextChange,
  editingComment,
  onStartEditComment,
  onDeleteComment,
  onCancelComment,
  onSaveComment,
  onStartAddComment,
}: SectionProps) {
  // コメント収集UIは相談ドロワー専用。onStartAddComment が渡された時のみ描画する。
  const commentsEnabled = onStartAddComment !== undefined;
  const commentList = comments ?? [];

  return (
    <li className="group rounded-md border border-[var(--p-border)] p-2 hover:border-[var(--p-border-strong)]">
      {editing ? (
        editor
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium text-[var(--p-text)]">{heading}</p>
            {commentsEnabled && commentList.length > 0 ? (
              <span className="shrink-0 rounded-full bg-[var(--p-accent-weak)] px-2 py-0.5 text-xs font-medium text-[var(--p-accent-ink)]">
                コメント{commentList.length}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-0.5 text-xs text-[var(--p-text-2)]">{description}</p> : null}

          {commentsEnabled && commentList.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {commentList.map((comment, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 border-l-2 border-[var(--p-accent)] pl-2 text-sm text-[var(--p-text-2)]"
                >
                  <span className="min-w-0 flex-1 whitespace-pre-wrap">{comment}</span>
                  <button
                    type="button"
                    aria-label={`コメントを編集: ${heading} ${idx + 1}`}
                    onClick={() => onStartEditComment?.(idx, comment)}
                    className="shrink-0 text-xs text-[var(--p-text-3)] hover:text-[var(--p-text)]"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    aria-label={`コメントを削除: ${heading} ${idx + 1}`}
                    onClick={() => onDeleteComment?.(idx)}
                    className="shrink-0 text-xs text-[var(--p-text-3)] hover:text-[var(--p-red)]"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {commentsEnabled && commentOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 overflow-hidden"
            >
              <textarea
                aria-label={`コメント入力: ${heading}`}
                value={commentText ?? ""}
                onChange={(event) => onCommentTextChange?.(event.target.value)}
                placeholder="この見出しへの修正指示を書く…"
                className="h-16 w-full rounded-md border border-[var(--p-border-strong)] bg-[var(--p-bg-input)] p-2 text-sm text-[var(--p-text)]"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelComment}
                  className={choiceButtonClass("approve-btn-ghost")}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={onSaveComment}
                  className={choiceButtonClass("approve-btn-primary border border-transparent bg-[var(--p-accent)] text-[#0a0c10]")}
                >
                  {editingComment ? "更新" : "コメントを追加"}
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="mt-1 flex gap-3">
              {commentsEnabled ? (
                <button
                  type="button"
                  aria-label={`コメントを追加: ${heading}`}
                  onClick={onStartAddComment}
                  disabled={busy}
                  className="text-xs text-[var(--p-accent)] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                >
                  ＋ コメント
                </button>
              ) : null}
              <button
                type="button"
                aria-label={`セクションを編集: ${heading}`}
                onClick={onStartEditSection}
                disabled={busy}
                className="text-xs text-[var(--p-text-2)] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
              >
                編集
              </button>
            </div>
          )}

          {images}
        </>
      )}
    </li>
  );
}
