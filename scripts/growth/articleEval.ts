/**
 * 記事下書きの品質スコアリングと変更前後の比較(運用評価・中期3)。DOM/IO 非依存の純ロジック。
 *
 * 既存の機械チェック `draftQuality.ts`(#128)を**単一ソース**として再利用し、
 * 1記事を block/warn/ok で集計(`scoreArticle`)し、2記事(プロンプト変更前後など)を
 * 比較して improved / regressed / unchanged を判定する(`compareArticles`)。
 *
 * claude を起動せず、与えられた本文HTMLだけを決定的に評価する(A/B の客観指標)。
 */

import {
  draftQuality,
  type ArticleType,
  type QualityCheck,
} from "../../src/app/growth/approve/draftQuality";

export interface ArticleEvalInput {
  bodyHtml: string;
  title: string;
  articleType?: ArticleType;
  knownNewsPaths?: ReadonlySet<string>;
}

export interface ArticleScore {
  block: number;
  warn: number;
  ok: number;
  /** block が1件以上か。 */
  blocked: boolean;
  checks: QualityCheck[];
}

export type EvalVerdict = "improved" | "regressed" | "unchanged";

export interface ArticleComparison {
  before: ArticleScore;
  after: ArticleScore;
  /** after.block - before.block(負=改善)。 */
  blockDelta: number;
  /** after.warn - before.warn(負=改善)。 */
  warnDelta: number;
  verdict: EvalVerdict;
}

/** 1記事を draftQuality で採点し block/warn/ok を集計する。 */
export function scoreArticle(input: ArticleEvalInput): ArticleScore {
  const checks = draftQuality({
    bodyHtml: input.bodyHtml,
    body: "",
    title: input.title,
    articleType: input.articleType,
    knownNewsPaths: input.knownNewsPaths,
  });
  const block = checks.filter((c) => c.level === "block").length;
  const warn = checks.filter((c) => c.level === "warn").length;
  const ok = checks.filter((c) => c.level === "ok").length;
  return { block, warn, ok, blocked: block > 0, checks };
}

/**
 * 変更前後を比較する。判定は block を最優先、同数なら warn で比べる。
 * - block 減少、または block 同数で warn 減少 → improved
 * - block 増加、または block 同数で warn 増加 → regressed
 * - どちらも変わらない → unchanged
 */
export function compareArticles(
  before: ArticleEvalInput,
  after: ArticleEvalInput
): ArticleComparison {
  const b = scoreArticle(before);
  const a = scoreArticle(after);
  const blockDelta = a.block - b.block;
  const warnDelta = a.warn - b.warn;

  let verdict: EvalVerdict = "unchanged";
  if (blockDelta !== 0) {
    verdict = blockDelta < 0 ? "improved" : "regressed";
  } else if (warnDelta !== 0) {
    verdict = warnDelta < 0 ? "improved" : "regressed";
  }

  return { before: b, after: a, blockDelta, warnDelta, verdict };
}
