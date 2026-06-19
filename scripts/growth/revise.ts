/**
 * 構成案修正ループ(Epic #40)の純ロジック。
 *
 * - Notion「記事ネタ案」に追加する修正用プロパティ名の定数
 * - 修正ステータスの型
 * - 行アンカー付きコメント(修正指示)の serialize / parse(JSON・検証)
 *
 * I/O を持たないためテスト可能。Web(API ルート)・PC(poller) の双方が import する。
 */

import { chunkRichText, type NotionPage } from "./notion";

/** Notion「記事ネタ案」に追加する修正ループ用プロパティ名(#45 でDBに作成)。 */
export const REVISE_PROPS = {
  /** 行アンカー付きコメントの JSON。 */
  instructions: "修正指示",
  /** 修正ステータス(select)。 */
  status: "修正ステータス",
  /** PC が返した修正後の構成案。反映まで `構成案` には触らない。 */
  proposal: "修正案",
  /** stale-lock 回収・タイムアウト通知用。 */
  requestedAt: "修正依頼時刻",
} as const;

/** 既存の構成案(本文)プロパティ名。反映時のみ上書きする。 */
export const OUTLINE_PROP = "構成案";

export type ReviseStatus = "なし" | "依頼中" | "処理中" | "提示中" | "失敗";

export const REVISE_STATUSES: readonly ReviseStatus[] = [
  "なし",
  "依頼中",
  "処理中",
  "提示中",
  "失敗",
];

/** この状態の行は再依頼を拒否し、承認/却下も無効化する(処理途中)。 */
export const REVISE_BUSY_STATUSES: readonly ReviseStatus[] = ["依頼中", "処理中", "提示中"];

/** 1 行(見出し)へのコメント。line は使い捨てアンカー(現在の行テキスト)。 */
export interface ReviseComment {
  line: string;
  comment: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 行コメント配列を JSON 文字列にする。
 * 空配列・line/comment が空の要素は不正として弾く(沈黙させない)。
 */
export function serializeReviseInstructions(comments: unknown): string {
  if (!Array.isArray(comments) || comments.length === 0) {
    throw new Error("修正コメントが空です。1件以上のコメントを付けてください。");
  }
  const normalized = comments.map((c, i) => {
    const line = (c as { line?: unknown })?.line;
    const comment = (c as { comment?: unknown })?.comment;
    if (!isNonEmptyString(line) || !isNonEmptyString(comment)) {
      throw new Error(`修正コメント[${i}]の line / comment が不正です。`);
    }
    return { line: line.trim(), comment: comment.trim() };
  });
  return JSON.stringify(normalized);
}

/**
 * `修正指示`(JSON 文字列)を行コメント配列へ復元する。
 * 不正な JSON・配列でない・要素が不正なら throw。
 */
export function parseReviseInstructions(raw: string): ReviseComment[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("修正指示の JSON を解釈できませんでした。");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("修正指示は1件以上の配列である必要があります。");
  }
  return data.map((item, i) => {
    const line = (item as { line?: unknown })?.line;
    const comment = (item as { comment?: unknown })?.comment;
    if (!isNonEmptyString(line) || !isNonEmptyString(comment)) {
      throw new Error(`修正指示[${i}]の line / comment が不正です。`);
    }
    return { line: line.trim(), comment: comment.trim() };
  });
}

/**
 * 修正依頼を Notion に書き込むためのプロパティ群(1 PATCH 用)を組み立てる。
 * `修正指示`=コメントJSON、`修正ステータス`=依頼中、`修正依頼時刻`=nowIso。
 */
