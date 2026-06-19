// @vitest-environment node
import { describe, expect, it } from "vitest";

import { revisePhase } from "./revisePhase";

describe("revisePhase", () => {
  it("依頼中/処理中は pending", () => {
    expect(revisePhase("依頼中")).toBe("pending");
    expect(revisePhase("処理中")).toBe("pending");
  });

  it("提示中は ready", () => {
    expect(revisePhase("提示中")).toBe("ready");
  });

  it("失敗は failed", () => {
    expect(revisePhase("失敗")).toBe("failed");
  });

  it("なし/未設定/想定外は idle", () => {
    expect(revisePhase("なし")).toBe("idle");
    expect(revisePhase(undefined)).toBe("idle");
    expect(revisePhase("謎")).toBe("idle");
  });
});
