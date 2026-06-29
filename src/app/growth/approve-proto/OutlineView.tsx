/**
 * 構成案タブ(#proto・最初の承認ゲート): セクションごとの行コメント・画像指示編集と、
 * コメントをまとめた構成案の修正依頼。
 */
"use client";

import { useState } from "react";

import {
  IconImage,
  IconMessage,
  IconPlus,
  IconWand,
  IconX,
} from "./icons";
import type { Article, ImageStyle } from "./types";

const STYLE_LABEL: Record<ImageStyle, string> = {
  mascot: "マスコット",
  minimal: "ミニマル",
  diagram: "図解",
};
const STYLES: ImageStyle[] = ["mascot", "minimal", "diagram"];

interface OutlineViewProps {
  article: Article;
  onAddComment: (sectionIndex: number, text: string) => void;
  onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
  onSetImageInstruction: (sectionIndex: number, style: ImageStyle, description: string) => void;
  onClearImageInstruction: (sectionIndex: number) => void;
  onRequestOutlineRevise: () => void;
}

export function OutlineView({
  article,
  onAddComment,
  onRemoveComment,
  onSetImageInstruction,
  onClearImageInstruction,
  onRequestOutlineRevise,
}: OutlineViewProps) {
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [imgFor, setImgFor] = useState<number | null>(null);
  const [imgStyle, setImgStyle] = useState<ImageStyle>("mascot");
  const [imgDesc, setImgDesc] = useState("");

  const totalComments = article.outline.reduce((n, s) => n + (s.comments?.length ?? 0), 0);
  const revising = article.reviseStatus === "requested" || article.reviseStatus === "presenting";

  const submitComment = (i: number) => {
    if (!commentText.trim()) return;
    onAddComment(i, commentText.trim());
    setCommentText("");
    setCommentFor(null);
  };

  const openImg = (i: number) => {
    const cur = article.outline[i].imageInstruction;
    setImgStyle(cur?.style ?? "mascot");
    setImgDesc(cur?.description ?? "");
    setImgFor(i);
  };
  const saveImg = (i: number) => {
    if (!imgDesc.trim()) return;
    onSetImageInstruction(i, imgStyle, imgDesc.trim());
    setImgFor(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center gap-2 rounded-[10px] px-3 py-2.5"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <IconMessage size={15} {...{ style: { color: "var(--p-text-3)" } }} />
        <span className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          {totalComments > 0
            ? `${totalComments}件のコメント — まとめて修正を依頼できます`
            : "セクションにコメントして、構成案の修正を依頼できます"}
        </span>
        <button
          onClick={onRequestOutlineRevise}
          disabled={totalComments === 0 || revising}
          className="ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[6px] text-[12px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconWand size={13} /> 構成案の修正を依頼
        </button>
      </div>

      <ol className="flex flex-col gap-2.5">
        {article.outline.map((s, i) => {
          const inst = s.imageInstruction;
          return (
            <li
              key={i}
              className="rounded-[10px] p-3"
              style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
            >
              <div className="flex gap-3">
                <span
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] text-[12px] font-semibold tabular-nums"
                  style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">{s.heading}</div>
                  {s.summary && (
                    <div className="mt-[2px] text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
                      {s.summary}
                    </div>
                  )}

                  {(inst || s.imageHint) && (
                    <div
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px]"
                      style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
                    >
                      <IconImage size={12} />
                      {inst ? `${STYLE_LABEL[inst.style]}: ${inst.description}` : `画像指示: ${s.imageHint}`}
                    </div>
                  )}

                  {(s.comments ?? []).length > 0 && (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {(s.comments ?? []).map((c, ci) => (
                        <div
                          key={ci}
                          className="flex items-start gap-2 rounded-[8px] px-2.5 py-1.5"
                          style={{ background: "var(--p-amber-weak)" }}
                        >
                          <IconMessage size={13} {...{ style: { color: "var(--p-amber)", marginTop: 2 } }} />
                          <span className="flex-1 text-[12px]" style={{ color: "var(--p-text-2)" }}>
                            {c}
                          </span>
                          <button onClick={() => onRemoveComment(i, ci)} style={{ color: "var(--p-text-3)" }} aria-label="コメント削除">
                            <IconX size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {commentFor === i ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        autoFocus
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitComment(i);
                          if (e.key === "Escape") setCommentFor(null);
                        }}
                        placeholder="このセクションへの指示…"
                        className="h-[32px] flex-1 rounded-[8px] px-2.5 text-[12.5px] outline-none"
                        style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                      />
                      <button
                        onClick={() => submitComment(i)}
                        className="rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                        style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                      >
                        追加
                      </button>
                    </div>
                  ) : imgFor === i ? (
                    <div
                      className="mt-2.5 rounded-[10px] p-2.5"
                      style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        {STYLES.map((st) => (
                          <button
                            key={st}
                            onClick={() => setImgStyle(st)}
                            className="rounded-[7px] px-2.5 py-[4px] text-[11.5px] font-medium"
                            style={{
                              background: imgStyle === st ? "var(--p-purple-weak)" : "transparent",
                              color: imgStyle === st ? "var(--p-purple)" : "var(--p-text-3)",
                              border: imgStyle === st ? "1px solid var(--p-purple)" : "1px solid var(--p-border)",
                            }}
                          >
                            {STYLE_LABEL[st]}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={imgDesc}
                        onChange={(e) => setImgDesc(e.target.value)}
                        placeholder="どんな画像か（例：コートに立つ宇宙人マスコット）"
                        rows={2}
                        className="mt-2 w-full resize-none rounded-[8px] p-2 text-[12.5px] outline-none"
                        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        {inst && (
                          <button onClick={() => { onClearImageInstruction(i); setImgFor(null); }} className="proto-btn-ghost" style={{ color: "var(--p-red)" }}>
                            削除
                          </button>
                        )}
                        <button onClick={() => setImgFor(null)} className="proto-btn-ghost ml-auto">取消</button>
                        <button
                          onClick={() => saveImg(i)}
                          className="rounded-[8px] px-3 py-[6px] text-[12px] font-semibold"
                          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <button onClick={() => { setCommentFor(i); setCommentText(""); }} className="proto-tool" style={{ height: 28 }}>
                        <IconPlus size={13} /> コメント
                      </button>
                      <button onClick={() => openImg(i)} className="proto-tool" style={{ height: 28 }}>
                        <IconImage size={13} /> 画像指示
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