export function buildReviseRequestProps(
  instructionsJson: string,
  nowIso: string
): Record<string, unknown> {
  const requested: ReviseStatus = "依頼中";
  return {
    [REVISE_PROPS.instructions]: { rich_text: chunkRichText(instructionsJson) },
    [REVISE_PROPS.status]: { select: { name: requested } },
    [REVISE_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** 修正指示・修正案をクリアし、修正ステータスを「なし」に戻すプロパティ群。 */
function clearedReviseProps(): Record<string, unknown> {
  const cleared: ReviseStatus = "なし";
  return {
    [REVISE_PROPS.status]: { select: { name: cleared } },
    [REVISE_PROPS.instructions]: { rich_text: [] },
    [REVISE_PROPS.proposal]: { rich_text: [] },
  };
}

/**
 * 「反映」: 修正案を構成案へ上書きし、修正状態をクリアする(1 PATCH 用)。
 */
export function buildReviseApplyProps(proposal: string): Record<string, unknown> {
  return {
    [OUTLINE_PROP]: { rich_text: chunkRichText(proposal) },
    ...clearedReviseProps(),
  };
}

/**
 * 「やり直し/破棄」: 構成案は触らず、修正指示・修正案・ステータスだけをクリアする。
 */
export function buildReviseDiscardProps(): Record<string, unknown> {
  return clearedReviseProps();
}

// ── PC poller(#44)用 ──────────────────────────────────────────────
/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const REVISE_TIMEOUT_MS = 15 * 60 * 1000;

/** ロック取得(依頼中 → 処理中)のプロパティ。 */
export function buildReviseProcessingProps(): Record<string, unknown> {
  const processing: ReviseStatus = "処理中";
  return { [REVISE_PROPS.status]: { select: { name: processing } } };
}

/** 修正完了: 修正案を書き込み、提示中にする(1 PATCH)。 */
export function buildReviseProposalProps(proposal: string): Record<string, unknown> {
  const presented: ReviseStatus = "提示中";
  return {
    [REVISE_PROPS.proposal]: { rich_text: chunkRichText(proposal) },
    [REVISE_PROPS.status]: { select: { name: presented } },
  };
}

/** 失敗: 失敗にして理由を修正案へ入れる(沈黙させない・1 PATCH)。 */
export function buildReviseFailProps(reason: string): Record<string, unknown> {
  const failed: ReviseStatus = "失敗";
  return {
    [REVISE_PROPS.status]: { select: { name: failed } },
    [REVISE_PROPS.proposal]: { rich_text: chunkRichText(reason) },
  };
}

// Notion ページの読み取り(poller 用・src/lib の approve.ts とは別レイヤー)。
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

function readTitlePlain(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("");
}

/** 記事ネタ案のタイトルプロパティ名。 */
export const IDEA_TITLE_PROP = "タイトル案";

export interface ReviseRow {
  id: string;
  title: string;
  status: ReviseStatus;
  requestedAtMs: number | null;
  outline: string;
  /** 行コメント。空/不正なら []。 */
  instructions: ReviseComment[];
}

/** Notion ページから poller 用の行情報を取り出す(壊れた修正指示は [] にして落とさない)。 */
export function reviseRowFromPage(page: NotionPage): ReviseRow {
  const statusName = readSelectName(page, REVISE_PROPS.status);
  const status: ReviseStatus = (REVISE_STATUSES as readonly string[]).includes(statusName)
    ? (statusName as ReviseStatus)
    : "なし";
  const rawInstructions = readRichTextPlain(page, REVISE_PROPS.instructions);
  let instructions: ReviseComment[] = [];
  if (rawInstructions) {
    try {
      instructions = parseReviseInstructions(rawInstructions);
    } catch {
      instructions = [];
    }
  }
  return {
    id: page.id,
    title: readTitlePlain(page, IDEA_TITLE_PROP),
    status,
    requestedAtMs: readDateStartMs(page, REVISE_PROPS.requestedAt),
    outline: readRichTextPlain(page, OUTLINE_PROP),
    instructions,
  };
}

/**
 * 処理中のまま timeoutMs を超えた行(PCが落ちた等)の id を返す(reaper 対象)。
 * 依頼時刻が無い行は対象にしない(誤回収を避ける)。
 */
export function selectStaleReviseIds(
  rows: readonly ReviseRow[],
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

/** 修正案提示の LINE 本文(承認画面URLへ誘導)。 */
export function buildRevisePresentMessage(title: string, approveUrl: string): string {
  return [
    "記事構成案の修正案ができました。",
    `タイトル: ${title}`,
    "承認画面で元の構成案と見比べて、反映/やり直しを選んでください。",
    approveUrl,
  ].join("\n");
}

/** 修正失敗の LINE 本文(沈黙させない・#24整合)。 */
export function buildReviseFailMessage(title: string, reason: string): string {
  return [
    "記事構成案の修正に失敗しました(外部障害の可能性があります)。",
    `タイトル: ${title}`,
    `理由: ${reason}`,
    "承認画面から、やり直し(再コメント)で再依頼できます。",
  ].join("\n");
}
