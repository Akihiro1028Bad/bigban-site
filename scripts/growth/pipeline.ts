/**
 * 投入工程の決定的パイプライン(#23)。
 *
 * 名前付きステージを**順次・直列**に実行し、失敗したらそこで止めて
 * 「どの工程で失敗したか」を返す。headless エージェントに一気通貫させると
 * 画像生成や create のリトライをバックグラウンドタスク化して完了待ちでストール
 * するため、投入工程はこのオーケストレータで同期実行する。
 */

import { createHash } from "node:crypto";

import { safeExternalError } from "./externalApiError";

import type { GrowthStageEvent } from "./operationOutcome";

export interface Stage {
  name: string;
  run: () => Promise<unknown>;
  restore?: (output: unknown) => void;
}

export interface PipelineCheckpoint {
  version: 1;
  specHash: string;
  completed: Array<{ stage: string; output: unknown }>;
}

export interface PipelineResult {
  /** 成功したステージ名(順) */
  completed: string[];
  /** 失敗したステージと理由。全成功なら null。 */
  failedAt: { name: string; error: string } | null;
  outputs: Record<string, unknown>;
  events: GrowthStageEvent[];
}

export interface RunStagesOptions {
  specHash?: string;
  checkpoint?: PipelineCheckpoint | null;
  onCheckpoint?: (checkpoint: PipelineCheckpoint) => void | Promise<void>;
  onEvent?: (event: GrowthStageEvent) => void;
  now?: () => string;
}

export function createSpecHash(spec: string | Uint8Array): string {
  return createHash("sha256").update(spec).digest("hex");
}

function validPrefix(stages: readonly Stage[], checkpoint: PipelineCheckpoint | null | undefined, specHash: string | undefined): PipelineCheckpoint["completed"] {
  if (!checkpoint || !specHash || checkpoint.version !== 1 || checkpoint.specHash !== specHash) return [];
  return checkpoint.completed.every((entry, index) => stages[index]?.name === entry.stage)
    ? checkpoint.completed
    : [];
}

/**
 * ステージを順次実行する。あるステージが throw したらそこで停止し、
 * 以降のステージは実行しない。各ステージの開始/完了/失敗を log に出す。
 */
export async function runStages(
  stages: readonly Stage[],
  log: (message: string) => void,
  options: RunStagesOptions = {},
): Promise<PipelineResult> {
  const completed: string[] = [];
  const outputs: Record<string, unknown> = {};
  const events: GrowthStageEvent[] = [];
  const now = options.now ?? (() => new Date().toISOString());
  const emit = (event: GrowthStageEvent): void => {
    events.push(event);
    options.onEvent?.(event);
  };
  const restored = validPrefix(stages, options.checkpoint, options.specHash);
  for (const stage of stages) {
    const saved = restored[completed.length];
    if (saved) {
      stage.restore?.(saved.output);
      outputs[stage.name] = saved.output;
      completed.push(stage.name);
      emit({ stage: stage.name, event: "skipped", at: now() });
      log(`↷ ${stage.name}`);
      continue;
    }
    log(`▶ ${stage.name}`);
    emit({ stage: stage.name, event: "started", at: now() });
    try {
      const output = await stage.run();
      outputs[stage.name] = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log(`✗ ${stage.name}: ${message}`);
      emit({ stage: stage.name, event: "failed", at: now(), error: safeExternalError(error) });
      return { completed, failedAt: { name: stage.name, error: message }, outputs, events };
    }
    completed.push(stage.name);
    emit({ stage: stage.name, event: "succeeded", at: now() });
    log(`✓ ${stage.name}`);
    if (options.specHash && options.onCheckpoint) {
      await options.onCheckpoint({
        version: 1,
        specHash: options.specHash,
        completed: completed.map((name) => ({ stage: name, output: outputs[name] })),
      });
    }
  }
  return { completed, failedAt: null, outputs, events };
}
