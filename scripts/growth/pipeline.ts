/**
 * 投入工程の決定的パイプライン(#23)。
 *
 * 名前付きステージを**順次・直列**に実行し、失敗したらそこで止めて
 * 「どの工程で失敗したか」を返す。headless エージェントに一気通貫させると
 * 画像生成や create のリトライをバックグラウンドタスク化して完了待ちでストール
 * するため、投入工程はこのオーケストレータで同期実行する。
 */

export interface Stage {
  name: string;
  run: () => Promise<void>;
}

export interface PipelineResult {
  /** 成功したステージ名(順) */
  completed: string[];
  /** 失敗したステージと理由。全成功なら null。 */
  failedAt: { name: string; error: string } | null;
}

/**
 * ステージを順次実行する。あるステージが throw したらそこで停止し、
 * 以降のステージは実行しない。各ステージの開始/完了/失敗を log に出す。
 */
export async function runStages(
  stages: readonly Stage[],
  log: (message: string) => void
): Promise<PipelineResult> {
  const completed: string[] = [];
  for (const stage of stages) {
    log(`▶ ${stage.name}`);
    try {
      await stage.run();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log(`✗ ${stage.name}: ${message}`);
      return { completed, failedAt: { name: stage.name, error: message } };
    }
    completed.push(stage.name);
    log(`✓ ${stage.name}`);
  }
  return { completed, failedAt: null };
}
