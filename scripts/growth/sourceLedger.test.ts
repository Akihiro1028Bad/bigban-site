import { describe, expect, it, vi } from "vitest";

import {
  buildSourceLedgerProps,
  confirmedFactsFromEntries,
  confirmedFactsFromPage,
  confirmedFactsFromRenderedText,
  factBindingFromEntries,
  factBindingFromPage,
  hasReferenceEligibleSource,
  parseSourceLedger,
  renderSourceLedgerText,
  SOURCE_LEDGER_PROP,
  updatePagePropsWithLedgerFallback,
  withBindingBodyHash,
  type SourceLedgerEntry,
} from "./sourceLedger";

const validEntry: SourceLedgerEntry = {
  sourceType: "official-site",
  source: "https://example.com/report",
  confirmedFacts: ["2024年の公式レポートで競技人口を公表"],
};

const auditReference = {
  factId: "fact-price",
  statement: "参加費は500円",
  excerpt: "参加費は500円",
  sectionPath: "料金",
  container: "p" as const,
  containerIndex: 2,
  recheckBeforePublish: true,
  recheckReason: "料金",
  bindingVersion: 1,
  bodyHash: "fnv1a64:abc",
};

const legacyEntry = {
  claim: "ピックルボールは全世界で急成長している",
  sourceType: "search-result",
  source: "https://example.com/report",
  publishedYear: 2024,
  referenceEligible: true,
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

  it("監査参照を任意で受理し、不正な参照だけ警告付きで除外する", () => {
    expect(parseSourceLedger([{ ...validEntry, factReferences: [auditReference] }]).entries[0].factReferences).toEqual([auditReference]);
    const result = parseSourceLedger([{ ...validEntry, factReferences: [auditReference, { ...auditReference, container: "h2" }] }]);
    expect(result.entries[0].factReferences).toEqual([auditReference]);
    expect(result.warnings).toHaveLength(1);
  });

  it("同じ情報源の確認済み事実を1件へ集約する", () => {
    const result = parseSourceLedger([
      validEntry,
      { ...validEntry, confirmedFacts: ["料金は一般230円"] },
      { ...validEntry, confirmedFacts: ["料金は一般230円"] },
    ]);
    expect(result.entries).toEqual([
      {
        ...validEntry,
        confirmedFacts: ["2024年の公式レポートで競技人口を公表", "料金は一般230円"],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("同じ情報源の監査参照も重複なく集約する", () => {
    const first = { ...validEntry, factReferences: [auditReference] };
    const second = {
      ...validEntry,
      factReferences: [auditReference, { ...auditReference, factId: "fact-capacity", excerpt: "定員は20人" }],
    };
    expect(parseSourceLedger([first, second]).entries[0].factReferences).toEqual([
      auditReference,
      { ...auditReference, factId: "fact-capacity", excerpt: "定員は20人" },
    ]);
    expect(parseSourceLedger([validEntry, second]).entries[0].factReferences).toEqual(second.factReferences);
  });

  it("旧claim形式は確認済み情報源形式へ変換して再実行互換を保つ", () => {
    const result = parseSourceLedger([legacyEntry]);
    expect(result.entries).toEqual([
      {
        sourceType: "search-result",
        source: legacyEntry.source,
        confirmedFacts: [legacyEntry.claim],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("旧形式の未使用・low項目は保存しない", () => {
    const result = parseSourceLedger([
      { ...legacyEntry, usableInArticle: false },
      { ...legacyEntry, confidence: "low" },
    ]);
    expect(result.entries).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });

  it("不正な項目は例外ではなく警告付きで除外し、正当な項目は残す", () => {
    const broken = { ...validEntry, confirmedFacts: [] };
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

describe("confirmedFactsFromEntries", () => {
  it("全情報源の確認済み事実を重複なく平坦化する", () => {
    expect(
      confirmedFactsFromEntries([
        validEntry,
        { ...validEntry, source: "https://example.com/other", confirmedFacts: [validEntry.confirmedFacts[0], "体験会は7月20日に開催します"] },
      ])
    ).toEqual(["2024年の公式レポートで競技人口を公表", "体験会は7月20日に開催します"]);
  });

  it("Notion保存済みテキストから確認済み事実を復元し、不正行は無視する", () => {
    expect(
      confirmedFactsFromRenderedText(
        "official-site | https://example.com | 体験会は7月20日に開催します／参加費は500円\n不正行"
      )
    ).toEqual(["体験会は7月20日に開催します", "参加費は500円"]);
  });

  it("Notionページの分割された根拠台帳から確認済み事実を返す", () => {
    expect(
      confirmedFactsFromPage({
        id: "page-1",
        url: "",
        properties: {
          根拠台帳: {
            rich_text: [
              { plain_text: "official-site | https://example.com | 体験会は" },
              { plain_text: "7月20日に開催します" },
            ],
          },
        },
      })
    ).toEqual(["体験会は7月20日に開催します"]);
    expect(confirmedFactsFromPage({ id: "page-2", url: "", properties: {} })).toEqual([]);
    expect(
      confirmedFactsFromPage({
        id: "page-3",
        url: "",
        properties: { 根拠台帳: { rich_text: [{}] } },
      })
    ).toEqual([]);
  });
});

describe("renderSourceLedgerText", () => {
  it("1行1情報源の読みやすい形式へ整形する", () => {
    const text = renderSourceLedgerText([validEntry]);
    expect(text).toBe(
      "official-site | https://example.com/report | 2024年の公式レポートで競技人口を公表"
    );
  });

  it("親行の下へfact監査行を表示し、品質ゲートのfact復元には混ぜない", () => {
    const text = renderSourceLedgerText([{ ...validEntry, factReferences: [auditReference] }]);
    expect(text).toContain("  ↳ fact-price [公開前再確認:料金] [binding:v1;hash=fnv1a64:abc] 料金 > p#2");
    expect(text).toContain("根拠「参加費は500円」");
    expect(text).toContain("[binding:v1;hash=fnv1a64:abc]");
    expect(confirmedFactsFromRenderedText(text)).toEqual(validEntry.confirmedFacts);
  });

  it("bindingメタデータをentry・Notionテキストから復元し、不整合をinvalidにする", () => {
    const entry = { ...validEntry, factReferences: [auditReference] };
    expect(factBindingFromEntries([entry])).toEqual({
      version: 1,
      bodyHash: "fnv1a64:abc",
      referenceCount: 1,
      isValid: true,
    });
    expect(factBindingFromEntries([validEntry])).toBeUndefined();
    expect(factBindingFromEntries([{ ...entry, factReferences: [auditReference, { ...auditReference, bodyHash: "fnv1a64:def" }] }])?.isValid).toBe(false);
    const page = {
      id: "page-binding",
      url: "",
      properties: { 根拠台帳: { rich_text: [{ plain_text: renderSourceLedgerText([entry]) }] } },
    };
    expect(factBindingFromPage(page)).toMatchObject({ bodyHash: "fnv1a64:abc", isValid: true });
  });

  it("最終本文に合わせて全referenceのhashを更新する", () => {
    const entry = { ...validEntry, factReferences: [auditReference] };
    const updated = withBindingBodyHash([entry], "<p>最終本文</p>");
    expect(updated[0].factReferences?.[0].bodyHash).not.toBe(auditReference.bodyHash);
    expect(entry.factReferences[0].bodyHash).toBe("fnv1a64:abc");
  });

  it("再確認不要・見出しなしの監査行も表示する", () => {
    expect(renderSourceLedgerText([{
      ...validEntry,
      factReferences: [{
        ...auditReference,
        sectionPath: "",
        recheckBeforePublish: false,
        recheckReason: undefined,
      }],
    }])).toContain("↳ fact-price [binding:v1;hash=fnv1a64:abc] p#2");
    expect(renderSourceLedgerText([{
      ...validEntry,
      factReferences: [{ ...auditReference, recheckReason: undefined }],
    }])).toContain("[公開前再確認:要確認]");
  });

  it("同じ情報源の複数事実は読点で連結する", () => {
    expect(
      renderSourceLedgerText([
        { ...validEntry, confirmedFacts: ["一般230円", "市外690円"] },
      ])
    ).toBe("official-site | https://example.com/report | 一般230円／市外690円");
  });

  it("複数エントリを改行で連結する", () => {
    const text = renderSourceLedgerText([validEntry, validEntry]);
    expect(text.split("\n")).toHaveLength(2);
  });

  it("空配列は空文字を返す", () => {
    expect(renderSourceLedgerText([])).toBe("");
  });
});

describe("hasReferenceEligibleSource", () => {
  it("確認済みの公式外部ソースがあれば true", () => {
    expect(hasReferenceEligibleSource([validEntry])).toBe(true);
  });

  it("施設コンテキストだけなら false", () => {
    expect(hasReferenceEligibleSource([{ ...validEntry, sourceType: "facility-context" }])).toBe(false);
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
