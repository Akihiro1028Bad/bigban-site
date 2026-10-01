// LaBOLA(予約システム)の段別ユーザー数。ページパスは 2026-10-01 に GA4 の実データで確認した。
// 完了ページは /r/api/payment/booking/complete/<id>(決済戻りの先)。
//
// カレンダーは「週表示」(/calendar_week/...)と「1日表示」(/calendar/YYYY/M/D/)がある。
// /reserve のボタンが1日表示に切り替わる(#514)と1段目の見え方が変わるため、内訳(isDetail)を並べる。
// 「合計」は両方に当たる1つのフィルタで数えるので、両方を見たユーザーを二重に数えない
// (/r/shop/3473/calendar/ の日付なしのトップも含む。自動アクセスが来るのはこのページ)。
import { LABOLA_HOST, andFilters, excludeAutomatedAccess, hostFilter, stringFilter } from "./hosts.mjs";

export const LABOLA_STEPS = [
  { label: "週表示", matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar_week/", isDetail: true },
  { label: "1日表示", matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar/", isDetail: true },
  { label: "カレンダー合計", matchType: "BEGINS_WITH", value: "/r/shop/3473/calendar" },
  { label: "予約情報", matchType: "CONTAINS", value: "/booking-info/" },
  { label: "顧客情報", matchType: "CONTAINS", value: "/customer-info/" },
  { label: "支払い", matchType: "CONTAINS", value: "/customer-payment/" },
  { label: "最終確認", matchType: "CONTAINS", value: "/customer-confirm/" },
  { label: "完了", matchType: "CONTAINS", value: "/booking/complete/" },
];

function users(report) {
  return Number(report.rows?.[0]?.metricValues?.[0]?.value ?? 0);
}

export async function collectLabolaFunnel(ga4, range) {
  const query = (step, humanOnly) =>
    ga4({
      dateRanges: [range],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: andFilters(
        hostFilter(LABOLA_HOST),
        stringFilter("pagePath", step.value, step.matchType),
        humanOnly ? excludeAutomatedAccess() : undefined
      ),
    });
  return Promise.all(
    LABOLA_STEPS.map(async (step) => {
      const [all, human] = await Promise.all([query(step, false), query(step, true)]);
      return { label: step.label, all: users(all), human: users(human), isDetail: step.isDetail === true };
    })
  );
}

export function formatLabolaFunnel(rows) {
  let previous = null;
  return rows
    .map((row) => {
      const counts = `全体=${row.all} 自動除外後=${row.human} (自動アクセス ${row.all - row.human})`;
      if (row.isDetail) return `  内訳 ${row.label}  ${counts}`;
      const passRate = previous === null ? "" : ` 前段から${previous > 0 ? `${Math.round((row.human / previous) * 100)}%` : "―"}`;
      previous = row.human;
      return `${row.label}  ${counts}${passRate}`;
    })
    .join("\n");
}
