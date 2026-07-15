/**
 * 確認済み情報源リスト(sourceLedger)の永続化ロジック。
 *
 * 独立した記事リサーチで得たResearchPacketからコードで台帳を組み立て、投入スペックに同梱し、
 * publish-draft が Notion 記事ネタ行のプロパティへ保存する(読者非公開・監査用)。
 *
 * 設計: docs/superpowers/specs/2026-07-10-source-ledger-reference-design.md(D2/D3)。
 * CLI からは薄く呼ぶだけにし、検証・整形・フォールバックの純ロジックはここに集約する。
 */

import { z } from "zod";

import { chunkRichText, type NotionPage } from "./notion";

/** 確認済み情報源の種別。旧specの search-result は再実行互換のため受理する。 */
export const SOURCE_TYPES = [
  "facility-context",
  "primary-note",
  "official-site",
  "search-result",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Notion に保存する台帳プロパティ名(rich_text・任意・publish-draft が自動書き込み)。 */
export const SOURCE_LEDGER_PROP = "根拠台帳";

const factReferenceSchema = z.object({
  factId: z.string().regex(/^fact-[a-z0-9-]+$/i),
  statement: z.string().min(1),
  excerpt: z.string().min(1),
  sectionPath: z.string(),
  container: z.enum(["p", "li", "th", "td"]),
  containerIndex: z.number().int().positive(),
  recheckBeforePublish: z.boolean(),
  recheckReason: z.string().min(1).optional(),
});

const entrySchema = z.object({
  sourceType: z.enum(SOURCE_TYPES),
  source: z.string().min(1),
  confirmedFacts: z.array(z.string().min(1)).min(1),
  factReferences: z.array(z.unknown()).optional(),
});

export type SourceLedgerFactReference = z.infer<typeof factReferenceSchema>;
export interface SourceLedgerEntry {
  sourceType: SourceType;
  source: string;
  confirmedFacts: string[];
  factReferences?: SourceLedgerFactReference[];
}

const legacyEntrySchema = z.object({
  claim: z.string().min(1),
  sourceType: z.enum(["facility-context", "official-site", "search-result", "not-used"]),
  source: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  usableInArticle: z.boolean(),
});

/** 参考資料見出しを許可できる、確認済みの外部情報源があるか。 */
export function hasReferenceEligibleSource(
  entries: readonly SourceLedgerEntry[]
): boolean {
  return entries.some(
    (entry) =>
      entry.sourceType === "official-site" || entry.sourceType === "search-result"
  );
}

export interface ParseSourceLedgerResult {
  /** 検証を通過したエントリ。 */
  entries: SourceLedgerEntry[];
  /** 除外・無視した項目の理由(沈黙させない #24。CLI が報告に出す)。 */
  warnings: string[];
}

/** 情報源単位のリストから、品質ゲートへ渡す確認済み事実だけを重複なく取り出す。 */
export function confirmedFactsFromEntries(
  entries: readonly SourceLedgerEntry[]
): string[] {
  return [...new Set(entries.flatMap((entry) => entry.confirmedFacts))];
}

/** Notionへ保存した1行1情報源の表示テキストから確認済み事実を復元する。 */
export function confirmedFactsFromRenderedText(value: string): string[] {
  const facts = value.split("\n").flatMap((line) => {
    if (line.trimStart().startsWith("↳")) return [];
    const parts = line.split(" | ");
    if (parts.length < 3) return [];
    return parts.slice(2).join(" | ").split("／").map((fact) => fact.trim()).filter(Boolean);
  });
  return [...new Set(facts)];
}

/** Notionページの分割rich_textに保存された確認済み事実を返す。 */
export function confirmedFactsFromPage(page: NotionPage): string[] {
  const value = page.properties[SOURCE_LEDGER_PROP] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  const text = (value?.rich_text ?? []).map((part) => part.plain_text ?? "").join("");
  return confirmedFactsFromRenderedText(text);
}

/**
 * 信頼できない sourceLedger 値を検証する(欠落耐性)。
 * - undefined / null は空(警告なし)= 台帳欠落でも投入は従来どおり成功する。
 * - 配列でなければ警告付きで空を返す(投入自体は落とさない)。
 * - 各項目はスキーマ不一致でも throw せず、警告付きで除外する
 *   (1項目の不備で投入全体を落とさない)。除外の事実は warnings で返す。
 */
export function parseSourceLedger(value: unknown): ParseSourceLedgerResult {
  if (value === undefined || value === null) {
    return { entries: [], warnings: [] };
  }
  if (!Array.isArray(value)) {
    return {
      entries: [],
      warnings: [`${SOURCE_LEDGER_PROP}: 配列ではないため無視しました。`],
    };
  }

  const parsedEntries: SourceLedgerEntry[] = [];
  const warnings: string[] = [];
  value.forEach((item, index) => {
    const result = entrySchema.safeParse(item);
    if (result.success) {
      const references: SourceLedgerFactReference[] = [];
      result.data.factReferences?.forEach((reference, referenceIndex) => {
        const parsedReference = factReferenceSchema.safeParse(reference);
        if (parsedReference.success) references.push(parsedReference.data);
        else warnings.push(`${SOURCE_LEDGER_PROP}[${index}].factReferences[${referenceIndex}]: 不正な監査参照のため除外しました。`);
      });
      parsedEntries.push({
        sourceType: result.data.sourceType,
        source: result.data.source,
        confirmedFacts: result.data.confirmedFacts,
        ...(references.length > 0 ? { factReferences: references } : {}),
      });
      return;
    }
    const legacy = legacyEntrySchema.safeParse(item);
    if (legacy.success) {
      if (
        legacy.data.sourceType === "not-used" ||
        !legacy.data.usableInArticle ||
        legacy.data.confidence === "low"
      ) {
        warnings.push(`${SOURCE_LEDGER_PROP}[${index}]: 未使用または低確度の旧項目を除外しました。`);
        return;
      }
      parsedEntries.push({
        sourceType: legacy.data.sourceType,
        source: legacy.data.source,
        confirmedFacts: [legacy.data.claim],
      });
      return;
    }
    const reason = result.error.issues.map((issue) => issue.message).join(", ");
    warnings.push(
      `${SOURCE_LEDGER_PROP}[${index}]: 不正な項目のため除外しました (${reason})。`
    );
  });
  const grouped = new Map<string, SourceLedgerEntry>();
  for (const entry of parsedEntries) {
    const key = `${entry.sourceType}\u0000${entry.source}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, confirmedFacts: [...entry.confirmedFacts] });
      continue;
    }
    for (const fact of entry.confirmedFacts) {
      if (!existing.confirmedFacts.includes(fact)) existing.confirmedFacts.push(fact);
    }
    for (const reference of entry.factReferences ?? []) {
      const references = existing.factReferences ?? (existing.factReferences = []);
      const key = `${reference.factId}\u0000${reference.container}\u0000${reference.containerIndex}\u0000${reference.excerpt}`;
      if (!references.some((current) => `${current.factId}\u0000${current.container}\u0000${current.containerIndex}\u0000${current.excerpt}` === key)) {
        references.push(reference);
      }
    }
  }
  return { entries: [...grouped.values()], warnings };
}

function renderEntry(entry: SourceLedgerEntry): string {
  const parent = [entry.sourceType, entry.source, entry.confirmedFacts.join("／")].join(" | ");
  const auditRows = (entry.factReferences ?? []).map((reference) => {
    const recheck = reference.recheckBeforePublish
      ? ` [公開前再確認:${reference.recheckReason ?? "要確認"}]`
      : "";
    const path = reference.sectionPath ? `${reference.sectionPath} > ` : "";
    return `  ↳ ${reference.factId}${recheck} ${path}${reference.container}#${reference.containerIndex} 「${reference.excerpt}」`;
  });
  return [parent, ...auditRows].join("\n");
}

