/** 両経路の申込を開催回・人・参加記録にまとめ、人ごとの回次を採番する。 */
import { isoDatePart } from "./dates";
import { buildLinkMap, normalizeName, recordKey, resolveLbKey, tbKey } from "./identity";
import type {
  AttendanceRecord,
  LbReservation,
  NameLink,
  Person,
  RecordStatus,
  Route,
  Session,
  TbEventDetail,
} from "./types";

export interface AttendanceInput {
  events: readonly TbEventDetail[];
  reservations: readonly LbReservation[];
  links: readonly NameLink[];
  absentKeys: ReadonlySet<string>;
}

export interface AttendanceResult {
  sessions: Session[];
  people: Person[];
  records: AttendanceRecord[];
  unmatchedReservations: number;
}

type Origin = "テニスベア" | "LaBOLA";

interface Entry {
  date: string;
  personKey: string;
  origin: Origin;
  status: RecordStatus;
  appliedAt: string | null;
  source: string;
}

function buildSessions(events: readonly TbEventDetail[]): Session[] {
  const byDate = new Map<string, TbEventDetail[]>();
  for (const event of events) {
    const date = isoDatePart(event.startAt);
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      tbEventIds: list.map((event) => event.id).sort((a, b) => a - b),
      isCallOff: list.every((event) => event.isCallOff),
    }));
}

function routeOf(origins: ReadonlySet<Origin>): Route {
  if (origins.size === 2) return "両方";
  return origins.has("LaBOLA") ? "LaBOLA" : "テニスベア";
}

function mergeEntries(entries: readonly Entry[]): AttendanceRecord {
  const { date, personKey } = entries[0];
  const applied = entries.filter((entry) => entry.status === "申込");
  const status: RecordStatus = applied.length > 0 ? "申込" : "キャンセル";
  const basis = applied.length > 0 ? applied : entries;
  const appliedTimes = entries.map((entry) => entry.appliedAt).filter((at): at is string => at !== null).sort();
  return {
    key: recordKey(date, personKey),
    date,
    personKey,
    route: routeOf(new Set(basis.map((entry) => entry.origin))),
    appliedAt: appliedTimes[0] ?? null,
    status,
    sources: [...new Set(entries.map((entry) => entry.source))].sort(),
    ordinal: null,
  };
}

function assignOrdinals(records: AttendanceRecord[], absentKeys: ReadonlySet<string>): AttendanceRecord[] {
  const counters = new Map<string, number>();
  return records.map((record) => {
    if (record.status !== "申込" || absentKeys.has(record.key)) return record;
    const ordinal = (counters.get(record.personKey) ?? 0) + 1;
    counters.set(record.personKey, ordinal);
    return { ...record, ordinal };
  });
}

export function buildAttendance(input: AttendanceInput): AttendanceResult {
  const sessions = buildSessions(input.events);
  const activeDates = new Set(sessions.filter((session) => !session.isCallOff).map((session) => session.date));
  const people = new Map<string, Person>();
  const entries: Entry[] = [];

  const sortedEvents = [...input.events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  for (const event of sortedEvents) {
    if (event.isCallOff) continue;
    const date = isoDatePart(event.startAt);
    for (const participant of event.participants) {
      if (participant.isGuest) continue;
      const key = tbKey(participant.userId);
      const existing = people.get(key);
      people.set(key, { key, displayName: participant.name, tbId: participant.userId, lbName: existing?.lbName ?? null });
      entries.push({
        date,
        personKey: key,
        origin: "テニスベア",
        status: participant.status === "APPROVE" ? "申込" : "キャンセル",
        appliedAt: participant.appliedAt,
        source: `tb:${event.id}`,
      });
    }
  }

  const linkMap = buildLinkMap(input.links);
  for (const link of input.links) {
    const person = people.get(tbKey(link.tbId));
    if (person) people.set(person.key, { ...person, lbName: link.lbName });
  }

  let unmatchedReservations = 0;
  for (const reservation of input.reservations) {
    if (!activeDates.has(reservation.date)) {
      unmatchedReservations += 1;
      continue;
    }
    const key = resolveLbKey(reservation.name, linkMap);
    if (!people.has(key)) {
      const linkedTbId = linkMap.get(normalizeName(reservation.name)) ?? null;
      people.set(key, { key, displayName: reservation.name, tbId: linkedTbId, lbName: reservation.name });
    }
    entries.push({
      date: reservation.date,
      personKey: key,
      origin: "LaBOLA",
      status: reservation.isCancelled ? "キャンセル" : "申込",
      appliedAt: reservation.receivedAt,
      source: `lb:${reservation.reservationNo}`,
    });
  }

  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = recordKey(entry.date, entry.personKey);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  const records = [...grouped.values()]
    .map(mergeEntries)
    .sort((a, b) => a.date.localeCompare(b.date) || a.personKey.localeCompare(b.personKey));

  return {
    sessions,
    people: [...people.values()],
    records: assignOrdinals(records, input.absentKeys),
    unmatchedReservations,
  };
}
