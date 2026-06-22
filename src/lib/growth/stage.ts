/**
 * パイプライン盤(#105/#106)の段階(ステージ)導出。純ロジック(DOM/IO 非依存)。
 *
 * Notion の「ステータス」と下書きIDの有無から、記事ネタ／施策それぞれの段階を一意に決める。
 * UI(列分け)は #107、厳密な「生成中」ステータス書込は #108 が担う(ここは導出のみ)。
 */

/** 記事ネタのパイプライン段階。 */
export type ArticleStage =
  | "proposed" // 提案中
  | "queued" // 承認(生成待ち=下書きID未取得)
  | "generating" // 生成中(#108 で Notion に書込)
  | "drafted" // 下書き作成済み
  | "rejected"; // 却下

/** 施策のパイプライン段階。 */
export type ProposalStage =
  | "untouched" // 未処理
  | "approved" // 承認
  | "rejected"; // 却下

export type Stage = ArticleStage | ProposalStage;

// 既知ステータス → 記事段階(「承認」は下書きID有無で分岐するため別扱い)。
const ARTICLE_STAGE_BY_STATUS: Record<string, ArticleStage> = {
  提案中: "proposed",
  生成中: "generating",
  下書き作成済み: "drafted",
  却下: "rejected",
};

/**
 * 記事ネタの段階を導出する。
 * 「承認」は下書きID未取得＝生成待ち(queued)、既に下書きがあれば下書き済み(drafted)。
 * 既知の他ステータスはマップ、未知ステータスは提案中(proposed)に倒して安全側に寄せる。
 */
export function deriveArticleStage(
  status: string,
  hasDraftId: boolean,
): ArticleStage {
  if (status === "承認") return hasDraftId ? "drafted" : "queued";
  return ARTICLE_STAGE_BY_STATUS[status] ?? "proposed";
}

// 既知ステータス → 施策段階。
const PROPOSAL_STAGE_BY_STATUS: Record<string, ProposalStage> = {
  未処理: "untouched",
  承認: "approved",
  却下: "rejected",
};

/** 施策の段階を導出する。未知ステータスは未処理(untouched)に倒す。 */
export function deriveProposalStage(status: string): ProposalStage {
  return PROPOSAL_STAGE_BY_STATUS[status] ?? "untouched";
}
