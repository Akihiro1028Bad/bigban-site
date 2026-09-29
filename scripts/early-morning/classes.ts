/** 開催回のクラス(火曜=初中級、木曜=中級以上)に関する小さな道具。 */
import { CLASS_BY_WEEKDAY } from "./config";
import type { ClassKey, SessionClass } from "./types";

export const CLASS_WEEKDAY_LABEL: Readonly<Record<ClassKey, string>> = { 初中級: "火", 中級以上: "木" };

export const CLASS_KEYS: readonly ClassKey[] = ["初中級", "中級以上"];

/** `YYYY-MM-DD` の曜日から開催回のクラスを決める。該当なしは「その他」。 */
export function classOfDate(date: string): SessionClass {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return CLASS_BY_WEEKDAY[weekday] ?? "その他";
}

/** もう一方のクラス。 */
export function otherClass(key: ClassKey): ClassKey {
  return key === "初中級" ? "中級以上" : "初中級";
}
