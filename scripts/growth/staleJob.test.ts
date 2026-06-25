import { describe, expect, it } from "vitest";

import { isStaleJobRow, selectStaleJobIds } from "./staleJob";

const T = 15 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("isStaleJobRow", () => {
  it("処理中で timeout 超過は stale(PC が処理中に落ちた)", () => {
    expect(isStaleJobRow({ status: "処理中", requestedAtMs: NOW - T - 1 }, NOW, T)).toBe(true);
  });

  it("依頼中で timeout 超過は stale(PC が拾う前に止まった=C2 止血)", () => {
    expect(isStaleJobRow({ status: "依頼中", requestedAtMs: NOW - T - 1 }, NOW, T)).toBe(true);
  });

  it("提示中は古くても stale ではない(正常な人待ち=H29 誤回収防止)", () => {
    expect(isStaleJobRow({ status: "提示中", requestedAtMs: NOW - T - 1 }, NOW, T)).toBe(false);
  });

  it("失敗・なし は対象外", () => {
    expect(isStaleJobRow({ status: "失敗", requestedAtMs: NOW - T - 1 }, NOW, T)).toBe(false);
    expect(isStaleJobRow({ status: "なし", requestedAtMs: NOW - T - 1 }, NOW, T)).toBe(false);
  });

  it("処理中・依頼中でも timeout 未満なら対象外", () => {
    expect(isStaleJobRow({ status: "処理中", requestedAtMs: NOW - 5 * 60 * 1000 }, NOW, T)).toBe(false);
    expect(isStaleJobRow({ status: "依頼中", requestedAtMs: NOW - 5 * 60 * 1000 }, NOW, T)).toBe(false);
  });

  it("ちょうど timeout は対象外(厳密超過のみ)", () => {
    expect(isStaleJobRow({ status: "処理中", requestedAtMs: NOW - T }, NOW, T)).toBe(false);
  });

  it("依頼時刻が無い行は対象外(誤回収を避ける)", () => {
    expect(isStaleJobRow({ status: "処理中", requestedAtMs: null }, NOW, T)).toBe(false);
  });
});

describe("selectStaleJobIds", () => {
  it("stale な id だけを返す(処理中・依頼中の超過分)", () => {
    const rows = [
      { id: "p-stale", status: "処理中", requestedAtMs: NOW - T - 1 },
      { id: "q-stale", status: "依頼中", requestedAtMs: NOW - T - 1 },
      { id: "fresh", status: "処理中", requestedAtMs: NOW - 1000 },
      { id: "present", status: "提示中", requestedAtMs: NOW - T - 1 },
      { id: "nodate", status: "処理中", requestedAtMs: null },
    ];
    expect(selectStaleJobIds(rows, NOW, T)).toEqual(["p-stale", "q-stale"]);
  });
});
