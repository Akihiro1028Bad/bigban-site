/**
 * 下書きプレビュー下部の公開・クローズ操作(#H7 分解 / #167・H1・H4)。
 * 公開前チェックに赤(block)があれば公開を無効化する(最終アクション位置)。
 */

"use client";

import { draftQuality, hasBlockingCheck } from "./draftQuality";

interface PublishCloseActionsProps {
  stage: string;
  title: string;
  bodyHtml: string;
  body: string;
  knownNewsPaths?: readonly string[];
  busy: boolean;
  error: string;
  onPublish: () => void;
  onClose: () => void;
}

export function PublishCloseActions({
  stage,
  title,
  bodyHtml,
  body,
  knownNewsPaths,
  busy,
  error,
  onPublish,
  onClose,
}: PublishCloseActionsProps) {
  const publishBlocked = hasBlockingCheck(
    draftQuality({
      bodyHtml,
      body,
      title,
      knownNewsPaths: knownNewsPaths ? new Set(knownNewsPaths) : undefined,
    })
  );
  return (
    <div role="group" aria-label="公開・クローズ" className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap gap-2">
        {stage === "drafted" ? (
          <button
            type="button"
            disabled={busy || publishBlocked}
            onClick={onPublish}
            className="rounded-md border border-green-700 bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
          >
            公開する
          </button>
        ) : null}
        {stage === "published" ? (
          <span className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-bold text-green-800">公開済み</span>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          クローズ（盤から非表示）
        </button>
      </div>
      {stage === "drafted" && publishBlocked ? (
        <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          公開前チェックに赤（要修正）があります。修正してから公開してください。
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
