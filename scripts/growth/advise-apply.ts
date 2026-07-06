/**
 * スタイリング・アドバイスの「採用 → 本文反映」(#165)の純ロジック。
 *
 * #146 のアドバイス(read-only)で出た fix のうち、**採用したものだけ**を本文へ反映する。
 * 方式は #147(装飾)と同じ **pull 型**＋「採用 → before/after 差分確認 → 反映」(完全自動にしない):
 *  1. 承認画面が「採用した fix」を Notion に記録(本ファイルの request props)。
 *  2. 常時稼働 PC の advise-apply ループ(run.mjs apply・カバレッジ除外)が claude で
 *     **該当 passage だけ**を書き換え→ before/after 案を提示(present props)。
 *  3. 人が差分を確認し、`applyAdviceItems` で決定的に反映 → 既存 /api/growth/draft/edit
 *     (CONTENT キー・STRICT 再サニタイズ)で保存。
 *
 * 安全の要(決定済み・#165 コメント):
 *  - 反映できるのは **文体・読みやすさ・構成の組み替え**のみ。事実・数値・正確性・タイトル・
 *    リンクに関わる fix は反映対象外(助言表示のまま)。
 *  - **quote 必須**＋トップレベルブロック照合でアンカー特定。一意に当たらなければ「要確認」で弾く。
 *  - 反映時は `before`(反映前ブロック)が現在の本文と一致することを確認(本文が変わっていたら弾く)。
 *
 * I/O を持たないためテスト可能。Notion 書き込み・通知・claude 実行は CLI 側が担う。
 */

import { z } from "zod";

import type { AdviceFix } from "./advise";
import { splitTopLevelBlocks } from "./decorate";
import { BODY_MIRROR_PROP, chunkRichText, type NotionPage } from "./notion";
import { selectStaleJobIds } from "./staleJob";

// ── 反映可能カテゴリの判定(決定: 文体・読みやすさ・構成のみ) ──────────────────
/**
 * 事実・正確性・数値・タイトル・リンク等、決定的に直せない(=人の判断が要る) area は反映対象外(助言のみ)。
 * #178: 以前は「許可語ホワイトリスト」方式で、文体・読みやすさ・構成系でも area ラベルが
 * 許可語に当たらないと取りこぼしていた。**除外語に当たらなければ候補**とする方式に変え、
 * 取りこぼしを減らす(安全性は quote 必須＋一意アンカーで担保)。
 */
const EXCLUDED_AREA_KEYWORDS = [
  "事実",
  "正確",
  "数値",
  "データ",
  "統計",
  "出典",
  "タイトル",
  "リンク",
  "url",
] as const;

