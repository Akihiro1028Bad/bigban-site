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

/** 別名の人キー → 統合先の人キー。自分自身を指す別名は無視する。 */
export function buildAliasMap(links: readonly AliasLink[]): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const link of links) {
    for (const alias of splitAliases(link.alias)) {
      const aliasKey = personKeyOf(alias);
      if (aliasKey !== link.personKey) aliasMap.set(aliasKey, link.personKey);
    }
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
