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

import { AdviceResultBody } from "./AdviceResultBody";
import { ReviseProposalBody } from "./ReviseProposalBody";
import { SentenceFixBody } from "./SentenceFixBody";

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
  /** revise: 修正案を反映する。 */
  onReviseApply: () => void;
  /** revise: 修正案をやり直す。 */
  onReviseDiscard: () => void;
  /** sentence: 全修正案を本文に反映する。 */
  onSentenceApplyAll: () => void;
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
  onReload,
}: ApplyFlowProps) {
  const applyStatus = apply?.status ?? "なし";
  const proposal = apply?.proposal ?? [];
  const applyRaw = apply?.raw ?? "";

  if (selectable) {
    return (
      <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2">
        <p className="text-[11px] text-blue-800">
          文体・読みやすさ・構成の修正案は本文へ反映できます（採用→差分確認→反映）。
        </p>
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            disabled={busy || adopted.size === 0}
            onClick={onSubmitApply}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
        className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
        aria-busy="true"
      >
        <span>反映案を作成中です。数分後に再読み込みしてください。</span>
        <button
          type="button"
          disabled={busy}
          onClick={onReload}
          className="rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (applyStatus === "提示中") {
    return (
      <div className="mt-2 rounded-md border border-blue-200 bg-white p-2">
        <h5 className="text-[11px] font-bold text-blue-700">反映案（元 → 新）</h5>
        <ul className="mt-1 space-y-2">
          {proposal.map((item, i) => (
            <li key={i} className="rounded border border-gray-200 p-1.5">
              <p className="text-[10px] text-gray-400">元</p>
              <p className="text-[11px] text-gray-500 line-through">{item.before}</p>
              <p className="mt-1 text-[10px] text-gray-400">新</p>
              <p className="text-[11px] text-gray-800">{item.after}</p>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDismissApply}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            反映を閉じる
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onApplyNow()}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            本文に反映する
          </button>
        </div>
      </div>
    );
  }

  if (applyStatus === "失敗") {
    return (
      <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
        <span>反映に失敗しました。{applyRaw ? `（${applyRaw}）` : ""}</span>
        <button
          type="button"
          disabled={busy}
          onClick={onDismissApply}
          className="ml-2 rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
  onReviseApply,
  onReviseDiscard,
  onSentenceApplyAll,
  onRetry,
  adopted,
  selectable,
  classifications,
  onToggleAdopt,
}: ConsultCardProps) {
  return (
    <section
      aria-label={`AI相談: ${KIND_LABEL[view.kind]}`}
      className="rounded-lg border border-gray-200 bg-gray-50 p-3.5"
    >
      {/* ヘッダー: モードラベル */}
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-gray-200 px-2 py-[2px] text-[11px] font-medium text-gray-700">
          {KIND_LABEL[view.kind]}
        </span>
        <span className="text-[11px] text-gray-500">{view.status}</span>
      </div>

      {/* 待ち (requested / processing) */}
      {(view.status === "requested" || view.status === "processing") && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-purple-600" aria-busy="true">
            <span className="animate-pulse">●</span>
            <span>AIが処理中です。数分後に再読み込みしてください。</span>
          </div>
          {/* スケルトン */}
          {[88, 72, 94, 60].map((w, i) => (
            <div
              key={i}
              className="h-[13px] animate-pulse rounded-[5px] bg-gray-200"
              style={{ width: `${w}%` }}
            />
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onReload}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              再読み込み
            </button>
          </div>
        </div>
      )}

      {/* 失敗 */}
      {view.status === "failed" && (
        <div className="flex flex-col items-start gap-3 rounded-[12px] border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-red-600">
            <span aria-hidden="true">✕</span> 生成に失敗しました
          </div>
          <div className="text-[12.5px] text-gray-600">
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
            className="flex items-center gap-1.5 rounded-[9px] border border-blue-600 bg-blue-600 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            再依頼する
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
            />
          ) : (
            <p className="text-xs text-gray-600">
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
            onReload={onReload}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onAdviceDismiss}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
          onApplyAll={onSentenceApplyAll}
        />
      )}
    </section>
  );
}
