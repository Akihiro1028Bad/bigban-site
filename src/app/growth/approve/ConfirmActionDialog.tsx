/**
 * 公開・クローズの確認ダイアログ(#H7 分解 / #167・H2)。取り消しづらい外向き操作の確認。
 */

"use client";

export interface ConfirmActionState {
  kind: "publish" | "close";
  id: string;
  title: string;
}

interface ConfirmActionDialogProps {
  action: ConfirmActionState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({ action, busy, onCancel, onConfirm }: ConfirmActionDialogProps) {
  const isPublish = action.kind === "publish";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="公開・クローズの確認"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-900">
          {isPublish ? "記事を本番公開します" : "タスクをクローズします"}
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          「{action.title}」を
          {isPublish
            ? "公開すると一般に表示されます。よろしいですか？"
            : "盤から非表示にします。よろしいですか？"}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              isPublish
                ? "rounded border border-green-700 bg-green-700 px-3 py-1 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
                : "rounded border border-gray-700 bg-gray-700 px-3 py-1 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50"
            }
          >
            {isPublish ? "公開を確定" : "クローズを確定"}
          </button>
        </div>
      </div>
    </div>
  );
}
