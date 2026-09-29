/** LINE の所見(設計書 §11 の6ルール)。今日の回を含まない過去の参加だけで、決まった文言を作る。 */
import { daysBetween, formatMonthDay } from "../early-morning/dates";
import { CLASS_NOTE_LABELS, CLASS_ORDER, RULES } from "./config";
import { historyBefore } from "./history";
import { isParticipation, weekStreak } from "./metrics";
import type { ClassRecord, ClassType, LedgerRow } from "./types";

export const FIRST_TIME_NOTE = "初めての方。声かけをお願いします";
export const NO_HISTORY_NOTE = "施設の利用も初めて";

function mostFrequentClass(prior: readonly ClassRecord[]): { classType: ClassType; count: number } {
  return CLASS_ORDER.map((classType) => ({ classType, count: prior.filter((record) => record.classType === classType).length })).reduce(
    (best, current) => (current.count > best.count ? current : best),
  );
}

/** prior は今日より前の参加(日時順)。 */
export function noteFor(input: { classType: ClassType; prior: readonly ClassRecord[]; today: string; history: string }): string[] {
  const { prior, today } = input;
  if (prior.length === 0) {
    return [FIRST_TIME_NOTE, input.history === "" ? NO_HISTORY_NOTE : `これまで: ${input.history}`];
  }
  if (!prior.some((record) => record.classType === input.classType)) {
    const previous = mostFrequentClass(prior);
    return [`${CLASS_NOTE_LABELS[input.classType]}は初めて(${CLASS_NOTE_LABELS[previous.classType]}${previous.count}回)`];
  }
  if (prior.length === 1) return [`2回目(初参加 ${formatMonthDay(prior[0].date)})`];
  const lastDate = prior[prior.length - 1].date;
  const last = `前回 ${formatMonthDay(lastDate)}`;
  if (daysBetween(lastDate, today) >= RULES.dormantDays) return [`久しぶり(${last})`];
  const streak = weekStreak(
    prior.map((record) => record.date),
    today,
  );
  if (streak >= RULES.streakMinWeeks) return [`${streak}週連続・${last}`];
  const recent = prior.filter((record) => daysBetween(record.date, today) < RULES.recentDays).length;
  return [`直近${RULES.recentDays}日で${recent}回・${last}`];
}

/** 今日の各参加記録(申込で欠席でない)の所見。キーは参加記録のキー。 */
export function buildNotes(input: {
  today: string;
  records: readonly ClassRecord[];
  historyIndex: ReadonlyMap<string, readonly LedgerRow[]>;
}): Map<string, string[]> {
  const participations = input.records.filter(isParticipation);
  return new Map(
    participations
      .filter((record) => record.date === input.today)
      .map((record) => [
        record.key,
        noteFor({
          classType: record.classType,
          prior: participations.filter((other) => other.personKey === record.personKey && other.date < input.today),
          today: input.today,
          history: historyBefore(input.historyIndex, record.personKey, input.today),
        }),
      ]),
  );
}
