import type { Snapshot } from "@/lib/growth/snapshotSchema";

interface WardListProps { wards: Snapshot["catalog"]["wards"]; }

export function WardList({ wards }: WardListProps) {
  return <section aria-labelledby="analytics-wards-heading"><h2 id="analytics-wards-heading">商圏</h2>{wards.length === 0 ? <p>商圏データを収集中です。</p> : <ul className="analytics-wards">{wards.map((ward) => <li key={ward.ward}><span>{ward.ward}</span><span>顧客 {ward.customers}人 / 予約 {ward.reservations}件</span></li>)}</ul>}</section>;
}
