/**
 * Notion の早朝4オブジェクトの読み取りと差分書き込み。
 * スタッフ入力列(リワード済み・メモ・出欠)は、統合時の和集合・空欄補完と欠席の書き写しを除いて書かない。
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeName, personKeyOfRecordKey, recordKey, tbKey } from "./identity";
import type { FlexMessage } from "./lineMessage";
import type { NotionClient } from "./notionClient";
import { chunkText, prop, readMultiSelect, readNumber, readPlainText, readSelect } from "./notionProps";
import type { AttendanceRecord, NameLink, PersonStats, Session } from "./types";

export interface NotionIdsLike {
  peopleDb: string;
  recordsDb: string;
  sessionsDb: string;
  bridgePage: string;
}

export interface PeopleRow {
  pageId: string;
  key: string;
  tbId: number | null;
  lbName: string | null;
  rewarded: string[];
  memo: string;
  hash: string;
}

export interface RecordRow {
  pageId: string;
  key: string;
  date: string;
  personKey: string;
  status: string | null;
  isAbsent: boolean;
  hash: string;
}

export interface SessionRow {
  pageId: string;
  date: string;
  hash: string;
}

export interface NotionState {
  people: PeopleRow[];
  records: RecordRow[];
  sessions: SessionRow[];
}

export interface WriteCounts {
  created: number;
  updated: number;
  archived: number;
}

export interface BridgePayload {
  nextDate: string | null;
  updatedAt: string;
  status: "ok" | "failed";
  failure: string | null;
  flex: FlexMessage | null;
}

const HASH = "同期ハッシュ";
const VANISHED = "元データになし";

export function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function emptyCounts(): WriteCounts {
  return { created: 0, updated: 0, archived: 0 };
}

export async function readNotionState(client: NotionClient, ids: NotionIdsLike): Promise<NotionState> {
  const [peoplePages, recordPages, sessionPages] = await Promise.all([
    client.queryAll(ids.peopleDb),
    client.queryAll(ids.recordsDb),
    client.queryAll(ids.sessionsDb),
  ]);
  return {
    people: peoplePages.map((page) => ({
      pageId: page.id,
      key: readPlainText(page, "識別子"),
      tbId: readNumber(page, "テニスベアID"),
      lbName: readPlainText(page, "LaBOLA氏名") || null,
      rewarded: readMultiSelect(page, "リワード済み"),
      memo: readPlainText(page, "メモ"),
      hash: readPlainText(page, HASH),
    })),
    records: recordPages.map((page) => {
      const key = readPlainText(page, "キー");
      return {
        pageId: page.id,
        key,
        date: key.slice(0, 10),
        personKey: personKeyOfRecordKey(key),
        status: readSelect(page, "状態"),
        isAbsent: readSelect(page, "出欠") === "欠席",
        hash: readPlainText(page, HASH),
      };
    }),
    sessions: sessionPages.map((page) => ({
      pageId: page.id,
      date: readPlainText(page, "開催日"),
      hash: readPlainText(page, HASH),
    })),
  };
}

export function deriveLinks(people: readonly PeopleRow[]): NameLink[] {
  return people
    .filter((row) => row.tbId !== null && row.lbName !== null)
    .map((row) => ({ tbId: row.tbId as number, lbName: row.lbName as string }));
}

function linkedNames(links: readonly NameLink[]): Map<string, number> {
  return new Map(links.map((link) => [normalizeName(link.lbName), link.tbId]));
}

/** lb: キーの人キーを対応表でテニスベアの人キーに寄せる。 */
function canonicalKey(personKey: string, names: ReadonlyMap<string, number>): string {
  if (!personKey.startsWith("lb:")) return personKey;
  const tbId = names.get(personKey.slice(3));
  return tbId === undefined ? personKey : tbKey(tbId);
}

export function deriveAbsentKeys(records: readonly RecordRow[], links: readonly NameLink[]): Set<string> {
  const names = linkedNames(links);
  return new Set(
    records.filter((row) => row.isAbsent).map((row) => recordKey(row.date, canonicalKey(row.personKey, names))),
  );
}

async function upsert(
  client: NotionClient,
  databaseId: string,
  properties: Record<string, unknown>,
  existing: { pageId: string; hash: string } | undefined,
  counts: WriteCounts,
): Promise<string> {
  const hash = hashOf(properties);
  if (!existing) {
    const page = await client.createPage(databaseId, { ...properties, [HASH]: prop.text(hash) });
    counts.created += 1;
    return page.id;
  }
  if (existing.hash !== hash) {
    await client.updatePage(existing.pageId, { ...properties, [HASH]: prop.text(hash) });
    counts.updated += 1;
  }
  return existing.pageId;
}

