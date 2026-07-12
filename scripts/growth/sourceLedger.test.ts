import { describe, expect, it, vi } from "vitest";

import {
  buildSourceLedgerProps,
  parseSourceLedger,
  renderSourceLedgerText,
  SOURCE_LEDGER_PROP,
  updatePagePropsWithLedgerFallback,
  type SourceLedgerEntry,
} from "./sourceLedger";

const validEntry: SourceLedgerEntry = {
  claim: "ピックルボールは全世界で急成長している",
  sourceType: "search-result",
  source: "https://example.com/report",
  publishedYear: 2024,
  confidence: "high",
  usableInArticle: true,
  reason: "公式レポートの数値を引用",
};

describe("parseSourceLedger", () => {
  it("undefined は欠落耐性で空を返す(警告なし)", () => {
    expect(parseSourceLedger(undefined)).toEqual({ entries: [], warnings: [] });
  });

  it("null は欠落耐性で空を返す(警告なし)", () => {
    expect(parseSourceLedger(null)).toEqual({ entries: [], warnings: [] });
  });

  it("配列でない値は警告付きで空を返す(投入は落とさない)", () => {
    const result = parseSourceLedger({ not: "array" });
    expect(result.entries).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("配列");
  });

  it("正当な1エントリを検証して返す", () => {
    const result = parseSourceLedger([validEntry]);
    expect(result.entries).toEqual([validEntry]);
    expect(result.warnings).toEqual([]);
  });

  it("publishedYear 省略でも任意なので受理する", () => {
    const { publishedYear, ...withoutYear } = validEntry;
    void publishedYear;
    const result = parseSourceLedger([withoutYear]);
    expect(result.entries).toEqual([withoutYear]);
    expect(result.warnings).toEqual([]);
  });

  it("不正な項目は例外ではなく警告付きで除外し、正当な項目は残す", () => {
    const broken = { ...validEntry, claim: "" };
    const result = parseSourceLedger([broken, validEntry]);
    expect(result.entries).toEqual([validEntry]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("[0]");
  });

  it("sourceType が未知の列挙値なら除外する", () => {
    const broken = { ...validEntry, sourceType: "blog-post" };
    const result = parseSourceLedger([broken]);
    expect(result.entries).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("renderSourceLedgerText", () => {
  it("1行1エントリのパイプ区切りへ整形する", () => {
    const text = renderSourceLedgerText([validEntry]);
    expect(text).toBe(
      "ピックルボールは全世界で急成長している | search-result | https://example.com/report | 2024 | high | true | 公式レポートの数値を引用"
    );
  });

  it("publishedYear 欠落時は年を - で埋める", () => {
    const { publishedYear, ...withoutYear } = validEntry;
    void publishedYear;
    const text = renderSourceLedgerText([withoutYear]);
    expect(text).toContain(" | - | ");
  });

  it("複数エントリを改行で連結する", () => {
    const text = renderSourceLedgerText([validEntry, validEntry]);
    expect(text.split("\n")).toHaveLength(2);
  });

  it("空配列は空文字を返す", () => {
    expect(renderSourceLedgerText([])).toBe("");
  });
});

describe("buildSourceLedgerProps", () => {
  it("根拠台帳プロパティを rich_text 形式で組み立てる", () => {
    const props = buildSourceLedgerProps([validEntry]);
    expect(props).toEqual({
      [SOURCE_LEDGER_PROP]: {
        rich_text: [{ text: { content: renderSourceLedgerText([validEntry]) } }],
      },
    });
  });

  it("空配列は rich_text を空にする(プロパティを空欄化)", () => {
    expect(buildSourceLedgerProps([])).toEqual({
      [SOURCE_LEDGER_PROP]: { rich_text: [] },
    });
  });
});

describe("updatePagePropsWithLedgerFallback", () => {
  it("台帳込みで更新に成功したら1回で完了する", async () => {
    const update = vi.fn().mockResolvedValue("page-1");
    const result = await updatePagePropsWithLedgerFallback({
      baseProps: { ステータス: 1 },
      ledgerProps: { 根拠台帳: { rich_text: [] } },
      update,
    });
    expect(result).toEqual({ ledgerSaved: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ステータス: 1, 根拠台帳: { rich_text: [] } });
  });

  it("台帳込みが失敗したら台帳抜きでリトライし警告を返す", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error("根拠台帳 プロパティが存在しません"))
      .mockResolvedValueOnce("page-1");
    const result = await updatePagePropsWithLedgerFallback({
      baseProps: { ステータス: 1 },
      ledgerProps: { 根拠台帳: { rich_text: [] } },
      update,
    });
    expect(result.ledgerSaved).toBe(false);
    expect(result.warning).toContain("根拠台帳");
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith({ ステータス: 1 });
  });

  it("台帳抜きリトライも失敗したら元エラーを投げる(本体更新が壊れている)", async () => {
    const update = vi.fn().mockRejectedValue(new Error("ネットワーク断"));
    await expect(
      updatePagePropsWithLedgerFallback({
        baseProps: { ステータス: 1 },
        ledgerProps: { 根拠台帳: { rich_text: [] } },
        update,
      })
    ).rejects.toThrow("ネットワーク断");
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("Error 以外の値で失敗してもリトライし警告に文字列化して含める", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce("プロパティ未定義")
      .mockResolvedValueOnce("page-1");
    const result = await updatePagePropsWithLedgerFallback({
      baseProps: { ステータス: 1 },
      ledgerProps: { 根拠台帳: { rich_text: [] } },
      update,
    });
    expect(result.ledgerSaved).toBe(false);
    expect(result.warning).toContain("プロパティ未定義");
  });

  it("台帳プロパティが空なら台帳なしで1回更新する", async () => {
    const update = vi.fn().mockResolvedValue("page-1");
    const result = await updatePagePropsWithLedgerFallback({
      baseProps: { ステータス: 1 },
      ledgerProps: {},
      update,
    });
    expect(result).toEqual({ ledgerSaved: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ステータス: 1 });
  });
});
