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
 * 見た目は proto ダークへ再スキン。root に `.approve-shell` を付け var(--p-*) トークンを解決する。
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

import { useDialog } from "../hooks/useDialog";
import { Kbd } from "../ui/primitives";
import { ConsultCard } from "./ConsultCard";
import type { RejectedFixPayload, ReviseApplyPayload } from "./ReviseProposalBody";

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
  /** 表示中モードの操作(依頼/反映/再読込)が進行中か。各カードのボタン無効化に使う。 */
  busy: boolean;
  onModeChange: (mode: ConsultKind) => void;
  onClose: () => void;
  // ── ConsultCard へのコールバック（Task 11 でオーケストレータが束ねて渡す） ────
  onReload: () => void;
  onAdviceDismiss: () => void;
  onAdviceSubmitApply: () => void;
  onAdviceDismissApply: () => void;
  onAdviceApplyNow: () => void;
  onAdviceToggleApplySelect: (fixIndex: number) => void;
  adviceApplySelected: ReadonlySet<number>;
  onReviseApply: (payload: ReviseApplyPayload) => void;
  onReviseDiscard: (rejected: RejectedFixPayload[]) => void;
  onSentenceApplySelected: () => void;
  onSentenceDismissAll: () => void;
  onSentenceToggleSelect: (commentIndex: number) => void;
  sentenceSelected: Set<number>;
  onRetry: () => void;
  adopted: ReadonlySet<number>;
  selectable: boolean;
  classifications: { applicable: boolean; reason?: string }[];
  onToggleAdopt: (index: number) => void;
  onSetAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;
}

// ─── ConsultDrawer ──────────────────────────────────────────────────────────────

export function ConsultDrawer({
  open,
  stage,
  mode,
  views,
  composer,
  busy,
  onModeChange,
  onClose,
  onReload,
  onAdviceDismiss,
  onAdviceSubmitApply,
  onAdviceDismissApply,
  onAdviceApplyNow,
  onAdviceToggleApplySelect,
  adviceApplySelected,
  onReviseApply,
  onReviseDiscard,
  onSentenceApplySelected,
  onSentenceDismissAll,
  onSentenceToggleSelect,
  sentenceSelected,
  onRetry,
  adopted,
  selectable,
  classifications,
  onToggleAdopt,
  onSetAdoptedBulk,
}: ConsultDrawerProps) {
  /** 段階に応じたタブ種別一覧。 */
  const tabs = STAGE_KINDS[stage];

  /** esc 閉じ + フォーカス管理（proto 移植の a11y フック）。esc の close は集中ハンドラ側が担う。 */
  const dialogRef = useDialog<HTMLElement>();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* モバイルのみ scrim（lg 以上は本文操作を妨げない） */}
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: "rgba(4,6,9,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={onClose}
          />

          {/* 右レール。外側 approve-shell(theme が fixed inset-0 を注入)は当たり判定を透過し、
              内側 aside を ml-auto で右アンカーする(inset-0 と right-0 の競合で左に張り付くのを構造で回避)。 */}
          <div className="approve-shell pointer-events-none z-50 flex" style={{ background: "transparent" }}>
          <motion.aside
            ref={dialogRef}
            role="dialog"
            aria-modal={false}
            aria-label="AIに相談"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="pointer-events-auto ml-auto flex h-full w-full max-w-[440px] flex-col"
            style={{
              background: "var(--p-bg-elevated)",
              borderLeft: "1px solid var(--p-border-strong)",
              boxShadow: "-18px 0 50px rgba(0,0,0,0.4)",
            }}
          >
            {/* ヘッダー */}
            <div
              className="flex shrink-0 items-center gap-2 px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--p-border)" }}
            >
              <span className="text-[14px] font-semibold" style={{ color: "var(--p-text)" }}>
                AIに相談
              </span>
              <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto">
                <Kbd>esc</Kbd>
              </button>
            </div>

            {/* タブ（段階出し分け: STAGE_KINDS[stage]） */}
            <div
              className="flex shrink-0 items-center gap-1 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--p-border)" }}
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
                    className="rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                    style={{
                      background: isActive ? "var(--p-bg-active)" : "transparent",
                      color: isActive ? "var(--p-text)" : "var(--p-text-3)",
                    }}
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
                  <div
                    className="my-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--p-text-3)" }}
                  >
                    相談の結果
                  </div>
                  <div className="flex flex-col gap-3">
                    {views.map((view, i) => (
                      <ConsultCard
                        key={i}
                        view={view}
                        busy={busy}
                        onReload={onReload}
                        onAdviceDismiss={onAdviceDismiss}
                        onAdviceSubmitApply={onAdviceSubmitApply}
                        onAdviceDismissApply={onAdviceDismissApply}
                        onAdviceApplyNow={onAdviceApplyNow}
                        onAdviceToggleApplySelect={onAdviceToggleApplySelect}
                        adviceApplySelected={adviceApplySelected}
                        onReviseApply={onReviseApply}
                        onReviseDiscard={onReviseDiscard}
                        onSentenceApplySelected={onSentenceApplySelected}
                        onSentenceDismissAll={onSentenceDismissAll}
                        onSentenceToggleSelect={onSentenceToggleSelect}
                        sentenceSelected={sentenceSelected}
                        onRetry={onRetry}
                        adopted={adopted}
                        selectable={selectable}
                        classifications={classifications}
                        onToggleAdopt={onToggleAdopt}
                        onSetAdoptedBulk={onSetAdoptedBulk}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.aside>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
