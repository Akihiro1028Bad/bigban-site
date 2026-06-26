/**
 * 構成案修正の「提示中(修正案あり)」表示(#H7 分解)。元 vs 新の比較＋反映/やり直し。
 * 構成案・タイトルのうち提案がある方だけ出す(部分提案を許容)。
 */

"use client";

import { choiceButtonClass } from "./approveStyles";
import { WordDiffView } from "./WordDiffView";

interface ReviseReadyProps {
  title: string;
  currentOutline: string;
  outlineProposal: string;
  titleProposal: string;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
}

export function ReviseReady({
  title,
  currentOutline,
  outlineProposal,
  titleProposal,
  busy,
  onApply,
  onDiscard,
}: ReviseReadyProps) {
  const hasOutlineProposal = outlineProposal !== "";
  const hasTitleProposal = titleProposal !== "";
  return (
    <div>
      <p className="mt-2 text-xs text-gray-500">修正案が届きました。元と見比べて反映してください。</p>
      {hasTitleProposal ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold text-gray-500">元のタイトル</h4>
            <p className="mt-1 rounded-md bg-gray-50 p-2 text-xs text-gray-700">{title}</p>
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-700">タイトル案</h4>
            <p className="mt-1 rounded-md bg-blue-50 p-2 text-xs font-medium text-gray-900">{titleProposal}</p>
          </div>
        </div>
      ) : null}
      {hasOutlineProposal ? (
        <>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold text-gray-500">元の構成案</h4>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-xs text-gray-700">
                {currentOutline}
              </pre>
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-700">修正案</h4>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-blue-50 p-2 text-xs text-gray-900">
                {outlineProposal}
              </pre>
            </div>
          </div>
          <div className="mt-2">
            <h4 className="text-xs font-bold text-gray-500">変更点（差分）</h4>
            <WordDiffView before={currentOutline} after={outlineProposal} />
          </div>
        </>
      ) : null}
      <div className="mt-2 flex gap-2">
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
          className={choiceButtonClass("flex-1 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
        >
          やり直し
        </button>
      </div>
    </div>
  );
}
