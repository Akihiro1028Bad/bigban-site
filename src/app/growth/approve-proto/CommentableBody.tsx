/**
 * 注釈可能な本文(#proto・往復統合): 本文を文/項目単位で描画し、＋で注釈を足す。
 * 「この文」モードで詳細メイン(左)に出し、注釈は相談ドロワーへ流す。
 */
"use client";

import { useState } from "react";

import { blockRows, isCommentableTag, splitBlocks, stripTags } from "./bodyBlocks";
import { IconMessage, IconPlus, IconX } from "./icons";
import type { BodyComment } from "./types";

interface CommentableBodyProps {
  bodyHtml: string;
  comments: BodyComment[];
  onAddComment: (block: number, unit: string, text: string) => void;
  onRemoveComment: (index: number) => void;
}

export function CommentableBody({ bodyHtml, comments, onAddComment, onRemoveComment }: CommentableBodyProps) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [text, setText] = useState("");
  const blocks = splitBlocks(bodyHtml);
  const submit = (block: number, unit: string) => {
    if (!text.trim()) return;
    onAddComment(block, unit, text.trim());
    setText("");
    setOpenRow(null);
  };
  return (
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
  );
}
