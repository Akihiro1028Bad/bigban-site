import { describe, expect, it } from "vitest";

import { formatLastUpdated, POLL_FAIL_THRESHOLD, shouldWarnPollStale } from "./pollHealth";

describe("shouldWarnPollStale", () => {
  it("閾値未満は警告しない", () => {
    expect(shouldWarnPollStale(0)).toBe(false);
    expect(shouldWarnPollStale(POLL_FAIL_THRESHOLD - 1)).toBe(false);
  });
  it("閾値以上で警告する", () => {
    expect(shouldWarnPollStale(POLL_FAIL_THRESHOLD)).toBe(true);
    expect(shouldWarnPollStale(POLL_FAIL_THRESHOLD + 5)).toBe(true);
  });
  it("閾値は指定で上書きできる", () => {
    expect(shouldWarnPollStale(1, 1)).toBe(true);
    expect(shouldWarnPollStale(0, 1)).toBe(false);
  });
});

describe("formatLastUpdated", () => {
  it("null は —", () => {
    expect(formatLastUpdated(null)).toBe("—");
  });
  it("ローカル時刻を hh:mm(ゼロ埋め)で返す", () => {
    const ms = new Date(2026, 5, 25, 9, 5).getTime();
    expect(formatLastUpdated(ms)).toBe("09:05");
  });
  it("二桁の時刻もそのまま", () => {
    const ms = new Date(2026, 5, 25, 14, 30).getTime();
    expect(formatLastUpdated(ms)).toBe("14:30");
  });
});
