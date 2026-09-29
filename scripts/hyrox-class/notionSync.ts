/**
 * HYROX 参加者の Notion 3 DB の読み取りと差分書き込み。
 * スタッフ入力列(別名・メモ・出欠)は、統合時のメモの空欄補完・統合時の別名の追記・欠席の書き写しを除いて書かない。
 */
import type { NotionClient } from "../early-morning/notionClient";
import { prop, readCheckbox, readPlainText, readSelect } from "../early-morning/notionProps";
import { hashOf, type WriteCounts } from "../early-morning/notionSync";
import { canonicalPersonKey, personKeyOf, personKeyOfRecordKey, recordKeyOf, sessionKeyOfRecordKey, splitAliases } from "./identity";
import type { AliasLink, ClassRecord, PersonStats, Session } from "./types";

export interface HyroxNotionIds {
  peopleDb: string;
  recordsDb: string;
  sessionsDb: string;
  bridgePage: string;
}

export interface PeopleRow {
  pageId: string;
  key: string;
  alias: string;
  memo: string;
  isNextApplied: boolean;
  hash: string;
}

export interface RecordRow {
  pageId: string;
  key: string;
  personKey: string;
  status: string | null;
  isAbsent: boolean;
  hash: string;
}

export interface SessionRow {
  pageId: string;
  key: string;
  hash: string;
}

export interface HyroxNotionState {
  people: PeopleRow[];
  records: RecordRow[];
  sessions: SessionRow[];
}

const HASH = "同期ハッシュ";
const VANISHED = "元データになし";

function emptyCounts(): WriteCounts {
  return { created: 0, updated: 0, archived: 0 };
}

export async function readHyroxState(client: NotionClient, ids: HyroxNotionIds): Promise<HyroxNotionState> {
  const [peoplePages, recordPages, sessionPages] = await Promise.all([
    client.queryAll(ids.peopleDb),
    client.queryAll(ids.recordsDb),
    client.queryAll(ids.sessionsDb),
  ]);
  return {
    people: peoplePages.map((page) => ({
      pageId: page.id,
      key: readPlainText(page, "識別子"),
      alias: readPlainText(page, "別名").trim(),
      memo: readPlainText(page, "メモ"),
      isNextApplied: readCheckbox(page, "次回申込"),
      hash: readPlainText(page, HASH),
    })),
    records: recordPages.map((page) => {
      const key = readPlainText(page, "キー");
      return {
        pageId: page.id,
        key,
        personKey: personKeyOfRecordKey(key),
        status: readSelect(page, "状態"),
        isAbsent: readSelect(page, "出欠") === "欠席",
        hash: readPlainText(page, HASH),
      };
    }),
    sessions: sessionPages.map((page) => ({ pageId: page.id, key: readPlainText(page, "キー"), hash: readPlainText(page, HASH) })),
  };
}

const PERSON_KEY_PREFIX = "lb:";
const MANAGED_RECORD_KEY = /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}_lb:.+/u;

/** ルーチンが管理する人の行(識別子が `lb:` + 名前)。スタッフが手で足した行は管理外で、一切触らない。 */
function isManagedPerson(row: { key: string }): boolean {
  return row.key.startsWith(PERSON_KEY_PREFIX) && row.key.length > PERSON_KEY_PREFIX.length;
}

/** ルーチンが管理する参加記録の行(キーが `YYYY-MM-DD_HH:MM_lb:名前`)。 */
function isManagedRecord(row: { key: string }): boolean {
  return MANAGED_RECORD_KEY.test(row.key);
}

export function deriveAliasLinks(people: readonly PeopleRow[]): AliasLink[] {
  return people.filter((row) => isManagedPerson(row) && row.alias !== "").map((row) => ({ personKey: row.key, alias: row.alias }));
}

