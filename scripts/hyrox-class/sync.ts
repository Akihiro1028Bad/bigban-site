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
import { computeStats, isParticipation } from "./metrics";
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
  /** 橋渡しに置いた通知日(今日以降で LINE に載せる回がある最初の開催日)。なければ null。 */
  nextDate: string | null;
  /** nextDate の日の、LINE に載せる回の数。 */
  nextSessions: number;
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

interface NextItem {
  session: Session;
  entries: LineEntry[];
}

/** 今日以降で、参加者(欠席でない申込)が1人以上いる最初の開催日。 */
function nextNotifyDate(attendance: Attendance, today: string): string | null {
  const dates = attendance.records.filter((record) => isParticipation(record) && record.date >= today).map((record) => record.date);
  return dates.sort()[0] ?? null;
}

/** date の日の回のうち参加者がいる回と、その参加者。所見は date を「今日」として作る。 */
function itemsOn(attendance: Attendance, date: string, historyIndex: ReadonlyMap<string, readonly LedgerRow[]>): NextItem[] {
  const notes = buildNotes({ today: date, records: attendance.records, historyIndex });
  const people = new Map(attendance.people.map((person) => [person.key, person]));
  return attendance.sessions
    .filter((session) => session.date === date)
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

  const { attendance, aliasMap, absentKeys, stats, nextDate, items } = await step(deps, "集計", async () => {
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
    // 通知するのは「今日以降で最初の開催日」の分。前日の集計で翌日分を置いておけば、当日朝の集計が失敗しても前日分が警告付きで送られる。
    const nextDate = nextNotifyDate(attendance, today);
    const items = nextDate === null ? [] : itemsOn(attendance, nextDate, historyIndex);
    return { attendance, aliasMap, absentKeys, stats, nextDate, items };
  });
  const flex: FlexMessage | null =
    nextDate !== null ? buildFlexMessage({ date: nextDate, sessions: items, updatedAt, notionUrl: ids.peopleDbUrl }) : null;

  const writes = await step(deps, "Notion書き込み", async () => {
    const sessionCounts = await syncSessions(notion, ids, attendance.sessions, attendance.records, state.sessions);
    const people = await syncPeople(notion, ids, stats, state.people, aliasMap);
    const recordCounts = await syncRecords(notion, ids, attendance.records, people.pageIdByKey, state.records, aliasMap, absentKeys);
    await writeBridge(notion, ids.bridgePage, { nextDate, updatedAt, status: "ok", failure: null, flex });
    return addCounts(sessionCounts, people.counts, recordCounts);
  });

  return {
    sessions: attendance.sessions.length,
    people: attendance.people.length,
    records: attendance.records.length,
    nextDate,
    nextSessions: items.length,
    skippedRows: ledger.skipped,
    missingEventName: attendance.missingEventName,
    writes,
  };
}
