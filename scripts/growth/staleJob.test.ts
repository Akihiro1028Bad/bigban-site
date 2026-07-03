import { describe, expect, it } from "vitest";

import {
  isStaleJobRow,
  isStalledGeneratingRow,
  selectStaleJobIds,
  selectStalledGeneratingIds,
  selectWedgeJobIds,
} from "./staleJob";

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

describe("selectWedgeJobIds(requestedAt=null の wedge 行・#220-4)", () => {
  it("busy(処理中/依頼中)なのに依頼時刻が無い行=時間で reap できない wedge を拾う", () => {
    const rows = [
      { id: "wedge-a", status: "処理中", requestedAtMs: null },
      { id: "wedge-b", status: "依頼中", requestedAtMs: null },
      { id: "timed", status: "処理中", requestedAtMs: NOW - T }, // 時間判定できる=wedge ではない
      { id: "present", status: "提示中", requestedAtMs: null }, // 正常な人待ち
      { id: "done", status: "なし", requestedAtMs: null },
    ];
    expect(selectWedgeJobIds(rows)).toEqual(["wedge-a", "wedge-b"]);
  });

  it("wedge が無ければ空", () => {
    expect(selectWedgeJobIds([{ id: "x", status: "処理中", requestedAtMs: NOW }])).toEqual([]);
  });
});

describe("isStalledGeneratingRow(生成中の滞留・#220-3)", () => {
  it("生成中で lastEdited が timeout 超過は滞留(drafts 実行中に PC が落ちた)", () => {
    expect(
      isStalledGeneratingRow({ status: "生成中", lastEditedMs: NOW - T - 1 }, NOW, T)
    ).toBe(true);
  });

  it("生成待ちも対象(承認済みが拾われないまま止まっている)", () => {
    expect(
      isStalledGeneratingRow({ status: "承認", lastEditedMs: NOW - T - 1 }, NOW, T)
    ).toBe(true);
  });

  it("下書き作成済み・公開済みは滞留対象外", () => {
    expect(
      isStalledGeneratingRow({ status: "下書き作成済み", lastEditedMs: NOW - T - 1 }, NOW, T)
    ).toBe(false);
    expect(
      isStalledGeneratingRow({ status: "公開済み", lastEditedMs: NOW - T - 1 }, NOW, T)
    ).toBe(false);
  });

  it("timeout 未満なら対象外", () => {
    expect(
      isStalledGeneratingRow({ status: "生成中", lastEditedMs: NOW - 60_000 }, NOW, T)
    ).toBe(false);
  });

  it("ちょうど timeout は対象外(厳密超過のみ)", () => {
    expect(isStalledGeneratingRow({ status: "生成中", lastEditedMs: NOW - T }, NOW, T)).toBe(false);
  });

  it("lastEdited が無い行は対象外(誤検知を避ける)", () => {
    expect(isStalledGeneratingRow({ status: "生成中", lastEditedMs: null }, NOW, T)).toBe(false);
  });
});

describe("selectStalledGeneratingIds", () => {
  it("滞留した生成中/生成待ちの id だけを返す", () => {
    const rows = [
      { id: "gen-stuck", status: "生成中", lastEditedMs: NOW - T - 1 },
      { id: "queued-stuck", status: "承認", lastEditedMs: NOW - T - 1 },
      { id: "gen-fresh", status: "生成中", lastEditedMs: NOW - 1000 },
      { id: "drafted", status: "下書き作成済み", lastEditedMs: NOW - T - 1 },
    ];
    expect(selectStalledGeneratingIds(rows, NOW, T)).toEqual(["gen-stuck", "queued-stuck"]);
  });
});
