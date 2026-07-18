import { describe, expect, it } from "vitest";
import { dormantRisk } from "./dormantRisk";

function reservation(id: string, pseudoId: string | null, useDate: string) { return { reservationId: id, pseudoId, useDate, status: "confirmed" }; }
function detect(reservations: object[]) { return dormantRisk({ bundle: { reservations }, previousSnapshot: null, baselineInputs: null, history: [], funnel: null, onTheBooks: null, kpi: null, current: { start: "", end: "" }, prior: { start: "", end: "" }, todayYmd: "2026-07-31" } as never); }

describe("dormantRisk", () => {
  it("休眠リスクを経過日数順に最大5人、ID先頭8文字だけで通知する", () => {
    const rows = Array.from({ length: 6 }, (_, index) => [reservation(`a${index}`, `member-${index}-long-id`, "2026-06-01"), reservation(`b${index}`, `member-${index}-long-id`, "2026-06-06"), reservation(`c${index}`, `member-${index}-long-id`, "2026-06-11")]).flat();
    const insight = detect(rows)[0];
    expect(insight).toMatchObject({ id: "d8:dormant:2026-07-31", evidence: { n: 6 }, label: "観察" });
    expect((insight?.evidence.members as { id: string }[])).toHaveLength(5);
    expect((insight?.evidence.members as { id: string }[])[0]?.id).toBe("member-0");
  });
  it("中央値の2倍ちょうどは休眠とせず、pseudoIdなしと3回未満を除外する", () => {
    expect(detect([reservation("a", "edge", "2026-07-07"), reservation("b", "edge", "2026-07-12"), reservation("c", "edge", "2026-07-17"), reservation("n", null, "2026-06-01"), reservation("n2", null, "2026-06-02"), reservation("n3", null, "2026-06-03")])).toEqual([]);
  });
});
