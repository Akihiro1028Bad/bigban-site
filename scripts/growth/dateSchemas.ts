/** 日付表現を扱う共有スキーマ。入力値を暦上の実在日付に限定する。 */
import { z } from "zod";

export function isCalendarYmd(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

export const ymdSchema = z.string().refine(isCalendarYmd, "実在する日付ではありません");
export const isoDateTimeSchema = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), "ISO日時ではありません");
export const coverageSchema = z.object({ start: ymdSchema, end: ymdSchema }).refine((value) => value.start <= value.end, "収録範囲の開始は終了以前にしてください");
