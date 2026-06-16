/**
 * 承認ページの純粋ロジック(Notion ページ → 表示用項目への整形、入力検証)。
 * I/O を含まないためテスト可能。Route Handler はこれらを使う薄い配線にする。
 */

import type { NotionPage } from "./notion";

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
}

export interface Decision {
  id: string;
  decision: "承認" | "却下";
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
  return buildDetails([
    { label: "優先度スコア", value: score === null ? "" : String(score) },
    { label: "確度", value: selectName(page, "確度") },
    { label: "インパクト", value: selectName(page, "インパクト") },
    { label: "根拠", value: richText(page, "根拠") },
    { label: "想定アクション", value: richText(page, "想定アクション") },
  ]);
}

function ideaDetails(page: NotionPage): PendingDetail[] {
  return buildDetails([{ label: "優先度", value: selectName(page, "優先度") }]);
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
  }));
  const ideaItems: PendingItem[] = ideas.map((page) => ({
    id: page.id,
    kind: "idea",
    title: titleText(page, "タイトル案"),
    subtitle: richText(page, "概要"),
    details: ideaDetails(page),
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
    if (decision !== "承認" && decision !== "却下") {
      throw new Error("decision は承認/却下のみ指定できます。");
    }
    return { id, decision };
  });
}
