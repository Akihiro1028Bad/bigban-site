/** イベント名からの判定(DAISUKE CLASS かどうか・クラス・利用歴の分類)。 */
import {
  DAISUKE_PATTERN,
  HYROX_COURT,
  HYROX_EVENT_FALLBACK,
  HYROX_EVENT_PATTERN,
  HYROX_SHORT_NAMES,
  PICKLE_COURTS,
} from "./config";
import type { ClassType, LedgerRow } from "./types";

export type HistoryCategory =
  | { kind: "HYROXイベント"; shortName: string }
  | { kind: "HYROXエリア貸切" }
  | { kind: "ピックル" };

export function isDaisuke(eventName: string): boolean {
  return DAISUKE_PATTERN.test(eventName);
}

export function classOf(eventName: string): ClassType {
  if (eventName.includes("ビギナー")) return "ビギナー";
  if (eventName.includes("ダブルス")) return "ダブルス";
  return "通常";
}

export function shortEventName(eventName: string): string {
  return HYROX_SHORT_NAMES.find((name) => eventName.includes(name)) ?? HYROX_EVENT_FALLBACK;
}

/** 利用歴の分類。DAISUKE CLASS・イベント名が空のイベント・分類できないスペースは null。 */
export function historyCategoryOf(row: LedgerRow): HistoryCategory | null {
  if (row.kind === "イベント") {
    if (row.eventName === "" || isDaisuke(row.eventName)) return null;
    return HYROX_EVENT_PATTERN.test(row.eventName)
      ? { kind: "HYROXイベント", shortName: shortEventName(row.eventName) }
      : { kind: "ピックル" };
  }
  if (row.court === HYROX_COURT) return { kind: "HYROXエリア貸切" };
  return row.court !== null && PICKLE_COURTS.includes(row.court) ? { kind: "ピックル" } : null;
}
