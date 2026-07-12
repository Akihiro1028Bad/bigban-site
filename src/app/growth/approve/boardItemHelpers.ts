/**
 * 盤の項目表示まわりの小ヘルパ(#H7 分解で共有化)。ApproveClient と詳細パネル/各 View で使う。
 */

import type { PendingItem } from "./types";

// 修正処理中(再依頼不可・承認排他の対象)の状態。
const REVISE_BUSY_STATUSES = ["依頼中", "処理中", "提示中"];

export function isReviseBusy(status: string | undefined): boolean {
  return REVISE_BUSY_STATUSES.includes(status ?? "なし");
}

export const KIND_BADGE: Record<PendingItem["kind"], string> = {
  proposal: "📋 施策",
  idea: "📝 記事",
};

// #211/#213: proto Board のフラット横並び行。箱(角丸/border/bg)・段階アクセント左境界・
// 縦積み(display:block)を撤去し、外側 li(hover/active/rail/px-4 py-[11px])に乗る
// 透明なフラット横並びへ一本化する。チェック/アイキャッチ/本文列が横に並ぶ。
// 決定済みの淡色はタイトル色(--p-text-2 in BoardCard)が担うため choice で分岐しない。
// 幅は行が親ペインに収まるよう w-full min-w-0(横オーバーフロー防止)。padding は外側 li が担当。
export function rowClass(): string {
  return "flex w-full min-w-0 items-start gap-3";
}
