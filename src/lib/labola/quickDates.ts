/** JST の暦日(曜日つき)。weekday は 0=日〜6=土。 */
export interface JstDate {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export type QuickDateId = "today" | "tomorrow" | "saturday" | "sunday";

export interface QuickDate extends JstDate {
  id: QuickDateId;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function jstDateAfter(now: Date, offsetDays: number): JstDate {
  const shifted = new Date(now.getTime() + JST_OFFSET_MS + offsetDays * DAY_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** 閲覧者のタイムゾーンに関係なく、日本時間の「今日」を返す。 */
export function toJstDate(now: Date): JstDate {
  return jstDateAfter(now, 0);
}

/**
 * 日付ボタンの候補(今日・明日・直近の土・日)を日付の昇順で返す。
 * 同じ日は先に挙げた方(今日 > 明日 > 土 > 日)だけ残す。
 */
export function buildQuickDates(now: Date): QuickDate[] {
  const { weekday } = toJstDate(now);
  const candidates: { id: QuickDateId; offset: number }[] = [
    { id: "today", offset: 0 },
    { id: "tomorrow", offset: 1 },
    { id: "saturday", offset: (6 - weekday + 7) % 7 },
    { id: "sunday", offset: (7 - weekday) % 7 },
  ];
  const seenOffsets = new Set<number>();
  const unique = candidates.filter(({ offset }) => {
    if (seenOffsets.has(offset)) return false;
    seenOffsets.add(offset);
    return true;
  });
  return unique.map(({ id, offset }) => ({ id, ...jstDateAfter(now, offset) }));
}
