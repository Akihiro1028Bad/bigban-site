import { describe, expect, it } from "vitest";

import { analyticsSnapshot } from "./__fixtures__/analyticsSnapshot";
import { buildPublicFacingPack } from "./publicFacingPack";

describe("buildPublicFacingPack", () => {
  it("公開用の週次値と、k=3以上の商圏・ペルソナだけを返す", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.wards = [{ ward: "2人区", customers: 2, reservations: 2 }, { ward: "3人区", customers: 3, reservations: 3 }, { ward: "5人区", customers: 5, reservations: 5 }];
    snapshot.catalog.demographics = [{ ageBand: "20代", gender: "女性", customerType: "一般", count: 2 }, { ageBand: "30代", gender: "男性", customerType: "一般", count: 2 }, { ageBand: "30代", gender: "男性", customerType: "会員", count: 1 }, { ageBand: "40代", gender: "女性", customerType: "一般", count: 5 }];
    expect(buildPublicFacingPack(snapshot)).toMatchObject({ weekly: { actualReservations: 8, selfRatePct: 75, selfRateCi: { lowPct: 47, highPct: 91 } }, topWards: [{ ward: "5人区", customers: 5 }, { ward: "3人区", customers: 3 }], personaTop: [{ label: "40代 女性", count: 5 }, { label: "30代 男性", count: 3 }] });
  });

  it("欠落カタログを空配列・nullにし、定員と人数をプログラム公開値に含めない", () => {
    const pack = buildPublicFacingPack(analyticsSnapshot());
    expect(pack.programFills).toEqual([]);
    expect(pack.leadTimeMedianDays).toBeNull();
    expect(pack.weekly.selfRatePct).toBe(75);
    expect(pack.weekly.selfRateCi).toEqual({ lowPct: 47, highPct: 91 });
  });

  it("プログラム、リードタイム、公開適格なnew気づきだけを返す", () => {
    const snapshot = analyticsSnapshot();
    snapshot.kpi.self = { selfCount4w: 0, total4w: 0, smartphone4w: 0, unknown4w: 0 };
    snapshot.catalog.programFills = [{ name: "初級", heldOn: "2026-07-17", start: "10:00", capacity: 6, reserved: 4, fillRate: 0.67 }];
    snapshot.catalog.leadTime = { n: 4, median: 9, p25: 3, p75: 14 };
    snapshot.insights.push(
      { id: "d8", detector: "D8", severity: "info", title: "除外", body: "pseudoId", evidence: { n: 3 }, label: "観察", firstSeen: "2026-07-17", status: "new" },
      { id: "d12", detector: "D12", severity: "info", title: "除外", body: "備考", evidence: { n: 3 }, label: "観察", firstSeen: "2026-07-17", status: "new" },
    );
    const pack = buildPublicFacingPack(snapshot);
    expect(pack.weekly.selfRatePct).toBeNull();
    expect(pack.weekly.selfRateCi).toBeNull();
    expect(pack.programFills).toEqual([{ name: "初級", heldOn: "2026-07-17", fillRate: 0.67 }]);
    expect(pack.leadTimeMedianDays).toBe(9);
    expect(pack.newInsights).toEqual([{ title: "情報", body: "情報本文", label: "観察", evidenceNote: "n=3・観察" }, { title: "要確認", body: "警告本文", label: "有意", evidenceNote: "n=12・有意" }]);
  });

  it("根拠nがない気づきはラベルだけの根拠表示にする", () => {
    const snapshot = analyticsSnapshot();
    snapshot.insights = [{ id: "without-n", detector: "D1", severity: "info", title: "根拠なし", body: "本文", evidence: {}, label: "観察", firstSeen: "2026-07-17", status: "new" }];
    expect(buildPublicFacingPack(snapshot).newInsights).toEqual([{ title: "根拠なし", body: "本文", label: "観察", evidenceNote: "観察" }]);
  });

  it("リードタイム中央値はk=3以上だけを公開する", () => {
    const snapshot = analyticsSnapshot();
    snapshot.catalog.leadTime = { n: 2, median: 6, p25: 4, p75: 8 };
    expect(buildPublicFacingPack(snapshot).leadTimeMedianDays).toBeNull();

    snapshot.catalog.leadTime = { n: 3, median: 6, p25: 4, p75: 8 };
    expect(buildPublicFacingPack(snapshot).leadTimeMedianDays).toBe(6);
  });

  it("許可リスト外の将来検出器を公開しない", () => {
    const snapshot = analyticsSnapshot();
    snapshot.insights = [{ id: "future", detector: "D99", severity: "info", title: "将来検出器", body: "本文", evidence: { n: 1 }, label: "観察", firstSeen: "2026-07-17", status: "new" }];

    expect(buildPublicFacingPack(snapshot).newInsights).toEqual([]);
  });
});
