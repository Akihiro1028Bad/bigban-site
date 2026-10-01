/** 台帳の行から DAISUKE CLASS の開催回・参加記録・人を組み立てる。 */
import { classOf, isDaisuke } from "./classify";
import { recordKeyOf, resolvePersonKey, sessionKeyOf } from "./identity";
import type { ClassRecord, LedgerRow, Person, Session } from "./types";

export interface Attendance {
  sessions: Session[];
  records: ClassRecord[];
  people: Person[];
  /** イベント名が空のイベント予約の数(集計の対象外)。 */
  missingEventName: number;
}

function timeOf(row: LedgerRow): string {
  return sessionKeyOf(row.date, row.startTime);
}

function buildSessions(rows: readonly LedgerRow[]): Session[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) groups.set(timeOf(row), [...(groups.get(timeOf(row)) ?? []), row]);
  return [...groups.entries()]
    .map(([key, group]) => {
      // 代表は予約番号が最小の行(有効な予約があればその中から)。入力の順序で開催回の情報が変わらないようにする。
      const ordered = [...group].sort((a, b) => a.reservationNo.localeCompare(b.reservationNo, "ja", { numeric: true }));
      const representative = ordered.find((row) => !row.isCancelled) ?? ordered[0];
      return {
        key,
        date: representative.date,
        startTime: representative.startTime,
        classType: classOf(representative.eventName),
        eventName: representative.eventName,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function groupRecords(rows: readonly LedgerRow[], sessions: readonly Session[], aliasMap: ReadonlyMap<string, string>): ClassRecord[] {
  const sessionByKey = new Map(sessions.map((session) => [session.key, session]));
  const byKey = new Map<string, ClassRecord>();
  for (const row of rows) {
    const session = sessionByKey.get(timeOf(row)) as Session;
    const personKey = resolvePersonKey(row.name, aliasMap);
    const key = recordKeyOf(session.key, personKey);
    const current = byKey.get(key);
    byKey.set(key, {
      key,
      sessionKey: session.key,
      date: session.date,
      startTime: session.startTime,
      classType: session.classType,
      personKey,
      reservationNos: [...(current?.reservationNos ?? []), row.reservationNo].sort(),
      status: !row.isCancelled || current?.status === "申込" ? "申込" : "キャンセル",
      ordinal: null,
    });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function assignOrdinals(records: readonly ClassRecord[], absentKeys: ReadonlySet<string>): ClassRecord[] {
  const counts = new Map<string, number>();
  return records.map((record) => {
    if (record.status !== "申込" || absentKeys.has(record.key)) return record;
    const ordinal = (counts.get(record.personKey) ?? 0) + 1;
    counts.set(record.personKey, ordinal);
    return { ...record, ordinal };
  });
}

/** 表示名は最新の有効な予約の表記。有効な予約がなければ最初の予約の表記。 */
function buildPeople(rows: readonly LedgerRow[], aliasMap: ReadonlyMap<string, string>): Person[] {
  const latest = new Map<string, LedgerRow>();
  for (const row of [...rows].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))) {
    const key = resolvePersonKey(row.name, aliasMap);
    if (!row.isCancelled || !latest.has(key)) latest.set(key, row);
  }
  return [...latest.entries()]
    .map(([key, row]) => ({ key, displayName: row.name }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function buildAttendance(input: {
  rows: readonly LedgerRow[];
  aliasMap: ReadonlyMap<string, string>;
  absentKeys: ReadonlySet<string>;
}): Attendance {
  const events = input.rows.filter((row) => row.kind === "イベント");
  const daisuke = events.filter((row) => isDaisuke(row.eventName));
  const sessions = buildSessions(daisuke);
  return {
    sessions,
    records: assignOrdinals(groupRecords(daisuke, sessions, input.aliasMap), input.absentKeys),
    people: buildPeople(daisuke, input.aliasMap),
    missingEventName: events.filter((row) => row.eventName === "").length,
  };
}
