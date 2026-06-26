/**
 * 構成案1セクションの表示(#H7 分解 / #53)。見出し・説明・コメントスレッド・コメント入力。
 * 手動編集フォーム(editor)と画像指示UI(images)は親から注入する。
 */

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { choiceButtonClass } from "./approveStyles";

interface SectionProps {
  heading: string;
  description: string;
  comments: string[];
  editing: boolean;
  commentOpen: boolean;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  editingComment: boolean;
  busy: boolean;
  onStartEditComment: (idx: number, comment: string) => void;
  onDeleteComment: (idx: number) => void;
  onCancelComment: () => void;
  onSaveComment: () => void;
  onStartAddComment: () => void;
  onStartEditSection: () => void;
  editor: ReactNode;
  images: ReactNode;
}

export function Section({
  heading,
  description,
  comments,
  editing,
  commentOpen,
  commentText,
  onCommentTextChange,
  editingComment,
  busy,
  onStartEditComment,
  onDeleteComment,
  onCancelComment,
  onSaveComment,
  onStartAddComment,
  onStartEditSection,
  editor,
  images,
}: SectionProps) {
  return (
    <li className="group rounded-md border border-gray-200 p-2 hover:border-gray-300">
      {editing ? (
        editor
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">{heading}</p>
            {comments.length > 0 ? (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                コメント{comments.length}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-0.5 text-xs text-gray-500">{description}</p> : null}

          {comments.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {comments.map((comment, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 border-l-2 border-blue-200 pl-2 text-sm text-gray-700"
                >
                  <span className="min-w-0 flex-1 whitespace-pre-wrap">{comment}</span>
                  <button
                    type="button"
                    aria-label={`コメントを編集: ${heading} ${idx + 1}`}
                    onClick={() => onStartEditComment(idx, comment)}
                    className="shrink-0 text-xs text-gray-500 hover:text-gray-800"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    aria-label={`コメントを削除: ${heading} ${idx + 1}`}
                    onClick={() => onDeleteComment(idx)}
                    className="shrink-0 text-xs text-gray-500 hover:text-red-700"
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {commentOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 overflow-hidden"
            >
              <textarea
                aria-label={`コメント入力: ${heading}`}
                value={commentText}
                onChange={(event) => onCommentTextChange(event.target.value)}
                placeholder="この見出しへの修正指示を書く…"
                className="h-16 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelComment}
                  className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={onSaveComment}
                  className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
                >
                  {editingComment ? "更新" : "コメントを追加"}
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                aria-label={`コメントを追加: ${heading}`}
                onClick={onStartAddComment}
                disabled={busy}
                className="text-xs text-blue-700 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
              >
                ＋ コメント
              </button>
              <button
                type="button"
                aria-label={`セクションを編集: ${heading}`}
                onClick={onStartEditSection}
                disabled={busy}
                className="text-xs text-gray-600 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
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
