import { wilsonIntervalPositive } from "./reservationStats";
import type { Snapshot } from "./snapshotSchema";

export interface PublicFacingPack {
  weekly: { actualReservations: number; selfRatePct: number | null; selfRateCi: { lowPct: number; highPct: number } | null };
  topWards: { ward: string; customers: number }[];
  personaTop: { label: string; count: number }[];
  programFills: { name: string; heldOn: string; fillRate: number | null }[];
  leadTimeMedianDays: number | null;
  newInsights: { title: string; body: string; label: string; evidenceNote: string }[];
}

const PUBLIC_DETECTORS = new Set(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D9", "D10", "D11", "D13"]);

/** 消費者向けにPIIや少数セグメントを含まない集計データを作る。 */
export function buildPublicFacingPack(snapshot: Snapshot): PublicFacingPack {
  const personaCounts = new Map<string, number>();
  for (const demographic of snapshot.catalog.demographics ?? []) {
    const label = `${demographic.ageBand} ${demographic.gender}`;
    personaCounts.set(label, (personaCounts.get(label) ?? 0) + demographic.count);
  }

  const selfRateCi = snapshot.kpi.self.total4w > 0
    ? (() => {
      const interval = wilsonIntervalPositive(snapshot.kpi.self.selfCount4w, snapshot.kpi.self.total4w);
      return { lowPct: Math.round(interval.low * 100), highPct: Math.round(interval.high * 100) };
    })()
    : null;

  return {
    weekly: {
      actualReservations: snapshot.kpi.actual.currentWeek,
      selfRatePct: snapshot.kpi.self.total4w > 0 ? Math.round((snapshot.kpi.self.selfCount4w / snapshot.kpi.self.total4w) * 100) : null,
      selfRateCi,
    },
    // k=3未満の商圏セグメントは再識別防止のため公開しない。
    topWards: snapshot.catalog.wards.filter((ward) => ward.customers >= 3).map((ward) => ({ ward: ward.ward, customers: ward.customers })).sort((left, right) => right.customers - left.customers).slice(0, 10),
    personaTop: [...personaCounts.entries()].map(([label, count]) => ({ label, count })).filter((persona) => persona.count >= 3).sort((left, right) => right.count - left.count).slice(0, 5),
    // fillRateは定員に対する確定値であり、標本比率ではないため信頼区間を付けない。
    programFills: (snapshot.catalog.programFills ?? []).map((program) => ({ name: program.name, heldOn: program.heldOn, fillRate: program.fillRate })),
    // リードタイムもk=3未満は再識別を避けるため中央値を公開しない。
    leadTimeMedianDays: snapshot.catalog.leadTime !== null && snapshot.catalog.leadTime.n >= 3 ? snapshot.catalog.leadTime.median : null,
    // 未知の将来検出器はPIIを含む可能性があるため、安全側のdefault-denyで公開しない。
    // D1は設計書§11でn=1の初出商圏等を記事ネタ根拠として想定するため、最小nを課さない。
    newInsights: snapshot.insights.filter((insight) => insight.status === "new" && PUBLIC_DETECTORS.has(insight.detector)).slice(0, 10).map((insight) => ({
      title: insight.title,
      body: insight.body,
      label: insight.label,
      evidenceNote: typeof insight.evidence.n === "number" ? `n=${insight.evidence.n}・${insight.label}` : insight.label,
    })),
  };
}
