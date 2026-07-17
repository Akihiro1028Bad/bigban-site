import type { HeatmapCell } from "@/lib/growth/analyticsView";

interface DemandHeatmapProps { cells: readonly HeatmapCell[]; }

const DAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const SLOTS = ["6-9", "9-12", "12-15", "15-18", "18-21", "21-23"] as const;

function slotLabel(slot: string): string {
  return `${slot.replace("-", "–")}時`;
}

export function DemandHeatmap({ cells }: DemandHeatmapProps) {
  const cellsByCoordinate = new Map<string, HeatmapCell>(cells.map((cell): [string, HeatmapCell] => [`${cell.dow}-${cell.slot}`, cell]));

  return <section aria-labelledby="analytics-demand-heading">
    <h2 id="analytics-demand-heading">需要ヒートマップ</h2>
    {cells.length === 0 ? <p>需要データを収集中です。</p> : <div className="analytics-heatmap-scroll">
      <table className="analytics-heatmap">
        <caption className="analytics-sr-only">曜日と時間帯ごとの予約需要</caption>
        <thead><tr><th scope="col">時間帯</th>{DAYS.map((day) => <th key={day} scope="col">{day}</th>)}</tr></thead>
        <tbody>{SLOTS.map((slot) => <tr key={slot}>
          <th scope="row">{slotLabel(slot)}</th>
          {DAYS.map((_, dow) => {
            const cell = cellsByCoordinate.get(`${dow}-${slot}`) ?? { count: 0, intensity: 0 as const };
            return <td key={dow} className={`analytics-heatmap-cell intensity-${cell.intensity}`}>{cell.count}件</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
