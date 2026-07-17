# 施設経営データ基盤 P1コア 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ラボーラCSV(Shift_JIS)を取り込み、PIIを除去した正準データセットとスナップショット(集計+気づき)を生成し、LINEダイジェストを送り、metrics-cli を旧CSV形式から正準データセット読み取りに切り替える。

**Architecture:** 純ロジック(`scripts/growth/*.ts`・全てテスト対象)と薄いCLI(`ingest-cli.ts`・カバレッジ除外)を分離。パイプラインは decode→種別判定→行パース→PII境界→正準化→集計→気づき検出→スナップショット→LINE。metrics-cli は正準データセットを読む(旧 `parseReservationCsv`/sidecar は削除)。

**Tech Stack:** TypeScript(strict)・zod・vitest・tsx。新規依存なし(SJISデコードは Node 標準 `TextDecoder("shift_jis")`)。

**設計書:** `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md`(§4〜§7, §12〜§13)

**本計画の範囲(P1コア):** 予約一覧・顧客一覧・売上サマリの3種正準化/コアKPI・ヒートマップ・リードタイム・商圏・キャンセル率/検出器 D1・D2・D3・D11(欠落・行数急減)・D12/スナップショット/CLI/LINE/metrics切替。
**続編計画(P1拡張・別ファイル):** 会員・プログラム・予約不可・売上明細・MINERVAの正準化、RevPACH・プログラム埋まり率・コホート・クロスセル等の残集計、検出器 D4〜D10・D13、publicFacingPack、`src/lib/growth/` 再エクスポート。

## Global Constraints

- TypeScript strict。`any` 禁止(`unknown`+絞り込み)。型のみのimportは `import type`
- TDD必須(Red→Green→Refactor)。カバレッジ100%目標。CLI薄皮は `vitest.config.ts` の coverage.exclude に追加
- PII生値(氏名・メール・電話・番地以下住所・生年月日)を正準データセット・スナップショット・テストフィクスチャに書かない。フィクスチャは架空データのみ
- 予約ステータス未知値・SJISデコード不能・必須ヘッダー欠落は**即エラー停止**(沈黙禁止)
- エラーメッセージ・コミットメッセージは日本語。Conventional Commits(`feat:`/`fix:`/`test:`/`docs:`)
- 1ファイル800行以内・1関数50行以内を目安に分割
- 環境変数: `GROWTH_LABOLA_DROP_DIR` / `GROWTH_RESERVATION_DATA_DIR` / `GROWTH_RESERVATION_COVERAGE_START`(既定 `2026-06-01`)/ `GROWTH_ANALYTICS_HASH_KEY`(server-only)
- 実行ブランチ: `feature/labola-data-platform-p1`(develop から分岐)。PRは Task 1–5 / 6–7 / 8–10 / 11–12 の4本に分けると400行規約に収まりやすい
- テスト実行: `npx vitest run <path>`。全体: `npm run test`(存在しない場合 `npx vitest run`)

---

### Task 1: labolaCsv.ts — SJISデコード・CSVパース・種別判定

**Files:**
- Create: `scripts/growth/labolaCsv.ts`
- Create: `scripts/growth/labolaCsv.test.ts`
- Create: `scripts/growth/__fixtures__/labola/yoyaku_sjis.csv`(SJISバイナリ・架空データ)

**Interfaces:**
- Consumes: なし(起点)
- Produces:
  - `type LabolaCsvType = "yoyaku" | "customer" | "member" | "sales" | "salesSummary" | "program" | "blocked" | "minerva"`
  - `decodeSjis(buffer: Uint8Array): string`(デコード不能バイトで throw)
  - `parseCsvRows(input: string): string[][]`(RFC4180風: 引用符・引用内改行・`""`エスケープ対応。BOM除去。全列空行はスキップ)
  - `detectCsvType(headerRow: readonly string[]): LabolaCsvType | null`

- [ ] **Step 1: SJISフィクスチャを生成する**(架空データ。列は設計書§4の予約一覧署名+主要列)

```bash
mkdir -p scripts/growth/__fixtures__/labola
python3 - <<'PY'
rows = [
 '予約番号,予約内容,日付,開始時間,終了時間,カテゴリー,予約ステータス,受付ステータス,決済ステータス,料金プラン,金額,支払い方法,利用人数,受付日時,最終更新日時,予約方法,顧客タイプ,会員番号,名前,メールアドレス,郵便番号,住所,性別,生年月日,職業,備考',
 '"90","A:テストコート","2026/08/13","19:00","21:00","スペース予約","予約完了","受付済","入金待ち","一般価格","15960","クレジットカード","","2026年07月15日 14:19","2026年07月15日 14:19","スマートフォンでのユーザー","一般会員","00901","試験太郎","taro@example.com","1000001","東京都千代田区1-1-1","男性","1990/01/02","会社員",""',
 '"91","B:テストコート","2026/08/05","20:00","21:00","スペース予約","キャンセル","受付済","入金待ち","一般価格","","クレジットカード","","2026年07月13日 14:57","2026年07月13日 14:57","PCでのユーザー","ビジター","","試験花子","hanako@example.com","","千葉県市川市2-2-2","女性","1992/03/04","","改行入り\n備考テスト"',
]
open('scripts/growth/__fixtures__/labola/yoyaku_sjis.csv','wb').write(('\r\n'.join(rows)+'\r\n').encode('cp932'))
PY
```

- [ ] **Step 2: 失敗するテストを書く**

```typescript
// scripts/growth/labolaCsv.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeSjis, detectCsvType, parseCsvRows } from "./labolaCsv";

const fixture = () =>
  readFileSync(join(__dirname, "__fixtures__", "labola", "yoyaku_sjis.csv"));

describe("decodeSjis", () => {
  it("Shift_JISのCSVをUTF-8文字列に復号する", () => {
    const text = decodeSjis(fixture());
    expect(text).toContain("予約番号");
    expect(text).toContain("試験太郎");
  });
  it("不正なバイト列はエラーにする", () => {
    expect(() => decodeSjis(new Uint8Array([0x81, 0xad, 0xff, 0xfe, 0x81]))).toThrow(
      "Shift_JIS"
    );
  });
});

describe("parseCsvRows", () => {
  it("引用符・引用内改行・二重引用符を扱える", () => {
    const rows = parseCsvRows('a,"b,1","c""x"\r\n"改行\nあり",e,f\r\n');
    expect(rows).toEqual([
      ["a", "b,1", 'c"x'],
      ["改行\nあり", "e", "f"],
    ]);
  });
  it("BOMを除去し、全列空の行を捨てる", () => {
    expect(parseCsvRows("﻿a,b\r\n,\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("引用符が閉じていなければエラー", () => {
    expect(() => parseCsvRows('a,"b')).toThrow("引用符");
  });
});

describe("detectCsvType", () => {
  it("先頭列の署名で種別を判定する", () => {
    expect(detectCsvType(["予約番号", "予約内容", "日付", "開始時間"])).toBe("yoyaku");
    expect(detectCsvType(["登録日", "顧客タイプ", "登録ステータス", "x"])).toBe("customer");
    expect(detectCsvType(["登録日", "会員タイプ", "登録ステータス", "x"])).toBe("member");
    expect(detectCsvType(["売上日時", "分類", "品目"])).toBe("sales");
    expect(detectCsvType(["売上日", "レンタルスペース", "イベント"])).toBe("salesSummary");
    expect(detectCsvType(["名称", "カテゴリ", "スポーツ", "開催日"])).toBe("program");
    expect(detectCsvType(["日付", "開始時間", "終了時間", "スペース"])).toBe("blocked");
    expect(detectCsvType(["対象期間", ""])).toBe("minerva");
    expect(detectCsvType(["未知", "列"])).toBeNull();
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx vitest run scripts/growth/labolaCsv.test.ts`
Expected: FAIL(`labolaCsv` が存在しない)

- [ ] **Step 4: 実装する**

```typescript
// scripts/growth/labolaCsv.ts
/** ラボーラCSVの復号・パース・種別判定(純ロジック。I/OはCLI側)。 */

export type LabolaCsvType =
  | "yoyaku"
  | "customer"
  | "member"
  | "sales"
  | "salesSummary"
  | "program"
  | "blocked"
  | "minerva";

export function decodeSjis(buffer: Uint8Array): string {
  const decoder = new TextDecoder("shift_jis", { fatal: true });
  try {
    return decoder.decode(buffer);
  } catch {
    throw new Error("Shift_JISとして復号できないバイト列があります");
  }
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let isQuoted = false;
  const source = input.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (isQuoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
    } else if (char === "," && !isQuoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !isQuoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (isQuoted) throw new Error("CSVの引用符が閉じていません");
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

const SIGNATURES: readonly { type: LabolaCsvType; head: readonly string[] }[] = [
  { type: "yoyaku", head: ["予約番号", "予約内容", "日付", "開始時間"] },
  { type: "member", head: ["登録日", "会員タイプ", "登録ステータス"] },
  { type: "customer", head: ["登録日", "顧客タイプ", "登録ステータス"] },
  { type: "sales", head: ["売上日時", "分類", "品目"] },
  { type: "salesSummary", head: ["売上日", "レンタルスペース"] },
  { type: "program", head: ["名称", "カテゴリ", "スポーツ", "開催日"] },
  { type: "blocked", head: ["日付", "開始時間", "終了時間", "スペース"] },
  { type: "minerva", head: ["対象期間"] },
];

export function detectCsvType(headerRow: readonly string[]): LabolaCsvType | null {
  const normalized = headerRow.map((cell) => cell.trim());
  for (const signature of SIGNATURES) {
    if (signature.head.every((name, index) => normalized[index] === name)) {
      return signature.type;
    }
  }
  return null;
}
```

