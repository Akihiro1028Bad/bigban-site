/** 参加の判定・状態・週連続・人ごとの集計。基準は config.ts の RULES。 */
import { addDays, daysBetween } from "../early-morning/dates";
import { RULES } from "./config";
import type { ClassRecord, ClassType, Person, PersonState, PersonStats } from "./types";

const DAYS_PER_WEEK = 7;

/** 参加として数える記録(申込で、欠席でないので回次がある)。 */
export function isParticipation(record: ClassRecord): boolean {
  return record.status === "申込" && record.ordinal !== null;
}

/** past は今日までの参加(日時順)。優先順: ご無沙汰 > 常連 > 新顔 > 通常。 */
export function stateOf(past: readonly ClassRecord[], today: string): PersonState {
  const lastDate = past.at(-1)?.date;
  if (past.length >= RULES.dormantMinTotal && lastDate !== undefined && daysBetween(lastDate, today) >= RULES.dormantDays) {
    return "ご無沙汰";
  }
  const recent = past.filter((record) => daysBetween(record.date, today) < RULES.recentDays).length;
  if (recent >= RULES.regularMin) return "常連";
  if (past.length <= RULES.newMaxTotal) return "新顔";
  return "通常";
}

export function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % DAYS_PER_WEEK));
}

/** 今週を含めず、先週から遡って参加がある週(月曜始まり)が続いた数。dates は今日より前の参加日。 */
export function weekStreak(dates: readonly string[], today: string): number {
  const weeks = new Set(dates.map(mondayOf));
  let streak = 0;
  for (let monday = addDays(mondayOf(today), -DAYS_PER_WEEK); weeks.has(monday); monday = addDays(monday, -DAYS_PER_WEEK)) {
    streak += 1;
  }
  return streak;
}

export function countByClass(records: readonly ClassRecord[]): Record<ClassType, number> {
  return {
    ビギナー: records.filter((record) => record.classType === "ビギナー").length,
    通常: records.filter((record) => record.classType === "通常").length,
    ダブルス: records.filter((record) => record.classType === "ダブルス").length,
  };
}

export function computeStats(input: {
  people: readonly Person[];
  records: readonly ClassRecord[];
  today: string;
  historyByPerson: ReadonlyMap<string, string>;
}): PersonStats[] {
  return input.people.map((person) => {
    const own = input.records.filter((record) => record.personKey === person.key);
    const past = own.filter((record) => isParticipation(record) && record.date <= input.today);
    return {
      key: person.key,
      displayName: person.displayName,
      total: past.length,
      classCounts: countByClass(past),
      firstDate: past[0]?.date ?? null,
      lastDate: past.at(-1)?.date ?? null,
      state: stateOf(past, input.today),
      isNextApplied: own.some((record) => record.status === "申込" && record.date >= input.today),
      history: input.historyByPerson.get(person.key) ?? "",
    };
  });
}
