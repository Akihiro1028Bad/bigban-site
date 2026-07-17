interface DemographicsPanelProps { demographics: readonly { label: string; count: number }[]; }

export function DemographicsPanel({ demographics }: DemographicsPanelProps) {
  return <section aria-labelledby="analytics-demographics-heading"><h2 id="analytics-demographics-heading">顧客の年代・性別</h2>{demographics.length === 0 ? <p>顧客分布データを収集中です。</p> : <ul className="analytics-demographics">{demographics.map((item) => <li key={item.label}><span>{item.label}</span><strong>{item.count}人</strong></li>)}</ul>}</section>;
}
