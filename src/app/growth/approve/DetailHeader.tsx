import type { DetailBadge } from "./detailBadge";

interface DetailHeaderProps {
  title: string;
  kindLabel: string;
  badge: DetailBadge;
  onClose: () => void;
}

/**
 * 詳細パネル(#124)のヘッダーバンド。段階色の上部アクセント＋段階チップ＋種別＋
 * タイトル(2行クランプ)＋閉じる。段階は色だけに依存せずラベルを併記する(AA)。
 */
export function DetailHeader({ title, kindLabel, badge, onClose }: DetailHeaderProps) {
  return (
    <div>
      <div className={`h-1 rounded-t ${badge.theme.bar}`} aria-hidden="true" />
      <div className="flex items-start gap-2 pt-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${badge.theme.header}`}
            >
              {badge.label}
            </span>
            <span className="text-xs text-gray-500">{kindLabel}</span>
          </div>
          <h2 className="line-clamp-2 text-lg font-bold leading-snug text-gray-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 shrink-0 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