/** area(自由文)が本文反映を許可するカテゴリか。除外語(事実/タイトル/リンク等)を含まなければ可。 */
export function isApplicableArea(area: string): boolean {
  const lower = area.toLowerCase();
  return !EXCLUDED_AREA_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

/** 反映できない理由(承認画面で「なぜチェックできないか」を表示する=#178)。 */
export const FIX_REASON_EXCLUDED = "助言のみ（事実・タイトル・リンク等は自動反映の対象外）";
export const FIX_REASON_NO_QUOTE = "引用がないため自動反映できません";
export const FIX_REASON_NO_ANCHOR = "引用が本文に一致せず要確認（本文が変わった可能性）";

/**
 * fix が本文へ自動反映できるか(不可なら理由付き)。3条件: 反映可能カテゴリ・quote 非空・一意アンカー。
 * 反映可能なときは確定した quote と blockIndex を返す(selectApplicableFixes が再計算せず使う=DRY)。
 */
export type FixClassification =
  | { applicable: true; quote: string; blockIndex: number }
  | { applicable: false; reason: string };

export function classifyFix(fix: AdviceFix, bodyHtml: string): FixClassification {
  if (!isApplicableArea(fix.area)) return { applicable: false, reason: FIX_REASON_EXCLUDED };
  const quote = (fix.quote ?? "").trim();
  if (!quote) return { applicable: false, reason: FIX_REASON_NO_QUOTE };
  const blockIndex = findAnchorBlock(bodyHtml, quote);
  if (blockIndex < 0) return { applicable: false, reason: FIX_REASON_NO_ANCHOR };
  return { applicable: true, quote, blockIndex };
}

// ── テキスト正規化 / アンカー照合 ──────────────────────────────────
/** タグ・空白を畳んだ正規化テキスト(照合用)。 */
function normalizeText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * quote(正規化)を含むトップレベルブロックの index を返す。
 * 0 件 / 複数該当は -1(=要確認)。一意に当たったときだけ採用候補にする。
 */
export function findAnchorBlock(bodyHtml: string, quote: string): number {
  const q = normalizeText(quote);
  if (!q) return -1;
  const hits = splitTopLevelBlocks(bodyHtml)
    .map((b, i) => ({ i, text: normalizeText(b.html) }))
    .filter((b) => b.text.includes(q));
  return hits.length === 1 ? hits[0].i : -1;
}

// ── 採用候補(quote 必須＋反映可能カテゴリ＋一意アンカー) ──────────────────
export interface ApplicableFix {
  /** advice.fixes 内のインデックス(採用識別)。 */
  index: number;
  area: string;
  quote: string;
  reason: string;
  suggestion: string;
  /** アンカー先のブロック index。 */
  blockIndex: number;
}

/**
 * 反映可能な fix だけを採用候補にする。条件: quote 非空・反映可能カテゴリ・一意アンカー。
 * 順序は元の fixes 順。
 */
export function selectApplicableFixes(
  fixes: readonly AdviceFix[],
  bodyHtml: string
): ApplicableFix[] {
  const out: ApplicableFix[] = [];
  fixes.forEach((f, index) => {
    // 表示(classifyFix)と挙動を一致させ、確定済みの quote/blockIndex をそのまま使う(再計算しない)。
    const c = classifyFix(f, bodyHtml);
    if (!c.applicable) return;
    out.push({
      index,
      area: f.area,
      quote: c.quote,
      reason: f.reason,
      suggestion: f.suggestion,
      blockIndex: c.blockIndex,
    });
  });
  return out;
}

/** 一度に採用できる fix の上限(濫用・巨大ペイロード防止)。route と UI で共有する単一ソース。 */
export const MAX_ADOPTED = 20;

/**
 * 全選択で採用する fix index を決定的に返す。classifications と同順。
 * applicable な index を出現順に集め、max 件でクランプする(超過は先頭優先で切る)。
 */
export function selectableAdoptIndexes(
  classifications: readonly { applicable: boolean }[],
  max: number
): number[] {
  if (max <= 0) return [];
  const out: number[] = [];
  classifications.forEach((classification, index) => {
    if (classification.applicable) out.push(index);
  });
  return out.slice(0, max);
}

// ── PC が返す before/after 案(信頼できない JSON を zod 検証) ──────────────
export const AdviceApplyItemSchema = z.object({
  /** 採用した fix の index(advice.fixes 内)。 */
  fixIndex: z.number().int().min(0).max(1000),
  /** 反映前の該当ブロック HTML(照合用)。 */
  before: z.string().min(1).max(5000),
  /** AI 書き換え後のブロック HTML(保存時に STRICT 再サニタイズされる)。 */
  after: z.string().min(1).max(8000),
});
export type AdviceApplyItem = z.infer<typeof AdviceApplyItemSchema>;

/** 1 回で扱う反映案の上限。 */
export const MAX_APPLY_ITEMS = 20;
export const AdviceApplyProposalSchema = z.array(AdviceApplyItemSchema).max(MAX_APPLY_ITEMS);

/** 信頼できない反映案 JSON を検証して配列にする。壊れていれば空配列(安全側)。 */
export function parseApplyProposal(raw: string): AdviceApplyItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = AdviceApplyProposalSchema.safeParse(data);
  return result.success ? result.data : [];
}

