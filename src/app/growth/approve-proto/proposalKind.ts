/**
 * 施策の種別メタ＋承認アウトカム導出(#proto・多種別化)。
 * 純関数のみ。型専用 import に保ち、JSXアイコンは UI 側(ProposalView/ProposalDetailBody)に置く。
 */
import type { ProposalKind } from "./types";

/** 種別の表示メタ。tone は CSS 変数（面は塗らず文字/アイコン色に使う）。 */
export const KIND_META: Record<ProposalKind, { label: string; tone: string }> = {
  article: { label: "記事", tone: "var(--p-accent)" },
  site: { label: "サイト", tone: "var(--p-purple)" },
  event: { label: "イベント", tone: "var(--p-green)" },
  other: { label: "その他", tone: "var(--p-text-3)" },
};

/** 承認したら何になるか（種別ごとに変わる出口）。 */
export interface ApproveOutcome {
  /** 承認ボタンのラベル。 */
  buttonLabel: string;
  /** 結末プレビューの送り先名（押す前の未来形）。 */
  preview: string;
  /** 承認後トースト。 */
  toast: string;
  /** adopted 表示用（過去形）。 */
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
