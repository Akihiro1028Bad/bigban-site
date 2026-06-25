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
import { chunkRichText, type NotionPage } from "./notion";

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
  /** 結果欄の生テキスト(失敗理由など・表示用)。 */
  raw: string;
}

export function bodyCommentViewOf(page: NotionPage): BodyCommentView {
  const status = bodyCommentStatusOf(page);
  return {
    status,
    comments: parseBodyComments(readRichTextPlain(page, BODY_COMMENT_PROPS.request)),
    raw: readRichTextPlain(page, BODY_COMMENT_PROPS.result),
  };
}
