import type { Insight } from "@/lib/growth/snapshotSchema";
import { insightEvidenceText } from "@/lib/growth/analyticsView";

interface InsightFeedProps { insights: readonly Insight[]; }

export function InsightFeed({ insights }: InsightFeedProps) {
  return <section aria-labelledby="analytics-insights-heading"><h2 id="analytics-insights-heading">気づき</h2>{insights.length === 0 ? <p>新しい気づきはありません。</p> : <ul className="analytics-insights">{insights.map((insight) => { const evidence = insightEvidenceText(insight.evidence); return <li key={insight.id} className={`analytics-insight analytics-insight-${insight.severity}`}><div><span className="analytics-severity">{insight.severity}</span><span className="analytics-label">{insight.label}</span></div><h3>{insight.title}</h3><p>{insight.body}</p>{evidence ? <small>根拠: {evidence}</small> : null}</li>; })}</ul>}</section>;
}
