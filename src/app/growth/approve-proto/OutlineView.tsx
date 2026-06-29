/**
 * 構成案タブ(#proto・最初の承認ゲート): セクションごとの行コメントと【画像指示(再設計)】、
 * コメントをまとめた構成案の修正依頼。
 *
 * 画像指示は house style(宇宙人マスコット×コスミック)ロックを前提に「オフ/おまかせ/指定」の
 * 3状態トグル＋行為(action)一言に正規化。コメント編集とは非排他の独立レーン(痛点6)。
 */
"use client";

import { useState } from "react";

import { ImageDirector } from "./ImageDirector";
import { ImagePlanBanner } from "./ImagePlanBanner";
import { ImageSlot } from "./ImageSlot";
import { ImageStateToggle } from "./ImageStateToggle";
import { IconMessage, IconPlus, IconSparkles, IconWand, IconX } from "./icons";
import { effectiveMode, recommendOff, resolveAction } from "./imageIntent";
import type { Article, ImageInstruction, ImageMode } from "./types";

interface OutlineViewProps {
  article: Article;
  onAddComment: (sectionIndex: number, text: string) => void;
  onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
  /** 画像指示の部分更新(immutable マージは page 側)。 */
  onUpdateImage: (sectionIndex: number, patch: Partial<ImageInstruction>) => void;
  onRequestOutlineRevise: () => void;
}

export function OutlineView({
  article,
  onAddComment,
  onRemoveComment,
  onUpdateImage,
  onRequestOutlineRevise,
}: OutlineViewProps) {
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [editingImg, setEditingImg] = useState<number | null>(null);

  const total = article.outline.length;
  const totalComments = article.outline.reduce((n, s) => n + (s.comments?.length ?? 0), 0);
  const revising = article.reviseStatus === "requested" || article.reviseStatus === "presenting";

  const submitComment = (i: number) => {
    if (!commentText.trim()) return;
    onAddComment(i, commentText.trim());
    setCommentText("");
    setCommentFor(null);
  };

  const changeMode = (i: number, mode: ImageMode) => {
    onUpdateImage(i, { mode });
    setEditingImg(mode === "custom" ? i : null);
  };

  const hyp = article.hypothesis;

  return (
    <div className="flex flex-col gap-3">
      {hyp && (
        <section
          className="rounded-[12px] p-3.5"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            <IconSparkles size={13} {...{ style: { color: "var(--p-accent)" } }} /> この記事の狙い（仮説）
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {[
              ["記事タイプ", hyp.articleType],
              ["狙う読者", hyp.targetReader],
              ["検索意図", hyp.searchIntent],
              ["勝ち筋", hyp.winningAngle],
              ["成功指標", hyp.successMetric],
              ["想定CTA", hyp.plannedCta],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
                <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

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

      <ImagePlanBanner outline={article.outline} />

      <ol className="flex flex-col gap-2.5">
        {article.outline.map((s, i) => {
          const inst = s.imageInstruction;
          const mode = effectiveMode(inst);
          const recOff = recommendOff(s, i, total);
          const slotAction = mode === "custom" ? (inst?.action ?? "") : resolveAction(s);
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

                  {commentFor === i && (
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
                  )}

                  {/* コントロール行: コメント追加 | 画像レーン(トグル＋状態) */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <button
                      onClick={() => { setCommentFor(commentFor === i ? null : i); setCommentText(""); }}
                      className="proto-tool"
                      style={{ height: 28 }}
                    >
                      <IconPlus size={13} /> コメント
                    </button>
                    <span className="h-4 w-px" style={{ background: "var(--p-border)" }} />
                    <ImageStateToggle mode={mode} recommendOff={recOff} onChange={(m) => changeMode(i, m)} />
                    {editingImg !== i && (
                      <ImageSlot
                        mode={mode}
                        action={slotAction}
                        hue={article.hue}
                        isEyecatch={inst?.isEyecatch}
                        onEdit={() => { onUpdateImage(i, { mode: "custom" }); setEditingImg(i); }}
                      />
                    )}
                  </div>

                  {editingImg === i && (
                    <ImageDirector
                      section={s}
                      hue={article.hue}
                      isFirst={i === 0}
                      instruction={inst}
                      onSetAction={(action) => { onUpdateImage(i, { mode: "custom", action }); setEditingImg(null); }}
                      onToggleEyecatch={() => onUpdateImage(i, { isEyecatch: !inst?.isEyecatch })}
                      onSetAdvancedNote={(note) => onUpdateImage(i, { advancedNote: note })}
                      onCancel={() => { onUpdateImage(i, { mode: "auto" }); setEditingImg(null); }}
                    />
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
