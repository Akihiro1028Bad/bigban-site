/**
 * 承認画面の共有ドメイン型(#H7 分解で共有化)。ApproveClient と各カスタムフック/コンポーネントで使う。
 */

import type { ArticleHypothesis } from "@/lib/growth/approve";
import type { Stage } from "@/lib/growth/stage";

export interface PendingDetail {
  label: string;
  value: string;
}

export interface PendingItem {
  id: string;
  kind: "proposal" | "idea";
  title: string;
  subtitle: string;
  details?: PendingDetail[];
  score?: number;
  // #42: 記事ネタ案の構成案修正ループ。
  outline?: string;
  reviseStatus?: string;
  reviseProposal?: string;
  // #139 B: AI が提案した新タイトル(提示中に新旧比較で表示)。空=タイトル提案なし。
  reviseTitleProposal?: string;
  reviseInstructions?: string;
  // #C2 UI: 構成案修正の依頼時刻(ms)。経過/滞留表示用。未設定は null。
  reviseRequestedAtMs?: number | null;
  // #75: 生成済み下書きの microCMS contentId(空/無=未作成)。下書きプレビューの有無判定に使う。
  contentId?: string;
  // #H24/#proto P3a: 予約公開時刻(ms)。サーバ @/lib/growth/approve の PendingItem のミラー由来。未予約は null/未設定。
  scheduledAtMs?: number | null;
  // #proto P2: アイキャッチ画像URL(Notion ミラー由来・盤データに既存)。カードのサムネ表示に使う。
  // 空/無=画像未生成→サムネはグラデーション/プレースホルダにフォールバック。
  eyecatchUrl?: string;
  // #H23/#proto P5b: 下書き本文が空でないか(サーバ PendingItem のミラー由来)。
  // 公開キューの blocked 判定(publishBlockReason「本文が空」)が読む。未設定=false 扱い。
  hasDraftBody?: boolean;
  // #87: 下書き作成済み(承認後に下書き生成完了)。下書きタブへ振り分け、承認/却下を出さない。
  isDraftReady?: boolean;
  // #106/#107: パイプライン段階。盤の列分け・段階インジケータに使う。
  stage: Stage;
  // #計測強化 S4: 記事の仮説(狙い)。未記入は undefined。
  hypothesis?: ArticleHypothesis;
}

// 即時保存モデルでのカードごとの選択(承認/却下)。
export type Choice = "承認" | "却下";

/** 施策トリアージの状態。 */
export type ProposalStatus = "pending" | "rejected" | "adopted";

/**
 * 施策の種別＝承認後アウトカムのルーティング先。未設定は "article" 相当(欠落耐性・後方互換)。
 * Notion に persist せず、既存 category から kindFromCategory で決定的に派生する(#P5a)。
 */
export type ProposalKind = "article" | "site" | "event" | "other";

/**
 * proposalKind==="site" の詳細(将来/UI 用の optional)。
 * 本番データには通常存在せず、参考は既存 refs を流用するため新型は足さない。
 */
export interface SiteProposalDetail {
  /** 何を変えるか。 */
  whatChange: string;
  /** どこを(例: ヒーローセクション)。 */
  whereTarget?: string;
  /** なぜ。 */
  whyReason?: string;
}

/** proposalKind==="event" の詳細(将来/UI 用の optional。本番データには通常存在しない)。 */
export interface EventProposalDetail {
  /** いつ("7月中旬" 等の自由文・断定しない)。 */
  whenLabel: string;
  /** 対象。 */
  audience?: string;
  /** 形式。 */
  format?: string;
  /** 想定人数(自由文)。 */
  capacity?: string;
}
