/**
 * 記事装飾アシスタント(Epic #147)の純ロジック。
 *
 * #146 advise / #40 revise と同方式の **pull 型**: 承認画面が Notion に「装飾の提案依頼」を書き、
 * 自宅 PC の claude が本文をトップレベル要素ごとに見て【箇所ごとの装飾提案リスト】(足す/直す/消す)を
 * 返す。人が各提案を採用/却下し、**採用分だけ**を決定的な `applyDecoration` で本文へ反映する。
 *
 * 安全の要: **AI には生 HTML を出させない**。AI は「対象ブロック(blockIndex＋抜粋)／op／decoration／理由」
 * だけを出し、実際の HTML は許可リスト内の固定変換(`applyDecoration`)が生成する。最終的な保存は既存の
 * /api/growth/draft/edit(CONTENT キー・サーバ側 STRICT 再サニタイズ)が担う。I/O を持たない純ロジック。
 */

import { z } from "zod";

import { BODY_MIRROR_PROP, chunkRichText, type NotionPage } from "./notion";

/** Notion「記事ネタ案」に追加する装飾ループ用プロパティ名(手動追加)。 */
export const DECORATE_PROPS = {
  /** ユーザーの依頼時の補足指示(自由文・任意。空ならおまかせ)。 */
  instruction: "装飾指示",
  /** 装飾ステータス(select)。 */
  status: "装飾ステータス",
  /** PC が返した装飾提案(JSON 配列) or 失敗理由。 */
  result: "装飾提案",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "装飾依頼時刻",
} as const;

/** 記事ネタ案のタイトル / 下書き ID プロパティ名。 */
const IDEA_TITLE_PROP = "タイトル案";
const DRAFT_ID_PROP = "下書きID";

export type DecorateStatus = "なし" | "依頼中" | "処理中" | "提示中" | "失敗";

export const DECORATE_STATUSES: readonly DecorateStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "提示中",
  "失敗",
];

/** この状態の行は再依頼を拒否する(処理途中/提示済み)。 */
export const DECORATE_BUSY_STATUSES: readonly DecorateStatus[] = ["依頼中", "処理中", "提示中"];

// ── 装飾カタログ(sanitize 許可リスト内に限定・初手はコールアウト中心) ──────────────
/**
 * ブロックに付けられる装飾(決定的変換の対象)。すべて sanitize 許可リスト内:
 * note/caution/highlight は `<aside class="...">`、blockquote は `<blockquote>`。
 * list/table/cta は構造変換・遷移先が必要なため初手では対象外(随伴バックログ)。
 */
export const DECORATIONS = ["note", "caution", "highlight", "blockquote"] as const;
export type Decoration = (typeof DECORATIONS)[number];

/** 装飾操作。add=プレーン段落を装飾で包む / change=別装飾へ / remove=装飾を外して段落へ。 */
export const DECORATE_OPS = ["add", "change", "remove"] as const;
export type DecorateOp = (typeof DECORATE_OPS)[number];

export const DecorationProposalSchema = z.object({
  id: z.string().min(1),
  /** トップレベル要素のインデックス(0始まり)。 */
  blockIndex: z.number().int().min(0),
  /** その要素の現在テキスト抜粋(照合ガード用)。 */
  excerpt: z.string().min(1),
  op: z.enum(DECORATE_OPS),
  decoration: z.enum(DECORATIONS),
  reason: z.string().min(1),
});

export const DecorationProposalsSchema = z.array(DecorationProposalSchema);
export type DecorationProposal = z.infer<typeof DecorationProposalSchema>;

/**
 * 信頼できない提案 JSON を検証して配列にする(Web 表示用)。
 * **throw せず**、壊れた JSON / スキーマ不一致は空配列を返す(安全側)。
 */
export function parseProposals(raw: string): DecorationProposal[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = DecorationProposalsSchema.safeParse(data);
  return result.success ? result.data : [];
}

/** 提案配列を検証して JSON 文字列にする(書き込み用)。不正なら throw(沈黙させない=PC側)。 */
export function serializeProposals(proposals: unknown): string {
  return JSON.stringify(DecorationProposalsSchema.parse(proposals));
}

