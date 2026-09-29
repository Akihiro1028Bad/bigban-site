/** 人・開催回・参加記録のキーと、別名による名寄せ。人は正規化した氏名で識別する。 */
import { normalizeName } from "../early-morning/identity";
import type { AliasLink } from "./types";

/** `YYYY-MM-DD_HH:MM` の長さ。 */
const SESSION_KEY_LENGTH = 16;

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
 * 別名の人キー → 統合先の人キー。
 * 別名でつながる人キー(相互・連鎖・同じ別名を複数行に書いた場合を含む。自分自身を指す別名は無視)を1グループにまとめ、
 * 統合先は別名を入れた行(link.personKey)のうち文字列比較で最小のキーに決める。統合先自身は対応表に含めない。
 */
export function buildAliasMap(links: readonly AliasLink[]): Map<string, string> {
  const owners = new Set(links.map((link) => link.personKey));
  const parent = new Map<string, string>();

  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  // a は別名を入れた行のキーから辿った根なので、常に統合先の候補(別名を入れた行のキー)になっている
  const preferred = (a: string, b: string): string => {
    if (!owners.has(b)) return a;
    return a < b ? a : b;
  };

  for (const link of links) {
    for (const alias of splitAliases(link.alias)) {
      const aliasKey = personKeyOf(alias);
      if (aliasKey === link.personKey) continue;
      const rootA = find(link.personKey);
      const rootB = find(aliasKey);
      if (rootA === rootB) continue;
      const root = preferred(rootA, rootB);
      parent.set(rootA, root);
      parent.set(rootB, root);
    }
  }

  const aliasMap = new Map<string, string>();
  for (const key of parent.keys()) {
    const root = find(key);
    if (root !== key) aliasMap.set(key, root);
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
