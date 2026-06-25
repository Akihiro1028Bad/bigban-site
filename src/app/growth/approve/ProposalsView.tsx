import type { ReactNode } from "react";

interface ProposalsViewProps<T> {
  proposals: T[];
  renderItem: (item: T) => ReactNode;
  densityClass: string;
  headerClass: string;
}

/**
 * 施策タブ(#119)。施策はトリアージ用の縦リスト(カンバンにしない)。
 * 優先度降順は親で並べ替え済み。承認/却下/一括/Undo は renderItem 側に内包される。
 * item の具体型に依存しない(renderItem に委譲する)ため総称型で受ける。
 */
export function ProposalsView<T>({
  proposals,
  renderItem,
  densityClass,
  headerClass,
}: ProposalsViewProps<T>) {
  return (
    <section aria-label="施策レーン" className="mt-4">
      <div className={headerClass}>
        <span>施策</span>
        <span className="text-xs text-gray-500">{proposals.length}件</span>
      </div>
      {proposals.length > 0 ? (
        <ul className={`mt-2 ${densityClass}`}>{proposals.map(renderItem)}</ul>
      ) : (
        <p className="mt-2 rounded-md bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">
          未処理の施策はありません
        </p>
      )}
    </section>
  );
}