注意: `yoyaku`(日付,開始時間が2列目以降)と `blocked`(日付が1列目)は先頭列が異なるため誤判定しない。`member` を `customer` より先に判定する(2列目で区別)。

- [ ] **Step 5: パスを確認してコミット**

Run: `npx vitest run scripts/growth/labolaCsv.test.ts` → PASS

```bash
git add scripts/growth/labolaCsv.ts scripts/growth/labolaCsv.test.ts scripts/growth/__fixtures__/labola/yoyaku_sjis.csv
git commit -m "feat(growth): ラボーラCSVの復号・パース・種別判定を追加"
```

---

### Task 2: labolaSchemas.ts — 行パースと写像(予約・顧客・売上サマリ)

**Files:**
- Create: `scripts/growth/labolaSchemas.ts`
- Create: `scripts/growth/labolaSchemas.test.ts`

**Interfaces:**
- Consumes: `parseCsvRows` の出力 `string[][]`
- Produces:
  - `interface YoyakuRow { reservationId: string; bookedAt: string; useDate: string; start: string; end: string; category: string; space: string; status: "confirmed" | "cancelled"; acceptStatus: string; paymentStatus: string; paymentMethod: string; plan: string; amount: number | null; partySize: number | null; channel: "user_sp" | "user_pc" | "admin" | "unknown"; customerType: string; memberNo: string; name: string; email: string; postal: string; address: string; gender: string; birthDate: string; occupation: string; remarks: string }`
  - `parseYoyakuRows(rows: string[][]): { rows: YoyakuRow[]; warnings: string[] }`
  - `interface CustomerRow { registeredAt: string; customerType: string; memberNo: string; name: string; email: string; postal: string; address: string; gender: string; birthDate: string; occupation: string }`
  - `parseCustomerRows(rows: string[][]): { rows: CustomerRow[]; warnings: string[] }`
  - `interface SalesSummaryRow { date: string; isForecast: boolean; rentalSpace: number; event: number; goods: number; total: number }`
  - `parseSalesSummaryRows(rows: string[][]): { rows: SalesSummaryRow[]; warnings: string[] }`
  - `jpDateTimeToIso(value: string): string`(`2026年07月15日 14:19` → `2026-07-15T14:19:00+09:00`)
  - `jpDateToYmd(value: string): string`(`2026/08/13`・`2026年7月5日` → `2026-08-13`/`2026-07-05`)

**ヘッダー解決の方針:** 列は**ヘッダー名で**解決する(位置依存禁止)。必須ヘッダーが見つからない場合は「必須列 ◯◯ がありません(検出ヘッダー: …)」で throw。実CSVとヘッダー名がずれていた場合はこのファイルの定数を実物に合わせて直す(Task 13 の実データ検証で発見する)。

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// scripts/growth/labolaSchemas.test.ts
import { describe, expect, it } from "vitest";
import {
  jpDateTimeToIso,
  jpDateToYmd,
  parseSalesSummaryRows,
  parseYoyakuRows,
} from "./labolaSchemas";

const HEADER = [
  "予約番号","予約内容","日付","開始時間","終了時間","カテゴリー","予約ステータス","受付ステータス",
  "決済ステータス","料金プラン","金額","支払い方法","利用人数","受付日時","最終更新日時","予約方法",
  "顧客タイプ","会員番号","名前","メールアドレス","郵便番号","住所","性別","生年月日","職業","備考",
];
const row = (over: Record<string, string>) =>
  HEADER.map((name) => over[name] ?? {
    予約番号: "90", 予約内容: "A:テストコート", 日付: "2026/08/13", 開始時間: "19:00",
    終了時間: "21:00", カテゴリー: "スペース予約", 予約ステータス: "予約完了", 受付ステータス: "受付済",
    決済ステータス: "入金待ち", 料金プラン: "一般価格", 金額: "15960", 支払い方法: "クレジットカード",
    利用人数: "", 受付日時: "2026年07月15日 14:19", 最終更新日時: "2026年07月15日 14:19",
    予約方法: "スマートフォンでのユーザー", 顧客タイプ: "一般会員", 会員番号: "00901",
    名前: "試験太郎", メールアドレス: "taro@example.com", 郵便番号: "1000001",
    住所: "東京都千代田区1-1-1", 性別: "男性", 生年月日: "1990/01/02", 職業: "会社員", 備考: "",
  }[name] ?? "");

describe("日付変換", () => {
  it("和文日時をISO(+09:00)へ", () => {
    expect(jpDateTimeToIso("2026年07月15日 14:19")).toBe("2026-07-15T14:19:00+09:00");
  });
  it("スラッシュ・和文日付をYMDへ", () => {
    expect(jpDateToYmd("2026/08/13")).toBe("2026-08-13");
    expect(jpDateToYmd("2026年7月5日")).toBe("2026-07-05");
  });
  it("不正な日付はエラー", () => {
    expect(() => jpDateToYmd("不明")).toThrow("日付");
  });
});

describe("parseYoyakuRows", () => {
  it("行を型付きに変換する", () => {
    const { rows, warnings } = parseYoyakuRows([HEADER, row({})]);
    expect(warnings).toEqual([]);
    expect(rows[0]).toMatchObject({
      reservationId: "90",
      bookedAt: "2026-07-15T14:19:00+09:00",
      useDate: "2026-08-13",
      status: "confirmed",
      channel: "user_sp",
      amount: 15960,
      space: "A:テストコート",
    });
  });
  it("キャンセル・金額空・管理者経由を写像する", () => {
    const { rows } = parseYoyakuRows([
      HEADER,
      row({ 予約ステータス: "キャンセル", 金額: "", 予約方法: "管理者" }),
    ]);
    expect(rows[0]).toMatchObject({ status: "cancelled", amount: null, channel: "admin" });
  });
  it("未知の予約ステータスは即エラー", () => {
    expect(() => parseYoyakuRows([HEADER, row({ 予約ステータス: "仮予約" })])).toThrow(
      "予約ステータス"
    );
  });
  it("未知の予約方法はunknown+警告(停止しない)", () => {
    const { rows, warnings } = parseYoyakuRows([HEADER, row({ 予約方法: "電話" })]);
    expect(rows[0].channel).toBe("unknown");
    expect(warnings[0]).toContain("予約方法");
  });
  it("必須ヘッダー欠落はエラー", () => {
    expect(() => parseYoyakuRows([["予約番号", "日付"], ["1", "2026/08/01"]])).toThrow(
      "必須列"
    );
  });
});

