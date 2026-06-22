/**
 * 承認画面から人間が手動登録する施策(#255)の純粋ロジック。
 * 入力検証・Notion プロパティ整形・表示用アイテム化を I/O 無しで行う。
 */

import type { PendingItem } from "./approve";
import { deriveProposalStage } from "./stage";

/** 施策提案 DB のカテゴリ選択肢(週次モードと共通)。 */
export const PROPOSAL_CATEGORIES = [
  "コンテンツ",
  "MEO",
  "サイトデザイン",
  "サイト表示内容",
  "追加機能",
  "イベント",
] as const;

export interface ProposalInput {
  name: string;
  category: string;
  note: string;
}

const MAX_NAME = 200;
const MAX_CATEGORY = 50;
const MAX_NOTE = 2000;
const STATUS_PENDING = "未処理";

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** POST ボディを検証して施策入力を返す。不正なら throw。 */
export function parseProposalInput(body: unknown): ProposalInput {
  if (!body || typeof body !== "object") {
    throw new Error("不正なリクエストです。");
  }
  const record = body as Record<string, unknown>;
  const name = trimmedString(record.name);
  if (!name) {
    throw new Error("施策名を入力してください。");
  }
  if (name.length > MAX_NAME) {
    throw new Error("施策名が長すぎます。");
  }
  const category = trimmedString(record.category);
  if (category.length > MAX_CATEGORY) {
    throw new Error("カテゴリが長すぎます。");
  }
  const note = trimmedString(record.note);
  if (note.length > MAX_NOTE) {
    throw new Error("メモが長すぎます。");
  }
  return { name, category, note };
}

/** Notion ページ作成用のプロパティを組み立てる(ステータスは承認待ち=未処理)。 */
export function proposalProperties(input: ProposalInput): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    "施策名": { title: [{ text: { content: input.name } }] },
    "ステータス": { select: { name: STATUS_PENDING } },
  };
  if (input.category) {
    properties["カテゴリ"] = { select: { name: input.category } };
  }
  if (input.note) {
    properties["想定アクション"] = { rich_text: [{ text: { content: input.note } }] };
  }
  return properties;
}

/** 作成済みページ ID と入力から、承認一覧に差し込む表示用アイテムを作る。 */
export function proposalToItem(id: string, input: ProposalInput): PendingItem {
  const details = input.note
    ? [{ label: "想定アクション", value: input.note }]
    : [];
  return {
    id,
    kind: "proposal",
    title: input.name,
    subtitle: input.category,
    details,
    score: 0,
    stage: deriveProposalStage(STATUS_PENDING),
  };
}
