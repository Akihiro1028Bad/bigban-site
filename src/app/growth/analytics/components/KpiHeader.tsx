import type { KpiCard } from "@/lib/growth/analyticsView";

interface KpiHeaderProps { cards: readonly KpiCard[]; }

export function KpiHeader({ cards }: KpiHeaderProps) {
  return <section aria-labelledby="analytics-kpi-heading"><h2 id="analytics-kpi-heading">経営サマリー</h2><ul className="analytics-kpis">{cards.map((card) => <li key={card.label}><p>{card.label}</p><strong>{card.value}</strong><small>{card.sub}</small></li>)}</ul></section>;
}
