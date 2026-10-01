/** 週次ヘルスチェックの各節の整形。出力は件数だけで、個人名は扱わない。 */
import type { LedgerWeekCounts } from "./ledgerWeekly";
import type { TennisbearApplicationCounts } from "./tennisbearApplications";

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function weekLabel(week: string, currentWeek: string): string {
  return `${week}週${week === currentWeek ? "(途中)" : ""}`;
}

export function formatReconciliation(
  weeks: readonly string[],
  ga4: ReadonlyMap<string, number>,
  ledger: ReadonlyMap<string, LedgerWeekCounts>,
  undatedLedger: number,
  currentWeek: string,
): string {
  const lines = weeks.map((week) => {
    const completed = ga4.get(week) ?? 0;
    const counts = ledger.get(week) ?? { received: 0, cancelled: 0 };
    return `${weekLabel(week, currentWeek)}  GA4完了=${completed} 台帳受付=${counts.received} 差=${signed(completed - counts.received)} (うちキャンセル ${counts.cancelled})`;
  });
  lines.push("差の読み方: GA4が多い=重複発火・別経路の完了の疑い / GA4が少ない=計測漏れ・別端末の予約の疑い");
  if (undatedLedger > 0) lines.push(`※受付日時のない台帳 ${undatedLedger} 件は含まない`);
  return lines.join("\n");
}

export function formatTennisbear(
  weeks: readonly string[],
  clicks: ReadonlyMap<string, number>,
  applications: TennisbearApplicationCounts,
  currentWeek: string,
): string {
  const lines = weeks.map((week) => {
    const clickCount = clicks.get(week) ?? 0;
    const applied = applications.byWeek.get(week) ?? 0;
    const rate = clickCount === 0 ? "―" : `${Math.round((applied / clickCount) * 100)}%`;
    return `${weekLabel(week, currentWeek)}  クリック=${clickCount} 申込=${applied} 申込÷クリック=${rate}`;
  });
  lines.push(`対象 ${applications.events} 回・申込日時なし ${applications.undated} 件は含まない`);
  return lines.join("\n");
}
