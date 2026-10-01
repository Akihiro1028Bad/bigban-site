/** 週(JST・月曜始まり)の計算。日付はすべて `YYYY-MM-DD` の文字列で扱う。 */
const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const GA_DATE = /^(\d{4})(\d{2})(\d{2})$/u;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function jstDateOf(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function recentWeekStarts(now: Date, count: number): string[] {
  const current = weekStartOf(jstDateOf(now));
  return Array.from({ length: count }, (_, index) => addDays(current, -7 * (count - 1 - index)));
}

export function gaDateToIso(gaDate: string): string {
  const match = GA_DATE.exec(gaDate);
  if (!match) throw new Error(`GA4 の日付の形が想定と違います: ${gaDate}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function instantToJstDate(value: string): string | null {
  if (ISO_DATE.test(value)) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : jstDateOf(new Date(time));
}
