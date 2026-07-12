/**
 * TopBar 段階セグメント定義と approve view のカード絞り込み(#proto P1)。DOM 非依存。
 */

import { isActionable } from "./board";
import type { ShellSegmentKey } from "./boardShellStats";
import type { PendingItem } from "./types";

export interface ShellSegment {
  key: ShellSegmentKey;
  label: string;
}

export const SHELL_SEGMENTS: readonly ShellSegment[] = [
  { key: "all", label: "すべて" },
  { key: "awaiting", label: "あなた待ち" },
  { key: "generating", label: "生成中" },
  { key: "published", label: "公開済み" },
];

/** approve view のカードが現在のセグメントに合致するか。 */
export function matchesSegment(
  item: PendingItem,
  segment: ShellSegmentKey,
  decided: Record<string, string | undefined>,
): boolean {
  if (segment === "all") return true;
  if (segment === "awaiting") return isActionable(item, decided);
  if (segment === "generating") return item.stage === "generating";
  return item.stage === "published";
}
