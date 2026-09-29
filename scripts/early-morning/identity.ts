/** 人の識別子と名寄せ。テニスベアは不変の user.id、LaBOLA は正規化した氏名で識別する。 */
import type { NameLink } from "./types";

export function normalizeName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}

export function tbKey(id: number): string {
  return `tb:${id}`;
}

export function lbKey(name: string): string {
  return `lb:${normalizeName(name)}`;
}

/** 正規化氏名 → テニスベア ID。 */
export function buildLinkMap(links: readonly NameLink[]): Map<string, number> {
  return new Map(links.map((link) => [normalizeName(link.lbName), link.tbId]));
}

export function resolveLbKey(name: string, linkMap: ReadonlyMap<string, number>): string {
  const tbId = linkMap.get(normalizeName(name));
  return tbId === undefined ? lbKey(name) : tbKey(tbId);
}

const DATE_LENGTH = 10;

export function recordKey(date: string, personKey: string): string {
  return `${date}_${personKey}`;
}

export function personKeyOfRecordKey(key: string): string {
  return key.slice(DATE_LENGTH + 1);
}