// ── トップレベル要素の分割(DOM 非依存) ──────────────────────────────
const VOID_TAGS = new Set([
  "br",
  "hr",
  "img",
  "col",
  "wbr",
  "area",
  "base",
  "embed",
  "input",
  "source",
  "track",
  "meta",
  "link",
]);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

export interface TopLevelBlock {
  /** ブロック全体の HTML。 */
  html: string;
  /** 開始タグ名(小文字)。 */
  tag: string;
  /** 元 HTML 内の開始/終了オフセット(差し替え用)。 */
  start: number;
  end: number;
}

/**
 * 本文 HTML をトップレベル要素の配列に分割する(タグの深さを追跡)。
 * 要素間のテキスト/空白はブロックに含めない(blockIndex は要素の出現順)。
 * 不均衡な HTML(閉じきらない)は末尾ブロックを落とす(誤適用を避ける・安全側)。
 */
export function splitTopLevelBlocks(html: string): TopLevelBlock[] {
  const blocks: TopLevelBlock[] = [];
  let depth = 0;
  let blockStart = -1;
  let topTag = "";
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const selfClosing = m[3] === "/" || VOID_TAGS.has(tag);
    if (isClose) {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && blockStart >= 0) {
          const end = TAG_RE.lastIndex;
          blocks.push({ html: html.slice(blockStart, end), tag: topTag, start: blockStart, end });
          blockStart = -1;
        }
      }
      continue;
    }
    if (selfClosing) {
      // void/自己終了は深さを変えない。トップレベルなら 1 要素として記録。
      if (depth === 0) {
        blocks.push({ html: m[0], tag, start: m.index, end: TAG_RE.lastIndex });
      }
      continue;
    }
    if (depth === 0) {
      blockStart = m.index;
      topTag = tag;
    }
    depth += 1;
  }
  return blocks;
}

// ── ブロックの装飾判定と固定変換 ──────────────────────────────────
const CLASS_RE = /\bclass\s*=\s*"([^"]*)"/i;

/** ブロックの種別(タグ・現在の装飾・内側HTML)。装飾でないものは decoration=null。 */
export interface BlockKind {
  tag: string;
  decoration: Decoration | null;
  inner: string;
}

function extractInner(blockHtml: string, tag: string): string {
  const re = new RegExp(`^<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>$`, "i");
  const m = blockHtml.trim().match(re);
  return m ? m[1] : "";
}

/** ブロック HTML を種別へ分解する(p / aside.note等 / blockquote を認識)。 */
export function blockKindOf(block: TopLevelBlock): BlockKind {
  const tag = block.tag;
  if (tag === "blockquote") {
    return { tag, decoration: "blockquote", inner: extractInner(block.html, tag) };
  }
  if (tag === "aside") {
    const classes = (block.html.match(CLASS_RE)?.[1] ?? "").split(/\s+/);
    const decoration = (["note", "caution", "highlight"] as const).find((d) => classes.includes(d)) ?? null;
    return { tag, decoration, inner: extractInner(block.html, tag) };
  }
  return { tag, decoration: null, inner: tag === "p" ? extractInner(block.html, "p") : block.html };
}

/** 装飾 HTML を生成する(許可リスト内の固定変換)。 */
function makeDecorated(decoration: Decoration, inner: string): string {
  if (decoration === "blockquote") return `<blockquote>${inner}</blockquote>`;
  return `<aside class="${decoration}">${inner}</aside>`;
}

function makePlain(inner: string): string {
  return `<p>${inner}</p>`;
}

/** タグ・空白を畳んだ正規化テキスト(抜粋照合用)。 */
function normalizeText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DecorateResult {
  html: string;
  applied: boolean;
  /** 適用できなかった理由(要確認表示用)。 */
  reason?: string;
}

/** ブロック1件の固定変換結果: 新ブロックHTML、もしくは適用不可の理由。 */
type Transform = { newBlock: string } | { reason: string };

/** op とブロック状態から新ブロックHTMLを決める(許可リスト内の固定変換のみ)。 */
function transformBlock(block: TopLevelBlock, proposal: DecorationProposal): Transform {
  const kind = blockKindOf(block);
  if (proposal.op === "add") {
    if (kind.tag !== "p" || kind.decoration !== null) {
      return { reason: "装飾を足せるのはプレーンな段落だけです。" };
    }
    return { newBlock: makeDecorated(proposal.decoration, kind.inner) };
  }
  if (proposal.op === "change") {
    if (kind.decoration === null || kind.decoration === proposal.decoration) {
      return { reason: "別の装飾への変更先がありません。" };
    }
    return { newBlock: makeDecorated(proposal.decoration, kind.inner) };
  }
  if (kind.decoration === null) {
    return { reason: "外せる装飾がありません。" };
  }
  return { newBlock: makePlain(kind.inner) };
}

