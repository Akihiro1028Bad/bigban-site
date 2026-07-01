/**
 * 単一リスト Board(#proto P3a)の段階セクション・グルーピングの純ロジック。DOM 非依存。
 * deriveBoardStage(proto BoardStage) で分類し STAGE_ORDER 順に並べる。空セクションは除外。
 * 現行 board.ts の groupArticlesByStage(ArticleStage 列グリッド)とは別レイヤー。
 */

import { deriveBoardStage, STAGE_META, STAGE_ORDER, type BoardStage } from "./ui/boardStage";
import type { PendingItem } from "./types";

export interface BoardGroup {
  stage: BoardStage;
  label: string;
  items: PendingItem[];
}

/** items を BoardStage ごとに STAGE_ORDER 順のセクション配列へ分ける(空セクション除外・group 内は入力順保持)。 */
export function groupByBoardStage(items: readonly PendingItem[]): BoardGroup[] {
  const byStage = new Map<BoardStage, PendingItem[]>();
  for (const item of items) {
    const stage = deriveBoardStage(item);
    const bucket = byStage.get(stage);
    if (bucket) bucket.push(item);
    else byStage.set(stage, [item]);
  }
  return STAGE_ORDER.flatMap((stage) => {
    const bucket = byStage.get(stage);
    return bucket && bucket.length > 0
      ? [{ stage, label: STAGE_META[stage].label, items: bucket }]
      : [];
  });
}
