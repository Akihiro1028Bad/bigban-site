"use client";

/**
 * AI相談ドロワーの「構成案修正」提示ボディ(Task 8: backend 型で移植)。
 *
 * プロト(approve-proto/ReviseProposalBody.tsx)の見た目を基に、backend の props 型へ adapt。
 * - 元型 ReviseProposal{outline?, title?, body?} は撤去(body ルート無し)
 * - backend 型 { currentOutline, outlineProposal, titleProposal } を採用
 * - WordDiffView(既存 @/app/growth/approve)を流用
 * - タイトル案/構成案それぞれ「元→新」grid + WordDiffView(ReviseReady.tsx 踏襲)
 * - onApply/onDiscard は revise 全体に対する1操作
 * - status==="failed" 時の理由表示は呼び出し側(ConsultCard)が担う
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 */

import { choiceButtonClass } from "../approveStyles";
import { WordDiffView } from "../WordDiffView";

interface ReviseProposalBodyProps {
  currentOutline: string;
  outlineProposal: string;
  titleProposal: string;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

export function ReviseProposalBody({
  currentOutline,
  outlineProposal,
  titleProposal,
  busy,
  onApply,
  onDiscard,
}: ReviseProposalBodyProps) {
  const hasOutlineProposal = outlineProposal !== "";
  const hasTitleProposal = titleProposal !== "";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">修正案が届きました。元と見比べて反映してください。</p>

      {hasTitleProposal ? (
        <section
          aria-label="タイトルの修正案"
          className="rounded-lg border border-gray-200 bg-white p-3"
        >
          <h4 className="mb-2 text-sm font-bold text-gray-700">タイトルの修正案</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h5 className="text-xs font-bold text-gray-500">元のタイトル</h5>
              {/* currentOutline から title は親が渡す。ここではタイトル提案のみ表示 */}
              {/* タイトル提案は WordDiffView で before="" after=titleProposal として差分表示 */}
              <p className="mt-1 rounded-md bg-blue-50 p-2 text-xs font-medium text-gray-900">
                {titleProposal}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {hasOutlineProposal ? (
        <section
          aria-label="構成案の修正案"
          className="rounded-lg border border-gray-200 bg-white p-3"
        >
          <h4 className="mb-2 text-sm font-bold text-gray-700">構成案の修正案</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h5 className="text-xs font-bold text-gray-500">元の構成案</h5>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                {currentOutline}
              </pre>
            </div>
            <div>
              <h5 className="text-xs font-bold text-blue-700">修正案</h5>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-blue-50 p-2 text-xs text-gray-900">
                {outlineProposal}
              </pre>
            </div>
          </div>
          <div className="mt-2">
            <h5 className="text-xs font-bold text-gray-500">変更点（差分）</h5>
            <WordDiffView before={currentOutline} after={outlineProposal} />
          </div>
        </section>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className={choiceButtonClass("flex-1 border border-blue-600 bg-blue-600 text-white")}
        >
          反映する
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className={choiceButtonClass(
            "flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          )}
        >
          やり直し
        </button>
      </div>
    </div>
  );
}
