/**
 * 施策の種別メタ＋承認アウトカム導出(#P5a・多種別化)。純ロジックのみ(DOM/IO 非依存)。
 *
 * - KIND_META / approveOutcomeFor は proto `approve-proto/proposalKind.ts` を逐語移植。
 *   tone は theme(`approve/theme/approveTheme.css`)に実在する `--p-*` トークンをそのまま指す。
 * - kindFromCategory は「種別を Notion に persist しない」方針の要。既存 category(6値)から
 *   決定的に派生する(実データ駆動・BE 変更ゼロ)。
 * - JSXアイコンは UI 側に置き、ここは型専用 import に保つ。
 */
import type { ProposalKind } from "@/app/growth/approve/types";

/** 種別の表示メタ。tone は CSS 変数(面は塗らず文字/アイコン色に使う)。 */
export const KIND_META: Record<ProposalKind, { label: string; tone: string }> = {
  article: { label: "記事", tone: "var(--p-accent)" },
  site: { label: "サイト", tone: "var(--p-purple)" },
  event: { label: "イベント", tone: "var(--p-green)" },
  other: { label: "その他", tone: "var(--p-text-3)" },
};

/** 承認したら何になるか(種別ごとに変わる出口)。 */
export interface ApproveOutcome {
  /** 承認ボタンのラベル。 */
  buttonLabel: string;
  /** 結末プレビューの送り先名(押す前の未来形)。 */
  preview: string;
  /** 承認後トースト。 */
  toast: string;
  /** adopted 表示用(過去形)。 */
  done: string;
}

/** 種別から承認アウトカムを導出。未設定は article。 */
export function approveOutcomeFor(kind: ProposalKind = "article"): ApproveOutcome {
  switch (kind) {
    case "site":
      return { buttonLabel: "承認して実装タスク化", preview: "実装タスク", toast: "実装タスクに登録しました", done: "実装タスクとして起票済み" };
    case "event":
      return { buttonLabel: "承認して開催準備へ", preview: "開催準備タスク", toast: "開催準備タスクを作成しました", done: "開催準備タスクとして登録済み" };
    case "other":
      return { buttonLabel: "承認してタスク化", preview: "タスク", toast: "タスクに登録しました", done: "タスクとして起票済み" };
    case "article":
    default:
      return { buttonLabel: "承認して記事化", preview: "記事ドラフト生成キュー", toast: "記事生成パイプラインに送りました", done: "記事生成パイプラインへ送出済み" };
  }
}

/**
 * 既存 category から種別を決定的に派生(#P5a・実データ橋渡し)。
 * "イベント" → "event"。それ以外の既存カテゴリ(コンテンツ/MEO/サイトデザイン/
 * サイト表示内容/追加機能)→ "article"。未知/空 → "article"(欠落耐性)。
 */
export function kindFromCategory(category: string): ProposalKind {
  return category.trim() === "イベント" ? "event" : "article";
}