describe("parseSalesSummaryRows", () => {
  it("見込み行を判定して数値化する", () => {
    const { rows } = parseSalesSummaryRows([
      ["売上日", "レンタルスペース", "イベント", "物販", "売上合計"],
      ["2026年07月15日", "8980", "0", "0", "8980"],
      ["2026年07月17日(見込み)", "0", "18000", "0", "18000"],
    ]);
    expect(rows[0]).toEqual({
      date: "2026-07-15", isForecast: false, rentalSpace: 8980, event: 0, goods: 0, total: 8980,
    });
    expect(rows[1].isForecast).toBe(true);
    expect(rows[1].date).toBe("2026-07-17");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run scripts/growth/labolaSchemas.test.ts` → FAIL

- [ ] **Step 3: 実装する**

```typescript
// scripts/growth/labolaSchemas.ts
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
  const [, y, mo, d, h, mi] = match;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:00+09:00`;
}

export function jpDateToYmd(value: string): string {
  const cleaned = value.trim().replace(/（.*?）|\(.*?\)/g, "");
  const slash = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const jp = cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const m = slash ?? jp;
  if (!m) throw new Error(`日付を解釈できません: ${value}`);
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function headerIndex(headers: readonly string[], required: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((name, index) => {
    if (!(name.trim() in map)) map[name.trim()] = index;
  });
  for (const name of required) {
    if (!(name in map)) {
      throw new Error(`必須列 ${name} がありません(検出ヘッダー: ${headers.join(",")})`);
    }
  }
  return map;
}

function toAmount(value: string): number | null {
  const cleaned = value.replace(/[,¥\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) throw new Error(`金額を解釈できません: ${value}`);
  return parsed;
}

const STATUS_MAP: Record<string, YoyakuRow["status"]> = {
  予約完了: "confirmed",
  キャンセル: "cancelled",
};
const CHANNEL_MAP: Record<string, YoyakuRow["channel"]> = {
  スマートフォンでのユーザー: "user_sp",
  PCでのユーザー: "user_pc",
  管理者: "admin",
};

const YOYAKU_REQUIRED = [
  "予約番号", "予約内容", "日付", "開始時間", "終了時間", "カテゴリー", "予約ステータス",
  "受付ステータス", "決済ステータス", "料金プラン", "金額", "支払い方法", "受付日時",
  "予約方法", "顧客タイプ", "会員番号", "名前", "メールアドレス", "郵便番号", "住所",
  "性別", "生年月日", "職業", "備考",
] as const;

export function parseYoyakuRows(rows: string[][]): { rows: YoyakuRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("予約一覧CSVが空です");
  const col = headerIndex(rows[0], YOYAKU_REQUIRED);
  const partySizeIndex = rows[0].findIndex((h) => h.trim() === "利用人数");
  const warnings: string[] = [];
  const result = rows.slice(1).map((values, rowIndex): YoyakuRow => {
    const cell = (name: string) => (values[col[name]] ?? "").trim();
    const statusRaw = cell("予約ステータス");
    const status = STATUS_MAP[statusRaw];
    if (!status) {
      throw new Error(`${rowIndex + 2}行目: 未知の予約ステータスです: ${statusRaw}(写像を更新してください)`);
    }
    const channelRaw = cell("予約方法");
    const channel = CHANNEL_MAP[channelRaw] ?? "unknown";
    if (channel === "unknown" && channelRaw !== "") {
      warnings.push(`${rowIndex + 2}行目: 未知の予約方法: ${channelRaw}`);
    }
    const partySizeRaw = partySizeIndex >= 0 ? (values[partySizeIndex] ?? "").trim() : "";
    return {
      reservationId: cell("予約番号"),
      bookedAt: jpDateTimeToIso(cell("受付日時")),
      useDate: jpDateToYmd(cell("日付")),
      start: cell("開始時間"),
      end: cell("終了時間"),
      category: cell("カテゴリー"),
      space: cell("予約内容"),
      status,
      acceptStatus: cell("受付ステータス"),
      paymentStatus: cell("決済ステータス"),
      paymentMethod: cell("支払い方法"),
      plan: cell("料金プラン"),
      amount: toAmount(cell("金額")),
      partySize: partySizeRaw === "" ? null : Number(partySizeRaw),
      channel,
      customerType: cell("顧客タイプ"),
      memberNo: cell("会員番号"),
      name: cell("名前"),
      email: cell("メールアドレス"),
      postal: cell("郵便番号"),
      address: cell("住所"),
      gender: cell("性別"),
      birthDate: cell("生年月日"),
      occupation: cell("職業"),
      remarks: cell("備考"),
    };
  });
  return { rows: result, warnings };
}

const CUSTOMER_REQUIRED = [
  "登録日", "顧客タイプ", "会員番号(自動発行)", "名前", "メールアドレス",
  "郵便番号", "住所", "性別", "生年月日", "職業",
] as const;

export function parseCustomerRows(rows: string[][]): { rows: CustomerRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("顧客一覧CSVが空です");
  const col = headerIndex(rows[0], CUSTOMER_REQUIRED);
  const result = rows.slice(1).map((values): CustomerRow => {
    const cell = (name: string) => (values[col[name]] ?? "").trim();
    return {
      registeredAt: jpDateToYmd(cell("登録日")),
      customerType: cell("顧客タイプ"),
      memberNo: cell("会員番号(自動発行)"),
      name: cell("名前"),
      email: cell("メールアドレス"),
      postal: cell("郵便番号"),
      address: cell("住所"),
      gender: cell("性別"),
      birthDate: cell("生年月日"),
      occupation: cell("職業"),
    };
  });
  return { rows: result, warnings: [] };
}

const SALES_SUMMARY_REQUIRED = ["売上日", "レンタルスペース", "イベント", "物販", "売上合計"] as const;

export function parseSalesSummaryRows(
  rows: string[][]
): { rows: SalesSummaryRow[]; warnings: string[] } {
  if (rows.length === 0) throw new Error("売上サマリCSVが空です");
  const col = headerIndex(rows[0], SALES_SUMMARY_REQUIRED);
  const result = rows.slice(1).map((values): SalesSummaryRow => {
    const cell = (name: string) => (values[col[name]] ?? "").trim();
    const dateRaw = cell("売上日");
    return {
      date: jpDateToYmd(dateRaw),
      isForecast: /見込み/.test(dateRaw),
      rentalSpace: toAmount(cell("レンタルスペース")) ?? 0,
      event: toAmount(cell("イベント")) ?? 0,
      goods: toAmount(cell("物販")) ?? 0,
      total: toAmount(cell("売上合計")) ?? 0,
    };
  });
  return { rows: result, warnings: [] };
}
```

注意: 顧客一覧の会員番号ヘッダーは実CSVでは `会員番号(自動発行)`(全角括弧の可能性あり)。Task 13 の実データ検証でヘッダー名が違ったら `CUSTOMER_REQUIRED` を実物に合わせる。

- [ ] **Step 4: パスを確認する**

Run: `npx vitest run scripts/growth/labolaSchemas.test.ts` → PASS(parseCustomerRows のテストも同形式で2ケース追加してから)

- [ ] **Step 5: コミット**

```bash
git add scripts/growth/labolaSchemas.ts scripts/growth/labolaSchemas.test.ts
git commit -m "feat(growth): ラボーラ予約・顧客・売上サマリ行の型付けと写像を追加"
```

---

### Task 3: piiBoundary.ts — 仮名化・粗視化

**Files:**
- Create: `scripts/growth/piiBoundary.ts`
- Create: `scripts/growth/piiBoundary.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `pseudoId(email: string, memberNo: string, hashKey: string): string | null`(email優先・小文字化してHMAC-SHA256先頭16hex。両方空ならnull)
  - `extractWard(address: string): string`(`東京都台東区…`→`台東区`、`千葉県市川市…`→`市川市`。抽出不能は`"不明"`)
  - `ageBand(birthDate: string, onYmd: string): string`(`"1990/01/02"`,`"2026-07-16"`→`"30代"`。空・不正は`"不明"`)
  - `occupationGroup(occupation: string): string`(会社員系/医療系/学生/経営者/その他/不明)

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// scripts/growth/piiBoundary.test.ts
import { describe, expect, it } from "vitest";
import { ageBand, extractWard, occupationGroup, pseudoId } from "./piiBoundary";

describe("pseudoId", () => {
  it("メールを小文字化してHMACの16hexを返す(決定的)", () => {
    const a = pseudoId("Taro@Example.com", "", "key1");
    expect(a).toBe(pseudoId("taro@example.com", "", "key1"));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(pseudoId("taro@example.com", "", "key2"));
  });
  it("メールが無ければ会員番号で代替、両方無しはnull", () => {
    expect(pseudoId("", "00901", "k")).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudoId("", "", "k")).toBeNull();
  });
});

describe("extractWard", () => {
  it("都道府県+市区町村を市区町村名にする", () => {
    expect(extractWard("東京都台東区根岸5-1-9-205")).toBe("台東区");
    expect(extractWard("千葉県市川市南八幡4-15-13")).toBe("市川市");
    expect(extractWard("神奈川県横浜市鶴見区江ケ崎1-2")).toBe("横浜市鶴見区");
    expect(extractWard("山口県防府市新田626-7")).toBe("防府市");
  });
  it("都道府県が無い住所でも区・市を拾う", () => {
    expect(extractWard("荒川区町屋4-5-12")).toBe("荒川区");
  });
  it("抽出不能・空は不明", () => {
    expect(extractWard("")).toBe("不明");
    expect(extractWard("港")).toBe("不明");
  });
});

describe("ageBand", () => {
  it("基準日時点の年代を返す", () => {
    expect(ageBand("1990/01/02", "2026-07-16")).toBe("30代");
    expect(ageBand("2005-06-10 00:00:00", "2026-07-16")).toBe("20代");
    expect(ageBand("1958/01/01", "2026-07-16")).toBe("60代以上");
  });
  it("空・不正は不明", () => {
    expect(ageBand("", "2026-07-16")).toBe("不明");
    expect(ageBand("生年月日", "2026-07-16")).toBe("不明");
  });
});

describe("occupationGroup", () => {
  it("粗いグループへ丸める", () => {
    expect(occupationGroup("会社員")).toBe("会社員");
    expect(occupationGroup("鍼灸師")).toBe("医療・施術");
    expect(occupationGroup("理学療法士")).toBe("医療・施術");
    expect(occupationGroup("学生")).toBe("学生");
    expect(occupationGroup("経営者")).toBe("経営・自営");
    expect(occupationGroup("パイロット")).toBe("その他");
    expect(occupationGroup("")).toBe("不明");
  });
});
```

- [ ] **Step 2: 失敗を確認 → 実装する**

```typescript
// scripts/growth/piiBoundary.ts
/** PII境界: 仮名化・粗視化(純ロジック)。PII生値はこの層より先に出さない。 */
import { createHmac } from "node:crypto";

export function pseudoId(email: string, memberNo: string, hashKey: string): string | null {
  const source = email.trim().toLowerCase() || (memberNo.trim() ? `member:${memberNo.trim()}` : "");
  if (!source) return null;
  return createHmac("sha256", hashKey).update(source).digest("hex").slice(0, 16);
}

const WARD_PATTERN =
  /(?:北海道|東京都|(?:京都|大阪)府|.{2,3}県)?((?:[^\s0-9０-９]{1,6}市[^\s0-9０-９]{1,4}区)|(?:[^\s0-9０-９]{1,6}[市区町村]))/u;

export function extractWard(address: string): string {
  const match = address.trim().match(WARD_PATTERN);
  return match && match[1].length >= 2 ? match[1] : "不明";
}

export function ageBand(birthDate: string, onYmd: string): string {
  const match = birthDate.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return "不明";
  const [, y, mo, d] = match.map(Number) as unknown as [string, number, number, number];
  const on = new Date(`${onYmd}T00:00:00+09:00`).getTime();
  const birth = Date.UTC(Number(match[1]), mo - 1, d);
  if (Number.isNaN(birth) || birth > on) return "不明";
  const age = Math.floor((on - birth) / (365.25 * 24 * 3600 * 1000));
  if (age < 20) return "10代以下";
  if (age >= 60) return "60代以上";
  return `${Math.floor(age / 10) * 10}代`;
}

const OCCUPATION_GROUPS: readonly { group: string; pattern: RegExp }[] = [
  { group: "医療・施術", pattern: /医|師|療|鍼|整体|看護|柔道整復/ },
  { group: "学生", pattern: /学生|学校/ },
  { group: "経営・自営", pattern: /経営|自営|役員|代表|フリーランス/ },
  { group: "会社員", pattern: /会社員|社員|公務員|団体職員/ },
];

export function occupationGroup(occupation: string): string {
  const value = occupation.trim();
  if (!value) return "不明";
  for (const { group, pattern } of OCCUPATION_GROUPS) {
    if (pattern.test(value)) return group;
  }
  return "その他";
}
```

- [ ] **Step 3: パス確認 → コミット**

Run: `npx vitest run scripts/growth/piiBoundary.test.ts` → PASS

```bash
git add scripts/growth/piiBoundary.ts scripts/growth/piiBoundary.test.ts
git commit -m "feat(growth): PII境界(仮名ID・市区町村・年代・職業グループ)を追加"
```

---

### Task 4: reservationExclusions.ts — テスト予約の除外

**Files:**
- Create: `scripts/growth/reservationExclusions.ts`
- Create: `scripts/growth/reservationExclusions.test.ts`
- Create: `scripts/growth/assets/reservation-exclusions.json`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface ExclusionRules { emails: string[]; nameContains: string[] }`
  - `parseExclusionRules(json: string): ExclusionRules`(zodで検証)
  - `isExcluded(target: { email: string; name: string }, rules: ExclusionRules): boolean`(email完全一致(小文字比較)or 名前部分一致)

- [ ] **Step 1: 除外設定ファイルを作る**(実運用値。テストからは読まない)

```json
{
  "emails": ["owner-main@example.com", "owner-sub@example.com"],
  "nameContains": ["テスト", "試験"]
}
```

- [ ] **Step 2: 失敗するテストを書く**

```typescript
// scripts/growth/reservationExclusions.test.ts
import { describe, expect, it } from "vitest";
import { isExcluded, parseExclusionRules } from "./reservationExclusions";

const rules = { emails: ["owner@example.com"], nameContains: ["テスト"] };

describe("parseExclusionRules", () => {
  it("正しいJSONを受理する", () => {
    expect(parseExclusionRules('{"emails":["a@b.c"],"nameContains":["x"]}')).toEqual({
      emails: ["a@b.c"],
      nameContains: ["x"],
    });
  });
  it("形式不正はエラー", () => {
    expect(() => parseExclusionRules('{"emails":"x"}')).toThrow("除外設定");
  });
});

describe("isExcluded", () => {
  it("メール完全一致(大文字小文字無視)で除外", () => {
    expect(isExcluded({ email: "Owner@Example.com", name: "誰か" }, rules)).toBe(true);
  });
  it("名前部分一致で除外", () => {
    expect(isExcluded({ email: "x@y.z", name: "▲テスト太郎" }, rules)).toBe(true);
  });
  it("該当なしは残す", () => {
    expect(isExcluded({ email: "x@y.z", name: "本物顧客" }, rules)).toBe(false);
  });
});
```

- [ ] **Step 3: 失敗確認 → 実装**

```typescript
// scripts/growth/reservationExclusions.ts
/** テスト予約の除外規則(純ロジック)。設定は assets/reservation-exclusions.json。 */
import { z } from "zod";

const rulesSchema = z.object({
  emails: z.array(z.string()),
  nameContains: z.array(z.string()),
});

export type ExclusionRules = z.infer<typeof rulesSchema>;

export function parseExclusionRules(json: string): ExclusionRules {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("除外設定がJSONではありません");
  }
  const parsed = rulesSchema.safeParse(value);
  if (!parsed.success) throw new Error(`除外設定の形式が不正です: ${parsed.error.message}`);
  return parsed.data;
}

export function isExcluded(
  target: { email: string; name: string },
  rules: ExclusionRules
): boolean {
  const email = target.email.trim().toLowerCase();
  if (email && rules.emails.some((entry) => entry.toLowerCase() === email)) return true;
  return rules.nameContains.some((fragment) => fragment && target.name.includes(fragment));
}
```

- [ ] **Step 4: パス確認 → コミット**

```bash
git add scripts/growth/reservationExclusions.ts scripts/growth/reservationExclusions.test.ts scripts/growth/assets/reservation-exclusions.json
git commit -m "feat(growth): テスト予約の除外規則を追加"
```

---

### Task 5: labolaNormalize.ts — 正準化(PII境界の適用)

**Files:**
- Create: `scripts/growth/labolaNormalize.ts`
- Create: `scripts/growth/labolaNormalize.test.ts`

**Interfaces:**
- Consumes: `YoyakuRow` / `CustomerRow` / `SalesSummaryRow`(Task 2)、`ExclusionRules`(Task 4)、`pseudoId`/`extractWard`/`ageBand`/`occupationGroup`(Task 3)
- Produces:
  - `interface CanonicalReservation { reservationId: string; bookedAt: string; useDate: string; start: string; end: string; category: string; space: string; status: "confirmed" | "cancelled"; acceptStatus: string; paymentStatus: string; paymentMethod: string; plan: string; amount: number | null; partySize: number | null; channel: "user_sp" | "user_pc" | "admin" | "unknown"; customerType: string; pseudoId: string | null; ward: string; ageBand: string; gender: string; occupationGroup: string; hasRemarks: boolean }`
  - `interface CanonicalCustomer { pseudoId: string | null; registeredAt: string; customerType: string; ward: string; ageBand: string; gender: string; occupationGroup: string }`
  - `interface RemarkEntry { reservationId: string; useDate: string; category: string; remarks: string }`(人間レビュー専用出力の素材)
  - `interface CanonicalMeta { schemaVersion: 1; generatedAt: string; coverage: { start: string; end: string }; counts: Record<string, number>; excludedCount: number; missingSections: string[]; warnings: string[] }`
  - `interface CanonicalBundle { reservations: CanonicalReservation[]; customers: CanonicalCustomer[]; salesDaily: SalesSummaryRow[]; remarks: RemarkEntry[]; meta: CanonicalMeta }`
  - `buildCanonical(input: { yoyaku: YoyakuRow[]; customers: CustomerRow[] | null; salesSummary: SalesSummaryRow[] | null; rules: ExclusionRules; hashKey: string; coverageStart: string; generatedAt: string; parseWarnings: string[] }): CanonicalBundle`
  - `serializeJsonl(records: readonly unknown[]): string` / `parseJsonl<T>(content: string, guard: (v: unknown) => T): T[]`

**要点:** CanonicalReservation / CanonicalCustomer に氏名・メール・電話・詳細住所・生年月日の**フィールド自体が存在しない**こと(型で保証)。coverage.end は generatedAt のJST日付。customers/salesSummary が null なら `missingSections` に `"customer"`/`"salesSummary"` を積む。除外は予約(email/name)と顧客(email/name)の両方に適用し、件数を `excludedCount` に合算。備考テキストは `remarks` 配列のみに保持し、CanonicalReservation には `hasRemarks` だけ残す。

- [ ] **Step 1: 失敗するテストを書く**(要点網羅: PIIフィールド不存在・除外・missingSections・coverage・remarks分離・JSONL往復)

```typescript
// scripts/growth/labolaNormalize.test.ts
import { describe, expect, it } from "vitest";
import { buildCanonical, parseJsonl, serializeJsonl } from "./labolaNormalize";
import type { YoyakuRow } from "./labolaSchemas";

const yoyaku = (over: Partial<YoyakuRow>): YoyakuRow => ({
  reservationId: "90", bookedAt: "2026-07-15T14:19:00+09:00", useDate: "2026-08-13",
  start: "19:00", end: "21:00", category: "スペース予約", space: "A:テストコート",
  status: "confirmed", acceptStatus: "受付済", paymentStatus: "入金待ち",
  paymentMethod: "クレジットカード", plan: "一般価格", amount: 15960, partySize: null,
  channel: "user_sp", customerType: "一般会員", memberNo: "00901", name: "試験対象",
  email: "taro@example.com", postal: "1000001", address: "東京都千代田区1-1-1",
  gender: "男性", birthDate: "1990/01/02", occupation: "会社員", remarks: "",
  ...over,
});
const base = {
  customers: null, salesSummary: null,
  rules: { emails: ["owner@example.com"], nameContains: ["削除対象"] },
  hashKey: "k", coverageStart: "2026-06-01",
  generatedAt: "2026-07-16T14:20:00+09:00", parseWarnings: ["w1"],
};

describe("buildCanonical", () => {
  it("PIIを落とし粗視化フィールドへ置き換える", () => {
    const bundle = buildCanonical({ ...base, yoyaku: [yoyaku({})] });
    const record = bundle.reservations[0];
    expect(record.ward).toBe("千代田区");
    expect(record.ageBand).toBe("30代");
    expect(record.pseudoId).toMatch(/^[0-9a-f]{16}$/);
    expect(record).not.toHaveProperty("name");
    expect(record).not.toHaveProperty("email");
    expect(record).not.toHaveProperty("address");
    expect(record).not.toHaveProperty("birthDate");
  });
  it("除外規則に該当する予約を落とし件数を記録する", () => {
    const bundle = buildCanonical({
      ...base,
      yoyaku: [yoyaku({}), yoyaku({ reservationId: "91", email: "owner@example.com" })],
    });
    expect(bundle.reservations).toHaveLength(1);
    expect(bundle.meta.excludedCount).toBe(1);
  });
  it("備考はremarksにのみ残しhasRemarksフラグ化する", () => {
    const bundle = buildCanonical({
      ...base,
      yoyaku: [yoyaku({ remarks: "16名でイベント希望" })],
    });
    expect(bundle.reservations[0].hasRemarks).toBe(true);
    expect(JSON.stringify(bundle.reservations)).not.toContain("16名");
    expect(bundle.remarks[0]).toMatchObject({ reservationId: "90", remarks: "16名でイベント希望" });
  });
  it("任意CSV欠落をmissingSectionsへ、coverage.endは生成日JST", () => {
    const bundle = buildCanonical({ ...base, yoyaku: [yoyaku({})] });
    expect(bundle.meta.missingSections).toEqual(["customer", "salesSummary"]);
    expect(bundle.meta.coverage).toEqual({ start: "2026-06-01", end: "2026-07-16" });
    expect(bundle.meta.warnings).toContain("w1");
  });
  it("予約IDの重複はエラー", () => {
    expect(() =>
      buildCanonical({ ...base, yoyaku: [yoyaku({}), yoyaku({})] })
    ).toThrow("重複");
  });
});

describe("JSONL往復", () => {
  it("serialize→parseで同一になる", () => {
    const records = [{ a: 1 }, { a: 2 }];
    const parsed = parseJsonl(serializeJsonl(records), (v) => v as { a: number });
    expect(parsed).toEqual(records);
  });
});
```

- [ ] **Step 2: 失敗確認 → 実装**(coverage.end は `bookedAt` と同じ方式でJST日付化。除外→仮名化→組み立ての順。重複IDは throw)

```typescript
// scripts/growth/labolaNormalize.ts の骨子(全文を実装すること)
import { ageBand, extractWard, occupationGroup, pseudoId } from "./piiBoundary";
import { isExcluded, type ExclusionRules } from "./reservationExclusions";
import type { CustomerRow, SalesSummaryRow, YoyakuRow } from "./labolaSchemas";

// (Interfaces節のとおり型を定義)

function jstYmdOf(iso: string): string {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() + 9 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function buildCanonical(input: {
  yoyaku: YoyakuRow[]; customers: CustomerRow[] | null; salesSummary: SalesSummaryRow[] | null;
  rules: ExclusionRules; hashKey: string; coverageStart: string; generatedAt: string;
  parseWarnings: string[];
}): CanonicalBundle {
  let excludedCount = 0;
  const seen = new Set<string>();
  const reservations: CanonicalReservation[] = [];
  const remarks: RemarkEntry[] = [];
  for (const row of input.yoyaku) {
    if (seen.has(row.reservationId)) throw new Error(`予約番号が重複しています: ${row.reservationId}`);
    seen.add(row.reservationId);
    if (isExcluded(row, input.rules)) { excludedCount += 1; continue; }
    if (row.remarks) remarks.push({ reservationId: row.reservationId, useDate: row.useDate, category: row.category, remarks: row.remarks });
    reservations.push({
      reservationId: row.reservationId, bookedAt: row.bookedAt, useDate: row.useDate,
      start: row.start, end: row.end, category: row.category, space: row.space,
      status: row.status, acceptStatus: row.acceptStatus, paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod, plan: row.plan, amount: row.amount,
      partySize: row.partySize, channel: row.channel, customerType: row.customerType,
      pseudoId: pseudoId(row.email, row.memberNo, input.hashKey),
      ward: extractWard(row.address), ageBand: ageBand(row.birthDate, jstYmdOf(input.generatedAt)),
      gender: row.gender, occupationGroup: occupationGroup(row.occupation),
      hasRemarks: row.remarks !== "",
    });
  }
  // customers も同様に isExcluded → CanonicalCustomer 化(nullならmissingSectionsへ)
  // meta を組み立てて返す(counts: { yoyaku: reservations.length, customer: ..., salesSummary: ... })
  // …
}

export function serializeJsonl(records: readonly unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

export function parseJsonl<T>(content: string, guard: (value: unknown) => T): T[] {
  return content
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return guard(JSON.parse(line));
      } catch (error) {
        throw new Error(`JSONLの${index + 1}行目が不正です: ${String(error)}`);
      }
    });
}
```

- [ ] **Step 3: パス確認 → コミット**

```bash
git add scripts/growth/labolaNormalize.ts scripts/growth/labolaNormalize.test.ts
git commit -m "feat(growth): ラボーラ行の正準化(PII境界適用・除外・JSONL)を追加"
```

---

### Task 6: reservationStats.ts — 統計ユーティリティ

**Files:**
- Create: `scripts/growth/reservationStats.ts`
- Create: `scripts/growth/reservationStats.test.ts`

**Interfaces:**
- Produces:
  - `wilsonInterval(successes: number, n: number): { low: number; high: number } | null`(n=0はnull。z=1.96)
  - `poissonUpperTailP(observed: number, mean: number): number`(P(X≥observed)。mean≤0は1)
  - `poissonLowerTailP(observed: number, mean: number): number`(P(X≤observed))
  - `quantile(sorted: number[], q: number): number | null`(線形補間。空はnull)

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// scripts/growth/reservationStats.test.ts
import { describe, expect, it } from "vitest";
import { poissonLowerTailP, poissonUpperTailP, quantile, wilsonInterval } from "./reservationStats";

describe("wilsonInterval", () => {
  it("既知値と一致する(3/47, z=1.96)", () => {
    const ci = wilsonInterval(3, 47);
    expect(ci).not.toBeNull();
    expect(ci!.low).toBeCloseTo(0.0219, 3);
    expect(ci!.high).toBeCloseTo(0.1734, 3);
  });
  it("n=0はnull、0/nと n/n も破綻しない", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(0, 10)!.low).toBe(0);
    expect(wilsonInterval(10, 10)!.high).toBeCloseTo(1, 5);
  });
});

describe("poisson tails", () => {
  it("P(X≥k)とP(X≤k)が基本性質を満たす", () => {
    expect(poissonUpperTailP(0, 2)).toBeCloseTo(1, 10);
    expect(poissonUpperTailP(5, 2)).toBeCloseTo(1 - 0.947347, 4); // 1-CDF(4;2)
    expect(poissonLowerTailP(1, 4)).toBeCloseTo(0.091578, 4); // CDF(1;4)
    expect(poissonUpperTailP(3, 0)).toBe(0);
    expect(poissonUpperTailP(0, 0)).toBe(1);
  });
});

describe("quantile", () => {
  it("中央値と四分位を線形補間で返す", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
    expect(quantile([5], 0.25)).toBe(5);
    expect(quantile([], 0.5)).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗確認 → 実装**

```typescript
// scripts/growth/reservationStats.ts
/** 小標本ガードレール用の統計ユーティリティ(依存なし・純ロジック)。 */

const Z = 1.96;

export function wilsonInterval(
  successes: number,
  n: number
): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, (center - margin) / denom), high: Math.min(1, (center + margin) / denom) };
}

