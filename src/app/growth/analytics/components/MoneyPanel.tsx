import type { MoneyView } from "@/lib/growth/analyticsView";

interface MoneyPanelProps { money: MoneyView; }
export function MoneyPanel({ money }: MoneyPanelProps) {
  return <section aria-labelledby="analytics-money-heading"><h2 id="analytics-money-heading">お金</h2><dl className="analytics-money"><div><dt>対象週の売上</dt><dd>{money.currentWeek}</dd></div><div><dt>28日見込み</dt><dd>{money.forecast28}</dd></div></dl></section>;
}
