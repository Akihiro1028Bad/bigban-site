/**
 * 本文インラインコメント(#182)の純ロジック。
 *
 * GitHub の PR レビューのように、下書き本文を「1文＝1行」に分割して行番号ガター付きで表示し、
 * 各文(行)にコメントを付けて AI へ指摘依頼する。安全の要は **アンカーを引用(excerpt)で固定**
 * すること: 本文が変わって一致しなければ「要確認」で誤適用を防ぐ(#147/#165 と同じ機構)。
 *
 * 本ファイルは TipTap/DOM に依存しない純ロジック。UI 結線は InlineCommentReview.tsx、
 * PC ループ(comment-revise)は Phase 2。
 */

import { z } from "zod";

import { splitTopLevelBlocks } from "./decorate";
import { BODY_MIRROR_PROP, chunkRichText, type NotionPage } from "./notion";

// ── 文分割 / レビュー行 ──────────────────────────────────────────────

/** タグを除いた本文テキスト(空白畳み込み)。 */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** 1文コメントの対象にしないブロック(画像/表/埋め込み/CTA/スケジュール等)。塊単位で扱う。 */
const NON_TEXT_TAGS = new Set(["figure", "table", "img", "div", "a", "ul", "ol", "hr"]);

function isNonTextTag(tag: string): boolean {
  return NON_TEXT_TAGS.has(tag);
}

/** 日本語テキストを文へ分割する(。！？で区切り、区切り文字は文に含める)。空文は捨てる。 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of text) {
    current += ch;
    if (ch === "。" || ch === "！" || ch === "？") {
      // 区切り文字が必ず含まれるため trim 後も非空。
      out.push(current.trim());
      current = "";
    }
  }
  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

/** レビュー表示の1行(=1文 or 非テキストブロック1つ)。 */
export interface ReviewLine {
  /** トップレベルブロックの出現順 index(アンカーの補助)。 */
  blockIndex: number;
  /** 開始タグ名(小文字)。見出しの強調表示等に使う。 */
  tag: string;
  /** 表示テキスト。非テキストブロックはラベル(例「[画像]」)。 */
  text: string;
  /** コメントのアンカー(=その文のテキスト)。非テキストは null。 */
  excerpt: string | null;
  /** コメント可能か(テキスト文だけ true)。 */
  commentable: boolean;
}

function nonTextLabel(tag: string): string {
  if (tag === "figure" || tag === "img") return "［画像］";
  if (tag === "table") return "［表］";
  if (tag === "ul" || tag === "ol") return "［リスト］";
  return `［${tag}］`;
}

/**
 * 本文 HTML をレビュー行(1文＝1行)に分割する。
 * - テキストブロック(p/h2/h3/h4/blockquote/aside 等)は文へ分割し、各文を行にする。
 * - 非テキストブロック(画像/表/リスト等)は塊で1行(コメント不可)。
 */
export function extractReviewLines(bodyHtml: string): ReviewLine[] {
  const lines: ReviewLine[] = [];
  splitTopLevelBlocks(bodyHtml).forEach((block, blockIndex) => {
    if (isNonTextTag(block.tag)) {
      lines.push({
        blockIndex,
        tag: block.tag,
        text: nonTextLabel(block.tag),
        excerpt: null,
        commentable: false,
      });
      return;
    }
    const sentences = splitSentences(plainText(block.html));
    for (const sentence of sentences) {
      lines.push({ blockIndex, tag: block.tag, text: sentence, excerpt: sentence, commentable: true });
    }
  });
  return lines;
}

/**
 * コメントのアンカーが本文に **一意に** 存在するか(blockIndex のブロックにその文がある)。
 * 一致しなければ「要確認」として弾く(誤った箇所への適用を防ぐ)。
 */
export function anchorExists(bodyHtml: string, blockIndex: number, excerpt: string): boolean {
  const target = excerpt.trim();
  if (!target) return false;
  const hits = extractReviewLines(bodyHtml).filter(
    (l) => l.commentable && l.blockIndex === blockIndex && l.excerpt === target
  );
  return hits.length === 1;
}

// ── コメントのスキーマ / 直列化 ──────────────────────────────────────

export const BodyCommentSchema = z.object({
  blockIndex: z.number().int().min(0).max(10_000),
  excerpt: z.string().min(1).max(2_000),
  comment: z.string().min(1).max(2_000),
});
export type BodyComment = z.infer<typeof BodyCommentSchema>;

/** 一度に送れるコメント上限(巨大ペイロード防止)。 */
export const MAX_BODY_COMMENTS = 50;

export const BodyCommentsSchema = z.array(BodyCommentSchema).min(1).max(MAX_BODY_COMMENTS);

