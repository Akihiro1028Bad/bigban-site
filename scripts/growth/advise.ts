/**
 * 記事スタイリング・アドバイザー(Epic #146)の純ロジック。
 *
 * 構成案修正ループ(#40)・画像再生成(#144/#156)と同方式の **pull 型**: 承認画面が Notion に
 * 「アドバイス依頼」を書き、自宅 PC の claude が下書き(本文＋タイトル)を style-guide に照らして
 * 分析し、**○×でなく具体的・実行可能な助言**(強み／直すべき点〔引用＋理由＋修正案〕／観点別スコア)を
 * Notion に書き戻す。承認画面が読んで表示する。**read-only**: 本文や下書きは書き換えない。
 *
 * 決定的な Notion 書き込み・通知・ロック・回収は CLI(`advise-cli.ts`)が行い、ここは I/O を持たない
 * 純ロジック(プロパティ定義・状態遷移・アドバイスJSONの検証/整形・行情報の読み取り)。
 */

import { z } from "zod";

import type { FlexBubble } from "./digest-flex";
import { buildNoticeFlex } from "./notice-flex";
import { BODY_MIRROR_PROP, chunkRichText, type NotionPage } from "./notion";

/** Notion「記事ネタ案」に追加するアドバイスループ用プロパティ名(手動追加)。 */
export const ADVISE_PROPS = {
  /** ユーザーの依頼時の補足指示(自由文・任意。空ならおまかせ)。 */
  instruction: "アドバイス指示",
  /** アドバイスステータス(select)。 */
  status: "アドバイスステータス",
  /** PC が返したアドバイス(JSON 文字列) or 失敗理由。 */
  result: "アドバイス結果",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "アドバイス依頼時刻",
} as const;

/** 記事ネタ案のタイトル / 下書き ID プロパティ名。 */
const IDEA_TITLE_PROP = "タイトル案";
const DRAFT_ID_PROP = "下書きID";

export type AdviceStatus = "なし" | "依頼中" | "処理中" | "提示中" | "失敗";

export const ADVISE_STATUSES: readonly AdviceStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "提示中",
  "失敗",
];

/** この状態の行は再依頼を拒否する(処理途中/提示済み)。 */
export const ADVISE_BUSY_STATUSES: readonly AdviceStatus[] = ["依頼中", "処理中", "提示中"];

// ── アドバイス本体のスキーマ(zod・信頼できない JSON を安全側で検証) ──────────────
/** 直すべき点の重要度。 */
export const ADVICE_SEVERITIES = ["高", "中", "低"] as const;

const AdviceScoreSchema = z.object({
  /** 観点名(§11 ルブリック: 検索意図/具体性/4段構成/独自視点/読みやすさ/正確性 など)。 */
  axis: z.string().min(1),
  /** 0〜5 点。 */
  score: z.number().int().min(0).max(5),
  /** 一言メモ(任意)。 */
  note: z.string().optional(),
});

const AdviceFixSchema = z.object({
  /** 観点(文体/構成/読みやすさ/見た目/正確性/タイトル/リンク 等。自由文)。 */
  area: z.string().min(1),
  severity: z.enum(ADVICE_SEVERITIES),
  /** 該当箇所の引用(任意)。 */
  quote: z.string().optional(),
  reason: z.string().min(1),
  suggestion: z.string().min(1),
});

export const AdviceSchema = z.object({
  summary: z.string().min(1),
  scores: z.array(AdviceScoreSchema),
  strengths: z.array(z.string().min(1)),
  fixes: z.array(AdviceFixSchema),
});

export type Advice = z.infer<typeof AdviceSchema>;
export type AdviceScore = z.infer<typeof AdviceScoreSchema>;
export type AdviceFix = z.infer<typeof AdviceFixSchema>;

/**
 * 信頼できないアドバイス JSON 文字列を検証して Advice にする。
 * read-only 表示用なので **throw せず**、壊れた JSON / スキーマ不一致は null を返す(安全側)。
 */
export function parseAdvice(raw: string): Advice | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = AdviceSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Advice を検証して JSON 文字列にする(書き込み用)。不正なら throw(沈黙させない=PC側)。 */
export function serializeAdvice(advice: unknown): string {
  return JSON.stringify(AdviceSchema.parse(advice));
}

