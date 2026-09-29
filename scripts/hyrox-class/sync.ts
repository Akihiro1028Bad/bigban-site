/** HYROX DAISUKE CLASS 集計の1回分の実行。失敗時は橋渡しページを「失敗」にしてから例外を投げ直す。 */
import { addDays, jstDate, jstDateTime } from "../early-morning/dates";
import type { FlexMessage } from "../early-morning/lineMessage";
import type { NotionClient } from "../early-morning/notionClient";
import { markBridgeFailed, writeBridge, type WriteCounts } from "../early-morning/notionSync";
import { buildAttendance, type Attendance } from "./attendance";
import { buildHistoryIndex, historyBefore } from "./history";
import { buildAliasMap } from "./identity";
import { fetchLedgerRows } from "./ledger";
import { buildFlexMessage, selectEntries, type LineEntry } from "./lineMessage";
import { buildNotes } from "./lineNotes";
import { computeStats } from "./metrics";
import {
  deriveAbsentKeys,
  deriveAliasLinks,
  readHyroxState,
  syncPeople,
  syncRecords,
  syncSessions,
  type HyroxNotionIds,
} from "./notionSync";
import type { LedgerRow, Session } from "./types";

export interface SyncDeps {
  notion: NotionClient;
  now: Date;
  ids: HyroxNotionIds & { ledgerDb: string; peopleDbUrl: string };
}

export interface SyncSummary {
  sessions: number;
  people: number;
  records: number;
  todaySessions: number;
  skippedRows: number;
  missingEventName: number;
  writes: WriteCounts;
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

/** 今日の回のうち、申込(欠席でない)が1人以上いる回と、その参加者。 */
function todayItems(
  attendance: Attendance,
  today: string,
  historyIndex: ReadonlyMap<string, readonly LedgerRow[]>,
): { session: Session; entries: LineEntry[] }[] {
  const notes = buildNotes({ today, records: attendance.records, historyIndex });
  const people = new Map(attendance.people.map((person) => [person.key, person]));
  return attendance.sessions
    .filter((session) => session.date === today)
    .map((session) => ({ session, entries: selectEntries(session, attendance.records, people, notes) }))
    .filter((item) => item.entries.length > 0);
}

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const today = jstDate(deps.now);
  const updatedAt = jstDateTime(deps.now);
  const { notion, ids } = deps;

  const ledger = await step(deps, "予約台帳", () => fetchLedgerRows(notion, ids.ledgerDb));
  // スタッフ入力を古いスナップショットで上書きしないよう、台帳の取得のあと(書き込みの直前)に読む。
  const state = await step(deps, "Notion読み取り", () => readHyroxState(notion, ids));

  const aliasMap = buildAliasMap(deriveAliasLinks(state.people));
  const absentKeys = deriveAbsentKeys(state.records, aliasMap);
  const attendance = buildAttendance({ rows: ledger.rows, aliasMap, absentKeys });
  const historyIndex = buildHistoryIndex(ledger.rows, aliasMap);
  const tomorrow = addDays(today, 1);
  const stats = computeStats({
    people: attendance.people,
    records: attendance.records,
    today,
    historyByPerson: new Map(attendance.people.map((person) => [person.key, historyBefore(historyIndex, person.key, tomorrow)])),
  });
  const items = todayItems(attendance, today, historyIndex);
  const flex: FlexMessage | null =
    items.length > 0 ? buildFlexMessage({ date: today, sessions: items, updatedAt, notionUrl: ids.peopleDbUrl }) : null;

  const writes = await step(deps, "Notion書き込み", async () => {
    const sessionCounts = await syncSessions(notion, ids, attendance.sessions, attendance.records, state.sessions);
    const people = await syncPeople(notion, ids, stats, state.people, aliasMap);
    const recordCounts = await syncRecords(notion, ids, attendance.records, people.pageIdByKey, state.records, aliasMap, absentKeys);
    await writeBridge(notion, ids.bridgePage, { nextDate: flex ? today : null, updatedAt, status: "ok", failure: null, flex });
    return addCounts(sessionCounts, people.counts, recordCounts);
  });

  return {
    sessions: attendance.sessions.length,
    people: attendance.people.length,
    records: attendance.records.length,
    todaySessions: items.length,
    skippedRows: ledger.skipped,
    missingEventName: attendance.missingEventName,
    writes,
  };
}
