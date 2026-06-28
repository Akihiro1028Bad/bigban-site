/**
 * 公開・クローズ・構成やり直しの確認ダイアログ(#H7 分解 / #167・H2 / 構成からやり直す)。
 * 取り消しづらい/破棄を伴う操作の前に必ず挟み、対象タイトルを明示する。
 */

"use client";

export interface ConfirmActionState {
  kind: "publish" | "close" | "revert";
  id: string;
  title: string;
}

interface ConfirmActionDialogProps {
  action: ConfirmActionState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// 種別ごとの文言とボタン体裁。publish/close はダイアログ aria-label を従来どおり共有する。
const DIALOG_CONFIG: Record<
  ConfirmActionState["kind"],
  {
    ariaLabel: string;
    heading: string;
    body: (title: string) => string;
    confirmLabel: string;
    confirmClass: string;
  }
> = {
  publish: {
    ariaLabel: "公開・クローズの確認",
    heading: "記事を本番公開します",
    body: (title) => `「${title}」を公開すると一般に表示されます。よろしいですか？`,
    confirmLabel: "公開を確定",
    confirmClass:
      "border-green-700 bg-green-700 hover:bg-green-800",
  },
  close: {
    ariaLabel: "公開・クローズの確認",
    heading: "タスクをクローズします",
    body: (title) => `「${title}」を盤から非表示にします。よろしいですか？`,
    confirmLabel: "クローズを確定",
    confirmClass: "border-gray-700 bg-gray-700 hover:bg-gray-800",
  },
  revert: {
    ariaLabel: "構成からやり直すの確認",
    heading: "提案中に戻して構成からやり直します",
    body: (title) =>
      `「${title}」を提案中に戻します。再承認すると、現在の下書き・手動編集・アイキャッチ・本文画像は作り直されます。よろしいですか？`,
    confirmLabel: "提案中に戻す",
    confirmClass: "border-amber-700 bg-amber-700 hover:bg-amber-800",
  },
};

export function ConfirmActionDialog({ action, busy, onCancel, onConfirm }: ConfirmActionDialogProps) {
  const config = DIALOG_CONFIG[action.kind];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={config.ariaLabel}
      // z-[80]: 詳細パネル(z-50)・編集ワークスペース(z-60)・コマンドパレット(z-70)より上に出す。
      // 公開/クローズ/構成やり直しの確認は詳細パネル内のボタンから開くため、パネルより前面でないと
      // ダイアログがパネルの裏に隠れて操作できない(同 z-index だと後勝ちの DOM=パネルが前面になる)。
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-gray-900">{config.heading}</h2>
        <p className="mt-1 text-xs text-gray-600">{config.body(action.title)}</p>
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
            className={`rounded border px-3 py-1 text-xs font-bold text-white disabled:opacity-50 ${config.confirmClass}`}
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
