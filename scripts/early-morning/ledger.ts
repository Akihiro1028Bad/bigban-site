/** Notion「Labora 予約台帳」から早朝イベントの予約を読む。連絡先の列は取得しない。 */
import { EARLY_START_TIME } from "./config";
import type { NotionClient } from "./notionClient";
import { readDate, readPlainText, readSelect, type NotionPage } from "./notionProps";
import type { LbReservation } from "./types";

export const LEDGER_COLUMNS = ["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時"] as const;

export function isEarlyTimeSlot(slot: string): boolean {
  return slot.trim().slice(0, 5) === EARLY_START_TIME;
}

export function toReservation(page: NotionPage): LbReservation | null {
  const name = readPlainText(page, "予約者").trim();
  const date = readDate(page, "利用日");
  const timeSlot = readPlainText(page, "時間帯").trim();
  if (!name || !date || !timeSlot) return null;
  return {
    reservationNo: readPlainText(page, "予約番号"),
    name,
    date: date.slice(0, 10),
    timeSlot,
    isCancelled: readSelect(page, "ステータス") === "キャンセル",
    receivedAt: readDate(page, "受付日時"),
  };
}

export async function fetchEarlyReservations(client: NotionClient, ledgerDbId: string): Promise<LbReservation[]> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = LEDGER_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const pages = await client.queryAll(
    ledgerDbId,
    { filter: { property: "予約種別", select: { equals: "イベント" } } },
    propertyIds,
  );
  return pages
    .map(toReservation)
    .filter((reservation): reservation is LbReservation => reservation !== null && isEarlyTimeSlot(reservation.timeSlot));
}
