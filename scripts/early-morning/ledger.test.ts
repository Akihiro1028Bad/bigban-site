// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { NotionClient } from "./notionClient";
import type { NotionPage } from "./notionProps";
import { LEDGER_COLUMNS, fetchEarlyReservations, isEarlyTimeSlot, toReservation } from "./ledger";

function ledgerPage(fields: { no?: string; name?: string; date?: string | null; slot?: string; status?: string; at?: string }): NotionPage {
  return {
    id: fields.no ?? "x",
    properties: {
      予約番号: { title: [{ plain_text: fields.no ?? "#1" }] },
      予約者: { rich_text: [{ plain_text: fields.name ?? "テスト太郎" }] },
      利用日: { date: fields.date === null ? null : { start: fields.date ?? "2026-09-22" } },
      時間帯: { rich_text: [{ plain_text: fields.slot ?? "06:00～08:00" }] },
      ステータス: { select: { name: fields.status ?? "有効" } },
      受付日時: { date: fields.at ? { start: fields.at } : null },
    },
  };
}

describe("isEarlyTimeSlot", () => {
  it.each(["06:00～08:00", "06:00-08:00", " 06:00〜08:00"])("%s は早朝", (slot) => {
    expect(isEarlyTimeSlot(slot)).toBe(true);
  });
  it("それ以外は早朝でない", () => {
    expect(isEarlyTimeSlot("19:00～20:00")).toBe(false);
  });
});

describe("toReservation", () => {
  it("必要な6列だけを読む", () => {
    expect(toReservation(ledgerPage({ no: "#871", status: "キャンセル", at: "2026-09-10T21:00:00.000+09:00" }))).toEqual({
      reservationNo: "#871",
      name: "テスト太郎",
      date: "2026-09-22",
      timeSlot: "06:00～08:00",
      isCancelled: true,
      receivedAt: "2026-09-10T21:00:00.000+09:00",
    });
  });

  it("利用日・氏名・時間帯が欠けていれば null", () => {
    expect(toReservation(ledgerPage({ date: null }))).toBeNull();
    expect(toReservation(ledgerPage({ name: "" }))).toBeNull();
    expect(toReservation(ledgerPage({ slot: "" }))).toBeNull();
  });
});

describe("fetchEarlyReservations", () => {
  it("6列の ID で絞ってイベント予約を取り、早朝だけ返す", async () => {
    const properties = Object.fromEntries(LEDGER_COLUMNS.map((name, i) => [name, { id: `id${i}` }]));
    const notion = {
      getDatabase: vi.fn(async () => ({ properties })),
      queryAll: vi.fn(async () => [ledgerPage({ no: "#1" }), ledgerPage({ no: "#2", slot: "19:00-20:00" }), ledgerPage({ date: null })]),
    } as unknown as NotionClient;

    const result = await fetchEarlyReservations(notion, "ledger");

    expect(result.map((r) => r.reservationNo)).toEqual(["#1"]);
    expect(notion.queryAll).toHaveBeenCalledWith(
      "ledger",
      { filter: { property: "予約種別", select: { equals: "イベント" } } },
      ["id0", "id1", "id2", "id3", "id4", "id5"],
    );
  });

  it("列が見つからなければエラー", async () => {
    const notion = { getDatabase: vi.fn(async () => ({ properties: {} })) } as unknown as NotionClient;
    await expect(fetchEarlyReservations(notion, "ledger")).rejects.toThrow("予約台帳に列「予約番号」がありません");
  });
});
