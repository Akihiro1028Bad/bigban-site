import { WEDGE_LOOPS, type WedgeLoop } from "./wedgeLoops";

/** run.mjs のモード名から pull 型ループの Notion 状態定義を解決する。 */
export function requireLoopState(mode: string): WedgeLoop {
  const loop = WEDGE_LOOPS.find((candidate) => candidate.mode === mode);
  if (!loop) throw new Error(`未対応の pull 型ループです: ${mode}`);
  return loop;
}

/** AI 終了後の postcondition 確認用。「処理中」だけを問い合わせる。 */
export function processingStatusFilter(loop: WedgeLoop): unknown {
  return { property: loop.statusProp, select: { equals: "処理中" } };
}

/** 問い合わせ済みの処理中ページが残っていれば、対象IDを示して失敗させる。 */
export function assertNoProcessingPages(loop: WedgeLoop, pages: readonly { id: string }[]): void {
  if (pages.length === 0) return;
  throw new Error(`${loop.label}に「処理中」が残っています: ${pages.map((page) => page.id).join(", ")}`);
}