/**
 * Notion プロパティ格納用のプレーンテキストへ整形する(1行1エントリ)。
 * JSON 生文字列ではなく人間が Notion 上で読める形式にする。
 */
export function renderSourceLedgerText(entries: readonly SourceLedgerEntry[]): string {
  return entries.map(renderEntry).join("\n");
}

/**
 * 台帳を Notion の rich_text プロパティへ書き込む形に組み立てる。
 * chunkRichText が 2000 文字分割を担う。空配列は [] でプロパティを空欄化する。
 */
export function buildSourceLedgerProps(
  entries: readonly SourceLedgerEntry[]
): Record<string, unknown> {
  return {
    [SOURCE_LEDGER_PROP]: { rich_text: chunkRichText(renderSourceLedgerText(entries)) },
  };
}

export interface LedgerUpdateResult {
  /** 台帳プロパティを保存できたか。false のとき warning に理由が入る。 */
  ledgerSaved: boolean;
  /** 台帳保存だけ失敗したときの警告(本体更新は成功)。 */
  warning?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 台帳込みで Notion プロパティを更新し、台帳プロパティ起因の失敗には欠落耐性を持たせる(D3)。
 * - 台帳プロパティが空なら台帳なしで1回だけ更新する。
 * - 台帳込みの更新が失敗したら、台帳を外して本体プロパティだけで再更新する。
 *   再更新が成功すれば本体は保存済みとみなし警告を返す(「根拠台帳」プロパティ未追加を想定)。
 * - 再更新も失敗したら本体更新自体が壊れているため元エラーを投げる(沈黙させない)。
 *
 * update は API 呼び出しを1回だけ増やす代わりに実 I/O(updatePageProps)を注入する。
 */
export async function updatePagePropsWithLedgerFallback(params: {
  baseProps: Record<string, unknown>;
  ledgerProps: Record<string, unknown>;
  update: (props: Record<string, unknown>) => Promise<unknown>;
}): Promise<LedgerUpdateResult> {
  const { baseProps, ledgerProps, update } = params;
  if (Object.keys(ledgerProps).length === 0) {
    await update({ ...baseProps });
    return { ledgerSaved: false };
  }

  try {
    await update({ ...baseProps, ...ledgerProps });
    return { ledgerSaved: true };
  } catch (error: unknown) {
    const original = errorMessage(error);
    await update({ ...baseProps });
    return {
      ledgerSaved: false,
      warning: `${SOURCE_LEDGER_PROP}プロパティの保存に失敗しました(「${SOURCE_LEDGER_PROP}」プロパティ未追加の可能性)。本体更新は成功: ${original}`,
    };
  }
}
