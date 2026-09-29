/** 前夜 LINE の各参加者に付ける所見。決まった文言だけで作り、翌日の回を含まない過去のデータから決める。 */
import { CLASS_WEEKDAY_LABEL, otherClass } from "./classes";
import { computeClassStats, isClassDormant, isClassRegular, isPerfect } from "./classStats";
import type { ClassStats } from "./classStats";
import { NOTE_LONG_GAP_DAYS } from "./config";
import { daysBetween, formatMonthDay } from "./dates";
import type { AttendanceRecord, ClassKey, Session } from "./types";

const SEPARATOR = "・";
const STREAK_NOTE_MIN = 3;

type ClassKind = "first" | "perfect" | "dormant" | "plain";

function classify(stats: ClassStats): ClassKind {
  if (stats.attended === 0) return "first";
  if (isPerfect(stats)) return "perfect";
  return isClassDormant(stats) ? "dormant" : "plain";
}

function classSummary(kind: ClassKind, weekday: string, stats: ClassStats): string {
  if (kind === "first") return `${weekday}曜は初参加`;
  if (kind === "perfect") return `${weekday}曜 皆勤（${formatMonthDay(stats.firstDate as string)}から${stats.attended}回連続）`;
  if (kind === "dormant") return `久しぶり（${weekday}曜は${formatMonthDay(stats.lastDate as string)}以来）`;
  return `${weekday}曜 ${stats.heldSinceFirst}回中${stats.attended}回`;
}

/** 1つ目に続ける一言。連続 > もう一方の常連 > 最終参加からの空きの順で、最大1つ。 */
function followUp(input: { kind: ClassKind; stats: ClassStats; other: ClassStats; otherWeekday: string; sessionDate: string }): string | null {
  const { kind, stats, other, otherWeekday, sessionDate } = input;
  if (kind === "plain" && stats.streak >= STREAK_NOTE_MIN) return `${stats.streak}回連続`;
  if (isClassRegular(other)) return `${otherWeekday}曜も常連`;
  if (kind !== "dormant" && stats.lastDate !== null && daysBetween(stats.lastDate, sessionDate) >= NOTE_LONG_GAP_DAYS) {
    return `前回 ${formatMonthDay(stats.lastDate)}`;
  }
  return null;
}

function classNote(input: {
  personKey: string;
  session: Session;
  classKey: ClassKey;
  records: readonly AttendanceRecord[];
  sessions: readonly Session[];
}): string {
  const { personKey, session, classKey, records, sessions } = input;
  const statsOf = (key: ClassKey) => computeClassStats({ personKey, records, sessions, classKey: key, before: session.date });
  const other = otherClass(classKey);
  const stats = statsOf(classKey);
  const kind = classify(stats);
  const weekday = CLASS_WEEKDAY_LABEL[classKey];
  const extra = followUp({ kind, stats, other: statsOf(other), otherWeekday: CLASS_WEEKDAY_LABEL[other], sessionDate: session.date });
  return [classSummary(kind, weekday, stats), extra].filter((part) => part !== null).join(SEPARATOR);
}

function noteFor(input: { record: AttendanceRecord; session: Session; records: readonly AttendanceRecord[]; sessions: readonly Session[] }): string {
  const { record, session, records, sessions } = input;
  if (record.ordinal === 1) return "初めての方。声かけをお願いします";
  if (record.ordinal === 2) {
    const firstDate = records
      .filter((other) => other.personKey === record.personKey && other.ordinal !== null)
      .reduce((earliest, other) => (other.date < earliest ? other.date : earliest), session.date);
    return `2回目（前回 ${formatMonthDay(firstDate)} が初参加）`;
  }
  if (session.classType === "その他") return "";
  return classNote({ personKey: record.personKey, session, classKey: session.classType, records, sessions });
}

/** 開催回 `session` に申込んでいる人ごとの所見(キーは人キー)。 */
export function buildLineNotes(input: {
  session: Session;
  records: readonly AttendanceRecord[];
  sessions: readonly Session[];
}): Map<string, string> {
  const { session, records, sessions } = input;
  return new Map(
    records
      .filter((record) => record.date === session.date && record.status === "申込" && record.ordinal !== null)
      .map((record) => [record.personKey, noteFor({ record, session, records, sessions })]),
  );
}
