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

export function jpDateTimeToIso(value: string): string {
  const match = value.trim().match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`日時を解釈できません: ${value}`);
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+09:00`;
}

export function jpDateToYmd(value: string): string {
  const cleaned = value.trim().replace(/（.*?）|\(.*?\)/g, "");
  const match = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/) ?? cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) throw new Error(`日付を解釈できません: ${value}`);
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function headerIndex(headers: readonly string[], required: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((name, index) => { if (!(name.trim() in map)) map[name.trim()] = index; });
  for (const name of required) {
    if (!(name in map)) throw new Error(`必須列 ${name} がありません(検出ヘッダー: ${headers.join(",")})`);
  }
  return map;
}

function toAmount(value: string): number | null {
  const cleaned = value.replace(/[,¥\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) throw new Error(`金額を解釈できません: ${value}`);
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
    const cell = (name: string) => (values[columns[name]] ?? "").trim();
    const statusRaw = cell("予約ステータス");
    const status = STATUS_MAP[statusRaw];
    if (!status) throw new Error(`${rowIndex + 2}行目: 未知の予約ステータスです: ${statusRaw}(写像を更新してください)`);
    const channelRaw = cell("予約方法");
    const channel = CHANNEL_MAP[channelRaw] ?? "unknown";
    if (channel === "unknown" && channelRaw !== "") warnings.push(`${rowIndex + 2}行目: 未知の予約方法: ${channelRaw}`);
    const partySizeRaw = partySizeIndex < 0 ? "" : (values[partySizeIndex] ?? "").trim();
    const partySize = partySizeRaw === "" ? null : Number(partySizeRaw);
    if (partySize !== null && !Number.isFinite(partySize)) throw new Error(`利用人数を解釈できません: ${partySizeRaw}`);
    return { reservationId: cell("予約番号"), bookedAt: jpDateTimeToIso(cell("受付日時")), useDate: jpDateToYmd(cell("日付")), start: cell("開始時間"), end: cell("終了時間"), category: cell("カテゴリー"), space: cell("予約内容"), status, acceptStatus: cell("受付ステータス"), paymentStatus: cell("決済ステータス"), paymentMethod: cell("支払い方法"), plan: cell("料金プラン"), amount: toAmount(cell("金額")), partySize, channel, customerType: cell("顧客タイプ"), memberNo: cell("会員番号"), name: cell("名前"), email: cell("メールアドレス"), postal: cell("郵便番号"), address: cell("住所"), gender: cell("性別"), birthDate: cell("生年月日"), occupation: cell("職業"), remarks: cell("備考") };
  });
  return { rows: result, warnings };
}

const CUSTOMER_REQUIRED = ["登録日", "顧客タイプ", "会員番号(自動発行)", "名前", "メールアドレス", "郵便番号", "住所", "性別", "生年月日", "職業"] as const;

export function parseCustomerRows(rows: string[][]): { rows: CustomerRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("顧客一覧CSVが空です");
  const columns = headerIndex(rows[0], CUSTOMER_REQUIRED);
  const result = rows.slice(1).map((values): CustomerRow => {
    const cell = (name: string) => (values[columns[name]] ?? "").trim();
    return { registeredAt: jpDateToYmd(cell("登録日")), customerType: cell("顧客タイプ"), memberNo: cell("会員番号(自動発行)"), name: cell("名前"), email: cell("メールアドレス"), postal: cell("郵便番号"), address: cell("住所"), gender: cell("性別"), birthDate: cell("生年月日"), occupation: cell("職業") };
  });
  return { rows: result, warnings: [] };
}

const SALES_SUMMARY_REQUIRED = ["売上日", "レンタルスペース", "イベント", "物販", "売上合計"] as const;

export function parseSalesSummaryRows(rows: string[][]): { rows: SalesSummaryRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("売上サマリCSVが空です");
  const columns = headerIndex(rows[0], SALES_SUMMARY_REQUIRED);
  const result = rows.slice(1).map((values): SalesSummaryRow => {
    const cell = (name: string) => (values[columns[name]] ?? "").trim();
    const dateRaw = cell("売上日");
    return { date: jpDateToYmd(dateRaw), isForecast: /見込み/.test(dateRaw), rentalSpace: toAmount(cell("レンタルスペース")) ?? 0, event: toAmount(cell("イベント")) ?? 0, goods: toAmount(cell("物販")) ?? 0, total: toAmount(cell("売上合計")) ?? 0 };
  });
  return { rows: result, warnings: [] };
}
