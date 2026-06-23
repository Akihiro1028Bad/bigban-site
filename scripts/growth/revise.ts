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
  /** #139 B: タイトルへの修正指示(自由文)。行アンカーを持たないので独立プロパティ。 */
  titleInstruction: "修正タイトル指示",
  /** #139 B: PC が返した修正後のタイトル。反映まで `タイトル案` には触らない。 */
  titleProposal: "修正タイトル案",
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
 * #139 B: 構成案コメント(`修正指示`)・タイトル指示(`修正タイトル指示`)を並走させる。
 * 依頼が無い方は空(`rich_text: []`)で書き、前回の指示が残らないようにする。
 * 「少なくとも一方が非空」の検証は呼び出し側(API ルート)が行う。
 */
export function buildReviseRequestProps(
  instructionsJson: string | null,
  titleInstruction: string | null,
  nowIso: string
): Record<string, unknown> {
  const requested: ReviseStatus = "依頼中";
  return {
    [REVISE_PROPS.instructions]: {
      rich_text: instructionsJson ? chunkRichText(instructionsJson) : [],
    },
    [REVISE_PROPS.titleInstruction]: {
      rich_text: titleInstruction ? chunkRichText(titleInstruction) : [],
    },
    [REVISE_PROPS.status]: { select: { name: requested } },
    [REVISE_PROPS.requestedAt]: { date: { start: nowIso } },
  };
}

/** 修正指示・修正案(構成案/タイトル両レーン)をクリアし、ステータスを「なし」に戻すプロパティ群。 */
function clearedReviseProps(): Record<string, unknown> {
  const cleared: ReviseStatus = "なし";
  return {
    [REVISE_PROPS.status]: { select: { name: cleared } },
    [REVISE_PROPS.instructions]: { rich_text: [] },
    [REVISE_PROPS.proposal]: { rich_text: [] },
    [REVISE_PROPS.titleInstruction]: { rich_text: [] },
    [REVISE_PROPS.titleProposal]: { rich_text: [] },
  };
}

/**
 * 「反映」: 提案がある方だけ(構成案=`修正案`→`構成案` / タイトル=`修正タイトル案`→`タイトル案`)を
 * 上書きし、修正状態を全クリアする(1 PATCH 用)。両方 null は呼び出し側でガードする。
 */
export function buildReviseApplyProps(
  proposal: string | null,
  titleProposal: string | null
): Record<string, unknown> {
  return {
    ...(proposal ? { [OUTLINE_PROP]: { rich_text: chunkRichText(proposal) } } : {}),
    ...(titleProposal ? { [IDEA_TITLE_PROP]: { title: chunkRichText(titleProposal) } } : {}),
    ...clearedReviseProps(),
  };
}

/**
 * 「やり直し/破棄」: 構成案は触らず、修正指示・修正案・ステータスだけをクリアする。
 */
export function buildReviseDiscardProps(): Record<string, unknown> {
  return clearedReviseProps();
}

/**
 * 手動編集(#54): 構成案を直接上書きする(AIを介さない)。修正状態は触らない。
 */
export function buildOutlineEditProps(outline: string): Record<string, unknown> {
  return { [OUTLINE_PROP]: { rich_text: chunkRichText(outline) } };
}

/**
 * 手動編集(#139 A): 記事タイトル(タイトル案・title型)を直接上書きする(AIを介さない)。
 * 修正状態は触らない。空文字は title:[] でクリアされる(空は呼び出し側で弾く)。
 */
export function buildTitleEditProps(title: string): Record<string, unknown> {
  return { [IDEA_TITLE_PROP]: { title: chunkRichText(title) } };
}

// ── PC poller(#44)用 ──────────────────────────────────────────────
/** stale-lock とみなす時間(処理中のまま放置 → 失敗に回収)。 */
export const REVISE_TIMEOUT_MS = 15 * 60 * 1000;

/** ロック取得(依頼中 → 処理中)のプロパティ。 */
export function buildReviseProcessingProps(): Record<string, unknown> {
  const processing: ReviseStatus = "処理中";
  return { [REVISE_PROPS.status]: { select: { name: processing } } };
}

/**
 * 修正完了: 提案を書き込み、提示中にする(1 PATCH)。
 * #139 B: 構成案・タイトルのうち提案がある方を書き、無い方は空にして残骸を残さない。
 */
export function buildReviseProposalProps(
  proposal: string | null,
  titleProposal: string | null
): Record<string, unknown> {
  const presented: ReviseStatus = "提示中";
  return {
    [REVISE_PROPS.proposal]: { rich_text: proposal ? chunkRichText(proposal) : [] },
    [REVISE_PROPS.titleProposal]: {
      rich_text: titleProposal ? chunkRichText(titleProposal) : [],
    },
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
  /** #139 B: タイトルへの修正指示(自由文)。無ければ ""。 */
  titleInstruction: string;
  /** #139 B: PC が返した修正後タイトル。未提示なら ""。 */
  titleProposal: string;
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
    titleInstruction: readRichTextPlain(page, REVISE_PROPS.titleInstruction),
    titleProposal: readRichTextPlain(page, REVISE_PROPS.titleProposal),
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
