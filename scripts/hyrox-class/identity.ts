/** 人・開催回・参加記録のキーと、別名による名寄せ。人は正規化した氏名で識別する。 */
import { normalizeName } from "../early-morning/identity";
import type { AliasLink, LedgerRow } from "./types";

/** `YYYY-MM-DD_HH:MM` の長さ。 */
const SESSION_KEY_LENGTH = 16;

/** グループの並び順を決めるための区切り(氏名に現れない制御文字)。 */
const SEPARATOR = "\u0000";

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function personKeyOf(name: string): string {
  return `lb:${normalizeName(name)}`;
}

export function splitAliases(text: string): string[] {
  return text
    .split(/[,、，]/u)
    .map((alias) => alias.trim())
    .filter((alias) => alias !== "");
}

/**
 * 会員番号が同じ予約の人キーのグループ(同じ人が表記違いで予約したもの)。全予約が対象。
 * 人キーが2つ以上あるグループだけを、中は昇順・外は先頭のキー順で返す。
 */
export function memberGroupsOf(rows: readonly LedgerRow[]): string[][] {
  const byMember = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.memberNo === null) continue;
    byMember.set(row.memberNo, (byMember.get(row.memberNo) ?? new Set<string>()).add(personKeyOf(row.name)));
  }
  return [...byMember.values()]
    .filter((keys) => keys.size >= 2)
    .map((keys) => [...keys].sort())
    .sort((a, b) => compareText(a.join(SEPARATOR), b.join(SEPARATOR)));
}

/** 別名の行のキーと、その別名の人キーの組(自分自身を指す別名は除く)。 */
function aliasPairs(links: readonly AliasLink[]): [string, string][] {
  return links.flatMap((link) =>
    splitAliases(link.alias)
      .map((alias): [string, string] => [link.personKey, personKeyOf(alias)])
      .filter(([owner, aliasKey]) => owner !== aliasKey),
  );
}

/** 同じ人としてつながったキーの集合(union-find)を、根ごとのグループにして返す。 */
function connectedGroups(pairs: readonly (readonly [string, string])[]): string[][] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  for (const [a, b] of pairs) {
    parent.set(find(a), find(b));
    if (!parent.has(b)) parent.set(b, find(b));
  }
  const groups = new Map<string, string[]>();
  for (const key of parent.keys()) groups.set(find(key), [...(groups.get(find(key)) ?? []), key]);
  return [...groups.values()];
}

const smallest = (keys: readonly string[]): string => keys.reduce((min, key) => (key < min ? key : min));

/**
 * 別名の人キー → 統合先の人キー。
 * 別名でつながる人キー(相互・連鎖・同じ別名を複数行に書いた場合を含む。自分自身を指す別名は無視)と、
 * sameGroups(会員番号が同じ人キー。`memberGroupsOf`)の各グループを1つにまとめる。
 * 統合先は、別名を入れた行(link.personKey)がグループにあればその中で、なければグループ内で、文字列比較で最小のキー。
 * 統合先自身は対応表に含めない。
 */
export function buildAliasMap(links: readonly AliasLink[], sameGroups: readonly (readonly string[])[] = []): Map<string, string> {
  const owners = new Set(links.map((link) => link.personKey));
  const memberPairs = sameGroups.flatMap((group) => group.slice(1).map((key): [string, string] => [group[0] as string, key]));
  const aliasMap = new Map<string, string>();
  for (const group of connectedGroups([...aliasPairs(links), ...memberPairs])) {
    const groupOwners = group.filter((key) => owners.has(key));
    const canonical = smallest(groupOwners.length > 0 ? groupOwners : group);
    for (const key of group) if (key !== canonical) aliasMap.set(key, canonical);
  }
  return aliasMap;
}

export function canonicalPersonKey(personKey: string, aliasMap: ReadonlyMap<string, string>): string {
  return aliasMap.get(personKey) ?? personKey;
}

export function resolvePersonKey(name: string, aliasMap: ReadonlyMap<string, string>): string {
  return canonicalPersonKey(personKeyOf(name), aliasMap);
}

export function sessionKeyOf(date: string, startTime: string): string {
  return `${date}_${startTime}`;
}

export function recordKeyOf(sessionKey: string, personKey: string): string {
  return `${sessionKey}_${personKey}`;
}

export function sessionKeyOfRecordKey(recordKey: string): string {
  return recordKey.slice(0, SESSION_KEY_LENGTH);
}

export function personKeyOfRecordKey(recordKey: string): string {
  return recordKey.slice(SESSION_KEY_LENGTH + 1);
}
