const JST = "Asia/Tokyo";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** JST の日付 YYYY-MM-DD。 */
export function jstDate(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** JST の日時 YYYY-MM-DDTHH:MM:SS+09:00。 */
export function jstDateTime(now: Date): string {
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return `${text.replace(" ", "T")}+09:00`;
}

/** +09:00 付き ISO8601 の日付部分。 */
export function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/** +09:00 付き ISO8601 の時刻部分 HH:MM。 */
export function isoTimePart(iso: string): string {
  return iso.slice(11, 16);
}

/** YYYY-MM-DD を M/D(曜) にする。 */
export function formatMonthDayWeekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}(${weekday})`;
}

/** YYYY-MM-DD を M/D にする。 */
export function formatMonthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

/** YYYY-MM-DD に日数を足した YYYY-MM-DD(UTC で計算)。 */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** from から to までの日数(to が後ろなら正)。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** +09:00 付き ISO8601 を M/D HH:MM にする。 */
export function formatMonthDayTime(isoJst: string): string {
  return `${Number(isoJst.slice(5, 7))}/${Number(isoJst.slice(8, 10))} ${isoJst.slice(11, 16)}`;
}

/** HH:MM の時の先頭ゼロを外す。 */
export function formatStartTime(hhmm: string): string {
  return `${Number(hhmm.slice(0, 2))}${hhmm.slice(2)}`;
}