/** 反映案を検証して JSON 文字列にする(書き込み用)。不正なら throw(沈黙させない=PC側)。 */
export function serializeApplyProposal(items: unknown): string {
  return JSON.stringify(AdviceApplyProposalSchema.parse(items));
}

// ── 決定的な反映(採用した before/after を本文へ) ──────────────────────
export interface ApplyResult {
  html: string;
  applied: boolean;
  /** 反映できなかった理由(要確認表示用)。成功時は空文字。 */
  reason: string;
}

/**
 * 1 件の反映: `before`(正規化)に一致するトップレベルブロックを `after` で置換する。
 * 一致が 0 件 / 複数のときは弾く(本文が変わった or 特定不能 = 要確認)。誤適用防止。
 */
export function applyAdviceItem(bodyHtml: string, item: AdviceApplyItem): ApplyResult {
  const beforeNorm = normalizeText(item.before);
  const blocks = splitTopLevelBlocks(bodyHtml);
  const matches = blocks.filter((b) => normalizeText(b.html) === beforeNorm);
  if (matches.length === 0) {
    return { html: bodyHtml, applied: false, reason: "対象の段落が見つかりません(本文が変わった可能性)。要確認。" };
  }
  if (matches.length > 1) {
    return { html: bodyHtml, applied: false, reason: "同じ段落が複数あり特定できません。要確認。" };
  }
  const block = matches[0];
  const html = bodyHtml.slice(0, block.start) + item.after + bodyHtml.slice(block.end);
  return { html, applied: true, reason: "" };
}

export interface ApplyManyResult {
  html: string;
  /** 反映できた item の fixIndex。 */
  applied: number[];
  /** 反映できなかった item とその理由。 */
  skipped: Array<{ fixIndex: number; reason: string }>;
}

/** 採用した複数案を順に反映する。各 item は毎回その時点の本文で `before` 照合する。 */
export function applyAdviceItems(
  bodyHtml: string,
  items: readonly AdviceApplyItem[]
): ApplyManyResult {
  let current = bodyHtml;
  const applied: number[] = [];
  const skipped: Array<{ fixIndex: number; reason: string }> = [];
  for (const item of items) {
    const result = applyAdviceItem(current, item);
    if (result.applied) {
      current = result.html;
      applied.push(item.fixIndex);
    } else {
      skipped.push({ fixIndex: item.fixIndex, reason: result.reason });
    }
  }
  return { html: current, applied, skipped };
}

// ── Notion 連携(依頼・状態遷移・読み取り) ──────────────────────────────
/** Notion「記事ネタ案」に追加する反映ループ用プロパティ名(手動追加)。 */
export const ADVISE_APPLY_PROPS = {
  /** 採用した fix(JSON 配列)。PC が書き換える対象。 */
  request: "アドバイス反映指示",
  /** 反映ステータス(select)。 */
  status: "アドバイス反映ステータス",
  /** PC が返した before/after 案(JSON) or 失敗理由。 */
  result: "アドバイス反映案",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "アドバイス反映依頼時刻",
} as const;

export type AdviceApplyStatus = "なし" | "依頼中" | "処理中" | "提示中" | "失敗";

export const ADVISE_APPLY_STATUSES: readonly AdviceApplyStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "提示中",
  "失敗",
];

/** この状態の行は再依頼を拒否する(処理途中/提示済み)。 */
export const ADVISE_APPLY_BUSY_STATUSES: readonly AdviceApplyStatus[] = ["依頼中", "処理中", "提示中"];

