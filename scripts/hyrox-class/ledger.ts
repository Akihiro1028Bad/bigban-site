/** Notion「Labora 予約台帳」から全予約を読む。連絡先の列は取得しない。 */
import type { NotionClient } from "../early-morning/notionClient";
import { readDate, readPlainText, readSelect, type NotionPage } from "../early-morning/notionProps";
import { EXCLUDED_RESERVATION_NOS } from "./config";
import type { LedgerRow } from "./types";

export const LEDGER_COLUMNS = ["予約番号", "予約者", "利用日", "時間帯", "ステータス", "受付日時", "コート", "予約種別", "イベント名"] as const;

const START_TIME_LENGTH = 5;

export function toLedgerRow(page: NotionPage): LedgerRow | null {
  const name = readPlainText(page, "予約者").trim();
  const date = readDate(page, "利用日");
  const timeSlot = readPlainText(page, "時間帯").trim();
  const status = readSelect(page, "ステータス");
  const kind = readSelect(page, "予約種別");
  if (!name || !date || timeSlot.length < START_TIME_LENGTH || !status) return null;
  if (kind !== "イベント" && kind !== "スペース") return null;
  return {
    reservationNo: readPlainText(page, "予約番号").trim(),
    name,
    date: date.slice(0, 10),
    startTime: timeSlot.slice(0, START_TIME_LENGTH),
    isCancelled: status === "キャンセル",
    court: readSelect(page, "コート"),
    kind,
    eventName: readPlainText(page, "イベント名").trim(),
  };
}

export async function fetchLedgerRows(client: NotionClient, ledgerDbId: string): Promise<{ rows: LedgerRow[]; skipped: number }> {
  const database = await client.getDatabase(ledgerDbId);
  const propertyIds = LEDGER_COLUMNS.map((name) => {
    const column = database.properties[name];
    if (!column) throw new Error(`予約台帳に列「${name}」がありません`);
    return column.id;
  });
  const parsed = (await client.queryAll(ledgerDbId, {}, propertyIds)).map(toLedgerRow);
  const rows = parsed.filter((row): row is LedgerRow => row !== null);
  return {
    rows: rows.filter((row) => !EXCLUDED_RESERVATION_NOS.includes(row.reservationNo)),
    skipped: parsed.length - rows.length,
  };
}
