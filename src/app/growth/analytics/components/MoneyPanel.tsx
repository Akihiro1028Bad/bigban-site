import type { MoneyExtraView, MoneyView } from "@/lib/growth/analyticsView";

interface MoneyPanelProps { money: MoneyView; extra?: MoneyExtraView; }
export function MoneyPanel({ money, extra }: MoneyPanelProps) {
  return <section aria-labelledby="analytics-money-heading"><h2 id="analytics-money-heading">お金</h2><dl className="analytics-money"><div><dt>対象週の売上</dt><dd>{money.currentWeek}</dd></div><div><dt>28日見込み</dt><dd>{money.forecast28}</dd></div>{extra?.unpaid ? <div><dt>未収金</dt><dd>{extra.unpaid.headline}{extra.unpaid.overdue ? <small>{extra.unpaid.overdue}</small> : null}</dd></div> : null}{extra?.revPach ? <div><dt>RevPACH</dt><dd>{extra.revPach}</dd></div> : null}</dl>{extra && extra.paymentShare.length > 0 ? <ul className="analytics-payment-share" aria-label="支払い方法構成">{extra.paymentShare.map((method) => <li key={method.method}>{method.method} {method.pct}%</li>)}</ul> : null}</section>;
}