// ── 依頼・状態遷移プロパティ ──────────────────────────────────────────
/** アドバイス依頼を Notion に書き込むプロパティ群(1 PATCH 用)。指示は任意。 */
export function buildAdviceRequestProps(
  instruction: string,
  nowIso: string
): Record<string, unknown> {
  const requested: AdviceStatus = "依頼中";
  return {
    [ADVISE_PROPS.instruction]: { rich_text: instruction ? chunkRichText(instruction) : [] },
    [ADVISE_PROPS.result]: { rich_text: [] },
    [ADVISE_PROPS.status]: { select: { name: requested } },
    [ADVISE_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildAdviceProcessingProps(): Record<string, unknown> {
  const processing: AdviceStatus = "処理中";
  return { [ADVISE_PROPS.status]: { select: { name: processing } } };
}

/** 完了: アドバイス JSON を書き込み、提示中にする(1 PATCH)。 */
export function buildAdvicePresentProps(adviceJson: string): Record<string, unknown> {
  const presented: AdviceStatus = "提示中";
  return {
    [ADVISE_PROPS.result]: { rich_text: chunkRichText(adviceJson) },
    [ADVISE_PROPS.status]: { select: { name: presented } },
  };
}

/** 失敗: 失敗にして理由を結果へ入れる(沈黙させない・1 PATCH)。 */
export function buildAdviceFailProps(reason: string): Record<string, unknown> {
  const failed: AdviceStatus = "失敗";
  return {
    [ADVISE_PROPS.status]: { select: { name: failed } },
    [ADVISE_PROPS.result]: { rich_text: chunkRichText(reason) },
  };
}

/** 「閉じる」: 指示・結果・ステータスをクリアして「なし」に戻す(本文は触らない)。 */
export function buildAdviceClearProps(): Record<string, unknown> {
  const cleared: AdviceStatus = "なし";
  return {
    [ADVISE_PROPS.status]: { select: { name: cleared } },
    [ADVISE_PROPS.instruction]: { rich_text: [] },
    [ADVISE_PROPS.result]: { rich_text: [] },
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

/** ページの `アドバイスステータス`(select)を読む。未設定/想定外は「なし」。 */
export function adviceStatusOf(page: NotionPage): AdviceStatus {
  const name = readSelectName(page, ADVISE_PROPS.status);
  return (ADVISE_STATUSES as readonly string[]).includes(name) ? (name as AdviceStatus) : "なし";
}

/** 承認画面の表示用ビュー: ステータス＋(提示中なら)パース済みアドバイス＋(失敗なら)生の理由。 */
export interface AdviceView {
  status: AdviceStatus;
  /** 提示中で JSON が妥当なときのみ非 null。 */
  advice: Advice | null;
  /** 失敗時の理由など、結果欄の生テキスト(表示用)。 */
  raw: string;
}

/** ページからアドバイスの表示用ビューを取り出す(read-only・壊れていても落とさない)。 */
export function adviceViewOf(page: NotionPage): AdviceView {
  const status = adviceStatusOf(page);
  const raw = readRichTextPlain(page, ADVISE_PROPS.result);
  return { status, advice: status === "提示中" ? parseAdvice(raw) : null, raw };
}

export interface AdviceRow {
  id: string;
  title: string;
  /** 依頼時の補足指示(空ならおまかせ)。 */
  instruction: string;
  status: AdviceStatus;
  requestedAtMs: number | null;
  /** 下書き contentId(空=未作成)。 */
  contentId: string;
  /** 下書き本文HTMLミラー(#95)。claude が分析する対象。 */
  bodyHtml: string;
}

/** Notion ページから PC poller 用の行情報を取り出す。 */
export function adviceRowFromPage(page: NotionPage): AdviceRow {
  return {
    id: page.id,
    title: readTitlePlain(page, IDEA_TITLE_PROP),
    instruction: readRichTextPlain(page, ADVISE_PROPS.instruction),
    status: adviceStatusOf(page),
    requestedAtMs: readDateStartMs(page, ADVISE_PROPS.requestedAt),
    contentId: readRichTextPlain(page, DRAFT_ID_PROP),
    bodyHtml: readRichTextPlain(page, BODY_MIRROR_PROP),
  };
}

/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const ADVISE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 処理中のまま timeoutMs を超えた行(PC が落ちた等)の id を返す(reaper 対象)。
 * 依頼時刻が無い行は対象にしない(誤回収を避ける)。
 */
export function selectStaleAdviceIds(
  rows: readonly AdviceRow[],
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

/** アドバイス提示の LINE 本文(承認画面URLへ誘導)。 */
export function buildAdvicePresentMessage(title: string, approveUrl: string): string {
  return [
    "記事のスタイリング・アドバイスができました。",
    `タイトル: ${title}`,
    "承認画面のプレビューで、強み／直すべき点／スコアを確認してください。",
    approveUrl,
  ].join("\n");
}

/** アドバイス提示の Flex カード(#162)。altText は buildAdvicePresentMessage を流用する。 */
export function buildAdvicePresentFlex(title: string, approveUrl: string): FlexBubble {
  return buildNoticeFlex({
    heading: "📝 スタイリング・アドバイスができました",
    title,
    lines: ["承認画面で、強み／直すべき点／スコアを確認してください。"],
    approveUrl,
  });
}

/** アドバイス失敗の LINE 本文(沈黙させない・#24整合)。 */
export function buildAdviceFailMessage(title: string, reason: string): string {
  return [
    "記事のスタイリング・アドバイスに失敗しました(外部障害の可能性があります)。",
    `タイトル: ${title}`,
    `理由: ${reason}`,
    "承認画面から、もう一度アドバイスを依頼できます。",
  ].join("\n");
}