/** スタッフが「欠席」を付けた参加記録のキー(統合先の人キーに寄せる)。 */
export function deriveAbsentKeys(records: readonly RecordRow[], aliasMap: ReadonlyMap<string, string>): Set<string> {
  return new Set(
    records
      .filter((row) => row.isAbsent)
      .map((row) => recordKeyOf(sessionKeyOfRecordKey(row.key), canonicalPersonKey(row.personKey, aliasMap))),
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
async function archiveDuplicates<T extends { pageId: string; key: string }>(
  client: NotionClient,
  rows: readonly T[],
  counts: WriteCounts,
): Promise<T[]> {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
      continue;
    }
    seen.add(row.key);
    kept.push(row);
  }
  return kept;
}

export async function syncSessions(
  client: NotionClient,
  ids: HyroxNotionIds,
  sessions: readonly Session[],
  records: readonly ClassRecord[],
  existing: readonly SessionRow[],
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const byKey = new Map((await archiveDuplicates(client, existing, counts)).map((row) => [row.key, row]));
  for (const session of sessions) {
    const applicants = records.filter((record) => record.sessionKey === session.key && record.status === "申込").length;
    await upsert(
      client,
      ids.sessionsDb,
      {
        キー: prop.title(session.key),
        開催日: prop.date(session.date),
        開始時刻: prop.text(session.startTime),
        クラス: prop.select(session.classType),
        イベント名: prop.text(session.eventName),
        申込数: prop.number(applicants),
      },
      byKey.get(session.key),
      counts,
    );
  }
  return counts;
}

function personProperties(stats: PersonStats): Record<string, unknown> {
  return {
    氏名: prop.title(stats.displayName),
    識別子: prop.text(stats.key),
    通算: prop.number(stats.total),
    ビギナー: prop.number(stats.classCounts.ビギナー),
    通常: prop.number(stats.classCounts.通常),
    ダブルス: prop.number(stats.classCounts.ダブルス),
    初参加日: prop.date(stats.firstDate),
    最終参加日: prop.date(stats.lastDate),
    状態: prop.select(stats.state),
    次回申込: prop.checkbox(stats.isNextApplied),
    利用歴: prop.text(stats.history),
  };
}

/**
 * target の別名の後ろに、source(管理する人の行なので識別子は `lb:` で始まる)自身の名前と source の別名のうち、未登録で target 自身を指さないものを足す
 * (既存の別名は消さない。source の名前も残すのは、アーカイブ後も次の実行で統合先に寄せ続けるため)。
 */
function mergeAliases(target: PeopleRow, source: PeopleRow): string[] {
  const merged = splitAliases(target.alias);
  const known = new Set(merged.map(personKeyOf));
  for (const alias of [source.key.slice(PERSON_KEY_PREFIX.length), ...splitAliases(source.alias)]) {
    const key = personKeyOf(alias);
    if (key === target.key || known.has(key)) continue;
    known.add(key);
    merged.push(alias);
  }
  return merged;
}

/** source を target に吸収してアーカイブする。メモは target が空のときだけ移し、別名は追記する(値を消さない)。 */
async function absorb(client: NotionClient, target: PeopleRow, source: PeopleRow, counts: WriteCounts): Promise<PeopleRow> {
  const isMemoTransferred = target.memo === "" && source.memo !== "";
  const aliases = mergeAliases(target, source);
  const isAliasAppended = aliases.length > splitAliases(target.alias).length;
  const merged: PeopleRow = {
    ...target,
    memo: isMemoTransferred ? source.memo : target.memo,
    alias: isAliasAppended ? aliases.join("、") : target.alias,
  };
  if (isMemoTransferred || isAliasAppended) {
    await client.updatePage(target.pageId, {
      ...(isMemoTransferred ? { メモ: prop.text(merged.memo) } : {}),
      ...(isAliasAppended ? { 別名: prop.text(merged.alias) } : {}),
    });
    counts.updated += 1;
  }
  await client.archivePage(source.pageId);
  counts.archived += 1;
  return merged;
}

