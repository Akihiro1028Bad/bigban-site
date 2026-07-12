/**
 * 構成案タブ: セクションごとの行コメントと、コメントをまとめた構成案の修正依頼。
 *
 * 行コメントは本番 `useReviseEditing`(draftComments)へ結線するため、コメント配列/追加/削除は
 * すべて props(`sections[i].comments`/`onAddComment`/`onRemoveComment`/`onRequestOutlineRevise`)で受ける。
 * 入力途中の一時状態(commentFor/commentText)のみ UI ローカルで保持する。
 */
"use client";

import { useState } from "react";

import { IconMessage, IconPlus, IconSparkles, IconWand, IconX } from "./ui/icons";
import type { ArticleHypothesis } from "@/lib/growth/approve";

export interface OutlineViewSection {
  heading: string;
  summary?: string;
  comments?: string[];
}

interface OutlineViewProps {
  /** 現行 outline(文字列) を parse した構成案(見出し＋説明＋行コメント)。 */
  sections: OutlineViewSection[];
  /** 記事の狙い(仮説)。未記入(空文字/空配列)フィールドは非表示。 */
  hypothesis?: ArticleHypothesis;
  /** 構成案修正が依頼中/処理中(useReviseEditing.reviseBusy 等)。 */
  revising: boolean;
  onAddComment: (sectionIndex: number, text: string) => void;
  onRemoveComment: (sectionIndex: number, commentIndex: number) => void;
  onRequestOutlineRevise: () => void;
}

/** 仮説カードに描画する行ラベル(plannedCta は別扱い)。 */
const HYPOTHESIS_ROWS: { label: string; key: keyof Omit<ArticleHypothesis, "plannedCta"> }[] = [
  { label: "記事タイプ", key: "articleType" },
  { label: "狙う読者", key: "targetReader" },
  { label: "検索意図", key: "searchIntent" },
  { label: "勝ち筋", key: "winningAngle" },
  { label: "成功指標", key: "successMetric" },
];

export function OutlineView({
  sections,
  hypothesis,
  revising,
  onAddComment,
  onRemoveComment,
  onRequestOutlineRevise,
}: OutlineViewProps) {
  const [commentFor, setCommentFor] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");

  const totalComments = sections.reduce((n, s) => n + (s.comments?.length ?? 0), 0);

  const submitComment = (i: number) => {
    if (!commentText.trim()) return;
    onAddComment(i, commentText.trim());
    setCommentText("");
    setCommentFor(null);
  };

  const hypRows = hypothesis
    ? HYPOTHESIS_ROWS.filter((r) => hypothesis[r.key] !== "").map(
        (r) => [r.label, hypothesis[r.key]] as const,
      )
    : [];
  const showHypothesis = hypothesis
    ? hypRows.length > 0 || hypothesis.plannedCta.length > 0
    : false;

  return (
    <div className="flex flex-col gap-3">
      {hypothesis && showHypothesis && (
        <section
          className="rounded-[12px] p-3.5"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            <IconSparkles size={13} {...{ style: { color: "var(--p-accent)" } }} /> この記事の狙い（仮説）
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {hypRows.map(([label, value]) => (
              <div key={label}>
                <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>{label}</div>
                <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>{value}</div>
              </div>
            ))}
            {hypothesis.plannedCta.length > 0 && (
              <div>
                <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>想定CTA</div>
                <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
                  {hypothesis.plannedCta.join(" / ")}
                </div>
              </div>
            )}
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

      <ol className="flex flex-col gap-2.5">
        {sections.map((s, i) => {
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
                    <div className="mt-[2px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
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

                  {/* コントロール行: コメント追加 */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <button
                      onClick={() => { setCommentFor(commentFor === i ? null : i); setCommentText(""); }}
                      className="approve-tool"
                      style={{ height: 28 }}
                    >
                      <IconPlus size={13} /> コメント
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
