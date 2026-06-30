"use client";

/**
 * 相談ドロワーの sentence モード用：本文を行単位で描画し、行ごとにコメントを付けられる。
 *
 * InlineCommentReview (src/app/growth/approve/InlineCommentReview.tsx) の行リスト部分
 * (L123-L201・`const lines = extractReviewLines(bodyHtml)` → `lines.map(...)` の JSX) を
 * CommentableBody として切り出したもの。表示・class・操作は現行 InlineCommentReview と同一。
 *
 * 差分B Task 9: 行リストを ConsultComposer(sentence モード)から描画するための薄いラップ。
 * InlineCommentReview 自体は後続タスクで撤去予定のため、行リストはここへ集約する。
 */

import { Fragment } from "react";

import { extractReviewLines } from "@/lib/growth/bodyComment";

import type { useBodyCommentConsult } from "../hooks/useBodyCommentConsult";

interface CommentableBodyProps {
  bodyHtml: string;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
}

const tbBtn =
  "rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40";

export function CommentableBody({ bodyHtml, bodyCommentConsult }: CommentableBodyProps) {
  const lines = extractReviewLines(bodyHtml);
  const ic = bodyCommentConsult;
  const total = ic.buildPayload().length;

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-gray-200">
        {lines.map((line, i) => {
          const key = line.excerpt !== null ? `${line.blockIndex}::${line.excerpt}` : `nt-${i}`;
          const thread = line.excerpt !== null ? (ic.comments[key] ?? []) : [];
          const isHeading = line.tag === "h2" || line.tag === "h3" || line.tag === "h4";
          const canComment = line.commentable;
          return (
            <Fragment key={key}>
              <div className="group flex items-start hover:bg-gray-50">
                <div className="flex w-12 shrink-0 select-none items-center justify-end gap-1 px-1.5 pt-1.5">
                  <span className="font-mono text-[11px] text-gray-400">{i + 1}</span>
                  {canComment ? (
                    <button
                      type="button"
                      aria-label={`${i + 1}行目にコメント`}
                      onClick={() => ic.openComposer(key)}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded bg-blue-600 text-xs leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ＋
                    </button>
                  ) : null}
                </div>
                <div
                  className={`flex-1 px-2 py-1.5 text-sm leading-relaxed ${
                    line.commentable ? "text-gray-800" : "text-gray-400"
                  } ${isHeading ? "font-bold" : ""} ${thread.length > 0 ? "bg-blue-50/40" : ""}`}
                >
                  {line.text}
                </div>
              </div>

              {thread.map((c, idx) => (
                <div
                  key={idx}
                  className="ml-12 flex items-start justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
                      あ
                    </span>
                    <span className="text-xs text-gray-700">{c}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="コメントを削除"
                    onClick={() => ic.removeComment(key, idx)}
                    className="shrink-0 text-[11px] text-gray-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </div>
              ))}

              {ic.openFor === key ? (
                <div className="ml-12 border-t border-gray-200 bg-gray-50 px-3 py-2">
                  <textarea
                    aria-label={`${i + 1}行目へのコメント入力`}
                    value={ic.draft}
                    onChange={(e) => ic.setDraft(e.target.value)}
                    placeholder="この文への指摘を書く…"
                    className="min-h-12 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button type="button" onClick={() => ic.closeComposer()} className={tbBtn}>
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => ic.addComment(key)}
                      disabled={!ic.draft.trim()}
                      className="rounded border border-blue-600 bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      コメント
                    </button>
                  </div>
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      {ic.error ? (
        <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {ic.error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void ic.requestAi()}
          disabled={ic.busy || total === 0}
          className="flex items-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
        >
          AIに指摘を依頼（{total}）
        </button>
      </div>
    </div>
  );
}
