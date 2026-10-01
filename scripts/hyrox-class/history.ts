/** DAISUKE CLASS 以外の施設利用歴(HYROX 系イベント・HYROX エリア貸切・ピックル)の索引と要約。 */
import { formatMonthDay } from "../early-morning/dates";
import { historyCategoryOf, type HistoryCategory } from "./classify";
import { resolvePersonKey, sessionKeyOf } from "./identity";
import type { LedgerRow } from "./types";

/** 人キー → 利用歴に数える台帳の行(日時順)。キャンセル・DAISUKE CLASS・分類できない行は含めない。 */
export function buildHistoryIndex(rows: readonly LedgerRow[], aliasMap: ReadonlyMap<string, string>): Map<string, LedgerRow[]> {
  const index = new Map<string, LedgerRow[]>();
  const sorted = [...rows].sort((a, b) => sessionKeyOf(a.date, a.startTime).localeCompare(sessionKeyOf(b.date, b.startTime)));
  for (const row of sorted) {
    if (row.isCancelled || historyCategoryOf(row) === null) continue;
    const key = resolvePersonKey(row.name, aliasMap);
    index.set(key, [...(index.get(key) ?? []), row]);
  }
  return index;
}

/** 例「体験会(9/22)・ミニシミュレーション 2回・HYROXエリア貸切 1回・ピックル 5回」。rows は日時順。 */
export function summarizeHistory(rows: readonly LedgerRow[]): string {
  const categorized = rows.map((row) => ({ row, category: historyCategoryOf(row) }));
  const hyroxDates = new Map<string, string[]>();
  for (const { row, category } of categorized) {
    if (category?.kind === "HYROXイベント") hyroxDates.set(category.shortName, [...(hyroxDates.get(category.shortName) ?? []), row.date]);
  }
  const count = (kind: HistoryCategory["kind"]) => categorized.filter(({ category }) => category?.kind === kind).length;
  const rentals = count("HYROXエリア貸切");
  const pickles = count("ピックル");
  return [
    ...[...hyroxDates].map(([name, dates]) => (dates.length === 1 ? `${name}(${formatMonthDay(dates[0])})` : `${name} ${dates.length}回`)),
    ...(rentals > 0 ? [`HYROXエリア貸切 ${rentals}回`] : []),
    ...(pickles > 0 ? [`ピックル ${pickles}回`] : []),
  ].join("・");
}

/** date より前の日の利用だけを要約する(当日の利用は含めない)。 */
export function historyBefore(index: ReadonlyMap<string, readonly LedgerRow[]>, personKey: string, date: string): string {
  return summarizeHistory((index.get(personKey) ?? []).filter((row) => row.date < date));
}
