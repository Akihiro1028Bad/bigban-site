/**
 * パイプライン盤(#107)の純ロジック。DOM 非依存。
 *
 * 記事ネタを段階(#106 の stage)ごとの列にグルーピングし、楽観的承認/却下を
 * 反映した「実効段階」で並べ替える。カードの表示分岐(段階→操作)もここで判定する。
 */

import type { ArticleStage, Stage } from "@/lib/growth/stage";

/** 盤ロジックが必要とする最小形状(approve.ts / ApproveClient どちらの item でも満たす)。 */
export interface BoardItem {
  id: string;
  stage: Stage;
}

export interface BoardColumn {
  stage: ArticleStage;
  label: string;
}

// 記事の列(左→右)。#167: 公開済み列を追加(クローズ・却下はアーカイブ扱いで列に出さない)。
export const ARTICLE_COLUMNS: readonly BoardColumn[] = [
  { stage: "proposed", label: "提案中" },
  { stage: "queued", label: "生成待ち" },
  { stage: "generating", label: "生成中" },
  { stage: "drafted", label: "下書き" },
  { stage: "published", label: "公開済み" },
];

// 5段階インジケータのラベル(提案→承認→生成→下書き→公開)。
export const STAGE_STEPS = ["提案", "承認", "生成", "下書き", "公開"] as const;

const STEP_INDEX: Record<string, number> = {
  proposed: 0,
  queued: 1,
  generating: 2,
  drafted: 3,
  published: 4,
};

/** 段階 → インジケータの現在地(0..4)。未知/却下/クローズは -1。 */
export function stageStepIndex(stage: Stage): number {
  return STEP_INDEX[stage] ?? -1;
}

/**
 * 楽観的決定を反映した実効段階。
 * 承認＝生成待ち列へ前進。却下は元の列に留め(取り消しできるよう decided カードで残す)。
 * 未決定は元の段階のまま。
 */
export function effectiveStage(item: BoardItem, decision?: string): ArticleStage {
  if (decision === "承認") return "queued";
  return item.stage as ArticleStage;
}

/** 既に承認済みで下流(自宅PC生成等)待ちの段階か。承認/却下ボタンを出さない。 */
export function isAwaitingDownstream(stage: Stage): boolean {
  return stage === "queued" || stage === "generating" || stage === "approved";
}

/** 承認/却下できる(=未決定・未生成・下流待ちでない)カードか。一括/キー操作/件数バッジ共通。 */
export function isActionable(
  item: { id: string; stage: Stage; isDraftReady?: boolean },
  decided: Record<string, string | undefined>,
): boolean {
  return !decided[item.id] && !item.isDraftReady && !isAwaitingDownstream(item.stage);
}

// 楽観的決定がまだ意味を持つ段階(この段階の間だけ decided を保持する)。
const PRE_DECISION_STAGES: ReadonlySet<string> = new Set(["proposed", "untouched"]);

/**
 * 楽観的決定(decided)をサーバ最新(items)に突き合わせて掃除する(#H10)。
 * - items に存在しない id(消失・却下で盤から除外)→ drop。
 * - サーバが既に前進した id(段階が proposed/untouched でない=承認等が反映済み)→ drop。
 * これで二重前進・操作不能ゴースト・件数バッジ不整合を防ぐ。
 */
export function reconcileDecided<T extends BoardItem, C extends string>(
  decided: Record<string, C | undefined>,
  items: readonly T[]
): Record<string, C> {
  const byId = new Map(items.map((it) => [it.id, it]));
  const next: Record<string, C> = {};
  for (const [id, choice] of Object.entries(decided)) {
    if (choice === undefined) continue;
    const item = byId.get(id);
    if (!item) continue;
    if (!PRE_DECISION_STAGES.has(item.stage)) continue;
    next[id] = choice;
  }
  return next;
}

/** スコア → 進捗バーの幅(%)。max<=0 は 0。 */
export function scoreBarPct(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((score / max) * 100));
}

/**
 * 記事ネタを列ごとにグルーピングする。decided(楽観的決定)を反映し、
 * 却下されたものはどの列にも入れない。
 */
export function groupArticlesByStage<T extends BoardItem>(
  ideas: T[],
  decided: Record<string, string | undefined>,
): { column: BoardColumn; items: T[] }[] {
  return ARTICLE_COLUMNS.map((column) => ({
    column,
    items: ideas.filter(
      (item) => effectiveStage(item, decided[item.id]) === column.stage,
    ),
  }));
}
