// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionClient } from "../early-morning/notionClient";
import type { NotionPage } from "../early-morning/notionProps";
import { ledgerProps, type LedgerPageInput } from "./fixtures/notionProps";
import { LEDGER_COLUMNS, fetchLedgerRows, toLedgerRow } from "./ledger";

function page(input: LedgerPageInput = {}): NotionPage {
  return { id: "p", properties: ledgerProps(input) };
}

/** 台帳の読み取りに使う2メソッドだけを持つ偽物。列 ID は列名と同じにする。 */
function stubNotion(columns: readonly string[], pages: NotionPage[]) {
  const queries: { db: string; filterPropertyIds: readonly string[] }[] = [];
  const unused = async (): Promise<never> => {
    throw new Error("このテストでは使わない");
  };
  const client: NotionClient = {
    getDatabase: async () => ({ properties: Object.fromEntries(columns.map((name) => [name, { id: name }])) }),
    queryAll: async (db, _body, filterPropertyIds = []) => {
      queries.push({ db, filterPropertyIds });
      return pages;
    },
    createPage: unused,
    updatePage: unused,
    archivePage: unused,
    listChildren: unused,
    deleteBlock: unused,
    appendChildren: unused,
  };
  return { client, queries };
}

describe("toLedgerRow", () => {
  it("読む列から行を作り、開始時刻は時間帯の先頭5文字、前後の空白は除く", () => {
    expect(toLedgerRow(page({ slot: "19:00～19:50", event: " HYROX TRAINING @ DAISUKE CLASS ビギナーの部 " }))).toEqual({
      reservationNo: "#100",
      name: "架空一郎",
      date: "2026-09-30",
      startTime: "19:00",
      isCancelled: false,
      court: "HYROX",
      kind: "イベント",
      memberNo: null,
      eventName: "HYROX TRAINING @ DAISUKE CLASS ビギナーの部",
    });
  });

  it("台帳ページの既定値は 9/30 20:00 の DAISUKE CLASS の有効な予約", () => {
    expect(toLedgerRow({ id: "p", properties: ledgerProps() })).toEqual({
      reservationNo: "#100",
      name: "架空一郎",
      date: "2026-09-30",
      startTime: "20:00",
      isCancelled: false,
      court: "HYROX",
      kind: "イベント",
      memberNo: null,
      eventName: "HYROX TRAINING @ DAISUKE CLASS",
    });
  });

  it("会員番号を読む。空と「-」は null(会員番号がない行も有効な行)", () => {
    expect(toLedgerRow(page({ member: " 99001 " }))?.memberNo).toBe("99001");
    expect(toLedgerRow(page({ member: "-" }))?.memberNo).toBeNull();
    expect(toLedgerRow(page({ member: "" }))?.memberNo).toBeNull();
    expect(toLedgerRow(page({ member: null }))).not.toBeNull();
  });

  it.each([
    ["#99001", "99001"],
    [" ＃99001 ", "99001"],
    ["##99001", "99001"],
    ["９９００１", "99001"],
    ["#", null],
    ["＃-", null],
  ])("会員番号「%s」は先頭の # を除いて正規化する(「#99001」と「99001」を同じ番号にする)", (member, expected) => {
    expect(toLedgerRow(page({ member }))?.memberNo).toBe(expected);
  });

  it("キャンセルとスペース予約を読む", () => {
    expect(toLedgerRow(page({ status: "キャンセル", kind: "スペース", event: "" }))).toMatchObject({
      isCancelled: true,
      kind: "スペース",
      eventName: "",
    });
  });

  it.each([
    ["予約者が空", { name: " " }],
    ["利用日がない", { date: null }],
    ["時間帯が短い", { slot: "9:0" }],
    ["ステータスがない", { status: null }],
    ["予約種別がない", { kind: null }],
    ["予約種別が想定外", { kind: "その他" }],
  ])("%sなら null", (_label, input) => {
    expect(toLedgerRow(page(input))).toBeNull();
  });
});

describe("fetchLedgerRows", () => {
  it("10列だけを指定して読み、テスト予約を除き、読めない行を数える", async () => {
    const { client, queries } = stubNotion(
      [...LEDGER_COLUMNS, "電話番号"],
      [page({ no: "#100" }), page({ no: "#3" }), page({ no: "#101", name: "" })],
    );

    const result = await fetchLedgerRows(client, "ledger");

    expect(result.rows.map((row) => row.reservationNo)).toEqual(["#100"]);
    expect(result.skipped).toBe(1);
    expect(queries).toEqual([{ db: "ledger", filterPropertyIds: [...LEDGER_COLUMNS] }]);
  });

  it("列が欠けていたら失敗する", async () => {
    const { client } = stubNotion(
      LEDGER_COLUMNS.filter((name) => name !== "イベント名"),
      [],
    );
    await expect(fetchLedgerRows(client, "ledger")).rejects.toThrow("予約台帳に列「イベント名」がありません");
  });
});
