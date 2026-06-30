"use client";

/**
 * 相談ドロワー（差分B Task 10）: 右レール型。
 * 段階（outline/draft）に応じたタブ + ConsultCard リスト + composer slot を持つ。
 *
 * - タブは STAGE_KINDS[stage] で生成:
 *   outline → ["revise"] のみ
 *   draft   → ["overall", "sentence"]
 * - composer は親（useConsult オーケストレータ Task 11 担当）が slot として渡す。
 * - 状態取得・ポーリング・Notion 依頼書き込みは後続 Task 11 担当。ここは容器のみ。
 *
 * framer-motion AnimatePresence + motion.aside で右から slide-in / slide-out。
 * proto の var(--p-*) カスタムプロパティは本番 Tailwind ユーティリティへ置換。
 */

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type {
  ConsultKind,
  ConsultStage,
  OverallConsultView,
  ReviseConsultView,
  SentenceConsultView,
} from "@/lib/growth/consult";
import { STAGE_KINDS } from "@/lib/growth/consult";

import { ConsultCard } from "./ConsultCard";

// ─── タブラベル ─────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<ConsultKind, string> = {
  overall: "全体を見てもらう",
  revise: "構成案を直す",
  sentence: "この文を直す",
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ConsultDrawerProps {
  open: boolean;
  stage: ConsultStage;
  mode: ConsultKind;
  views: (OverallConsultView | ReviseConsultView | SentenceConsultView)[];
  /** ConsultComposer を親が差し込む slot。 */
  composer: ReactNode;
  onModeChange: (mode: ConsultKind) => void;
  onClose: () => void;
  // ── ConsultCard へのコールバック（Task 11 でオーケストレータが束ねて渡す） ────
  onReload: () => void;
  onAdviceDismiss: () => void;
  onAdviceSubmitApply: () => void;
  onAdviceDismissApply: () => void;
  onAdviceApplyNow: () => void;
  onReviseApply: () => void;
  onReviseDiscard: () => void;
  onSentenceApplyAll: () => void;
  onRetry: () => void;
  adopted: ReadonlySet<number>;
  selectable: boolean;
  classifications: { applicable: boolean; reason?: string }[];
  onToggleAdopt: (index: number) => void;
}

// ─── ConsultDrawer ──────────────────────────────────────────────────────────────

export function ConsultDrawer({
  open,
  stage,
  mode,
  views,
  composer,
  onModeChange,
  onClose,
  onReload,
  onAdviceDismiss,
  onAdviceSubmitApply,
  onAdviceDismissApply,
  onAdviceApplyNow,
  onReviseApply,
  onReviseDiscard,
  onSentenceApplyAll,
  onRetry,
  adopted,
  selectable,
  classifications,
  onToggleAdopt,
}: ConsultDrawerProps) {
  /** 段階に応じたタブ種別一覧。 */
  const tabs = STAGE_KINDS[stage];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* モバイルのみ scrim（lg 以上は本文操作を妨げない） */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={onClose}
          />

          {/* 右レール */}
          <motion.aside
            role="dialog"
            aria-modal={false}
            aria-label="AIに相談"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-gray-200 bg-white shadow-2xl"
          >
            {/* ヘッダー */}
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-5 py-3.5">
              <span className="text-[14px] font-semibold text-gray-900">AIに相談</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="ml-auto rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>

            {/* タブ（段階出し分け: STAGE_KINDS[stage]） */}
            <div
              className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-4 py-2.5"
              role="tablist"
              aria-label="相談モード"
            >
              {tabs.map((tabKey) => {
                const isActive = tabKey === mode;
                return (
                  <button
                    key={tabKey}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onModeChange(tabKey)}
                    className={[
                      "rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900"
                        : "bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700",
                    ].join(" ")}
                  >
                    {KIND_LABEL[tabKey]}
                  </button>
                );
              })}
            </div>

            {/* スクロール領域: composer + views */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* ConsultComposer slot */}
              {composer}

              {/* 相談の結果リスト（views は既に kind=mode でフィルタ済みを想定、全件表示） */}
              {views.length > 0 && (
                <>
                  <div className="my-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    相談の結果
                  </div>
                  <div className="flex flex-col gap-3">
                    {views.map((view, i) => (
                      <ConsultCard
                        key={i}
                        view={view}
                        busy={
                          view.status === "requested" ||
                          view.status === "processing" ||
                          view.status === "presenting"
                        }
                        onReload={onReload}
                        onAdviceDismiss={onAdviceDismiss}
                        onAdviceSubmitApply={onAdviceSubmitApply}
                        onAdviceDismissApply={onAdviceDismissApply}
                        onAdviceApplyNow={onAdviceApplyNow}
                        onReviseApply={onReviseApply}
                        onReviseDiscard={onReviseDiscard}
                        onSentenceApplyAll={onSentenceApplyAll}
                        onRetry={onRetry}
                        adopted={adopted}
                        selectable={selectable}
                        classifications={classifications}
                        onToggleAdopt={onToggleAdopt}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
