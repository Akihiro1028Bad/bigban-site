/** 早朝リピーター集計の1回分の実行。失敗時は橋渡しページを「失敗」にしてから例外を投げ直す。 */
import type { FetchFn } from "../growth/http";
import { buildAttendance } from "./attendance";
import { EARLY_START_TIME, FETCH_INTERVAL_MS } from "./config";
import { jstDate, jstDateTime } from "./dates";
import { fetchEarlyReservations } from "./ledger";
import { buildFlexMessage, selectLineEntries } from "./lineMessage";
import { buildLineNotes } from "./lineNotes";
import { computeStats, findNextSession } from "./metrics";
import type { NotionClient } from "./notionClient";
import {
  deriveAbsentKeys,
  deriveLinks,
  markBridgeFailed,
  readNotionState,
  syncPeople,
  syncRecords,
  syncSessions,
  writeBridge,
  type NotionIdsLike,
  type WriteCounts,
} from "./notionSync";
import { fetchEarlyEventDetails } from "./tennisbear";

export interface SyncDeps {
  notion: NotionClient;
  fetchFn: FetchFn;
  sleep: (ms: number) => Promise<void>;
  now: Date;
  ids: NotionIdsLike & { ledgerDb: string; peopleDbUrl: string };
}

export interface SyncSummary {
  events: number;
  sessions: number;
  people: number;
  records: number;
  unmatchedReservations: number;
  ignoredStatuses: number;
  writes: WriteCounts;
  nextDate: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function step<T>(deps: SyncDeps, label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await markBridgeFailed(deps.notion, deps.ids.bridgePage, `${label}: ${messageOf(error)}`, jstDateTime(deps.now)).catch(
      () => undefined,
    );
    throw error;
  }
}

function addCounts(...all: WriteCounts[]): WriteCounts {
  return all.reduce(
    (sum, counts) => ({
      created: sum.created + counts.created,
      updated: sum.updated + counts.updated,
      archived: sum.archived + counts.archived,
    }),
    { created: 0, updated: 0, archived: 0 },
  );
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const today = jstDate(deps.now);
  const updatedAt = jstDateTime(deps.now);
  const { notion, ids } = deps;

  const state = await step(deps, "Notion読み取り", () => readNotionState(notion, ids));
  const events = await step(deps, "テニスベア", () =>
    fetchEarlyEventDetails({ fetchFn: deps.fetchFn, sleep: deps.sleep, intervalMs: FETCH_INTERVAL_MS }),
  );
  const reservations = await step(deps, "予約台帳", () => fetchEarlyReservations(notion, ids.ledgerDb));

  const links = deriveLinks(state.people);
  const absentKeys = deriveAbsentKeys(state.records, links);
  const attendance = buildAttendance({ events, reservations, links, absentKeys });
  const stats = computeStats({ people: attendance.people, records: attendance.records, sessions: attendance.sessions, today });
  const next = findNextSession(attendance.sessions, today);
  const peopleByKey = new Map(attendance.people.map((person) => [person.key, person]));

  const writes = await step(deps, "Notion書き込み", async () => {
    const sessionCounts = await syncSessions(notion, ids, attendance.sessions, attendance.records, state.sessions);
    const people = await syncPeople(notion, ids, stats, state.people, links);
    const recordCounts = await syncRecords(notion, ids, attendance.records, people.pageIdByKey, state.records, links, absentKeys);
    await writeBridge(notion, ids.bridgePage, {
      nextDate: next?.date ?? null,
      updatedAt,
      status: "ok",
      failure: null,
      flex: next
        ? buildFlexMessage({
            sessionDate: next.date,
            startTime: EARLY_START_TIME,
            classLabel: next.classType === "その他" ? null : next.classType,
            entries: selectLineEntries(
              next,
              attendance.records,
              peopleByKey,
              buildLineNotes({ session: next, records: attendance.records, sessions: attendance.sessions }),
            ),
            updatedAt,
            notionUrl: ids.peopleDbUrl,
          })
        : null,
    });
    return addCounts(sessionCounts, people.counts, recordCounts);
  });

  return {
    events: events.length,
    sessions: attendance.sessions.length,
    people: attendance.people.length,
    records: attendance.records.length,
    unmatchedReservations: attendance.unmatchedReservations,
    ignoredStatuses: events.reduce((sum, event) => sum + event.ignoredStatusCount, 0),
    writes,
    nextDate: next?.date ?? null,
  };
}
