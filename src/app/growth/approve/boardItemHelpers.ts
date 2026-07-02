/**
 * 盤の項目表示まわりの小ヘルパ(#H7 分解で共有化)。ApproveClient と詳細パネル/各 View で使う。
 */

import type { Choice, PendingItem } from "./types";

// 修正処理中(再依頼不可・承認排他の対象)の状態。
const REVISE_BUSY_STATUSES = ["依頼中", "処理中", "提示中"];

export function isReviseBusy(status: string | undefined): boolean {
  return REVISE_BUSY_STATUSES.includes(status ?? "なし");
}

export const KIND_BADGE: Record<PendingItem["kind"], string> = {
  proposal: "📋 施策",
  idea: "📝 記事",
};

// #275: 一覧は高密度行。未処理=通常枠 / 処理済み=細い行 / 失敗=赤枠。
// #proto ダーク: 白背景を撤廃し var(--p-*) トークンへ。処理済みはより沈むトーン、失敗は赤弱。
// 幅は行が親ペインに収まるよう w-full min-w-0(横オーバーフロー防止)。
export function rowClass(choice: Choice | undefined, failed: boolean): string {
  const base =
    "w-full min-w-0 rounded-lg border transition-colors border-[var(--p-border)]";
  if (failed) return `${base} border-[var(--p-red)] bg-[var(--p-red-weak)] p-3`;
  if (choice) return `${base} bg-[var(--p-bg-elevated)] px-3 py-2`;
  return `${base} bg-[var(--p-bg-raised)] p-3`;
}
