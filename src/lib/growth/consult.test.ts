import { describe, expect, it } from "vitest";

import { isConsultBusy, mapLoopStatus, STAGE_KINDS } from "./consult";

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
