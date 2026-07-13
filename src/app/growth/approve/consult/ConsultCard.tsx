"use client";

/**
 * 相談カード（差分B Task 10）: 1相談のステータス（待ち/提示/失敗）と
 * モード別ボディ（AdviceResultBody / ReviseProposalBody / SentenceFixBody）を出し分ける容器。
 *
 * - status: requested/processing → 待ち（再読み込みボタン）
 * - status: presenting → view.kind に応じた *Body コンポーネント
 * - status: failed → 失敗理由 + 再依頼ボタン
 *
 * overall モードの apply フロー（採用→反映依頼→反映）は AdviceCard.renderApplySection を参照し、
 * コールバック props 経由で配線する（ロジックは持たない）。
 * 本コンポーネントは容器のみ。状態取得・ポーリングは後続 Task 11 担当。
 */

import type {
  OverallConsultView,
  ReviseConsultView,
  SentenceConsultView,
} from "@/lib/growth/consult";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";

import { IconWand, IconX } from "../ui/icons";

import { AdviceResultBody } from "./AdviceResultBody";
import { ReviseProposalBody } from "./ReviseProposalBody";
import { SentenceFixBody } from "./SentenceFixBody";
import type { RejectedFixPayload, ReviseApplyPayload } from "./ReviseProposalBody";

// ─── Kind ラベル ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<OverallConsultView["kind"] | ReviseConsultView["kind"] | SentenceConsultView["kind"], string> = {
  overall: "全体を見てもらう",
  revise: "構成案修正",
  sentence: "文章修正案",
};

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ConsultCardProps {
  view: OverallConsultView | ReviseConsultView | SentenceConsultView;
  /** isConsultBusy(view.status) 由来。親が計算して渡す。 */
  busy: boolean;
  /** 待ち状態の再読み込みボタン押下。 */
  onReload: () => void;
  /** overall: アドバイスを閉じる。 */
  onAdviceDismiss: () => void;
  /** overall: 採用済み fix の反映を依頼する（#165 SubmitApply）。 */
  onAdviceSubmitApply: () => void;
  /** overall: 反映案を閉じる（#165 DismissApply）。 */
  onAdviceDismissApply: () => void;
  /** overall: 反映案を本文に即時反映する（#165 ApplyNow）。 */
  onAdviceApplyNow: () => void;
  /** overall: 提示後の反映案を選択/解除する。 */
  onAdviceToggleApplySelect: (fixIndex: number) => void;
  /** overall: 本文へ反映する提示案の index 集合。 */
  adviceApplySelected: ReadonlySet<number>;
  /** revise: 修正案を反映する。 */
  onReviseApply: (payload: ReviseApplyPayload) => void;
  /** revise: 修正案をやり直す。 */
  onReviseDiscard: (rejected: RejectedFixPayload[]) => void;
  /** sentence: 選択した修正案を本文に反映する。 */
  onSentenceApplySelected: () => void;
  /** sentence: 全修正案を却下する。 */
  onSentenceDismissAll: () => void;
  /** sentence: 修正案の選択を切り替える。 */
  onSentenceToggleSelect: (commentIndex: number) => void;
  /** sentence: 選択中の修正案インデックス。 */
  sentenceSelected: Set<number>;
  /** 失敗時に同じ内容で再依頼する。 */
  onRetry: () => void;
  // ── overall / AdviceResultBody 用 ─────────────────────────────────────────
  /** 採用済み fix インデックス集合。 */
  adopted: ReadonlySet<number>;
  /** true のとき採用チェックを表示する。 */
  selectable: boolean;
  /** 各 fix の反映可否判定結果（advice.fixes と同じ順序・長さ）。 */
  classifications: { applicable: boolean; reason?: string }[];
  onToggleAdopt: (index: number) => void;
  onSetAdoptedBulk: (indexes: readonly number[], adopt: boolean) => void;
}

// ─── apply フロー (overall・AdviceCard.renderApplySection 踏襲) ─────────────────

