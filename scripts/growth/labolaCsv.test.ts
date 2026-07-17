import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeSjis, detectCsvType, parseCsvRows, selectLatestByType } from "./labolaCsv";

const fixture = () =>
  readFileSync(join(__dirname, "__fixtures__", "labola", "yoyaku_sjis.csv"));

describe("decodeSjis", () => {
  it("Shift_JISのCSVをUTF-8文字列に復号する", () => {
    const text = decodeSjis(fixture());
    expect(text).toContain("予約番号");
    expect(text).toContain("架空太郎");
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

  it("CR単独の改行を扱い、空入力では行を返さない", () => {
    expect(parseCsvRows("a,b\rc,d\r")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsvRows("")).toEqual([]);
  });

  it("末尾に改行がない最終行も確定する", () => {
    expect(parseCsvRows("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
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

describe("selectLatestByType", () => {
  it("未知CSVを警告し、同種別ではmtimeが新しいファイルを選ぶ", () => {
    const result = selectLatestByType([
      { name: "old.csv", mtimeMs: 1, type: "yoyaku" },
      { name: "unknown.csv", mtimeMs: 2, type: null },
      { name: "new.csv", mtimeMs: 3, type: "yoyaku" },
    ]);
    expect(result.selected.yoyaku).toBe("new.csv");
    expect(result.warnings).toEqual(["yoyaku CSVが複数のため古い方を無視", "未知種別のCSVを1件無視"]);
  });

  it("同じmtimeでは先に渡したCSVを選ぶ", () => {
    expect(selectLatestByType([{ name: "first.csv", mtimeMs: 1, type: "sales" }, { name: "second.csv", mtimeMs: 1, type: "sales" }]).selected.sales).toBe("first.csv");
  });
});
