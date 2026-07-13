"use client";

/**
 * AI相談ドロワーの「指摘への修正案」提示ボディ(Task 8: backend BodyCommentProposalItem 型で移植)。
 *
 * プロト(approve-proto/SentenceFixBody.tsx)の見た目を基に、backend の BodyCommentProposalItem 型へ adapt。
 * - 元型 BodyCommentFix{block, from, to, sentence} は撤去
 * - backend 型 BodyCommentProposalItem{commentIndex, before, after} を採用
 * - 案ごとに反映対象を選択し、全案を「反映しない」として却下できる
 * - 反映は選択案のみを1回で決定的に保存する(onApplySelected)
 * - before/after はタグ除去して表示(InlineCommentReview L99-100 踏襲)
 * - structureNote ヘルパーは InlineCommentReview L39-46 より移植し、装飾変化を可視化(#M5)
 * - 配色は proto ダークトークン(--p-*)。before=line-through/--p-text-3・after=--p-green-weak 強調・一括反映=approve-btn-primary+IconCheck
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 */

import type { BodyCommentProposalItem } from "@/lib/growth/bodyComment";

import { IconCheck } from "../ui/icons";

interface SentenceFixBodyProps {
  proposal: BodyCommentProposalItem[];
  busy: boolean;
  selected: Set<number>;
  onToggleSelect: (commentIndex: number) => void;
  onApplySelected: () => void;
  onDismissAll: () => void;
}

/** #M5: before/after の HTMLタグ構造の変化(追加要素)を一言で示す。タグ除去で隠れる装飾変化を可視化。 */
function structureNote(before: string, after: string): string | null {
  const tagNames = (html: string): string[] =>
    [...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase());
  const beforeTags = new Set(tagNames(before));
  const added = [...new Set(tagNames(after))].filter((t) => !beforeTags.has(t));
  return added.length > 0 ? `構造変化: <${added.join(">, <")}> を追加` : null;
}

export function SentenceFixBody({
  proposal,
  busy,
  selected,
  onToggleSelect,
  onApplySelected,
  onDismissAll,
}: SentenceFixBodyProps) {
  const selectedCount = proposal.filter((item) => selected.has(item.commentIndex)).length;
  return (
    <section
      aria-label="指摘への修正案"
      className="rounded-[12px] p-4"
      style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--p-text-3)" }}
        >
          AIの修正案（元 → 新）
        </h4>
      </div>

      <ul className="flex flex-col gap-2">
        {proposal.map((item) => {
          const isSelected = selected.has(item.commentIndex);
          const beforeText = item.before.replace(/<[^>]*>/g, "");
          const afterText = item.after.replace(/<[^>]*>/g, "");
          const note = structureNote(item.before, item.after);
          return (
            <li
              key={item.commentIndex}
              className="rounded-[10px] p-3 text-[12.5px] leading-relaxed"
              style={{
                background: "var(--p-bg-input)",
                border: "1px solid var(--p-border)",
                opacity: isSelected ? 1 : 0.55,
              }}
            >
              <label className="mb-2 flex items-center gap-1 text-[11px]" style={{ color: "var(--p-accent-ink)" }}>
                <input
                  type="checkbox"
                  aria-label={`修正案${item.commentIndex + 1}を反映`}
                  checked={isSelected}
                  onChange={() => onToggleSelect(item.commentIndex)}
                />
                反映する
              </label>
              <p className="line-through" style={{ color: "var(--p-text-3)" }}>
                {beforeText}
              </p>
              <p
                className="mt-1"
                style={{
                  background: "var(--p-green-weak)",
                  color: "var(--p-text)",
                  borderRadius: 6,
                  padding: "2px 6px",
                }}
              >
                {afterText}
              </p>
              {/* #M5: タグ除去で見えなくなる装飾/構造の追加(aside・リンク等)を明示する。 */}
              {note ? (
                <p className="mt-1 text-[10px] font-medium" style={{ color: "var(--p-green)" }}>
                  {note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismissAll}
          disabled={busy}
          className="approve-btn-ghost px-3 py-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          反映しない
        </button>
        <button
          type="button"
          onClick={onApplySelected}
          disabled={busy || selectedCount === 0}
          className="approve-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconCheck size={13} /> 選択した {selectedCount} 件を反映
        </button>
      </div>
    </section>
  );
}
