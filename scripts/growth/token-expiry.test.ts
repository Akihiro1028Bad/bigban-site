// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildTokenExpiryWarning, parseExpiresAt } from "./token-expiry";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 16); // 2026-06-16

describe("parseExpiresAt", () => {
  it("ISO 文字列を epoch ms にする", () => {
    expect(parseExpiresAt("2026-06-23T00:00:00.000Z")).toBe(Date.UTC(2026, 5, 23));
  });

  it("数値文字列(epoch ms)をそのまま数値にする", () => {
    expect(parseExpiresAt(String(NOW))).toBe(NOW);
  });

  it("未設定・空・不正値は null", () => {
    expect(parseExpiresAt(undefined)).toBeNull();
    expect(parseExpiresAt("")).toBeNull();
    expect(parseExpiresAt("   ")).toBeNull();
    expect(parseExpiresAt("not-a-date")).toBeNull();
  });
});

describe("buildTokenExpiryWarning", () => {
  it("失効日が未知(null)なら警告を出さない", () => {
    expect(buildTokenExpiryWarning({ expiresAt: null, now: NOW })).toBeNull();
  });

  it("閾値より先(余裕あり)なら警告を出さない", () => {
    expect(
      buildTokenExpiryWarning({ expiresAt: NOW + 31 * DAY, now: NOW })
    ).toBeNull();
  });

  it("閾値以内なら残り日数つきで警告する", () => {
    const msg = buildTokenExpiryWarning({ expiresAt: NOW + 5 * DAY, now: NOW });
    expect(msg).toContain("⚠");
    expect(msg).toContain("5日");
    expect(msg).toContain("再取得");
  });

  it("当日(残り0日)も警告する", () => {
    const msg = buildTokenExpiryWarning({ expiresAt: NOW, now: NOW });
    expect(msg).toContain("0日");
  });

  it("既に失効していれば失効済みとして警告する", () => {
    const msg = buildTokenExpiryWarning({ expiresAt: NOW - 2 * DAY, now: NOW });
    expect(msg).toContain("⚠");
    expect(msg).toContain("失効しました");
  });

  it("閾値は引数で変更できる", () => {
    expect(
      buildTokenExpiryWarning({ expiresAt: NOW + 10 * DAY, now: NOW, thresholdDays: 7 })
    ).toBeNull();
    expect(
      buildTokenExpiryWarning({ expiresAt: NOW + 6 * DAY, now: NOW, thresholdDays: 7 })
    ).toContain("6日");
  });
});
