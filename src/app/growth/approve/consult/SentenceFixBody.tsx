"use client";

/**
 * AI相談ドロワーの「指摘への修正案」提示ボディ(Task 8: backend BodyCommentProposalItem 型で移植)。
 *
 * プロト(approve-proto/SentenceFixBody.tsx)の見た目を基に、backend の BodyCommentProposalItem 型へ adapt。
 * - 元型 BodyCommentFix{block, from, to, sentence} は撤去
 * - backend 型 BodyCommentProposalItem{commentIndex, before, after} を採用
 * - 個別 apply/dismiss ボタンは撤去(applyBodyCommentProposal が決定的一括反映のため)
 * - 反映は「本文へ反映（n）」1本のみ(onApplyAll)
 * - before/after はタグ除去して表示(InlineCommentReview L99-100 踏襲)
 * - structureNote ヘルパーは InlineCommentReview L39-46 より移植し、装飾変化を可視化(#M5)
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 */

import type { BodyCommentProposalItem } from "@/lib/growth/bodyComment";

import { choiceButtonClass } from "../approveStyles";

interface SentenceFixBodyProps {
  proposal: BodyCommentProposalItem[];
  busy: boolean;
  onApplyAll: () => void;
}

/** #M5: before/after の HTMLタグ構造の変化(追加要素)を一言で示す。タグ除去で隠れる装飾変化を可視化。 */
function structureNote(before: string, after: string): string | null {
  const tagNames = (html: string): string[] =>
    [...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase());
  const beforeTags = new Set(tagNames(before));
  const added = [...new Set(tagNames(after))].filter((t) => !beforeTags.has(t));
  return added.length > 0 ? `構造変化: <${added.join(">, <")}> を追加` : null;
}

export function SentenceFixBody({ proposal, busy, onApplyAll }: SentenceFixBodyProps) {
  return (
    <section
      aria-label="指摘への修正案"
      className="rounded-lg border border-gray-200 bg-white p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-700">AIの修正案（元 → 新）</h4>
      </div>

      <ul className="space-y-2">
        {proposal.map((item) => {
          const beforeText = item.before.replace(/<[^>]*>/g, "");
          const afterText = item.after.replace(/<[^>]*>/g, "");
          const note = structureNote(item.before, item.after);
          return (
            <li
              key={item.commentIndex}
              className="rounded border border-gray-200 bg-gray-50 p-2 text-xs"
            >
              <p className="text-gray-400 line-through">{beforeText}</p>
              <p className="mt-0.5 text-gray-900">{afterText}</p>
              {/* #M5: タグ除去で見えなくなる装飾/構造の追加(aside・リンク等)を明示する。 */}
              {note ? (
                <p className="mt-0.5 text-[10px] font-medium text-amber-700">{note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onApplyAll}
          disabled={busy}
          className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
        >
          本文へ反映（{proposal.length}）
        </button>
      </div>
    </section>
  );
}
