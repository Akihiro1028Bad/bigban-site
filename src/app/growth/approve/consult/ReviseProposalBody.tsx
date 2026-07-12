"use client";

/**
 * AI相談ドロワーの「構成案修正」提示ボディ(Task 8: backend 型で移植)。
 *
 * プロト(approve-proto/ReviseProposalBody.tsx)の見た目を基に、backend の props 型へ adapt。
 * - 元型 ReviseProposal{outline?, title?, body?} は撤去(body ルート無し)
 * - backend 型 { currentOutline, outlineProposal, titleProposal } を採用
 * - WordDiffView(既存 @/app/growth/approve)を流用(proto の OutlineDiff/segDiff は移植しない=YAGNI)
 * - タイトル案/構成案それぞれ「元/新2列」grid + changed ハイライト(proto 見た目)+ WordDiffView
 * - onApply/onDiscard は revise 全体に対する1操作(proto の対象別 ReviseTarget apply は出さない)
 * - 配色は proto ダークトークン(--p-*)。反映=approve-btn-primary / 棄却=approve-btn-ghost
 * - status==="failed" 時の理由表示は呼び出し側(ConsultCard)が担う
 *
 * status 管理・依頼フォーム・閉じる操作は持たない(親が担う)。
 */

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
      <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        修正案が届きました。元と見比べて反映してください。
      </p>

      {hasTitleProposal ? (
        <section
          aria-label="タイトルの修正案"
          className="rounded-[12px] p-4"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <h4
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            タイトルの修正案
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-green)" }}>
                元のタイトル
              </h5>
              {/* タイトルは提案のみを <p> で表示(元タイトルは親が別途提示)。差分表示はしない */}
              <p
                className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium"
                style={{
                  background: "var(--p-green-weak)",
                  boxShadow: "inset 2px 0 0 var(--p-green)",
                  color: "var(--p-text)",
                }}
              >
                {titleProposal}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {hasOutlineProposal ? (
        <section
          aria-label="構成案の修正案"
          className="rounded-[12px] p-4"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <h4
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            構成案の修正案
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
                元の構成案
              </h5>
              <pre
                className="whitespace-pre-wrap rounded-[8px] px-2.5 py-1.5 text-[12px]"
                style={{ background: "var(--p-bg-input)", color: "var(--p-text-3)" }}
              >
                {currentOutline}
              </pre>
            </div>
            <div className="min-w-0">
              <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-green)" }}>
                修正案
              </h5>
              <pre
                className="whitespace-pre-wrap rounded-[8px] px-2.5 py-1.5 text-[12px]"
                style={{
                  background: "var(--p-green-weak)",
                  boxShadow: "inset 2px 0 0 var(--p-green)",
                  color: "var(--p-text)",
                }}
              >
                {outlineProposal}
              </pre>
            </div>
          </div>
          <div className="mt-3">
            <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
              変更点（差分）
            </h5>
            <WordDiffView before={currentOutline} after={outlineProposal} />
          </div>
        </section>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={busy}
          className="approve-btn-primary flex-1 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          反映する
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="approve-btn-ghost flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          やり直し
        </button>
      </div>
    </div>
  );
}