export function poissonLowerTailP(observed: number, mean: number): number {
  if (mean <= 0) return 1;
  let term = Math.exp(-mean);
  let sum = term;
  for (let k = 1; k <= observed; k += 1) {
    term *= mean / k;
    sum += term;
  }
  return Math.min(1, sum);
}

export function poissonUpperTailP(observed: number, mean: number): number {
  if (mean <= 0) return observed <= 0 ? 1 : 0;
  if (observed <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - poissonLowerTailP(observed - 1, mean)));
}

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
```

- [ ] **Step 3: パス確認 → コミット**

```bash
git add scripts/growth/reservationStats.ts scripts/growth/reservationStats.test.ts
git commit -m "feat(growth): Wilson区間・Poisson裾確率・分位点を追加"
```

---

### Task 7: reservationAggregates.ts — コア集計

**Files:**
- Create: `scripts/growth/reservationAggregates.ts`
- Create: `scripts/growth/reservationAggregates.test.ts`

**Interfaces:**
- Consumes: `CanonicalBundle`(Task 5)、`DateRange`(`./period`)、`quantile`/`wilsonInterval`(Task 6)
- Produces:
  - `jstYmdOfIso(iso: string): string`(booked_at → JST日付。Task 5の私有関数をこちらへ公開移設し、Task 5はこれをimport)
  - `weeklyKpis(bundle, current: DateRange, prior: DateRange): { actual: { currentWeek: number; priorWeek: number; cumulative: number }; self: { selfCount4w: number; total4w: number; smartphone4w: number }; sales: { currentWeek: number | null; priorWeek: number | null; forecast28: number | null } }`
  - `weeklyReservationSeries(bundle): { weekStart: string; count: number }[]`(月曜始まり・キャンセル除く・全履歴)
  - `demandHeatmap(bundle, referenceYmd: string): { dow: number; slot: string; count: number }[]`(dow 0=月…6=日。slot は `"6-9"|"9-12"|"12-15"|"15-18"|"18-21"|"21-23"`。直近28日の利用日ベース・キャンセル除く・時間帯は区間重なりで計上)
  - `leadTimeStats(bundle, referenceYmd: string): { n: number; median: number; p25: number; p75: number } | null`(直近28日の受付分。利用日−受付日の日数。n=0はnull)
  - `wardCounts(bundle): { ward: string; customers: number; reservations: number }[]`(降順。"不明"は末尾)
  - `cancellationStats(bundle, referenceYmd: string): { n: number; cancelled: number; rate: number; ciLow: number; ciHigh: number } | null`(直近28日の受付分。n=0はnull)

- [ ] **Step 1: 失敗するテストを書く**(ビルダー `res(over)` で CanonicalReservation を合成。各関数2〜3ケース: 期間内外の境界・キャンセル除外・売上データ欠落時null・ヒートマップの重なり計上(19:00-21:00 → "18-21"と"21-23"に各+1)・リードタイム中央値・wardソート)

```typescript
// scripts/growth/reservationAggregates.test.ts(代表ケースのみ抜粋 — 実装時は上記全件書く)
import { describe, expect, it } from "vitest";
import { demandHeatmap, leadTimeStats, weeklyKpis, weeklyReservationSeries } from "./reservationAggregates";
// res()/bundle() ビルダーは CanonicalBundle の全フィールドに既定値を持つ

