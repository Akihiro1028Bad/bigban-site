/** 火曜(初中級)・木曜(中級以上)のクラスごとに、その人の参加状況を数える。 */
import { CLASS_RULES } from "./config";
import type { AttendanceRecord, ClassKey, Session } from "./types";

export interface ClassStats {
  attended: number;
  /** 初参加日以降の、そのクラスの開催数(参加なしなら 0)。 */
  heldSinceFirst: number;
  /** そのクラスの最新の開催回から遡った連続参加数。 */
  streak: number;
  /** そのクラスの最新 `CLASS_RULES.recentWindow` 回のうちの参加数。 */
  recentAttended: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 最終参加日より後の、そのクラスの開催数。 */
  missedSinceLast: number;
}

/** `before`(この日は含まない)より前の、そのクラスの開催済みの回だけで数える。 */
export function computeClassStats(input: {
  personKey: string;
  records: readonly AttendanceRecord[];
  sessions: readonly Session[];
  classKey: ClassKey;
  before: string;
}): ClassStats {
  const held = input.sessions
    .filter((session) => !session.isCallOff && session.classType === input.classKey && session.date < input.before)
    .map((session) => session.date)
    .sort();
  const attendedDates = new Set(
    input.records
      .filter((record) => record.personKey === input.personKey && record.ordinal !== null)
      .map((record) => record.date),
  );
  const attendedHeld = held.filter((date) => attendedDates.has(date));
  const firstDate = attendedHeld[0] ?? null;
  const lastDate = attendedHeld[attendedHeld.length - 1] ?? null;

  let streak = 0;
  for (let index = held.length - 1; index >= 0 && attendedDates.has(held[index]); index -= 1) streak += 1;

  return {
    attended: attendedHeld.length,
    heldSinceFirst: firstDate === null ? 0 : held.filter((date) => date >= firstDate).length,
    streak,
    recentAttended: held.slice(-CLASS_RULES.recentWindow).filter((date) => attendedDates.has(date)).length,
    firstDate,
    lastDate,
    missedSinceLast: lastDate === null ? 0 : held.filter((date) => date > lastDate).length,
  };
}

export function isClassRegular(stats: ClassStats): boolean {
  return stats.recentAttended >= CLASS_RULES.regularMin;
}

export function isClassDormant(stats: ClassStats): boolean {
  return stats.attended >= CLASS_RULES.dormantMinTotal && stats.missedSinceLast >= CLASS_RULES.dormantMisses;
}

export function isPerfect(stats: ClassStats): boolean {
  return stats.attended >= CLASS_RULES.perfectMin && stats.attended === stats.heldSinceFirst;
}
