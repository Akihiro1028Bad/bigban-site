/** 人ごとの累計・連続・クラス別の値・状態・節目を開催回単位で計算する。 */
import { addDays } from "./dates";
import { computeClassStats, isClassDormant, isClassRegular } from "./classStats";
import type { ClassStats } from "./classStats";
import { MILESTONES, MILESTONE_STEP_AFTER_LAST, RULES } from "./config";
import type { AttendanceRecord, ClassKey, Person, PersonState, PersonStats, Session } from "./types";

const LAST_FIXED = MILESTONES[MILESTONES.length - 1];

function milestoneAt(index: number): number {
  return index < MILESTONES.length ? MILESTONES[index] : LAST_FIXED + (index - MILESTONES.length + 1) * MILESTONE_STEP_AFTER_LAST;
}

export function milestonesUpTo(total: number): number[] {
  const reached: number[] = [];
  for (let index = 0; milestoneAt(index) <= total; index += 1) reached.push(milestoneAt(index));
  return reached;
}

export function nextMilestone(total: number): number {
  return milestoneAt(milestonesUpTo(total).length);
}

export function findNextSession(sessions: readonly Session[], today: string): Session | null {
  return sessions.find((session) => !session.isCallOff && session.date > today) ?? null;
}

/** 状態は設計書14.2の順。参加しているクラス(初中級/中級以上)だけを見る。 */
function stateOf(total: number, byClass: Readonly<Record<ClassKey, ClassStats>>): PersonState {
  const active = [byClass.初中級, byClass.中級以上].filter((stats) => stats.attended > 0);
  if (active.length > 0 && active.every(isClassDormant)) return "ご無沙汰";
  if (active.some(isClassRegular)) return "常連";
  if (total <= RULES.newMaxTotal) return "新顔";
  return "通常";
}

export function computeStats(input: {
  people: readonly Person[];
  records: readonly AttendanceRecord[];
  sessions: readonly Session[];
  today: string;
}): PersonStats[] {
  const held = input.sessions
    .filter((session) => !session.isCallOff && session.date <= input.today)
    .map((session) => session.date);
  const before = addDays(input.today, 1);
  const next = findNextSession(input.sessions, input.today);

  const stats = input.people.map((person): PersonStats => {
    const mine = input.records.filter((record) => record.personKey === person.key);
    const attended = new Set(
      mine.filter((record) => record.ordinal !== null && record.date <= input.today).map((record) => record.date),
    );
    const dates = [...attended].sort();
    const total = dates.length;
    const lastDate = dates[total - 1] ?? null;
    let streak = 0;
    for (let index = held.length - 1; index >= 0 && attended.has(held[index]); index -= 1) streak += 1;
    const classStatsOf = (classKey: ClassKey): ClassStats =>
      computeClassStats({ personKey: person.key, records: input.records, sessions: input.sessions, classKey, before });
    const byClass: Record<ClassKey, ClassStats> = { 初中級: classStatsOf("初中級"), 中級以上: classStatsOf("中級以上") };
    const upcoming = nextMilestone(total);
    return {
      ...person,
      total,
      streak,
      classCounts: { 初中級: byClass.初中級.attended, 中級以上: byClass.中級以上.attended },
      firstDate: dates[0] ?? null,
      lastDate,
      state: stateOf(total, byClass),
      nextMilestone: `あと${upcoming - total}回で${upcoming}回`,
      reachedMilestones: milestonesUpTo(total),
      isNextApplied: next !== null && mine.some((record) => record.date === next.date && record.status === "申込"),
    };
  });

  return stats.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
