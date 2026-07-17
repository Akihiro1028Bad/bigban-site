/** ラボーラCSV行の型付け・写像(純ロジック)。ヘッダー名で列解決し、位置に依存しない。 */

export interface YoyakuRow {
  reservationId: string; bookedAt: string; useDate: string; start: string; end: string;
  category: string; space: string; status: "confirmed" | "cancelled";
  acceptStatus: string; paymentStatus: string; paymentMethod: string; plan: string;
  amount: number | null; partySize: number | null;
  channel: "user_sp" | "user_pc" | "admin" | "unknown";
  customerType: string; memberNo: string; name: string; email: string;
  postal: string; address: string; gender: string; birthDate: string;
  occupation: string; remarks: string;
}

export interface CustomerRow {
  registeredAt: string; customerType: string; memberNo: string; name: string;
  email: string; postal: string; address: string; gender: string;
  birthDate: string; occupation: string;
}

export interface SalesSummaryRow {
  date: string; isForecast: boolean;
  rentalSpace: number; event: number; goods: number; total: number;
}

export interface ProgramRow { name: string; category: string; heldOn: string; start: string; end: string; capacity: number | null; status: string; publishStatus: string; }
export interface BlockedSlotRow { date: string; start: string; end: string; space: string; label: string; }

export function jpDateTimeToIso(value: string): string {
  const match = value.trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("日時を解釈できません");
  const [, year, month, day, hour, minute] = match;
  if (!isCalendarDate(Number(year), Number(month), Number(day)) || Number(hour) > 23 || Number(minute) > 59) throw new Error("日時が不正です");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+09:00`;
}

/** 時刻を分へ変換し、ゼロ埋めした HH:mm へ正規化する。 */
export function parseTimeOfDay(value: string): { minutes: number; normalized: string } {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("時刻が不正です");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("時刻が不正です");
  return { minutes: hour * 60 + minute, normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

export function jpDateToYmd(value: string): string {
  const cleaned = value.trim().replace(/（.*?）|\(.*?\)/g, "");
  const match = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/) ?? cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (!match || !isCalendarDate(Number(match?.[1]), Number(match?.[2]), Number(match?.[3]))) throw new Error("日付を解釈できません");
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
function isCalendarDate(year: number, month: number, day: number): boolean { const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day; }

function headerIndex(headers: readonly string[], required: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((name, index) => { if (!(name.trim() in map)) map[name.trim()] = index; });
  for (const name of required) {
    if (!(name in map)) throw new Error(`必須列 ${name} がありません`);
  }
  return map;
}

/** 必須列のセル自体が欠けた短い行を、空欄と区別して停止する。 */
function requiredCell(values: readonly string[], columns: Record<string, number>, name: string, rowNumber: number): string {
  const value = values[columns[name]];
  if (value === undefined) throw new Error(`${rowNumber}行目: 必須列 ${name} のセルがありません`);
  return value.trim();
}

function toAmount(value: string): number | null {
  const cleaned = value.replace(/[,¥\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error("金額を解釈できません");
  return parsed;
}

const STATUS_MAP: Record<string, YoyakuRow["status"]> = { "予約完了": "confirmed", "キャンセル": "cancelled" };
const CHANNEL_MAP: Record<string, YoyakuRow["channel"]> = { "スマートフォンでのユーザー": "user_sp", "PCでのユーザー": "user_pc", "管理者": "admin" };
const YOYAKU_REQUIRED = ["予約番号", "予約内容", "日付", "開始時間", "終了時間", "カテゴリー", "予約ステータス", "受付ステータス", "決済ステータス", "料金プラン", "金額", "支払い方法", "受付日時", "予約方法", "顧客タイプ", "会員番号", "名前", "メールアドレス", "郵便番号", "住所", "性別", "生年月日", "職業", "備考"] as const;

export function parseYoyakuRows(rows: string[][]): { rows: YoyakuRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("予約一覧CSVが空です");
  const columns = headerIndex(rows[0], YOYAKU_REQUIRED);
  const partySizeIndex = rows[0].findIndex((header) => header.trim() === "利用人数");
  const warnings: string[] = [];
  const result = rows.slice(1).map((values, rowIndex): YoyakuRow => {
    const rowNumber = rowIndex + 2;
    const cell = (name: string) => requiredCell(values, columns, name, rowNumber);
    const statusRaw = cell("予約ステータス");
    const status = STATUS_MAP[statusRaw];
    if (!status) throw new Error(`${rowIndex + 2}行目: 予約ステータスが不正です`);
    const channelRaw = cell("予約方法");
    const channel = CHANNEL_MAP[channelRaw] ?? "unknown";
    if (channel === "unknown" && channelRaw !== "") warnings.push(`${rowIndex + 2}行目: 予約方法が未対応です`);
    const partySizeRaw = partySizeIndex < 0 ? "" : (values[partySizeIndex] ?? "").trim();
    const partySize = partySizeRaw === "" ? null : Number(partySizeRaw);
    if (partySize !== null && !Number.isFinite(partySize)) throw new Error(`${rowIndex + 2}行目: 利用人数が不正です`);
    const reservationId = cell("予約番号");
    if (!reservationId) throw new Error(`${rowIndex + 2}行目: 予約番号が空です`);
    let start: { minutes: number; normalized: string };
    let end: { minutes: number; normalized: string };
    try {
      start = parseTimeOfDay(cell("開始時間"));
    } catch {
      throw new Error(`${rowIndex + 2}行目: 開始時間が不正です`);
    }
    try {
      end = parseTimeOfDay(cell("終了時間"));
    } catch {
      throw new Error(`${rowIndex + 2}行目: 終了時間が不正です`);
    }
    if (end.minutes <= start.minutes) throw new Error(`${rowIndex + 2}行目: 終了時間が開始時間以前です`);
    return { reservationId, bookedAt: jpDateTimeToIso(cell("受付日時")), useDate: jpDateToYmd(cell("日付")), start: start.normalized, end: end.normalized, category: cell("カテゴリー"), space: cell("予約内容"), status, acceptStatus: cell("受付ステータス"), paymentStatus: cell("決済ステータス"), paymentMethod: cell("支払い方法"), plan: cell("料金プラン"), amount: toAmount(cell("金額")), partySize, channel, customerType: cell("顧客タイプ"), memberNo: cell("会員番号"), name: cell("名前"), email: cell("メールアドレス"), postal: cell("郵便番号"), address: cell("住所"), gender: cell("性別"), birthDate: cell("生年月日"), occupation: cell("職業"), remarks: cell("備考") };
  });
  return { rows: result, warnings };
}

const CUSTOMER_REQUIRED = ["登録日", "顧客タイプ", "会員番号(自動発行)", "名前", "メールアドレス", "郵便番号", "住所", "性別", "生年月日", "職業"] as const;

export function parseCustomerRows(rows: string[][]): { rows: CustomerRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("顧客一覧CSVが空です");
  const columns = headerIndex(rows[0], CUSTOMER_REQUIRED);
  const result = rows.slice(1).map((values, rowIndex): CustomerRow => {
    const cell = (name: string) => requiredCell(values, columns, name, rowIndex + 2);
    return { registeredAt: jpDateToYmd(cell("登録日")), customerType: cell("顧客タイプ"), memberNo: cell("会員番号(自動発行)"), name: cell("名前"), email: cell("メールアドレス"), postal: cell("郵便番号"), address: cell("住所"), gender: cell("性別"), birthDate: cell("生年月日"), occupation: cell("職業") };
  });
  return { rows: result, warnings: [] };
}

const SALES_SUMMARY_REQUIRED = ["売上日", "レンタルスペース", "イベント", "物販", "売上合計"] as const;

export function parseSalesSummaryRows(rows: string[][]): { rows: SalesSummaryRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("売上サマリCSVが空です");
  const columns = headerIndex(rows[0], SALES_SUMMARY_REQUIRED);
  const result = rows.slice(1).map((values, rowIndex): SalesSummaryRow => {
    const cell = (name: string) => requiredCell(values, columns, name, rowIndex + 2);
    const dateRaw = cell("売上日");
    return { date: jpDateToYmd(dateRaw), isForecast: /見込み/.test(dateRaw), rentalSpace: toAmount(cell("レンタルスペース")) ?? 0, event: toAmount(cell("イベント")) ?? 0, goods: toAmount(cell("物販")) ?? 0, total: toAmount(cell("売上合計")) ?? 0 };
  });
  return { rows: result, warnings: [] };
}

const PROGRAM_REQUIRED = ["名称", "カテゴリ", "開催日", "開始時間", "終了時間", "募集数", "ステータス", "公開ステータス"] as const;

/** プログラム一覧は料金説明の引用内改行をCSV層で復元済みの行として受け取る。 */
export function parseProgramRows(rows: string[][]): { rows: ProgramRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("プログラム一覧CSVが空です");
  const columns = headerIndex(rows[0], PROGRAM_REQUIRED);
  const result = rows.slice(1).map((values, rowIndex): ProgramRow => {
    const rowNumber = rowIndex + 2;
    const cell = (name: string) => requiredCell(values, columns, name, rowNumber);
    const startRaw = cell("開始時間");
    const endRaw = cell("終了時間");
    let start: { minutes: number; normalized: string };
    let end: { minutes: number; normalized: string };
    try { start = parseTimeOfDay(startRaw); } catch { throw new Error(`${rowNumber}行目: 開始時間が不正です`); }
    try { end = parseTimeOfDay(endRaw); } catch { throw new Error(`${rowNumber}行目: 終了時間が不正です`); }
    if (end.minutes <= start.minutes) throw new Error(`${rowNumber}行目: 終了時間が開始時間以前です`);
    const capacityRaw = cell("募集数");
    const capacity = capacityRaw === "" ? null : Number(capacityRaw);
    if (capacity !== null && !Number.isFinite(capacity)) throw new Error(`${rowNumber}行目: 募集数が不正です`);
    return { name: cell("名称"), category: cell("カテゴリ"), heldOn: jpDateToYmd(cell("開催日")), start: start.normalized, end: end.normalized, capacity, status: cell("ステータス"), publishStatus: cell("公開ステータス") };
  });
  return { rows: result, warnings: [] };
}

const BLOCKED_REQUIRED = ["日付", "開始時間", "終了時間", "スペース"] as const;

export function parseBlockedSlotRows(rows: string[][]): { rows: BlockedSlotRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("予約不可一覧CSVが空です");
  const columns = headerIndex(rows[0], BLOCKED_REQUIRED);
  const labelIndex = rows[0].findIndex((header) => header.trim() === "予約名");
  const result = rows.slice(1).map((values, rowIndex): BlockedSlotRow => {
    const rowNumber = rowIndex + 2;
    const cell = (name: string) => requiredCell(values, columns, name, rowNumber);
    const startRaw = cell("開始時間");
    const endRaw = cell("終了時間");
    let start: { minutes: number; normalized: string };
    let end: { minutes: number; normalized: string };
    try { start = parseTimeOfDay(startRaw); } catch { throw new Error(`${rowNumber}行目: 開始時間が不正です`); }
    try { end = parseTimeOfDay(endRaw); } catch { throw new Error(`${rowNumber}行目: 終了時間が不正です`); }
    if (end.minutes <= start.minutes) throw new Error(`${rowNumber}行目: 終了時間が開始時間以前です`);
    return { date: jpDateToYmd(cell("日付")), start: start.normalized, end: end.normalized, space: cell("スペース"), label: labelIndex < 0 ? "" : (values[labelIndex] ?? "").trim() };
  });
  return { rows: result, warnings: [] };
}