/** 同じキーの行が複数あれば最初の1つを残し、残りをアーカイブする。 */
async function archiveDuplicates<T extends { pageId: string }>(
  client: NotionClient,
  rows: readonly T[],
  keyOf: (row: T) => string,
  counts: WriteCounts,
): Promise<T[]> {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

export async function syncSessions(
  client: NotionClient,
  ids: NotionIdsLike,
  sessions: readonly Session[],
  records: readonly AttendanceRecord[],
  existing: readonly SessionRow[],
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, (row) => row.date, counts);
  const byDate = new Map(unique.map((row) => [row.date, row]));
  for (const session of sessions) {
    const applicants = records.filter((record) => record.date === session.date && record.status === "申込").length;
    await upsert(
      client,
      ids.sessionsDb,
      {
        開催日: prop.title(session.date),
        日付: prop.date(session.date),
        テニスベアイベントID: prop.text(session.tbEventIds.join(", ")),
        クラス: prop.select(session.classType),
        中止: prop.checkbox(session.isCallOff),
        申込数: prop.number(applicants),
      },
      byDate.get(session.date),
      counts,
    );
  }
  return counts;
}

function personProperties(stats: PersonStats, rewarded: readonly string[]): Record<string, unknown> {
  const reached = stats.reachedMilestones.map(String);
  return {
    表示名: prop.title(stats.displayName),
    識別子: prop.text(stats.key),
    テニスベアID: prop.number(stats.tbId),
    LaBOLA氏名: prop.text(stats.lbName),
    累計: prop.number(stats.total),
    直近8回: prop.number(stats.recent),
    連続: prop.number(stats.streak),
    初参加日: prop.date(stats.firstDate),
    最終参加日: prop.date(stats.lastDate),
    状態: prop.select(stats.state),
    次回申込: prop.checkbox(stats.isNextApplied),
    次の節目: prop.text(stats.nextMilestone),
    到達節目: prop.multiSelect(reached),
    未渡し節目: prop.multiSelect(reached.filter((milestone) => !rewarded.includes(milestone))),
  };
}

/**
 * 人の重複行(同じ識別子)をアーカイブする際、スタッフ入力列(リワード済み・メモ)を
 * 残す1行に引き継ぐ。一般的な archiveDuplicates と違い、値を捨てずに和集合・空欄補完する。
 */
async function archivePeopleDuplicates(
  client: NotionClient,
  rows: readonly PeopleRow[],
  counts: WriteCounts,
): Promise<PeopleRow[]> {
  const byKey = new Map<string, PeopleRow>();
  const kept: PeopleRow[] = [];
  for (const row of rows) {
    const current = byKey.get(row.key);
    if (!current) {
      byKey.set(row.key, row);
      kept.push(row);
      continue;
    }
    const rewarded = [...new Set([...current.rewarded, ...row.rewarded])].sort();
    const memo = current.memo || row.memo;
    if (rewarded.join("\u0000") !== current.rewarded.join("\u0000") || memo !== current.memo) {
      await client.updatePage(current.pageId, { リワード済み: prop.multiSelect(rewarded), メモ: prop.text(memo || null) });
      counts.updated += 1;
    }
    await client.archivePage(row.pageId);
    counts.archived += 1;
    const merged: PeopleRow = { ...current, rewarded, memo };
    byKey.set(row.key, merged);
    kept[kept.indexOf(current)] = merged;
  }
  return kept;
}

async function mergePeople(
  client: NotionClient,
  existing: readonly PeopleRow[],
  links: readonly NameLink[],
  counts: WriteCounts,
): Promise<Map<string, PeopleRow>> {
  const names = linkedNames(links);
  const byKey = new Map(existing.map((row) => [row.key, row]));
  for (const source of existing) {
    const targetKey = canonicalKey(source.key, names);
    const target = byKey.get(targetKey);
    if (targetKey === source.key || !target) continue;
    const rewarded = [...new Set([...target.rewarded, ...source.rewarded])].sort();
    const memo = target.memo || source.memo;
    await client.updatePage(target.pageId, { リワード済み: prop.multiSelect(rewarded), メモ: prop.text(memo || null) });
    await client.archivePage(source.pageId);
    counts.updated += 1;
    counts.archived += 1;
    byKey.set(targetKey, { ...target, rewarded, memo });
    byKey.delete(source.key);
  }
  return byKey;
}

