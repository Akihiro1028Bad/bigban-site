/** Notion「Labora 予約台帳」から、週ごとの受付件数だけを数える。読む列は3つだけ(氏名・連絡先は取らない)。 */
import type { NotionClient } from "../../early-morning/notionClient";
import { readDate, readPlainText, readSelect } from "../../early-morning/notionProps";
import { EXCLUDED_RESERVATION_NOS } from "../../hyrox-class/config";
import { instantToJstDate, weekStartOf } from "./weeks";

export const RECEIPT_COLUMNS = ["予約番号", "ステータス", "受付日時"] as const;

export interface LedgerWeekCounts {
  received: number;
  cancelled: number;
}

export async function fetchLedgerWeeklyCounts(
  client: NotionClient,
  ledgerDbId: string,
): Promise<{ byWeek: Map<string, LedgerWeekCounts>; undated: number }> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = RECEIPT_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const pages = await client.queryAll(ledgerDbId, {}, propertyIds);
  const byWeek = new Map<string, LedgerWeekCounts>();
  let undated = 0;
  for (const page of pages) {
    if (EXCLUDED_RESERVATION_NOS.includes(readPlainText(page, "予約番号").trim())) continue;
    const receivedAt = readDate(page, "受付日時");
    const date = receivedAt === null ? null : instantToJstDate(receivedAt);
    if (date === null) {
      undated += 1;
      continue;
    }
    const week = weekStartOf(date);
    const counts = byWeek.get(week) ?? { received: 0, cancelled: 0 };
    byWeek.set(week, {
      received: counts.received + 1,
      cancelled: counts.cancelled + (readSelect(page, "ステータス") === "キャンセル" ? 1 : 0),
    });
  }
  return { byWeek, undated };
}