it("weeklyKpis: 受付日ベースで週件数・累積・セルフ比率素材を返す", () => {
  const b = bundle([
    res({ bookedAt: "2026-07-14T10:00:00+09:00", channel: "user_sp" }),   // current内
    res({ reservationId: "2", bookedAt: "2026-07-06T10:00:00+09:00", channel: "admin" }), // prior内
    res({ reservationId: "3", bookedAt: "2026-07-14T11:00:00+09:00", status: "cancelled" }), // 除外
  ]);
  const kpi = weeklyKpis(b, { start: "2026-07-13", end: "2026-07-19" }, { start: "2026-07-06", end: "2026-07-12" });
  expect(kpi.actual).toEqual({ currentWeek: 1, priorWeek: 1, cumulative: 2 });
  expect(kpi.sales.currentWeek).toBeNull(); // salesDaily空
});

it("demandHeatmap: 時間帯の重なりで計上する", () => {
  const b = bundle([res({ useDate: "2026-07-10", start: "19:00", end: "21:30" })]); // 金曜
  const cells = demandHeatmap(b, "2026-07-16");
  expect(cells.find((c) => c.dow === 4 && c.slot === "18-21")?.count).toBe(1);
  expect(cells.find((c) => c.dow === 4 && c.slot === "21-23")?.count).toBe(1);
});
```

- [ ] **Step 2: 失敗確認 → 実装**(50行超の関数は分割。`weeklyReservationSeries` は最古週から実行週まで0埋め。売上: `salesDaily` が空なら3値ともnull、`forecast28` は referenceYmd から27日後までの `isForecast` 行合計)

- [ ] **Step 3: パス確認 → コミット**

```bash
git add scripts/growth/reservationAggregates.ts scripts/growth/reservationAggregates.test.ts
git commit -m "feat(growth): 予約コア集計(KPI・ヒートマップ・リードタイム・商圏・キャンセル率)を追加"
```

---

### Task 8: snapshotSchema.ts — スナップショットの型と検証

**Files:**
- Create: `scripts/growth/snapshotSchema.ts`
- Create: `scripts/growth/snapshotSchema.test.ts`

**Interfaces:**
- Consumes: なし(zodのみ)
- Produces:
  - `const insightSchema`(`{ id, detector, severity: "info"|"notice"|"alert", title, body, evidence: z.record(z.unknown()), label: "有意"|"観察", firstSeen, status: "new"|"recurring" }`)
  - `type Insight = z.infer<typeof insightSchema>`
  - `const snapshotSchema`(`{ schemaVersion: z.literal(1), generatedAt, coverage:{start,end}, meta:{ inputs: {type,rows}[], excludedCount, missingSections: string[], warnings: string[] }, kpi:{ actual:{currentWeek,priorWeek,cumulative}, self:{selfCount4w,total4w,smartphone4w}, sales:{currentWeek: number|null, priorWeek: number|null, forecast28: number|null} }, catalog:{ heatmap:{dow,slot,count}[], leadTime:{n,median,p25,p75}|null, cancellation:{n,cancelled,rate,ciLow,ciHigh}|null, wards:{ward,customers,reservations}[] }, series:{ weeklyReservations:{weekStart,count}[] }, insights: insightSchema[] }`)
  - `type Snapshot = z.infer<typeof snapshotSchema>`
  - `parseSnapshot(json: string): Snapshot`(不正はエラー)

- [ ] **Step 1: 失敗するテスト**(最小の妥当スナップショットが通る/severity不正・schemaVersion≠1が落ちる/parseSnapshotがJSON不正で日本語エラー)
- [ ] **Step 2: 実装 → パス確認 → コミット**

```bash
git add scripts/growth/snapshotSchema.ts scripts/growth/snapshotSchema.test.ts
git commit -m "feat(growth): スナップショットのzodスキーマを追加"
```

---

### Task 9: 気づき検出エンジン(D1・D2・D3・D11・D12)

**Files:**
- Create: `scripts/growth/insightEngine.ts`
- Create: `scripts/growth/insightEngine.test.ts`
- Create: `scripts/growth/insightDetectors/firstSeenWard.ts`(D1)
- Create: `scripts/growth/insightDetectors/reservationCountChange.ts`(D2)
- Create: `scripts/growth/insightDetectors/selfRateChange.ts`(D3)
- Create: `scripts/growth/insightDetectors/dataHealth.ts`(D11: missingSections・種別行数が前回比50%未満)
- Create: `scripts/growth/insightDetectors/newRemarks.ts`(D12)
- Create: 各検出器の `*.test.ts`(同ディレクトリ)

**Interfaces:**
- Consumes: `CanonicalBundle`・`Snapshot`/`Insight`(Task 8)・`weeklyReservationSeries`・`wilsonInterval`・`poissonUpperTailP`/`poissonLowerTailP`
- Produces:
  - `interface DetectorContext { bundle: CanonicalBundle; previousSnapshot: Snapshot | null; current: DateRange; prior: DateRange; todayYmd: string }`
  - `type Detector = (ctx: DetectorContext) => Omit<Insight, "firstSeen" | "status">[]`
  - `runDetectors(ctx: DetectorContext, detectors: readonly Detector[]): Insight[]`(前回スナップショットの同idと突合し `status: "recurring"`+`firstSeen` 引き継ぎ。新規は `firstSeen = todayYmd`・`status: "new"`)
  - `CORE_DETECTORS: readonly Detector[]`(上記5つ)

**検出仕様(テストで固定する):**
- D1 `firstSeenWard`: 今回 wards(customers≥1, "不明"除く)− 前回 `catalog.wards` の差分を notice で1件ずつ(`id: "d1:ward:<ward>"`)。**previousSnapshot が null なら空**(初回洪水防止)
- D2 `reservationCountChange`: `weeklyReservationSeries` の直近完了週 count を、その前4週平均λと比較。p = 上振れは Upper / 下振れは Lower。p<0.05 → 有意 notice。それ以外で count≥2λ または count≤λ/2(λ≥1) → 観察 info。λ算出週が4週未満なら空(`id: "d2:weekly:<weekStart>"`)
- D3 `selfRateChange`: 直近28日 vs その前28日のセルフ予約率(selfCount/total)。両期間 n≥10 かつ Wilson区間が重ならないとき notice 有意(`id: "d3:selfRate:<currentWeekStart>"`)
- D11 `dataHealth`: `meta.missingSections` 非空 → info(id固定 `"d11:missing"`)。前回 `meta.inputs` と比べ同typeの rows が50%未満 → alert(`id: "d11:rowdrop:<type>"`)
- D12 `newRemarks`: `bundle.remarks` のうち予約の bookedAt が current 週内 → 1件ごとに info(`id: "d12:remark:<reservationId>"`。本文は body に**入れない**。「備考に新規の問い合わせがあります(予約番号◯◯)。remarks-review を確認」)

- [ ] **Step 1: 検出器ごとに失敗するテスト → 実装 → パス**(D2の例)

```typescript
// scripts/growth/insightDetectors/reservationCountChange.test.ts(代表)
it("前4週平均より有意に多い週をnoticeにする", () => {
  const b = bundleWithWeeklyCounts({ "2026-06-15": 2, "2026-06-22": 2, "2026-06-29": 2, "2026-07-06": 2, "2026-07-13": 9 });
  const out = reservationCountChange(ctx(b, { todayYmd: "2026-07-22" }));
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ severity: "notice", label: "有意" });
  expect(out[0].evidence).toMatchObject({ observed: 9, baselineMean: 2 });
});
it("履歴4週未満は何も出さない", () => { /* 2週分だけ → [] */ });
```

- [ ] **Step 2: runDetectors の重複排除テスト → 実装**

```typescript
// scripts/growth/insightEngine.test.ts(代表)
it("前回と同じidはrecurringになりfirstSeenを引き継ぐ", () => {
  const prev = snapshotWithInsight({ id: "d1:ward:葛飾区", firstSeen: "2026-07-09", status: "new" });
  const out = runDetectors(ctx({ previousSnapshot: prev, todayYmd: "2026-07-16" }), [fakeDetectorEmitting("d1:ward:葛飾区")]);
  expect(out[0]).toMatchObject({ status: "recurring", firstSeen: "2026-07-09" });
});
```

- [ ] **Step 3: コミット**

```bash
git add scripts/growth/insightEngine.ts scripts/growth/insightEngine.test.ts scripts/growth/insightDetectors/
git commit -m "feat(growth): 気づき検出エンジンとコア検出器(D1-D3,D11,D12)を追加"
```

---

### Task 10: snapshotBuild.ts と LINEダイジェスト整形

**Files:**
- Create: `scripts/growth/snapshotBuild.ts`
- Create: `scripts/growth/snapshotBuild.test.ts`
- Create: `scripts/growth/reservationDigest.ts`
- Create: `scripts/growth/reservationDigest.test.ts`

**Interfaces:**
- Consumes: Task 5/7/8/9 の全出力
- Produces:
  - `buildSnapshot(input: { bundle: CanonicalBundle; current: DateRange; prior: DateRange; todayYmd: string; previousSnapshot: Snapshot | null }): Snapshot`(集計→検出→schema.parseで自己検証して返す)
  - `formatIngestDigest(snapshot: Snapshot): string`(LINE本文。実予約 今週n件(累積N)・気づき新規M件(severity順に最大5件、タイトルのみ)・警告があれば末尾に)
  - `formatRemarksReview(remarks: RemarkEntry[], generatedYmd: string): string`(人間レビュー用Markdown。冒頭に「AIプロンプトに投入しないこと」の注意書き)

- [ ] **Step 1: 失敗するテスト**(buildSnapshot が schema に適合し kpi/insights が繋がる統合ケース1本+formatIngestDigest の文面2ケース+formatRemarksReview 1ケース)
- [ ] **Step 2: 実装 → パス確認 → コミット**

```bash
git add scripts/growth/snapshotBuild.ts scripts/growth/snapshotBuild.test.ts scripts/growth/reservationDigest.ts scripts/growth/reservationDigest.test.ts
git commit -m "feat(growth): スナップショット組み立てとLINEダイジェスト整形を追加"
```

---

### Task 11: ingest-cli.ts — 薄いCLI(I/O結線)

**Files:**
- Create: `scripts/growth/ingest-cli.ts`
- Modify: `package.json`(scripts に `"growth:ingest": "tsx scripts/growth/ingest-cli.ts"`)
- Modify: `vitest.config.ts`(coverage.exclude に `"scripts/growth/ingest-cli.ts"`)
- Modify: `.env.example`(予約セクションを差し替え — Task 12 と同時でも可)

**Interfaces:**
- Consumes: Task 1〜10 の全純ロジック、`computeWeeklyPeriods`/`jstDateString`(`./period`)、`pushTextMessage`(`./line`)
- Produces: 実行フロー(テスト対象外・カバレッジ除外。ロジックを書かないこと)

**フロー(擬似コード。この順で実装):**

```typescript
// scripts/growth/ingest-cli.ts(薄皮。ロジックは全て純モジュール呼び出し)
import "dotenv/config";
// 1. env読み込み: GROWTH_LABOLA_DROP_DIR(必須), GROWTH_RESERVATION_DATA_DIR(必須),
//    GROWTH_RESERVATION_COVERAGE_START(既定 "2026-06-01"), GROWTH_ANALYTICS_HASH_KEY(必須),
//    GROWTH_DRYRUN, LINE_GROUP_ID/LINE_CHANNEL_ACCESS_TOKEN(任意)
// 2. dropDir の *.csv を readdir → 各ファイル readFile(Buffer) → decodeSjis → parseCsvRows
//    → detectCsvType。未知種別は警告して無視。同種別複数は mtime 最新を採用し警告。
// 3. yoyaku が無ければ「工程 ingest: 予約一覧詳細CSVが見つかりません。ラボーラから
//    エクスポートして <dropDir> に置き、npm run growth:ingest を再実行してください」で exit 1
// 4. parseYoyakuRows / parseCustomerRows / parseSalesSummaryRows(欠落は null)
// 5. assets/reservation-exclusions.json を読み parseExclusionRules
// 6. buildCanonical(generatedAt = new Date().toISOString())
// 7. 前回スナップショット: `${dataDir}/snapshots/` の最新 snapshot-*.json を parseSnapshot(無ければnull)
// 8. buildSnapshot({ bundle, current, prior, todayYmd: jstDateString(new Date()), previousSnapshot })
//    ※ current/prior は computeWeeklyPeriods(new Date())
// 9. GROWTH_DRYRUN=1 なら書き込み・送信せず、meta と insights 件数を整形して console.log し終了
// 10. 書き込み: `${dataDir}/canonical/{reservations,customers,sales_daily}.jsonl`(serializeJsonl),
//     `${dataDir}/canonical/meta.json`, `${dataDir}/snapshots/snapshot-<todayYmd>.json`,
//     `${dataDir}/remarks/remarks-review-<todayYmd>.md`(remarksが空でも空ファイルは作らない)
// 11. LINE: env が揃っていれば pushTextMessage(LINE_GROUP_ID, formatIngestDigest(snapshot), {channelAccessToken})。
//     無ければ console.log にフォールバック(理由を明示)
// 12. 失敗時: 工程名付きエラーを console.error し、可能なら LINE 通知して exit 1(沈黙禁止)
```

- [ ] **Step 1: CLIを実装する**(上記フローどおり。関数分割し、各ステップに工程名ログ `[ingest] ...`)
- [ ] **Step 2: 空実行で動作確認**

```bash
mkdir -p /tmp/labola-drop /tmp/labola-data
cp scripts/growth/__fixtures__/labola/yoyaku_sjis.csv /tmp/labola-drop/
GROWTH_DRYRUN=1 GROWTH_LABOLA_DROP_DIR=/tmp/labola-drop GROWTH_RESERVATION_DATA_DIR=/tmp/labola-data \
GROWTH_ANALYTICS_HASH_KEY=devkey npx tsx scripts/growth/ingest-cli.ts
```

Expected: `[ingest] DRYRUN: 予約2件(除外0)・気づき0件・missingSections=customer,salesSummary` 相当の出力で exit 0

- [ ] **Step 3: DRYRUNなしで実行し、canonical/snapshots/remarks が生成されること・PII(名前・メール)が出力ファイルに含まれないことを確認**

```bash
GROWTH_LABOLA_DROP_DIR=/tmp/labola-drop GROWTH_RESERVATION_DATA_DIR=/tmp/labola-data \
GROWTH_ANALYTICS_HASH_KEY=devkey npx tsx scripts/growth/ingest-cli.ts
grep -r "example.com\|試験" /tmp/labola-data && echo "PII混入!" || echo "PIIなし OK"
```

Expected: `PIIなし OK`

- [ ] **Step 4: コミット**

```bash
git add scripts/growth/ingest-cli.ts package.json vitest.config.ts
git commit -m "feat(growth): 取り込みCLI(growth:ingest)を追加"
```

---

### Task 12: metrics-cli を正準データセット読み取りへ切り替え(破壊的変更)

**Files:**
- Modify: `scripts/growth/reservations.ts`(`parseReservationCsv`・`parseReservationCoverageJson`・`csvRows` を削除。`parseCanonicalReservationsJsonl`・`parseCanonicalMeta` を追加。`aggregateReservations`/`actualReservationsForPage`/`isReservationDataFresh`/`selectLatestReservationSnapshot` は無変更)
- Modify: `scripts/growth/reservations.test.ts`(削除APIのテストを新APIのテストに差し替え。集計系テストは無変更)
- Modify: `scripts/growth/metrics-cli.ts:163-195`(`loadReservationCsv`→`loadCanonicalReservations`)
- Modify: `.env.example`(`GROWTH_RESERVATION_CSV_PATH`/`GROWTH_RESERVATION_COVERAGE_PATH` を削除し新変数ブロックへ)

**Interfaces:**
- Produces:
  - `parseCanonicalReservationsJsonl(content: string): ParsedReservationCsv`(各行を検証: reservationId非空・重複なし・bookedAt がDate.parse可能・status ∈ confirmed|cancelled。`hasSourcePagePath: false` 固定)
  - `parseCanonicalMeta(json: string): { generatedAt: string; coverage: ReservationCoverage }`(coverageは既存 `ReservationCoverage` を再利用。start>endはエラー)
- 消費側: `metrics-cli` は `GROWTH_RESERVATION_DATA_DIR` から `canonical/reservations.jsonl` と `canonical/meta.json` を読み、`{ parsed, syncedAt: meta.generatedAt, coverage: meta.coverage }` を返す(未設定→`not_configured`、読めない→`read_error`、検証失敗→`invalid` — 既存の `ActualReservationMetrics` の missing reason をそのまま使う)。`source: "csv"` リテラルは**変更しない**(Notionミラーの `parseMetrics` 後方互換のため)

- [ ] **Step 1: reservations.test.ts に新APIの失敗するテストを書く**

```typescript
it("JSONLを既存のParsedReservationCsvへ変換する", () => {
  const content =
    '{"reservationId":"1","bookedAt":"2026-07-15T14:19:00+09:00","status":"confirmed","ward":"台東区"}\n' +
    '{"reservationId":"2","bookedAt":"2026-07-13T10:00:00+09:00","status":"cancelled"}\n';
  const parsed = parseCanonicalReservationsJsonl(content);
  expect(parsed.records).toHaveLength(2);
  expect(parsed.hasSourcePagePath).toBe(false);
});
it("statusが不正な行はエラー", () => {
  expect(() => parseCanonicalReservationsJsonl('{"reservationId":"1","bookedAt":"2026-07-15T14:19:00+09:00","status":"pending"}\n')).toThrow("status");
});
it("metaのcoverageを検証する", () => {
  expect(parseCanonicalMeta('{"generatedAt":"2026-07-16T05:20:00.000Z","coverage":{"start":"2026-06-01","end":"2026-07-16"}}')).toEqual({ generatedAt: "2026-07-16T05:20:00.000Z", coverage: { start: "2026-06-01", end: "2026-07-16" } });
  expect(() => parseCanonicalMeta('{"generatedAt":"x","coverage":{"start":"2026-07-16","end":"2026-06-01"}}')).toThrow("前後が逆");
});
```

- [ ] **Step 2: 実装(旧API削除+新API追加)。旧APIのテストを削除**
- [ ] **Step 3: metrics-cli の `loadReservationCsv` を差し替える**

```typescript
async function loadCanonicalReservations(
  dataDir: string | undefined,
  checkedAt: string
): Promise<ReservationCsvSnapshot | ActualReservationMetrics> {
  if (!dataDir) return { state: "missing", reason: "not_configured", checkedAt };
  try {
    const [jsonl, metaJson] = await Promise.all([
      readFile(join(dataDir, "canonical", "reservations.jsonl"), "utf8"),
      readFile(join(dataDir, "canonical", "meta.json"), "utf8"),
    ]);
    try {
      const meta = parseCanonicalMeta(metaJson);
      return { parsed: parseCanonicalReservationsJsonl(jsonl), syncedAt: meta.generatedAt, coverage: meta.coverage };
    } catch (error) {
      console.warn("[metrics] 正準データセットが不正です:", error);
      return { state: "missing", reason: "invalid", checkedAt };
    }
  } catch (error) {
    console.warn("[metrics] 正準データセットを読み込めません:", error);
    return { state: "missing", reason: "read_error", checkedAt };
  }
}
// 呼び出し側: loadCanonicalReservations(process.env.GROWTH_RESERVATION_DATA_DIR, nowIso)
```

- [ ] **Step 4: .env.example を差し替える**

```
# ラボーラ取り込み(施設経営データ基盤)。設計: docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md
# ラボーラCSVのドロップディレクトリ(絶対パス)
GROWTH_LABOLA_DROP_DIR=
# 正準データセット・スナップショットの保存先(絶対パス)。metrics-cliもここを読む
GROWTH_RESERVATION_DATA_DIR=
# 収録範囲の開始日(ラボーラ運用開始日)。省略時 2026-06-01
GROWTH_RESERVATION_COVERAGE_START=
# 仮名ID用HMACキー(server-only。十分に長いランダム値)
GROWTH_ANALYTICS_HASH_KEY=
```

- [ ] **Step 5: 全テスト+リポジトリ規約の検証**

Run: `npx vitest run scripts/growth/` → 全PASS。`npx tsc --noEmit` → エラーなし
`grep -rn "GROWTH_RESERVATION_CSV_PATH" scripts src docs .env.example` → docs の設計書以外でヒットしないこと

- [ ] **Step 6: コミット**

```bash
git add scripts/growth/reservations.ts scripts/growth/reservations.test.ts scripts/growth/metrics-cli.ts .env.example
git commit -m "feat(growth)!: metrics-cliを正準データセット読み取りへ切り替え(旧予約CSV形式を廃止)"
```

---

### Task 13: ドキュメント更新と実データ検証手順

**Files:**
- Modify: `docs/operations/growth/50-publish-metrics.md`(「CTAイベント別・実予約CSV(#280)」節)
- Modify: `docs/operations/growth-weekly-runbook.md`(「予約CSV更新とイベント別計測(#280)」節・570行付近)

**手順:**

- [ ] **Step 1: 50-publish-metrics.md の #280 節の本文を以下へ差し替える**(見出しは「実予約データ(施設経営データ基盤)」に変更)

> 実予約は **施設経営データ基盤**(設計: `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md`)から供給する。週次でラボーラ管理画面から全期間CSVをドロップディレクトリへエクスポートし、`npm run growth:ingest` が正準データセット(PII除去済みJSONL)とスナップショット(集計+気づき)を生成、LINEダイジェストを送る。`growth:metrics` は `GROWTH_RESERVATION_DATA_DIR/canonical/` を読み、従来どおり記事別の実予約状態をNotionミラーへ書く(coverage不足→`coverage_incomplete`、未設定/読取失敗→`missing` の扱いは従来と同じ)。旧 `GROWTH_RESERVATION_CSV_PATH`+sidecar 形式は廃止。

- [ ] **Step 2: runbook の該当節を新手順(エクスポート→ドロップ→`npm run growth:ingest`→LINE確認)に書き換える**
- [ ] **Step 3: コミット**

```bash
git add docs/operations/growth/50-publish-metrics.md docs/operations/growth-weekly-runbook.md
git commit -m "docs(growth): 実予約の供給元を施設経営データ基盤に更新"
```

- [ ] **Step 4(人間・自宅PC): 実CSVでの検証**(Claudeは実PIIデータを扱わない。ユーザーが実施)

```bash
# ドロップフォルダに実CSV一式を置いてから
GROWTH_DRYRUN=1 npm run growth:ingest
```

確認事項: ①全CSVの種別判定が通る ②ヘッダー名不一致のエラーが出たら `labolaSchemas.ts` の定数を実物に合わせて修正(署名は `labolaCsv.ts` と同期) ③未知の予約ステータス値が出たら写像に追加 ④出力ファイルに PII が無いこと(`grep` で氏名・メールを確認)

---

## Self-Review 結果

- **Spec coverage(P1コア範囲)**: §4(判定・SJIS・写像・除外)=T1/T2/T4、§5.1(正準)=T5、§5.2(スナップショット)=T8/T10、§5.3コア集計=T7、§6(PII境界)=T3/T5、§7(D1/D2/D3/D11/D12+dedup)=T9、§9(CI・分位)=T6、CLI/LINE/運用=T11、§12(切替・env・docs)=T12/T13。**未カバー(続編計画へ明示送り)**: 残りCSV3種正準化・残集計・D4〜D10/D13・publicFacingPack・再エクスポート・Blob/UI(P2)
- **Placeholder scan**: T7/T8/T10 はインターフェース完全指定+代表テストコード提示(全文はTDDで実装者が書く)。型・関数名は全タスクで整合済み
- **Type consistency**: `CanonicalBundle`/`Snapshot`/`Insight`/`DetectorContext`/`ParsedReservationCsv` の参照名をタスク間で統一済み。`jstYmdOfIso` は T7 で公開し T5 が利用
