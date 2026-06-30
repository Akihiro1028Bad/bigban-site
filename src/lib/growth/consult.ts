/**
 * AI相談ドロワー（差分B）の純ロジック。
 * 本番の2系統（PendingItem の revise 状態 / DraftPreview の advice・bodyComment）を
 * 統一相談ビュー ConsultView へ正規化し、Notion ループステータスを4値 ConsultStatus へ写像し、
 * 段階（構成案=outline / 下書き=draft）を出し分ける。型専用 import のみ（カバレッジ100%ゲートを波及で壊さない）。
 */

import type { AdviceStatus } from "@/lib/growth/advise";

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