/** blockIndex 位置のトップレベル要素を返す(範囲外は null)。 */
function blockAt(html: string, index: number): TopLevelBlock | null {
  return splitTopLevelBlocks(html)[index] ?? null;
}

/** excerpt(正規化)が対象ブロックのテキストに含まれるか(照合ガード)。 */
function excerptMatches(block: TopLevelBlock, excerpt: string): boolean {
  return normalizeText(block.html).includes(normalizeText(excerpt));
}

/**
 * 提案を本文へ決定的に適用する。blockIndex で位置特定 → excerpt で照合 → op を適用。
 * 照合不一致・op とブロック状態の不整合は **applied:false**(本文無変更)で安全に倒す(誤適用防止)。
 * 生成する HTML は許可リスト内の固定変換のみ(AI の生 HTML は使わない)。
 */
export function applyDecoration(html: string, proposal: DecorationProposal): DecorateResult {
  const block = blockAt(html, proposal.blockIndex);
  if (!block) return { html, applied: false, reason: "対象ブロックが見つかりません(範囲外)。" };
  if (!excerptMatches(block, proposal.excerpt)) {
    return { html, applied: false, reason: "抜粋が一致しません(本文が変わった可能性)。" };
  }
  const transform = transformBlock(block, proposal);
  if ("reason" in transform) return { html, applied: false, reason: transform.reason };
  return {
    html: html.slice(0, block.start) + transform.newBlock + html.slice(block.end),
    applied: true,
  };
}

/** 採用提案を順に適用する(各ステップで excerpt 再照合)。適用できた件数も返す。 */
export function applyDecorations(
  html: string,
  proposals: readonly DecorationProposal[]
): { html: string; appliedCount: number } {
  let current = html;
  let appliedCount = 0;
  for (const proposal of proposals) {
    const result = applyDecoration(current, proposal);
    if (result.applied) {
      current = result.html;
      appliedCount += 1;
    }
  }
  return { html: current, appliedCount };
}

export interface DecoratePreview {
  applied: boolean;
  /** 変更前のブロック HTML(無ければ "")。 */
  before: string;
  /** 変更後のブロック HTML(適用不可なら "")。 */
  after: string;
  reason?: string;
}

/** 提案1件の before/after ブロックを返す(UI のプレビュー用・本文は変えない)。 */
export function previewDecoration(html: string, proposal: DecorationProposal): DecoratePreview {
  const block = blockAt(html, proposal.blockIndex);
  if (!block) return { applied: false, before: "", after: "", reason: "対象ブロックが見つかりません。" };
  if (!excerptMatches(block, proposal.excerpt)) {
    return { applied: false, before: block.html, after: "", reason: "抜粋が一致しません(本文が変わった可能性)。" };
  }
  const transform = transformBlock(block, proposal);
  if ("reason" in transform) return { applied: false, before: block.html, after: "", reason: transform.reason };
  return { applied: true, before: block.html, after: transform.newBlock };
}

