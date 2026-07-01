/**
 * 詳細パネルの外枠(#H7 分解 / #127 / #proto P3a)。記事は 2ペインの右側に収める常設パネル
 * (region・親を満たす。fixed 全画面モーダル/背景オーバーレイ/aria-modal は持たない。閉じるは
 * モバイルの「← 一覧」= 親が担う)。施策=右ドロワー(dialog)。中身(ヘッダ/インサイト/チェック
 * リスト/プレビュー/構成案/主操作)は親が計算して注入する。
 */

"use client";

import type { ReactNode } from "react";

interface DetailPanelProps {
  isIdea: boolean;
  title: string;
  header: ReactNode;
  insight: ReactNode;
  checklist: ReactNode;
  draftPreview: ReactNode;
  reviseSection: ReactNode;
  decisionActions: ReactNode;
  onClose: () => void;
}

export function DetailPanel({
  isIdea,
  title,
  header,
  insight,
  checklist,
  draftPreview,
  reviseSection,
  decisionActions,
  onClose,
}: DetailPanelProps) {
  if (isIdea) {
    // #proto P3a: 記事は 2ペインの右側に収める常設パネル(region)。親(右ペイン)を満たす。
    // モーダルではないため dialog/aria-modal/背景オーバーレイは持たない。3ゾーン内容は据え置き。
    return (
      <div
        role="region"
        aria-label={`詳細: ${title}`}
        className="relative flex h-full w-full flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 pb-2">{header}</div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="lg:flex lg:items-start lg:gap-6">
            <div className="lg:w-[20rem] lg:shrink-0">
              {insight}
              {checklist}
            </div>
            <div className="lg:sticky lg:top-0 lg:min-w-0 lg:flex-1">{draftPreview}</div>
            <div className="lg:w-[24rem] lg:shrink-0">{reviseSection}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="オーバーレイを閉じる"
        onClick={onClose}
        className="flex-1 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`詳細: ${title}`}
        className="ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-4 shadow-xl sm:w-[28rem]"
      >
        {header}
        <div className="mt-3">
          {insight}
          <div className="mt-4 flex gap-2">{decisionActions}</div>
        </div>
      </div>
    </div>
  );
}
