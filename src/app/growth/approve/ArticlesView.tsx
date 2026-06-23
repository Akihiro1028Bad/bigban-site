import type { ReactNode } from "react";

import type { BoardColumn } from "./board";
import { stageTheme } from "./boardColors";

interface ArticleColumn<T> {
  column: BoardColumn;
  items: T[];
}

interface ArticlesViewProps<T> {
  columns: ArticleColumn<T>[];
  renderItem: (item: T) => ReactNode;
  densityClass: string;
}

/**
 * 記事タブ(#119)。全幅の横型カンバン。
 * - デスクトップ(lg): 4列グリッドで全幅展開。
 * - モバイル: 横スクロール＋スナップ(段階ごとに横スワイプ)。
 * - 段階で色分け(提案=Blue/生成待ち=Amber/生成中=Purple/下書き=Teal)。色だけに依存しない
 *   ようラベルを併記。列ヘッダは sticky。
 */
export function ArticlesView<T>({ columns, renderItem, densityClass }: ArticlesViewProps<T>) {
  return (
    <section aria-label="記事パイプライン" className="mt-4">
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {columns.map(({ column, items }) => {
          const theme = stageTheme(column.stage);
          return (
            <section
              key={column.stage}
              aria-label={`列: ${column.label}`}
              className="min-w-[82%] shrink-0 snap-start sm:min-w-[18rem] lg:min-w-0"
            >
              <div
                className={`sticky top-0 z-10 flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${theme.header}`}
              >
                <span>{column.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${theme.count}`}>
                  {items.length}件
                </span>
              </div>
              {items.length > 0 ? (
                <ul className={`mt-2 ${densityClass}`}>{items.map(renderItem)}</ul>
              ) : (
                <p className="mt-2 rounded-md bg-gray-50 px-3 py-6 text-center text-xs text-gray-300">
                  なし
                </p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
