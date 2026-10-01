// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { NotionClient } from "../../early-morning/notionClient";
import { EXCLUDED_RESERVATION_NOS } from "../../hyrox-class/config";
import { RECEIPT_COLUMNS, fetchLedgerWeeklyCounts } from "./ledgerWeekly";

function page(no: string, status: string | null, receivedAt: string | null) {
  return {
    id: no,
    properties: {
      予約番号: { rich_text: [{ plain_text: no }] },
      ステータス: { select: status ? { name: status } : null },
      受付日時: { date: receivedAt ? { start: receivedAt } : null },
    },
  };
}

function client(pages: ReturnType<typeof page>[], columns: readonly string[] = [...RECEIPT_COLUMNS, "予約者"]) {
  const queryAll = vi.fn(async () => pages);
  const getDatabase = vi.fn(async () => ({ properties: Object.fromEntries(columns.map((name) => [name, { id: `id-${name}` }])) }));
  return { notion: { getDatabase, queryAll } as unknown as NotionClient, queryAll };
}

describe("fetchLedgerWeeklyCounts", () => {
  it("受付日時の週ごとに数え、キャンセル済みも受付に含めて別にも数える", async () => {
    const { notion } = client([
      page("#10", "確定", "2026-09-28T09:00:00.000+09:00"),
      page("#11", "キャンセル", "2026-09-29"),
      page("#12", "確定", "2026-10-04T23:59:00.000+09:00"),
      page("#13", "確定", "2026-10-05T00:00:00.000+09:00"),
    ]);
    const { byWeek, undated } = await fetchLedgerWeeklyCounts(notion, "db");
    expect(byWeek.get("2026-09-28")).toEqual({ received: 3, cancelled: 1 });
    expect(byWeek.get("2026-10-05")).toEqual({ received: 1, cancelled: 0 });
    expect(undated).toBe(0);
  });

  it("テスト予約は除き、受付日時が無い/読めない行は undated に数える", async () => {
    const { notion } = client([
      page(EXCLUDED_RESERVATION_NOS[0], "確定", "2026-09-28"),
      page("#20", "確定", null),
      page("#21", "確定", "garbage"),
      page("#22", "確定", "2026-09-28"),
    ]);
    const { byWeek, undated } = await fetchLedgerWeeklyCounts(notion, "db");
    expect(byWeek.get("2026-09-28")).toEqual({ received: 1, cancelled: 0 });
    expect(undated).toBe(2);
  });

  it("読む列は予約番号・ステータス・受付日時の3列だけ(個人情報の列を取らない)", async () => {
    const { notion, queryAll } = client([]);
    await fetchLedgerWeeklyCounts(notion, "db");
    expect(queryAll).toHaveBeenCalledWith("db", {}, ["id-予約番号", "id-ステータス", "id-受付日時"]);
  });

  it("台帳に必要な列が無ければ例外", async () => {
    const { notion } = client([], ["予約番号", "ステータス"]);
    await expect(fetchLedgerWeeklyCounts(notion, "db")).rejects.toThrow("予約台帳に列「受付日時」がありません");
  });
});