// ── 依頼・状態遷移プロパティ ──────────────────────────────────────────
/** 装飾提案の依頼を Notion に書き込むプロパティ群(1 PATCH 用)。指示は任意。 */
export function buildDecorateRequestProps(
  instruction: string,
  nowIso: string
): Record<string, unknown> {
  const requested: DecorateStatus = "依頼中";
  return {
    [DECORATE_PROPS.instruction]: { rich_text: instruction ? chunkRichText(instruction) : [] },
    [DECORATE_PROPS.result]: { rich_text: [] },
    [DECORATE_PROPS.status]: { select: { name: requested } },
    [DECORATE_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildDecorateProcessingProps(): Record<string, unknown> {
  const processing: DecorateStatus = "処理中";
  return { [DECORATE_PROPS.status]: { select: { name: processing } } };
}

/** 完了: 提案 JSON を書き込み、提示中にする(1 PATCH)。 */
export function buildDecoratePresentProps(proposalsJson: string): Record<string, unknown> {
  const presented: DecorateStatus = "提示中";
  return {
    [DECORATE_PROPS.result]: { rich_text: chunkRichText(proposalsJson) },
    [DECORATE_PROPS.status]: { select: { name: presented } },
  };
}

/** 失敗: 失敗にして理由を結果へ入れる(沈黙させない・1 PATCH)。 */
export function buildDecorateFailProps(reason: string): Record<string, unknown> {
  const failed: DecorateStatus = "失敗";
  return {
    [DECORATE_PROPS.status]: { select: { name: failed } },
    [DECORATE_PROPS.result]: { rich_text: chunkRichText(reason) },
  };
}

/** 「閉じる」: 指示・結果・ステータスをクリアして「なし」に戻す(本文は触らない)。 */
export function buildDecorateClearProps(): Record<string, unknown> {
  const cleared: DecorateStatus = "なし";
  return {
    [DECORATE_PROPS.status]: { select: { name: cleared } },
    [DECORATE_PROPS.instruction]: { rich_text: [] },
    [DECORATE_PROPS.result]: { rich_text: [] },
  };
}

// ── Notion ページ読み取り ──────────────────────────────────────────
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

function readTitlePlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("");
}

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

/** ページの `装飾ステータス`(select)を読む。未設定/想定外は「なし」。 */
export function decorateStatusOf(page: NotionPage): DecorateStatus {
  const name = readSelectName(page, DECORATE_PROPS.status);
  return (DECORATE_STATUSES as readonly string[]).includes(name) ? (name as DecorateStatus) : "なし";
}

/** 承認画面の表示用ビュー: ステータス＋(提示中なら)提案配列＋(失敗なら)生の理由。 */
export interface DecorateView {
  status: DecorateStatus;
  proposals: DecorationProposal[];
  raw: string;
}

/** ページから装飾の表示用ビューを取り出す(read-only・壊れていても落とさない)。 */
export function decorateViewOf(page: NotionPage): DecorateView {
  const status = decorateStatusOf(page);
  const raw = readRichTextPlain(page, DECORATE_PROPS.result);
  return { status, proposals: status === "提示中" ? parseProposals(raw) : [], raw };
}

export interface DecorateRow {
  id: string;
  title: string;
  instruction: string;
  status: DecorateStatus;
  requestedAtMs: number | null;
  contentId: string;
  bodyHtml: string;
}

/** Notion ページから PC poller 用の行情報を取り出す。 */
export function decorateRowFromPage(page: NotionPage): DecorateRow {
  return {
    id: page.id,
    title: readTitlePlain(page, IDEA_TITLE_PROP),
    instruction: readRichTextPlain(page, DECORATE_PROPS.instruction),
    status: decorateStatusOf(page),
    requestedAtMs: readDateStartMs(page, DECORATE_PROPS.requestedAt),
    contentId: readRichTextPlain(page, DRAFT_ID_PROP),
    bodyHtml: readRichTextPlain(page, BODY_MIRROR_PROP),
  };
}

/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const DECORATE_TIMEOUT_MS = 15 * 60 * 1000;

/** 処理中のまま timeoutMs を超えた行の id を返す(reaper 対象)。依頼時刻が無い行は対象外。 */
export function selectStaleDecorateIds(
  rows: readonly DecorateRow[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return rows
    .filter(
      (r) =>
        r.status === "処理中" &&
        r.requestedAtMs !== null &&
        nowMs - r.requestedAtMs > timeoutMs
    )
    .map((r) => r.id);
}

/** 装飾提案の LINE 本文(承認画面URLへ誘導)。 */
export function buildDecoratePresentMessage(title: string, approveUrl: string): string {
  return [
    "記事装飾の提案ができました。",
    `タイトル: ${title}`,
    "承認画面で、提案を採用/却下して反映してください。",
    approveUrl,
  ].join("\n");
}

/** 装飾提案失敗の LINE 本文(沈黙させない・#24整合)。 */
export function buildDecorateFailMessage(title: string, reason: string): string {
  return [
    "記事装飾の提案に失敗しました(外部障害の可能性があります)。",
    `タイトル: ${title}`,
    `理由: ${reason}`,
    "承認画面から、もう一度提案を依頼できます。",
  ].join("\n");
}
