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
  // #87: 下書き作成済み(承認後に下書き生成完了)。下書きタブへ振り分け、承認/却下を出さない。
  isDraftReady?: boolean;
  // #106/#107: パイプライン段階。盤の列分け・段階インジケータに使う。
  stage: Stage;
  // #計測強化 S4: 記事の仮説(狙い)。未記入は undefined。
  hypothesis?: ArticleHypothesis;
}

// 即時保存モデルでのカードごとの選択(承認/却下)。
export type Choice = "承認" | "却下";

// 保存失敗時の状態(メッセージ＋再試行)。
export interface Failure {
  message: string;
  retry: () => void;
}
