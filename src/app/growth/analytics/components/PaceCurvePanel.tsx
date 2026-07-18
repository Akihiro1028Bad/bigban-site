import type { PaceCurveView } from "@/lib/growth/analyticsView";

interface PaceCurvePanelProps {
  view: PaceCurveView | null;
}

export function PaceCurvePanel({ view }: PaceCurvePanelProps) {
  if (view === null) {
    return <section aria-labelledby="analytics-pace-heading"><h2 id="analytics-pace-heading">ペースカーブ</h2><p className="analytics-pace-collecting"><strong>収集中</strong><span>予約ペースの取り込み待ちです</span></p></section>;
  }

  return <section aria-labelledby="analytics-pace-heading">
    <h2 id="analytics-pace-heading">ペースカーブ</h2>
    {view.points.length === 0 ? <p>データなし</p> : <>
    <ul className="analytics-pace-points">
      {view.points.map((point) => <li key={point.daysOut}>
        <strong>+{point.daysOut}日 {point.current}件</strong>
        <span>{point.baseline === null ? "基準 収集中" : `基準 ${point.baseline}件${point.pct === null ? "" : `(${point.pct}%)`}`}</span>
        <div className="analytics-pace-bars" aria-hidden="true">
          <div className="analytics-pace-bar-track"><div className="analytics-pace-current-bar" style={{ width: `${point.currentWidthPct}%` }} /></div>
          <div className="analytics-pace-bar-track"><div className="analytics-pace-baseline-bar" style={{ width: `${point.baselineWidthPct}%` }} /></div>
        </div>
      </li>)}
    </ul>
    {view.state === "collecting" ? <small className="analytics-pace-note">基準は履歴6週で表示されます</small> : null}
    </>}
  </section>;
}
