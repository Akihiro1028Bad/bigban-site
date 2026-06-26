/**
 * 承認ページの純粋ロジック(Notion ページ → 表示用項目への整形、入力検証)。
 * I/O を含まないためテスト可能。Route Handler はこれらを使う薄い配線にする。
 */

import {
  BODY_MIRROR_PROP,
  DRAFT_LINK_PROPS,
  EYECATCH_MIRROR_PROP,
  type NotionPage,
} from "./notion";
import { type ArticleMetrics, METRICS_PROPS, parseMetrics } from "./metrics";
import { PUBLISH_SCHEDULE_PROP } from "./publishQueue";
import { OUTLINE_PROP, REVISE_PROPS, REVISE_STATUSES, type ReviseStatus } from "./revise";
import {
  type ArticleStage,
  deriveArticleStage,
  deriveProposalStage,
  type Stage,
} from "./stage";

export type PendingKind = "proposal" | "idea";

/** 承認判断の材料となる 1 行(ラベルと値)。 */
export interface PendingDetail {
  label: string;
  value: string;
}

/** 記事の仮説(#計測強化 S4・修正案4)。承認カードで「狙い」を確認するために表示する。 */
export interface ArticleHypothesis {
  /** 記事タイプ(獲得/不安解消/資産/比較/イベント)。未設定は空。 */
  articleType: string;
  targetReader: string;
  searchIntent: string;
  winningAngle: string;
  /** 想定CTA(Instagram/LINE/予約/アクセス/価格/問い合わせ)。未設定は []。 */
  plannedCta: string[];
  successMetric: string;
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
  /** #139 B: PC が返した修正後のタイトル(提示中に新旧比較で表示)。空=タイトル提案なし。記事のみ。 */
  reviseTitleProposal?: string;
  /** 直近に送った修正指示(行コメントの JSON)。記事のみ。 */
  reviseInstructions?: string;
  /** #C2 UI: 構成案修正の依頼時刻(ms)。経過/滞留表示用。記事のみ・未設定は null。 */
  reviseRequestedAtMs?: number | null;
  /** 生成済み下書きの microCMS contentId(空=未作成)。下書きプレビュー(#75)の有無判定に使う。記事のみ。 */
  contentId?: string;
  /** 下書き作成済み(=承認後に下書き生成が完了)。下書きタブ(#87)の振り分けに使う。記事のみ。 */
  isDraftReady?: boolean;
  /** パイプライン段階(#106)。盤の列分けに使う。記事=ArticleStage / 施策=ProposalStage。 */
  stage: Stage;
  /** 公開記事の成績(#C4 計測ループ)。Notion `成績データ` ミラーから。未計測は undefined。記事のみ。 */
  metrics?: ArticleMetrics;
  /** 公開キュー判定用(#H23)。アイキャッチ URL(ミラー)。記事のみ。 */
  eyecatchUrl?: string;
  /** 公開キュー判定用(#H23)。下書き本文(ミラー)が非空か。記事のみ。 */
  hasDraftBody?: boolean;
  /** 予約公開時刻(#H24)。Notion `公開予約時刻` の ms。未予約は null。記事のみ。 */
  scheduledAtMs?: number | null;
  /** 記事の仮説(#計測強化 S4)。未記入は undefined。記事のみ。 */
  hypothesis?: ArticleHypothesis;
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

/** #139 B: ページの `修正タイトル案`(rich_text)を読む。未設定は空文字。 */
export function reviseTitleProposalOf(page: NotionPage): string {
  return richText(page, REVISE_PROPS.titleProposal);
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

/** ページの記事段階(ステータス＋下書きID有無から導出・#H9 ガードで使う)。 */
export function articleStageOf(page: NotionPage): ArticleStage {
  return deriveArticleStage(selectName(page, STATUS_PROP), draftLinkOf(page).contentId !== "");
}

/**
 * ページの本文HTMLミラー(`下書き本文HTML`)を読む(#95)。未保存は空文字。
 * HTML を厳密に保つため trim せず、分割された rich_text 要素を連結する。
 */
export function draftBodyOf(page: NotionPage): string {
  const value = page.properties[BODY_MIRROR_PROP] as
    | { rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

/** ページのタイトル案(`タイトル案`)を読む(#95: 下書きプレビューの見出し)。未設定は空文字。 */
export function ideaTitleOf(page: NotionPage): string {
  return titleText(page, "タイトル案");
}

/**
 * ページのアイキャッチURLミラー(`アイキャッチURL`)を読む(#141)。未設定は空文字。
 * URL 型(`url`)を優先し、テキスト型(`rich_text`)でも読めるようにする(プロパティ型の差異に強く)。
 */
export function eyecatchUrlOf(page: NotionPage): string {
  const value = page.properties[EYECATCH_MIRROR_PROP] as
    | { url?: string | null; rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  if (value?.url) return value.url.trim();
  return (value?.rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

// 記事の優先度(select)を数値ランクに変換し、施策の優先度スコアと同じ軸で並べる。
const PRIORITY_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 };

/** 承認待ちステータス(種別ごとに名前が異なる)。取り消し時の復帰先。 */
export type PendingStatus = "未処理" | "提案中";

/** ステータス更新で指定できる値。承認/却下に加え、取り消し用の承認待ち復帰、終了タスクのクローズ(#167)。 */
export type DecisionValue = "承認" | "却下" | "クローズ" | PendingStatus;

const DECISION_VALUES: readonly DecisionValue[] = ["承認", "却下", "クローズ", "未処理", "提案中"];

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

/** multi_select の選択名一覧。未設定は空配列(#計測強化 S4)。 */
function multiSelectNames(page: NotionPage, prop: string): string[] {
  const value = page.properties[prop] as
    | { multi_select?: Array<{ name?: string }> }
    | undefined;
  return (value?.multi_select ?? []).map((o) => o.name ?? "").filter((n) => n !== "");
}

/**
 * 記事の仮説(#計測強化 S4・修正案4)。公開後に「成功か」を判断するための前提。
 * 全項目が空(=未記入の旧データ)なら undefined を返す(欠落耐性・カードは何も出さない)。
 */
function hypothesisOf(page: NotionPage): ArticleHypothesis | undefined {
  const h: ArticleHypothesis = {
    articleType: selectName(page, "記事タイプ"),
    targetReader: richText(page, "狙う読者"),
    searchIntent: richText(page, "検索意図"),
    winningAngle: richText(page, "勝ち筋"),
    plannedCta: multiSelectNames(page, "想定CTA"),
    successMetric: richText(page, "成功指標"),
  };
  const hasAny =
    h.articleType !== "" ||
    h.targetReader !== "" ||
    h.searchIntent !== "" ||
    h.winningAngle !== "" ||
    h.plannedCta.length > 0 ||
    h.successMetric !== "";
  return hasAny ? h : undefined;
}

function numberValue(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { number?: number | null } | undefined;
  return typeof value?.number === "number" ? value.number : null;
}

/** date プロパティの開始時刻(ms)。未設定・不正日付は null。経過/滞留表示(#C2 UI)で使う。 */
function dateStartMs(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
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
    stage: deriveProposalStage(selectName(page, STATUS_PROP)),
  }));
  const ideaItems: PendingItem[] = ideas.map((page) => {
    const contentId = richText(page, DRAFT_LINK_PROPS.contentId);
    return {
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
      reviseTitleProposal: richText(page, REVISE_PROPS.titleProposal),
      reviseInstructions: richText(page, REVISE_PROPS.instructions),
      reviseRequestedAtMs: dateStartMs(page, REVISE_PROPS.requestedAt),
      contentId,
      isDraftReady: selectName(page, STATUS_PROP) === DRAFT_READY_STATUS,
      stage: deriveArticleStage(selectName(page, STATUS_PROP), contentId !== ""),
      metrics: parseMetrics(richText(page, METRICS_PROPS.data)) ?? undefined,
      eyecatchUrl: eyecatchUrlOf(page),
      hasDraftBody: draftBodyOf(page).trim() !== "",
      scheduledAtMs: dateStartMs(page, PUBLISH_SCHEDULE_PROP),
      hypothesis: hypothesisOf(page),
    };
  });
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
      throw new Error("decision は承認/却下/クローズ/未処理/提案中のみ指定できます。");
    }
    return { id, decision: decision as DecisionValue };
  });
}
