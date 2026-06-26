/**
 * 承認画面の早期リターン用ゲート画面(#H7 分解)。読み込み中／取得失敗／承認待ちゼロ。
 * いずれも状態は親が持ち、ここは表示のみ。
 */

"use client";

import { AddProposalForm } from "./AddProposalForm";
import { TAP_TARGET } from "./approveStyles";

export function LoadingGate() {
  return (
    <main className="mx-auto max-w-md p-6 text-center" aria-busy="true">
      <p className="mt-10 text-sm text-gray-600">読み込み中…</p>
    </main>
  );
}

export function LoadErrorGate({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold text-gray-900">承認ページ</h1>
      <p role="alert" className="mt-3 text-sm text-red-700">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`${TAP_TARGET} mt-4 w-full bg-blue-600 text-white hover:bg-blue-700`}
      >
        再読み込み
      </button>
    </main>
  );
}

export function EmptyGate({ token, onAdded }: { token: string; onAdded: Parameters<typeof AddProposalForm>[0]["onAdded"] }) {
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="mt-10 text-3xl">🎉</p>
      <h1 className="mt-2 text-lg font-bold text-gray-900">今週の承認待ちはありません</h1>
      <p className="mt-2 text-sm text-gray-600">お疲れさまでした。</p>
      <div className="mx-auto mt-6 max-w-md text-left">
        <AddProposalForm token={token} onAdded={onAdded} />
      </div>
    </main>
  );
}
