import type { FunnelView } from "@/lib/growth/analyticsView";

interface FunnelPanelProps {
  view: FunnelView | null;
}

export function FunnelPanel({ view }: FunnelPanelProps) {
  if (view === null) {
    return <section aria-labelledby="analytics-funnel-heading"><h2 id="analytics-funnel-heading">予約ファネル</h2><p className="analytics-funnel-collecting"><strong>収集中</strong><span>(タグ設置後の取り込み待ち)</span></p></section>;
  }

  return <section aria-labelledby="analytics-funnel-heading">
    <h2 id="analytics-funnel-heading">予約ファネル({view.week})</h2>
    <ul className="analytics-funnel-stages">
      {view.stages.map((stage) => {
        return <li key={stage.label}>
          <div className="analytics-funnel-stage-label"><strong>{stage.label} {stage.total}件</strong>{stage.retentionPct === null ? null : <small>→ {stage.retentionPct}%</small>}{stage.label === "予約クリック" ? null : <small>レンタル {stage.rental}件 / プログラム {stage.program}件</small>}</div>
          <div className="analytics-funnel-bar-track" aria-hidden="true"><div className="analytics-funnel-bar" style={{ width: `${stage.widthPct}%` }} /></div>
        </li>;
      })}
    </ul>
    <p className={`analytics-funnel-capture${view.capture.isAlert ? " analytics-funnel-capture-alert" : ""}`}>{view.capture.text}{view.capture.isAlert ? <strong>要確認</strong> : null}</p>
    <small className="analytics-funnel-note">{view.note}</small>
  </section>;
}
