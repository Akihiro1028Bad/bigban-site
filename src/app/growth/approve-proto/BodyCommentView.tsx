/**
 * 本文コメントタブ(#proto・#182): 本文を文/項目単位で注釈し、AIに指摘を依頼 →
 * 元/新を見比べて本文へ反映する。構成案コメント(OutlineView)・自由文修正(修正案タブ)とは別系統。
 */
"use client";

import { useState } from "react";

import { blockRows, isCommentableTag, splitBlocks, stripTags } from "./bodyBlocks";
import { IconCheck, IconMessage, IconPlus, IconWand, IconX } from "./icons";
import type { Article } from "./types";

interface BodyCommentViewProps {
  article: Article;
  onAddComment: (block: number, unit: string, text: string) => void;
  onRemoveComment: (index: number) => void;
  onRequest: () => void;
  onApplyFix: (block: number) => void;
  onDismissFix: (block: number) => void;
  onApplyAll: () => void;
  onRetry: () => void;
}

export function BodyCommentView({
  article,
  onAddComment,
  onRemoveComment,
  onRequest,
  onApplyFix,
  onDismissFix,
  onApplyAll,
  onRetry,
}: BodyCommentViewProps) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [text, setText] = useState("");

  if (!article.bodyHtml) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
        本文が生成されると、文ごとにコメントして指摘を依頼できます。
      </div>
    );
  }

  const blocks = splitBlocks(article.bodyHtml);
  const comments = article.bodyComments ?? [];
  const total = comments.length;
  const status = article.bodyCommentStatus ?? "none";
  const fixes = article.bodyCommentFixes ?? [];

  const submit = (block: number, unit: string) => {
    if (!text.trim()) return;
    onAddComment(block, unit, text.trim());
    setText("");
    setOpenRow(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-2 rounded-[10px] px-3 py-2.5"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <IconMessage size={15} {...{ style: { color: "var(--p-text-3)" } }} />
        <span className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          {total > 0 ? `${total}件のコメント` : "本文の文に「＋」でコメントを付けられます"}
        </span>
        <button
          onClick={onRequest}
          disabled={total === 0 || status !== "none"}
          className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconWand size={13} /> AIに指摘を依頼{total > 0 ? `(${total})` : ""}
        </button>
      </div>

      {status === "requested" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
            <IconWand size={15} /> AIが指摘を反映した案を作成中です…
          </div>
          {[90, 70, 84].map((w, i) => (
            <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {status === "failed" && (
        <div
          className="flex flex-col items-start gap-3 rounded-[12px] p-4"
          style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)" }}
        >
          <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--p-red)" }}>
            <IconX size={15} /> 本文の修正に失敗しました
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
            外部処理が応答しませんでした。同じコメントで再依頼できます。
          </div>
          <button
            onClick={onRetry}
            className="proto-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconWand size={14} /> 再依頼する
          </button>
        </div>
      )}

      {status === "presenting" && fixes.length > 0 && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              指摘への修正案（元 → 新）
            </span>
            <button
              onClick={onApplyAll}
              className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
              style={{ background: "var(--p-green)", color: "#06140d" }}
            >
              <IconCheck size={13} /> すべて反映
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {fixes.map((f) => (
              <div key={f.block} className="rounded-[10px] p-3" style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}>
                <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
                  {f.from}
                </div>
                <div className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
                  {f.from}{" "}
                  <span style={{ background: "var(--p-green-weak)", color: "var(--p-green)", borderRadius: 4, padding: "1px 4px" }}>
                    {f.sentence}
                  </span>
                </div>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button onClick={() => onDismissFix(f.block)} className="proto-btn-ghost" style={{ color: "var(--p-text-3)" }}>
                    却下
                  </button>
                  <button
                    onClick={() => onApplyFix(f.block)}
                    className="proto-btn-primary flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                    style={{ background: "var(--p-green)", color: "#06140d" }}
                  >
                    <IconCheck size={13} /> 本文へ反映
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="proto-article" style={{ fontSize: 13.5 }}>
        {blocks.map((block) => {
          const rows = blockRows(block);
          const commentable = isCommentableTag(block.tag);
          if (block.tag === "h2" || block.tag === "h3") {
            return (
              <div key={block.index} className={block.tag === "h2" ? "mt-4 mb-1.5 text-[15px] font-semibold" : "mt-3 mb-1 text-[14px] font-semibold"}>
                {stripTags(block.inner)}
              </div>
            );
          }
          return (
            <div key={block.index} className="my-1.5 flex flex-col gap-1">
              {rows.map((row, ri) => {
                if (!commentable) {
                  return (
                    <div key={ri} className="text-[13px]" style={{ color: "var(--p-text-2)" }}>
                      {row.text}
                    </div>
                  );
                }
                const rowKey = `${block.index}:${ri}`;
                const rowComments = comments
                  .map((c, idx) => ({ c, idx }))
                  .filter(({ c }) => c.block === block.index && c.unit === row.text);
                const isList = block.tag === "ul" || block.tag === "ol";
                return (
                  <div key={ri} className="group/row flex items-start gap-2">
                    <button
                      onClick={() => { setOpenRow(openRow === rowKey ? null : rowKey); setText(""); }}
                      className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[11px] opacity-0 transition-opacity group-hover/row:opacity-100"
                      style={{
                        background: rowComments.length ? "var(--p-amber-weak)" : "var(--p-bg-active)",
                        color: rowComments.length ? "var(--p-amber)" : "var(--p-text-3)",
                        opacity: rowComments.length ? 1 : undefined,
                      }}
                      title="この文にコメント"
                    >
                      {rowComments.length ? rowComments.length : <IconPlus size={12} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
                        {isList ? "・" : ""}{row.text}
                      </div>
                      {rowComments.map(({ c, idx }) => (
                        <div
                          key={idx}
                          className="mt-1.5 flex items-start gap-2 rounded-[8px] px-2.5 py-1.5"
                          style={{ background: "var(--p-amber-weak)" }}
                        >
                          <IconMessage size={13} {...{ style: { color: "var(--p-amber)", marginTop: 2 } }} />
                          <span className="flex-1 text-[12px]" style={{ color: "var(--p-text-2)" }}>{c.text}</span>
                          <button onClick={() => onRemoveComment(idx)} style={{ color: "var(--p-text-3)" }} aria-label="コメント削除">
                            <IconX size={13} />
                          </button>
                        </div>
                      ))}
                      {openRow === rowKey && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            autoFocus
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") submit(block.index, row.text);
                              if (e.key === "Escape") setOpenRow(null);
                            }}
                            placeholder="この文への指摘…"
                            className="h-[30px] flex-1 rounded-[8px] px-2.5 text-[12.5px] outline-none"
                            style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                          />
                          <button
                            onClick={() => submit(block.index, row.text)}
                            className="proto-btn-primary rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                          >
                            追加
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
