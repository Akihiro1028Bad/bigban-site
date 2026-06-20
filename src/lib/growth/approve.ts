/**
 * 承認ページの純粋ロジック(Notion ページ → 表示用項目への整形、入力検証)。
 * I/O を含まないためテスト可能。Route Handler はこれらを使う薄い配線にする。
 */

import { DRAFT_LINK_PROPS, type NotionPage } from "./notion";
import { OUTLINE_PROP, REVISE_PROPS, REVISE_STATUSES, type ReviseStatus } from "./revise";

export type PendingKind = "proposal" | "idea";

/** 承認判断の材料となる 1 行(ラベルと値)。 */
export interface PendingDetail {
  label: string;
  value: string;
}

export interface PendingItem {
  id: string;
  kind: PendingKind;
  title: string;
  subtitle: string;
  /** 承認判断に足る根拠(種別ごとに内容が異なる)。空なら []。 */
  details: PendingDetail[];
  /** 並べ替え用の優先度スコア(施策=優先度スコア / 記事=優先度ランク)。降順表示。 */
  score: number;
  /** 記事ネタ案の構成案(見出しアウトライン)。行コメント対象。記事のみ。 */
  outline?: string;
  /** 構成案修正ループの状態(記事のみ)。未設定は「なし」。 */
  reviseStatus?: ReviseStatus;
  /** PC が返した修正後の構成案(提示中/失敗時に表示)。記事のみ。 */
  reviseProposal?: string;
  /** 直近に送った修正指示(行コメントの JSON)。記事のみ。 */
  reviseInstructions?: string;
  /** 生成済み下書きの microCMS contentId(空=未作成)。下書きプレビュー(#75)の有無判定に使う。記事のみ。 */
  contentId?: string;
  /** 下書き作成済み(=承認後に下書き生成が完了)。下書きタブ(#87)の振り分けに使う。記事のみ。 */
  isDraftReady?: boolean;
}

/** ステータス select のプロパティ名と「下書き作成済み」値(#87)。承認画面の下書きタブで使う。 */
export const STATUS_PROP = "ステータス";
export const DRAFT_READY_STATUS = "下書き作成済み";

/** Notion ページ ID として妥当か(パスインジェクション/不正入力の防御)。 */
export function isNotionPageId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** ページの `修正ステータス`(select)を読む。未設定/想定外は「なし」。 */
export function reviseStatusOf(page: NotionPage): ReviseStatus {
  const name = selectName(page, REVISE_PROPS.status);
  return (REVISE_STATUSES as readonly string[]).includes(name)
    ? (name as ReviseStatus)
    : "なし";
}

/** ページの `修正案`(rich_text)を読む。未設定は空文字。 */
export function reviseProposalOf(page: NotionPage): string {
  return richText(page, REVISE_PROPS.proposal);
}

/** 下書きプレビューの連携先(microCMS の contentId / draftKey)。 */
export interface DraftLink {
  contentId: string;
  draftKey: string;
}

/** ページの下書きリンク(`下書きID`/`下書きプレビューキー`)を読む(#74)。未設定は空文字。 */
export function draftLinkOf(page: NotionPage): DraftLink {
  return {
    contentId: richText(page, DRAFT_LINK_PROPS.contentId),
    draftKey: richText(page, DRAFT_LINK_PROPS.draftKey),
  };
}

// 記事の優先度(select)を数値ランクに変換し、施策の優先度スコアと同じ軸で並べる。
const PRIORITY_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 };

/** 承認待ちステータス(種別ごとに名前が異なる)。取り消し時の復帰先。 */
export type PendingStatus = "未処理" | "提案中";

/** ステータス更新で指定できる値。承認/却下に加え、取り消し用の承認待ち復帰。 */
export type DecisionValue = "承認" | "却下" | PendingStatus;

const DECISION_VALUES: readonly DecisionValue[] = ["承認", "却下", "未処理", "提案中"];

export interface Decision {
  id: string;
  decision: DecisionValue;
}

