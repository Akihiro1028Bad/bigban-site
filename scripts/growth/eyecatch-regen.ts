/**
 * アイキャッチ AI 再生成ループ(Epic #140 / #144)の純ロジック。
 *
 * 構成案修正ループ(#40)と同方式の **pull 型**: 承認画面が Notion に再生成リクエストを
 * 書き、自宅 PC の画像ループが拾って `gen-eyecatch` で生成 → microCMS Media へ upload →
 * `patchDraft` でアイキャッチ差し替え → Notion ミラー更新する。決定的な Notion 書き込み・
 * 通知・ロック・回収は CLI(`eyecatch-regen-cli.ts`)が行い、ここは I/O を持たない純ロジック。
 */

import type { FlexBubble } from "./digest-flex";
import { buildNoticeFlex } from "./notice-flex";
import { chunkRichText, type NotionPage } from "./notion";
import { selectStaleJobIds } from "./staleJob";

/** Notion「記事ネタ案」に追加する再生成ループ用プロパティ名(手動追加)。 */
export const REGEN_PROPS = {
  /** ユーザーの再生成指示(自由文。空なら PC 側が既定の行為で生成)。 */
  instruction: "アイキャッチ再生成指示",
  /** 再生成ステータス(select)。 */
  status: "アイキャッチ再生成ステータス",
  /** stale-lock 回収・タイムアウト判定用。 */
  requestedAt: "アイキャッチ再生成依頼時刻",
} as const;

/** 記事ネタ案のタイトル / 下書き ID プロパティ名。 */
const IDEA_TITLE_PROP = "タイトル案";
const DRAFT_ID_PROP = "下書きID";

export type RegenStatus = "なし" | "依頼中" | "処理中" | "失敗";

export const REGEN_STATUSES: readonly RegenStatus[] = ["なし", "依頼中", "処理中", "失敗"];

/** この状態の行は再依頼を拒否する(処理途中)。 */
export const REGEN_BUSY_STATUSES: readonly RegenStatus[] = ["依頼中", "処理中"];

/**
 * 再生成リクエストを Notion に書き込むプロパティ群(1 PATCH 用)。
 * 指示が空でも受け付ける(PC 側が記事文脈から既定の行為を決める)。
 */
export function buildRegenRequestProps(
  instruction: string,
  nowIso: string
): Record<string, unknown> {
  const requested: RegenStatus = "依頼中";
  return {
    [REGEN_PROPS.instruction]: { rich_text: instruction ? chunkRichText(instruction) : [] },
    [REGEN_PROPS.status]: { select: { name: requested } },
    [REGEN_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** ロック取得(依頼中 → 処理中)。 */
export function buildRegenProcessingProps(): Record<string, unknown> {
  const processing: RegenStatus = "処理中";
  return { [REGEN_PROPS.status]: { select: { name: processing } } };
}

/** 完了: 指示をクリアし、ステータスをなしに戻す(アイキャッチ自体は patchDraft 済み)。 */
export function buildRegenDoneProps(): Record<string, unknown> {
  const cleared: RegenStatus = "なし";
  return {
    [REGEN_PROPS.status]: { select: { name: cleared } },
    [REGEN_PROPS.instruction]: { rich_text: [] },
  };
}

/** 失敗: 失敗にする(指示は残し、承認画面から再依頼できる)。理由は LINE 通知で伝える。 */
export function buildRegenFailProps(): Record<string, unknown> {
  const failed: RegenStatus = "失敗";
  return { [REGEN_PROPS.status]: { select: { name: failed } } };
}

// ── Notion ページ読み取り(poller 用) ──────────────────────────────
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

export interface RegenRow {
  id: string;
  title: string;
  /** 再生成指示(空なら既定の行為で生成)。 */
  instruction: string;
  status: RegenStatus;
  requestedAtMs: number | null;
  /** 差し替え先の microCMS 下書き contentId。 */
  contentId: string;
}

/** Notion ページから poller 用の行情報を取り出す。 */
export function regenRowFromPage(page: NotionPage): RegenRow {
  const statusName = readSelectName(page, REGEN_PROPS.status);
  const status: RegenStatus = (REGEN_STATUSES as readonly string[]).includes(statusName)
    ? (statusName as RegenStatus)
    : "なし";
  return {
    id: page.id,
    title: readTitlePlain(page, IDEA_TITLE_PROP),
    instruction: readRichTextPlain(page, REGEN_PROPS.instruction),
    status,
    requestedAtMs: readDateStartMs(page, REGEN_PROPS.requestedAt),
    contentId: readRichTextPlain(page, DRAFT_ID_PROP),
  };
}

/** 承認画面の表示用ビュー: アイキャッチ再生成ステータス。 */
export interface EyecatchRegenView {
  status: RegenStatus;
  /** 依頼時刻(ms)。経過時間/滞留警告の表示用(#C2 UI)。 */
  requestedAtMs?: number | null;
}

/**
 * Notion ページからアイキャッチ再生成の表示用ビューを取り出す(#166・read-only)。
 * 承認画面が「依頼中/処理中/失敗」をバッジ表示するために status だけ返す。
 */
export function regenViewOf(page: NotionPage): EyecatchRegenView {
  const row = regenRowFromPage(page);
  return { status: row.status, requestedAtMs: row.requestedAtMs };
}

/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const REGEN_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * 処理中・依頼中のまま timeoutMs を超えた行(PC が落ちた/拾う前に止まった)の id を返す(reaper 対象)。
 * 依頼時刻が無い行・提示中は対象にしない(誤回収を避ける)。判定は共通の {@link selectStaleJobIds}。
 */
export function selectStaleRegenIds(
  rows: readonly RegenRow[],
  nowMs: number,
  timeoutMs: number
): string[] {
  return selectStaleJobIds(rows, nowMs, timeoutMs);
}

/** 再生成完了の LINE 本文(承認画面URLへ誘導)。 */
export function buildRegenDoneMessage(title: string, approveUrl: string): string {
  return [
    "アイキャッチを再生成しました。",
    `タイトル: ${title}`,
    "承認画面のプレビューで確認してください。",
    approveUrl,
  ].join("\n");
}

/** 再生成完了の Flex カード(#162)。altText は buildRegenDoneMessage を流用する。 */
export function buildRegenDoneFlex(title: string, approveUrl: string): FlexBubble {
  return buildNoticeFlex({
    heading: "🎨 アイキャッチを再生成しました",
    title,
    lines: ["承認画面のプレビューで確認してください。"],
    approveUrl,
  });
}

/** 再生成失敗の LINE 本文(沈黙させない・#24整合)。 */
export function buildRegenFailMessage(title: string, reason: string): string {
  return [
    "アイキャッチの再生成に失敗しました(外部障害の可能性があります)。",
    `タイトル: ${title}`,
    `理由: ${reason}`,
    "承認画面から、もう一度再生成を依頼できます。",
  ].join("\n");
}