/** JSON 文字列をコメント配列へ。壊れた JSON / スキーマ不一致は空配列(安全側)。 */
export function parseBodyComments(raw: string): BodyComment[] {
  try {
    const parsed = BodyCommentsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** コメント配列を検証して JSON 文字列化(不正は throw)。 */
export function serializeBodyComments(comments: readonly BodyComment[]): string {
  return JSON.stringify(BodyCommentsSchema.parse(comments));
}

/**
 * クライアントから受けたコメントを、本文に一意アンカーできるものだけに絞る(サーバ側の再検証)。
 * 1件もアンカーできなければ空配列。
 */
export function selectAnchoredComments(
  comments: readonly BodyComment[],
  bodyHtml: string
): BodyComment[] {
  return comments.filter((c) => anchorExists(bodyHtml, c.blockIndex, c.excerpt));
}

// ── PC が返す before/after 案(信頼できない JSON を zod 検証) / 決定的反映 ──────────

export const BodyCommentProposalItemSchema = z.object({
  /** 対応するコメントの index(送ったコメント配列内)。 */
  commentIndex: z.number().int().min(0).max(MAX_BODY_COMMENTS),
  /** 反映前の該当ブロック HTML(照合用)。 */
  before: z.string().min(1).max(5000),
  /** AI 書き換え後のブロック HTML(保存時に STRICT 再サニタイズされる)。 */
  after: z.string().min(1).max(8000),
});
export type BodyCommentProposalItem = z.infer<typeof BodyCommentProposalItemSchema>;

export const BodyCommentProposalSchema = z.array(BodyCommentProposalItemSchema).max(MAX_BODY_COMMENTS);

/** 信頼できない反映案 JSON を検証して配列にする。壊れていれば空配列(安全側)。 */
export function parseBodyCommentProposal(raw: string): BodyCommentProposalItem[] {
  try {
    const result = BodyCommentProposalSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** 反映案を検証して JSON 文字列にする(PC 書き込み用)。不正なら throw(沈黙させない)。 */
export function serializeBodyCommentProposal(items: unknown): string {
  return JSON.stringify(BodyCommentProposalSchema.parse(items));
}

export interface ApplyOneResult {
  html: string;
  applied: boolean;
  /** 反映できなかった理由(要確認表示用)。成功時は空文字。 */
  reason: string;
}

/**
 * 1 件の反映: `before`(正規化)に一致するトップレベルブロックを `after` で置換する。
 * 一致が 0 件 / 複数のときは弾く(本文が変わった or 特定不能 = 要確認)。誤適用防止。
 */
export function applyBodyCommentItem(bodyHtml: string, item: BodyCommentProposalItem): ApplyOneResult {
  const beforeNorm = plainText(item.before);
  const blocks = splitTopLevelBlocks(bodyHtml);
  const matches = blocks.filter((b) => plainText(b.html) === beforeNorm);
  if (matches.length === 0) {
    return { html: bodyHtml, applied: false, reason: "対象の段落が見つかりません(本文が変わった可能性)。要確認。" };
  }
  if (matches.length > 1) {
    return { html: bodyHtml, applied: false, reason: "同じ段落が複数あり特定できません。要確認。" };
  }
  const block = matches[0];
  return { html: bodyHtml.slice(0, block.start) + item.after + bodyHtml.slice(block.end), applied: true, reason: "" };
}

export interface ApplyManyResult {
  html: string;
  applied: number[];
  skipped: Array<{ commentIndex: number; reason: string }>;
}

/** 複数案を順に反映する。各 item は毎回その時点の本文で `before` 照合する。 */
export function applyBodyCommentProposal(
  bodyHtml: string,
  items: readonly BodyCommentProposalItem[]
): ApplyManyResult {
  let current = bodyHtml;
  const applied: number[] = [];
  const skipped: Array<{ commentIndex: number; reason: string }> = [];
  for (const item of items) {
    const result = applyBodyCommentItem(current, item);
    if (result.applied) {
      current = result.html;
      applied.push(item.commentIndex);
    } else {
      skipped.push({ commentIndex: item.commentIndex, reason: result.reason });
    }
  }
  return { html: current, applied, skipped };
}

// ── Notion 連携(依頼・状態遷移・読み取り) ──────────────────────────────

/** Notion「記事ネタ案」に追加する本文コメントループ用プロパティ名(手動 or API 追加)。 */
export const BODY_COMMENT_PROPS = {
  /** 投稿されたコメント(JSON 配列)。PC が読む対象。 */
  request: "本文コメント指示",
  /** コメント反映ステータス(select)。 */
  status: "本文コメントステータス",
  /** PC が返した before/after 案(JSON) or 失敗理由。 */
  result: "本文コメント案",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "本文コメント依頼時刻",
} as const;

export type BodyCommentStatus = "なし" | "依頼中" | "処理中" | "提示中" | "失敗";

export const BODY_COMMENT_STATUSES: readonly BodyCommentStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "提示中",
  "失敗",
];

/** この状態の行は再依頼を拒否する(処理途中/提示済み)。 */
export const BODY_COMMENT_BUSY_STATUSES: readonly BodyCommentStatus[] = ["依頼中", "処理中", "提示中"];

/** コメントを依頼として書き込む(1 PATCH)。 */
export function buildBodyCommentRequestProps(
  comments: readonly BodyComment[],
  nowIso: string
): Record<string, unknown> {
  const requested: BodyCommentStatus = "依頼中";
  return {
    [BODY_COMMENT_PROPS.request]: { rich_text: chunkRichText(serializeBodyComments(comments)) },
    [BODY_COMMENT_PROPS.result]: { rich_text: [] },
    [BODY_COMMENT_PROPS.status]: { select: { name: requested } },
    [BODY_COMMENT_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildBodyCommentProcessingProps(): Record<string, unknown> {
  const processing: BodyCommentStatus = "処理中";
  return { [BODY_COMMENT_PROPS.status]: { select: { name: processing } } };
}

/** 完了: before/after 案を書き込み、提示中にする(1 PATCH)。 */
export function buildBodyCommentPresentProps(proposalJson: string): Record<string, unknown> {
  const presented: BodyCommentStatus = "提示中";
  return {
    [BODY_COMMENT_PROPS.result]: { rich_text: chunkRichText(proposalJson) },
    [BODY_COMMENT_PROPS.status]: { select: { name: presented } },
  };
}

/** 失敗: 失敗にして理由を結果へ入れる(沈黙させない・1 PATCH)。 */
export function buildBodyCommentFailProps(reason: string): Record<string, unknown> {
  const failed: BodyCommentStatus = "失敗";
  return {
    [BODY_COMMENT_PROPS.status]: { select: { name: failed } },
    [BODY_COMMENT_PROPS.result]: { rich_text: chunkRichText(reason) },
  };
}

/** 「閉じる/反映後」: 指示・結果・ステータスをクリアして「なし」に戻す(本文は触らない)。 */
export function buildBodyCommentClearProps(): Record<string, unknown> {
  const cleared: BodyCommentStatus = "なし";
  return {
    [BODY_COMMENT_PROPS.status]: { select: { name: cleared } },
    [BODY_COMMENT_PROPS.request]: { rich_text: [] },
    [BODY_COMMENT_PROPS.result]: { rich_text: [] },
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

/** ページの本文コメントステータス(select)を読む。未設定/想定外は「なし」。 */
export function bodyCommentStatusOf(page: NotionPage): BodyCommentStatus {
  const name = readSelectName(page, BODY_COMMENT_PROPS.status);
  return (BODY_COMMENT_STATUSES as readonly string[]).includes(name)
    ? (name as BodyCommentStatus)
    : "なし";
}

/** 承認画面の表示用ビュー: ステータス＋投稿済みコメント(提示中などで表示)。read-only・壊れても落とさない。 */
export interface BodyCommentView {
  status: BodyCommentStatus;
  /** 投稿済みコメント(JSON が妥当なときのみ非空)。 */
  comments: BodyComment[];
  /** 提示中で JSON が妥当なときのみ非空の before/after 案。 */
  proposal: BodyCommentProposalItem[];
  /** 結果欄の生テキスト(失敗理由など・表示用)。 */
  raw: string;
}

export function bodyCommentViewOf(page: NotionPage): BodyCommentView {
  const status = bodyCommentStatusOf(page);
  const raw = readRichTextPlain(page, BODY_COMMENT_PROPS.result);
  return {
    status,
    comments: parseBodyComments(readRichTextPlain(page, BODY_COMMENT_PROPS.request)),
    proposal: status === "提示中" ? parseBodyCommentProposal(raw) : [],
    raw,
  };
}

// ── PC ループ(comment-revise)用の行読み取り / stale 回収 ─────────────────

function readDateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

/** PC ループが処理する1行(依頼中/処理中)。request=投稿コメントJSON、bodyHtml=下書きミラー本文。 */
export interface BodyCommentRow {
  id: string;
  status: BodyCommentStatus;
  requestedAtMs: number | null;
  request: string;
  bodyHtml: string;
}

export function bodyCommentRowFromPage(page: NotionPage): BodyCommentRow {
  return {
    id: page.id,
    status: bodyCommentStatusOf(page),
    requestedAtMs: readDateStartMs(page, BODY_COMMENT_PROPS.requestedAt),
    request: readRichTextPlain(page, BODY_COMMENT_PROPS.request),
    bodyHtml: readRichTextPlain(page, BODY_MIRROR_PROP),
  };
}

/** 処理中のまま放置された(timeout 超過)行 id。PC 再起動等の stale-lock を回収するため。 */
export const BODY_COMMENT_TIMEOUT_MS = 15 * 60 * 1000;

export function selectStaleBodyCommentIds(
  rows: readonly BodyCommentRow[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return rows
    .filter((r) => r.requestedAtMs !== null && nowMs - r.requestedAtMs > timeoutMs)
    .map((r) => r.id);
}
