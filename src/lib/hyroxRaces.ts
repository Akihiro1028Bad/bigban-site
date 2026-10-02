import { HYROX_RACES } from "@/constants/hyroxRaces";
import type { HyroxRace } from "@/constants/hyroxRaces";

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type HyroxRaceStatus =
  | { readonly kind: "upcoming"; readonly daysUntil: number }
  | { readonly kind: "ongoing" };

/** epoch ミリ秒 → JST 暦日の通し番号(1970-01-01 = 0) */
function jstDayNumber(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

/** "YYYY-MM-DD"(JST 暦日) → 通し番号 */
function dateStringDayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * 現在時刻(epoch ミリ秒)。Server Component が初回描画用の時刻を作るために使う
 * (静的生成時はその時点の値が HTML に入り、revalidate で更新される)。
 */
export function currentTimeMs(): number {
  return Date.now();
}

/**
 * 現在の JST 暦日の始まり(epoch ミリ秒)。次の大会の選択・残り日数は JST の暦日だけに
 * 依存するため、1日のあいだ値が変わらない(useSyncExternalStore の snapshot に使える)。
 */
export function currentJstDayStartMs(): number {
  return jstDayNumber(Date.now()) * DAY_MS - JST_OFFSET_MS;
}

/** 最終日の JST 終わりまで「次の大会」。すべて終わっていれば null。 */
export function getNextHyroxRace(
  nowMs: number,
  races: readonly HyroxRace[] = HYROX_RACES,
): HyroxRace | null {
  const today = jstDayNumber(nowMs);
  return (
    races.find((race) => dateStringDayNumber(race.endDate) >= today) ?? null
  );
}

/** 開始前なら残り日数(JST 暦日差)、開始日〜最終日は開催中。 */
export function getRaceStatus(race: HyroxRace, nowMs: number): HyroxRaceStatus {
  const daysUntil = dateStringDayNumber(race.startDate) - jstDayNumber(nowMs);
  return daysUntil > 0 ? { kind: "upcoming", daysUntil } : { kind: "ongoing" };
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

function parseCalendarDate(date: string): CalendarDate {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday };
}

function formatJa(
  date: CalendarDate,
  previous: CalendarDate | null,
): string {
  const sameYear = previous?.year === date.year;
  const sameMonth = sameYear && previous?.month === date.month;
  const year = sameYear ? "" : `${date.year}年`;
  const month = sameMonth ? "" : `${date.month}月`;
  return `${year}${month}${date.day}日(${WEEKDAYS_JA[date.weekday]})`;
}

function formatEn(date: CalendarDate, withYear: boolean): string {
  const base = `${WEEKDAYS_EN[date.weekday]}, ${MONTHS_EN[date.month - 1]} ${date.day}`;
  return withYear ? `${base}, ${date.year}` : base;
}

/**
 * 開催日程の表示文字列。同日なら1日だけ。
 * Intl は ICU の版でブラウザとサーバーの出力が揺れ、ハイドレーション不一致の
 * 原因になるため、固定の語彙で自前に組み立てる。
 */
export function formatRaceDates(race: HyroxRace, locale: "ja" | "en"): string {
  const start = parseCalendarDate(race.startDate);
  const end = parseCalendarDate(race.endDate);
  const isSingleDay = race.startDate === race.endDate;

  if (locale === "ja") {
    return isSingleDay
      ? formatJa(start, null)
      : `${formatJa(start, null)}～${formatJa(end, start)}`;
  }
  return isSingleDay
    ? formatEn(start, true)
    : `${formatEn(start, start.year !== end.year)} – ${formatEn(end, true)}`;
}