/** 採用 fix を依頼として書き込む(1 PATCH)。adopted は ApplicableFix の配列。 */
export function buildApplyRequestProps(
  adopted: readonly ApplicableFix[],
  nowIso: string
): Record<string, unknown> {
  const requested: AdviceApplyStatus = "依頼中";
  return {
    [ADVISE_APPLY_PROPS.request]: { rich_text: chunkRichText(JSON.stringify(adopted)) },
    [ADVISE_APPLY_PROPS.result]: { rich_text: [] },
    [ADVISE_APPLY_PROPS.status]: { select: { name: requested } },
    [ADVISE_APPLY_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildApplyProcessingProps(): Record<string, unknown> {
  const processing: AdviceApplyStatus = "処理中";
  return { [ADVISE_APPLY_PROPS.status]: { select: { name: processing } } };
}

/** 完了: before/after 案を書き込み、提示中にする(1 PATCH)。 */
export function buildApplyPresentProps(proposalJson: string): Record<string, unknown> {
  const presented: AdviceApplyStatus = "提示中";
  return {
    [ADVISE_APPLY_PROPS.result]: { rich_text: chunkRichText(proposalJson) },
    [ADVISE_APPLY_PROPS.status]: { select: { name: presented } },
  };
}

/** 失敗: 失敗にして理由を結果へ入れる(沈黙させない・1 PATCH)。 */
export function buildApplyFailProps(reason: string): Record<string, unknown> {
  const failed: AdviceApplyStatus = "失敗";
  return {
    [ADVISE_APPLY_PROPS.status]: { select: { name: failed } },
    [ADVISE_APPLY_PROPS.result]: { rich_text: chunkRichText(reason) },
  };
}

/** 「閉じる/反映後」: 指示・結果・ステータスをクリアして「なし」に戻す(本文は触らない)。 */
export function buildApplyClearProps(): Record<string, unknown> {
  const cleared: AdviceApplyStatus = "なし";
  return {
    [ADVISE_APPLY_PROPS.status]: { select: { name: cleared } },
    [ADVISE_APPLY_PROPS.request]: { rich_text: [] },
    [ADVISE_APPLY_PROPS.result]: { rich_text: [] },
  };
}

function readSelectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function readRichTextPlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

/** ページの反映ステータス(select)を読む。未設定/想定外は「なし」。 */
export function applyStatusOf(page: NotionPage): AdviceApplyStatus {
  const name = readSelectName(page, ADVISE_APPLY_PROPS.status);
  return (ADVISE_APPLY_STATUSES as readonly string[]).includes(name)
    ? (name as AdviceApplyStatus)
    : "なし";
}

/** 承認画面の表示用ビュー: ステータス＋(提示中なら)解析済み before/after 案＋(失敗なら)生テキスト。 */
export interface AdviceApplyView {
  status: AdviceApplyStatus;
  /** 提示中で JSON が妥当なときのみ非空。 */
  proposal: AdviceApplyItem[];
  /** 失敗時の理由など、結果欄の生テキスト(表示用)。 */
  raw: string;
}

/** ページから反映の表示用ビューを取り出す(read-only・壊れていても落とさない)。 */
export function applyViewOf(page: NotionPage): AdviceApplyView {
  const status = applyStatusOf(page);
  const raw = readRichTextPlain(page, ADVISE_APPLY_PROPS.result);
  return { status, proposal: status === "提示中" ? parseApplyProposal(raw) : [], raw };
}

export interface AdviceApplyRow {
  id: string;
  status: AdviceApplyStatus;
  requestedAtMs: number | null;
  /** 採用 fix(JSON 文字列)。PC が書き換える対象。 */
  request: string;
  /** 下書き本文 HTML ミラー(#95)。PC が書き換える対象本文。 */
  bodyHtml: string;
}

/** Notion ページから PC poller 用の行情報を取り出す。 */
export function applyRowFromPage(page: NotionPage): AdviceApplyRow {
  return {
    id: page.id,
    status: applyStatusOf(page),
    requestedAtMs: readDateStartMs(page, ADVISE_APPLY_PROPS.requestedAt),
    request: readRichTextPlain(page, ADVISE_APPLY_PROPS.request),
    bodyHtml: readRichTextPlain(page, BODY_MIRROR_PROP),
  };
}

/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const ADVISE_APPLY_TIMEOUT_MS = 15 * 60 * 1000;

/** 処理中・依頼中で timeoutMs を超えた行の id を返す(reaper 対象)。依頼時刻が無い行・提示中は対象外。 */
export function selectStaleApplyIds(
  rows: readonly AdviceApplyRow[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return selectStaleJobIds(rows, nowMs, timeoutMs);
}
