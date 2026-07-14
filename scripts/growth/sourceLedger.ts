/**
 * 根拠台帳(source_ledger)の永続化ロジック(#根拠台帳)。
 *
 * 記事執筆時のリサーチ規律(drafts.md 手順2-2)で組んだ台帳を投入スペックに同梱し、
 * publish-draft が Notion 記事ネタ行のプロパティへ保存する(読者非公開・監査用)。
 *
 * 設計: docs/superpowers/specs/2026-07-10-source-ledger-reference-design.md(D2/D3)。
 * CLI からは薄く呼ぶだけにし、検証・整形・フォールバックの純ロジックはここに集約する。
 */

import { z } from "zod";

import { chunkRichText } from "./notion";

/** 台帳の出典種別。executor が判断根拠として使う分類。 */
export const SOURCE_TYPES = [
  "facility-context",
  "official-site",
  "search-result",
  "not-used",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** 出典の確からしさ(執筆AIの自己申告)。 */
export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Notion に保存する台帳プロパティ名(rich_text・任意・publish-draft が自動書き込み)。 */
export const SOURCE_LEDGER_PROP = "根拠台帳";

const entrySchema = z.object({
  claim: z.string().min(1),
  sourceType: z.enum(SOURCE_TYPES),
  source: z.string().min(1),
  /** 発行年。統計・数値主張は必須だがスキーマ上は任意(プロンプト規律で担保)。 */
  publishedYear: z.number().int().optional(),
  /** §15の参考資料欄の対象となる統計・数値・健康関連の主張か。旧specでは安全側で未指定。 */
  referenceEligible: z.boolean().optional(),
  confidence: z.enum(CONFIDENCES),
  usableInArticle: z.boolean(),
  reason: z.string().min(1),
});

export type SourceLedgerEntry = z.infer<typeof entrySchema>;

/** §15の参考資料欄に使える、対象区分が明示された使用可能な外部根拠があるか。 */
export function hasReferenceEligibleSource(
  entries: readonly SourceLedgerEntry[]
): boolean {
  return entries.some(
    (entry) =>
      entry.usableInArticle &&
      (entry.sourceType === "official-site" || entry.sourceType === "search-result") &&
      entry.referenceEligible === true
  );
}

export interface ParseSourceLedgerResult {
  /** 検証を通過したエントリ。 */
  entries: SourceLedgerEntry[];
  /** 除外・無視した項目の理由(沈黙させない #24。CLI が報告に出す)。 */
  warnings: string[];
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

  const entries: SourceLedgerEntry[] = [];
  const warnings: string[] = [];
  value.forEach((item, index) => {
    const result = entrySchema.safeParse(item);
    if (result.success) {
      entries.push(result.data);
      return;
    }
    const reason = result.error.issues.map((issue) => issue.message).join(", ");
    warnings.push(
      `${SOURCE_LEDGER_PROP}[${index}]: 不正な項目のため除外しました (${reason})。`
    );
  });
  return { entries, warnings };
}

function renderEntry(entry: SourceLedgerEntry): string {
  const year = entry.publishedYear === undefined ? "-" : String(entry.publishedYear);
  return [
    entry.claim,
    entry.sourceType,
    entry.source,
    year,
    String(entry.referenceEligible ?? false),
    entry.confidence,
    String(entry.usableInArticle),
    entry.reason,
  ].join(" | ");
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