/** 種別から承認待ち(取り消し時の復帰先)ステータスを返す。 */
export function pendingStatus(kind: PendingKind): PendingStatus {
  return kind === "proposal" ? "未処理" : "提案中";
}

// Notion ページ ID(UUID。ダッシュ有り/無しの32桁16進)のみ許可
const ID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function titleText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { title?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function richText(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function selectName(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function numberValue(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { number?: number | null } | undefined;
  return typeof value?.number === "number" ? value.number : null;
}

/** ラベルと値の候補から、値が空でないものだけを details 行にする。 */
function buildDetails(
  candidates: Array<{ label: string; value: string }>
): PendingDetail[] {
  return candidates.filter((d) => d.value.length > 0);
}

function proposalDetails(page: NotionPage): PendingDetail[] {
  const score = numberValue(page, "優先度スコア");
  // #241: 判断しやすい順「根拠 → 想定アクション → 数値(スコア/確度/インパクト)」。
  return buildDetails([
    { label: "根拠", value: richText(page, "根拠") },
    { label: "想定アクション", value: richText(page, "想定アクション") },
    { label: "優先度スコア", value: score === null ? "" : String(score) },
    { label: "確度", value: selectName(page, "確度") },
    { label: "インパクト", value: selectName(page, "インパクト") },
  ]);
}

function ideaDetails(page: NotionPage): PendingDetail[] {
  // #241: 根拠 → 数値(優先度)の順。構成案は #42 で行コメントUI(outline)に移したため details から外す。
  return buildDetails([
    // #238: 記事も施策と同様に判断根拠を出す(空なら buildDetails が除外)。
    { label: "根拠", value: richText(page, "根拠") },
    { label: "優先度", value: selectName(page, "優先度") },
  ]);
}

/** 施策提案・記事ネタ案のページを承認UI向けの統一形式に整える。 */
export function toPendingItems(
  proposals: NotionPage[],
  ideas: NotionPage[]
): PendingItem[] {
  const proposalItems: PendingItem[] = proposals.map((page) => ({
    id: page.id,
    kind: "proposal",
    title: titleText(page, "施策名"),
    subtitle: selectName(page, "カテゴリ"),
    details: proposalDetails(page),
    score: numberValue(page, "優先度スコア") ?? 0,
  }));
  const ideaItems: PendingItem[] = ideas.map((page) => ({
    id: page.id,
    kind: "idea",
    title: titleText(page, "タイトル案"),
    subtitle: richText(page, "概要"),
    details: ideaDetails(page),
    score: PRIORITY_RANK[selectName(page, "優先度")] ?? 0,
    // #42: 構成案修正ループ用。構成案は行コメント対象、修正状態はパネルのポーリングで使う。
    outline: richText(page, OUTLINE_PROP),
    reviseStatus: reviseStatusOf(page),
    reviseProposal: richText(page, REVISE_PROPS.proposal),
    reviseInstructions: richText(page, REVISE_PROPS.instructions),
    contentId: richText(page, DRAFT_LINK_PROPS.contentId),
    isDraftReady: selectName(page, STATUS_PROP) === DRAFT_READY_STATUS,
  }));
  return [...proposalItems, ...ideaItems];
}

/** POST ボディを検証して decisions を返す。不正なら throw。 */
export function parseDecisions(body: unknown): Decision[] {
  if (!body || typeof body !== "object") {
    throw new Error("不正なリクエストです。");
  }
  const decisions = (body as { decisions?: unknown }).decisions;
  if (!Array.isArray(decisions)) {
    throw new Error("decisions は配列である必要があります。");
  }
  return decisions.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("不正な項目です。");
    }
    const id = (item as { id?: unknown }).id;
    const decision = (item as { decision?: unknown }).decision;
    if (typeof id !== "string" || !ID_RE.test(id)) {
      throw new Error("不正な id です。");
    }
    if (!DECISION_VALUES.includes(decision as DecisionValue)) {
      throw new Error("decision は承認/却下/未処理/提案中のみ指定できます。");
    }
    return { id, decision: decision as DecisionValue };
  });
}
