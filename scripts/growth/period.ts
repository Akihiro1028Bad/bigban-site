/**
 * 週次データ取得の対象期間を算出する純関数。
 *
 * 「直近の確定した完全な週(月曜〜日曜)」を current、その1つ前を prior として返す。
 * 実行日を含む週は未確定とみなし対象にしない(木曜実行 + GSC の反映遅延を考慮)。
 *
 * 曜日判定は日本時間(JST, +09:00)基準で行う。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateRange {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
}

export interface WeeklyPeriods {
  current: DateRange;
  prior: DateRange;
}

function formatYmd(utcMidnight: Date): string {
  const year = utcMidnight.getUTCFullYear();
  const month = String(utcMidnight.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcMidnight.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** JST のカレンダー日付に対応する UTC 0時の Date を返す。 */
function jstMidnight(reference: Date): Date {
  const shifted = new Date(reference.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate()
    )
  );
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

function weekRange(monday: Date): DateRange {
  return { start: formatYmd(monday), end: formatYmd(addDays(monday, 6)) };
}

/** 実行日(JST)のカレンダー日付を YYYY-MM-DD 形式で返す(スナップショット名等に使う)。 */
export function jstDateString(reference: Date): string {
  return formatYmd(jstMidnight(reference));
}

export function computeWeeklyPeriods(reference: Date): WeeklyPeriods {
  const today = jstMidnight(reference);
  // getUTCDay: 0=日, 1=月, ..., 6=土。月曜起点の経過日数に変換。
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const mondayThisWeek = addDays(today, -daysSinceMonday);

  const currentMonday = addDays(mondayThisWeek, -7);
  const priorMonday = addDays(mondayThisWeek, -14);

  return {
    current: weekRange(currentMonday),
    prior: weekRange(priorMonday),
  };
}
