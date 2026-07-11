// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  failureSignature,
  shouldSendFailureNotice,
  type NotifyThrottleRecord,
} from "./notify-throttle";

describe("failureSignature", () => {
  it("工程と分類から安定したシグネチャを作る", () => {
    expect(failureSignature("create", "timeout")).toBe("create:timeout");
  });
});

describe("shouldSendFailureNotice（連続失敗通知の集約 / #58）", () => {
  const WINDOW = 10 * 60 * 1000;

  it("初回は送信し、記録を追加する", () => {
    const r = shouldSendFailureNotice([], "create:timeout", 1000, WINDOW);
    expect(r.send).toBe(true);
    expect(r.records).toEqual([{ signature: "create:timeout", sentAtMs: 1000 }]);
  });

  it("ウィンドウ内の同一シグネチャは抑制する(N通防止)", () => {
    const records: NotifyThrottleRecord[] = [
      { signature: "create:timeout", sentAtMs: 1000 },
    ];
    const r = shouldSendFailureNotice(records, "create:timeout", 1000 + 5 * 60 * 1000, WINDOW);
    expect(r.send).toBe(false);
    // 記録は維持(新規追加しない)
    expect(r.records).toEqual(records);
  });

  it("ウィンドウを過ぎた古い記録は剪定し、再度送信する", () => {
    const records: NotifyThrottleRecord[] = [
      { signature: "create:timeout", sentAtMs: 1000 },
    ];
    const now = 1000 + WINDOW + 1;
    const r = shouldSendFailureNotice(records, "create:timeout", now, WINDOW);
    expect(r.send).toBe(true);
    expect(r.records).toEqual([{ signature: "create:timeout", sentAtMs: now }]);
  });

  it("別シグネチャは独立して送信する", () => {
    const records: NotifyThrottleRecord[] = [
      { signature: "create:timeout", sentAtMs: 1000 },
    ];
    const r = shouldSendFailureNotice(records, "eyecatch:upload:external", 2000, WINDOW);
    expect(r.send).toBe(true);
    expect(r.records).toHaveLength(2);
  });
});
