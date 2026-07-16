import { describe, expect, it } from "vitest";
import {
  jpDateTimeToIso,
  jpDateToYmd,
  parseCustomerRows,
  parseSalesSummaryRows,
  parseYoyakuRows,
} from "./labolaSchemas";

const header = ["予約番号", "予約内容", "日付", "開始時間", "終了時間", "カテゴリー", "予約ステータス", "受付ステータス", "決済ステータス", "料金プラン", "金額", "支払い方法", "利用人数", "受付日時", "最終更新日時", "予約方法", "顧客タイプ", "会員番号", "名前", "メールアドレス", "郵便番号", "住所", "性別", "生年月日", "職業", "備考"];
const defaultValues: Record<string, string> = { "予約番号": "90", "予約内容": "A:テストコート", "日付": "2026/08/13", "開始時間": "19:00", "終了時間": "21:00", "カテゴリー": "スペース予約", "予約ステータス": "予約完了", "受付ステータス": "受付済", "決済ステータス": "入金待ち", "料金プラン": "一般価格", "金額": "15960", "支払い方法": "クレジットカード", "利用人数": "", "受付日時": "2026年07月15日 14:19", "最終更新日時": "2026年07月15日 14:19", "予約方法": "スマートフォンでのユーザー", "顧客タイプ": "一般会員", "会員番号": "00901", "名前": "試験太郎", "メールアドレス": "taro@example.com", "郵便番号": "1000001", "住所": "東京都千代田区1-1-1", "性別": "男性", "生年月日": "1990/01/02", "職業": "会社員", "備考": "" };
const row = (over: Record<string, string>) => header.map((name) => over[name] ?? defaultValues[name] ?? "");

describe("日付変換", () => {
  it("和文日時をISO(+09:00)へ", () => expect(jpDateTimeToIso("2026年07月15日 14:19")).toBe("2026-07-15T14:19:00+09:00"));
  it("スラッシュ・和文日付をYMDへ", () => { expect(jpDateToYmd("2026/08/13")).toBe("2026-08-13"); expect(jpDateToYmd("2026年7月5日")).toBe("2026-07-05"); });
  it("不正な日付はエラー", () => expect(() => jpDateToYmd("不明")).toThrow("日付"));
});

describe("parseYoyakuRows", () => {
  it("行を型付きに変換する", () => { const result = parseYoyakuRows([header, row({})]); expect(result.warnings).toEqual([]); expect(result.rows[0]).toMatchObject({ reservationId: "90", bookedAt: "2026-07-15T14:19:00+09:00", useDate: "2026-08-13", status: "confirmed", channel: "user_sp", amount: 15960, space: "A:テストコート" }); });
  it("キャンセル・金額空・管理者経由を写像する", () => expect(parseYoyakuRows([header, row({ "予約ステータス": "キャンセル", "金額": "", "予約方法": "管理者" })]).rows[0]).toMatchObject({ status: "cancelled", amount: null, channel: "admin" }));
  it("未知の予約ステータスは即エラー", () => expect(() => parseYoyakuRows([header, row({ "予約ステータス": "仮予約" })])).toThrow("予約ステータス"));
  it("未知の予約方法はunknown+警告", () => { const result = parseYoyakuRows([header, row({ "予約方法": "電話" })]); expect(result.rows[0].channel).toBe("unknown"); expect(result.warnings[0]).toContain("予約方法"); });
  it("必須ヘッダー欠落はエラー", () => expect(() => parseYoyakuRows([["予約番号", "日付"], ["1", "2026/08/01"]])).toThrow("必須列"));
});

describe("parseCustomerRows", () => {
  const customerHeader = ["登録日", "顧客タイプ", "会員番号(自動発行)", "名前", "メールアドレス", "郵便番号", "住所", "性別", "生年月日", "職業"];
  it("顧客行をヘッダー名で型付きに変換する", () => expect(parseCustomerRows([customerHeader, ["2026年7月5日", "一般", "001", "試験顧客", "sample@example.com", "", "東京都台東区1-1", "", "", "会社員"]]).rows[0]).toMatchObject({ registeredAt: "2026-07-05", memberNo: "001" }));
  it("必須列不足はエラーにする", () => expect(() => parseCustomerRows([["登録日"]])).toThrow("必須列"));
});

describe("parseSalesSummaryRows", () => {
  it("見込み行を判定して数値化する", () => { const { rows } = parseSalesSummaryRows([["売上日", "レンタルスペース", "イベント", "物販", "売上合計"], ["2026年07月15日", "8980", "0", "0", "8980"], ["2026年07月17日(見込み)", "0", "18000", "0", "18000"]]); expect(rows[0]).toEqual({ date: "2026-07-15", isForecast: false, rentalSpace: 8980, event: 0, goods: 0, total: 8980 }); expect(rows[1].isForecast).toBe(true); expect(rows[1].date).toBe("2026-07-17"); });
});