/** 同じ識別子の重複行と、別名に当たる人の行を統合先へ吸収する。管理外の行は対象外(戻り値にも含めない)。 */
async function mergePeople(
  client: NotionClient,
  rows: readonly PeopleRow[],
  aliasMap: ReadonlyMap<string, string>,
  counts: WriteCounts,
): Promise<Map<string, PeopleRow>> {
  const byKey = new Map<string, PeopleRow>();
  for (const row of rows.filter(isManagedPerson)) {
    const current = byKey.get(row.key);
    byKey.set(row.key, current ? await absorb(client, current, row, counts) : row);
  }
  for (const [key, row] of [...byKey]) {
    const target = byKey.get(canonicalPersonKey(key, aliasMap));
    if (!target || target.key === key) continue;
    byKey.set(target.key, await absorb(client, target, row, counts));
    byKey.delete(key);
  }
  return byKey;
}

export async function syncPeople(
  client: NotionClient,
  ids: HyroxNotionIds,
  stats: readonly PersonStats[],
  existing: readonly PeopleRow[],
  aliasMap: ReadonlyMap<string, string>,
): Promise<{ pageIdByKey: Map<string, string>; counts: WriteCounts }> {
  const counts = emptyCounts();
  const byKey = await mergePeople(client, existing, aliasMap, counts);
  const pageIdByKey = new Map<string, string>();
  for (const person of stats) {
    pageIdByKey.set(person.key, await upsert(client, ids.peopleDb, personProperties(person), byKey.get(person.key), counts));
  }
  const computed = new Set(stats.map((person) => person.key));
  for (const row of byKey.values()) {
    if (computed.has(row.key) || !row.isNextApplied) continue;
    // ハッシュも空に戻す: 後で同じ値に戻ったとき、差分判定でハッシュが一致して書き戻されなくなるのを防ぐため。
    await client.updatePage(row.pageId, { 次回申込: prop.checkbox(false), [HASH]: prop.text("") });
    counts.updated += 1;
  }
  return { pageIdByKey, counts };
}

export async function syncRecords(
  client: NotionClient,
  ids: HyroxNotionIds,
  records: readonly ClassRecord[],
  pageIdByKey: ReadonlyMap<string, string>,
  existing: readonly RecordRow[],
  aliasMap: ReadonlyMap<string, string>,
  absentKeys: ReadonlySet<string>,
): Promise<WriteCounts> {
  const counts = emptyCounts();
  const unique = await archiveDuplicates(client, existing.filter(isManagedRecord), counts);
  const byKey = new Map(unique.map((row) => [row.key, row]));
  for (const record of records) {
    const personPageId = pageIdByKey.get(record.personKey);
    if (!personPageId) throw new Error("参加記録の人のページが見つかりません");
    await upsert(
      client,
      ids.recordsDb,
      {
        キー: prop.title(record.key),
        開催日: prop.date(record.date),
        開始時刻: prop.text(record.startTime),
        クラス: prop.select(record.classType),
        人: prop.relation([personPageId]),
        状態: prop.select(record.status),
        回次: prop.number(record.ordinal),
        予約番号: prop.text(record.reservationNos.join(", ")),
        ...(absentKeys.has(record.key) ? { 出欠: prop.select("欠席") } : {}),
      },
      byKey.get(record.key),
      counts,
    );
  }
  const computed = new Set(records.map((record) => record.key));
  for (const row of unique) {
    if (computed.has(row.key)) continue;
    if (canonicalPersonKey(row.personKey, aliasMap) !== row.personKey) {
      await client.archivePage(row.pageId);
      counts.archived += 1;
    } else if (row.status !== VANISHED) {
      // ハッシュも空に戻す: 記録が元の値のまま復活したとき、差分判定で書き換わらなくなるのを防ぐため。
      await client.updatePage(row.pageId, { 状態: prop.select(VANISHED), [HASH]: prop.text("") });
      counts.updated += 1;
    }
  }
  return counts;
}
