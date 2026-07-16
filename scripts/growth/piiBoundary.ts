/** PII境界: 仮名化・粗視化(純ロジック)。PII生値はこの層より先に出さない。 */
import { createHmac } from "node:crypto";

export function pseudoId(email: string, memberNo: string, hashKey: string): string | null {
  const source = email.trim().toLowerCase() || (memberNo.trim() ? `member:${memberNo.trim()}` : "");
  if (!source) return null;
  return createHmac("sha256", hashKey).update(source).digest("hex").slice(0, 16);
}

const WARD_PATTERN = /(?:北海道|東京都|(?:京都|大阪)府|.{2,3}県)?((?:[^\s0-9０-９]{1,6}?市[^\s0-9０-９]{1,4}?区)|(?:[^\s0-9０-９]{1,6}?[市区町村]))/u;

export function extractWard(address: string): string {
  const match = address.trim().match(WARD_PATTERN);
  return match && match[1].length >= 2 ? match[1] : "不明";
}

export function ageBand(birthDate: string, onYmd: string): string {
  const match = birthDate.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return "不明";
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const on = new Date(`${onYmd}T00:00:00+09:00`).getTime();
  const birth = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(on) || !Number.isFinite(birth) || birth > on) return "不明";
  const age = Math.floor((on - birth) / (365.25 * 24 * 3600 * 1000));
  if (age < 20) return "10代以下";
  if (age >= 60) return "60代以上";
  return `${Math.floor(age / 10) * 10}代`;
}

const OCCUPATION_GROUPS: readonly { group: string; pattern: RegExp }[] = [
  { group: "医療・施術", pattern: /医|師|療|鍼|整体|看護|柔道整復/ }, { group: "学生", pattern: /学生|学校/ }, { group: "経営・自営", pattern: /経営|自営|役員|代表|フリーランス/ }, { group: "会社員", pattern: /会社員|社員|公務員|団体職員/ },
];
export function occupationGroup(occupation: string): string { const value = occupation.trim(); if (!value) return "不明"; for (const { group, pattern } of OCCUPATION_GROUPS) if (pattern.test(value)) return group; return "その他"; }
