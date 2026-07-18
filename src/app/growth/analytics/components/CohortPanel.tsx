import type { CohortRowView } from "@/lib/growth/analyticsView";

interface CohortPanelProps {
  cohorts: readonly CohortRowView[] | null;
}

const COHORT_NOTE = "コホート売上は予約金額ベースのため、売上サマリとは一致しません。";

export function CohortPanel({ cohorts }: CohortPanelProps) {
  return <section aria-labelledby="analytics-cohort-heading">
    <h2 id="analytics-cohort-heading">コホート</h2>
    {cohorts === null ? <p className="analytics-cohort-collecting"><strong>収集中</strong><span>継続利用データの取り込み待ちです</span></p> : cohorts.length === 0 ? <p>データなし</p> : <div className="analytics-cohort-scroll"><table className="analytics-cohort-table"><thead><tr><th scope="col">初回月</th><th scope="col">人数</th><th scope="col">リピート</th><th scope="col">累積売上</th></tr></thead><tbody>{cohorts.map((cohort) => <tr key={cohort.month}><td>{cohort.month}</td><td>{cohort.customers}人</td><td>{cohort.repeatText}</td><td>{cohort.revenueText}</td></tr>)}</tbody></table></div>}
    <small className="analytics-cohort-note">{COHORT_NOTE}</small>
  </section>;
}
