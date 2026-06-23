"use client";

import { useState } from "react";
import type { ReactNode, UIEvent } from "react";

import type { BoardColumn } from "./board";
import { stageTheme } from "./boardColors";
import { activeColumnIndex } from "./columnPosition";

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
  // #137: モバイルの横スワイプ位置をドットでハイライト(発見性向上)。lg では4列グリッドなので無関係。
  const [active, setActive] = useState(0);
  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget;
    setActive(activeColumnIndex(el.scrollLeft, el.scrollWidth, columns.length));
  };

  return (
    <section aria-label="記事パイプライン" className="mt-4">
      <div
        data-testid="article-kanban-scroll"
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible"
      >
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
      {/* #137: モバイルのみ ― 横スワイプの案内＋現在位置ドット(色だけに依存せず幅でも示す)。 */}
      <div className="mt-2 flex flex-col items-center gap-1 lg:hidden">
        <p className="text-xs text-gray-400">← 横にスワイプして段階を切り替え →</p>
        <div role="group" aria-label="段階の位置" className="flex items-center gap-1.5">
          {columns.map(({ column }, i) => (
            <span
              key={column.stage}
              data-testid="stage-dot"
              aria-current={i === active ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-gray-700" : "w-1.5 bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
