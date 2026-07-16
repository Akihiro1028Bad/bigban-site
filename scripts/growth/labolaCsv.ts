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
