import type { Snapshot } from "./snapshotSchema";

export interface PublicFacingPack {
  weekly: { actualReservations: number; selfRatePct: number | null };
  topWards: { ward: string; customers: number }[];
  personaTop: { label: string; count: number }[];
  programFills: { name: string; heldOn: string; fillRate: number | null }[];
  leadTimeMedianDays: number | null;
  newInsights: { title: string; body: string; label: string; evidenceNote: string }[];
}

/** 消費者向けにPIIや少数セグメントを含まない集計データを作る。 */
export function buildPublicFacingPack(snapshot: Snapshot): PublicFacingPack {
  const personaCounts = new Map<string, number>();
  for (const demographic of snapshot.catalog.demographics ?? []) {
    const label = `${demographic.ageBand} ${demographic.gender}`;
    personaCounts.set(label, (personaCounts.get(label) ?? 0) + demographic.count);
  }

  return {
    weekly: {
      actualReservations: snapshot.kpi.actual.currentWeek,
      selfRatePct: snapshot.kpi.self.total4w > 0 ? Math.round((snapshot.kpi.self.selfCount4w / snapshot.kpi.self.total4w) * 100) : null,
    },
    // k=3未満の商圏セグメントは再識別防止のため公開しない。
    topWards: snapshot.catalog.wards.filter((ward) => ward.customers >= 3).map((ward) => ({ ward: ward.ward, customers: ward.customers })).sort((left, right) => right.customers - left.customers).slice(0, 10),
    personaTop: [...personaCounts.entries()].map(([label, count]) => ({ label, count })).filter((persona) => persona.count >= 3).sort((left, right) => right.count - left.count).slice(0, 5),
    programFills: (snapshot.catalog.programFills ?? []).map((program) => ({ name: program.name, heldOn: program.heldOn, fillRate: program.fillRate })),
    leadTimeMedianDays: snapshot.catalog.leadTime?.median ?? null,
    // D8はpseudoId断片、D12は備考由来のため公開面から除外する。
    newInsights: snapshot.insights.filter((insight) => insight.status === "new" && insight.detector !== "D8" && insight.detector !== "D12").slice(0, 10).map((insight) => ({
      title: insight.title,
      body: insight.body,
      label: insight.label,
      evidenceNote: typeof insight.evidence.n === "number" ? `n=${insight.evidence.n}・${insight.label}` : insight.label,
    })),
  };
}