export async function syncPeople(
  client: NotionClient,
  ids: NotionIdsLike,
  stats: readonly PersonStats[],
  existing: readonly PeopleRow[],
  links: readonly NameLink[],
): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }> {
  const counts = emptyCounts();
  const unique = await archivePeopleDuplicates(client, existing, counts);
  const byKey = await mergePeople(client, unique, links, counts);
  const pageIdByKey = new Map<string, string>();
  for (const person of stats) {
    const row = byKey.get(person.key);
    const pageId = await upsert(client, ids.peopleDb, personProperties(person, row?.rewarded ?? []), row, counts);
    pageIdByKey.set(person.key, pageId);
  }
  return { pageIdByKey, counts };
}

export async function syncRecords(
  client: NotionClient,
  ids: NotionIdsLike,
  records: readonly AttendanceRecord[],
  pageIdByKey: ReadonlyMap<string, string>,
  existing: readonly RecordRow[],
  links: readonly NameLink[],
  absentKeys: ReadonlySet<string>,
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing, (row) => row.key, counts);
  const byKey = new Map(unique.map((row) => [row.key, row]));
  const computedKeys = new Set(records.map((record) => record.key));
  for (const record of records) {
    const personPageId = pageIdByKey.get(record.personKey);
    if (!personPageId) throw new Error(`参加記録の人 ${record.personKey} のページが見つかりません`);
    await upsert(
      client,
      ids.recordsDb,
      {
        キー: prop.title(record.key),
        開催日: prop.date(record.date),
        人: prop.relation([personPageId]),
        経路: prop.select(record.route),
        申込日時: prop.date(record.appliedAt),
        状態: prop.select(record.status),
        回次: prop.number(record.ordinal),
        元データ: prop.text(record.sources.join(", ")),
        ...(absentKeys.has(record.key) ? { 出欠: prop.select("欠席") } : {}),
      },
      byKey.get(record.key),
      counts,
    );
  }
  const names = linkedNames(links);
  for (const row of unique) {
    if (computedKeys.has(row.key)) continue;
    if (canonicalKey(row.personKey, names) !== row.personKey) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
    } else if (row.status !== VANISHED) {
      // ハッシュも空に戻す: 記録が元の値のまま復活したとき、upsert の差分判定でハッシュが
      // 一致してしまい「元データになし」のまま書き換わらなくなるのを防ぐため。
      await client.updatePage(row.pageId, { 状態: prop.select(VANISHED), [HASH]: prop.text("") });
      counts.updated += 1;
    }
  }
  return counts;
}

const bridgeSchema = z.object({
  nextDate: z.string().nullable(),
  updatedAt: z.string(),
  status: z.enum(["ok", "failed"]),
  failure: z.string().nullable(),
  flex: z.object({ type: z.literal("flex"), altText: z.string(), contents: z.record(z.string(), z.unknown()) }).nullable(),
});

const codeBlockSchema = z.object({ code: z.object({ rich_text: z.array(z.object({ plain_text: z.string() })) }) });

export async function readBridge(client: NotionClient, pageId: string): Promise<BridgePayload | null> {
  const blocks = await client.listChildren(pageId);
  const code = blocks.map((block) => codeBlockSchema.safeParse(block)).find((parsed) => parsed.success);
  if (!code?.success) return null;
  try {
    const parsed = bridgeSchema.safeParse(JSON.parse(code.data.code.rich_text.map((part) => part.plain_text).join("")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeBridge(client: NotionClient, pageId: string, payload: BridgePayload): Promise<void> {
  for (const block of await client.listChildren(pageId)) await client.deleteBlock(block.id);
  await client.appendChildren(pageId, [
    {
      object: "block",
      type: "code",
      code: {
        language: "json",
        rich_text: chunkText(JSON.stringify(payload, null, 2)).map((content) => ({ type: "text", text: { content } })),
      },
    },
  ]);
}

export async function markBridgeFailed(client: NotionClient, pageId: string, failure: string, now: string): Promise<void> {
  const previous = await readBridge(client, pageId);
  const base: BridgePayload = previous ?? { nextDate: null, updatedAt: now, status: "failed", failure: null, flex: null };
  await writeBridge(client, pageId, { ...base, status: "failed", failure });
}
