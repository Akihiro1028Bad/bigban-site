import { describe, expect, it } from "vitest";

import { isConsultBusy, mapLoopStatus, overallViewFrom, STAGE_KINDS } from "./consult";
import type { AdviceView } from "@/lib/growth/advise";

describe("mapLoopStatus", () => {
  it("依頼中→requested / 処理中→processing / 提示中→presenting / 失敗→failed", () => {
    expect(mapLoopStatus("依頼中")).toBe("requested");
    expect(mapLoopStatus("処理中")).toBe("processing");
    expect(mapLoopStatus("提示中")).toBe("presenting");
    expect(mapLoopStatus("失敗")).toBe("failed");
  });

  it("なし/undefined/未知 は null（ビューに出さない）", () => {
    expect(mapLoopStatus("なし")).toBeNull();
    expect(mapLoopStatus(undefined)).toBeNull();
    expect(mapLoopStatus("謎")).toBeNull();
  });
});

describe("isConsultBusy", () => {
  it("requested/processing/presenting は再依頼不可（busy=true）", () => {
    expect(isConsultBusy("requested")).toBe(true);
    expect(isConsultBusy("processing")).toBe(true);
    expect(isConsultBusy("presenting")).toBe(true);
  });

  it("failed/null は再依頼可（busy=false）", () => {
    expect(isConsultBusy("failed")).toBe(false);
    expect(isConsultBusy(null)).toBe(false);
  });
});

describe("STAGE_KINDS", () => {
  it("構成案段階=revise のみ / 下書き段階=overall+sentence", () => {
    expect(STAGE_KINDS.outline).toEqual(["revise"]);
    expect(STAGE_KINDS.draft).toEqual(["overall", "sentence"]);
  });
});

describe("overallViewFrom", () => {
  const advice = { summary: "良い", scores: [{ axis: "構成", score: 4 }], strengths: ["短文"], fixes: [] };

  it("提示中: status=presenting・advice/raw/requestedAtMs を透過し apply も載せる", () => {
    const view: AdviceView = { status: "提示中", advice, raw: "{...}", requestedAtMs: 1000 };
    const apply = { status: "なし" as const, proposal: [], raw: "" };
    const r = overallViewFrom(view, apply);
    expect(r).toEqual({ kind: "overall", status: "presenting", advice, raw: "{...}", requestedAtMs: 1000, apply });
  });

  it("依頼中: status=requested・advice=null", () => {
    const view: AdviceView = { status: "依頼中", advice: null, raw: "" };
    const r = overallViewFrom(view, undefined);
    expect(r?.status).toBe("requested");
    expect(r?.advice).toBeNull();
    expect(r?.requestedAtMs).toBeNull();
    expect(r?.apply).toBeNull();
  });

  it("なし/undefined は null（未依頼）", () => {
    expect(overallViewFrom({ status: "なし", advice: null, raw: "" }, undefined)).toBeNull();
    expect(overallViewFrom(undefined, undefined)).toBeNull();
  });

  it("raw が空文字あるいは undefined なら空文字で返す", () => {
    const view1: AdviceView = { status: "処理中", advice: null, raw: "" };
    const r1 = overallViewFrom(view1, undefined);
    expect(r1?.raw).toBe("");

    const view2: AdviceView = { status: "失敗", advice: null, raw: "error message" };
    const r2 = overallViewFrom(view2, undefined);
    expect(r2?.raw).toBe("error message");

    // raw が undefined の場合
    const viewWithoutRaw = { status: "処理中", advice: null } as AdviceView;
    const r3 = overallViewFrom(viewWithoutRaw, undefined);
    expect(r3?.raw).toBe("");
  });

  it("requestedAtMs が undefined なら null で返す", () => {
    const view: AdviceView = { status: "提示中", advice, raw: "test" };
    const r = overallViewFrom(view, undefined);
    expect(r?.requestedAtMs).toBeNull();
  });

  it("apply が undefined なら null で返す", () => {
    const view: AdviceView = { status: "提示中", advice, raw: "test" };
    const r = overallViewFrom(view, undefined);
    expect(r?.apply).toBeNull();
  });
});
