/**
 * AI相談ドロワー（差分B）の純ロジック。
 * 本番の2系統（PendingItem の revise 状態 / DraftPreview の advice・bodyComment）を
 * 統一相談ビュー ConsultView へ正規化し、Notion ループステータスを4値 ConsultStatus へ写像し、
 * 段階（構成案=outline / 下書き=draft）を出し分ける。型専用 import のみ（カバレッジ100%ゲートを波及で壊さない）。
 */

import type { Advice, AdviceStatus, AdviceView } from "@/lib/growth/advise";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";

/** ループ共通のステータス文字列（advise/bodyComment/revise で同一の5値ユニオン）。 */
type LoopStatus = AdviceStatus;

/** 相談の3モード。 */
export type ConsultKind = "overall" | "revise" | "sentence";

/** 相談の状態（pull型4値）。requested=依頼中 / processing=PC処理中 / presenting=提示中 / failed=失敗。 */
export type ConsultStatus = "requested" | "processing" | "presenting" | "failed";

/** 段階。outline=構成案段階（revise）/ draft=下書き段階（overall+sentence）。 */
export type ConsultStage = "outline" | "draft";

const STATUS_MAP: Record<LoopStatus, ConsultStatus | null> = {
  なし: null,
  依頼中: "requested",
  処理中: "processing",
  提示中: "presenting",
  失敗: "failed",
};

/** Notion ループステータス→ConsultStatus。なし/未知は null（ビューに出さない）。 */
export function mapLoopStatus(status: string | undefined): ConsultStatus | null {
  if (status === undefined) return null;
  return STATUS_MAP[status as LoopStatus] ?? null;
}

/** 処理中/依頼中/提示中は再依頼不可。failed/null（未依頼）は再依頼可。 */
export function isConsultBusy(status: ConsultStatus | null): boolean {
  return status === "requested" || status === "processing" || status === "presenting";
}

/** 段階ごとに表示する相談モード。 */
export const STAGE_KINDS: Record<ConsultStage, readonly ConsultKind[]> = {
  outline: ["revise"],
  draft: ["overall", "sentence"],
};

/** overall モードの相談ビュー（DraftPreview.advice/adviceApply 由来）。 */
export interface OverallConsultView {
  kind: "overall";
  status: ConsultStatus;
  /** 提示中で JSON 妥当時のみ非 null。 */
  advice: Advice | null;
  /** 失敗理由などの生テキスト。 */
  raw: string;
  /** 依頼時刻（ms）。滞留警告表示用。 */
  requestedAtMs: number | null;
  /** #165 採用→反映ビュー。未取得は null。 */
  apply: AdviceApplyView | null;
}

/** DraftPreview.advice/adviceApply → OverallConsultView。未依頼（なし）は null。 */
export function overallViewFrom(
  advice: AdviceView | undefined,
  apply: AdviceApplyView | undefined,
): OverallConsultView | null {
  const status = mapLoopStatus(advice?.status);
  if (status === null) return null;
  return {
    kind: "overall",
    status,
    advice: advice?.advice ?? null,
    raw: advice?.raw ?? "",
    requestedAtMs: advice?.requestedAtMs ?? null,
    apply: apply ?? null,
  };
}

/** PendingItem の revise 関連フィールド（重い型を避けるための最小サブセット）。 */
export interface ReviseSource {
  reviseStatus?: string;
  reviseProposal?: string;
  reviseTitleProposal?: string;
  outline?: string;
  reviseRequestedAtMs?: number | null;
}

/** revise モードの相談ビュー（PendingItem 由来）。 */
export interface ReviseConsultView {
  kind: "revise";
  status: ConsultStatus;
  currentOutline: string;
  /** 提示中=新構成案 / 失敗時=理由文字列。 */
  outlineProposal: string;
  titleProposal: string;
  requestedAtMs: number | null;
}

/** PendingItem の revise 状態 → ReviseConsultView。未依頼（なし）は null。 */
export function reviseViewFrom(src: ReviseSource): ReviseConsultView | null {
  const status = mapLoopStatus(src.reviseStatus);
  if (status === null) return null;
  return {
    kind: "revise",
    status,
    currentOutline: src.outline ?? "",
    outlineProposal: src.reviseProposal ?? "",
    titleProposal: src.reviseTitleProposal ?? "",
    requestedAtMs: src.reviseRequestedAtMs ?? null,
  };
}
