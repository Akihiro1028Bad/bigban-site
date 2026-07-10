/**
 * 施策作成モーダル(#P5a ProposalFormModal)のフォーム検証＋API ペイロード整形の純ロジック。
 *
 * 既存 `POST /api/growth/proposals` が persist するのは {name, category, note} のみ(Notion 未拡張)。
 * そのため種別(kind)や site/event/other の詳細フィールドは persist せず、kind は
 * 既存 category(6値=PROPOSAL_CATEGORIES)への決定的な写像だけに使う(縮約・BE 変更ゼロ)。
 *
 * DOM/IO 非依存。ProposalFormModal(presentation)は本関数で整形してから fetch する。
 */

import type { ProposalKind } from "@/app/growth/approve/types";

import { PROPOSAL_CATEGORIES } from "./proposals";

/** article 種別で category 未選択/未知のときのフォールバック。 */
export const DEFAULT_ARTICLE_CATEGORY = "コンテンツ";

/** site 種別を写像する既定カテゴリ。 */
const SITE_CATEGORY = "サイトデザイン";

/**
 * other 種別を写像する既定カテゴリ(#214)。
 * `kindFromCategory("MEO") === "other"` と対称にし、種別の往復(other→MEO→other)を保つ。
 * 以前は "コンテンツ" で、往復時に article へ戻り other が失われていた。
 */
const OTHER_CATEGORY = "MEO";

/** event 種別を写像する既定カテゴリ。 */
const EVENT_CATEGORY = "イベント";

/** system 種別を写像する既定カテゴリ。 */
const SYSTEM_CATEGORY = "システム改善";

export interface ProposalFormInput {
  name: string;
  kind: ProposalKind;
  /** kind==="article" のときフォームで選んだカテゴリ(6値)。他種別では無視。 */
  category?: string;
  /** 狙い・読者などのメモ(任意)。 */
  note?: string;
}

/** persist 対象(既存 API の受け口)。note は空なら含めない。 */
export interface ProposalFormPayload {
  name: string;
  category: string;
  note?: string;
}

export type ValidateProposalFormResult =
  | { ok: true; payload: ProposalFormPayload }
  | { ok: false; error: string };

function isKnownCategory(value: string): boolean {
  return (PROPOSAL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * kind→category 写像。persist は {name,category,note} のみのため、
 * 種別は既存 6値カテゴリへ決定的に落とし込む。
 * - article: フォームで選んだ 6値をそのまま。未指定/空/未知は DEFAULT_ARTICLE_CATEGORY。
 * - event : "イベント"
 * - site  : "サイトデザイン"
 * - other : "MEO"(#214・kindFromCategory と往復整合)
 * - system: "システム改善"(weekly のシステム振り返りカテゴリ)
 */
export function categoryForKind(kind: ProposalKind, selected?: string): string {
  switch (kind) {
    case "event":
      return EVENT_CATEGORY;
    case "site":
      return SITE_CATEGORY;
    case "other":
      return OTHER_CATEGORY;
    case "system":
      return SYSTEM_CATEGORY;
    case "article":
    default: {
      const trimmed = (selected ?? "").trim();
      return isKnownCategory(trimmed) ? trimmed : DEFAULT_ARTICLE_CATEGORY;
    }
  }
}

/**
 * フォーム入力を検証し、persist 用ペイロードへ整形する。
 * name 必須(空/空白→error)。category は種別から写像。note は任意(空なら省く)。
 */
export function validateProposalForm(input: ProposalFormInput): ValidateProposalFormResult {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "施策名を入力してください。" };
  }

  const category = categoryForKind(input.kind, input.category);
  const note = (input.note ?? "").trim();

  const payload: ProposalFormPayload = note ? { name, category, note } : { name, category };
  return { ok: true, payload };
}
