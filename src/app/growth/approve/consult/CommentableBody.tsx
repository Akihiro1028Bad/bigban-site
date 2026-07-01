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
import { IconMessage, IconPlus, IconSparkles, IconX } from "../ui/icons";

interface CommentableBodyProps {
  bodyHtml: string;
  bodyCommentConsult: ReturnType<typeof useBodyCommentConsult>;
}

export function CommentableBody({ bodyHtml, bodyCommentConsult }: CommentableBodyProps) {
  const lines = extractReviewLines(bodyHtml);
  const ic = bodyCommentConsult;
  const total = ic.buildPayload().length;

  return (
    <div>
      <div
        className="approve-article overflow-hidden rounded-[8px]"
        style={{ border: "1px solid var(--p-border)" }}
      >
        {lines.map((line, i) => {
          const key = line.excerpt !== null ? `${line.blockIndex}::${line.excerpt}` : `nt-${i}`;
          const thread = line.excerpt !== null ? (ic.comments[key] ?? []) : [];
          const isHeading = line.tag === "h2" || line.tag === "h3" || line.tag === "h4";
          const canComment = line.commentable;
          return (
            <Fragment key={key}>
              <div className="group/row flex items-start transition-colors hover:bg-[var(--p-bg-active)]">
                <div className="flex w-12 shrink-0 select-none items-center justify-end gap-1 px-1.5 pt-1.5">
                  <span className="font-mono text-[11px]" style={{ color: "var(--p-text-3)" }}>
                    {i + 1}
                  </span>
                  {canComment ? (
                    <button
                      type="button"
                      aria-label={`${i + 1}行目にコメント`}
                      onClick={() => ic.openComposer(key)}
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                      style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}
                    >
                      <IconPlus size={12} />
                    </button>
                  ) : null}
                </div>
                <div
                  className={`flex-1 px-2 py-1.5 text-sm leading-relaxed ${isHeading ? "font-bold" : ""}`}
                  style={{
                    color: line.commentable ? "var(--p-text-2)" : "var(--p-text-3)",
                    background: thread.length > 0 ? "var(--p-amber-weak)" : undefined,
                  }}
                >
                  {line.text}
                </div>
              </div>

              {thread.map((c, idx) => (
                <div
                  key={idx}
                  className="ml-12 flex items-start justify-between gap-2 px-3 py-2"
                  style={{ background: "var(--p-amber-weak)", borderTop: "1px solid var(--p-border)" }}
                >
                  <div className="flex items-start gap-2">
                    <IconMessage size={13} style={{ color: "var(--p-amber)", marginTop: 2 }} />
                    <span className="text-xs" style={{ color: "var(--p-text-2)" }}>
                      {c}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="コメントを削除"
                    onClick={() => ic.removeComment(key, idx)}
                    className="shrink-0"
                    style={{ color: "var(--p-text-3)" }}
                  >
                    <IconX size={13} />
                  </button>
                </div>
              ))}

              {ic.openFor === key ? (
                <div
                  className="ml-12 px-3 py-2"
                  style={{ background: "var(--p-bg-input)", borderTop: "1px solid var(--p-border)" }}
                >
                  <textarea
                    aria-label={`${i + 1}行目へのコメント入力`}
                    value={ic.draft}
                    onChange={(e) => ic.setDraft(e.target.value)}
                    placeholder="この文への指摘を書く…"
                    className="min-h-12 w-full rounded-[8px] p-2 text-sm outline-none"
                    style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => ic.closeComposer()}
                      className="rounded-[6px] px-2 py-1 text-xs disabled:opacity-40"
                      style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => ic.addComment(key)}
                      disabled={!ic.draft.trim()}
                      className="approve-btn-primary rounded-[6px] px-2 py-1 text-xs font-semibold disabled:opacity-40"
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
        <p
          role="alert"
          className="mt-2 rounded-[6px] px-2 py-1 text-[11px]"
          style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
        >
          {ic.error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => void ic.requestAi()}
          disabled={ic.busy || total === 0}
          className="approve-btn-primary flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          <IconSparkles size={13} />
          AIに指摘を依頼（{total}）
        </button>
      </div>
    </div>
  );
}