interface ApplyFlowProps {
  apply: AdviceApplyView | null;
  selectable: boolean;
  adopted: ReadonlySet<number>;
  busy: boolean;
  onSubmitApply: () => void;
  onDismissApply: () => void;
  onApplyNow: () => void;
  onToggleApplySelect: (fixIndex: number) => void;
  applySelected: ReadonlySet<number>;
  onReload: () => void;
}

function AdviceApplySection({
  apply,
  selectable,
  adopted,
  busy,
  onSubmitApply,
  onDismissApply,
  onApplyNow,
  onToggleApplySelect,
  applySelected,
  onReload,
}: ApplyFlowProps) {
  const applyStatus = apply?.status ?? "なし";
  const proposal = apply?.proposal ?? [];
  const applyRaw = apply?.raw ?? "";

  if (selectable) {
    return (
      <div
        className="mt-2 rounded-[10px] p-2.5"
        style={{ background: "var(--p-accent-weak)", border: "1px solid var(--p-border)" }}
      >
        <p className="text-[11px]" style={{ color: "var(--p-accent-ink)" }}>
          文体・読みやすさ・構成の修正案は本文へ反映できます（採用→差分確認→反映）。
        </p>
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            disabled={busy || adopted.size === 0}
            onClick={onSubmitApply}
            className="approve-btn-primary rounded-[8px] px-3 py-1 text-[11px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            採用分を反映依頼（{adopted.size}）
          </button>
        </div>
      </div>
    );
  }

  if (applyStatus === "依頼中" || applyStatus === "処理中") {
    return (
      <div
        className="mt-2 flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[11px]"
        style={{ background: "var(--p-purple-weak)", color: "var(--p-purple)" }}
        aria-busy="true"
      >
        <IconWand size={13} className="approve-pulse" />
        <span>反映案を作成中です。数分後に再読み込みしてください。</span>
        <button
          type="button"
          disabled={busy}
          onClick={onReload}
          className="approve-btn-ghost ml-auto"
          style={{ padding: "3px 8px" }}
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (applyStatus === "提示中") {
    return (
      <div
        className="mt-2 rounded-[10px] p-2.5"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <h5 className="text-[11px] font-bold" style={{ color: "var(--p-accent-ink)" }}>反映案（元 → 新）</h5>
        <ul className="mt-1 space-y-2">
          {proposal.map((item) => {
            const isSelected = applySelected.has(item.fixIndex);
            return (
            <li
              key={item.fixIndex}
              className="rounded-[8px] p-1.5"
              style={{ border: "1px solid var(--p-border)", opacity: isSelected ? 1 : 0.55 }}
            >
              <label className="mb-1 flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: "var(--p-text-2)" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleApplySelect(item.fixIndex)}
                  aria-label={`反映案${item.fixIndex + 1}を反映`}
                />
                この案を反映
              </label>
              <p className="text-[10px]" style={{ color: "var(--p-text-3)" }}>元</p>
              <p className="text-[11px] line-through" style={{ color: "var(--p-text-3)" }}>{item.before}</p>
              <p className="mt-1 text-[10px]" style={{ color: "var(--p-text-3)" }}>新</p>
              <p className="text-[11px]" style={{ color: "var(--p-text)" }}>{item.after}</p>
            </li>
            );
          })}
        </ul>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDismissApply}
            className="approve-btn-ghost"
            style={{ padding: "3px 10px" }}
          >
            反映を閉じる
          </button>
          <button
            type="button"
            disabled={busy || applySelected.size === 0}
            onClick={() => void onApplyNow()}
            className="approve-btn-primary rounded-[8px] px-3 py-1 text-[11px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            選択した {applySelected.size} 件を本文に反映
          </button>
        </div>
      </div>
    );
  }

  if (applyStatus === "失敗") {
    return (
      <div
        className="mt-2 flex items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[11px]"
        style={{ background: "var(--p-red-weak)", color: "var(--p-red)" }}
      >
        <span>反映に失敗しました。{applyRaw ? `（${applyRaw}）` : ""}</span>
        <button
          type="button"
          disabled={busy}
          onClick={onDismissApply}
          className="approve-btn-ghost ml-auto"
          style={{ padding: "3px 8px" }}
        >
          反映を閉じる
        </button>
      </div>
    );
  }

  return null;
}

// ─── ConsultCard ───────────────────────────────────────────────────────────────

export function ConsultCard({
  view,
  busy,
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
}: ConsultCardProps) {
  return (
    <section
      aria-label={`AI相談: ${KIND_LABEL[view.kind]}`}
      className="rounded-[12px] p-3.5"
      style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}
    >
      {/* ヘッダー: モードラベル */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-[2px] text-[11px] font-medium"
          style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
        >
          {KIND_LABEL[view.kind]}
        </span>
        <span className="text-[11px]" style={{ color: "var(--p-text-3)" }}>{view.status}</span>
      </div>

      {/* 待ち (requested / processing) */}
      {(view.status === "requested" || view.status === "processing") && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }} aria-busy="true">
            <IconWand size={15} className="approve-pulse" />
            <span>AIが処理中です。数分後に再読み込みしてください。</span>
          </div>
          {/* スケルトン */}
          {[88, 72, 94, 60].map((w, i) => (
            <div
              key={i}
              className="approve-shimmer h-[13px] rounded-[5px]"
              style={{ width: `${w}%` }}
            />
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onReload}
              className="approve-btn-ghost"
              style={{ padding: "3px 10px" }}
            >
              再読み込み
            </button>
          </div>
        </div>
      )}

      {/* 失敗 */}
      {view.status === "failed" && (
        <div
          className="flex flex-col items-start gap-3 rounded-[12px] p-4"
          style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)" }}
        >
          <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--p-red)" }}>
            <IconX size={15} /> 生成に失敗しました
          </div>
          <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
            {/* overall/sentence は raw、revise は outlineProposal に失敗理由が入る */}
            {view.kind === "revise"
              ? (view.outlineProposal || "外部処理が応答しませんでした。")
              : (view.kind === "overall" || view.kind === "sentence")
                ? (view.raw || "外部処理が応答しませんでした。")
                : "外部処理が応答しませんでした。"}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="approve-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            <IconWand size={14} /> 再依頼する
          </button>
        </div>
      )}

      {/* 提示中: overall */}
      {view.status === "presenting" && view.kind === "overall" && (
        <div>
          {view.advice !== null ? (
            <AdviceResultBody
              advice={view.advice}
              adopted={adopted}
              selectable={selectable}
              classifications={classifications}
              onToggleAdopt={onToggleAdopt}
              onSetAdoptedBulk={onSetAdoptedBulk}
            />
          ) : (
            <p className="text-xs" style={{ color: "var(--p-text-2)" }}>
              アドバイスを解釈できませんでした。もう一度依頼してください。
            </p>
          )}
          <AdviceApplySection
            apply={view.apply}
            selectable={selectable && view.advice !== null}
            adopted={adopted}
            busy={busy}
            onSubmitApply={onAdviceSubmitApply}
            onDismissApply={onAdviceDismissApply}
            onApplyNow={onAdviceApplyNow}
            onToggleApplySelect={onAdviceToggleApplySelect}
            applySelected={adviceApplySelected}
            onReload={onReload}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onAdviceDismiss}
              className="approve-btn-ghost"
              style={{ padding: "3px 10px" }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 提示中: revise */}
      {view.status === "presenting" && view.kind === "revise" && (
        <ReviseProposalBody
          currentOutline={view.currentOutline}
          outlineProposal={view.outlineProposal}
          titleProposal={view.titleProposal}
          busy={busy}
          onApply={onReviseApply}
          onDiscard={onReviseDiscard}
        />
      )}

      {/* 提示中: sentence */}
      {view.status === "presenting" && view.kind === "sentence" && (
        <SentenceFixBody
          proposal={view.proposal}
          busy={busy}
          selected={sentenceSelected}
          onToggleSelect={onSentenceToggleSelect}
          onApplySelected={onSentenceApplySelected}
          onDismissAll={onSentenceDismissAll}
        />
      )}
    </section>
  );
}
